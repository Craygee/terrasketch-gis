import { Buffer } from "buffer/index.js";
import bzip from "seek-bzip";
import {
  NATIVE_RADAR_PRODUCTS,
  type NativeRadarLayer,
  type NativeRadarScan,
} from "./nativeRadar.ts";

// seek-bzip expects Buffer. Scope the compatibility runtime to this worker module.
const runtime = globalThis as unknown as { Buffer?: typeof Buffer };
runtime.Buffer ??= Buffer;
const fail = (message: string): never => {
  throw new Error(`Invalid NOAA radar: ${message}`);
};
const radarDate = (days: number, seconds: number) => {
  if (days < 1 || seconds < 0 || seconds >= 86400) return fail("date");
  return new Date((days - 1) * 86400000 + seconds * 1000).toISOString();
};

/** Bounded decoder for modern Level III digital radial packet 16 only.
 * NOAA RPG-to-user ICD structure and scaling, cross-checked with Unidata MetPy.
 * Unsupported packets, incomplete scans, and corrupt compression fail closed.
 */
export function decodeNativeRadar(
  input: Uint8Array,
  expectedLayer: NativeRadarLayer,
): NativeRadarScan {
  if (input.length < 150 || input.length > 2_000_000) return fail("file size");
  const text = new TextDecoder("ascii").decode(input.subarray(0, 64));
  const header = /^SDUS\d{2} [A-Z0-9]{4} \d{6}\r\r\nN[0-3][BGCXKH][A-Z0-9]{3}\r\r\n/.exec(text);
  if (!header) return fail("WMO header");
  const start = header[0].length,
    p = start + 18;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const spec = NATIVE_RADAR_PRODUCTS[expectedLayer];
  if (
    !spec ||
    view.getUint16(start) !== spec.code ||
    view.getInt16(p) !== -1 ||
    view.getUint16(p + 12) !== spec.code
  )
    return fail("product identity");
  const latitude = view.getInt32(p + 2) / 1000,
    longitude = view.getInt32(p + 6) / 1000;
  const elevationDeg = view.getInt16(p + 40) / 10;
  if (
    Math.abs(latitude) > 85 ||
    Math.abs(longitude) > 180 ||
    elevationDeg < -1 ||
    elevationDeg > 25
  )
    return fail("site/elevation");
  const expectedSize = view.getUint32(p + 84),
    compression = view.getUint16(p + 82);
  if (expectedSize < 30 || expectedSize > 4_000_000 || compression > 1)
    return fail("compression size");
  let body: Uint8Array;
  if (compression === 1) {
    body = new Uint8Array(expectedSize);
    let pos = 0;
    bzip.decode(input.subarray(start + 120), {
      writeByte(value) {
        if (pos >= body.length) return fail("decompression limit");
        body[pos++] = value;
      },
    });
    if (pos !== expectedSize) return fail("truncated decompression");
  } else body = input.subarray(start + 120);
  const d = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const sym = view.getUint32(p + 90) * 2 - 120;
  if (
    sym < 0 ||
    sym + 30 > body.length ||
    d.getInt16(sym) !== -1 ||
    d.getUint16(sym + 2) !== 1 ||
    d.getUint16(sym + 8) !== 1
  )
    return fail("symbology");
  if (
    d.getUint32(sym + 4) > body.length - sym ||
    d.getInt16(sym + 10) !== -1 ||
    d.getUint16(sym + 16) !== 16
  )
    return fail("radial packet");
  const end = sym + 16 + d.getUint32(sym + 12);
  const firstGate = d.getUint16(sym + 18),
    bins = d.getUint16(sym + 20),
    rays = d.getUint16(sym + 28);
  if (
    end > body.length ||
    bins < 1 ||
    bins > 1840 ||
    rays < 1 ||
    rays > 720 ||
    firstGate > bins ||
    d.getInt16(sym + 22) !== 0 ||
    d.getInt16(sym + 24) !== 0
  )
    return fail("radial dimensions");
  const data = new Uint8Array(bins * rays),
    angles = new Float32Array(rays),
    widths = new Float32Array(rays);
  const azimuthIndex = new Int16Array(3600).fill(-1);
  let pos = sym + 30;
  for (let r = 0; r < rays; r++) {
    if (pos + 6 > end) return fail("radial header truncated");
    const count = d.getUint16(pos),
      angle = d.getInt16(pos + 2) / 10,
      width = d.getInt16(pos + 4) / 10;
    if (
      count !== bins ||
      angle < 0 ||
      angle >= 360 ||
      width <= 0 ||
      width > 2 ||
      pos + 6 + count > end
    )
      return fail("radial data truncated");
    angles[r] = angle;
    widths[r] = width;
    data.set(body.subarray(pos + 6, pos + 6 + bins), r * bins);
    pos += 6 + count;
    for (let a = Math.round(angle * 10); a < Math.round((angle + width) * 10); a++)
      azimuthIndex[a % 3600] = r;
  }
  if (pos !== end) return fail("unexpected trailing radial data");
  const values = new Float32Array(256).fill(NaN);
  if (spec.code === 153 || spec.code === 154) {
    const minimum = view.getInt16(p + 42) / 10,
      increment = view.getInt16(p + 44) / 10,
      count = view.getUint16(p + 46);
    if (!(increment > 0 && increment <= 10 && count > 0 && count <= 254))
      return fail("linear scale");
    for (let value = 2; value < count + 2; value++)
      values[value] = minimum + (value - 2) * increment;
  } else if (spec.code === 165) {
    for (let value = 10; value <= 140; value += 10) values[value] = value / 10;
  } else {
    const scale = view.getFloat32(p + 42),
      offset = view.getFloat32(p + 46),
      max = view.getUint16(p + 52),
      leading = view.getUint16(p + 54),
      trailing = view.getUint16(p + 56);
    if (
      !Number.isFinite(scale) ||
      scale <= 0 ||
      !Number.isFinite(offset) ||
      max > 255 ||
      leading < 2 ||
      leading > max ||
      trailing > max
    )
      return fail("floating scale");
    for (let value = leading; value <= max - trailing; value++)
      values[value] = (value - offset) / scale;
  }
  return {
    layerId: expectedLayer,
    latitude,
    longitude,
    altitudeM: view.getInt16(p + 10) * 0.3048,
    elevationDeg,
    timestamp: radarDate(view.getUint16(p + 22), view.getUint32(p + 24)),
    generatedAt: radarDate(view.getUint16(p + 28), view.getUint32(p + 30)),
    rangeKm: spec.rangeKm,
    gateWidthKm: spec.rangeKm / bins,
    firstGate,
    bins,
    rays,
    angles,
    widths,
    data,
    values,
    azimuthIndex,
  };
}
