import test from "node:test";
import assert from "node:assert/strict";
import { catalog } from "./catalog.ts";

test("offers detailed RRC pipeline data without removing the broader EIA layer", () => {
  const rrc = catalog.find((entry) => entry.id === "tx-rrc-pipelines");
  const eia = catalog.find((entry) => entry.id === "tx-pipelines");
  const countyZips = catalog.find((entry) => entry.id === "rrc-pipeline-county-downloads");

  assert.equal(rrc?.agency, "Railroad Commission of Texas");
  assert.equal(rrc?.countyField, "COUNTY_NAME");
  assert.match(rrc?.url ?? "", /RRC_Public_Viewer_Srvs\/MapServer\/13$/);
  assert.equal(eia?.agency, "U.S. Energy Information Administration");
  assert.equal(countyZips?.connection, "download");
  assert.match(countyZips?.sourcePage ?? "", /^https:\/\/mft\.rrc\.texas\.gov\//);
});
