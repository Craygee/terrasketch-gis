import assert from "node:assert/strict";
import test from "node:test";
import {
  recordWeatherUsage,
  resetWeatherUsageForTests,
  weatherUsageSnapshot,
} from "./telemetry.server.ts";

test("aggregates logical provider requests and cache hits without inventing cost", () => {
  resetWeatherUsageForTests();
  recordWeatherUsage({
    providerId: "official-source",
    product: "alerts",
    success: true,
    cacheHit: false,
  });
  recordWeatherUsage({
    providerId: "official-source",
    product: "alerts",
    success: true,
    cacheHit: true,
  });
  const metric = weatherUsageSnapshot()[0];
  assert.equal(metric?.requests, 2);
  assert.equal(metric?.successes, 2);
  assert.equal(metric?.failures, 0);
  assert.equal(metric?.cacheHits, 1);
  assert.equal(metric?.estimatedCostUsd, null);
});
