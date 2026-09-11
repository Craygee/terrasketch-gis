import assert from "node:assert/strict";
import test from "node:test";
import { nearestWeatherRadarSite, radarSiteDistanceKm } from "./radar.ts";

const sites = [
  { id: "KMAF", name: "Midland", latitude: 31.943, longitude: -102.189 },
  { id: "KLBB", name: "Lubbock", latitude: 33.654, longitude: -101.814 },
];

test("selects the closest official radar site", () => {
  const nearest = nearestWeatherRadarSite(sites, { latitude: 32.02, longitude: -102.1 });
  assert.equal(nearest?.site.id, "KMAF");
  assert.ok((nearest?.distanceKm ?? 100) < 15);
});

test("computes zero distance at the radar coordinate", () => {
  assert.equal(
    radarSiteDistanceKm(sites[0]!, {
      latitude: sites[0]!.latitude,
      longitude: sites[0]!.longitude,
    }),
    0,
  );
});
