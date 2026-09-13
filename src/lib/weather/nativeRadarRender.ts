import { radarSample, radarColor, type NativeRadarScan } from "./nativeRadar.ts";

/** Reproject pixel centers from Web Mercator into the radar's polar gates.
 * Nearest gate sampling preserves discrete classes and avoids inventing values.
 */
export function renderNativeRadarTile(scan: NativeRadarScan, z: number, x: number, y: number) {
  const n = 2 ** z;
  if (
    !Number.isInteger(z) ||
    z < 0 ||
    z > 18 ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= n ||
    y >= n
  )
    throw new Error("Invalid radar tile");
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  const palette = Array.from(scan.values, (value) =>
    Number.isFinite(value) ? radarColor(scan.layerId, value) : [0, 0, 0, 0],
  );
  for (let row = 0; row < 256; row++) {
    const latitude =
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (row + 0.5) / 256)) / n))) * 180) / Math.PI;
    for (let col = 0; col < 256; col++) {
      const longitude = ((x + (col + 0.5) / 256) / n) * 360 - 180;
      const sample = radarSample(scan, longitude, latitude);
      if (sample.state === "outside" || sample.state === "missing") continue;
      const rgba =
        sample.state === "range-folded"
          ? (row + col) % 8 < 3
            ? [151, 107, 168, 130]
            : [0, 0, 0, 0]
          : palette[sample.raw]!;
      pixels.set(rgba, (row * 256 + col) * 4);
    }
  }
  return pixels;
}
