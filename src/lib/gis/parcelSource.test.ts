import test from "node:test";
import assert from "node:assert/strict";
import { normalizeArcgisLayerUrl, fetchRemoteGeoJSONPaged } from "./arcgis.ts";
import { SOURCE_URL } from "../../../supabase/functions/parcel-cache/model.ts";
test("repair only the known retired parcel service", () => {
  assert.equal(
    normalizeArcgisLayerUrl(
      "https://services1.arcgis.com/1mtXwieMId59thmg/ArcGIS/rest/services/2019_Texas_Parcels_StratMap/FeatureServer/0",
    ),
    SOURCE_URL,
  );
  const custom = "https://example.org/custom/FeatureServer/7";
  assert.equal(normalizeArcgisLayerUrl(custom), custom);
});
test("parcel viewport uses IDs, retains filter, and publishes complete geometry", async (t) => {
  const calls: URL[] = [];
  t.mock.method(globalThis, "fetch", async (raw: string) => {
    const url = new URL(raw);
    calls.push(url);
    return Response.json(
      calls.length === 1
        ? { objectIds: [9], objectIdFieldName: "OBJECTID" }
        : {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { OBJECTID: 9 },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-97, 30],
                      [-96.9, 30],
                      [-96.9, 30.1],
                      [-97, 30],
                    ],
                  ],
                },
              },
            ],
          },
    );
  });
  const result = await fetchRemoteGeoJSONPaged(SOURCE_URL, {
    bbox: [-97, 30, -96.99, 30.01],
    where: "TAX_YEAR=2025",
  });
  assert.equal(result.complete, true);
  assert.equal(result.loaded, 1);
  assert.equal(calls[0]?.searchParams.get("returnIdsOnly"), "true");
  assert.equal(calls[0]?.searchParams.get("where"), "TAX_YEAR=2025");
  assert.equal(calls[1]?.searchParams.get("objectIds"), "9");
});
