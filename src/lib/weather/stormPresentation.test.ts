import assert from "node:assert/strict";
import test from "node:test";
import type { StormHazardAssessment, StormObject, StormHazardKind } from "./types.ts";
import { stormEventIcon, stormSeverityBand, stormSeverityScore } from "./stormPresentation.ts";

const hazard = (kind: StormHazardKind, probabilityPct: number | null): StormHazardAssessment => ({
  kind,
  status: probabilityPct === null ? "unavailable" : "analyzed",
  score: null,
  probabilityPct,
  confidence: "moderate",
  trend: "unknown",
  reasons: [],
});

const storm = (title: string, probabilities: Partial<Record<StormHazardKind, number>> = {}) =>
  ({
    title,
    classification: title,
    statusLabel: title,
    hazards: {
      tornado: hazard("tornado", probabilities.tornado ?? null),
      hail: hazard("hail", probabilities.hail ?? null),
      wind: hazard("wind", probabilities.wind ?? null),
      flood: hazard("flood", probabilities.flood ?? null),
      lightning: hazard("lightning", probabilities.lightning ?? null),
    },
  }) as StormObject;

test("chooses recognizable event icons from official event names", () => {
  assert.equal(stormEventIcon(storm("Tornado Warning")), "tornado");
  assert.equal(stormEventIcon(storm("Hurricane Warning")), "hurricane");
  assert.equal(stormEventIcon(storm("Haboob / blowing dust")), "haboob");
});

test("generic tracked storms are not labeled as detected hazards from probabilities", () => {
  assert.equal(
    stormEventIcon(storm("Tracked Storm", { hail: 82, tornado: 24 })),
    "major-thunderstorm",
  );
});

test("official warning does not invent a physical intensity", () => {
  const score = stormSeverityScore(storm("Tornado Warning"));
  assert.equal(score, null);
});

test("severity bands progress from green-compatible lower risk to dark red extreme", () => {
  assert.deepEqual([0, 25, 45, 65, 85].map(stormSeverityBand), [
    "lower",
    "elevated",
    "significant",
    "severe",
    "extreme",
  ]);
});

test("low tornado probability does not draw a tornado icon", () => {
  assert.equal(
    stormEventIcon(storm("ProbSevere storm 1", { tornado: 8, wind: 32 })),
    "major-thunderstorm",
  );
});
