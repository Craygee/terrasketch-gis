import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { FeatureCollection } from "geojson";
import {
  analyzeImportComplexity,
  assertImportFileBudget,
  assertZipExpansionBudget,
  MAX_DIRECT_IMPORT_BYTES,
} from "./importBudget.ts";

test("counts feature and coordinate complexity before an import reaches the map", () => {
  const data: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "zone" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-97, 30],
              [-96, 30],
              [-96, 31],
              [-97, 30],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [-95, 29] },
      },
    ],
  };

  assert.deepEqual(analyzeImportComplexity("sample.geojson", data), {
    featureCount: 2,
    coordinateCount: 5,
  });
});

test("rejects oversized files before parsing and points opportunity-zone users to public data", () => {
  assert.throws(
    () => assertImportFileBudget("Federal Opportunity Zones.zip", MAX_DIRECT_IMPORT_BYTES + 1),
    /Public data .* Federal Qualified Opportunity Zones/,
  );
});

test("reads a standard ZIP central directory without inflating the archive", async () => {
  const zip = new JSZip();
  zip.file("zones.shp", new Uint8Array([1, 2, 3, 4]));
  const buffer = await zip.generateAsync({ type: "arraybuffer" });

  assert.doesNotThrow(() => assertZipExpansionBudget("zones.zip", buffer));
});
