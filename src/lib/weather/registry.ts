import type { WeatherLayerDefinition } from "./types";
import { XWEATHER_ADDITIONAL_LAYERS } from "./xweatherCatalog.ts";

export const WEATHER_LAYER_GROUPS = [
  "Current",
  "Radar",
  "Satellite & clouds",
  "Wind",
  "Lightning",
  "Severe weather",
  "Forecast",
  "Meteorology",
  "Aviation",
  "Tropical",
  "Maritime",
  "Winter",
  "Fire & air quality",
  "Storm chaser",
  "Photography",
  "Historical",
] as const;

export const STORM_CHASER_RECOMMENDED_LAYERS = [
  {
    id: "weather.severe.intelligence",
    label: "NOAA ProbSevere",
    reason: "Core tracked-storm analysis, hazard guidance, trends, and projected motion.",
    core: true,
  },
  {
    id: "weather.radar.simple",
    label: "Radar",
    reason: "Precipitation structure and movement around the selected storm.",
    core: false,
  },
  {
    id: "weather.severe.alerts",
    label: "Official alerts",
    reason: "Authoritative warning and watch polygons; these supersede LandDraft guidance.",
    core: false,
  },
  {
    id: "weather.lightning.recent",
    label: "Lightning activity",
    reason: "Recent lightning density and trends where a validated feed covers the map.",
    core: false,
  },
  {
    id: "weather.storm_chaser.spotters",
    label: "Storm chaser map",
    reason: "Recent privacy-minimized trained spotter locations where separately authorized.",
    core: false,
  },
  {
    id: "weather.wind.surface",
    label: "Surface wind",
    reason: "Current wind direction, speed, and gust context near the storm.",
    core: false,
  },
  {
    id: "weather.satellite.clouds",
    label: "Clouds & satellite",
    reason: "Cloud cover and satellite context for storm structure and visibility.",
    core: false,
  },
] as const;

export const weatherLayerRegistry: WeatherLayerDefinition[] = [
  {
    id: "weather.current",
    name: "Current conditions",
    group: "Current",
    description: "Latest supported observation at the inspected map location.",
    capability: "weather.basic",
    dataType: "point",
    providerProducts: ["observation", "point-forecast"],
    defaultOpacity: 1,
    minZoom: 0,
    maxZoom: 24,
    animationSupport: false,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "primary",
    audience: "basic",
  },
  ...XWEATHER_ADDITIONAL_LAYERS.map((item): WeatherLayerDefinition => ({
    id: item.id,
    name: item.name,
    group: item.group,
    description: item.description,
    capability: item.capability,
    dataType: "raster",
    providerProducts: [`xweather:${item.providerLayer}`],
    ...(item.units ? { units: item.units } : {}),
    defaultOpacity: 0.68,
    minZoom: item.minZoom ?? 0,
    maxZoom: item.maxZoom ?? 18,
    animationSupport: item.animationSupport ?? true,
    timeSupport: true,
    inspectSupport: item.inspectSupport ?? false,
    mobileVisibility: "professional",
    audience: "professional",
    attribution: "Weather data and imagery © Vaisala Xweather",
    providerName: "Vaisala Xweather Raster Maps",
    providerCostMultiplier: item.costMultiplier,
    coverage: item.coverage,
  })),
  {
    id: "weather.radar.simple",
    name: "Radar",
    group: "Radar",
    description:
      "Official U.S. composite reflectivity with configured global Xweather fallback outside coverage or during an outage.",
    capability: "weather.radar",
    dataType: "raster",
    providerProducts: ["radar-reflectivity"],
    units: "dBZ",
    defaultOpacity: 0.72,
    minZoom: 2,
    maxZoom: 18,
    animationSupport: true,
    timeSupport: true,
    inspectSupport: false,
    mobileVisibility: "primary",
    audience: "basic",
    attribution: "NOAA/NWS MRMS",
    legend: [
      { color: "#60c5ba", label: "light" },
      { color: "#2f8f3a", label: "moderate" },
      { color: "#f5d328", label: "heavy" },
      { color: "#e7522f", label: "very heavy" },
      { color: "#a835a8", label: "intense" },
    ],
  },
  ...[
    ["reflectivity", "Base reflectivity", "dBZ"],
    ["velocity", "Base velocity", "kt"],
    ["storm-velocity", "Storm-relative velocity", "kt"],
    ["correlation", "Correlation coefficient", "%"],
    ["differential-reflectivity", "Differential reflectivity", "dB"],
    ["hydrometeor", "Hydrometeor classification", "class"],
  ].map(([id, name, units]): WeatherLayerDefinition => ({
    id: `weather.radar.pro.${id}`,
    name: name!,
    group: "Radar",
    description:
      id === "reflectivity"
        ? "Official NOAA single-site super-resolution base reflectivity from the nearest available NEXRAD site."
        : id === "velocity"
          ? "Official NOAA single-site base radial velocity from the nearest available NEXRAD site."
          : id === "hydrometeor"
            ? "Official NOAA single-site digital hydrometeor classification from the nearest available NEXRAD site."
            : "Professional radar product; availability depends on a reviewed radar-site provider.",
    capability: "weather.meteorology",
    dataType: "raster",
    providerProducts: [`radar-${id}`],
    units: units!,
    defaultOpacity: 0.78,
    minZoom: 3,
    maxZoom: 20,
    animationSupport: true,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "professional",
    audience: "professional",
  })),
  {
    id: "weather.satellite.clouds",
    name: "Clouds",
    group: "Satellite & clouds",
    description:
      "Configured global Xweather color-infrared cloud imagery with NOAA satellite fallback when commercial access is unavailable.",
    capability: "weather.satellite",
    dataType: "raster",
    providerProducts: ["satellite-clouds"],
    defaultOpacity: 0.62,
    minZoom: 0,
    maxZoom: 16,
    animationSupport: true,
    timeSupport: true,
    inspectSupport: false,
    mobileVisibility: "primary",
    audience: "basic",
  },
  ...[
    ["true-color", "Visible satellite"],
    ["infrared", "Infrared"],
    ["water-vapor", "Water vapor"],
    ["cloud-top", "Cloud-top temperature"],
    ["smoke", "Smoke / fire imagery"],
  ].map(([id, name]): WeatherLayerDefinition => ({
    id: `weather.satellite.${id}`,
    name: name!,
    group: "Satellite & clouds",
    description:
      id === "cloud-top"
        ? "NASA MODIS daily cloud-top-temperature imagery; orbital gaps are expected and values are not yet point-sampled."
        : id === "smoke"
          ? "Official NOAA near-surface smoke guidance; model guidance is not a direct observation."
          : `Live NOAA ${name!.toLowerCase()} imagery with product time and source retained.`,
    capability: "weather.satellite",
    dataType: "raster",
    providerProducts: [`satellite-${id}`],
    defaultOpacity: 0.7,
    minZoom: 0,
    maxZoom: 16,
    animationSupport: true,
    timeSupport: true,
    inspectSupport: id === "cloud-top",
    mobileVisibility: "drawer",
    audience: id === "true-color" ? "basic" : "professional",
  })),
  {
    id: "weather.wind.surface",
    name: "Surface wind",
    group: "Wind",
    description:
      "Official NOAA shaded forecast wind speed in U.S. coverage; point wind remains inspectable globally.",
    capability: "weather.basic",
    dataType: "raster",
    providerProducts: ["wind-field-surface"],
    units: "m/s",
    defaultOpacity: 0.8,
    minZoom: 0,
    maxZoom: 16,
    animationSupport: true,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "primary",
    audience: "basic",
  },
  {
    id: "weather.lightning.recent",
    name: "Lightning activity",
    group: "Lightning",
    description:
      "Configured Xweather global flash imagery with NOAA 15-minute regional strike-density fallback.",
    capability: "weather.lightning",
    dataType: "raster",
    providerProducts: ["lightning-density"],
    defaultOpacity: 0.95,
    minZoom: 1,
    maxZoom: 22,
    animationSupport: true,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "primary",
    audience: "basic",
  },
  {
    id: "weather.severe.alerts",
    name: "Official alerts",
    group: "Severe weather",
    description: "Official warning/watch/advisory polygons where supplied by the issuing agency.",
    capability: "weather.severe",
    dataType: "geojson",
    providerProducts: ["alerts"],
    defaultOpacity: 0.28,
    minZoom: 0,
    maxZoom: 24,
    animationSupport: false,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "primary",
    audience: "basic",
    attribution: "National Weather Service",
    legend: [
      { color: "#9f1239", label: "extreme" },
      { color: "#dc2626", label: "severe" },
      { color: "#f59e0b", label: "moderate" },
      { color: "#2563eb", label: "minor / advisory" },
    ],
  },
  {
    id: "weather.severe.intelligence",
    name: "NOAA ProbSevere storm objects",
    group: "Severe weather",
    description:
      "NOAA/CIMSS tracked-storm next-hour hail, wind, and tornado probabilistic guidance. Not an official warning.",
    capability: "weather.severe_intelligence",
    dataType: "geojson",
    providerProducts: ["probsevere-v3"],
    defaultOpacity: 0.72,
    minZoom: 0,
    maxZoom: 24,
    animationSupport: false,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "primary",
    audience: "basic",
    attribution: "NOAA / CIMSS ProbSevere v3",
    legend: [
      { color: "#7f1d1d", label: "Tracked storm object" },
      { color: "#f97316", label: "Likely motion corridor" },
      { color: "#fdba74", label: "Possible motion corridor" },
    ],
  },
  {
    id: "weather.storm_chaser.spotters",
    name: "Community spotter locations",
    group: "Storm chaser",
    description:
      "Recent, privacy-minimized trained spotter positions from an approved community feed. Names and contact details are not retained.",
    capability: "weather.storm_chaser",
    dataType: "point",
    providerProducts: ["spotter-network-positions"],
    defaultOpacity: 0.92,
    minZoom: 3,
    maxZoom: 24,
    animationSupport: false,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "primary",
    audience: "basic",
    attribution: "Spotter Network (when separately authorized)",
    legend: [
      { color: "#2563eb", label: "Recent community spotter" },
      { color: "#93c5fd", label: "Clustered spotters" },
    ],
  },
  {
    id: "weather.forecast.precipitation",
    name: "Forecast precipitation",
    group: "Forecast",
    description: "Provider-labeled forecast precipitation, never presented as radar.",
    capability: "weather.forecasting",
    dataType: "raster",
    providerProducts: ["forecast-precipitation"],
    units: "mm",
    defaultOpacity: 0.55,
    minZoom: 0,
    maxZoom: 16,
    animationSupport: true,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "drawer",
    audience: "basic",
  },
  ...[
    ["surface", "Surface analysis", "Meteorology", "weather.meteorology"],
    ["upper-air", "Upper-air fields", "Meteorology", "weather.meteorology"],
    ["convection", "Convective parameters", "Meteorology", "weather.meteorology"],
    ["metar", "METAR stations", "Aviation", "weather.meteorology"],
    ["tropical", "Tropical cyclones", "Tropical", "weather.severe"],
    ["winter", "Winter hazards", "Winter", "weather.severe"],
    ["fire", "Fire weather", "Fire & air quality", "weather.infrastructure"],
    ["air-quality", "Air quality / smoke", "Fire & air quality", "weather.infrastructure"],
    ["photo", "Photography potential", "Photography", "weather.photography"],
    ["historical", "Historical events", "Historical", "weather.historical"],
  ].map(([id, name, group, capability]): WeatherLayerDefinition => ({
    id: `weather.${id}`,
    name: name!,
    group: group!,
    description:
      id === "surface"
        ? "Live surface temperature, wind, forecast precipitation and observations are available through their connected layers."
        : id === "metar"
          ? "Live global airport and reporting-station observations from the NOAA Aviation Weather Center."
          : id === "tropical"
            ? "Official National Hurricane Center tropical summaries, tracks, cones and wind extents where active."
            : id === "winter"
              ? "Official U.S. Winter Storm Severity Index impact guidance."
              : id === "fire"
                ? "Official U.S. Storm Prediction Center fire-weather outlook."
                : id === "air-quality"
                  ? "Official NOAA near-surface smoke guidance; broader AQI feeds remain a future integration."
                  : id === "photo"
                    ? "Conservative lower-exposure candidate zones derived from official alert polygons and model conditions."
                    : "Registered for a later validated provider or analysis increment.",
    capability: capability as WeatherLayerDefinition["capability"],
    dataType:
      id === "metar" || id === "storm-objects" || id === "photo"
        ? "point"
        : ["surface", "tropical", "winter", "fire", "air-quality"].includes(id!)
          ? "raster"
          : "grid",
    providerProducts: [id!],
    defaultOpacity: 0.65,
    minZoom: 0,
    maxZoom: 24,
    animationSupport: true,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "professional",
    audience: "professional",
  })),
];

export function weatherLayer(id: string) {
  return weatherLayerRegistry.find((layer) => layer.id === id);
}

export function weatherLayersInGroup(group: string) {
  return weatherLayerRegistry.filter((layer) => layer.group === group);
}
