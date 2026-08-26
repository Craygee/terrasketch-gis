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
  resultOffset?: number | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface RemoteLoadProgress {
  data: FeatureCollection;
  loaded: number;
  total?: number;
  complete: boolean;
  truncated: boolean;
}

export interface PagedRemoteQueryOptions extends RemoteQueryOptions {
  pageSize?: number | undefined;
  maxTotalFeatures?: number | undefined;
  onProgress?: ((progress: RemoteLoadProgress) => void) | undefined;
}

const addSpatialParams = (params: URLSearchParams, opts: RemoteQueryOptions) => {
  if (!opts.bbox) return;
  params.set("geometry", opts.bbox.join(","));
  params.set("geometryType", "esriGeometryEnvelope");
  params.set("inSR", "4326");
  params.set("spatialRel", "esriSpatialRelIntersects");
};

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
  if (opts.resultOffset !== undefined) params.set("resultOffset", String(opts.resultOffset));
  if (opts.maxAllowableOffset !== undefined)
    params.set("maxAllowableOffset", String(opts.maxAllowableOffset));
  if (opts.cacheHint) params.set("cacheHint", "true");
  addSpatialParams(params, opts);
  return `${base}/query?${params.toString()}`;
}

export function buildArcgisCountUrl(layerUrl: string, opts: RemoteQueryOptions = {}): string {
  const base = normalizeArcgisLayerUrl(layerUrl);
  const params = new URLSearchParams({
    where: opts.where && opts.where.length > 0 ? opts.where : "1=1",
    returnCountOnly: "true",
    f: "json",
  });
  if (opts.cacheHint) params.set("cacheHint", "true");
  addSpatialParams(params, opts);
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

const fetchWithTimeout = async (url: string, signal?: AbortSignal, timeoutMs = 35_000) => {
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error("The public data service timed out. Zoom in and try again.");
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
};

export async function fetchRemoteGeoJSON(
  url: string,
  opts: RemoteQueryOptions = {},
): Promise<FeatureCollection> {
  const kind = classifyUrl(url);
  const requestUrl = kind === "arcgis" ? buildArcgisQueryUrl(url, opts) : url;
  const res = await fetchWithTimeout(requestUrl, opts.signal, opts.timeoutMs);
  if (!res.ok) throw new Error(`Request failed (${res.status}) for ${requestUrl}`);
  const json = (await res.json()) as FeatureCollection & { error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "Service returned an error");
  if (!json.features) throw new Error("Response did not contain GeoJSON features");
  return sanitize(json);
}

export async function fetchArcgisFeatureCount(
  url: string,
  opts: RemoteQueryOptions = {},
): Promise<number> {
  if (classifyUrl(url) !== "arcgis") throw new Error("Feature counts require an ArcGIS layer");
  const response = await fetchWithTimeout(
    buildArcgisCountUrl(url, opts),
    opts.signal,
    opts.timeoutMs,
  );
  if (!response.ok) throw new Error(`Feature count failed (${response.status})`);
  const json = (await response.json()) as {
    count?: number;
    error?: { message?: string };
  };
  if (json.error) throw new Error(json.error.message ?? "Service returned an error");
  if (!Number.isFinite(json.count)) throw new Error("Service did not return a feature count");
  return Number(json.count);
}

const featureIdentity = (feature: FeatureCollection["features"][number]) => {
  if (feature.id !== undefined) return `id:${String(feature.id)}`;
  const properties = feature.properties ?? {};
  for (const key of ["OBJECTID", "ObjectID", "objectid", "FID", "fid"]) {
    if (properties[key] !== undefined && properties[key] !== null)
      return `${key}:${String(properties[key])}`;
  }
  return null;
};

/**
 * Loads every feature in an ArcGIS viewport using stable server pagination.
 * A count is requested first so dense views can stop before they freeze the
 * browser and clearly ask the user to zoom in instead of silently showing an
 * arbitrary first page.
 */
export async function fetchRemoteGeoJSONPaged(
  url: string,
  opts: PagedRemoteQueryOptions = {},
): Promise<RemoteLoadProgress> {
  if (classifyUrl(url) !== "arcgis") {
    const data = await fetchRemoteGeoJSON(url, opts);
    const result = {
      data,
      loaded: data.features.length,
      total: data.features.length,
      complete: true,
      truncated: false,
    };
    opts.onProgress?.(result);
    return result;
  }

  const total = await fetchArcgisFeatureCount(url, opts);
  const maxTotal = Math.max(1, opts.maxTotalFeatures ?? 20_000);
  if (total > maxTotal) {
    const result = {
      data: { type: "FeatureCollection", features: [] } as FeatureCollection,
      loaded: 0,
      total,
      complete: false,
      truncated: true,
    };
    opts.onProgress?.(result);
    return result;
  }

  const pageSize = Math.max(1, Math.min(2_000, opts.pageSize ?? 2_000));
  const offsets = Array.from(
    { length: Math.ceil(total / pageSize) },
    (_, index) => index * pageSize,
  );
  const pages = new Map<number, FeatureCollection["features"]>();
  let nextPage = 0;
  let completedPages = 0;
  let lastMergedCount = 0;
  let stalled = false;

  const mergedFeatures = () => {
    const merged: FeatureCollection["features"] = [];
    const identities = new Set<string>();
    for (const offset of offsets) {
      for (const feature of pages.get(offset) ?? []) {
        const identity = featureIdentity(feature);
        if (identity && identities.has(identity)) continue;
        if (identity) identities.add(identity);
        merged.push(feature);
      }
    }
    return merged;
  };

  const worker = async () => {
    while (nextPage < offsets.length && !stalled) {
      const offset = offsets[nextPage++];
      if (offset === undefined) return;
      const requested = Math.min(pageSize, total - offset);
      const page = await fetchRemoteGeoJSON(url, {
        ...opts,
        maxFeatures: requested,
        resultOffset: offset,
      });
      if (page.features.length === 0 && requested > 0) stalled = true;
      pages.set(offset, page.features);
      completedPages += 1;
      const features = mergedFeatures();
      if (page.features.length > 0 && features.length === lastMergedCount) stalled = true;
      lastMergedCount = features.length;
      const complete = completedPages === offsets.length && !stalled;
      opts.onProgress?.({
        data: { type: "FeatureCollection", features },
        loaded: features.length,
        total,
        complete,
        truncated: stalled,
      });
    }
  };

  const concurrency = Math.min(3, offsets.length);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const features = mergedFeatures();
  const complete = completedPages === offsets.length && !stalled;
  return {
    data: { type: "FeatureCollection", features },
    loaded: features.length,
    total,
    complete,
    truncated: stalled || !complete,
  };
}
