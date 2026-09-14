import {
  RAINFALL_SERVICE,
  rainfallFrames,
  type RainfallCatalogItem,
  rainfallSample,
} from "./publicRainfall.ts";
import type { WeatherPointRequest } from "./types.ts";

export async function loadPublicRainfall(request: WeatherPointRequest, signal: AbortSignal) {
  const requested =
    request.requestedLayerIds?.filter((id) => id.startsWith("weather.rainfall.")) ?? [];
  if (!requested.length) return [];
  const json = async (url: string) => {
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`NOAA rainfall HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error("NOAA rainfall request unavailable");
    return payload;
  };
  const query = new URLSearchParams({
    f: "json",
    where: "1=1",
    outFields: "objectid,idp_subset,idp_validendtime",
    returnGeometry: "false",
    geometry: JSON.stringify({
      x: request.longitude,
      y: request.latitude,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
  });
  const catalog = await json(`${RAINFALL_SERVICE}/query?${query}`);
  if (!Array.isArray(catalog.features) || catalog.exceededTransferLimit)
    throw new Error("Incomplete NOAA rainfall catalog");
  const frames = rainfallFrames(catalog.features as RainfallCatalogItem[], requested);
  return Promise.all(
    frames.map(async (frame) => {
      const tile = new URL(frame.tileUrlTemplate);
      const params = new URLSearchParams({
        f: "json",
        geometry: query.get("geometry")!,
        geometryType: "esriGeometryPoint",
        returnFirstValueOnly: "true",
        mosaicRule: tile.searchParams.get("mosaicRule")!,
        renderingRule: JSON.stringify({ rasterFunction: "None" }),
        interpolation: "RSP_NearestNeighbor",
      });
      try {
        const result = await json(`${RAINFALL_SERVICE}/getSamples?${params}`);
        const value = rainfallSample(result.samples?.[0]?.value);
        return {
          ...frame,
          pointSample: {
            longitude: request.longitude,
            latitude: request.latitude,
            value: value ?? null,
            units: "in",
          },
        };
      } catch {
        return {
          ...frame,
          pointSample: {
            longitude: request.longitude,
            latitude: request.latitude,
            value: null,
            units: "in",
          },
        };
      }
    }),
  );
}
