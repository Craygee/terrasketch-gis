import assert from "node:assert/strict";
import test from "node:test";

import {
  createSiteObjectFeature,
  imageOverlayCoordinates,
  rectangleCoordinates,
} from "./siteDesigner.ts";

test("creates a closed, rotated building footprint with design attributes", () => {
  const ring = rectangleCoordinates([-97.75, 30.25], 40, 60, 30);
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring.at(-1));
  assert.ok(new Set(ring.map((position) => position.join(","))).size >= 4);

  const result = createSiteObjectFeature(
    {
      definitionId: "building",
      name: "Equipment shop",
      scenario: "Option A",
      widthFt: 40,
      lengthFt: 60,
      heightFt: 24,
      depthFt: 0,
      rotationDeg: 30,
    },
    [-97.75, 30.25],
  );
  assert.equal(result.feature.geometry.type, "Polygon");
  assert.equal(result.feature.properties?.["HEIGHT_FT"], 24);
  assert.equal(result.feature.properties?.["SCENARIO"], "Option A");
  assert.equal(result.style.labelTemplate, "{NAME}");
});

test("pond objects keep depth separate and calculate an explicit planning volume", () => {
  const result = createSiteObjectFeature(
    {
      definitionId: "pond",
      name: "North pond",
      scenario: "Proposed",
      widthFt: 100,
      lengthFt: 150,
      heightFt: 0,
      depthFt: 8,
      rotationDeg: 0,
    },
    [-100, 32],
  );

  assert.equal(result.feature.properties?.["DEPTH_FT"], 8);
  assert.ok(Number(result.feature.properties?.["EST_VOLUME_ACRE_FT"]) > 2);
  assert.equal(result.feature.properties?.["HEIGHT_FT"], 0);
});

test("image overlays create four ordered map corners", () => {
  const coordinates = imageOverlayCoordinates([-98, 31], 500, 300, 0);
  assert.equal(coordinates.length, 4);
  assert.ok(coordinates[0][0] < coordinates[1][0]);
  assert.ok(coordinates[0][1] > coordinates[3][1]);
});
