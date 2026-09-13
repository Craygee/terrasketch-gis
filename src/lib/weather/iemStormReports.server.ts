import type { Feature, FeatureCollection, Point } from "geojson";
import { sourceMetadata } from "./normalize.ts";
import type { WeatherPointRequest, WeatherStormReport, WeatherStormReportKind } from "./types.ts";

export const IEM_RECENT_STORM_REPORTS_URL =
  "https://mesonet.agron.iastate.edu/data/gis/shape/4326/us/lsr_24hour.geojson";

type IemStormReportProperties = {
  VALID?: unknown;
  MAG?: unknown;
  WFO?: unknown;
  TYPECODE?: unknown;
  TYPETEXT?: unknown;
  CITY?: unknown;
  COUNTY?: unknown;
  STATE?: unknown;
  SOURCE?: unknown;
  REMARK?: unknown;
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

function validTime(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw || !/^\d{12}$/.test(raw)) return undefined;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

export function stormReportKind(event: string): WeatherStormReportKind {
  const normalized = event.toUpperCase();
  if (
    normalized.includes("TORNADO") ||
    normalized.includes("LANDSPOUT") ||
    normalized.includes("WATERSPOUT")
  )
    return "tornado";
  if (normalized.includes("HAIL")) return "hail";
  if (
    normalized.includes("WIND") ||
    normalized.includes("WND") ||
    normalized.includes("GUST") ||
    normalized.includes("GST") ||
    normalized.includes("DOWNBURST")
  )
    return "wind";
  if (normalized.includes("FLOOD") || normalized.includes("RAIN")) return "flood";
  if (normalized.includes("LIGHTNING")) return "lightning";
  if (normalized.includes("SNOW") || normalized.includes("SLEET") || normalized.includes("ICE"))
    return "winter";
  return "other";
}

export function parseIemStormReports(
  input: unknown,
  receivedAt = new Date().toISOString(),
): WeatherStormReport[] {
  const collection = input as Partial<FeatureCollection<Point, IemStormReportProperties>> | null;
  if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features))
    return [];
  return collection.features.flatMap((candidate, index) => {
    const feature = candidate as Feature<Point, IemStormReportProperties>;
    const coordinates =
      feature.geometry?.type === "Point" ? feature.geometry.coordinates : undefined;
    const longitude = Number(coordinates?.[0]);
    const latitude = Number(coordinates?.[1]);
    const event = text(feature.properties?.TYPETEXT);
    const observedAt = validTime(feature.properties?.VALID);
    if (
      !event ||
      !observedAt ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    )
      return [];
    const magnitude = Number(feature.properties?.MAG);
    const office = text(feature.properties?.WFO);
    return [
      {
        id: `iem-lsr-${office ?? "unknown"}-${String(feature.properties?.VALID ?? index)}-${index}`,
        event,
        kind: stormReportKind(event),
        location: {
          type: "Feature",
          geometry: { type: "Point", coordinates: [longitude, latitude] },
          properties: {},
        },
        observedAt,
        ...(text(feature.properties?.CITY) ? { city: text(feature.properties?.CITY) } : {}),
        ...(text(feature.properties?.COUNTY) ? { county: text(feature.properties?.COUNTY) } : {}),
        ...(text(feature.properties?.STATE) ? { state: text(feature.properties?.STATE) } : {}),
        ...(Number.isFinite(magnitude) && magnitude > 0 ? { magnitude } : {}),
        ...(office ? { office } : {}),
        ...(text(feature.properties?.SOURCE)
          ? { reportedBy: text(feature.properties?.SOURCE) }
          : {}),
        ...(text(feature.properties?.REMARK) ? { remarks: text(feature.properties?.REMARK) } : {}),
        source: sourceMetadata({
          providerId: "iem-nws-lsr",
          providerName: "Iowa Environmental Mesonet / NWS",
          product: "NWS Local Storm Reports",
          temporalKind: "observed",
          sourceTimestamp: observedAt,
          receivedTimestamp: receivedAt,
          expirationTime: new Date(new Date(receivedAt).getTime() + 10 * 60_000).toISOString(),
          resolution: "Report location supplied by the issuing NWS office",
          confidence: 0.85,
          rawSourceReference: IEM_RECENT_STORM_REPORTS_URL,
          attribution: "NOAA/NWS Local Storm Reports via Iowa Environmental Mesonet",
        }),
      },
    ];
  });
}

function haversineKm(left: [number, number], right: [number, number]) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = radians(right[1] - left[1]);
  const deltaLongitude = radians(right[0] - left[0]);
  const latitude1 = radians(left[1]);
  const latitude2 = radians(right[1]);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearbyIemStormReports(
  reports: WeatherStormReport[],
  request: WeatherPointRequest,
  radiusKm = 1_200,
) {
  const center: [number, number] = [request.longitude, request.latitude];
  return reports
    .filter(
      (report) =>
        haversineKm(center, report.location.geometry.coordinates as [number, number]) <= radiusKm,
    )
    .sort(
      (left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime(),
    )
    .slice(0, 750);
}

export async function loadIemStormReports(
  request: WeatherPointRequest,
  signal: AbortSignal,
): Promise<WeatherStormReport[]> {
  const response = await fetch(IEM_RECENT_STORM_REPORTS_URL, {
    signal,
    headers: {
      Accept: "application/geo+json, application/json",
      "User-Agent": "LandDraftWeather/0.1 (https://landdraft.net)",
    },
  });
  if (!response.ok) throw new Error(`IEM Local Storm Reports returned HTTP ${response.status}`);
  return nearbyIemStormReports(parseIemStormReports(await response.json()), request);
}
