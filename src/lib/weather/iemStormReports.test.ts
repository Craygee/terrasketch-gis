import assert from "node:assert/strict";
import test from "node:test";
import {
  nearbyIemStormReports,
  parseIemStormReports,
  stormReportKind,
} from "./iemStormReports.server.ts";

test("normalizes IEM Local Storm Reports without treating them as people", () => {
  const reports = parseIemStormReports(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            VALID: "202609121940",
            MAG: 0,
            WFO: "JAX",
            TYPETEXT: "LANDSPOUT",
            CITY: "5 WNW Palm Coast",
            COUNTY: "Flagler",
            STATE: "FL",
            SOURCE: "Emergency Mngr",
            REMARK: "Video received by emergency management.",
          },
          geometry: { type: "Point", coordinates: [-81.28, 29.6] },
        },
      ],
    },
    "2026-09-12T20:00:00.000Z",
  );
  assert.equal(reports.length, 1);
  assert.equal(reports[0]?.kind, "tornado");
  assert.equal(reports[0]?.observedAt, "2026-09-12T19:40:00.000Z");
  assert.equal(reports[0]?.source.providerId, "iem-nws-lsr");
  assert.equal(reports[0]?.reportedBy, "Emergency Mngr");
});

test("classifies core report types and filters by distance", () => {
  assert.equal(stormReportKind("HAIL"), "hail");
  assert.equal(stormReportKind("TSTM WND GST"), "wind");
  assert.equal(stormReportKind("FLASH FLOOD"), "flood");
  const reports = parseIemStormReports({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { VALID: "202609121940", TYPETEXT: "HAIL" },
        geometry: { type: "Point", coordinates: [-102.08, 32.0] },
      },
      {
        type: "Feature",
        properties: { VALID: "202609121940", TYPETEXT: "HAIL" },
        geometry: { type: "Point", coordinates: [-81.28, 29.6] },
      },
    ],
  });
  assert.equal(nearbyIemStormReports(reports, { longitude: -102.08, latitude: 32 }, 100).length, 1);
});
