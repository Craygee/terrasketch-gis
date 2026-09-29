import test from "node:test";
import assert from "node:assert/strict";
import { downloadParcels, validateBounds } from "./model.ts";
const area = [-97.75, 30.26, -97.745, 30.265] as [number, number, number, number];
const feature = {
  type: "Feature",
  properties: { OBJECTID: 1 },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-97.75, 30.26],
        [-97.745, 30.26],
        [-97.745, 30.265],
        [-97.75, 30.26],
      ],
    ],
  },
};
const fake = (...responses: unknown[]) =>
  (async () => Response.json(responses.shift())) as typeof fetch;
test("bounds reject camera-only, invalid, reversed and oversized areas", () => {
  for (const value of [
    undefined,
    [0, 0, 0, 0],
    [-97, 30, -98, 31],
    [-107, 25, -93, 37],
    [NaN, 30, -97, 31],
  ])
    assert.throws(() => validateBounds(value));
  assert.deepEqual(validateBounds(area), area);
});
test("complete ID-batched download preserves original attributes", async () => {
  const result = await downloadParcels(
    area,
    fake(
      { objectIds: [1], objectIdFieldName: "OBJECTID" },
      { type: "FeatureCollection", features: [feature] },
    ),
  );
  assert.deepEqual(result.features, [feature]);
});
test("missing geometry, missing records and unexpected identities fail closed", async () => {
  for (const features of [
    [],
    [{ ...feature, geometry: null }],
    [{ ...feature, properties: { OBJECTID: 2 } }],
  ])
    await assert.rejects(
      downloadParcels(
        area,
        fake(
          { objectIds: [1], objectIdFieldName: "OBJECTID" },
          { type: "FeatureCollection", features },
        ),
      ),
    );
});
test("partial ID lists and oversized downloads cannot publish", async () => {
  for (const response of [
    { objectIds: [1], exceededTransferLimit: true },
    { objectIds: Array.from({ length: 5001 }, (_, i) => i) },
    { error: { message: "Item does not exist" } },
    { objectIds: [1, 1], objectIdFieldName: "OBJECTID" },
  ])
    await assert.rejects(downloadParcels(area, fake(response)));
});
