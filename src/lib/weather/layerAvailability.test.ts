import assert from "node:assert/strict";
import test from "node:test";
import { layerAvailability, layerHasUsableData } from "./layerAvailability.ts";
import type { WeatherBundle } from "./types.ts";
import { parseSpcOutlook } from "./spc.ts";
const empty: WeatherBundle = {
  request: { latitude: 32, longitude: -102 },
  generatedAt: "2026-09-13T12:00:00Z",
  current: null,
  forecast: [],
  alerts: [],
  stormObjects: [],
  radarFrames: [],
  rasterFrames: [],
  stationObservations: [],
  chaserPositions: [],
  stormReports: [],
  photography: null,
  providerHealth: [],
  warnings: [],
  coverage: {
    nws: true,
    radar: false,
    globalForecast: false,
    satellite: false,
    lightningDensity: false,
  },
};
test("SPC availability requires fresh validated data and respects its independent kill switch", () => {
  const now = Date.parse(empty.generatedAt);
  const outlook = parseSpcOutlook(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-100, 35],
                [-99, 35],
                [-99, 36],
                [-100, 35],
              ],
            ],
          },
          properties: {
            ISSUE_ISO: "2026-09-13T11:00:00Z",
            VALID_ISO: "2026-09-13T12:00:00Z",
            EXPIRE_ISO: "2026-09-14T12:00:00Z",
            LABEL: "TSTM",
            fill: "#C1E9C1",
            stroke: "#55BB55",
          },
        },
      ],
    },
    1,
    now,
  );
  const bundle = { ...empty, spcOutlooks: [outlook] };
  assert.equal(layerAvailability(outlook.layerId, bundle, { connected: false }, now).ready, true);
  assert.equal(
    layerAvailability(
      outlook.layerId,
      { ...bundle, generatedAt: new Date(now + 601_000).toISOString() },
      { connected: false },
      now + 601_000,
    ).state,
    "stale",
  );
  assert.equal(
    layerAvailability(
      outlook.layerId,
      {
        ...bundle,
        providerControls: {
          disabledProviders: ["spc"],
          disabledFeatures: [],
          configurationValid: true,
        },
      },
      { connected: false },
      now,
    ).state,
    "disabled",
  );
  assert.equal(layerAvailability(outlook.layerId, empty, { connected: false }, now).ready, false);
});
test("invalid, future and stale retrieval times cannot enable official layers", () => {
  const bundle: WeatherBundle = {
    ...empty,
    providerHealth: [
      {
        providerId: "nws-alerts",
        providerName: "NWS",
        status: "up",
        products: ["alerts"],
        coverage: "US",
        costClass: "public",
      },
    ],
  };
  const now = Date.parse(empty.generatedAt);
  assert.equal(
    layerAvailability("weather.severe.alerts", bundle, { connected: false }, now).ready,
    true,
  );
  for (const generatedAt of ["invalid", "2026-09-14T12:00:00Z", "2026-09-12T12:00:00Z"]) {
    assert.equal(
      layerAvailability(
        "weather.severe.alerts",
        { ...bundle, generatedAt },
        { connected: false },
        now,
      ).state,
      "stale",
    );
  }
});
test("registered or requested products are not automatically usable", () => {
  assert.equal(layerHasUsableData(null, "weather.radar.simple"), false);
  assert.equal(layerHasUsableData(empty, "weather.severe.alerts"), false);
  assert.equal(layerHasUsableData(empty, "weather.photo"), false);
});
test("reviewed model fallback survives primary outage without implying official alerts", () => {
  const bundle: WeatherBundle = {
    ...empty,
    providerControls: {
      disabledProviders: ["nws", "mrms"],
      disabledFeatures: [],
      configurationValid: true,
    },
    current: {
      id: "met-fixture",
      location: {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-102, 32] },
        properties: {},
      },
      source: {
        providerId: "met-norway",
        providerName: "MET Norway",
        product: "Locationforecast",
        temporalKind: "model",
        receivedTimestamp: empty.generatedAt,
        validTime: empty.generatedAt,
        quality: "moderate",
        qualityFlags: [],
        attribution: "MET Norway",
      },
    },
  };
  const now = Date.parse(empty.generatedAt);
  assert.equal(layerAvailability("weather.current", bundle, { connected: false }, now).ready, true);
  assert.equal(
    layerAvailability("weather.severe.alerts", bundle, { connected: false }, now).ready,
    false,
  );
  bundle.providerControls!.disabledProviders.push("met-norway");
  assert.equal(
    layerAvailability("weather.current", bundle, { connected: false }, now).state,
    "disabled",
  );
});
test("healthy empty warning feeds are usable; failed warning requests are not", () => {
  const bundle: WeatherBundle = {
    ...empty,
    providerHealth: [
      {
        providerId: "nws",
        providerName: "NWS",
        status: "up",
        products: ["alerts"],
        coverage: "US",
        costClass: "public",
      },
    ],
  };
  assert.equal(layerHasUsableData(bundle, "weather.severe.alerts"), true);
  bundle.providerHealth.push({
    ...bundle.providerHealth[0]!,
    providerId: "nws-alerts",
    status: "down",
  });
  assert.equal(layerHasUsableData(bundle, "weather.severe.alerts"), false);
});

test("a completed photography assessment with no target is not a connection failure", () => {
  const bundle: WeatherBundle = {
    ...empty,
    photography: {
      status: "no-severe-target",
      validTime: empty.generatedAt,
      zones: [],
      targetDescription: "No target",
      methodology: "Official alert geometry",
      limitations: [],
    },
  };
  const result = layerAvailability(
    "weather.photo",
    bundle,
    { connected: false },
    Date.parse(empty.generatedAt),
  );
  assert.equal(result.ready, true);
  assert.match(result.label, /no storm target/);
});
test("reviewed latest-image fallback remains usable with its missing timestamp disclosed", () => {
  const bundle: WeatherBundle = {
    ...empty,
    rasterFrames: [
      {
        id: "latest",
        layerId: "weather.satellite.clouds",
        timestamp: empty.generatedAt,
        tileUrlTemplate: "https://example.invalid/tile",
        coverage: "US",
        source: {
          providerId: "goes",
          providerName: "NOAA",
          product: "infrared",
          temporalKind: "observed",
          receivedTimestamp: empty.generatedAt,
          quality: "moderate",
          qualityFlags: ["LATEST_FRAME_TIME_UNVERIFIED"],
          attribution: "NOAA",
        },
      },
    ],
  };
  const result = layerAvailability(
    "weather.satellite.clouds",
    bundle,
    { connected: false },
    Date.parse(empty.generatedAt),
  );
  assert.equal(result.ready, true);
  assert.match(result.label, /source time unavailable/);
  bundle.rasterFrames[0]!.source.qualityFlags = [];
  assert.equal(
    layerAvailability(
      "weather.satellite.clouds",
      bundle,
      { connected: false },
      Date.parse(empty.generatedAt),
    ).ready,
    false,
  );
});

test("predictive availability uses displayed storm data while reporting degraded feed health", () => {
  const now = Date.parse(empty.generatedAt);
  const bundle = {
    ...empty,
    stormObjects: [{ observedAt: empty.generatedAt }],
    providerHealth: [{ providerId: "noaa-probsevere-v3", status: "degraded" }],
  } as WeatherBundle;
  const state = layerAvailability("weather.severe.intelligence", bundle, { connected: false }, now);
  assert.equal(state.ready, true);
  assert.match(state.label, /delayed/);
  assert.equal(
    layerAvailability(
      "weather.severe.intelligence",
      { ...bundle, stormObjects: [{ observedAt: "2026-09-13T10:00:00Z" }] } as WeatherBundle,
      { connected: false },
      now,
    ).state,
    "stale",
  );
});
test("source ProbSevere empty results are valid and expired source times are not ready", () => {
  const bundle = {
    ...empty,
    probSevereSource: {
      timestamp: empty.generatedAt,
      data: { type: "FeatureCollection" as const, features: [] },
    },
  };
  assert.equal(
    layerAvailability(
      "weather.severe.probsevere",
      bundle,
      { connected: false },
      Date.parse(empty.generatedAt),
    ).ready,
    true,
  );
  assert.equal(
    layerAvailability(
      "weather.severe.probsevere",
      {
        ...bundle,
        probSevereSource: { ...bundle.probSevereSource, timestamp: "2026-09-13T10:00:00Z" },
      },
      { connected: false },
      Date.parse(empty.generatedAt),
    ).state,
    "stale",
  );
});
