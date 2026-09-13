import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeSpotterNetworkPositions,
  nearbySpotterNetworkPositions,
  parseSpotterNetworkPositionFeed,
} from "./spotterNetwork.server.ts";

const fixture = `Refresh: 1
Title: Spotter Network Positions - All - No Names
Object: 35.0000000,-100.0000000
Icon: 0,0,000,6,6,"Person Name\\n2026-09-12 21:55:00 UTC\\nMOVING\\nPhone: 555-555-5555\\nEmail: private@example.com"
End:
Object: 40.0000000,-110.0000000
Icon: 0,0,000,6,6,"Another Person\\n2026-09-12 20:00:00 UTC\\nSTATIONARY"
End:`;

test("Spotter Network parsing removes identity and excludes stale positions", () => {
  const positions = parseSpotterNetworkPositionFeed(fixture, "2026-09-12T22:00:00Z");
  assert.equal(positions.length, 1);
  assert.deepEqual(positions[0]?.location.geometry.coordinates, [-100, 35]);
  assert.equal(positions[0]?.motionStatus, "moving");
  assert.equal(positions[0]?.source.quality, "moderate");
  assert.equal(JSON.stringify(positions).includes("Person Name"), false);
  assert.equal(JSON.stringify(positions).includes("private@example.com"), false);
  assert.equal(JSON.stringify(positions).includes("555-555-5555"), false);
});

test("community positions are regionally bounded and newest first", () => {
  const positions = parseSpotterNetworkPositionFeed(fixture, "2026-09-12T21:56:00Z");
  const nearby = nearbySpotterNetworkPositions(positions, {
    latitude: 35,
    longitude: -100,
  });
  assert.equal(nearby.length, 1);
  assert.match(nearby[0]!.id, /^community-spotter-/);
});

test("experienced reporter feed marks matching privacy-safe positions as featured", () => {
  const all = parseSpotterNetworkPositionFeed(fixture, "2026-09-12T22:00:00Z");
  const featured = parseSpotterNetworkPositionFeed(fixture, "2026-09-12T22:00:00Z", {
    featured: true,
  });
  const merged = mergeSpotterNetworkPositions(all, featured);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.featured, true);
  assert.equal(merged[0]?.memberClass, "experienced-reporter");
  assert.equal(JSON.stringify(merged).includes("Person Name"), false);
});
