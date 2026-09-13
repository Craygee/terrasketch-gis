import test from "node:test";
import assert from "node:assert/strict";
import { defaultWeatherWorkspace, normalizeWeatherWorkspace } from "./model.ts";
import { followsLatestScan } from "./landdraftLayers.ts";
import type { WeatherBundle } from "./types.ts";

test("restoration preserves public and native layer selections and controls", () => {
  const saved = defaultWeatherWorkspace();
  delete saved.nativeLayerCatalogVersion;
  for (const id of [
    "weather.radar.simple",
    "weather.satellite.infrared",
    "weather.radar.pro.velocity",
  ]) {
    saved.layerSettings[id] = { visible: true, opacity: 0.43, favorite: true, menuVisible: true };
  }
  saved.layerOrder.reverse();
  const restored = normalizeWeatherWorkspace(saved);
  for (const id of [
    "weather.radar.simple",
    "weather.satellite.infrared",
    "weather.radar.pro.velocity",
  ]) {
    assert.deepEqual(restored.layerSettings[id], saved.layerSettings[id]);
  }
  assert.deepEqual(restored.layerOrder, saved.layerOrder);
  assert.equal(restored.layerSettings["weather.radar.pro.reflectivity"]!.visible, false);
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
  state.layerSettings["weather.radar.pro.reflectivity"]!.visible = true;
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

test("public composite refresh respects a historical selection", () => {
  const state = defaultWeatherWorkspace();
  const previous = {
    radarFrames: [{ timestamp: "2026-09-13T20:10:00Z" }],
  } as unknown as WeatherBundle;
  state.timeline.selectedTime = "2026-09-13T20:00:00Z";
  assert.equal(followsLatestScan(state, previous), false);
  state.timeline.selectedTime = "2026-09-13T20:10:00Z";
  assert.equal(followsLatestScan(state, previous), true);
});
