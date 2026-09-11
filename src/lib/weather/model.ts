import { weatherLayerRegistry } from "./registry";
import type {
  WeatherLayerSetting,
  WeatherPreset,
  WeatherTimelineState,
  WeatherWorkspaceState,
} from "./types";

const isoOffset = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

export function defaultWeatherLayerSettings(): Record<string, WeatherLayerSetting> {
  return Object.fromEntries(
    weatherLayerRegistry.map((layer) => [
      layer.id,
      {
        opacity: layer.defaultOpacity,
        favorite: [
          "weather.radar.simple",
          "weather.severe.alerts",
          "weather.wind.surface",
          "weather.lightning.recent",
        ].includes(layer.id),
        visible: ["weather.current", "weather.radar.simple", "weather.severe.alerts"].includes(
          layer.id,
        ),
      },
    ]),
  );
}

export function defaultWeatherTimeline(): WeatherTimelineState {
  return {
    mode: "observed",
    selectedTime: new Date().toISOString(),
    rangeStart: isoOffset(-120),
    rangeEnd: isoOffset(24 * 60),
    playing: false,
    loop: true,
    speed: 1,
  };
}

export function defaultWeatherWorkspace(): WeatherWorkspaceState {
  return {
    version: 1,
    enabled: true,
    introductoryChooserSeen: false,
    unitSystem: "us",
    selectedCategory: "Current",
    inspectorEnabled: true,
    layerSettings: defaultWeatherLayerSettings(),
    timeline: defaultWeatherTimeline(),
    presets: [],
  };
}

export function normalizeWeatherWorkspace(
  stored: WeatherWorkspaceState | undefined,
): WeatherWorkspaceState {
  const defaults = defaultWeatherWorkspace();
  if (!stored) return defaults;
  const layerSettings = { ...defaults.layerSettings };
  for (const layer of weatherLayerRegistry) {
    const saved = stored.layerSettings?.[layer.id];
    if (!saved) continue;
    layerSettings[layer.id] = {
      visible: Boolean(saved.visible),
      favorite: Boolean(saved.favorite),
      opacity: Math.max(0, Math.min(1, Number(saved.opacity) || 0)),
    };
  }
  return {
    ...defaults,
    ...stored,
    version: 1,
    layerSettings,
    timeline: { ...defaults.timeline, ...stored.timeline, playing: false },
    presets: Array.isArray(stored.presets) ? stored.presets.slice(0, 25) : [],
  };
}

export function createWeatherPreset(name: string, state: WeatherWorkspaceState): WeatherPreset {
  return {
    id: `weather-preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Weather view",
    layerSettings: structuredClone(state.layerSettings),
    timelineMode: state.timeline.mode,
    createdAt: new Date().toISOString(),
  };
}
