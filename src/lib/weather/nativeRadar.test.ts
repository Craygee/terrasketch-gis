import test from "node:test";
import assert from "node:assert/strict";
import { decodeNativeRadar } from "./nativeRadarDecoder.ts";
import {
  nativeProduct,
  nativeKeyTime,
  nativeFrameAt,
  radarSample,
  type NativeRadarFrame,
  type NativeRadarLayer,
} from "./nativeRadar.ts";
import { renderNativeRadarTile } from "./nativeRadarRender.ts";

const reflectivity = "weather.radar.pro.reflectivity";
// Independently constructed packet-16 fixture: one north-facing ray, four gates.
function fixture(code = 153) {
  const header = new TextEncoder().encode("SDUS54 KOUN 131911\r\r\nN0BTLX\r\r\n");
  const bytes = new Uint8Array(header.length + 160);
  bytes.set(header);
  const v = new DataView(bytes.buffer),
    h = header.length,
    p = h + 18,
    s = h + 120;
  v.setUint16(h, code);
  v.setInt16(p, -1);
  v.setInt32(p + 2, 35000);
  v.setInt32(p + 6, -97000);
  v.setInt16(p + 10, 1000);
  v.setUint16(p + 12, code);
  for (const offset of [22, 28]) {
    v.setUint16(p + offset, 20710);
    v.setUint32(p + offset + 2, 36000);
  }
  v.setInt16(p + 40, 5);
  v.setInt16(p + 42, -320);
  v.setInt16(p + 44, 5);
  v.setUint16(p + 46, 254);
  v.setUint32(p + 84, 40);
  v.setUint32(p + 90, 60);
  v.setInt16(s, -1);
  v.setUint16(s + 2, 1);
  v.setUint32(s + 4, 40);
  v.setUint16(s + 8, 1);
  v.setInt16(s + 10, -1);
  v.setUint32(s + 12, 24);
  v.setUint16(s + 16, 16);
  v.setUint16(s + 20, 4);
  v.setUint16(s + 28, 1);
  v.setUint16(s + 30, 4);
  v.setInt16(s + 34, 10);
  bytes.set([0, 1, 2, 102], s + 36);
  return { bytes, v, p, s };
}
test("packet-16 preserves missing/range-folded gates and physical reflectivity scale", () => {
  const scan = decodeNativeRadar(fixture().bytes, reflectivity);
  assert.equal(scan.latitude, 35);
  assert.equal(scan.longitude, -97);
  assert.equal(scan.elevationDeg, 0.5);
  assert.equal(scan.altitudeM, 304.8);
  assert.equal(scan.bins, 4);
  assert.equal(scan.rays, 1);
  assert.ok(Number.isNaN(scan.values[0]));
  assert.ok(Number.isNaN(scan.values[1]));
  assert.equal(scan.values[2], -32);
  assert.equal(scan.values[102], 18);
  assert.equal(scan.azimuthIndex[0], 0);
  assert.equal(scan.azimuthIndex[10], -1);
  assert.equal(radarSample(scan, -97, 35).state, "missing");
  assert.equal(radarSample(scan, -97, 36.2).state, "range-folded");
  assert.equal(radarSample(scan, -97, 37.2).value, -32);
  assert.equal(radarSample(scan, -97, 38.2).value, 18);
  assert.equal(radarSample(scan, -90, 35).state, "outside");
});
test("dual polarization floating scale and discrete hydrometeor classes", () => {
  const f = fixture(161);
  f.v.setFloat32(f.p + 42, 300);
  f.v.setFloat32(f.p + 46, -60.5);
  f.v.setUint16(f.p + 52, 255);
  f.v.setUint16(f.p + 54, 2);
  f.v.setUint16(f.p + 56, 0);
  const scan = decodeNativeRadar(f.bytes, "weather.radar.pro.correlation");
  assert.ok(Math.abs(scan.values[2]! - 62.5 / 300) < 1e-7);
  const hydro = decodeNativeRadar(fixture(165).bytes, "weather.radar.pro.hydrometeor");
  assert.equal(hydro.values[100], 10);
  assert.ok(Number.isNaN(hydro.values[101]));
});
test("truncated, oversized, wrong-product and malicious dimensions fail closed", () => {
  assert.throws(() => decodeNativeRadar(new Uint8Array(2000001), reflectivity), /size/);
  assert.throws(() => decodeNativeRadar(fixture().bytes.subarray(0, 151), reflectivity));
  assert.throws(() => decodeNativeRadar(fixture().bytes, "weather.radar.pro.velocity"), /identity/);
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => f.v.setUint32(f.p + 84, 0xffffffff),
    (f: ReturnType<typeof fixture>) => f.v.setUint16(f.s + 20, 65535),
    (f: ReturnType<typeof fixture>) => f.v.setUint16(f.s + 16, 17),
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => decodeNativeRadar(f.bytes, reflectivity));
  }
});
test("frame selection rejects future, stale and invalid timestamps and unsupported products", () => {
  const now = Date.parse("2026-09-13T12:00:00Z");
  const frames = [-7200000, -300000, 300000].map(
    (t) => ({ timestamp: new Date(now + t).toISOString() }) as NativeRadarFrame,
  );
  assert.equal(nativeFrameAt(frames, new Date(now).toISOString(), now), frames[1]);
  assert.equal(nativeFrameAt(frames, "invalid", now), undefined);
  assert.equal(nativeProduct(reflectivity, 3), "N3B");
  assert.equal(nativeProduct(reflectivity, 4), undefined);
  assert.equal(nativeKeyTime("../../secret"), undefined);
  assert.equal(nativeKeyTime("TLX_N0B_2026_09_13_12_00_00"), "2026-09-13T12:00:00Z");
});
test("tile rendering remains transparent outside coverage and rejects invalid coordinates", () => {
  const scan = decodeNativeRadar(fixture().bytes, reflectivity);
  assert.throws(() => renderNativeRadarTile(scan, 3, 8, 0), /Invalid/);
  assert.ok(renderNativeRadarTile(scan, 3, 0, 0).every((v) => v === 0));
});
