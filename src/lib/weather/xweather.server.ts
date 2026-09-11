import { sourceMetadata } from "./normalize.ts";
import type {
  RadarFrame,
  WeatherPointRequest,
  WeatherProviderHealth,
  WeatherRasterFrame,
  WeatherTemporalKind,
} from "./types.ts";
import { XWEATHER_ADDITIONAL_LAYERS } from "./xweatherCatalog.ts";

type XweatherBindings = Record<string, unknown>;

type XweatherRasterLayer = {
  providerLayer: string;
  product: string;
  coverage: string;
  resolution: string;
  updateMinutes: number;
  cacheSeconds: number;
  maxFrames: number;
  offsets?: string[];
  costMultiplier: number;
};

const processEnv = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;

const XWEATHER_RASTER_LAYERS: Record<string, XweatherRasterLayer> = {
  "radar-global": {
    providerLayer: "radar-global",
    product: "global radar / satellite-derived precipitation mosaic",
    coverage: "Global; satellite-derived precipitation may be used where radar is unavailable",
    resolution: "Provider-dependent global mosaic",
    updateMinutes: 2,
    cacheSeconds: 60,
    maxFrames: 8,
    costMultiplier: 1,
  },
  "satellite-geocolor": {
    providerLayer: "satellite-geocolor",
    product: "GeoColor global satellite imagery",
    coverage: "Global",
    resolution: "Provider regional satellite mosaic",
    updateMinutes: 10,
    cacheSeconds: 300,
    maxFrames: 6,
    costMultiplier: 1,
  },
  satellite: {
    providerLayer: "satellite",
    product: "global infrared satellite imagery",
    coverage: "Global",
    resolution: "Provider regional satellite mosaic",
    updateMinutes: 15,
    cacheSeconds: 300,
    maxFrames: 6,
    costMultiplier: 1,
  },
  "satellite-infrared-color": {
    providerLayer: "satellite-infrared-color",
    product: "color infrared cloud-top imagery",
    coverage: "Global; cadence varies by region",
    resolution: "Provider regional satellite mosaic",
    updateMinutes: 15,
    cacheSeconds: 300,
    maxFrames: 6,
    costMultiplier: 1,
  },
  "satellite-visible": {
    providerLayer: "satellite-visible",
    product: "visible satellite imagery",
    coverage: "North America, Central America, eastern Pacific and western Atlantic",
    resolution: "Provider regional satellite mosaic",
    updateMinutes: 15,
    cacheSeconds: 300,
    maxFrames: 6,
    costMultiplier: 1,
  },
  "satellite-water-vapor": {
    providerLayer: "satellite-water-vapor",
    product: "water-vapor satellite imagery",
    coverage: "North America, Central America, eastern Pacific and western Atlantic",
    resolution: "Provider regional satellite mosaic",
    updateMinutes: 15,
    cacheSeconds: 300,
    maxFrames: 6,
    costMultiplier: 1,
  },
  "lightning-flash": {
    providerLayer: "lightning-flash",
    product: "global cloud-to-ground and intracloud flashes",
    coverage: "Global",
    resolution: "Aggregated flash locations; latest five-minute window",
    updateMinutes: 5,
    cacheSeconds: 60,
    maxFrames: 1,
    costMultiplier: 1,
  },
  ...Object.fromEntries(
    XWEATHER_ADDITIONAL_LAYERS.map((item) => [
      item.providerLayer,
      {
        providerLayer: item.providerLayer,
        product: item.product,
        coverage: item.coverage,
        resolution: item.resolution,
        updateMinutes: item.updateMinutes,
        cacheSeconds: item.cacheSeconds,
        maxFrames: item.offsets.length,
        offsets: item.offsets,
        costMultiplier: item.costMultiplier,
      } satisfies XweatherRasterLayer,
    ]),
  ),
};

const LANDDRAFT_XWEATHER_LAYERS: Record<
  string,
  { providerLayer: keyof typeof XWEATHER_RASTER_LAYERS; temporalKind: WeatherTemporalKind }
> = {
  "weather.satellite.clouds": {
    providerLayer: "satellite-infrared-color",
    temporalKind: "observed",
  },
  "weather.satellite.true-color": {
    providerLayer: "satellite-geocolor",
    temporalKind: "observed",
  },
  "weather.satellite.infrared": { providerLayer: "satellite", temporalKind: "observed" },
  "weather.satellite.water-vapor": {
    providerLayer: "satellite-water-vapor",
    temporalKind: "observed",
  },
  "weather.lightning.recent": { providerLayer: "lightning-flash", temporalKind: "observed" },
  ...Object.fromEntries(
    XWEATHER_ADDITIONAL_LAYERS.map((item) => [
      item.id,
      {
        providerLayer: item.providerLayer,
        temporalKind: item.temporalKind,
      },
    ]),
  ),
};

type XweatherRuntimeStatus = {
  lastSuccess?: string | undefined;
  lastError?: string | undefined;
  latencyMs?: number | undefined;
};

const runtimeStatus: XweatherRuntimeStatus = {};

function bindingValue(bindings: unknown, name: string) {
  if (!bindings || typeof bindings !== "object") return undefined;
  const value = (bindings as XweatherBindings)[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function xweatherCredentials(bindings?: unknown) {
  const clientId =
    bindingValue(bindings, "XWEATHER_CLIENT_ID") ?? processEnv?.["XWEATHER_CLIENT_ID"];
  const clientSecret =
    bindingValue(bindings, "XWEATHER_CLIENT_SECRET") ?? processEnv?.["XWEATHER_CLIENT_SECRET"];
  if (!clientId?.trim() || !clientSecret?.trim()) return null;
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
}

export function xweatherConfigured(bindings?: unknown) {
  return Boolean(xweatherCredentials(bindings));
}

function frameOffsets(layer: XweatherRasterLayer) {
  if (layer.offsets?.length) return layer.offsets;
  return Array.from({ length: layer.maxFrames }, (_, index) =>
    index === 0 ? "current" : `-${index * layer.updateMinutes}minutes`,
  ).reverse();
}

function offsetTime(offset: string, now: Date) {
  if (offset === "current" || offset === "latest") return now.toISOString();
  const match = /^([+-])(\d+)(minute|minutes|hour|hours|day|days)$/.exec(offset);
  if (!match) return now.toISOString();
  const amount = Number(match[2]);
  const multiplier = match[3]!.startsWith("minute")
    ? 60_000
    : match[3]!.startsWith("hour")
      ? 60 * 60_000
      : 24 * 60 * 60_000;
  return new Date(now.getTime() + (match[1] === "+" ? 1 : -1) * amount * multiplier).toISOString();
}

export function xweatherTileTemplate(providerLayer: string, offset: string) {
  return `/api/weather/xweather/tiles/${encodeURIComponent(providerLayer)}/{z}/{x}/{y}/${offset}.png`;
}

function xweatherSource(
  layer: XweatherRasterLayer,
  timestamp: string,
  temporalKind: WeatherTemporalKind,
) {
  return sourceMetadata({
    providerId: "xweather-raster",
    providerName: "Vaisala Xweather Raster Maps",
    product: layer.product,
    temporalKind,
    validTime: timestamp,
    resolution: layer.resolution,
    quality: "moderate",
    qualityFlags: ["PROVIDER_FRAME_TIME_NOT_EXPOSED", "REQUESTED_TIME_APPROXIMATE"],
    rawSourceReference: "https://www.xweather.com/docs/maps/layers",
    attribution: "Weather data and imagery © Vaisala Xweather",
  });
}

export function xweatherRasterFramesFor(
  request: WeatherPointRequest,
  now = new Date(),
): WeatherRasterFrame[] {
  if (!xweatherConfigured()) return [];
  const requested = new Set(request.requestedLayerIds ?? []);
  return Object.entries(LANDDRAFT_XWEATHER_LAYERS).flatMap(([layerId, mapping]) => {
    if (!requested.has(layerId)) return [];
    const layer = XWEATHER_RASTER_LAYERS[mapping.providerLayer];
    if (!layer) return [];
    return frameOffsets(layer).map((offset) => {
      const timestamp = offsetTime(offset, now);
      return {
        id: `xweather-${layerId}-${offset}`,
        layerId,
        timestamp,
        tileUrlTemplate: xweatherTileTemplate(layer.providerLayer, offset),
        coverage: layer.coverage,
        source: xweatherSource(layer, timestamp, mapping.temporalKind),
      };
    });
  });
}

export function xweatherRadarFrames(now = new Date()): RadarFrame[] {
  if (!xweatherConfigured()) return [];
  const layer = XWEATHER_RASTER_LAYERS["radar-global"]!;
  return frameOffsets(layer).map((offset) => {
    const timestamp = offsetTime(offset, now);
    return {
      id: `xweather-radar-global-${offset}`,
      timestamp,
      tileUrlTemplate: xweatherTileTemplate(layer.providerLayer, offset),
      coverage: "global",
      source: xweatherSource(layer, timestamp, "estimated"),
    };
  });
}

export function xweatherProviderHealth(): WeatherProviderHealth {
  const configured = xweatherConfigured();
  const status = !configured
    ? "not-configured"
    : runtimeStatus.lastSuccess
      ? "up"
      : runtimeStatus.lastError
        ? "down"
        : "degraded";
  return {
    providerId: "xweather-raster",
    providerName: "Vaisala Xweather Raster Maps",
    status,
    products: [
      "global radar",
      "satellite imagery",
      "current conditions and wind",
      "forecast and outlook imagery",
      "severe weather and lightning",
      "air quality, fire, maritime and tropical imagery",
    ],
    coverage: "Global with product-specific regional limitations",
    ...(runtimeStatus.latencyMs !== undefined ? { latencyMs: runtimeStatus.latencyMs } : {}),
    ...(runtimeStatus.lastSuccess ? { lastSuccessfulRequest: runtimeStatus.lastSuccess } : {}),
    ...(!configured
      ? { error: "Preview/production Xweather credentials are not configured" }
      : runtimeStatus.lastError
        ? { error: runtimeStatus.lastError }
        : !runtimeStatus.lastSuccess
          ? { error: "Configured; awaiting the first proxied map tile" }
          : {}),
    costClass: "commercial",
  };
}

function tileRequestParts(url: URL) {
  const match =
    /^\/api\/weather\/xweather\/tiles\/([a-z0-9-]+)\/(\d{1,2})\/(\d+)\/(\d+)\/(current|latest|[+-]\d+(?:minute|minutes|hour|hours|day|days))\.png$/i.exec(
      url.pathname,
    );
  if (!match) return null;
  const [, layerName, zoomText, xText, yText, offset] = match;
  const zoom = Number(zoomText);
  const x = Number(xText);
  const y = Number(yText);
  const layer = layerName ? XWEATHER_RASTER_LAYERS[layerName] : undefined;
  const tileLimit = 2 ** zoom;
  if (
    !layer ||
    !Number.isInteger(zoom) ||
    zoom < 0 ||
    zoom > 20 ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= tileLimit ||
    y >= tileLimit ||
    !offset
  )
    return null;
  return { layer, zoom, x, y, offset };
}

function sameOriginBrowserRequest(request: Request, url: URL) {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && !["same-origin", "same-site"].includes(secFetchSite)) return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return false;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin !== url.origin) return false;
    } catch {
      return false;
    }
  }
  return Boolean(secFetchSite || origin || referer);
}

function plainResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function handleXweatherTileProxy(request: Request, bindings?: unknown) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/weather/xweather/tiles/")) return null;
  if (request.method !== "GET") return plainResponse("Method not allowed", 405);
  const parts = tileRequestParts(url);
  if (!parts) return plainResponse("Invalid weather tile request", 400);
  if (!sameOriginBrowserRequest(request, url)) return plainResponse("Forbidden", 403);
  const credentials = xweatherCredentials(bindings);
  if (!credentials) return plainResponse("Weather provider is not configured", 503);

  const credentialPath = `${credentials.clientId}_${credentials.clientSecret}`;
  const upstreamUrl =
    `https://maps.api.xweather.com/${encodeURIComponent(credentialPath)}/` +
    `${parts.layer.providerLayer}/${parts.zoom}/${parts.x}/${parts.y}/${parts.offset}.png`;
  const startedAt = Date.now();
  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        Accept: "image/png,image/*;q=0.8",
        Referer: `${url.origin}/`,
        "User-Agent": "LandDraftWeather/0.1 (https://landdraft.net)",
      },
    });
    runtimeStatus.latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      runtimeStatus.lastError = `Xweather returned HTTP ${response.status}`;
      return plainResponse("Weather tile is temporarily unavailable", 502);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      runtimeStatus.lastError = "Xweather returned an unexpected response";
      return plainResponse("Weather tile is temporarily unavailable", 502);
    }
    runtimeStatus.lastSuccess = new Date().toISOString();
    runtimeStatus.lastError = undefined;
    const headers = new Headers();
    headers.set("content-type", contentType);
    headers.set(
      "cache-control",
      `public, max-age=${parts.layer.cacheSeconds}, s-maxage=${parts.layer.cacheSeconds}, stale-while-revalidate=60`,
    );
    headers.set("x-landdraft-weather-provider", "xweather-raster");
    headers.set("x-landdraft-weather-cost-multiplier", String(parts.layer.costMultiplier));
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    runtimeStatus.latencyMs = Date.now() - startedAt;
    runtimeStatus.lastError =
      error instanceof Error ? error.message.slice(0, 200) : "Xweather request failed";
    return plainResponse("Weather tile is temporarily unavailable", 502);
  }
}
