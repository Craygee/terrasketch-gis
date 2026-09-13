import { weatherLayerRegistry } from "./registry.ts";
import { SPC_PRODUCTS } from "./spcCatalog.ts";
export interface WeatherProduct {
  id: string;
  layerId: string;
  providerId: string;
  providerProduct: string;
  connectionType: "INCLUDED_PUBLIC" | "USER_BYOK" | "LANDDRAFT_ANALYSIS";
  updateIntervalSeconds: number | null;
  staleAfterSeconds: number;
  coverage: string;
  adapterStatus: "implemented" | "planned";
}
const publicProducts: Record<string, [string, string, number]> = {
  ...Object.fromEntries(
    SPC_PRODUCTS.map((product) => [
      product.layerId,
      ["spc", product.productId, 600] as [string, string, number],
    ]),
  ),
  "weather.current": ["nws", "observation", 3600],
  "weather.radar.simple": ["mrms", "composite-reflectivity", 600],
  "weather.radar.pro.reflectivity": ["nexrad", "ridge-base-reflectivity", 600],
  "weather.radar.pro.velocity": ["nexrad", "ridge-base-velocity", 600],
  "weather.radar.pro.hydrometeor": ["nexrad", "ridge-hydrometeor", 600],
  "weather.satellite.clouds": ["goes", "longwave-imagery", 1800],
  "weather.satellite.true-color": ["goes", "visible-imagery", 1800],
  "weather.satellite.infrared": ["goes", "longwave-imagery", 1800],
  "weather.satellite.water-vapor": ["goes", "water-vapor-imagery", 1800],
  "weather.satellite.cloud-top": ["nasa-gibs", "modis-cloud-top-temperature", 172800],
  "weather.satellite.smoke": ["nws", "smoke-guidance", 14400],
  "weather.wind.surface": ["nws", "ndfd-wind", 14400],
  "weather.lightning.recent": ["nowcoast-lightning", "strike-density", 1800],
  "weather.severe.alerts": ["nws", "alerts", 300],
  "weather.severe.intelligence": ["mrms", "probsevere-v3", 600],
  "weather.severe.reports": ["iem", "nws-local-storm-reports", 1800],
  "weather.metar": ["awc", "metar", 7200],
  "weather.forecast.precipitation": ["nws", "ndfd-qpf", 14400],
  "weather.surface": ["nws", "ndfd-temperature", 14400],
  "weather.tropical": ["nws", "nhc-summary", 21600],
  "weather.winter": ["nws", "wssi", 21600],
  "weather.fire": ["spc", "fire-outlook", 86400],
  "weather.air-quality": ["nws", "smoke-guidance", 14400],
  "weather.photo": ["landdraft", "photography-candidates", 300],
  "weather.storm_chaser.spotters": ["landdraft", "opt-in-presence", 600],
};
export const weatherProductRegistry: WeatherProduct[] = weatherLayerRegistry.map((layer) => {
  const commercial = layer.providerProducts.find((product) => product.startsWith("xweather:"));
  const publicProduct = publicProducts[layer.id];
  return {
    id: layer.id,
    layerId: layer.id,
    providerId: commercial ? "xweather" : (publicProduct?.[0] ?? "unassigned"),
    providerProduct: commercial?.slice(9) ?? publicProduct?.[1] ?? layer.providerProducts[0]!,
    connectionType: commercial
      ? "USER_BYOK"
      : publicProduct?.[0] === "landdraft"
        ? "LANDDRAFT_ANALYSIS"
        : "INCLUDED_PUBLIC",
    updateIntervalSeconds: null,
    staleAfterSeconds: publicProduct?.[2] ?? 900,
    coverage: layer.coverage ?? "Coverage is checked against returned provider data",
    adapterStatus: commercial || publicProduct ? "implemented" : "planned",
  };
});
export const weatherProduct = (id: string) =>
  weatherProductRegistry.find((item) => item.layerId === id);
