import {
  nativeKeyTime,
  nativeRadarKey,
  nativeProduct,
  type NativeRadarFrame,
  type NativeRadarLayer,
} from "./nativeRadar.ts";
import type { WeatherPointRequest } from "./types.ts";
import { nearestWeatherRadarSite, type WeatherRadarSite } from "./radar.ts";
import { weatherProviderEnabled } from "./providerPolicy.server.ts";
import { consumeProviderRequest } from "./providerOperations.server.ts";

export const NATIVE_RADAR_BUCKET = "https://unidata-nexrad-level3.s3.amazonaws.com";
const binaryCache = new Map<string, { bytes: Uint8Array; expires: number }>();
const catalogCache = new Map<string, { keys: string[]; expires: number }>();

export async function discoverNativeRadar(
  request: WeatherPointRequest,
  sites: WeatherRadarSite[],
  signal: AbortSignal,
): Promise<NativeRadarFrame[]> {
  sites = nativeRadarSites(sites);
  const nearest = nearestWeatherRadarSite(sites, request);
  const site = request.radarSiteId
    ? sites.find((s) => s.id === request.radarSiteId)
    : nearest && nearest.distanceKm <= 460
      ? nearest.site
      : undefined;
  if (!site || !/^[A-Z0-9]{4}$/.test(site.id)) return [];
  const now = Date.now();
  const days = [
    ...new Set(
      [now, now - 3600000].map((time) =>
        new Date(time).toISOString().slice(0, 10).replaceAll("-", "_"),
      ),
    ),
  ];
  const requested = (request.requestedLayerIds ?? []).filter((id) => nativeProduct(id)).slice(0, 6);
  const results = await Promise.allSettled(
    requested.map(async (layerId) => {
      const product = nativeProduct(layerId, request.radarTilt ?? 0)!;
      const lists = await Promise.all(
        days.map(async (day) => {
          const prefix = `${site.id.slice(1)}_${product}_${day}`;
          const cached = catalogCache.get(prefix);
          if (cached && cached.expires > now) return cached.keys;
          const response = await fetch(
            `${NATIVE_RADAR_BUCKET}/?list-type=2&prefix=${prefix}&max-keys=1000`,
            { signal },
          );
          if (!response.ok) throw new Error("NOAA radar catalog unavailable");
          const xml = await response.text();
          if (xml.length > 1000000 || xml.includes("<IsTruncated>true</IsTruncated>"))
            throw new Error("Incomplete radar catalog");
          const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
            .map((m) => m[1]!)
            .filter((key) => key.startsWith(prefix) && nativeRadarKey(key));
          if (catalogCache.size >= 100) catalogCache.delete(catalogCache.keys().next().value!);
          catalogCache.set(prefix, { keys, expires: now + 60000 });
          return keys;
        }),
      );
      return lists
        .flat()
        .filter((key) => {
          const time = Date.parse(nativeKeyTime(key) ?? "");
          return time <= now + 60000 && now - time <= 3600000;
        })
        .sort()
        .slice(-6)
        .map((key) => ({
          id: key,
          layerId: layerId as NativeRadarLayer,
          timestamp: nativeKeyTime(key)!,
          binaryUrl: `/api/weather/radar/native/${key}`,
          site,
          product,
        }));
    }),
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

/** TDWR airport radars do not distribute these WSR-88D dual-polarization products. */
export function nativeRadarSites(sites: WeatherRadarSite[]) {
  return sites.filter(
    (site) => /^(?:[KP][A-Z0-9]{3}|TJUA)$/.test(site.id) && !["KCRI", "KBIX"].includes(site.id),
  );
}

export async function handleNativeRadarProxy(
  request: Request,
  bindings?: unknown,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/weather/radar/native/")) return null;
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!weatherProviderEnabled("nexrad", bindings))
    return new Response("Radar provider disabled", { status: 503 });
  const key = path.slice("/api/weather/radar/native/".length),
    time = Date.parse(nativeKeyTime(key) ?? "");
  if (
    !nativeRadarKey(key) ||
    !Number.isFinite(time) ||
    time > Date.now() + 60000 ||
    Date.now() - time > 7200000
  )
    return new Response("Radar scan unavailable", { status: 400 });
  if (
    !consumeProviderRequest(`radar:${request.headers.get("cf-connecting-ip") ?? "local"}`, "tile")
  )
    return new Response("Radar request limit reached", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  let bytes = binaryCache.get(key)?.bytes;
  if ((binaryCache.get(key)?.expires ?? 0) < Date.now()) bytes = undefined;
  if (!bytes) {
    try {
      const upstream = await fetch(`${NATIVE_RADAR_BUCKET}/${key}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!upstream.ok || !upstream.body)
        return new Response("NOAA scan unavailable", { status: 502 });
      const reader = upstream.body.getReader(),
        parts: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > 2000000) {
            await reader.cancel();
            throw new Error("Scan size limit");
          }
          parts.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
      }
      if (binaryCache.size >= 16) binaryCache.delete(binaryCache.keys().next().value!);
      binaryCache.set(key, { bytes, expires: Date.now() + 120000 });
    } catch {
      return new Response("NOAA scan unavailable", { status: 502 });
    }
  }
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "X-Radar-Source": "NOAA NEXRAD Level III",
    },
  });
}
