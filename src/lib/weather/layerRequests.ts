import { WEATHER_LAYER_ID_PATTERN } from "./types.ts";
// Accommodate the full catalog, while bounding untrusted requests and removing duplicates.
export const WEATHER_REQUEST_LAYER_LIMIT = 100;
export function normalizeRequestedLayers(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return [
    ...new Set(
      input.filter(
        (id): id is string =>
          typeof id === "string" && id.length <= 100 && WEATHER_LAYER_ID_PATTERN.test(id),
      ),
    ),
  ].slice(0, WEATHER_REQUEST_LAYER_LIMIT);
}
