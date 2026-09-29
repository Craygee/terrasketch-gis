import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { WeatherBundle, WeatherPointRequest } from "./types";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const session = {
  access_token: "current-access-token",
  refresh_token: "current-refresh-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "weather-user" },
};

before(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => JSON.stringify(session),
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    },
  });
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
  else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

const bundle = {} as WeatherBundle;
const point = { latitude: 41, longitude: -96 } as WeatherPointRequest;

test("weather refresh authenticates and repairs an expired access cookie", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (calls.length === 1) return new Response("restricted", { status: 403 });
    if (calls.length === 2) return Response.json({ allowed: true, active: true });
    return Response.json(bundle);
  };

  const { getWeatherAtPoint } = await import("./api.ts");
  assert.deepEqual(await getWeatherAtPoint({ data: point }), bundle);
  assert.deepEqual(
    calls.map(({ url }) => url),
    ["/api/weather/point", "/api/access/session?module=weather.core", "/api/weather/point"],
  );
  assert.equal(
    new Headers(calls[0]?.init?.headers).get("authorization"),
    "Bearer current-access-token",
  );
  assert.equal(calls[0]?.init?.credentials, "same-origin");
});

test("weather refresh retries one transient gateway failure", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return attempts === 1 ? new Response("temporary", { status: 503 }) : Response.json(bundle);
  };

  const { getWeatherAtPoint } = await import("./api.ts");
  assert.deepEqual(await getWeatherAtPoint({ data: point }), bundle);
  assert.equal(attempts, 2);
});
