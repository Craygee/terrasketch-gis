import type { WeatherBundle, WeatherPointRequest } from "./types";
import { getCloudSession, readCloudSession } from "../cloud.ts";

const RETRYABLE_STATUS = new Set([502, 503, 504]);

async function accessToken(): Promise<string | null> {
  if (!readCloudSession()) return null;
  try {
    return (await getCloudSession()).access_token;
  } catch {
    return null;
  }
}

async function openWeatherSession(token: string, signal?: AbortSignal): Promise<boolean> {
  const response = await fetch("/api/access/session?module=weather.core", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "same-origin",
    cache: "no-store",
    signal: signal ?? null,
  });
  return response.ok;
}

function weatherError(response: Response): Error {
  if (response.status === 401 || response.status === 403)
    return new Error("Weather access needs to be refreshed. Reload the page or sign in again.");
  if (response.status === 429)
    return new Error("Weather requests are temporarily limited. Try again shortly.");
  if (RETRYABLE_STATUS.has(response.status))
    return new Error("Weather sources are temporarily unavailable. Use Refresh weather to retry.");
  return new Error("Weather data did not load. Use Refresh weather to retry.");
}

/** Stable JSON transport avoids stale server-function identifiers and an extra serialization pass. */
export async function getWeatherAtPoint({
  data,
  signal,
}: {
  data: WeatherPointRequest;
  signal?: AbortSignal;
}): Promise<WeatherBundle> {
  const body = JSON.stringify(data);
  let token = await accessToken();
  const request = () =>
    fetch("/api/weather/point", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "same-origin",
      body,
      signal: signal ?? null,
    });

  let response = await request();
  if ((response.status === 401 || response.status === 403) && token) {
    token = await accessToken();
    if (token && (await openWeatherSession(token, signal))) response = await request();
  } else if (RETRYABLE_STATUS.has(response.status)) {
    response = await request();
  }

  if (!response.ok) throw weatherError(response);
  return response.json() as Promise<WeatherBundle>;
}
