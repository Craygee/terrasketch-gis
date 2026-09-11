import type { WeatherLayerDefinition } from "./types";

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
  "Winter",
  "Fire & air quality",
  "Storm chaser",
  "Photography",
  "Historical",
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
  {
    id: "weather.radar.simple",
    name: "Radar",
    group: "Radar",
    description: "Quality-controlled composite base reflectivity where official coverage exists.",
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
    description: "Professional radar product; availability depends on radar site/provider.",
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
      "Live NOAA satellite cloud imagery, using GOES over its coverage and a global mosaic elsewhere.",
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
        ? "Cloud-top temperature is registered but still needs a validated sampling provider."
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
      "NOAA 15-minute lightning strike-density grid. This is regional activity density, not individual strike locations.",
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
    ["storm-objects", "Active storm objects", "Storm chaser", "weather.storm_chaser"],
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
