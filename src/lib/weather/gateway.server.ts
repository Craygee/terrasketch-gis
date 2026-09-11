import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import {
  cardinalDirectionDegrees,
  celsiusToKelvin,
  fahrenheitToKelvin,
  normalizeAlertSeverity,
  normalizeAlertStatus,
  sourceMetadata,
  validIso,
} from "./normalize";
import type {
  RadarFrame,
  WeatherAlert,
  WeatherBundle,
  WeatherForecastPeriod,
  WeatherObservation,
  WeatherPointRequest,
  WeatherProviderHealth,
  WeatherRasterFrame,
  WeatherStationObservation,
} from "./types";
import { recordWeatherUsage } from "./telemetry.server";
import { loadMetNorwayPoint } from "./metNorway.server";
import { buildPhotographyAssessment } from "./photography.server";
import { nearestWeatherRadarSite, type WeatherRadarSite } from "./radar";

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();
const inFlightCache = new Map<string, Promise<unknown>>();

const nwsHeaders = {
  Accept: "application/geo+json, application/json",
  "User-Agent": "LandDraftWeather/0.1 (https://landdraft.net)",
};

const wmsHeaders = {
  Accept: "application/xml, text/xml;q=0.9, */*;q=0.1",
  "User-Agent": "LandDraftWeather/0.1 (https://landdraft.net)",
};

const env = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

async function withCache<T>(
  key: string,
  ttlMs: number,
  metric: { providerId: string; product: string },
  loader: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) {
    recordWeatherUsage({ ...metric, success: true, cacheHit: true });
    return existing.value;
  }

  const pending = inFlightCache.get(key) as Promise<T> | undefined;
  if (pending) {
    recordWeatherUsage({ ...metric, success: true, cacheHit: true });
    return pending;
  }

  const loading = loader();
  inFlightCache.set(key, loading);
  try {
    const value = await loading;
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    recordWeatherUsage({ ...metric, success: true, cacheHit: false });
    return value;
  } catch (error) {
    recordWeatherUsage({ ...metric, success: false, cacheHit: false });
    throw error;
  } finally {
    if (inFlightCache.get(key) === loading) inFlightCache.delete(key);
  }
}

async function fetchJson<T>(url: string, signal: AbortSignal, headers: HeadersInit = {}) {
  const response = await fetch(url, { signal, headers });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function fetchText(url: string, signal: AbortSignal, headers: HeadersInit = {}) {
  const response = await fetch(url, { signal, headers });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return response.text();
}

type WmsRasterSpec = {
  layerId: string;
  providerId: string;
  providerName: string;
  product: string;
  capabilitiesUrl: string;
  layerNames: string[];
  styles?: string | undefined;
  coverage: string;
  resolution?: string | undefined;
  temporalKind: "observed" | "forecast" | "model";
  attribution: string;
  maxFrames?: number | undefined;
  coverageKind?: "conus" | "global" | undefined;
  /**
   * Use only for a reviewed public WMS whose tile endpoint is browser-accessible
   * but whose GetCapabilities request can reject Cloudflare's edge network.
   */
  allowLatestWithoutCapabilities?: boolean | undefined;
};

const NOAA_SATELLITE_CAPABILITIES =
  "https://nowcoast.noaa.gov/geoserver/observations/satellite/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities";
const NOAA_LIGHTNING_CAPABILITIES =
  "https://nowcoast.noaa.gov/geoserver/observations/lightning_detection/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities";

const WMS_LAYER_SPECS: Record<string, WmsRasterSpec> = {
  "weather.satellite.cloud-top": {
    layerId: "weather.satellite.cloud-top",
    providerId: "nasa-gibs-modis",
    providerName: "NASA Earthdata GIBS",
    product: "MODIS daily cloud-top temperature",
    capabilitiesUrl:
      "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities",
    layerNames: [
      "MODIS_Terra_Cloud_Top_Temp_Day",
      "MODIS_Terra_Cloud_Top_Temp_Night",
      "MODIS_Aqua_Cloud_Top_Temp_Day",
      "MODIS_Aqua_Cloud_Top_Temp_Night",
    ],
    coverage: "Global orbital coverage; gaps can occur between satellite passes",
    resolution: "5 km cloud-property retrieval; daily orbital coverage",
    temporalKind: "observed",
    attribution: "NASA EOSDIS GIBS / MODIS Atmosphere",
    maxFrames: 5,
    coverageKind: "global",
  },
  "weather.forecast.precipitation": {
    layerId: "weather.forecast.precipitation",
    providerId: "nws-ndfd-qpf",
    providerName: "National Weather Service NDFD",
    product: "forecast precipitation amount",
    capabilitiesUrl:
      "https://mapservices.weather.noaa.gov/geoserver/ndfd/qpf/ows?service=wms&version=1.3.0&request=GetCapabilities",
    layerNames: ["qpf"],
    coverage: "United States and territories",
    temporalKind: "forecast",
    attribution: "NOAA / National Weather Service NDFD",
    maxFrames: 16,
  },
  "weather.wind.surface": {
    layerId: "weather.wind.surface",
    providerId: "nws-ndfd-wind",
    providerName: "National Weather Service NDFD",
    product: "forecast 10 m wind speed",
    capabilitiesUrl:
      "https://mapservices.weather.noaa.gov/geoserver/ndfd/wspd/ows?service=wms&version=1.3.0&request=GetCapabilities",
    layerNames: ["wspd"],
    coverage: "United States and territories",
    temporalKind: "forecast",
    attribution: "NOAA / National Weather Service NDFD",
    maxFrames: 16,
  },
  "weather.surface": {
    layerId: "weather.surface",
    providerId: "nws-ndfd-temperature",
    providerName: "National Weather Service NDFD",
    product: "forecast surface temperature",
    capabilitiesUrl:
      "https://mapservices.weather.noaa.gov/geoserver/ndfd/temp/ows?service=wms&version=1.3.0&request=GetCapabilities",
    layerNames: ["temp"],
    coverage: "United States and territories",
    temporalKind: "forecast",
    attribution: "NOAA / National Weather Service NDFD",
    maxFrames: 16,
  },
  "weather.fire": {
    layerId: "weather.fire",
    providerId: "nws-spc-fire",
    providerName: "NOAA Storm Prediction Center",
    product: "Day 1 fire weather outlook",
    capabilitiesUrl:
      "https://mapservices.weather.noaa.gov/vector/services/fire_weather/SPC_firewx/MapServer/WMSServer?request=GetCapabilities&service=WMS",
    layerNames: ["23"],
    coverage: "CONUS",
    temporalKind: "forecast",
    attribution: "NOAA / Storm Prediction Center",
  },
  "weather.air-quality": {
    layerId: "weather.air-quality",
    providerId: "nws-air-quality-smoke",
    providerName: "NOAA/NWS Air Quality Guidance",
    product: "surface smoke guidance",
    capabilitiesUrl:
      "https://mapservices.weather.noaa.gov/raster/services/air_quality/ndgd_smoke_sfc_1hr_avg_time/ImageServer/WMSServer?request=GetCapabilities&service=WMS",
    layerNames: ["ndgd_smoke_sfc_1hr_avg_time"],
    coverage: "CONUS guidance domain",
    temporalKind: "model",
    attribution: "NOAA / National Weather Service Air Quality Guidance",
  },
  "weather.winter": {
    layerId: "weather.winter",
    providerId: "nws-wpc-wssi",
    providerName: "NOAA Weather Prediction Center",
    product: "Winter Storm Severity Index days 1–3",
    capabilitiesUrl:
      "https://mapservices.weather.noaa.gov/vector/services/outlooks/wpc_wssi/MapServer/WMSServer?request=GetCapabilities&service=WMS",
    layerNames: ["21"],
    coverage: "CONUS",
    temporalKind: "forecast",
    attribution: "NOAA / Weather Prediction Center",
  },
  "weather.tropical": {
    layerId: "weather.tropical",
    providerId: "nws-nhc-tropical",
    providerName: "National Hurricane Center",
    product: "official tropical cyclone summary",
    capabilitiesUrl:
      "https://mapservices.weather.noaa.gov/tropical/services/tropical/NHC_tropical_weather_summary/MapServer/WMSServer?request=GetCapabilities&service=WMS",
    layerNames: [
      "17",
      "18",
      "20",
      "21",
      "22",
      "23",
      "25",
      "26",
      "27",
      "28",
      "31",
      "32",
      "33",
      "34",
    ],
    coverage: "Atlantic and eastern/central Pacific products issued by NHC",
    temporalKind: "forecast",
    attribution: "NOAA / National Hurricane Center",
  },
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wmsTimes(xml: string, layerName: string) {
  const nameMatch = new RegExp(`<Name>\\s*${escapeRegex(layerName)}\\s*</Name>`, "i").exec(xml);
  const scoped = nameMatch
    ? xml.slice(nameMatch.index, xml.indexOf("</Layer>", nameMatch.index))
    : xml;
  const dimension = /<Dimension[^>]*name=["']time["'][^>]*>([\s\S]*?)<\/Dimension>/i.exec(scoped);
  if (!dimension) return [];
  const raw = dimension[1]?.trim() ?? "";
  if (raw.includes("/")) {
    // Some NASA layers advertise multiple disjoint availability intervals.
    // Selecting the end of the first interval can make current imagery appear
    // decades stale, so retain the newest valid interval end instead.
    const ends = raw
      .split(",")
      .map((interval) => validIso(interval.trim().split("/")[1]))
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
    return ends.slice(-1);
  }
  return raw
    .split(",")
    .map((value) => validIso(value.trim()))
    .filter((value): value is string => Boolean(value));
}

async function loadWmsRasterFrames(spec: WmsRasterSpec, signal: AbortSignal) {
  return withCache(
    `wms:${spec.layerId}:${spec.layerNames.join(",")}`,
    spec.temporalKind === "observed" ? 60_000 : 5 * 60_000,
    { providerId: spec.providerId, product: spec.product },
    async (): Promise<WeatherRasterFrame[]> => {
      // Several visible products can share the same NOAA WMS service. Coalesce
      // the capabilities request so enabling Clouds + Visible does not perform
      // identical network work at the edge.
      let capabilities: string | null = null;
      let latestOnly = false;
      try {
        capabilities = await withCache(
          `wms-capabilities:${spec.capabilitiesUrl}`,
          spec.temporalKind === "observed" ? 60_000 : 5 * 60_000,
          { providerId: spec.providerId, product: `${spec.product} capabilities` },
          () => fetchText(spec.capabilitiesUrl, signal, wmsHeaders),
        );
      } catch (error) {
        if (!spec.allowLatestWithoutCapabilities) throw error;
        latestOnly = true;
      }
      const advertised = capabilities
        ? spec.layerNames.filter((name) =>
            new RegExp(`<Name>\\s*${escapeRegex(name)}\\s*</Name>`, "i").test(capabilities),
          )
        : spec.layerNames;
      if (!advertised.length) throw new Error("Expected WMS layer is no longer advertised");
      const firstLayer = advertised[0]!;
      const times = capabilities ? wmsTimes(capabilities, firstLayer) : [];
      const frameTimes = (times.length ? times : [new Date().toISOString()]).slice(
        -(spec.maxFrames ?? 1),
      );
      const endpoint = spec.capabilitiesUrl.split("?")[0]!;
      const base =
        `${endpoint}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1` +
        `&LAYERS=${encodeURIComponent(advertised.join(","))}` +
        `&STYLES=${encodeURIComponent(spec.styles ?? "")}` +
        "&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}";
      return frameTimes.map((timestamp) => ({
        id: `${spec.providerId}-${spec.layerId}-${timestamp}`,
        layerId: spec.layerId,
        timestamp,
        tileUrlTemplate: times.length ? `${base}&TIME=${encodeURIComponent(timestamp)}` : base,
        coverage: spec.coverage,
        legendUrl: `${endpoint}?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&layer=${encodeURIComponent(firstLayer)}`,
        source: sourceMetadata({
          providerId: spec.providerId,
          providerName: spec.providerName,
          product: spec.product,
          temporalKind: spec.temporalKind,
          sourceTimestamp: times.length ? timestamp : undefined,
          validTime: times.length ? timestamp : undefined,
          resolution: spec.resolution,
          quality: times.length ? "high" : "moderate",
          qualityFlags: latestOnly
            ? ["EDGE_CAPABILITIES_BLOCKED", "LATEST_FRAME_TIME_UNVERIFIED"]
            : times.length
              ? []
              : ["PROVIDER_TIME_NOT_ADVERTISED"],
          rawSourceReference: spec.capabilitiesUrl,
          attribution: spec.attribution,
        }),
      }));
    },
  );
}

function measurementValue(input: unknown): number | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = Number((input as Record<string, unknown>)["value"]);
  return Number.isFinite(value) ? value : undefined;
}

function boundedText(input: unknown, length = 4_000) {
  return String(input ?? "")
    .trim()
    .slice(0, length);
}

function nwsSource(input: {
  product: string;
  sourceTimestamp?: string | undefined;
  validTime?: string | undefined;
  expirationTime?: string | undefined;
  rawSourceReference?: string | undefined;
  temporalKind?: "observed" | "forecast" | undefined;
}) {
  return sourceMetadata({
    providerId: "nws",
    providerName: "National Weather Service",
    product: input.product,
    temporalKind: input.temporalKind ?? "observed",
    sourceTimestamp: input.sourceTimestamp,
    validTime: input.validTime,
    expirationTime: input.expirationTime,
    rawSourceReference: input.rawSourceReference,
    attribution: "NOAA / National Weather Service",
  });
}

type NwsPointResponse = {
  properties?: {
    forecast?: string;
    observationStations?: string;
    relativeLocation?: { properties?: { city?: string; state?: string } };
  };
};

type NwsStationsResponse = { features?: Array<{ id?: string }> };
type NwsObservationResponse = {
  id?: string;
  geometry?: Feature<Point>["geometry"];
  properties?: Record<string, unknown>;
};
type NwsForecastResponse = {
  properties?: { generatedAt?: string; periods?: Record<string, unknown>[] };
};
type NwsAlertsResponse = {
  features?: Array<{
    id?: string;
    geometry?: Polygon | MultiPolygon | null;
    properties?: Record<string, unknown>;
  }>;
};

function normalizeNwsObservation(
  payload: NwsObservationResponse,
  request: WeatherPointRequest,
  placeName: string | undefined,
): WeatherObservation | null {
  const properties = payload.properties ?? {};
  const timestamp = validIso(properties["timestamp"]);
  const coordinate =
    payload.geometry?.type === "Point" && payload.geometry.coordinates.length >= 2
      ? ([Number(payload.geometry.coordinates[0]), Number(payload.geometry.coordinates[1])] as [
          number,
          number,
        ])
      : ([request.longitude, request.latitude] as [number, number]);
  return {
    id: payload.id ?? `nws-observation-${timestamp ?? Date.now()}`,
    location: {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: coordinate },
    },
    stationId: payload.id?.split("/").at(-1),
    placeName,
    summary: boundedText(properties["textDescription"], 240) || undefined,
    temperatureK:
      measurementValue(properties["temperature"]) !== undefined
        ? celsiusToKelvin(measurementValue(properties["temperature"])!)
        : undefined,
    dewpointK:
      measurementValue(properties["dewpoint"]) !== undefined
        ? celsiusToKelvin(measurementValue(properties["dewpoint"])!)
        : undefined,
    relativeHumidityPct: measurementValue(properties["relativeHumidity"]),
    windSpeedMS: measurementValue(properties["windSpeed"]),
    windGustMS: measurementValue(properties["windGust"]),
    windDirectionDeg: measurementValue(properties["windDirection"]),
    pressurePa:
      measurementValue(properties["barometricPressure"]) ??
      measurementValue(properties["seaLevelPressure"]),
    visibilityM: measurementValue(properties["visibility"]),
    precipitationMm: measurementValue(properties["precipitationLastHour"]),
    source: nwsSource({
      product: "surface observation",
      sourceTimestamp: timestamp,
      rawSourceReference: payload.id,
    }),
  };
}

function windSpeedFromText(value: unknown): number | undefined {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)/);
  if (!match)
    return String(value ?? "")
      .toLowerCase()
      .includes("calm")
      ? 0
      : undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  return String(value).toLowerCase().includes("km/h") ? amount / 3.6 : amount / 2.2369362921;
}

function normalizeNwsForecast(
  payload: NwsForecastResponse,
  sourceUrl: string,
): WeatherForecastPeriod[] {
  const generatedAt = validIso(payload.properties?.generatedAt);
  return (payload.properties?.periods ?? []).slice(0, 14).flatMap((period, index) => {
    const startTime = validIso(period["startTime"]);
    const endTime = validIso(period["endTime"]);
    const temperature = Number(period["temperature"]);
    if (!startTime || !endTime) return [];
    const probability = measurementValue(period["probabilityOfPrecipitation"]);
    return [
      {
        id: `nws-period-${String(period["number"] ?? index)}`,
        name: boundedText(period["name"], 80) || "Forecast",
        startTime,
        endTime,
        ...(Number.isFinite(temperature)
          ? {
              temperatureK:
                String(period["temperatureUnit"]).toUpperCase() === "C"
                  ? celsiusToKelvin(temperature)
                  : fahrenheitToKelvin(temperature),
            }
          : {}),
        ...(probability !== undefined ? { precipitationProbabilityPct: probability } : {}),
        ...(windSpeedFromText(period["windSpeed"]) !== undefined
          ? { windSpeedMS: windSpeedFromText(period["windSpeed"]) }
          : {}),
        ...(cardinalDirectionDegrees(period["windDirection"]) !== undefined
          ? { windDirectionDeg: cardinalDirectionDegrees(period["windDirection"]) }
          : {}),
        summary: boundedText(period["shortForecast"], 300),
        detailedSummary: boundedText(period["detailedForecast"], 1_500) || undefined,
        isDaytime: Boolean(period["isDaytime"]),
        source: nwsSource({
          product: "point forecast",
          temporalKind: "forecast",
          sourceTimestamp: generatedAt,
          validTime: startTime,
          expirationTime: endTime,
          rawSourceReference: sourceUrl,
        }),
      },
    ];
  });
}

function normalizeNwsAlerts(payload: NwsAlertsResponse): WeatherAlert[] {
  return (payload.features ?? []).slice(0, 100).map((feature, index) => {
    const properties = feature.properties ?? {};
    const sent = validIso(properties["sent"]);
    const effective = validIso(properties["effective"]) ?? sent;
    const expires = validIso(properties["expires"]);
    const geometry =
      feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon"
        ? ({ type: "Feature", properties: {}, geometry: feature.geometry } as Feature<
            Polygon | MultiPolygon
          >)
        : null;
    return {
      id: feature.id ?? `nws-alert-${index}-${sent ?? Date.now()}`,
      event: boundedText(properties["event"], 160) || "Weather alert",
      headline: boundedText(properties["headline"], 400) || "Official weather alert",
      description: boundedText(properties["description"]),
      instruction: boundedText(properties["instruction"], 2_000) || undefined,
      areaDescription: boundedText(properties["areaDesc"], 600) || undefined,
      severity: normalizeAlertSeverity(properties["severity"]),
      certainty: boundedText(properties["certainty"], 80) || undefined,
      urgency: boundedText(properties["urgency"], 80) || undefined,
      status: normalizeAlertStatus(properties["status"]),
      senderName: boundedText(properties["senderName"], 180) || undefined,
      geometry,
      source: nwsSource({
        product: "CAP alert",
        sourceTimestamp: sent,
        validTime: effective,
        expirationTime: expires,
        rawSourceReference: feature.id,
      }),
    };
  });
}

async function loadNwsPoint(
  request: WeatherPointRequest,
  signal: AbortSignal,
): Promise<{
  covered: boolean;
  current: WeatherObservation | null;
  forecast: WeatherForecastPeriod[];
  placeName?: string;
}> {
  const coordinate = `${roundCoordinate(request.latitude)},${roundCoordinate(request.longitude)}`;
  return withCache(
    `nws-point:${coordinate}`,
    5 * 60_000,
    { providerId: "nws", product: "point-weather" },
    async () => {
      const pointUrl = `https://api.weather.gov/points/${coordinate}`;
      let point: NwsPointResponse;
      try {
        point = await fetchJson<NwsPointResponse>(pointUrl, signal, nwsHeaders);
      } catch (error) {
        if (error instanceof Error && error.message.includes("HTTP 404"))
          return { covered: false, current: null, forecast: [] };
        throw error;
      }
      const place = point.properties?.relativeLocation?.properties;
      const placeName = [place?.city, place?.state].filter(Boolean).join(", ") || undefined;
      const forecastUrl = point.properties?.forecast;
      const stationsUrl = point.properties?.observationStations;
      const [forecastResult, stationsResult] = await Promise.allSettled([
        forecastUrl
          ? fetchJson<NwsForecastResponse>(forecastUrl, signal, nwsHeaders)
          : Promise.resolve(null),
        stationsUrl
          ? fetchJson<NwsStationsResponse>(stationsUrl, signal, nwsHeaders)
          : Promise.resolve(null),
      ]);
      const forecastPayload = forecastResult.status === "fulfilled" ? forecastResult.value : null;
      const stations = stationsResult.status === "fulfilled" ? stationsResult.value : null;
      const stationUrl = stations?.features?.find((station) => station.id)?.id;
      let current: WeatherObservation | null = null;
      if (stationUrl) {
        try {
          const observation = await fetchJson<NwsObservationResponse>(
            `${stationUrl}/observations/latest`,
            signal,
            nwsHeaders,
          );
          current = normalizeNwsObservation(observation, request, placeName);
        } catch {
          // A point forecast still remains useful; health reports degraded if current is unavailable.
        }
      }
      return {
        covered: true,
        current,
        forecast:
          forecastPayload && forecastUrl ? normalizeNwsForecast(forecastPayload, forecastUrl) : [],
        ...(placeName ? { placeName } : {}),
      };
    },
  );
}

async function loadNwsAlerts(request: WeatherPointRequest, signal: AbortSignal) {
  const coordinate = `${roundCoordinate(request.latitude)},${roundCoordinate(request.longitude)}`;
  return withCache(
    `nws-alerts:${coordinate}`,
    30_000,
    { providerId: "nws", product: "active-alerts" },
    async () => {
      const url = `https://api.weather.gov/alerts/active?point=${coordinate}`;
      const payload = await fetchJson<NwsAlertsResponse>(url, signal, nwsHeaders);
      return normalizeNwsAlerts(payload);
    },
  );
}

async function loadRadarFrames(signal: AbortSignal): Promise<RadarFrame[]> {
  return withCache(
    "noaa-radar:conus",
    60_000,
    { providerId: "noaa-nws-mrms", product: "radar-reflectivity-frames" },
    async () => {
      const capabilitiesUrl =
        "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?request=GetCapabilities&service=wms&version=1.3.0";
      const response = await fetch(capabilitiesUrl, { signal });
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
      const xml = await response.text();
      const dimension = xml.match(
        /<Dimension[^>]*name="time"[^>]*default="([^"]+)"[^>]*>([\s\S]*?)<\/Dimension>/i,
      );
      const defaultTime = validIso(dimension?.[1]);
      const times = (dimension?.[2] ?? "")
        .split(",")
        .map((value) => validIso(value.trim()))
        .filter((value): value is string => Boolean(value))
        .slice(-15);
      const uniqueTimes = Array.from(new Set(defaultTime ? [...times, defaultTime] : times));
      const base =
        "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=conus_bref_qcd&STYLES=radar_reflectivity&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}";
      return uniqueTimes.map((timestamp) => ({
        id: `noaa-mrms-${timestamp}`,
        timestamp,
        tileUrlTemplate: `${base}&TIME=${encodeURIComponent(timestamp)}`,
        legendUrl:
          "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&width=500&height=30&layer=conus_bref_qcd",
        coverage: "conus",
        source: sourceMetadata({
          providerId: "noaa-nws-mrms",
          providerName: "NOAA/NWS MRMS",
          product: "quality-controlled composite base reflectivity",
          temporalKind: "observed",
          sourceTimestamp: timestamp,
          validTime: timestamp,
          resolution: "1 km composite grid",
          rawSourceReference: capabilitiesUrl,
          attribution: "NOAA / National Weather Service MRMS",
        }),
      }));
    },
  );
}

async function loadRadarFallback(signal: AbortSignal): Promise<RadarFrame[]> {
  const frames = await loadWmsRasterFrames(
    {
      layerId: "weather.radar.simple",
      providerId: "nws-radar-fallback",
      providerName: "National Weather Service radar service",
      product: "base reflectivity fallback",
      capabilitiesUrl:
        "https://mapservices.weather.noaa.gov/eventdriven/services/radar/radar_base_reflectivity_time/ImageServer/WMSServer?request=GetCapabilities&service=WMS",
      layerNames: ["radar_base_reflectivity_time"],
      coverage: "United States, Alaska, Hawaii, Caribbean, and Guam",
      temporalKind: "observed",
      attribution: "NOAA / National Weather Service",
    },
    signal,
  );
  return frames.map((frame) => ({
    id: frame.id,
    timestamp: frame.timestamp,
    tileUrlTemplate: frame.tileUrlTemplate,
    legendUrl: frame.legendUrl,
    coverage: "conus",
    source: frame.source,
  }));
}

function withinGoesCoverage(request: WeatherPointRequest) {
  return (
    request.longitude >= -179.5 &&
    request.longitude <= -50.7 &&
    request.latitude >= 11 &&
    request.latitude <= 50.5
  );
}

function satelliteSpec(
  request: WeatherPointRequest,
  layerId: string,
  regionalLayer: string,
  globalLayer: string,
  product: string,
  regionalStyle: string,
): WmsRasterSpec {
  const regional = withinGoesCoverage(request);
  return {
    layerId,
    providerId: regional ? "noaa-nowcoast-goes" : "noaa-nowcoast-global-satellite",
    providerName: regional ? "NOAA nowCOAST GOES East/West" : "NOAA nowCOAST global mosaic",
    product,
    capabilitiesUrl: NOAA_SATELLITE_CAPABILITIES,
    layerNames: [regional ? regionalLayer : globalLayer],
    styles: regional ? regionalStyle : "reflectance",
    coverage: regional ? "GOES East/West coverage" : "Global geostationary mosaic",
    resolution: regional ? "0.5–2 km; product dependent" : "approximately 3 km",
    temporalKind: "observed",
    attribution: "NOAA / NESDIS nowCOAST",
    maxFrames: regional ? 18 : 5,
    allowLatestWithoutCapabilities: true,
  };
}

function rasterSpecsFor(request: WeatherPointRequest) {
  const requested = new Set(request.requestedLayerIds ?? []);
  const specs: WmsRasterSpec[] = [];
  for (const layerId of requested) {
    const registered = WMS_LAYER_SPECS[layerId];
    if (registered && (registered.coverageKind === "global" || withinConus(request)))
      specs.push(registered);
  }
  if (requested.has("weather.satellite.clouds"))
    specs.push(
      satelliteSpec(
        request,
        "weather.satellite.clouds",
        "goes_longwave_imagery",
        "global_longwave_imagery_mosaic",
        "cloud imagery (longwave infrared)",
        "goes-lir",
      ),
    );
  if (requested.has("weather.satellite.infrared"))
    specs.push(
      satelliteSpec(
        request,
        "weather.satellite.infrared",
        "goes_longwave_imagery",
        "global_longwave_imagery_mosaic",
        "longwave infrared satellite imagery",
        "goes-lir",
      ),
    );
  if (requested.has("weather.satellite.true-color"))
    specs.push(
      satelliteSpec(
        request,
        "weather.satellite.true-color",
        "goes_visible_imagery",
        "global_visible_imagery_mosaic",
        "visible satellite imagery",
        "goes-vis",
      ),
    );
  if (requested.has("weather.satellite.water-vapor"))
    specs.push(
      satelliteSpec(
        request,
        "weather.satellite.water-vapor",
        "goes_water_vapor_imagery",
        "global_water_vapor_imagery_mosaic",
        "upper-level water vapor satellite imagery",
        "goes-wv",
      ),
    );
  if (requested.has("weather.satellite.smoke"))
    specs.push({
      ...WMS_LAYER_SPECS["weather.air-quality"]!,
      layerId: "weather.satellite.smoke",
    });
  if (requested.has("weather.lightning.recent"))
    specs.push({
      layerId: "weather.lightning.recent",
      providerId: "noaa-nowcoast-lightning",
      providerName: "NOAA/NWS nowCOAST lightning",
      product: "15-minute lightning strike density",
      capabilitiesUrl: NOAA_LIGHTNING_CAPABILITIES,
      layerNames: ["ldn_lightning_strike_density"],
      styles: "lightning_density",
      coverage: "25°S–80°N; 110°E eastward to 0°",
      resolution: "8 km grid / 15-minute period",
      temporalKind: "observed",
      attribution: "NOAA/NWS/NCEP Ocean Prediction Center via nowCOAST",
      maxFrames: 17,
      allowLatestWithoutCapabilities: true,
    });
  return specs;
}

type RadarSitesResponse = {
  features?: Array<{
    geometry?: { type?: string; coordinates?: number[] };
    properties?: { rda_id?: unknown; name?: unknown; lat?: unknown; lon?: unknown };
  }>;
};

const radarSitesUrl =
  "https://opengeo.ncep.noaa.gov/geoserver/nws/ows?request=GetFeature&service=WFS&typeName=nws:radar_sites&version=1.0.0&outputFormat=application/json";

async function loadRadarSites(signal: AbortSignal): Promise<WeatherRadarSite[]> {
  return withCache(
    "noaa-radar-sites",
    12 * 60 * 60_000,
    { providerId: "noaa-nws-ridge", product: "radar site catalog" },
    async () => {
      const payload = await fetchJson<RadarSitesResponse>(radarSitesUrl, signal, nwsHeaders);
      return (payload.features ?? []).flatMap((feature) => {
        const id = boundedText(feature.properties?.rda_id, 8).toUpperCase();
        const name = boundedText(feature.properties?.name, 100);
        const coordinates = feature.geometry?.coordinates ?? [];
        const longitude = Number(feature.properties?.lon ?? coordinates[0]);
        const latitude = Number(feature.properties?.lat ?? coordinates[1]);
        if (
          feature.geometry?.type !== "Point" ||
          !/^[A-Z0-9]{4}$/.test(id) ||
          !Number.isFinite(longitude) ||
          !Number.isFinite(latitude)
        )
          return [];
        return [{ id, name: name || id, latitude, longitude }];
      });
    },
  );
}

const PRO_RADAR_PRODUCTS: Record<
  string,
  { suffix: string; style: string; product: string; units: string }
> = {
  "weather.radar.pro.reflectivity": {
    suffix: "sr_bref",
    style: "radar_reflectivity",
    product: "single-site super-resolution base reflectivity",
    units: "dBZ",
  },
  "weather.radar.pro.velocity": {
    suffix: "sr_bvel",
    style: "radar_velocity",
    product: "single-site super-resolution base radial velocity",
    units: "knots",
  },
  "weather.radar.pro.hydrometeor": {
    suffix: "bdhc",
    style: "radar_bdhc",
    product: "single-site digital hydrometeor classification",
    units: "classification",
  },
};

async function prepareRasterSpecs(request: WeatherPointRequest, signal: AbortSignal) {
  const specs = rasterSpecsFor(request);
  const warnings: string[] = [];
  const providerHealth: WeatherProviderHealth[] = [];
  const requested = Object.keys(PRO_RADAR_PRODUCTS).filter((id) =>
    request.requestedLayerIds?.includes(id),
  );
  if (!requested.length) return { specs, warnings, providerHealth };
  if (!withinConus(request)) {
    warnings.push("Professional single-site NOAA radar is not available at this map point.");
    providerHealth.push(
      health({
        providerId: "noaa-nws-ridge",
        providerName: "NOAA/NWS RIDGE radar",
        status: "degraded",
        products: requested.map((id) => PRO_RADAR_PRODUCTS[id]!.product),
        coverage: "United States and territories with an available NEXRAD site",
        error: "The inspected point is outside the connected U.S. radar domain",
        costClass: "public",
      }),
    );
    return { specs, warnings, providerHealth };
  }
  try {
    const nearest = nearestWeatherRadarSite(await loadRadarSites(signal), request);
    if (!nearest) throw new Error("NOAA returned an empty radar-site catalog");
    const site = nearest.site.id.toLowerCase();
    for (const layerId of requested) {
      const product = PRO_RADAR_PRODUCTS[layerId]!;
      specs.push({
        layerId,
        providerId: `noaa-nws-ridge-${site}`,
        providerName: `NOAA/NWS ${nearest.site.id} radar`,
        product: product.product,
        capabilitiesUrl: `https://opengeo.ncep.noaa.gov/geoserver/${site}/ows?request=GetCapabilities&service=wms&version=1.3.0`,
        layerNames: [`${site}_${product.suffix}`],
        styles: product.style,
        coverage: `${nearest.site.name} (${nearest.site.id}); selected ${Math.round(nearest.distanceKm)} km from the inspected point`,
        resolution: "NEXRAD single-site Level III display product",
        temporalKind: "observed",
        attribution: "NOAA / National Weather Service RIDGE II",
        maxFrames: 15,
      });
    }
  } catch (error) {
    warnings.push("The official NOAA radar-site catalog is temporarily unavailable.");
    providerHealth.push(
      health({
        providerId: "noaa-nws-ridge",
        providerName: "NOAA/NWS RIDGE radar",
        status: "down",
        products: requested.map((id) => PRO_RADAR_PRODUCTS[id]!.product),
        coverage: "United States and territories with an available NEXRAD site",
        error: error instanceof Error ? error.message : "Radar-site lookup failed",
        costClass: "public",
      }),
    );
  }
  return { specs, warnings, providerHealth };
}

type AwcMetarFeature = {
  type?: string;
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
};
type AwcMetarResponse = { features?: AwcMetarFeature[] };

async function loadAviationStations(
  request: WeatherPointRequest,
  signal: AbortSignal,
): Promise<WeatherStationObservation[]> {
  const latRadius = 1.5;
  const lonRadius = Math.min(3, 1.5 / Math.max(0.35, Math.cos((request.latitude * Math.PI) / 180)));
  const bbox = [
    Math.max(-90, request.latitude - latRadius),
    Math.max(-180, request.longitude - lonRadius),
    Math.min(90, request.latitude + latRadius),
    Math.min(180, request.longitude + lonRadius),
  ]
    .map((value) => value.toFixed(3))
    .join(",");
  return withCache(
    `awc-metar:${bbox}`,
    5 * 60_000,
    { providerId: "nws-awc", product: "METAR observations" },
    async () => {
      const url = `https://aviationweather.gov/api/data/metar?bbox=${bbox}&format=geojson&hours=2`;
      const payload = await fetchJson<AwcMetarResponse>(url, signal, nwsHeaders);
      return (payload.features ?? []).slice(0, 150).flatMap((feature, index) => {
        if (feature.geometry?.type !== "Point" || !feature.geometry.coordinates) return [];
        const properties = feature.properties ?? {};
        const timestamp = validIso(properties["obsTime"]);
        const stationId = boundedText(properties["id"], 12);
        if (!timestamp || !stationId) return [];
        const numeric = (key: string) => {
          const value = properties[key];
          if (value === null || value === undefined || value === "") return undefined;
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        };
        const temperature = numeric("temp");
        const dewpoint = numeric("dewp");
        const windSpeedKnots = numeric("wspd");
        const windGustKnots = numeric("wgst");
        const windDirection = numeric("wdir");
        const pressureHpa = numeric("altim");
        const visibilityMiles = numeric("visib");
        const observation: WeatherStationObservation = {
          id: `awc-metar-${stationId}-${timestamp}-${index}`,
          stationId,
          stationName: boundedText(properties["site"], 160) || undefined,
          location: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Point",
              coordinates: [
                Number(feature.geometry.coordinates[0]),
                Number(feature.geometry.coordinates[1]),
              ],
            },
          },
          ...(temperature !== undefined ? { temperatureK: celsiusToKelvin(temperature) } : {}),
          ...(dewpoint !== undefined ? { dewpointK: celsiusToKelvin(dewpoint) } : {}),
          ...(windSpeedKnots !== undefined ? { windSpeedMS: windSpeedKnots * 0.514444 } : {}),
          ...(windGustKnots !== undefined ? { windGustMS: windGustKnots * 0.514444 } : {}),
          ...(windDirection !== undefined ? { windDirectionDeg: windDirection } : {}),
          ...(pressureHpa !== undefined ? { pressurePa: pressureHpa * 100 } : {}),
          ...(visibilityMiles !== undefined ? { visibilityM: visibilityMiles * 1609.344 } : {}),
          flightCategory: boundedText(properties["fltcat"], 12) || undefined,
          rawObservation: boundedText(properties["rawOb"], 500) || undefined,
          source: sourceMetadata({
            providerId: "nws-awc",
            providerName: "Aviation Weather Center",
            product: "METAR observation",
            temporalKind: "observed",
            sourceTimestamp: timestamp,
            validTime: timestamp,
            rawSourceReference: url,
            attribution: "NOAA / National Weather Service Aviation Weather Center",
          }),
        };
        return [observation];
      });
    },
  );
}

function withinConus(request: WeatherPointRequest) {
  return (
    request.longitude >= -130 &&
    request.longitude <= -60 &&
    request.latitude >= 20 &&
    request.latitude <= 55
  );
}

type OpenMeteoResponse = {
  latitude?: number;
  longitude?: number;
  current?: Record<string, unknown>;
};

async function loadOpenMeteoEvaluation(
  request: WeatherPointRequest,
  signal: AbortSignal,
): Promise<WeatherObservation> {
  const params = new URLSearchParams({
    latitude: String(request.latitude),
    longitude: String(request.longitude),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code",
    wind_speed_unit: "ms",
    timezone: "GMT",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const payload = await fetchJson<OpenMeteoResponse>(url, signal);
  const current = payload.current ?? {};
  const numeric = (key: string) => {
    const value = Number(current[key]);
    return Number.isFinite(value) ? value : undefined;
  };
  const timestamp = validIso(current["time"]);
  return {
    id: `open-meteo-evaluation-${timestamp ?? Date.now()}`,
    location: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Point",
        coordinates: [payload.longitude ?? request.longitude, payload.latitude ?? request.latitude],
      },
    },
    summary: `Model weather code ${String(current["weather_code"] ?? "unavailable")}`,
    ...(numeric("temperature_2m") !== undefined
      ? { temperatureK: celsiusToKelvin(numeric("temperature_2m")!) }
      : {}),
    ...(numeric("apparent_temperature") !== undefined
      ? { apparentTemperatureK: celsiusToKelvin(numeric("apparent_temperature")!) }
      : {}),
    ...(numeric("relative_humidity_2m") !== undefined
      ? { relativeHumidityPct: numeric("relative_humidity_2m") }
      : {}),
    ...(numeric("wind_speed_10m") !== undefined ? { windSpeedMS: numeric("wind_speed_10m") } : {}),
    ...(numeric("wind_gusts_10m") !== undefined ? { windGustMS: numeric("wind_gusts_10m") } : {}),
    ...(numeric("wind_direction_10m") !== undefined
      ? { windDirectionDeg: numeric("wind_direction_10m") }
      : {}),
    ...(numeric("surface_pressure") !== undefined
      ? { pressurePa: numeric("surface_pressure")! * 100 }
      : {}),
    ...(numeric("precipitation") !== undefined
      ? { precipitationMm: numeric("precipitation") }
      : {}),
    ...(numeric("cloud_cover") !== undefined ? { cloudCoverPct: numeric("cloud_cover") } : {}),
    source: sourceMetadata({
      providerId: "open-meteo-evaluation",
      providerName: "Open-Meteo evaluation",
      product: "best-match model current conditions",
      temporalKind: "model",
      sourceTimestamp: timestamp,
      validTime: timestamp,
      quality: "estimated",
      qualityFlags: ["MODEL", "EVALUATION_ONLY"],
      rawSourceReference: url,
      attribution: "Weather data by Open-Meteo.com (evaluation only)",
    }),
  };
}

function health(
  input: Omit<WeatherProviderHealth, "lastSuccessfulRequest"> & {
    lastSuccessfulRequest?: string | undefined;
  },
): WeatherProviderHealth {
  return input;
}

export async function loadWeatherBundle(request: WeatherPointRequest): Promise<WeatherBundle> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const rasterController = new AbortController();
  const rasterTimeout = setTimeout(() => rasterController.abort(), 20_000);
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];
  const providerHealth: WeatherProviderHealth[] = [];
  const requestedLayers = new Set(
    request.requestedLayerIds?.length
      ? request.requestedLayerIds
      : ["weather.current", "weather.radar.simple", "weather.severe.alerts"],
  );
  let current: WeatherObservation | null = null;
  let forecast: WeatherForecastPeriod[] = [];
  let alerts: WeatherAlert[] = [];
  let radarFrames: RadarFrame[] = [];
  const rasterFrames: WeatherRasterFrame[] = [];
  let stationObservations: WeatherStationObservation[] = [];
  let photography: WeatherBundle["photography"] = null;
  let nwsCovered = false;

  // Start requested map imagery immediately. Previously these requests waited
  // behind current conditions, alerts and radar while sharing their timeout,
  // which could leave valid NOAA layers with no time to load in an edge worker.
  const rasterTask = prepareRasterSpecs(
    { ...request, requestedLayerIds: [...requestedLayers] },
    rasterController.signal,
  ).then(async (prepared) => ({
    prepared,
    results: await Promise.allSettled(
      prepared.specs.map(async (spec) => ({
        spec,
        frames: await loadWmsRasterFrames(spec, rasterController.signal),
      })),
    ),
  }));

  try {
    try {
      const nws = await loadNwsPoint(request, controller.signal);
      nwsCovered = nws.covered;
      current = nws.current;
      forecast = nws.forecast;
      if (nws.covered) {
        try {
          alerts = await loadNwsAlerts(request, controller.signal);
        } catch (error) {
          warnings.push("Official alert service is temporarily unavailable for this point.");
          providerHealth.push(
            health({
              providerId: "nws-alerts",
              providerName: "National Weather Service alerts",
              status: "down",
              products: ["alerts"],
              coverage: "United States and territories",
              error: error instanceof Error ? error.message : "Alert request failed",
              costClass: "public",
            }),
          );
        }
      }
      providerHealth.push(
        health({
          providerId: "nws",
          providerName: "National Weather Service",
          status: nws.covered
            ? nws.current || nws.forecast.length
              ? "up"
              : "degraded"
            : "degraded",
          products: ["surface observation", "point forecast", "alerts"],
          coverage: "United States and territories",
          latencyMs: Date.now() - startedAt,
          lastSuccessfulRequest:
            nws.current?.source.receivedTimestamp ??
            forecast[0]?.source.receivedTimestamp ??
            generatedAt,
          lastUpdate: nws.current?.source.sourceTimestamp ?? forecast[0]?.source.sourceTimestamp,
          error: nws.covered ? undefined : "Point is outside NWS point-forecast coverage",
          costClass: "public",
        }),
      );
    } catch (error) {
      warnings.push("The National Weather Service connection did not respond.");
      providerHealth.push(
        health({
          providerId: "nws",
          providerName: "National Weather Service",
          status: "down",
          products: ["surface observation", "point forecast", "alerts"],
          coverage: "United States and territories",
          latencyMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : "Provider request failed",
          costClass: "public",
        }),
      );
    }

    if (!current || !forecast.length) {
      try {
        const global = await withCache(
          `met-norway:${roundCoordinate(request.latitude)},${roundCoordinate(request.longitude)}`,
          15 * 60_000,
          { providerId: "met-norway", product: "global location forecast" },
          () => loadMetNorwayPoint(request, controller.signal),
        );
        if (!current) current = global.current;
        if (!forecast.length) forecast = global.forecast;
        providerHealth.push(
          health({
            providerId: "met-norway",
            providerName: "MET Norway",
            status: global.current || global.forecast.length ? "up" : "degraded",
            products: ["global point forecast", "model conditions"],
            coverage: "Global; highest priority and resolution in Nordic/Arctic regions",
            latencyMs: Date.now() - startedAt,
            lastSuccessfulRequest:
              global.current?.source.receivedTimestamp ??
              global.forecast[0]?.source.receivedTimestamp ??
              generatedAt,
            lastUpdate:
              global.current?.source.sourceTimestamp ?? global.forecast[0]?.source.sourceTimestamp,
            costClass: "public",
          }),
        );
      } catch (error) {
        warnings.push("The global MET Norway fallback did not respond.");
        providerHealth.push(
          health({
            providerId: "met-norway",
            providerName: "MET Norway",
            status: "down",
            products: ["global point forecast", "model conditions"],
            coverage: "Global",
            error: error instanceof Error ? error.message : "Provider request failed",
            costClass: "public",
          }),
        );
      }
    }

    const openMeteoEnabled = env?.["WEATHER_ENABLE_OPEN_METEO_EVALUATION"] === "true";
    if (!current && openMeteoEnabled) {
      try {
        current = await loadOpenMeteoEvaluation(request, controller.signal);
        providerHealth.push(
          health({
            providerId: "open-meteo-evaluation",
            providerName: "Open-Meteo evaluation",
            status: "up",
            products: ["global model conditions"],
            coverage: "Global model coverage",
            latencyMs: Date.now() - startedAt,
            lastSuccessfulRequest: current.source.receivedTimestamp,
            lastUpdate: current.source.sourceTimestamp,
            costClass: "evaluation",
          }),
        );
      } catch (error) {
        warnings.push("The optional global evaluation fallback did not respond.");
        providerHealth.push(
          health({
            providerId: "open-meteo-evaluation",
            providerName: "Open-Meteo evaluation",
            status: "down",
            products: ["global model conditions"],
            coverage: "Global",
            error: error instanceof Error ? error.message : "Provider request failed",
            costClass: "evaluation",
          }),
        );
      }
    }

    if (requestedLayers.has("weather.radar.simple")) {
      if (withinConus(request)) {
        try {
          radarFrames = await loadRadarFrames(controller.signal);
          providerHealth.push(
            health({
              providerId: "noaa-nws-mrms",
              providerName: "NOAA/NWS MRMS",
              status: radarFrames.length ? "up" : "degraded",
              products: ["radar-reflectivity"],
              coverage: "CONUS",
              latencyMs: Date.now() - startedAt,
              lastSuccessfulRequest: radarFrames.at(-1)?.source.receivedTimestamp ?? generatedAt,
              lastUpdate: radarFrames.at(-1)?.timestamp,
              costClass: "public",
            }),
          );
        } catch (primaryError) {
          try {
            radarFrames = await loadRadarFallback(controller.signal);
            warnings.push("Primary MRMS radar was unavailable; LandDraft switched to NWS radar.");
            providerHealth.push(
              health({
                providerId: "noaa-nws-mrms",
                providerName: "NOAA/NWS MRMS",
                status: "down",
                products: ["radar-reflectivity"],
                coverage: "CONUS",
                error:
                  primaryError instanceof Error ? primaryError.message : "Primary radar failed",
                costClass: "public",
              }),
              health({
                providerId: "nws-radar-fallback",
                providerName: "National Weather Service radar service",
                status: radarFrames.length ? "up" : "degraded",
                products: ["base reflectivity fallback"],
                coverage: "United States and territories",
                lastSuccessfulRequest: generatedAt,
                lastUpdate: radarFrames.at(-1)?.timestamp,
                costClass: "public",
              }),
            );
          } catch (fallbackError) {
            warnings.push("Both official radar services are temporarily unavailable.");
            providerHealth.push(
              health({
                providerId: "noaa-nws-mrms",
                providerName: "NOAA/NWS radar",
                status: "down",
                products: ["radar-reflectivity"],
                coverage: "United States and territories",
                error: `Primary: ${primaryError instanceof Error ? primaryError.message : "failed"}; fallback: ${fallbackError instanceof Error ? fallbackError.message : "failed"}`,
                costClass: "public",
              }),
            );
          }
        }
      } else {
        providerHealth.push(
          health({
            providerId: "noaa-nws-mrms",
            providerName: "NOAA/NWS radar",
            status: "degraded",
            products: ["radar-reflectivity"],
            coverage: "United States and territories",
            error:
              "Radar is unavailable at this map point; satellite/model data are not mislabeled as radar",
            costClass: "public",
          }),
        );
      }
    }

    const { prepared: rasterPreparation, results: rasterResults } = await rasterTask;
    const rasterSpecs = rasterPreparation.specs;
    warnings.push(...rasterPreparation.warnings);
    providerHealth.push(...rasterPreparation.providerHealth);
    rasterResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        rasterFrames.push(...result.value.frames);
        const latestOnly = result.value.frames.some((frame) =>
          frame.source.qualityFlags.includes("EDGE_CAPABILITIES_BLOCKED"),
        );
        if (latestOnly)
          warnings.push(
            `${result.value.spec.product} is loading the latest image without provider timeline metadata.`,
          );
        providerHealth.push(
          health({
            providerId: result.value.spec.providerId,
            providerName: result.value.spec.providerName,
            status: result.value.frames.length && !latestOnly ? "up" : "degraded",
            products: [result.value.spec.product],
            coverage: result.value.spec.coverage,
            lastSuccessfulRequest: generatedAt,
            lastUpdate: result.value.frames.at(-1)?.source.sourceTimestamp,
            error: latestOnly
              ? "Provider timeline metadata is blocked at the edge; requesting its latest official image directly"
              : undefined,
            costClass: "public",
          }),
        );
      } else {
        const spec = rasterSpecs[index]!;
        warnings.push(`${spec.product} is temporarily unavailable.`);
        providerHealth.push(
          health({
            providerId: spec.providerId,
            providerName: spec.providerName,
            status: "down",
            products: [spec.product],
            coverage: spec.coverage,
            error:
              result.reason instanceof Error ? result.reason.message : "Provider request failed",
            costClass: "public",
          }),
        );
      }
    });

    if (requestedLayers.has("weather.metar")) {
      try {
        stationObservations = await loadAviationStations(request, controller.signal);
        providerHealth.push(
          health({
            providerId: "nws-awc",
            providerName: "Aviation Weather Center",
            status: "up",
            products: ["METAR observations"],
            coverage: "Worldwide reporting stations",
            lastSuccessfulRequest: generatedAt,
            lastUpdate: stationObservations[0]?.source.sourceTimestamp,
            costClass: "public",
          }),
        );
      } catch (error) {
        warnings.push("Aviation observations are temporarily unavailable.");
        providerHealth.push(
          health({
            providerId: "nws-awc",
            providerName: "Aviation Weather Center",
            status: "down",
            products: ["METAR observations"],
            coverage: "Worldwide reporting stations",
            error: error instanceof Error ? error.message : "METAR request failed",
            costClass: "public",
          }),
        );
      }
    }

    if (requestedLayers.has("weather.photo")) {
      photography = await buildPhotographyAssessment(
        request,
        alerts,
        controller.signal,
        async (candidate, signal) => {
          const [candidateAlerts, model] = await Promise.all([
            loadNwsAlerts(candidate, signal).catch(() => []),
            withCache(
              `met-norway:${roundCoordinate(candidate.latitude)},${roundCoordinate(candidate.longitude)}`,
              15 * 60_000,
              { providerId: "met-norway", product: "photography candidate" },
              () => loadMetNorwayPoint(candidate, signal),
            ),
          ]);
          return { alerts: candidateAlerts, current: model.current };
        },
      );
    }

    if (!current)
      warnings.push(
        nwsCovered
          ? "No current station observation was available; forecast data may still be present."
          : "No configured provider covers current conditions at this point.",
      );
  } finally {
    clearTimeout(timeout);
    clearTimeout(rasterTimeout);
  }

  return {
    request,
    generatedAt,
    current,
    forecast,
    alerts,
    radarFrames,
    rasterFrames,
    stationObservations,
    photography,
    providerHealth,
    warnings,
    coverage: {
      nws: nwsCovered,
      radar: radarFrames.length > 0,
      globalForecast: providerHealth.some(
        (item) =>
          ["met-norway", "open-meteo-evaluation"].includes(item.providerId) && item.status === "up",
      ),
      satellite: rasterFrames.some((frame) => frame.layerId.startsWith("weather.satellite.")),
      lightningDensity: rasterFrames.some((frame) => frame.layerId === "weather.lightning.recent"),
    },
  };
}
