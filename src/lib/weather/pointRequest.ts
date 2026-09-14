import type { WeatherPointRequest } from "./types.ts";
import { normalizeRequestedLayers } from "./layerRequests.ts";

export function validatePoint(input: unknown): WeatherPointRequest {
  if (!input || typeof input !== "object") throw new Error("A map point is required");
  const value = input as Record<string, unknown>;
  const latitude = Number(value["latitude"]);
  const longitude = Number(value["longitude"]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
    throw new Error("Latitude must be between -90 and 90");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    throw new Error("Longitude must be between -180 and 180");
  const requestedLayerIds = normalizeRequestedLayers(value["requestedLayerIds"]);

  return {
    ...(Array.isArray(value["mapCenter"]) &&
    value["mapCenter"].length === 2 &&
    typeof value["mapCenter"][0] === "number" &&
    Number.isFinite(value["mapCenter"][0]) &&
    Math.abs(value["mapCenter"][0]) <= 180 &&
    typeof value["mapCenter"][1] === "number" &&
    Number.isFinite(value["mapCenter"][1]) &&
    Math.abs(value["mapCenter"][1]) <= 90
      ? { mapCenter: value["mapCenter"] as [number, number] }
      : {}),
    ...(typeof value["radarSiteId"] === "string" && /^[A-Z0-9]{4}$/.test(value["radarSiteId"])
      ? { radarSiteId: value["radarSiteId"] }
      : {}),
    ...(Number.isInteger(value["radarTilt"]) &&
    Number(value["radarTilt"]) >= 0 &&
    Number(value["radarTilt"]) <= 3
      ? { radarTilt: Number(value["radarTilt"]) }
      : {}),
    latitude,
    longitude,
    ...(typeof value["photographyStormId"] === "string" && value["photographyStormId"].length <= 150
      ? { photographyStormId: value["photographyStormId"] }
      : {}),
    ...(requestedLayerIds?.length ? { requestedLayerIds } : {}),
  };
}
