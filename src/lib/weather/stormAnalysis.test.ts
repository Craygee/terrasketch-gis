import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { analyzeStorm } from "./stormAnalysis.ts";
import { normalizeAnalysisHistory, observationsAtEventOffset } from "./analysisHistory.ts";
import { weatherLayerRegistry, WEATHER_LAYER_GROUPS } from "./registry.ts";
import { weatherProviderRegistry } from "./providerRegistry.ts";
import { intensityClassification } from "./analysisIntensity.ts";
import { linkStormWarnings } from "./stormWarnings.ts";
import type { StormObject, WeatherAlert } from "./types.ts";
import { inputQuality } from "./analysisFreshness.ts";
import type { AnalysisObservation, AnalysisInput } from "./analysisTypes.ts";

const now = Date.parse("2026-09-14T00:30:00Z");
function observation(minutes = 0, score = 60): AnalysisObservation {
  const time = new Date(now - minutes * 60000).toISOString();
  const input = (value: number, source: AnalysisInput["source"], unit: string): AnalysisInput => ({
    value,
    source,
    unit,
    provider: "fixture",
    product: "storm observations",
    observationTime: time,
    productTime: time,
    retrievedAt: time,
    providerQuality: null,
    kind: "OBSERVED",
    method: "test observation",
  });
  return {
    time,
    identity: "storm-1",
    coverage: "adequate",
    continuity: "confirmed",
    inputs: {
      reflectivity: input(20 + score * 0.5, "radar", "dBZ"),
      hail: input(score * 0.03, "radar", "in"),
      rotation: input(score * 0.0002, "radar", "s⁻¹"),
      lightning: input(score, "lightning", "flashes/min"),
    },
    probability: input(92, "probability", "%"),
  };
}
test("PROBSEVERE != INTENSITY; probabilities never enter physical score", () => {
  const sample = observation();
  const first = analyzeStorm([sample], now);
  assert.equal(first.intensity.value, 60);
  sample.probability!.value = 0;
  assert.equal(analyzeStorm([sample], now).intensity.value, 60);
});
test("stale probability plus current radar does not make intensity stale", () => {
  const sample = observation();
  sample.probability!.observationTime = observation(7).time;
  const result = analyzeStorm([sample], now);
  assert.equal(result.intensity.value, 60);
  assert.equal(result.quality, "PARTIAL");
});
test("current probability plus stale radar cannot produce current intensity", () => {
  const sample = observation(7);
  sample.probability!.observationTime = observation().time;
  const result = analyzeStorm([sample], now);
  assert.equal(result.intensity.value, null);
  assert.equal(result.quality, "STALE");
  assert.equal(result.confidence, "LOW");
  assert.equal(result.lastReliable?.intensity.value, 60);
});
test("STALE != WEAKENING; multiple stale sources retain last score as context", () => {
  const result = analyzeStorm([observation(20, 80), observation(10, 50)], now);
  assert.equal(result.trend.state, "Insufficient data");
  assert.equal(result.intensity.value, null);
  assert.equal(result.lastReliable?.intensity.value, 50);
});
test("MISSING != ZERO; missing satellite/lightning does not fabricate hazards", () => {
  const sample = observation(0, 0);
  delete sample.inputs.lightning;
  const result = analyzeStorm([sample], now);
  assert.equal(result.intensity.value, 0);
  assert.equal(result.intensity.hazards.hail, 0);
  assert.equal(result.intensity.hazards.lightning, null);
  assert.equal(result.intensity.hazards.wind, null);
  sample.inputs.hail!.value = null;
  sample.inputs.rotation!.value = null;
  assert.equal(analyzeStorm([sample], now).intensity.value, null);
});
test("degraded radar coverage reduces confidence independently of intensity", () => {
  const sample = observation(0, 90);
  sample.coverage = "degraded";
  const result = analyzeStorm([sample], now);
  assert.equal(result.intensity.value, 90);
  assert.equal(result.confidence, "LOW");
  assert.equal(result.quality, "DEGRADED");
});
test("persistent rapid intensification and weakening use multiple observations", () => {
  const history = [20, 25, 45, 60, 80, 85].map((score, index) =>
    observation((5 - index) * 2, score),
  );
  assert.equal(analyzeStorm(history, now).trend.state, "Rapidly Intensifying");
  assert.equal(
    analyzeStorm(
      history.map((sample, index) => observation((5 - index) * 2, 85 - index * 12)),
      now,
    ).trend.state,
    "Rapidly Weakening",
  );
});
test("a noisy single-observation spike cannot trigger rapid intensification", () => {
  const history = [40, 40, 40, 40, 40, 100].map((score, index) =>
    observation((5 - index) * 2, score),
  );
  assert.equal(analyzeStorm(history, now).trend.state, "Steady");
  assert.equal(analyzeStorm(history, now).trend.rapid, false);
});
test("split, merger and ID transition do not stitch unrelated histories", () => {
  const history = [
    observation(12, 10),
    observation(10, 15),
    observation(8, 20),
    observation(6, 60),
    observation(4, 70),
    observation(0, 90),
  ];
  history.at(-1)!.identity = "new-child-or-merged-id";
  assert.equal(analyzeStorm(history, now).trend.state, "Insufficient data");
  assert.equal(normalizeAnalysisHistory(history, now).length, 1);
});
test("out of order and exact duplicate observations are deterministic", () => {
  const a = observation(0),
    b = observation(4);
  assert.deepEqual(normalizeAnalysisHistory([a, b, a], now), normalizeAnalysisHistory([b, a], now));
  const conflict = observation(0, 90);
  assert.equal(normalizeAnalysisHistory([a, conflict], now)[0]!.continuity, "ambiguous");
  assert.equal(normalizeAnalysisHistory([a, conflict, a], now)[0]!.continuity, "ambiguous");
  const sameInstant = { ...a, time: a.time.replace(".000Z", "+00:00") };
  assert.equal(normalizeAnalysisHistory([a, sameInstant], now).length, 1);
});

test("provider partial quality and not-applicable measurements are preserved", () => {
  const input = observation().inputs.hail!;
  input.providerQuality = "PARTIAL";
  assert.equal(inputQuality(input, now), "PARTIAL");
  input.status = "NOT APPLICABLE";
  assert.equal(inputQuality(input, now), "UNAVAILABLE");
});
test("data gaps and changing component availability suppress false trends", () => {
  const history = [20, 18, 16, 14, 0].map((minutes) => observation(minutes));
  assert.equal(analyzeStorm(history, now).trend.state, "Insufficient data");
  const regular = [10, 8, 6, 4, 2, 0].map((minutes) => observation(minutes));
  delete regular[0]!.inputs.lightning;
  assert.equal(analyzeStorm(regular, now).trend.state, "Insufficient data");
});
test("backtesting excludes future observations at event and precursor offsets", () => {
  const history = [60, 30, 20, 10, 0].map((minutes) => observation(minutes));
  for (const offset of [0, 10, 20, 30] as const)
    assert.ok(
      observationsAtEventOffset(history, new Date(now).toISOString(), offset).every(
        (item) => Date.parse(item.time) <= now - offset * 60000,
      ),
    );
});
test("classification thresholds retain numbers and exact boundaries", () => {
  assert.deepEqual([0, 19, 20, 39, 40, 59, 60, 79, 80, 100, null].map(intensityClassification), [
    "Weak",
    "Weak",
    "Moderate",
    "Moderate",
    "Strong",
    "Strong",
    "Severe",
    "Severe",
    "Extreme",
    "Extreme",
    "INSUFFICIENT DATA",
  ]);
});
test("prechange layers, groups, providers and weather routes are preserved", () => {
  const baseline = JSON.parse(
    readFileSync(new URL("../../../docs/weather-analysis-baseline.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    weatherLayerRegistry.map((layer) => layer.id),
    baseline.layers,
  );
  assert.deepEqual(WEATHER_LAYER_GROUPS, baseline.groups);
  assert.deepEqual(
    weatherProviderRegistry.map((provider) => provider.provider_id),
    baseline.providers,
  );
  for (const route of baseline.routes)
    assert.ok(
      readdirSync(new URL("../../routes", import.meta.url), { recursive: true }).includes(route),
    );
});

test("official warning priority is linked only by active polygon intersection", () => {
  const geometry = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [-101, 34],
          [-99, 34],
          [-99, 36],
          [-101, 36],
          [-101, 34],
        ],
      ],
    },
  };
  const storm = { id: "s", geometry, officialAlertIds: [] } as unknown as StormObject;
  const alert = {
    id: "a",
    geometry,
    status: "actual",
    source: { expirationTime: new Date(now + 60000).toISOString() },
  } as unknown as WeatherAlert;
  assert.deepEqual(linkStormWarnings([storm], [alert], now)[0]!.officialAlertIds, ["a"]);
  alert.status = "test";
  assert.deepEqual(linkStormWarnings([storm], [alert], now)[0]!.officialAlertIds, []);
});
