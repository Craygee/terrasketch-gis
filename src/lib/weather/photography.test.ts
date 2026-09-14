import assert from "node:assert/strict";
import test from "node:test";
import type { Feature, Polygon } from "geojson";
import { buildPhotographyAssessment, selectPhotographyStorm } from "./photography.server.ts";
import { sourceMetadata } from "./normalize.ts";
import type { StormObject, WeatherAlert, WeatherObservation } from "./types.ts";

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

test("failed candidate warnings never become an all-clear", async () => {
  const result = await buildPhotographyAssessment(
    request,
    [alert],
    new AbortController().signal,
    async () => {
      throw new Error("Warning provider unavailable");
    },
  );
  assert.ok(result.zones.every((zone) => zone.score === null));
  assert.ok(result.zones.every((zone) => zone.riskLevel !== "lower"));
  assert.ok(
    result.zones.every((zone) => zone.cautions.some((text) => text.includes("lookup failed"))),
  );
});

test("favorable weather produces an observation score without claiming route safety", async () => {
  const result = await buildPhotographyAssessment(
    request,
    [],
    new AbortController().signal,
    async () => ({ alerts: [], current: model }),
    tracked("favorable"),
  );
  assert.ok(result.zones.every((zone) => zone.score !== null && zone.riskLevel === "lower"));
  assert.ok(
    result.zones.every((zone) => zone.cautions.some((text) => text.includes("not verified"))),
  );
});

test("exercise alerts cannot create real-world photography targets", async () => {
  const result = await buildPhotographyAssessment(
    request,
    [{ ...alert, status: "exercise" }],
    new AbortController().signal,
    async () => {
      throw new Error("Must not fetch");
    },
  );
  assert.equal(result.status, "no-severe-target");
});

const tracked = (id: string, observedAt = new Date().toISOString()): StormObject =>
  ({
    id,
    title: "Tracked storm " + id,
    observedAt,
    geometry: polygon,
    centroid: model.location,
    source,
  }) as StormObject;
test("a tracked storm supports photography candidates without inventing an official warning", async () => {
  const result = await buildPhotographyAssessment(
    request,
    [],
    new AbortController().signal,
    async () => ({ alerts: [], current: model }),
    tracked("one"),
  );
  assert.equal(result.status, "ready");
  assert.equal(result.zones.length, 3);
  assert.match(result.targetDescription, /NOAA-tracked storm/);
  assert.ok(
    result.zones.every(
      (zone) => zone.activeAlertCount === 0 && zone.riskLevel === "lower" && zone.score !== null,
    ),
  );
});

test("model observation scoring survives an independent warning-feed failure", async () => {
  const result = await buildPhotographyAssessment(
    request,
    [],
    new AbortController().signal,
    async () => ({
      alerts: [],
      current: model,
      alertsAvailable: false,
      conditionsAvailable: true,
    }),
    tracked("partial"),
  );
  assert.ok(result.zones.every((zone) => zone.score !== null && zone.riskLevel === "unknown"));
  assert.ok(
    result.zones.every((zone) =>
      zone.cautions.some((text) => text.includes("warning lookup failed")),
    ),
  );
});
test("photography uses the selected current storm and rejects expired or missing selections", () => {
  const storms = [tracked("near"), tracked("selected"), tracked("old", "2020-01-01T00:00:00Z")];
  assert.equal(
    selectPhotographyStorm(storms, { ...request, photographyStormId: "selected" })?.id,
    "selected",
  );
  assert.equal(
    selectPhotographyStorm(storms, { ...request, photographyStormId: "old" }),
    undefined,
  );
  assert.equal(
    selectPhotographyStorm(storms, { ...request, photographyStormId: "missing" }),
    undefined,
  );
  assert.equal(selectPhotographyStorm(storms, { latitude: 0, longitude: 0 }), undefined);
});

test("photography finds storms near the visible map even with a distant saved inspection point", () => {
  const storm = tracked("visible");
  const selected = selectPhotographyStorm([storm], {
    latitude: 0,
    longitude: 0,
    mapCenter: storm.centroid.geometry.coordinates as [number, number],
  });
  assert.equal(selected?.id, "visible");
});
