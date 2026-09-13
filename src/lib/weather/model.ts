import { weatherLayerRegistry } from "./registry.ts";
import { isLanddraftLayer } from "./landdraftLayers.ts";
import type {
  WeatherLayerSetting,
  WeatherPreset,
  WeatherTimelineState,
  WeatherWorkspaceState,
} from "./types.ts";

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
        visible: [
          "weather.current",
          "weather.radar.pro.reflectivity",
          "weather.severe.alerts",
        ].includes(layer.id),
        menuVisible: true,
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
    nativeLayerCatalogVersion: 1,
    enabled: true,
    introductoryChooserSeen: false,
    unitSystem: "us",
    selectedCategory: "Current",
    inspectorEnabled: true,
    layerSettings: defaultWeatherLayerSettings(),
    layerOrder: weatherLayerRegistry.map((layer) => layer.id),
    timeline: defaultWeatherTimeline(),
    presets: [],
  };
}

export function normalizeWeatherWorkspace(
  stored: WeatherWorkspaceState | undefined,
  resetPlayback = true,
): WeatherWorkspaceState {
  const defaults = defaultWeatherWorkspace();
  if (!stored) return defaults;
  const layerSettings = { ...defaults.layerSettings };
  for (const layer of weatherLayerRegistry) {
    const saved = stored.layerSettings?.[layer.id];
    if (!saved) continue;
    layerSettings[layer.id] = {
      visible: isLanddraftLayer(layer.id) && Boolean(saved.visible),
      favorite: Boolean(saved.favorite),
      opacity: Math.max(0, Math.min(1, Number(saved.opacity) || 0)),
      menuVisible: saved.menuVisible !== false,
      ...(typeof saved.lastUsedAt === "string" && Number.isFinite(Date.parse(saved.lastUsedAt))
        ? { lastUsedAt: saved.lastUsedAt }
        : {}),
    };
  }
  if (
    !stored.nativeLayerCatalogVersion &&
    stored.layerSettings?.["weather.radar.simple"]?.visible
  ) {
    layerSettings["weather.radar.pro.reflectivity"]!.visible = true;
  }
  const savedOrder = Array.from(new Set(Array.isArray(stored.layerOrder) ? stored.layerOrder : []));
  const layerOrder = [
    ...savedOrder.filter((id) => typeof id === "string" && id in layerSettings),
    ...weatherLayerRegistry.map((layer) => layer.id).filter((id) => !savedOrder.includes(id)),
  ];
  return {
    ...defaults,
    ...stored,
    version: 1,
    nativeLayerCatalogVersion: 1,
    layerSettings,
    layerOrder,
    radarSiteId:
      typeof stored.radarSiteId === "string" && /^[A-Z0-9]{4}$/.test(stored.radarSiteId)
        ? stored.radarSiteId
        : undefined,
    radarTilt:
      Number.isInteger(stored.radarTilt) && stored.radarTilt! >= 0 && stored.radarTilt! <= 3
        ? stored.radarTilt
        : 0,
    timeline: {
      ...defaults.timeline,
      ...stored.timeline,
      playing: resetPlayback ? false : Boolean(stored.timeline?.playing),
    },
    presets: Array.isArray(stored.presets) ? stored.presets.slice(0, 25) : [],
  };
}

export function createWeatherPreset(name: string, state: WeatherWorkspaceState): WeatherPreset {
  return {
    id: `weather-preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Weather view",
    layerSettings: structuredClone(state.layerSettings),
    layerOrder: [...state.layerOrder],
    timelineMode: state.timeline.mode,
    createdAt: new Date().toISOString(),
  };
}
