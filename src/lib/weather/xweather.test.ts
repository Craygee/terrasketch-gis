import assert from "node:assert/strict";
import test from "node:test";
import { xweatherCredentials, xweatherTileTemplate } from "./xweather.server.ts";
import { XWEATHER_ADDITIONAL_LAYERS } from "./xweatherCatalog.ts";

test("reads Xweather credentials only from server bindings", () => {
  assert.deepEqual(
    xweatherCredentials({ XWEATHER_CLIENT_ID: "client", XWEATHER_CLIENT_SECRET: "secret" }),
    { clientId: "client", clientSecret: "secret" },
  );
  assert.equal(xweatherCredentials({ XWEATHER_CLIENT_ID: "client" }), null);
});

test("browser tile templates remain same-origin and contain no provider credential", () => {
  const template = xweatherTileTemplate("radar-global", "current");
  assert.equal(template, "/api/weather/xweather/tiles/radar-global/{z}/{x}/{y}/current.png");
  assert.equal(template.includes("client"), false);
  assert.equal(template.includes("secret"), false);
});

test("forecast tile templates preserve provider-relative future offsets", () => {
  assert.equal(
    xweatherTileTemplate("ftemperatures", "+6hours"),
    "/api/weather/xweather/tiles/ftemperatures/{z}/{x}/{y}/+6hours.png",
  );
});

test("Xweather catalog has stable unique LandDraft ids and valid provider metadata", () => {
  assert.ok(XWEATHER_ADDITIONAL_LAYERS.length >= 60);
  assert.equal(
    new Set(XWEATHER_ADDITIONAL_LAYERS.map((layer) => layer.id)).size,
    XWEATHER_ADDITIONAL_LAYERS.length,
  );
  for (const layer of XWEATHER_ADDITIONAL_LAYERS) {
    assert.match(layer.id, /^weather\.xweather\./);
    assert.match(layer.providerLayer, /^[a-z0-9-]+$/);
    assert.ok(layer.coverage.length > 0);
    assert.ok(layer.offsets.length > 0);
    assert.ok([1, 5, 10].includes(layer.costMultiplier));
  }
});
