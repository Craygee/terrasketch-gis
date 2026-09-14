import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { decodeNativeRadar } from "../src/lib/weather/nativeRadarDecoder.ts";
import { NATIVE_RADAR_PRODUCTS } from "../src/lib/weather/nativeRadar.ts";
import { renderNativeRadarTile } from "../src/lib/weather/nativeRadarRender.ts";
const root = ".weather-validation/native-radar";
await mkdir(root, { recursive: true });
const date = new Date().toISOString().slice(0, 10).replaceAll("-", "_");
const frames = [];
for (const [layerId, spec] of Object.entries(NATIVE_RADAR_PRODUCTS)) {
  const product = `N0${spec.suffix}`,
    prefix = `TLX_${product}_${date}`;
  const response = await fetch(
    `https://unidata-nexrad-level3.s3.amazonaws.com/?list-type=2&prefix=${prefix}&max-keys=1000`,
    { signal: AbortSignal.timeout(20000) },
  );
  assert.ok(response.ok);
  const xml = await response.text();
  assert.ok(!xml.includes("<IsTruncated>true</IsTruncated>"));
  const key = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
    .map((m) => m[1])
    .sort()
    .at(-1);
  assert.ok(key);
  const raw = await fetch(`https://unidata-nexrad-level3.s3.amazonaws.com/${key}`, {
    signal: AbortSignal.timeout(20000),
  });
  assert.ok(raw.ok);
  const bytes = new Uint8Array(await raw.arrayBuffer());
  await writeFile(`${root}/${product}.bin`, bytes);
  const started = performance.now(),
    scan = decodeNativeRadar(bytes, layerId);
  assert.ok(Date.now() - Date.parse(scan.timestamp) < 3600000);
  assert.ok(scan.rays >= 360);
  assert.ok(scan.bins >= 1200);
  const pixels = renderNativeRadarTile(scan, 7, 29, 50);
  const visible = pixels.filter((v, i) => i % 4 === 3 && v > 0).length;
  assert.ok(visible > 0, `${product} empty tile`);
  const corrupt = bytes.slice();
  corrupt[corrupt.length - 30] ^= 255;
  assert.throws(() => decodeNativeRadar(corrupt, layerId));
  frames.push({
    id: key,
    layerId,
    timestamp: scan.timestamp,
    binaryUrl: `/.weather-validation/native-radar/${product}.bin`,
    product,
    site: { id: "KTLX", name: "Oklahoma City", latitude: scan.latitude, longitude: scan.longitude },
  });
  console.log(
    JSON.stringify({
      product,
      timestamp: scan.timestamp,
      rays: scan.rays,
      bins: scan.bins,
      units: spec.units,
      visiblePixels: visible,
      decodeAndTileMs: Math.round(performance.now() - started),
    }),
  );
}
await writeFile(`${root}/frames.json`, JSON.stringify(frames));
