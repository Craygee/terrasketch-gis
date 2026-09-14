import assert from "node:assert/strict";
import test from "node:test";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import {
  normalizeProbSevereFrames,
  selectHistoryFrames,
  type ProbSevereInputFrame,
} from "./probSevere.server.ts";
import { stormRelativePosition } from "./stormIntelligence.ts";
import { StormContextStore } from "./analysisRetention.ts";
import { analyzeStormObject } from "./stormAnalysis.ts";

function stormFeature(
  id: string,
  longitude: number,
  probabilities: { severe: number; tornado: number; hail: number; wind: number },
): Feature<Polygon, Record<string, unknown>> {
  return {
    type: "Feature",
    properties: {
      ID: id,
      ProbSevere: probabilities.severe,
      ProbTor: probabilities.tornado,
      ProbHail: probabilities.hail,
      ProbWind: probabilities.wind,
      MESH: 1.4,
      FLASH_RATE: 18,
      COMPREF: 61,
      MAXLLAZ: 0.012,
      MLCAPE: 1850,
      EBSHEAR: 19,
      SRH01KM: 128,
      LCL: 920,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [longitude - 0.1, 34.9],
          [longitude + 0.1, 34.9],
          [longitude + 0.1, 35.1],
          [longitude - 0.1, 35.1],
          [longitude - 0.1, 34.9],
        ],
      ],
    },
  };
}

function frame(
  filename: string,
  validTime: string,
  feature: Feature<Polygon, Record<string, unknown>>,
): ProbSevereInputFrame {
  return {
    filename,
    validTime,
    data: {
      type: "FeatureCollection",
      features: [feature],
    } as FeatureCollection<Polygon, Record<string, unknown>>,
  };
}

test("ProbSevere normalization preserves calibrated probabilities and builds a recent-motion corridor", () => {
  const latest = new Date(Date.now() - 60_000);
  const previous = new Date(latest.getTime() - 10 * 60_000);
  const frames = [
    frame(
      "MRMS_PROBSEVERE_20260911_200000.json",
      previous.toISOString(),
      stormFeature("48123", -100.2, { severe: 54, tornado: 8, hail: 42, wind: 31 }),
    ),
    frame(
      "MRMS_PROBSEVERE_20260911_201000.json",
      latest.toISOString(),
      stormFeature("48123", -100, { severe: 68, tornado: 16, hail: 57, wind: 37 }),
    ),
  ];

  const storms = normalizeProbSevereFrames(frames, { latitude: 35, longitude: -100 });
  assert.equal(storms.length, 1);
  const storm = storms[0]!;
  assert.equal(storm.basis, "provider-guidance");
  assert.equal(storm.hazards.tornado.probabilityPct, 16);
  assert.equal(storm.hazards.hail.trend, "increasing");
  assert.equal(storm.history.length, 2);
  assert.equal(storm.history.at(-1)?.lowLevelAzimuthalShearS1, 0.012);
  assert.equal(storm.history.at(-1)?.meshInches, 1.4);
  assert.equal(storm.history.at(-1)?.compositeReflectivityDbz, 61);
  assert.equal(storm.history.at(-1)?.flashRatePerMinute, 18);
  assert.ok(storm.motion);
  assert.equal(storm.forecastPositions.length, 6);
  assert.ok(
    storm.forecastPositions.every((position) =>
      position.source.qualityFlags.includes("NOT_AN_OFFICIAL_WARNING"),
    ),
  );
  assert.match(storm.statusLabel, /NOT AN OFFICIAL WARNING/);
});

test("recent history selection retains an approximately 30-minute analysis window", () => {
  const filenames = Array.from({ length: 16 }, (_, index) => {
    const minute = String(index * 2).padStart(2, "0");
    return `MRMS_PROBSEVERE_20260911_20${minute}00.json`;
  });
  const selected = selectHistoryFrames(filenames);

  assert.equal(selected.at(-1), "MRMS_PROBSEVERE_20260911_203000.json");
  assert.equal(selected[0], "MRMS_PROBSEVERE_20260911_200000.json");
  assert.ok(selected.length >= 8);
});

test("provider storm geometry is not mislabeled as an official warning area", () => {
  const latest = new Date(Date.now() - 60_000);
  const storm = normalizeProbSevereFrames(
    [
      frame(
        "MRMS_PROBSEVERE_20260911_201000.json",
        latest.toISOString(),
        stormFeature("48123", -100, { severe: 68, tornado: 16, hail: 57, wind: 37 }),
      ),
    ],
    { latitude: 35, longitude: -100 },
  )[0]!;

  const relative = stormRelativePosition(storm, [-100, 35]);
  assert.equal(relative.insideAnalyzedArea, true);
  assert.equal(relative.insideOfficialAlert, false);
  assert.match(relative.message, /provider-tracked storm object/i);
});

test("null, blanks and real zero remain distinct in provider normalization", () => {
  const feature = stormFeature("null-test", -100, { severe: 0, tornado: 0, hail: 0, wind: 0 });
  feature.properties["MESH"] = null;
  feature.properties["FLASH_RATE"] = "";
  feature.properties["MAXLLAZ"] = 0;
  const storm = normalizeProbSevereFrames([frame("fixture", new Date().toISOString(), feature)], {
    latitude: 35,
    longitude: -100,
  })[0]!;
  assert.equal(storm.history[0]!.meshInches, undefined);
  assert.equal(storm.history[0]!.flashRatePerMinute, undefined);
  assert.equal(storm.history[0]!.lowLevelAzimuthalShearS1, 0);
  assert.equal(storm.hazards.tornado.probabilityPct, 0);
});

test("provider outage retains last reliable context and recovery restores analysis", () => {
  const time = Date.now();
  const feature = stormFeature("outage-test", -100, { severe: 92, tornado: 5, hail: 60, wind: 60 });
  const storm = normalizeProbSevereFrames(
    [frame("fixture", new Date(time).toISOString(), feature)],
    { latitude: 35, longitude: -100 },
  )[0]!;
  const store = new StormContextStore();
  store.update([storm], time);
  const missing = store.update([], time + 120000, true)[0]!;
  assert.equal(missing.forecastPositions.length, 0);
  assert.equal(analyzeStormObject(missing, time + 120000).intensity.value, null);
  assert.ok(analyzeStormObject(missing, time + 120000).lastReliable);
  assert.equal(missing.analysis?.quality, "STALE");
  const recovered = store.update([storm], time + 120000)[0]!;
  assert.notEqual(recovered.analysis?.intensity.value, null);
});

test("same ID impossible displacement does not fabricate an intensity trend", () => {
  const time = Date.now();
  const storms = normalizeProbSevereFrames(
    [
      frame(
        "a",
        new Date(time - 120000).toISOString(),
        stormFeature("jump", -120, { severe: 1, tornado: 0, hail: 0, wind: 0 }),
      ),
      frame(
        "b",
        new Date(time).toISOString(),
        stormFeature("jump", -80, { severe: 99, tornado: 10, hail: 90, wind: 80 }),
      ),
    ],
    { latitude: 35, longitude: -80 },
  );
  assert.equal(storms[0]!.history.length, 1);
  assert.equal(storms[0]!.motion, null);
  assert.equal(storms[0]!.analysis?.trend.state, "Insufficient data");
});

test("extended history uses recent motion instead of the two-hour average", () => {
  const time = Date.now();
  const frames = [
    [120, -100],
    [90, -100.1],
    [60, -100.2],
    [30, -100.3],
    [10, -100.35],
    [6, -100.3],
    [4, -100.25],
    [2, -100.2],
    [0, -100.15],
  ].map(([minutes, longitude]) =>
    frame(
      String(minutes),
      new Date(time - minutes! * 60000).toISOString(),
      stormFeature("turning", longitude!, { severe: 60, tornado: 5, hail: 40, wind: 50 }),
    ),
  );
  const storm = normalizeProbSevereFrames(frames, { latitude: 35, longitude: -100 })[0]!;
  assert.equal(storm.history.length, 9);
  assert.ok(storm.motion);
  assert.ok(storm.motion.bearingDeg > 80 && storm.motion.bearingDeg < 100);
});
