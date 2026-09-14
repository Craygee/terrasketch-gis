import { nativeProduct } from "./nativeRadar.ts";
import type { WeatherBundle, WeatherWorkspaceState, WeatherTimelineState } from "./types.ts";

export function followsLatestScan(
  workspace: WeatherWorkspaceState,
  previous: WeatherBundle | null,
) {
  if (workspace.timeline.mode !== "observed" || workspace.timeline.playing) return false;
  const times = [
    ...(previous?.nativeRadarFrames ?? []),
    ...(previous?.rasterFrames ?? []).filter((frame) => frame.source.temporalKind !== "forecast"),
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

/** Turning on a live local radar/rainfall product must not silently leave it before its first frame. */
export function timelineForLayerActivation(
  id: string,
  timeline: WeatherTimelineState,
  now = Date.now(),
) {
  return nativeProduct(id) || id.startsWith("weather.rainfall.")
    ? {
        ...timeline,
        mode: "observed" as const,
        selectedTime: new Date(now).toISOString(),
        playing: false,
      }
    : timeline;
}
