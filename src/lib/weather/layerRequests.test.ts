import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRequestedLayers } from "./layerRequests.ts";
import { weatherLayerRegistry, weatherLayersInGroup } from "./registry.ts";
test("full catalog survives the request boundary without dropping custom layers", () => {
  const ids = weatherLayerRegistry.map((l) => l.id);
  assert.deepEqual(normalizeRequestedLayers(ids), ids);
  assert.deepEqual(normalizeRequestedLayers([ids[0], ids[0], null, "bad", "weather.good"]), [
    ids[0],
    "weather.good",
  ]);
  assert.equal(
    normalizeRequestedLayers(Array.from({ length: 200 }, (_, i) => "weather.test" + i))?.length,
    100,
  );
});
test("LandDraft tools retain the exact same layer definitions in their original groups", () => {
  const tools = weatherLayersInGroup("LandDraft tools");
  assert.equal(tools.length, 16);
  for (const tool of tools) assert.ok(weatherLayersInGroup(tool.group).includes(tool));
  assert.ok(tools.some((l) => l.id === "weather.photo"));
  assert.ok(!tools.some((l) => l.id === "weather.severe.alerts"));
});
