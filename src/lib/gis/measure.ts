import { area as turfArea, length as turfLength } from "@turf/turf";
import type { Feature, FeatureCollection, Geometry } from "geojson";

export const AREA_UNITS = {
  acres: { label: "acres", factor: 1 / 4046.8564224 },
  sqft: { label: "sq ft", factor: 10.7639104167 },
  sqm: { label: "sq m", factor: 1 },
  hectares: { label: "hectares", factor: 1 / 10000 },
} as const;

export const LENGTH_UNITS = {
  miles: { label: "mi", factor: 1 / 1609.344 },
  feet: { label: "ft", factor: 3.280839895 },
  meters: { label: "m", factor: 1 },
  kilometers: { label: "km", factor: 1 / 1000 },
} as const;

export type AreaUnit = keyof typeof AREA_UNITS;
export type LengthUnit = keyof typeof LENGTH_UNITS;

const fmt = (n: number) =>
  n >= 1000
    ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 3 : 2 });

export function squareMeters(geo: Feature | FeatureCollection | Geometry): number {
  try {
    return turfArea(geo as never);
  } catch {
    return 0;
  }
}

export function meters(geo: Feature | FeatureCollection | Geometry): number {
  try {
    return turfLength(geo as never, { units: "meters" });
  } catch {
    return 0;
  }
}

export function formatArea(sqm: number, unit: AreaUnit): string {
  const u = AREA_UNITS[unit];
  return `${fmt(sqm * u.factor)} ${u.label}`;
}

export function formatLength(m: number, unit: LengthUnit): string {
  const u = LENGTH_UNITS[unit];
  return `${fmt(m * u.factor)} ${u.label}`;
}

export function allAreas(sqm: number): string {
  return (Object.keys(AREA_UNITS) as AreaUnit[]).map((u) => formatArea(sqm, u)).join(" · ");
}

export function formatLatLon(lng: number, lat: number, decimals = 5): string {
  return `${lat.toFixed(decimals)}, ${lng.toFixed(decimals)}`;
}

export function toDms(value: number, isLat: boolean): string {
  const dir = isLat ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${d}° ${m}' ${s.toFixed(1)}" ${dir}`;
}
