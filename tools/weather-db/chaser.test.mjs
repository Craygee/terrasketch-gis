import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon; create role authenticated; create schema auth; create schema extensions; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function extensions.gen_random_uuid() returns uuid language sql as $$select gen_random_uuid()$$; grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;`,
);
await db.exec(
  await readFile(
    new URL("../../supabase/migrations/202609120001_weather_chaser_presence.sql", import.meta.url),
    "utf8",
  ),
);
const id = "11111111-1111-4111-8111-111111111111";
await db.exec(
  `insert into auth.users values('${id}'); set role authenticated; select set_config('request.jwt.claim.sub','${id}',false); select public.upsert_weather_chaser_presence('Synthetic test',31,-98);`,
);
assert.equal(
  (await db.query("select * from public.list_active_weather_chasers(31,-98,800)")).rows.length,
  1,
);
await assert.rejects(db.query("select * from public.weather_chaser_presence"));
await db.exec("select public.stop_weather_chaser_presence();");
assert.equal(
  (await db.query("select * from public.list_active_weather_chasers(31,-98,800)")).rows.length,
  0,
);
await db.exec("reset role; set role anon;");
await assert.rejects(db.query("select * from public.list_active_weather_chasers(31,-98,800)"));
await db.close();
console.log(
  "PASS: chaser migration, authenticated sharing/list/stop, direct-table denial and anonymous denial; in-memory data only",
);
