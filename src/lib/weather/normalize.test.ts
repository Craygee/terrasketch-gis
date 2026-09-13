import assert from "node:assert/strict";
import test from "node:test";
import {
  celsiusToKelvin,
  fahrenheitToKelvin,
  freshnessFor,
  normalizeAlertSeverity,
} from "./normalize.ts";
import { hasWeatherCapability } from "./entitlements.ts";
import {
  STORM_CHASER_PRO_RADAR_LAYERS,
  STORM_CHASER_RADAR_COMPANIONS,
  STORM_CHASER_RECOMMENDED_LAYERS,
  weatherLayerRegistry,
} from "./registry.ts";
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

test("storm chaser recommendations keep ProbSevere first and reference registered layers", () => {
  assert.equal(STORM_CHASER_RECOMMENDED_LAYERS[0]?.id, "weather.severe.intelligence");
  const registeredIds = new Set(weatherLayerRegistry.map((layer) => layer.id));
  assert.equal(
    STORM_CHASER_RECOMMENDED_LAYERS.every((recommendation) => registeredIds.has(recommendation.id)),
    true,
  );
});

test("storm chaser professional radar tools reference registered layers and official HTTPS sites", () => {
  const registeredIds = new Set(weatherLayerRegistry.map((layer) => layer.id));
  assert.equal(
    STORM_CHASER_PRO_RADAR_LAYERS.every((id) => registeredIds.has(id)),
    true,
  );
  assert.equal(
    STORM_CHASER_RADAR_COMPANIONS.every((app) => new URL(app.href).protocol === "https:"),
    true,
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
  assert.equal(
    weatherLayerRegistry.every((layer) => normalized.layerSettings[layer.id]?.menuVisible === true),
    true,
  );
});

test("weather layer menu visibility persists independently from map visibility", () => {
  const previous = defaultWeatherWorkspace();
  const radar = previous.layerSettings["weather.radar.simple"]!;
  previous.layerSettings["weather.radar.simple"] = {
    ...radar,
    visible: true,
    menuVisible: false,
  };
  const normalized = normalizeWeatherWorkspace(previous);
  assert.equal(normalized.layerSettings["weather.radar.simple"]?.visible, true);
  assert.equal(normalized.layerSettings["weather.radar.simple"]?.menuVisible, false);
});
