import { createServerFn } from "@tanstack/react-start";
import type { WeatherPointRequest } from "./types";

function validatePoint(input: unknown): WeatherPointRequest {
  if (!input || typeof input !== "object") throw new Error("A map point is required");
  const value = input as Record<string, unknown>;
  const latitude = Number(value["latitude"]);
  const longitude = Number(value["longitude"]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
    throw new Error("Latitude must be between -90 and 90");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    throw new Error("Longitude must be between -180 and 180");
  return { latitude, longitude };
}

export const getWeatherAtPoint = createServerFn({ method: "GET" })
  .inputValidator(validatePoint)
  .handler(async ({ data }) => {
    const { loadWeatherBundle } = await import("./gateway.server");
    return loadWeatherBundle(data);
  });
