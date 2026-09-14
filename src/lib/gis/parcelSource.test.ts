import test from "node:test";
import assert from "node:assert/strict";
import { normalizeArcgisLayerUrl } from "./arcgis.ts";
import { TEXAS_PARCEL_URL } from "./texasParcels.ts";
test("retired parcel source migrates only to the registered CC0 statewide index", () => {
  assert.equal(
    normalizeArcgisLayerUrl(
      "https://services1.arcgis.com/1mtXwieMId59thmg/ArcGIS/rest/services/2019_Texas_Parcels_StratMap/FeatureServer/0",
    ),
    TEXAS_PARCEL_URL,
  );
  const custom = "https://example.org/custom/FeatureServer/7";
  assert.equal(normalizeArcgisLayerUrl(custom), custom);
});
