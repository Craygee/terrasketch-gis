import assert from "node:assert/strict";
import test from "node:test";
import type { Feature, Polygon } from "geojson";
import { buildPhotographyAssessment } from "./photography.server.ts";
import { sourceMetadata } from "./normalize.ts";
import type { WeatherAlert, WeatherObservation } from "./types.ts";

const request = { latitude: 31.997, longitude: -102.078 };
const source = sourceMetadata({
  providerId: "test-provider",
  providerName: "Test provider",
  product: "test product",
  temporalKind: "observed",
  sourceTimestamp: "2026-09-11T20:00:00Z",
  validTime: "2026-09-11T20:00:00Z",
  attribution: "Test only",
});

const polygon: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-103, 31],
        [-101, 31],
        [-101, 33],
        [-103, 33],
        [-103, 31],
      ],
    ],
  },
};

const alert: WeatherAlert = {
  id: "test-alert",
  event: "Severe Thunderstorm Warning",
  headline: "Test warning",
  description: "Test warning description",
  severity: "severe",
  status: "actual",
  geometry: polygon,
  source,
};

const model: WeatherObservation = {
  id: "test-model",
  location: {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [request.longitude, request.latitude] },
  },
  cloudCoverPct: 55,
  windSpeedMS: 5,
  precipitationMm: 0,
  source: { ...source, temporalKind: "model", quality: "estimated" },
};

test("photography analysis refuses to invent a storm target", async () => {
  let called = false;
  const result = await buildPhotographyAssessment(
    request,
    [],
    new AbortController().signal,
    async () => {
      called = true;
      return { alerts: [], current: model };
    },
  );
  assert.equal(result.status, "no-severe-target");
  assert.equal(result.zones.length, 0);
  assert.equal(called, false);
});

test("photography scoring is suppressed when candidate points remain in a severe alert", async () => {
  const result = await buildPhotographyAssessment(
    request,
    [alert],
    new AbortController().signal,
    async () => ({ alerts: [alert], current: model }),
  );
  assert.equal(result.status, "ready");
  assert.equal(result.zones.length, 3);
  assert.ok(result.zones.every((zone) => zone.riskLevel === "high"));
  assert.ok(result.zones.every((zone) => zone.score === null));
});
