import test from "node:test";
import assert from "node:assert/strict";
import { wmsTimes, wmsTimeParameter, selectWmsTimes } from "./wms.ts";
const now = Date.parse("2026-09-13T22:00:00Z");
test("daily WMS intervals retain recent dates and never request tomorrow", () => {
  const times = wmsTimes(
    '<Layer><Name>cloud</Name><Dimension name="time">2000-01-01/2001-01-01/P1D,2026-09-01/2026-09-14/P1D</Dimension></Layer>',
    "cloud",
    true,
    now,
  );
  assert.equal(times.at(-1), "2026-09-13T00:00:00.000Z");
  assert.equal(times.length, 5);
  assert.equal(wmsTimeParameter(times.at(-1)!, true), "2026-09-13");
  assert.equal(wmsTimeParameter("2026-09-13T21:00:00.000Z"), "2026-09-13T21:00:00Z");
});
test("forecast frame selection starts near now instead of at the far end of the model run", () => {
  const times = Array.from({ length: 60 }, (_, i) =>
    new Date(now + (i - 2) * 3600000).toISOString(),
  );
  assert.equal(selectWmsTimes(times, "forecast", 16, now)[0], times[1]);
  assert.equal(selectWmsTimes(times, "observed", 16, now).at(-1), times[2]);
});
test("WMS timeline selection uses the requested layer and escapes its name", () => {
  const xml =
    '<Layer><Name>a.b</Name><Dimension name="time">2026-09-13T20:00:00Z,2026-09-13T21:00:00Z</Dimension></Layer><Layer><Name>other</Name><Dimension name="time">2026-09-14</Dimension></Layer>';
  assert.equal(wmsTimes(xml, "a.b").length, 2);
});
