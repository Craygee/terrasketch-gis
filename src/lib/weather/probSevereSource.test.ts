import test from "node:test";
import assert from "node:assert/strict";
import { loadProbSevereSource } from "./probSevere.server.ts";
import { weatherLayersInGroup } from "./registry.ts";
test("original ProbSevere source preserves provider polygons and attributes without LandDraft analysis", async (t) => {
  const data = {
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
          ID: "original",
          ProbSevere: 70,
          ProbTor: 5,
          ProbHail: 62,
          ProbWind: 35,
          custom: "unchanged",
        },
      },
    ],
  };
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(String(url));
    return String(url).endsWith("/")
      ? new Response("MRMS_PROBSEVERE_20260914_020000.json")
      : Response.json(data);
  });
  const result = await loadProbSevereSource(new AbortController().signal);
  assert.deepEqual(result.data, data);
  assert.equal(result.timestamp, "2026-09-14T02:00:00.000Z");
  assert.equal(calls.length, 2);
  assert.equal("forecastPositions" in result, false);
});
test("source data category retains public products and separates derived LandDraft tools", () => {
  const ids = weatherLayersInGroup("Source data").map((x) => x.id);
  for (const id of [
    "weather.severe.probsevere",
    "weather.severe.alerts",
    "weather.radar.pro.reflectivity",
    "weather.rainfall.1h",
  ])
    assert.ok(ids.includes(id), id);
  for (const id of [
    "weather.severe.intelligence",
    "weather.photo",
    "weather.storm_chaser.spotters",
  ])
    assert.ok(!ids.includes(id), id);
  assert.ok(
    !weatherLayersInGroup("LandDraft tools").some((x) => x.id === "weather.severe.probsevere"),
  );
});
