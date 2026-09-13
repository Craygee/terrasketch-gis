import type { WeatherCapability } from "./types";

export type XweatherTemporalKind = "observed" | "forecast" | "estimated";

export interface XweatherCatalogLayer {
  id: string;
  name: string;
  group: string;
  description: string;
  providerLayer: string;
  product: string;
  coverage: string;
  resolution: string;
  updateMinutes: number;
  cacheSeconds: number;
  offsets: string[];
  costMultiplier: number;
  temporalKind: XweatherTemporalKind;
  capability: WeatherCapability;
  units?: string;
  minZoom?: number;
  maxZoom?: number;
  animationSupport?: boolean;
  inspectSupport?: boolean;
}

const currentOffsets = ["-3hours", "-2hours", "-1hour", "current"];
const radarOffsets = [
  "-14minutes",
  "-12minutes",
  "-10minutes",
  "-8minutes",
  "-6minutes",
  "-4minutes",
  "-2minutes",
  "current",
];
const satelliteOffsets = [
  "-50minutes",
  "-40minutes",
  "-30minutes",
  "-20minutes",
  "-10minutes",
  "current",
];
const forecastOffsets = ["current", "+1hour", "+3hours", "+6hours", "+12hours", "+24hours"];
const marineOffsets = ["current", "+6hours", "+12hours", "+24hours"];

function layer(
  input: Omit<
    XweatherCatalogLayer,
    "resolution" | "cacheSeconds" | "offsets" | "costMultiplier" | "temporalKind" | "capability"
  > &
    Partial<
      Pick<
        XweatherCatalogLayer,
        "resolution" | "cacheSeconds" | "offsets" | "costMultiplier" | "temporalKind" | "capability"
      >
    >,
): XweatherCatalogLayer {
  const temporalKind = input.temporalKind ?? "observed";
  return {
    ...input,
    resolution: input.resolution ?? "Provider raster grid",
    cacheSeconds: input.cacheSeconds ?? Math.max(60, Math.min(3600, input.updateMinutes * 30)),
    offsets:
      input.offsets ??
      (temporalKind === "forecast"
        ? forecastOffsets
        : input.updateMinutes <= 15
          ? satelliteOffsets
          : currentOffsets),
    costMultiplier: input.costMultiplier ?? 1,
    temporalKind,
    capability: input.capability ?? "weather.meteorology",
    minZoom: input.minZoom ?? 0,
    maxZoom: input.maxZoom ?? 18,
    animationSupport: input.animationSupport ?? true,
    inspectSupport: input.inspectSupport ?? false,
  };
}

/**
 * Weather-relevant Xweather Raster Maps products exposed through LandDraft.
 * Provider base maps, masks and administrative overlays are intentionally omitted because
 * LandDraft already supplies those as ordinary GIS layers.
 */
export const XWEATHER_ADDITIONAL_LAYERS: XweatherCatalogLayer[] = [
  layer({
    id: "weather.xweather.radar.global",
    name: "Xweather global radar (derived)",
    group: "Radar",
    description:
      "Global precipitation mosaic. Satellite-derived estimates may fill areas without actual radar coverage.",
    providerLayer: "radar-global",
    product: "global radar / satellite-derived precipitation mosaic",
    coverage: "Global; estimated where actual radar is unavailable",
    resolution: "Provider-dependent global mosaic",
    updateMinutes: 2,
    cacheSeconds: 60,
    offsets: radarOffsets,
    temporalKind: "estimated",
    capability: "weather.radar",
    units: "dBZ / provider estimate",
  }),
  layer({
    id: "weather.xweather.radar.regional",
    name: "Xweather regional radar",
    group: "Radar",
    description:
      "Actual radar mosaic in supported countries and regions; blank areas indicate no regional radar coverage.",
    providerLayer: "radar",
    product: "regional radar mosaic",
    coverage: "Selected regions in North America, Europe, Asia and Australia",
    updateMinutes: 6,
    cacheSeconds: 90,
    offsets: radarOffsets,
    capability: "weather.radar",
    units: "dBZ",
  }),

  ...(
    [
      ["temperature", "Temperature", "temperatures", "Surface temperature", "Global", "°F / °C"],
      [
        "dew-point",
        "Dew point",
        "dew-points",
        "Surface dew-point temperature",
        "Global",
        "°F / °C",
      ],
      ["feels-like", "Feels like", "feels-like", "Apparent temperature", "Global", "°F / °C"],
      ["humidity", "Relative humidity", "humidity", "Surface relative humidity", "Global", "%"],
      [
        "heat-index",
        "Heat index",
        "heat-index",
        "Heat index where applicable",
        "Global",
        "°F / °C",
      ],
      [
        "wind-chill",
        "Wind chill",
        "wind-chill",
        "Wind chill where applicable",
        "Global",
        "°F / °C",
      ],
      [
        "visibility",
        "Visibility",
        "visibility",
        "Observed visibility",
        "Continental United States",
        "mi / km",
      ],
      [
        "precipitation",
        "Observed precipitation",
        "precip",
        "One-hour accumulated precipitation",
        "United States and territories",
        "in / mm",
      ],
      [
        "snow-depth",
        "Estimated snow depth",
        "snow-depth",
        "Estimated snow depth",
        "Global",
        "in / cm",
      ],
    ] as const
  ).map(([suffix, name, providerLayer, product, coverage, units]) =>
    layer({
      id: `weather.xweather.current.${suffix}`,
      name,
      group: suffix === "snow-depth" ? "Winter" : "Current",
      description: `${product} from Xweather. Coverage and timestamp remain visible in Data Sources.`,
      providerLayer,
      product,
      coverage,
      updateMinutes: suffix === "snow-depth" ? 1440 : 60,
      offsets: suffix === "snow-depth" ? ["current"] : currentOffsets,
      capability: suffix === "snow-depth" ? "weather.severe" : "weather.basic",
      units,
    }),
  ),

  ...(
    [
      ["speed", "Wind speed", "wind-speeds", "Surface wind speed", "mph / kt / km/h"],
      ["gust", "Wind gusts", "wind-gusts", "Surface wind gusts", "mph / kt / km/h"],
      ["direction", "Wind direction", "wind-dir", "Surface wind direction arrows", "degrees"],
    ] as const
  ).map(([suffix, name, providerLayer, product, units]) =>
    layer({
      id: `weather.xweather.wind.${suffix}`,
      name,
      group: "Wind",
      description: `${product} from Xweather's global surface analysis.`,
      providerLayer,
      product,
      coverage: "Global",
      updateMinutes: 60,
      capability: "weather.basic",
      units,
    }),
  ),

  ...(
    [
      [
        "temperature",
        "Forecast temperature",
        "ftemperatures",
        "Forecast surface temperature",
        "Global",
        "°F / °C",
      ],
      [
        "high-temperature",
        "Forecast high temperature",
        "ftemperatures-max",
        "Forecast daily high temperature",
        "United States and territories",
        "°F / °C",
      ],
      [
        "low-temperature",
        "Forecast low temperature",
        "ftemperatures-min",
        "Forecast daily low temperature",
        "United States and territories",
        "°F / °C",
      ],
      [
        "dew-point",
        "Forecast dew point",
        "fdew-points",
        "Forecast dew-point temperature",
        "Global",
        "°F / °C",
      ],
      [
        "feels-like",
        "Forecast feels like",
        "ffeels-like",
        "Forecast apparent temperature",
        "Global",
        "°F / °C",
      ],
      [
        "heat-index",
        "Forecast heat index",
        "fheat-index",
        "Forecast heat index",
        "Global",
        "°F / °C",
      ],
      ["humidity", "Forecast humidity", "fhumidity", "Forecast relative humidity", "Global", "%"],
      [
        "visibility",
        "Forecast visibility",
        "fvisibility",
        "Forecast visibility",
        "Continental United States",
        "mi / km",
      ],
      [
        "wind-chill",
        "Forecast wind chill",
        "fwind-chill",
        "Forecast wind chill",
        "Global",
        "°F / °C",
      ],
      [
        "wind-speed",
        "Forecast wind speed",
        "fwind-speeds",
        "Forecast surface wind speed",
        "Global",
        "mph / kt / km/h",
      ],
      [
        "wind-gust",
        "Forecast wind gusts",
        "fwind-gusts",
        "Forecast surface wind gusts",
        "Global",
        "mph / kt / km/h",
      ],
      [
        "rain-hourly",
        "Forecast precipitation · hourly",
        "fqpf-1h",
        "Forecast one-hour precipitation",
        "Global",
        "in / mm",
      ],
      [
        "rain-total",
        "Forecast precipitation · total",
        "fqpf-accum",
        "Forecast accumulated precipitation",
        "Global",
        "in / mm",
      ],
      [
        "snow-hourly",
        "Forecast snow · hourly",
        "fqsf-1h",
        "Forecast one-hour snowfall",
        "Global",
        "in / cm",
      ],
      [
        "snow-total",
        "Forecast snow · total",
        "fqsf-accum",
        "Forecast accumulated snowfall",
        "Global",
        "in / cm",
      ],
      [
        "snow-depth",
        "Forecast snow depth",
        "fsnow-depth",
        "Forecast snow depth",
        "Global",
        "in / cm",
      ],
      [
        "ice",
        "Forecast ice accumulation",
        "fice-accum",
        "Forecast ice accumulation",
        "United States",
        "in / mm",
      ],
      [
        "radar",
        "Forecast radar",
        "fradar",
        "Model-derived forecast radar",
        "Global",
        "dBZ / model",
      ],
      [
        "satellite",
        "Forecast satellite",
        "fsatellite",
        "Model-derived forecast satellite",
        "Global",
        "model imagery",
      ],
      [
        "surface-analysis",
        "Forecast surface analysis",
        "fsurface-analysis",
        "Forecast fronts and pressure analysis",
        "North America",
        "analysis",
      ],
    ] as const
  ).map(([suffix, name, providerLayer, product, coverage, units]) =>
    layer({
      id: `weather.xweather.forecast.${suffix}`,
      name,
      group: ["snow-hourly", "snow-total", "snow-depth", "ice"].includes(suffix)
        ? "Winter"
        : "Forecast",
      description: `${product}; displayed as forecast/model data, never as an observation.`,
      providerLayer,
      product,
      coverage,
      updateMinutes: suffix === "surface-analysis" ? 720 : 60,
      offsets: forecastOffsets,
      temporalKind: "forecast",
      capability: "weather.forecasting",
      units,
    }),
  ),

  ...(
    [
      [
        "alerts",
        "Xweather global alerts",
        "alerts",
        "Official alerts from supported issuing agencies",
        "Supported regions worldwide",
        2,
      ],
      [
        "storm-cells",
        "Storm cells",
        "stormcells",
        "Radar-derived storm cells, tracks and cones",
        "United States",
        3,
      ],
      [
        "storm-reports",
        "Storm reports",
        "stormreports",
        "Previous 24 hours of reported storm impacts",
        "United States",
        15,
      ],
      [
        "convective",
        "Convective outlook",
        "convective",
        "Storm Prediction Center convective outlook",
        "Continental United States",
        60,
      ],
    ] as const
  ).map(([suffix, name, providerLayer, product, coverage, updateMinutes]) =>
    layer({
      id: `weather.xweather.severe.${suffix}`,
      name,
      group: "Severe weather",
      description: `${product}. Radar-derived objects remain distinct from confirmed reports.`,
      providerLayer,
      product,
      coverage,
      updateMinutes: Number(updateMinutes),
      offsets: ["current"],
      capability: "weather.severe",
      animationSupport: false,
    }),
  ),

  ...(
    [
      [
        "density",
        "Lightning strike density",
        "lightning-strike-density",
        "NOAA-derived 8 km strike-density heat map",
        "Central America, eastern Pacific and United States",
        1,
      ],
      [
        "flash-icons",
        "Lightning flashes · 5 min",
        "lightning-flash-5m-icons",
        "Aggregated cloud-to-ground and intracloud flash icons",
        "Global",
        1,
      ],
      [
        "all",
        "All lightning · 5 min",
        "lightning-all-5m",
        "Cloud-to-ground and intracloud lightning",
        "Global",
        10,
      ],
      [
        "strikes",
        "Cloud-to-ground strikes · 5 min",
        "lightning-strikes-5m-icons",
        "Cloud-to-ground strike icons",
        "Global",
        10,
      ],
    ] as const
  ).map(([suffix, name, providerLayer, product, coverage, costMultiplier]) =>
    layer({
      id: `weather.xweather.lightning.${suffix}`,
      name,
      group: "Lightning",
      description: `${product}. This provider product counts at ${costMultiplier}× map access.`,
      providerLayer,
      product,
      coverage,
      updateMinutes: suffix === "density" ? 15 : 5,
      offsets: ["current"],
      costMultiplier: Number(costMultiplier),
      capability: "weather.lightning",
    }),
  ),

  ...(
    [
      ["aqi", "Air Quality Index", "air-quality-index", "Air Quality Index", "index", 1],
      [
        "aqi-categories",
        "AQI health categories",
        "air-quality-index-categories",
        "AirNow-style AQI health categories",
        "category",
        1,
      ],
      [
        "health-index",
        "Air Quality Health Index",
        "air-quality-health-index-categories",
        "Xweather health-impact categories",
        "category",
        5,
      ],
      ["pm25", "PM2.5", "air-quality-pm2p5", "Fine particulate concentration", "µg/m³", 5],
      ["pm10", "PM10", "air-quality-pm10", "Particulate concentration", "µg/m³", 5],
      ["ozone", "Ozone", "air-quality-o3", "Ozone concentration", "µg/m³", 5],
      [
        "carbon-monoxide",
        "Carbon monoxide",
        "air-quality-co",
        "Carbon monoxide concentration",
        "µg/m³",
        5,
      ],
      [
        "nitrogen-dioxide",
        "Nitrogen dioxide",
        "air-quality-no2",
        "Nitrogen dioxide concentration",
        "µg/m³",
        5,
      ],
      [
        "sulfur-dioxide",
        "Sulfur dioxide",
        "air-quality-so2",
        "Sulfur dioxide concentration",
        "µg/m³",
        5,
      ],
    ] as const
  ).map(([suffix, name, providerLayer, product, units, costMultiplier]) =>
    layer({
      id: `weather.xweather.air.${suffix}`,
      name,
      group: "Fire & air quality",
      description: `${product}, globally modeled by Xweather. This product counts at ${costMultiplier}× map access.`,
      providerLayer,
      product,
      coverage: "Global",
      updateMinutes: 720,
      offsets: ["current"],
      costMultiplier: Number(costMultiplier),
      capability: "weather.infrastructure",
      units,
    }),
  ),

  ...(
    [
      [
        "wildfires",
        "Active wildfires",
        "fires-obs-icons",
        "Active wildfire positions",
        "United States and Canada",
      ],
      [
        "drought",
        "Drought Monitor",
        "drought-monitor",
        "Latest U.S. Drought Monitor severity",
        "United States",
      ],
      [
        "dry-lightning",
        "Dry-lightning outlook",
        "fires-dryltg-outlook",
        "Fire-weather dry-lightning outlook",
        "Continental United States",
      ],
    ] as const
  ).map(([suffix, name, providerLayer, product, coverage]) =>
    layer({
      id: `weather.xweather.fire.${suffix}`,
      name,
      group: "Fire & air quality",
      description: `${product}. Source timing and coverage are shown with the layer.`,
      providerLayer,
      product,
      coverage,
      updateMinutes: 1440,
      cacheSeconds: 3600,
      offsets: ["current"],
      capability: "weather.infrastructure",
      animationSupport: false,
    }),
  ),

  ...(
    [
      ["sst", "Sea-surface temperature", "maritime-sst", "Sea-surface temperature", "°F / °C"],
      [
        "currents",
        "Ocean currents",
        "maritime-currents",
        "Ocean-current speed and direction",
        "kt / m/s",
      ],
      ["wave-height", "Wave height", "maritime-wave-heights", "Primary wave height", "ft / m"],
      ["wave-period", "Wave period", "maritime-wave-periods", "Primary wave period", "s"],
      [
        "wind-wave-height",
        "Wind-wave height",
        "maritime-wind-wave-heights",
        "Primary wind-wave height",
        "ft / m",
      ],
      [
        "wind-wave-period",
        "Wind-wave period",
        "maritime-wind-wave-periods",
        "Primary wind-wave period",
        "s",
      ],
      [
        "swell-height",
        "Primary swell height",
        "maritime-swell-heights",
        "Primary swell height",
        "ft / m",
      ],
      [
        "swell-period",
        "Primary swell period",
        "maritime-swell-periods",
        "Primary swell period",
        "s",
      ],
      [
        "secondary-swell-height",
        "Secondary swell height",
        "maritime-swell-2-heights",
        "Secondary swell height",
        "ft / m",
      ],
      [
        "secondary-swell-period",
        "Secondary swell period",
        "maritime-swell-2-periods",
        "Secondary swell period",
        "s",
      ],
      [
        "tertiary-swell-height",
        "Tertiary swell height",
        "maritime-swell-3-heights",
        "Tertiary swell height",
        "ft / m",
      ],
      [
        "tertiary-swell-period",
        "Tertiary swell period",
        "maritime-swell-3-periods",
        "Tertiary swell period",
        "s",
      ],
      [
        "storm-surge",
        "Storm-surge height",
        "maritime-surges",
        "Coastal abnormal water rise (not inland surge)",
        "ft / m",
      ],
      ["tide", "Tide height", "maritime-tides", "Tide height", "ft / m"],
    ] as const
  ).map(([suffix, name, providerLayer, product, units]) =>
    layer({
      id: `weather.xweather.maritime.${suffix}`,
      name,
      group: "Maritime",
      description: `${product} from Xweather maritime guidance; not a navigation product.`,
      providerLayer,
      product,
      coverage: "Global maritime areas",
      updateMinutes: 360,
      offsets: marineOffsets,
      temporalKind: "forecast",
      capability: "weather.meteorology",
      units,
    }),
  ),

  ...(
    [
      [
        "active",
        "Active tropical cyclones",
        "tropical-cyclones",
        "Current and forecast cyclone tracks",
      ],
      [
        "invests",
        "Tropical invests",
        "tropical-cyclones-invests",
        "Active tropical disturbances under investigation",
      ],
      [
        "forecast-cones",
        "Tropical forecast cones",
        "tropical-cyclones-forecast-error-cones",
        "Official/provider forecast error cones",
      ],
      [
        "coastal-watches",
        "Tropical coastal watches",
        "tropical-cyclones-break-points",
        "Coastal cyclone watch/warning breakpoints",
      ],
    ] as const
  ).map(([suffix, name, providerLayer, product]) =>
    layer({
      id: `weather.xweather.tropical.${suffix}`,
      name,
      group: "Tropical",
      description: `${product}. Issuing-agency provenance must be reviewed before operational use.`,
      providerLayer,
      product,
      coverage: suffix === "coastal-watches" ? "Eastern Pacific and western Atlantic" : "Global",
      updateMinutes: 360,
      cacheSeconds: 900,
      offsets: ["current"],
      capability: "weather.severe",
      animationSupport: false,
    }),
  ),

  ...(
    [
      [
        "temperature-6-10",
        "Temperature outlook · 6–10 day",
        "temperatures-outlook-6-10d-cpc",
        "CPC 6–10 day temperature outlook",
        "+6days",
      ],
      [
        "temperature-8-14",
        "Temperature outlook · 8–14 day",
        "temperatures-outlook-8-14d-cpc",
        "CPC 8–14 day temperature outlook",
        "+8days",
      ],
      [
        "precipitation-6-10",
        "Precipitation outlook · 6–10 day",
        "precip-outlook-6-10d-cpc",
        "CPC 6–10 day precipitation outlook",
        "+6days",
      ],
      [
        "precipitation-8-14",
        "Precipitation outlook · 8–14 day",
        "precip-outlook-8-14d-cpc",
        "CPC 8–14 day precipitation outlook",
        "+8days",
      ],
    ] as const
  ).map(([suffix, name, providerLayer, product, offset]) =>
    layer({
      id: `weather.xweather.forecast.outlook.${suffix}`,
      name,
      group: "Forecast",
      description: `${product}, shown as a forecast outlook rather than current conditions.`,
      providerLayer,
      product,
      coverage: "United States",
      updateMinutes: 1440,
      cacheSeconds: 3600,
      offsets: [offset],
      temporalKind: "forecast",
      capability: "weather.forecasting",
      animationSupport: false,
    }),
  ),
];

export const XWEATHER_CATALOG_BY_LANDDRAFT_ID = new Map(
  XWEATHER_ADDITIONAL_LAYERS.map((item) => [item.id, item]),
);

export const XWEATHER_CATALOG_BY_PROVIDER_LAYER = new Map(
  XWEATHER_ADDITIONAL_LAYERS.map((item) => [item.providerLayer, item]),
);
