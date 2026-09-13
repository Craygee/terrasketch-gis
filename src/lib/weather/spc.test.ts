import test from "node:test";
import assert from "node:assert/strict";
import { parseSpcOutlook, spcCurrent, spcUrl, spcVisible } from "./spc.ts";
import { weatherProduct } from "./productRegistry.ts";
import { SPC_PRODUCTS } from "./spcCatalog.ts";
import type { WeatherTimelineState } from "./types.ts";

const now = Date.parse("2026-09-13T14:00:00Z");
test("SPC probability and extended products are registered without arbitrary endpoints", () => {
  assert.equal(SPC_PRODUCTS.length, 15);
  assert.equal(new Set(SPC_PRODUCTS.map((item) => item.layerId)).size, 15);
  for (const item of SPC_PRODUCTS) {
    assert.equal(weatherProduct(item.layerId)?.adapterStatus, "implemented");
    assert.equal(spcUrl(item.day, item.kind), item.url);
  }
  assert.throws(() => spcUrl(8, "tornado"));
  assert.throws(() => spcUrl(1, "../secret"));
});
function noContour(label = "Less Than 2% All Areas") {
  const original = fixture();
  return {
    ...original,
    features: [
      {
        ...original.features[0],
        geometry: { type: "GeometryCollection", geometries: [] },
        properties: {
          ...original.features[0]!.properties,
          DN: 0,
          LABEL: label,
          LABEL2: "",
          fill: "",
          stroke: "",
        },
      },
    ],
  };
}
test("SPC explicit below-threshold statement is valid data but never a fabricated polygon", () => {
  const outlook = parseSpcOutlook(noContour(), 1, now, "tornado");
  assert.equal(outlook.statement, "Less Than 2% All Areas");
  assert.equal(outlook.areas.length, 0);
  assert.equal(outlook.layerId, "weather.spc.day1.tornado");
  assert.equal(spcCurrent(outlook, now), true);
  assert.throws(() => parseSpcOutlook(noContour("Everything safe"), 1, now, "tornado"));
  const mixed = noContour();
  mixed.features.push(mixed.features[0]!);
  assert.throws(() => parseSpcOutlook(mixed, 1, now, "tornado"));
});
test("SPC Day 8 accepts future valid period while retaining current issue time", () => {
  const input = noContour("Predictability Too Low");
  input.features[0]!.properties.VALID_ISO = "2026-09-20T12:00:00Z";
  input.features[0]!.properties.EXPIRE_ISO = "2026-09-21T12:00:00Z";
  const outlook = parseSpcOutlook(input, 8, now, "severe");
  assert.equal(outlook.day, 8);
  assert.equal(outlook.statement, "Predictability Too Low");
  assert.equal(outlook.source.sourceTimestamp, "2026-09-13T12:44:00.000Z");
});
function fixture() {
  return {
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
          ISSUE_ISO: "2026-09-13T07:44:00-05:00",
          VALID_ISO: "2026-09-13T08:00:00-05:00",
          EXPIRE_ISO: "2026-09-14T07:00:00-05:00",
          LABEL: "TSTM",
          LABEL2: "General Thunderstorms Risk",
          fill: "#C1E9C1",
          stroke: "#55BB55",
        },
      },
    ],
  };
}
test("SPC registry uses reviewed public provider and strict day allowlist", () => {
  for (const day of [1, 2, 3]) {
    assert.equal(weatherProduct(`weather.spc.day${day}.categorical`)?.providerId, "spc");
    assert.match(spcUrl(day), /www.spc.noaa.gov/);
  }
  assert.throws(() => spcUrl(4));
});
test("SPC preserves official colors and separates issue, valid and retrieval times", () => {
  const value = parseSpcOutlook(fixture(), 1, now);
  assert.equal(value.source.sourceTimestamp, "2026-09-13T12:44:00.000Z");
  assert.equal(value.source.validTime, "2026-09-13T13:00:00.000Z");
  assert.equal(value.source.receivedTimestamp, "2026-09-13T14:00:00.000Z");
  assert.equal(value.areas[0]?.properties.fill, "#C1E9C1");
  assert.equal(value.source.temporalKind, "forecast");
});
test("SPC rejects empty, malformed and partial products rather than returning all-clear", () => {
  assert.throws(() => parseSpcOutlook({ type: "FeatureCollection", features: [] }, 1, now));
  assert.throws(() => parseSpcOutlook({ error: "rate limited" }, 1, now));
  const bad = fixture();
  bad.features[0]!.geometry.coordinates[0]![0]![0] = 200;
  assert.throws(() => parseSpcOutlook(bad, 1, now));
  const mixed = fixture();
  mixed.features.push({
    ...mixed.features[0]!,
    properties: { ...mixed.features[0]!.properties, ISSUE_ISO: "2026-09-13T11:00:00Z" },
  });
  assert.throws(() => parseSpcOutlook(mixed, 1, now));
});
test("SPC rejects expired, future-issued, invalid color and unclosed geometry", () => {
  assert.throws(() => parseSpcOutlook(fixture(), 1, now + 86_400_000));
  assert.throws(() => parseSpcOutlook(fixture(), 1, now - 86_400_000));
  const color = fixture();
  color.features[0]!.properties.fill = "url(secret)";
  assert.throws(() => parseSpcOutlook(color, 1, now));
  const open = fixture();
  open.features[0]!.geometry.coordinates[0]![3] = [-98, 35];
  assert.throws(() => parseSpcOutlook(open, 1, now));
});
test("SPC current-only forecasts disappear in history, outside validity or after freshness limit", () => {
  const outlook = parseSpcOutlook(fixture(), 1, now);
  const timeline: WeatherTimelineState = {
    mode: "observed",
    selectedTime: new Date(now).toISOString(),
    rangeStart: "",
    rangeEnd: "",
    playing: false,
    loop: false,
    speed: 1,
  };
  assert.equal(spcVisible(outlook, timeline, now), true);
  assert.equal(spcVisible(outlook, { ...timeline, mode: "historical" }, now), false);
  assert.equal(spcVisible(outlook, { ...timeline, mode: "forecast" }, now), true);
  assert.equal(
    spcVisible(
      outlook,
      { ...timeline, mode: "forecast", selectedTime: "2026-09-15T00:00:00Z" },
      now,
    ),
    false,
  );
  assert.equal(spcCurrent(outlook, now + 600_001), false);
  assert.equal(spcVisible(outlook, timeline, now + 600_001), false);
});
