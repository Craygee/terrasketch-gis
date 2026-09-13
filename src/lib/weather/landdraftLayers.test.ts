import test from "node:test";
import assert from "node:assert/strict";
import { defaultWeatherWorkspace, normalizeWeatherWorkspace } from "./model.ts";
import { followsLatestScan, isLanddraftLayer } from "./landdraftLayers.ts";
import type { WeatherBundle } from "./types.ts";

test("native catalog migrates old composite selection and excludes external imagery", () => {
  const saved = defaultWeatherWorkspace();
  delete saved.nativeLayerCatalogVersion;
  saved.layerSettings["weather.radar.simple"]!.visible = true;
  saved.layerSettings["weather.satellite.infrared"]!.visible = true;
  const restored = normalizeWeatherWorkspace(saved);
  assert.equal(restored.layerSettings["weather.radar.simple"]!.visible, false);
  assert.equal(restored.layerSettings["weather.satellite.infrared"]!.visible, false);
  assert.equal(restored.layerSettings["weather.radar.pro.reflectivity"]!.visible, true);
  restored.layerSettings["weather.radar.pro.reflectivity"]!.visible = false;
  assert.equal(
    normalizeWeatherWorkspace(restored).layerSettings["weather.radar.pro.reflectivity"]!.visible,
    false,
  );
  assert.equal(isLanddraftLayer("weather.xweather.radar"), false);
});
test("runtime normalization preserves animation while stored restoration stops playback", () => {
  const state = defaultWeatherWorkspace();
  state.timeline.playing = true;
  assert.equal(normalizeWeatherWorkspace(state, false).timeline.playing, true);
  assert.equal(normalizeWeatherWorkspace(state).timeline.playing, false);
});
test("refresh follows latest radar without moving a historical selection or active playback", () => {
  const state = defaultWeatherWorkspace();
  state.timeline.selectedTime = "2026-09-13T20:10:00Z";
  const previous = {
    nativeRadarFrames: [
      { layerId: "weather.radar.pro.reflectivity", timestamp: "2026-09-13T20:10:00Z" },
    ],
    rasterFrames: [],
  } as unknown as WeatherBundle;
  assert.equal(followsLatestScan(state, previous), true);
  state.timeline.selectedTime = "2026-09-13T20:00:00Z";
  assert.equal(followsLatestScan(state, previous), false);
  state.timeline.playing = true;
  assert.equal(followsLatestScan(state, null), false);
});
