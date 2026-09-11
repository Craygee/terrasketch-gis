import {
  freshnessFor,
  kelvinToCelsius,
  kelvinToFahrenheit,
  metersPerSecondToKnots,
  metersPerSecondToMph,
  metersToMiles,
  millimetersToInches,
  pascalsToHectopascals,
  pascalsToInHg,
} from "./normalize";
import type { WeatherSourceMetadata, WeatherUnitSystem } from "./types";

export function formatTemperature(value: number | undefined, system: WeatherUnitSystem) {
  if (value === undefined) return "Unavailable";
  return system === "us"
    ? `${kelvinToFahrenheit(value).toFixed(0)}°F`
    : `${kelvinToCelsius(value).toFixed(0)}°C`;
}

export function formatWind(value: number | undefined, system: WeatherUnitSystem) {
  if (value === undefined) return "Unavailable";
  if (system === "meteorological") return `${metersPerSecondToKnots(value).toFixed(0)} kt`;
  if (system === "us") return `${metersPerSecondToMph(value).toFixed(0)} mph`;
  return `${value.toFixed(1)} m/s`;
}

export function formatPressure(value: number | undefined, system: WeatherUnitSystem) {
  if (value === undefined) return "Unavailable";
  return system === "us"
    ? `${pascalsToInHg(value).toFixed(2)} inHg`
    : `${pascalsToHectopascals(value).toFixed(0)} hPa`;
}

export function formatVisibility(value: number | undefined, system: WeatherUnitSystem) {
  if (value === undefined) return "Unavailable";
  return system === "us"
    ? `${metersToMiles(value).toFixed(1)} mi`
    : `${(value / 1000).toFixed(1)} km`;
}

export function formatPrecipitation(value: number | undefined, system: WeatherUnitSystem) {
  if (value === undefined) return "Unavailable";
  return system === "us" ? `${millimetersToInches(value).toFixed(2)} in` : `${value.toFixed(1)} mm`;
}

export function weatherAgeLabel(source: WeatherSourceMetadata, now = new Date()) {
  if (source.temporalKind === "forecast") return "FORECAST";
  if (source.temporalKind === "model") return "MODEL";
  if (source.temporalKind === "development") return "DEV DATA";
  if (source.temporalKind === "unavailable") return "UNAVAILABLE";
  const freshness = freshnessFor(source.sourceTimestamp, now);
  if (!source.sourceTimestamp) return "OBSERVED · TIME UNAVAILABLE";
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(source.sourceTimestamp).getTime()) / 60_000),
  );
  if (freshness === "live") return "LIVE";
  if (freshness === "stale") return `STALE · ${minutes} MIN AGO`;
  if (freshness === "delayed") return `DELAYED · ${minutes} MIN AGO`;
  return `${minutes} MIN AGO`;
}
