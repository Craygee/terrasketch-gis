import { celsiusToKelvin, sourceMetadata, validIso } from "./normalize";
import type { WeatherForecastPeriod, WeatherObservation, WeatherPointRequest } from "./types";

type MetDetails = Record<string, unknown>;
type MetPeriod = {
  summary?: { symbol_code?: string };
  details?: MetDetails;
};
type MetTimeseries = {
  time?: string;
  data?: {
    instant?: { details?: MetDetails };
    next_1_hours?: MetPeriod;
    next_6_hours?: MetPeriod;
    next_12_hours?: MetPeriod;
  };
};
type MetNorwayResponse = {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: {
    meta?: { updated_at?: string };
    timeseries?: MetTimeseries[];
  };
};

const MET_NORWAY_ENDPOINT = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const MET_NORWAY_USER_AGENT = "LandDraftWeather/0.2 https://landdraft.net";

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function symbolSummary(value: unknown) {
  const text = String(value ?? "")
    .replace(/_(day|night|polartwilight)$/i, "")
    .replaceAll("_", " ")
    .trim();
  return text ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Model forecast";
}

function source(updatedAt: string | undefined, validTime: string | undefined, product: string) {
  return sourceMetadata({
    providerId: "met-norway",
    providerName: "MET Norway",
    product,
    temporalKind: "model",
    sourceTimestamp: updatedAt,
    validTime,
    quality: "estimated",
    qualityFlags: ["MODEL", "AUTOMATED_FORECAST"],
    rawSourceReference: MET_NORWAY_ENDPOINT,
    attribution: "Weather forecast data from MET Norway (CC BY 4.0)",
  });
}

function periodFor(entry: MetTimeseries) {
  return entry.data?.next_1_hours ?? entry.data?.next_6_hours ?? entry.data?.next_12_hours;
}

export async function loadMetNorwayPoint(
  request: WeatherPointRequest,
  signal: AbortSignal,
): Promise<{ current: WeatherObservation | null; forecast: WeatherForecastPeriod[] }> {
  const params = new URLSearchParams({
    lat: request.latitude.toFixed(4),
    lon: request.longitude.toFixed(4),
  });
  const url = `${MET_NORWAY_ENDPOINT}?${params}`;
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json", "User-Agent": MET_NORWAY_USER_AGENT },
  });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  const payload = (await response.json()) as MetNorwayResponse;
  const updatedAt = validIso(payload.properties?.meta?.updated_at);
  const entries = payload.properties?.timeseries ?? [];
  const first = entries[0];
  const firstTime = validIso(first?.time);
  const firstDetails = first?.data?.instant?.details ?? {};
  const firstPeriod = first ? periodFor(first) : undefined;
  const coordinates = payload.geometry?.coordinates;
  const longitude = numberValue(coordinates?.[0]) ?? request.longitude;
  const latitude = numberValue(coordinates?.[1]) ?? request.latitude;

  const temperature = numberValue(firstDetails["air_temperature"]);
  const dewpoint = numberValue(firstDetails["dew_point_temperature"]);
  const pressure = numberValue(firstDetails["air_pressure_at_sea_level"]);
  const precipitation = numberValue(firstPeriod?.details?.["precipitation_amount"]);
  const current: WeatherObservation | null = firstTime
    ? {
        id: `met-norway-${firstTime}`,
        location: {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [longitude, latitude] },
        },
        summary: symbolSummary(firstPeriod?.summary?.symbol_code),
        ...(temperature !== undefined ? { temperatureK: celsiusToKelvin(temperature) } : {}),
        ...(dewpoint !== undefined ? { dewpointK: celsiusToKelvin(dewpoint) } : {}),
        ...(numberValue(firstDetails["relative_humidity"]) !== undefined
          ? { relativeHumidityPct: numberValue(firstDetails["relative_humidity"]) }
          : {}),
        ...(numberValue(firstDetails["wind_speed"]) !== undefined
          ? { windSpeedMS: numberValue(firstDetails["wind_speed"]) }
          : {}),
        ...(numberValue(firstDetails["wind_speed_of_gust"]) !== undefined
          ? { windGustMS: numberValue(firstDetails["wind_speed_of_gust"]) }
          : {}),
        ...(numberValue(firstDetails["wind_from_direction"]) !== undefined
          ? { windDirectionDeg: numberValue(firstDetails["wind_from_direction"]) }
          : {}),
        ...(pressure !== undefined ? { pressurePa: pressure * 100 } : {}),
        ...(precipitation !== undefined ? { precipitationMm: precipitation } : {}),
        ...(numberValue(firstDetails["cloud_area_fraction"]) !== undefined
          ? { cloudCoverPct: numberValue(firstDetails["cloud_area_fraction"]) }
          : {}),
        source: source(updatedAt, firstTime, "global location forecast"),
      }
    : null;

  const forecast = entries.slice(0, 24).flatMap((entry, index): WeatherForecastPeriod[] => {
    const startTime = validIso(entry.time);
    if (!startTime) return [];
    const next = entries[index + 1];
    const endTime =
      validIso(next?.time) ?? new Date(new Date(startTime).getTime() + 3_600_000).toISOString();
    const details = entry.data?.instant?.details ?? {};
    const period = periodFor(entry);
    const periodDetails = period?.details ?? {};
    const periodTemperature = numberValue(details["air_temperature"]);
    return [
      {
        id: `met-norway-period-${startTime}`,
        name: new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          timeZone: "UTC",
          timeZoneName: "short",
        }).format(new Date(startTime)),
        startTime,
        endTime,
        ...(periodTemperature !== undefined
          ? { temperatureK: celsiusToKelvin(periodTemperature) }
          : {}),
        ...(numberValue(periodDetails["probability_of_precipitation"]) !== undefined
          ? {
              precipitationProbabilityPct: numberValue(
                periodDetails["probability_of_precipitation"],
              ),
            }
          : {}),
        ...(numberValue(details["wind_speed"]) !== undefined
          ? { windSpeedMS: numberValue(details["wind_speed"]) }
          : {}),
        ...(numberValue(details["wind_speed_of_gust"]) !== undefined
          ? { windGustMS: numberValue(details["wind_speed_of_gust"]) }
          : {}),
        ...(numberValue(details["wind_from_direction"]) !== undefined
          ? { windDirectionDeg: numberValue(details["wind_from_direction"]) }
          : {}),
        summary: symbolSummary(period?.summary?.symbol_code),
        source: source(updatedAt, startTime, "global location forecast"),
      },
    ];
  });

  return { current, forecast };
}
