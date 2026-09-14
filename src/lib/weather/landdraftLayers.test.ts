import test from "node:test";
import assert from "node:assert/strict";
import { defaultWeatherWorkspace, normalizeWeatherWorkspace } from "./model.ts";
import { followsLatestScan, timelineForLayerActivation } from "./landdraftLayers.ts";
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

test("future forecast overlays cannot freeze live radar and rainfall refresh", () => {
  const state = defaultWeatherWorkspace();
  state.timeline.selectedTime = "2026-09-13T20:10:00Z";
  state.layerSettings["weather.forecast.precipitation"]!.visible = true;
  const previous = {
    radarFrames: [{ timestamp: "2026-09-13T20:10:00Z" }],
    rasterFrames: [
      {
        layerId: "weather.forecast.precipitation",
        timestamp: "2026-09-14T20:10:00Z",
        source: { temporalKind: "forecast" },
      },
    ],
  } as unknown as WeatherBundle;
  assert.equal(followsLatestScan(state, previous), true);
  state.timeline.selectedTime = "2026-09-13T20:00:00Z";
  assert.equal(followsLatestScan(state, previous), false);
});

test("activating native radar and rainfall starts at live time even after forecast/history use", () => {
  const timeline = {
    ...defaultWeatherWorkspace().timeline,
    mode: "forecast" as const,
    playing: true,
    selectedTime: "2026-09-12T10:00:00Z",
  };
  const now = Date.parse("2026-09-14T00:00:00Z");
  for (const id of [
    "weather.radar.pro.reflectivity",
    "weather.rainfall.1h",
    "weather.rainfall.72h",
  ]) {
    const actual = timelineForLayerActivation(id, timeline, now);
    assert.equal(actual.mode, "observed");
    assert.equal(actual.playing, false);
    assert.equal(actual.selectedTime, new Date(now).toISOString());
  }
  assert.equal(
    timelineForLayerActivation("weather.forecast.precipitation", timeline, now),
    timeline,
  );
});
