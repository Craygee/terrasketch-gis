import assert from "node:assert/strict";
import test from "node:test";
import { measurementValue, nwsWindMetersPerSecond } from "./nwsMeasurement.ts";
test("NWS missing observations remain missing while measured zero is retained", () => {
  for (const value of [null, undefined, "", "12", false, NaN, Infinity])
    assert.equal(measurementValue({ value }), undefined);
  assert.equal(measurementValue({ value: 0 }), 0);
  assert.equal(measurementValue({ value: -4 }), -4);
});
test("NWS winds normalize explicit provider units into metres per second", () => {
  assert.equal(nwsWindMetersPerSecond({ value: 36, unitCode: "wmoUnit:km_h-1" }), 10);
  assert.equal(nwsWindMetersPerSecond({ value: 10, unitCode: "wmoUnit:m_s-1" }), 10);
  assert.equal(nwsWindMetersPerSecond({ value: 10, unitCode: "wmoUnit:mi_h-1" }), 4.4704);
  assert.equal(nwsWindMetersPerSecond({ value: null, unitCode: "wmoUnit:km_h-1" }), undefined);
  assert.equal(nwsWindMetersPerSecond({ value: 20, unitCode: "unknown" }), undefined);
  assert.equal(nwsWindMetersPerSecond({ value: -1, unitCode: "wmoUnit:km_h-1" }), undefined);
});
