import type { WeatherBundle, WeatherPointRequest } from "./types";
/** Stable JSON transport avoids stale server-function identifiers and an extra serialization pass. */
export async function getWeatherAtPoint({
  data,
  signal,
}: {
  data: WeatherPointRequest;
  signal?: AbortSignal;
}): Promise<WeatherBundle> {
  const response = await fetch("/api/weather/point", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: signal ?? null,
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Weather requests are temporarily limited. Try again shortly."
        : "Weather data did not load. Use Refresh weather to retry.",
    );
  return response.json() as Promise<WeatherBundle>;
}
