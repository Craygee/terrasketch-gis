import test from "node:test";
import assert from "node:assert/strict";
import { validatePoint } from "./pointRequest.ts";
test("weather transport preserves separate map-center and inspection coordinates", () => {
  const p = validatePoint({
    longitude: -98,
    latitude: 31,
    mapCenter: [-74, 43],
    radarSiteId: "KENX",
    radarSiteMode: "covering",
    radarSiteIds: ["KENX", "KTLX", "bad", "KENX"],
    radarFocus: [-97.3, 35.4],
    radarFocusSource: "storm",
    requestedLayerIds: ["weather.rainfall.1h"],
  });
  assert.deepEqual(p.mapCenter, [-74, 43]);
  assert.equal(p.longitude, -98);
  assert.equal(p.latitude, 31);
  assert.equal(p.radarSiteId, "KENX");
  assert.equal(p.radarSiteMode, "covering");
  assert.deepEqual(p.radarSiteIds, ["KENX", "KTLX"]);
  assert.deepEqual(p.radarFocus, [-97.3, 35.4]);
  assert.equal(p.radarFocusSource, "storm");
  for (const bad of [[181, 0], [0, 91], [null, 0], [NaN, 0], [0], "bad"]) {
    assert.equal(validatePoint({ longitude: 0, latitude: 0, mapCenter: bad }).mapCenter, undefined);
  }
  assert.throws(() => validatePoint({ latitude: 100, longitude: 0 }));
});
