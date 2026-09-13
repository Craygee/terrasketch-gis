import type { WeatherBundle, WeatherWorkspaceState } from "./types.ts";

export function followsLatestScan(
  workspace: WeatherWorkspaceState,
  previous: WeatherBundle | null,
) {
  if (workspace.timeline.mode !== "observed" || workspace.timeline.playing) return false;
  const times = [
    ...(previous?.nativeRadarFrames ?? []),
    ...(previous?.rasterFrames ?? []),
    ...(previous?.radarFrames ?? []).map((frame) => ({
      ...frame,
      layerId: "weather.radar.simple",
    })),
  ]
    .filter((frame) => workspace.layerSettings[frame.layerId]?.visible)
    .map((frame) => Date.parse(frame.timestamp))
    .filter(Number.isFinite);
  return !times.length || Date.parse(workspace.timeline.selectedTime) >= Math.max(...times);
}
