import assert from "node:assert/strict";
import test from "node:test";
import {
  celsiusToKelvin,
  fahrenheitToKelvin,
  freshnessFor,
  normalizeAlertSeverity,
} from "./normalize.ts";
import { hasWeatherCapability } from "./entitlements.ts";
import { weatherLayerRegistry } from "./registry.ts";
import { defaultWeatherWorkspace, normalizeWeatherWorkspace } from "./model.ts";
import { WEATHER_LAYER_ID_PATTERN } from "./types.ts";

test("normalizes temperatures", () => {
  assert.equal(celsiusToKelvin(0), 273.15);
  assert.ok(Math.abs(fahrenheitToKelvin(32) - 273.15) < 1e-9);
});

test("stale observations cannot be labeled live", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  assert.equal(freshnessFor("2026-09-11T11:58:00Z", now), "live");
  assert.equal(freshnessFor("2026-09-11T09:00:00Z", now), "stale");
  assert.equal(freshnessFor(undefined, now), "unavailable");
});

test("unknown alert severity remains unknown", () => {
  assert.equal(normalizeAlertSeverity("Catastrophic-ish"), "unknown");
});

test("weather capability hook is independent and non-restrictive by default", () => {
  assert.equal(hasWeatherCapability("weather.radar"), true);
  assert.equal(hasWeatherCapability("weather.radar", { moduleEnabled: false }), false);
  assert.equal(
    hasWeatherCapability("weather.radar", {
      organizationCapabilities: { "weather.radar": false },
    }),
    false,
  );
});

test("weather layer registry ids are unique and all layers declare providers", () => {
  const ids = weatherLayerRegistry.map((layer) => layer.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(
    weatherLayerRegistry.every((layer) => layer.providerProducts.length > 0),
    true,
  );
  assert.equal(
    weatherLayerRegistry.every((layer) => WEATHER_LAYER_ID_PATTERN.test(layer.id)),
    true,
    "every registered layer id must survive the server request validator",
  );
});

test("older weather workspaces receive a complete persistent layer order", () => {
  const previous = defaultWeatherWorkspace();
  delete (previous as Partial<typeof previous>).layerOrder;
  const normalized = normalizeWeatherWorkspace(previous);
  assert.deepEqual(
    normalized.layerOrder,
    weatherLayerRegistry.map((layer) => layer.id),
  );
});
