import assert from "node:assert/strict";
import test from "node:test";

const expected = "https://unuxnecqjvmtztxxqudb.supabase.co";
assert.equal(
  process.env.VITE_SUPABASE_URL,
  expected,
  "Only the designated TEST project is permitted",
);
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(publicKey?.startsWith("sb_publishable_"), "A public publishable key is required");

test("hosted test PostgREST enforces anonymous Weather access", async (t) => {
  for (const table of [
    "weather_provider_catalog",
    "weather_product_catalog",
    "weather_provider_connections",
    "weather_license_reviews",
    "weather_product_entitlements",
    "weather_provider_audit_events",
  ]) {
    await t.test(table, async () => {
      const response = await fetch(`${expected}/rest/v1/${table}?select=*&limit=0`, {
        headers: { apikey: publicKey },
        signal: AbortSignal.timeout(20_000),
      });
      if (table.endsWith("catalog")) {
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), []);
      } else {
        assert.ok(
          [401, 403].includes(response.status),
          `Expected protected resource denial, received HTTP ${response.status}`,
        );
        await response.body?.cancel();
      }
    });
  }
});
