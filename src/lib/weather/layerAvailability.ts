import type { WeatherBundle } from "./types.ts";
import { weatherProduct } from "./productRegistry.ts";
import { publicProviderPermitted } from "./providerRegistry.ts";
import { spcCurrent } from "./spc.ts";
import { nativeProduct } from "./nativeRadar.ts";

export interface LayerAvailability {
  ready: boolean;
  label: string;
  canCheck: boolean;
  state:
    | "available"
    | "unverified"
    | "unavailable"
    | "disabled"
    | "license"
    | "connection"
    | "entitlement"
    | "stale";
}
export function layerAvailability(
  id: string,
  bundle: WeatherBundle | null,
  connection: {
    connected: boolean;
    approvedProducts?: string[];
    verifiedProducts?: string[];
    lastTestedAt?: string | undefined;
    error?: string | undefined;
  },
  now = Date.now(),
): LayerAvailability {
  const product = weatherProduct(id);
  const no = (
    state: LayerAvailability["state"],
    label: string,
    canCheck = false,
  ): LayerAvailability => ({ ready: false, state, label, canCheck });
  if (!product || product.adapterStatus === "planned")
    return no("unavailable", "Provider adapter required");
  // The point product may come from the existing reviewed MET Norway fallback.
  // Its availability must not inherit an outage/kill switch from primary NWS.
  const providerId =
    id === "weather.current" && bundle?.current?.source.providerId === "met-norway"
      ? "met-norway"
      : product.providerId;
  if (bundle?.providerControls?.disabledProviders.includes(providerId))
    return no("disabled", "Provider disabled");
  if (product.connectionType === "INCLUDED_PUBLIC" && !publicProviderPermitted(providerId))
    return no("license", "LICENSE REVIEW REQUIRED");
  if (product.connectionType === "USER_BYOK") {
    if (!connection.connected) return no("connection", "Requires Xweather connection");
    if (!connection.approvedProducts?.includes(product.providerProduct))
      return no("license", "LICENSE REVIEW REQUIRED");
    if (connection.error) return no("unavailable", connection.error);
    if (
      !connection.verifiedProducts?.includes(product.providerProduct) ||
      !connection.lastTestedAt ||
      Date.parse(connection.lastTestedAt) > now + 60_000 ||
      now - Date.parse(connection.lastTestedAt) > 300_000 ||
      !Number.isFinite(Date.parse(connection.lastTestedAt))
    )
      return no("entitlement", "Test this product in Data Sources");
  }
  const disabled = bundle?.providerControls?.disabledFeatures ?? [];
  if (
    (product.providerId === "mrms" &&
      id !== "weather.severe.intelligence" &&
      disabled.includes("mrms")) ||
    (product.providerId === "goes" && disabled.includes("goes_satellite")) ||
    (id === "weather.severe.intelligence" && disabled.includes("storm_objects"))
  )
    return no("disabled", "Feature disabled");
  if (!layerHasUsableData(bundle, id))
    return no(
      "unverified",
      bundle?.request.requestedLayerIds?.includes(id)
        ? "No usable data returned here"
        : "Check availability",
      true,
    );
  if (
    id.startsWith("weather.spc.") &&
    !bundle?.spcOutlooks?.some((outlook) => outlook.layerId === id && spcCurrent(outlook, now))
  )
    return no("stale", "SPC outlook expired or needs refresh", true);
  if (
    !bundle ||
    !Number.isFinite(Date.parse(bundle.generatedAt)) ||
    Date.parse(bundle.generatedAt) > now + 60_000 ||
    now - Date.parse(bundle.generatedAt) > product.staleAfterSeconds * 1000
  )
    return no("stale", "Data is stale — refresh", true);
  if (
    nativeProduct(id) &&
    !bundle.nativeRadarFrames?.some(
      (frame) =>
        frame.layerId === id &&
        Number.isFinite(Date.parse(frame.timestamp)) &&
        Date.parse(frame.timestamp) <= now + 60000 &&
        now - Date.parse(frame.timestamp) <= product.staleAfterSeconds * 1000,
    )
  )
    return no("stale", "Radar scan is stale — refresh", true);
  const sources =
    id === "weather.current"
      ? [bundle.current?.source]
      : id === "weather.radar.simple"
        ? bundle.radarFrames.map((frame) => frame.source)
        : bundle.rasterFrames.filter((frame) => frame.layerId === id).map((frame) => frame.source);
  if (
    sources.length &&
    sources.every(
      (source) =>
        !source ||
        source.quality === "stale" ||
        source.quality === "unavailable" ||
        (source.temporalKind === "observed" &&
          (!source.sourceTimestamp ||
            !Number.isFinite(Date.parse(source.sourceTimestamp)) ||
            Date.parse(source.sourceTimestamp) > now + 60_000 ||
            now - Date.parse(source.sourceTimestamp) > product.staleAfterSeconds * 1000)),
    )
  )
    return no("stale", "Source time is stale or unavailable", true);
  return { ready: true, state: "available", label: "Available", canCheck: true };
}

/** Data evidence only: credentials or a registered layer are not proof of data. */
export function layerHasUsableData(bundle: WeatherBundle | null, id: string): boolean {
  if (!bundle) return false;
  const healthy = (providerId: string) =>
    bundle.providerHealth.some(
      (provider) => provider.providerId === providerId && provider.status === "up",
    );
  if (
    bundle.nativeRadarFrames?.some(
      (frame) => frame.layerId === id && Number.isFinite(Date.parse(frame.timestamp)),
    )
  )
    return true;
  if (id === "weather.current") return !!bundle.current;
  if (id === "weather.radar.simple") return bundle.radarFrames.length > 0;
  if (id === "weather.severe.alerts")
    return (
      (healthy("nws-alerts") || (bundle.coverage.nws && healthy("nws"))) &&
      !bundle.providerHealth.some(
        (provider) => provider.providerId === "nws-alerts" && provider.status === "down",
      )
    );
  if (id === "weather.severe.intelligence") return healthy("noaa-probsevere-v3");
  if (id === "weather.severe.reports") return healthy("iem-nws-lsr");
  if (id === "weather.storm_chaser.spotters") return healthy("landdraft-chaser-presence");
  if (id === "weather.metar") return bundle.stationObservations.length > 0;
  if (id === "weather.photo") return !!bundle.photography?.zones.length;
  if (id.startsWith("weather.spc."))
    return !!bundle.spcOutlooks?.some((outlook) => outlook.layerId === id);
  return bundle.rasterFrames.some((frame) => frame.layerId === id);
}
