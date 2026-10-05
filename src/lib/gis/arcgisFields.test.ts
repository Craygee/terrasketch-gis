import test from "node:test";
import assert from "node:assert/strict";
import { fetchArcgisFields } from "./arcgis.ts";

test("reads fields from a query when an ArcGIS publisher disables layer metadata", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    if (!url.includes("/query?")) return new Response("Directory disabled", { status: 403 });
    return Response.json({
      fields: [
        { name: "OPERATOR", alias: "Operator", type: "esriFieldTypeString" },
        { name: "DIAMETER", alias: "Diameter", type: "esriFieldTypeDouble" },
      ],
      features: [{ attributes: { OPERATOR: "Example", DIAMETER: 8 } }],
    });
  }) as typeof fetch;

  try {
    const fields = await fetchArcgisFields(
      "https://example.com/arcgis/rest/services/Pipelines/MapServer/13",
    );
    assert.deepEqual(
      fields.map((field) => field.name),
      ["OPERATOR", "DIAMETER"],
    );
    assert.equal(requested.length, 2);
    assert.match(requested[1] ?? "", /returnGeometry=false/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
