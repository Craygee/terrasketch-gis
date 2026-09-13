import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// In-memory PostgreSQL only. No URLs, environment secrets, or real users are read.
const migration = await readFile(
  new URL(
    "../../supabase/migrations/202609130001_weather_provider_governance.sql",
    import.meta.url,
  ),
  "utf8",
);
const connections = await readFile(
  new URL("../../supabase/migrations/202609110001_user_weather_connections.sql", import.meta.url),
  "utf8",
);
const rollback = await readFile(
  new URL("../../docs/weather-provider-governance-rollback.sql", import.meta.url),
  "utf8",
);
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const tables = [
  "weather_provider_catalog",
  "weather_product_catalog",
  "weather_license_reviews",
  "weather_product_entitlements",
  "weather_provider_audit_events",
];

test("Weather governance on isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END
    $$;
    INSERT INTO auth.users VALUES ('${alice}'), ('${bob}');
  `);
  async function asRole(role, user, sql, parameters = []) {
    assert.ok(["anon", "authenticated", "service_role"].includes(role));
    await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user ?? ""]);
      const result = await db.query(sql, parameters);
      await db.exec("COMMIT");
      return result.rows;
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
  const denied = (promise, code = "42501") =>
    assert.rejects(promise, (error) => error.code === code);

  await t.test("existing connection and governance migrations apply and reapply", async () => {
    await db.exec(connections);
    await db.exec(migration);
    await db.exec(connections);
    await db.exec(migration);
    const { rows } = await db.query(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1)",
      [tables],
    );
    assert.equal(rows.length, 5);
    assert.ok(rows.every((row) => row.relrowsecurity));
  });
  await t.test("service can seed registry; products default disabled", async () => {
    await asRole(
      "service_role",
      null,
      "INSERT INTO weather_provider_catalog(provider_id,provider_name) VALUES ('fixture','Fixture only')",
    );
    await asRole(
      "service_role",
      null,
      "INSERT INTO weather_product_catalog(product_id,provider_id,provider_product,stale_after_seconds) VALUES ('fixture.radar','fixture','radar',300)",
    );
    const rows = await asRole("anon", null, "SELECT enabled FROM weather_product_catalog");
    assert.deepEqual(rows, [{ enabled: false }]);
    await asRole(
      "service_role",
      null,
      `INSERT INTO weather_product_entitlements(user_id,provider_id,product_id,connection_type,status,expires_at) VALUES ($1,'fixture','fixture.radar','USER_BYOK','verified',now()+interval '5 minutes'),($2,'fixture','fixture.radar','USER_BYOK','denied',now()+interval '5 minutes')`,
      [alice, bob],
    );
    await asRole(
      "service_role",
      null,
      `INSERT INTO weather_provider_audit_events(correlation_id,user_id,provider_id,action,outcome) VALUES (gen_random_uuid(),$1,'fixture','test','success'),(gen_random_uuid(),$2,'fixture','test','denied')`,
      [alice, bob],
    );
  });
  await t.test(
    "anonymous cannot access credentials, entitlements, audit or rights evidence",
    async () => {
      for (const table of [
        "weather_provider_connections",
        "weather_product_entitlements",
        "weather_provider_audit_events",
        "weather_license_reviews",
      ]) {
        await denied(asRole("anon", null, `SELECT * FROM ${table}`));
      }
    },
  );
  await t.test(
    "users see only their own entitlements and audit rows; missing identity sees none",
    async () => {
      for (const user of [alice, bob]) {
        for (const table of ["weather_product_entitlements", "weather_provider_audit_events"]) {
          const rows = await asRole("authenticated", user, `SELECT user_id FROM ${table}`);
          assert.deepEqual(rows, [{ user_id: user }]);
        }
      }
      assert.deepEqual(
        await asRole("authenticated", null, "SELECT * FROM weather_product_entitlements"),
        [],
      );
    },
  );
  await t.test(
    "users cannot approve rights, alter catalogs, self-grant or forge audit",
    async () => {
      await denied(asRole("authenticated", alice, "SELECT * FROM weather_license_reviews"));
      for (const table of tables) {
        await denied(asRole("authenticated", alice, `DELETE FROM ${table}`));
      }
      await denied(
        asRole("authenticated", alice, "UPDATE weather_product_entitlements SET status='verified'"),
      );
      await denied(
        asRole(
          "authenticated",
          alice,
          "INSERT INTO weather_provider_audit_events(correlation_id,provider_id,action,outcome) VALUES(gen_random_uuid(),'fixture','test','success')",
        ),
      );
    },
  );
  await t.test(
    "license scope, interval, cache and product constraints reject invalid records",
    async () => {
      const insert = `INSERT INTO weather_license_reviews(provider_id,product_id,licensing_status,connection_type,scope,user_id,evidence_reference,reviewed_by,reviewed_at,valid_until,maximum_cache_seconds) VALUES ('fixture',$1,'USER_BYOK','USER_BYOK',$2,$3,'synthetic fixture only','test harness',now(),now()+($4::integer * interval '1 minute'),$5)`;
      await denied(
        asRole("service_role", null, insert, ["fixture.radar", "user", null, 5, 0]),
        "23514",
      );
      await denied(
        asRole("service_role", null, insert, ["fixture.radar", "application", alice, 5, 0]),
        "23514",
      );
      await denied(
        asRole("service_role", null, insert, ["fixture.radar", "user", alice, -5, 0]),
        "23514",
      );
      await denied(
        asRole("service_role", null, insert, ["fixture.radar", "user", alice, 5, 86401]),
        "23514",
      );
      await denied(asRole("service_role", null, insert, ["missing", "user", alice, 5, 0]), "23503");
      await asRole("service_role", null, insert, ["fixture.radar", "user", alice, 5, 0]);
    },
  );
  await t.test(
    "existing credentials remain user-isolated for read, write and disconnect",
    async () => {
      const insert =
        "INSERT INTO weather_provider_connections(user_id,provider_id,encrypted_credentials) VALUES($1,'xweather',$2)";
      const ciphertext = "synthetic-not-a-real-credential-".repeat(3);
      await asRole("authenticated", alice, insert, [alice, ciphertext]);
      await denied(asRole("authenticated", alice, insert, [bob, ciphertext]));
      await asRole("authenticated", bob, insert, [bob, ciphertext]);
      assert.deepEqual(
        await asRole("authenticated", alice, "SELECT user_id FROM weather_provider_connections"),
        [{ user_id: alice }],
      );
      assert.deepEqual(
        await asRole(
          "authenticated",
          alice,
          "UPDATE weather_provider_connections SET status='invalid' WHERE user_id=$1 RETURNING user_id",
          [bob],
        ),
        [],
      );
      assert.deepEqual(
        await asRole(
          "authenticated",
          alice,
          "DELETE FROM weather_provider_connections WHERE user_id=$1 RETURNING user_id",
          [bob],
        ),
        [],
      );
      assert.deepEqual(
        await asRole(
          "authenticated",
          alice,
          "DELETE FROM weather_provider_connections WHERE user_id=$1 RETURNING user_id",
          [alice],
        ),
        [{ user_id: alice }],
      );
    },
  );
  await t.test(
    "governance rollback preserves existing connections; reinstall starts disabled",
    async () => {
      await db.exec(rollback);
      const { rows } = await db.query(
        "SELECT count(*)::integer AS count FROM pg_class WHERE relname = ANY($1)",
        [tables],
      );
      assert.equal(rows[0].count, 0);
      assert.deepEqual(
        await asRole("authenticated", bob, "SELECT user_id FROM weather_provider_connections"),
        [{ user_id: bob }],
      );
      await db.exec(migration);
      assert.deepEqual(await asRole("anon", null, "SELECT * FROM weather_provider_catalog"), []);
    },
  );
});
