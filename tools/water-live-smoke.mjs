// Public, bounded service contracts. No private project data or credentials.
import assert from "node:assert/strict";
import { bboxPolygon } from "@turf/turf";
import { fetchWaterSource } from "../src/lib/water/gateway.server.ts";
const studies = [
  ["San Antonio, Texas", [-98.6, 29.4, -98.5, 29.5]],
  ["Phoenix, Arizona", [-112.1, 33.4, -112, 33.5]],
  ["Sparse western Texas cell", [-104.7, 30.7, -104.69, 30.71]],
];
for (const [name, bounds] of studies) {
  for (const source of ["usgs-sites", "twdb-wells", "usgs-measurements", "twdb-aquifers"]) {
    const r = await fetchWaterSource(source, bboxPolygon(bounds));
    assert.ok(
      ["available", "degraded", "outside-coverage"].includes(r.status),
      `${name}/${source}: ${r.status}`,
    );
    for (const record of r.records) {
      assert.ok(record.sourceUrl);
      assert.ok(record.retrievedAt);
      assert.ok(record.raw);
    }
    console.log(
      `${name}: ${source} ${r.status}, ${r.records.length} records, truncated=${r.truncated}`,
    );
  }
}
