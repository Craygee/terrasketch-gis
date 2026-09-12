import assert from "node:assert/strict";
import test from "node:test";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import {
  normalizeProbSevereFrames,
  selectHistoryFrames,
  type ProbSevereInputFrame,
} from "./probSevere.server.ts";
import { stormRelativePosition } from "./stormIntelligence.ts";

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
  assert.equal(selected.length, 5);
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
