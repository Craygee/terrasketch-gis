import { basemaps, setBasemapFallback } from "./basemaps";
import { catalog, type CatalogEntry } from "./catalog";
import { classifyUrl, normalizeArcgisLayerUrl } from "./arcgis";
import type { ConnectionRecoveryHint, GisLayer } from "./types";

export type ConnectionKind = "basemap" | "public-data" | "project-layer";
export type ConnectionStatus = "healthy" | "fallback" | "error";

export interface ConnectionResult {
  id: string;
  name: string;
  kind: ConnectionKind;
  status: ConnectionStatus;
  url: string;
  effectiveUrl?: string;
  sourcePage?: string;
  message: string;
}

interface ConnectionTarget {
  id: string;
  name: string;
  kind: ConnectionKind;
  url: string;
  fallbackUrl?: string;
  sourcePage?: string;
  basemapId?: string;
}

const URL_OVERRIDES_KEY = "landdraft.catalog-url-overrides.v1";
const CONNECTION_HINTS_KEY = "landdraft.connection-hints.v1";

function readRecord(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function resolveCatalogUrl(entry: CatalogEntry): string | undefined {
  return readRecord(URL_OVERRIDES_KEY)[entry.id] || entry.url;
}

export function saveCatalogUrlOverride(id: string, url: string): void {
  const current = readRecord(URL_OVERRIDES_KEY);
  current[id] = url.trim();
  window.localStorage.setItem(URL_OVERRIDES_KEY, JSON.stringify(current));
}

export interface ConnectionHint {
  url: string;
  notes: string;
  updatedAt: string;
}

export function saveConnectionHint(id: string, hint: Omit<ConnectionHint, "updatedAt">): void {
  if (typeof window === "undefined") return;
  let current: Record<string, ConnectionHint> = {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(CONNECTION_HINTS_KEY) ?? "{}");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) current = stored;
  } catch {
    // A damaged optional hint cache should never block the data library.
  }
  current[id] = { ...hint, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(CONNECTION_HINTS_KEY, JSON.stringify(current));
}

function withTimeout(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => window.clearTimeout(timer) };
}

export async function probeConnectionUrl(
  url: string,
  timeoutMs = 8_000,
  expectDataService = false,
): Promise<void> {
  const timeout = withTimeout(timeoutMs);
  try {
    const target = classifyUrl(url) === "arcgis" ? `${normalizeArcgisLayerUrl(url)}?f=json` : url;
    const response = await fetch(target, {
      cache: "no-store",
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    const contentType = response.headers.get("content-type") ?? "";
    if (
      classifyUrl(url) === "arcgis" ||
      contentType.includes("json") ||
      /\/styles\//i.test(url) ||
      expectDataService
    ) {
      const json = (await response.json()) as {
        error?: { message?: string };
        version?: number;
        features?: unknown[];
      };
      if (json.error) throw new Error(json.error.message ?? "The service returned an error");
      if (/\/styles\//i.test(url) && json.version !== 8)
        throw new Error("The endpoint did not return a MapLibre style");
      if (expectDataService && classifyUrl(url) !== "arcgis" && !Array.isArray(json.features))
        throw new Error("The URL is reachable, but it is not an ArcGIS layer or GeoJSON service");
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    throw error;
  } finally {
    timeout.clear();
  }
}

async function checkTarget(target: ConnectionTarget): Promise<ConnectionResult> {
  try {
    await probeConnectionUrl(target.url);
    if (target.basemapId) setBasemapFallback(target.basemapId, false);
    return {
      ...target,
      status: "healthy",
      message: "Connection verified",
    };
  } catch (primaryError) {
    if (target.fallbackUrl) {
      try {
        await probeConnectionUrl(target.fallbackUrl);
        if (target.basemapId) setBasemapFallback(target.basemapId, true);
        return {
          ...target,
          status: "fallback",
          effectiveUrl: target.fallbackUrl,
          message: "Preferred provider is unavailable; an equivalent fallback is active",
        };
      } catch {
        // Report the preferred connection error below; the UI offers a repair clue form.
      }
    }
    return {
      ...target,
      status: "error",
      message: primaryError instanceof Error ? primaryError.message : "Connection failed",
    };
  }
}

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function checkProjectConnections(
  layers: GisLayer[],
  connectionHints: Record<string, ConnectionRecoveryHint> = {},
): Promise<ConnectionResult[]> {
  const targets: ConnectionTarget[] = basemaps.map((basemap) => ({
    id: `basemap:${basemap.id}`,
    name: `${basemap.label} basemap`,
    kind: "basemap",
    url: basemap.healthUrl,
    ...(basemap.fallbackHealthUrl ? { fallbackUrl: basemap.fallbackHealthUrl } : {}),
    basemapId: basemap.id,
  }));

  for (const entry of catalog) {
    const cloudOverride = connectionHints[`catalog:${entry.id}`];
    const url = cloudOverride?.verified ? cloudOverride.url : resolveCatalogUrl(entry);
    if (!url) continue;
    targets.push({
      id: `catalog:${entry.id}`,
      name: entry.name,
      kind: "public-data",
      url,
      ...(entry.sourcePage ? { sourcePage: entry.sourcePage } : {}),
    });
  }

  for (const layer of layers) {
    if (layer.source.kind !== "remote" || layer.source.catalogId) continue;
    if (classifyUrl(layer.source.url) !== "arcgis") continue;
    targets.push({
      id: `layer:${layer.id}`,
      name: layer.name,
      kind: "project-layer",
      url: layer.source.url,
    });
  }

  const unique = [...new Map(targets.map((target) => [target.id, target])).values()];
  return mapWithLimit(unique, 4, checkTarget);
}
