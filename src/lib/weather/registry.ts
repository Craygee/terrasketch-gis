import type { WeatherLayerDefinition } from "./types";
import { NATIVE_RADAR_PRODUCTS, RADAR_SCALES, type NativeRadarLayer } from "./nativeRadar.ts";
import { rainfallLayers } from "./publicRainfall.ts";
import { SPC_PRODUCTS } from "./spcCatalog.ts";

export const WEATHER_LAYER_GROUPS = [
  "LandDraft tools",
  "Source data",
  "Current",
  "Radar",
  "Satellite & clouds",
  "Wind",
  "Lightning",
  "Severe weather",
  "SPC",
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
    reason: "Live locations shared voluntarily by signed-in LandDraft chasers.",
    core: false,
  },
  {
    id: "weather.severe.reports",
    label: "Recent storm reports",
    reason: "Observed NWS Local Storm Report locations from the past 24 hours.",
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

export const STORM_CHASER_PRO_RADAR_LAYERS = [
  "weather.radar.pro.reflectivity",
  "weather.radar.pro.velocity",
  "weather.radar.pro.storm-velocity",
  "weather.radar.pro.correlation",
  "weather.radar.pro.differential-reflectivity",
  "weather.radar.pro.hydrometeor",
] as const;

export const weatherLayerRegistry: WeatherLayerDefinition[] = [
  ...SPC_PRODUCTS.map((product): WeatherLayerDefinition => ({
    id: product.layerId,
    name: product.name,
    group: "SPC",
    description:
      "Official convective forecast. Probabilities describe the stated hazard within 25 miles of a point during the valid period, not a guarantee at a location. Latest issuance only; source colors and below-threshold statements are retained. Not a warning.",
    capability: "weather.severe",
    dataType: "geojson",
    providerProducts: [product.productId],
    defaultOpacity: 0.3,
    minZoom: 0,
    maxZoom: 24,
    animationSupport: false,
    timeSupport: true,
    inspectSupport: false,
    mobileVisibility: "primary",
    audience: "basic",
    attribution: "NOAA / NWS Storm Prediction Center",
    providerName: "NOAA Storm Prediction Center",
    coverage: "Contiguous United States",
  })),
  {
    id: "weather.current",
    name: "Current conditions",
    group: "Current",
    description:
      "Latest supported conditions at the inspected map location. Model or estimated fallback values are explicitly labeled and are not observations.",
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
  ...rainfallLayers,
  {
    id: "weather.radar.simple",
    name: "Radar",
    group: "Radar",
    description:
      "Public NOAA U.S. composite reflectivity. Source time and coverage are retained; outages are reported.",
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
    ["velocity", "Radial velocity", "m/s"],
    ["storm-velocity", "Storm-relative velocity", "kt"],
    ["correlation", "Correlation coefficient", "ratio"],
    ["differential-reflectivity", "Differential reflectivity", "dB"],
    ["specific-phase", "Specific differential phase", "°/km"],
    ["hydrometeor", "Hydrometeor classification", "class"],
  ].map(([id, name, units]): WeatherLayerDefinition => ({
    id: `weather.radar.pro.${id}`,
    name: name!,
    group: "Radar",
    description:
      id === "storm-velocity"
        ? "Storm-relative velocity requires verified storm-motion input; not enabled."
        : "LandDraft native rendering and gate inspection from public NOAA Level III scans. Select a site and elevation product; data gaps and range folding remain explicit.",
    ...(NATIVE_RADAR_PRODUCTS[`weather.radar.pro.${id}` as NativeRadarLayer]
      ? {
          legend: RADAR_SCALES[`weather.radar.pro.${id}` as NativeRadarLayer].map(
            ([value, color]) => ({ color, label: `${value} ${units}` }),
          ),
        }
      : {}),
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
    description: "Public NOAA GOES infrared cloud imagery with source time and coverage retained.",
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
      "Lightning layer awaiting a commercially reusable GOES GLM adapter. Third-party strike feeds are not included.",
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
    id: "weather.severe.probsevere",
    name: "NOAA ProbSevere · source polygons",
    group: "Severe weather",
    description:
      "Original NOAA/CIMSS ProbSevere polygons and published attributes. NOAA next-hour probability guidance; no LandDraft motion paths, corridors, or analysis. Not official warnings.",
    capability: "weather.severe",
    dataType: "geojson",
    providerProducts: ["probsevere-v3-source"],
    defaultOpacity: 0.25,
    minZoom: 0,
    maxZoom: 24,
    animationSupport: false,
    timeSupport: false,
    inspectSupport: true,
    mobileVisibility: "primary",
    audience: "basic",
    attribution: "NOAA / CIMSS ProbSevere v3 via NCEP MRMS",
    legend: [{ color: "#7c3aed", label: "NOAA source storm polygon" }],
  },
  {
    id: "weather.severe.intelligence",
    name: "LandDraft Predictive Model",
    group: "Severe weather",
    description:
      "LandDraft predictive storm tracking and projected motion corridors, powered by NOAA/CIMSS ProbSevere observations and guidance. NOAA hazard probabilities retain their source calibration. Projections are estimates, not official warnings.",
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
    name: "LandDraft chaser locations",
    group: "Storm chaser",
    description:
      "Ephemeral locations shared by signed-in LandDraft users through an explicit opt-in. Sharing is off by default and expires automatically.",
    capability: "weather.storm_chaser",
    dataType: "point",
    providerProducts: ["landdraft-opt-in-chaser-presence"],
    defaultOpacity: 0.92,
    minZoom: 3,
    maxZoom: 24,
    animationSupport: false,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "primary",
    audience: "basic",
    attribution: "LandDraft users sharing by explicit consent",
    legend: [
      { color: "#2563eb", label: "Active opt-in LandDraft chaser" },
      { color: "#93c5fd", label: "Clustered chasers" },
    ],
  },
  {
    id: "weather.severe.reports",
    name: "Recent NWS storm reports",
    group: "Severe weather",
    description:
      "Observed Local Storm Report locations from the past 24 hours. These are weather-event locations, not live reporter or chaser positions.",
    capability: "weather.severe",
    dataType: "point",
    providerProducts: ["iem-nws-local-storm-reports"],
    defaultOpacity: 0.95,
    minZoom: 2,
    maxZoom: 24,
    animationSupport: false,
    timeSupport: true,
    inspectSupport: true,
    mobileVisibility: "primary",
    audience: "basic",
    attribution: "NOAA/NWS Local Storm Reports via Iowa Environmental Mesonet",
    legend: [
      { color: "#7f1d1d", label: "Tornado / landspout / waterspout report" },
      { color: "#7e22ce", label: "Hail report" },
      { color: "#ea580c", label: "Wind report" },
      { color: "#2563eb", label: "Flood / heavy-rain report" },
      { color: "#64748b", label: "Other storm report" },
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
                    ? "LandDraft candidate viewing areas around the selected NOAA-tracked storm or an official alert polygon, with model weather checks. Not validated safe locations."
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

/** Additional navigation membership; tools retain their original category and state. */
export function isLandDraftTool(id: string) {
  return (
    Object.hasOwn(NATIVE_RADAR_PRODUCTS, id) ||
    rainfallLayers.some((layer) => layer.id === id) ||
    ["weather.severe.intelligence", "weather.photo", "weather.storm_chaser.spotters"].includes(id)
  );
}
export function weatherLayerInGroup(layer: WeatherLayerDefinition, group: string) {
  if (group === "Source data")
    return ![
      "weather.severe.intelligence",
      "weather.photo",
      "weather.storm_chaser.spotters",
    ].includes(layer.id);
  return group === "LandDraft tools" ? isLandDraftTool(layer.id) : layer.group === group;
}
export function weatherLayersInGroup(group: string) {
  return weatherLayerRegistry.filter((layer) => weatherLayerInGroup(layer, group));
}
