import assert from "node:assert/strict";
import test from "node:test";
import type { Feature, Polygon } from "geojson";
import { sourceMetadata } from "./normalize.ts";
import {
  buildStormObjectsFromAlerts,
  forecastFromValidatedMotion,
  stormRelativePosition,
  timeAdjustedStormForecast,
} from "./stormIntelligence.ts";
import type { StormMotion, StormObject, WeatherAlert } from "./types.ts";

const source = sourceMetadata({
  providerId: "nws",
  providerName: "National Weather Service",
  product: "CAP alert",
  temporalKind: "observed",
  sourceTimestamp: "2026-09-11T20:00:00Z",
  receivedTimestamp: "2026-09-11T20:01:00Z",
  validTime: "2026-09-11T20:00:00Z",
  expirationTime: "2026-09-11T21:00:00Z",
  rawSourceReference: "https://api.weather.gov/alerts/test",
  attribution: "NOAA / National Weather Service",
});

const geometry: Feature<Polygon> = {
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
  id: "https://api.weather.gov/alerts/test",
  event: "Tornado Warning",
  headline: "Test official warning",
  description: "Test only",
  severity: "extreme",
  certainty: "Observed",
  urgency: "Immediate",
  status: "actual",
  geometry,
  source,
};

test("official alert creates a deterministic storm-context object without fabricated scores", () => {
  const first = buildStormObjectsFromAlerts([alert], [-102, 32]);
  const second = buildStormObjectsFromAlerts([alert], [-102, 32]);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.id, second[0]?.id);
  assert.equal(first[0]?.basis, "official-alert-area");
  assert.equal(first[0]?.hazards.tornado.status, "official-context");
  assert.equal(first[0]?.hazards.tornado.score, null);
  assert.equal(first[0]?.hazards.tornado.probabilityPct, null);
  assert.equal(first[0]?.motion, null);
  assert.equal(first[0]?.forecastPositions.length, 0);
});

test("test and exercise alerts never become live storm objects", () => {
  const exercise = { ...alert, status: "exercise" as const };
  assert.equal(buildStormObjectsFromAlerts([exercise], [-102, 32]).length, 0);
});

test("validated motion projections widen uncertainty with lead time", () => {
  const motion: StormMotion = {
    bearingDeg: 90,
    speedMS: 20,
    validTime: "2026-09-11T20:00:00Z",
    source,
  };
  const forecasts = forecastFromValidatedMotion(
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-102, 32] } },
    motion,
    [5, 30, 60],
  );
  assert.equal(forecasts.length, 3);
  assert.ok(forecasts[1]!.likelyRadiusKm > forecasts[0]!.likelyRadiusKm);
  assert.ok(forecasts[2]!.possibleRadiusKm > forecasts[1]!.possibleRadiusKm);
  assert.ok(
    forecasts.every((item) => item.source.qualityFlags.includes("NOT_AN_OFFICIAL_WARNING")),
  );
});

test("delayed storm motion keeps displayed lead times relative to the current clock", () => {
  const motion: StormMotion = {
    bearingDeg: 90,
    speedMS: 20,
    validTime: "2026-09-11T20:00:00Z",
    source,
  };
  const origin = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Point" as const, coordinates: [-102, 32] },
  };
  const storm = {
    ...buildStormObjectsFromAlerts([alert], [-102, 32])[0]!,
    basis: "provider-guidance" as const,
    centroid: origin,
    motion,
    forecastPositions: forecastFromValidatedMotion(origin, motion, [5, 30, 60]),
  } satisfies StormObject;

  const adjusted = timeAdjustedStormForecast(storm, "2026-09-11T20:10:00Z");
  assert.equal(adjusted.ageAdjusted, true);
  assert.equal(adjusted.expired, false);
  assert.equal(Math.round(adjusted.sourceAgeMinutes), 10);
  assert.deepEqual(
    adjusted.positions.map((position) => position.leadMinutes),
    [5, 30, 60],
  );
  assert.equal(adjusted.positions.at(-1)?.validTime, "2026-09-11T21:10:00.000Z");
  assert.ok(
    adjusted.positions.at(-1)!.location.geometry.coordinates[0]! >
      storm.forecastPositions.at(-1)!.location.geometry.coordinates[0]!,
  );
  assert.ok(
    adjusted.positions.every((position) =>
      position.source.qualityFlags.includes("AGE_ADJUSTED_DISPLAY"),
    ),
  );
});

test("rolling storm motion is withheld after its freshness window", () => {
  const motion: StormMotion = {
    bearingDeg: 90,
    speedMS: 20,
    validTime: "2026-09-11T20:00:00Z",
    source,
  };
  const origin = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Point" as const, coordinates: [-102, 32] },
  };
  const storm = {
    ...buildStormObjectsFromAlerts([alert], [-102, 32])[0]!,
    basis: "provider-guidance" as const,
    centroid: origin,
    motion,
    forecastPositions: forecastFromValidatedMotion(origin, motion, [5, 30, 60]),
  } satisfies StormObject;

  const adjusted = timeAdjustedStormForecast(storm, "2026-09-11T20:31:00Z");
  assert.equal(adjusted.expired, true);
  assert.equal(adjusted.positions.length, 0);
});

test("chase position inside an official polygon suppresses safety claims", () => {
  const storm = buildStormObjectsFromAlerts([alert], [-102, 32])[0]!;
  const relative = stormRelativePosition(storm, [-102, 32]);
  assert.equal(relative.insideOfficialAlert, true);
  assert.equal(relative.exposure, "inside-official-hazard");
  assert.match(relative.message, /will not recommend/i);
});
