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
} from "./types";
import { recordWeatherUsage } from "./telemetry.server";

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

const nwsHeaders = {
  Accept: "application/geo+json, application/json",
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
  try {
    const value = await loader();
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    recordWeatherUsage({ ...metric, success: true, cacheHit: false });
    return value;
  } catch (error) {
    recordWeatherUsage({ ...metric, success: false, cacheHit: false });
    throw error;
  }
}

async function fetchJson<T>(url: string, signal: AbortSignal, headers: HeadersInit = {}) {
  const response = await fetch(url, { signal, headers });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return (await response.json()) as T;
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
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];
  const providerHealth: WeatherProviderHealth[] = [];
  let current: WeatherObservation | null = null;
  let forecast: WeatherForecastPeriod[] = [];
  let alerts: WeatherAlert[] = [];
  let radarFrames: RadarFrame[] = [];
  let nwsCovered = false;

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
        warnings.push("The optional global evaluation forecast did not respond.");
        providerHealth.push(
          health({
            providerId: "open-meteo-evaluation",
            providerName: "Open-Meteo evaluation",
            status: "down",
            products: ["global model conditions"],
            coverage: "Global model coverage",
            error: error instanceof Error ? error.message : "Provider request failed",
            costClass: "evaluation",
          }),
        );
      }
    } else if (!openMeteoEnabled) {
      providerHealth.push(
        health({
          providerId: "global-forecast",
          providerName: "Global forecast provider",
          status: "not-configured",
          products: ["global current", "forecast grids", "model fields"],
          coverage: "Global",
          error: "Choose a production provider or explicitly enable evaluation mode",
          costClass: "commercial",
        }),
      );
    }

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
      } catch (error) {
        warnings.push("Official composite radar is temporarily unavailable.");
        providerHealth.push(
          health({
            providerId: "noaa-nws-mrms",
            providerName: "NOAA/NWS MRMS",
            status: "down",
            products: ["radar-reflectivity"],
            coverage: "CONUS",
            error: error instanceof Error ? error.message : "Radar metadata request failed",
            costClass: "public",
          }),
        );
      }
    } else {
      providerHealth.push(
        health({
          providerId: "noaa-nws-mrms",
          providerName: "NOAA/NWS MRMS",
          status: "degraded",
          products: ["radar-reflectivity"],
          coverage: "CONUS",
          error: "Current map point is outside this radar mosaic",
          costClass: "public",
        }),
      );
    }

    providerHealth.push(
      health({
        providerId: "lightning-provider",
        providerName: "Lightning provider",
        status: "not-configured",
        products: ["lightning-strikes", "lightning-density"],
        coverage: "Provider dependent",
        error: "A licensed real-time lightning feed is required",
        costClass: "commercial",
      }),
    );

    if (!current)
      warnings.push(
        nwsCovered
          ? "No current station observation was available; forecast data may still be present."
          : "No configured provider covers current conditions at this point.",
      );
  } finally {
    clearTimeout(timeout);
  }

  return {
    request,
    generatedAt,
    current,
    forecast,
    alerts,
    radarFrames,
    providerHealth,
    warnings,
    coverage: {
      nws: nwsCovered,
      radar: radarFrames.length > 0,
      globalForecast: providerHealth.some(
        (item) => item.providerId === "open-meteo-evaluation" && item.status === "up",
      ),
    },
  };
}
