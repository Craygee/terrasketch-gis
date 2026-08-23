import type { FeatureCollection } from "geojson";

/**
 * Remote source adapter. Converts ArcGIS FeatureServer / MapServer layer URLs
 * into GeoJSON query requests, and passes through plain GeoJSON URLs.
 * Kept intentionally standalone so a future PostGIS/cloud adapter can sit
 * alongside it with the same `fetchRemoteGeoJSON` signature.
 */

export type RemoteKind = "arcgis" | "geojson";

const ARCGIS_LAYER_RE = /\/(FeatureServer|MapServer)\/(\d+)\/?$/i;
const ARCGIS_SERVICE_RE = /\/(FeatureServer|MapServer)\/?$/i;

export function classifyUrl(raw: string): RemoteKind {
  return /\/(FeatureServer|MapServer)(\/|$)/i.test(raw) ? "arcgis" : "geojson";
}

export function normalizeArcgisLayerUrl(raw: string): string {
  const url = raw
    .trim()
    .replace(/\?.*$/, "")
    .replace(/\/query$/i, "");
  if (ARCGIS_LAYER_RE.test(url)) return url;
  if (ARCGIS_SERVICE_RE.test(url)) return `${url.replace(/\/$/, "")}/0`;
  return url;
}

export interface RemoteQueryOptions {
  /** [west, south, east, north] in WGS84 */
  bbox?: [number, number, number, number] | undefined;
  maxFeatures?: number | undefined;
  maxAllowableOffset?: number | undefined;
  geometryPrecision?: number | undefined;
  cacheHint?: boolean | undefined;
  where?: string | undefined;
  outFields?: string[] | undefined;
  signal?: AbortSignal | undefined;
}

export function buildArcgisQueryUrl(layerUrl: string, opts: RemoteQueryOptions = {}): string {
  const base = normalizeArcgisLayerUrl(layerUrl);
  const params = new URLSearchParams({
    where: opts.where && opts.where.length > 0 ? opts.where : "1=1",
    outFields: opts.outFields?.length ? opts.outFields.join(",") : "*",
    outSR: "4326",
    f: "geojson",
    returnGeometry: "true",
    geometryPrecision: String(opts.geometryPrecision ?? 6),
    resultRecordCount: String(opts.maxFeatures ?? 2000),
  });
  if (opts.maxAllowableOffset !== undefined)
    params.set("maxAllowableOffset", String(opts.maxAllowableOffset));
  if (opts.cacheHint) params.set("cacheHint", "true");
  if (opts.bbox) {
    params.set("geometry", opts.bbox.join(","));
    params.set("geometryType", "esriGeometryEnvelope");
    params.set("inSR", "4326");
    params.set("spatialRel", "esriSpatialRelIntersects");
  }
  return `${base}/query?${params.toString()}`;
}

export interface ArcgisField {
  name: string;
  alias: string;
  type: string;
}

export async function fetchArcgisFields(
  layerUrl: string,
  signal?: AbortSignal,
): Promise<ArcgisField[]> {
  if (classifyUrl(layerUrl) !== "arcgis") return [];
  const response = await fetch(`${normalizeArcgisLayerUrl(layerUrl)}?f=json`, {
    signal: signal ?? null,
  });
  if (!response.ok) throw new Error(`Layer details failed (${response.status})`);
  const json = (await response.json()) as {
    fields?: Array<{ name?: string; alias?: string; type?: string }>;
    error?: { message?: string };
  };
  if (json.error) throw new Error(json.error.message ?? "Service returned an error");
  return (json.fields ?? [])
    .filter((field): field is { name: string; alias?: string; type?: string } =>
      Boolean(field.name),
    )
    .map((field) => ({
      name: field.name,
      alias: field.alias || field.name,
      type: field.type || "",
    }));
}

function sanitize(fc: FeatureCollection): FeatureCollection {
  const features = (fc.features ?? []).filter((f) => f && f.geometry);
  return { type: "FeatureCollection", features };
}

export async function fetchRemoteGeoJSON(
  url: string,
  opts: RemoteQueryOptions = {},
): Promise<FeatureCollection> {
  const kind = classifyUrl(url);
  const requestUrl = kind === "arcgis" ? buildArcgisQueryUrl(url, opts) : url;
  const res = await fetch(requestUrl, { signal: opts.signal ?? null });
  if (!res.ok) throw new Error(`Request failed (${res.status}) for ${requestUrl}`);
  const json = (await res.json()) as FeatureCollection & { error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "Service returned an error");
  if (!json.features) throw new Error("Response did not contain GeoJSON features");
  return sanitize(json);
}
