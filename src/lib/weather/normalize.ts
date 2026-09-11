import type {
  WeatherAlertSeverity,
  WeatherAlertStatus,
  WeatherFreshness,
  WeatherQuality,
  WeatherSourceMetadata,
  WeatherTemporalKind,
} from "./types";

export const celsiusToKelvin = (value: number) => value + 273.15;
export const fahrenheitToKelvin = (value: number) => ((value - 32) * 5) / 9 + 273.15;
export const kelvinToCelsius = (value: number) => value - 273.15;
export const kelvinToFahrenheit = (value: number) => ((value - 273.15) * 9) / 5 + 32;
export const metersPerSecondToMph = (value: number) => value * 2.2369362921;
export const metersPerSecondToKnots = (value: number) => value * 1.9438444924;
export const millimetersToInches = (value: number) => value / 25.4;
export const pascalsToHectopascals = (value: number) => value / 100;
export const pascalsToInHg = (value: number) => value / 3386.389;
export const metersToMiles = (value: number) => value / 1609.344;

export function validIso(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}

export function freshnessFor(
  sourceTimestamp: string | undefined,
  now = new Date(),
  liveMinutes = 5,
  delayedMinutes = 30,
  staleMinutes = 90,
): WeatherFreshness {
  if (!sourceTimestamp) return "unavailable";
  const source = new Date(sourceTimestamp).getTime();
  if (!Number.isFinite(source)) return "unavailable";
  const ageMinutes = Math.max(0, (now.getTime() - source) / 60_000);
  if (ageMinutes <= liveMinutes) return "live";
  if (ageMinutes <= delayedMinutes) return "recent";
  if (ageMinutes <= staleMinutes) return "delayed";
  return "stale";
}

export function sourceMetadata(input: {
  providerId: string;
  providerName: string;
  product: string;
  temporalKind: WeatherTemporalKind;
  sourceTimestamp?: string | undefined;
  receivedTimestamp?: string | undefined;
  validTime?: string | undefined;
  expirationTime?: string | undefined;
  resolution?: string | undefined;
  confidence?: number | undefined;
  quality?: WeatherQuality | undefined;
  qualityFlags?: string[] | undefined;
  rawSourceReference?: string | undefined;
  attribution: string;
}): WeatherSourceMetadata {
  const receivedTimestamp = validIso(input.receivedTimestamp) ?? new Date().toISOString();
  const sourceTimestamp = validIso(input.sourceTimestamp);
  const freshness = freshnessFor(sourceTimestamp, new Date(receivedTimestamp));
  const quality = input.quality ?? (freshness === "stale" ? "stale" : "high");
  const validTime = validIso(input.validTime);
  const expirationTime = validIso(input.expirationTime);
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    product: input.product,
    temporalKind: input.temporalKind,
    receivedTimestamp,
    quality,
    qualityFlags: input.qualityFlags ?? [],
    attribution: input.attribution,
    ...(sourceTimestamp ? { sourceTimestamp } : {}),
    ...(validTime ? { validTime } : {}),
    ...(expirationTime ? { expirationTime } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.confidence !== undefined
      ? { confidence: Math.max(0, Math.min(1, input.confidence)) }
      : {}),
    ...(input.rawSourceReference ? { rawSourceReference: input.rawSourceReference } : {}),
  };
}

export function normalizeAlertSeverity(value: unknown): WeatherAlertSeverity {
  const normalized = String(value ?? "").toLowerCase();
  return ["extreme", "severe", "moderate", "minor"].includes(normalized)
    ? (normalized as WeatherAlertSeverity)
    : "unknown";
}

export function normalizeAlertStatus(value: unknown): WeatherAlertStatus {
  const normalized = String(value ?? "").toLowerCase();
  return ["actual", "exercise", "system", "test", "draft"].includes(normalized)
    ? (normalized as WeatherAlertStatus)
    : "unknown";
}

export const cardinalDirectionDegrees = (value: unknown): number | undefined => {
  const directions: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5,
  };
  const key = String(value ?? "")
    .trim()
    .toUpperCase();
  return directions[key];
};
