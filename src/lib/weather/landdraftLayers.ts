import { nativeProduct } from "./nativeRadar.ts";
import { rainfallLayers } from "./publicRainfall.ts";
import type { WeatherBundle, WeatherWorkspaceState } from "./types.ts";

/** Temporary focused catalog: LandDraft renderers and analysis, with public source data. */
export const landdraftOverlayIds = [
  ...rainfallLayers.map((layer) => layer.id),
  "weather.severe.alerts",
  "weather.severe.intelligence",
  "weather.severe.reports",
  "weather.storm_chaser.spotters",
  "weather.photo",
];
export function isLanddraftLayer(id: string) {
  return !!nativeProduct(id) || id === "weather.current" || landdraftOverlayIds.includes(id);
}

export function followsLatestScan(
  workspace: WeatherWorkspaceState,
  previous: WeatherBundle | null,
) {
  if (workspace.timeline.mode !== "observed" || workspace.timeline.playing) return false;
  const times = [...(previous?.nativeRadarFrames ?? []), ...(previous?.rasterFrames ?? [])]
    .filter((frame) => workspace.layerSettings[frame.layerId]?.visible)
    .map((frame) => Date.parse(frame.timestamp))
    .filter(Number.isFinite);
  return !times.length || Date.parse(workspace.timeline.selectedTime) >= Math.max(...times);
}
