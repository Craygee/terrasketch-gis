import assert from "node:assert/strict";
import test from "node:test";

import { groupLayersForMap, mapBoundsForLayers } from "./recordNavigation.ts";
import type { GisLayer, LayerGroup } from "./types.ts";

const layer = (id: string, groupId: string, coordinates: [number, number]): GisLayer => ({
  id,
  groupId,
  name: id,
  visible: true,
  createdAt: 1,
  source: { kind: "draw" },
  style: {
    fillColor: "#000000",
    fillOpacity: 1,
    fillPattern: "solid",
    strokeColor: "#000000",
    strokeWidth: 1,
    strokeOpacity: 1,
    strokePattern: "solid",
    pointSize: 4,
    pointIcon: "circle",
    pointIconColor: null,
    pointIconSize: 1,
    labelTemplate: "",
    labelFields: [],
    labelSeparator: " · ",
    labelEnabled: false,
    labelMinZoom: 0,
    labelMaxZoom: 24,
    labelFont: "Inter",
    labelSize: 12,
    labelScaleWithZoom: false,
    labelColor: "#000000",
    labelOpacity: 1,
    labelHaloColor: "#ffffff",
    labelHaloWidth: 1,
    labelPlacement: "auto",
    labelAllowOverlap: false,
    labelMaxWidth: 12,
    labelLineSpacing: 1.2,
  },
  data: {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates } }],
  },
});

test("finds map layers in a group and all nested groups", () => {
  const groups: LayerGroup[] = [
    { id: "site", name: "Site", collapsed: false },
    { id: "buildings", name: "Buildings", collapsed: false, parentId: "site" },
    { id: "roofs", name: "Roofs", collapsed: false, parentId: "buildings" },
    { id: "other", name: "Other", collapsed: false },
  ];
  const layers = [
    layer("parcel", "site", [-100, 31]),
    layer("shop", "buildings", [-99, 32]),
    layer("roof", "roofs", [-98, 33]),
    layer("road", "other", [-90, 30]),
  ];

  assert.deepEqual(
    groupLayersForMap("site", groups, layers).map((item) => item.id),
    ["parcel", "shop", "roof"],
  );
});

test("calculates one extent across layers and returns null for empty data", () => {
  const layers = [layer("west", "site", [-101, 30]), layer("east", "site", [-96, 35])];

  assert.deepEqual(mapBoundsForLayers(layers), [-101, 30, -96, 35]);
  assert.equal(
    mapBoundsForLayers([{ ...layers[0]!, data: { type: "FeatureCollection", features: [] } }]),
    null,
  );
});
