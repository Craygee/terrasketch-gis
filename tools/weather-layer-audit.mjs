// Read-only public endpoint audit. Run with Node 24: node --experimental-strip-types tools/weather-layer-audit.mjs
import { registerHooks } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith(".") && !spec.endsWith(".ts")) return next(spec + ".ts", ctx);
      throw e;
    }
  },
});
await mkdir(".weather-validation", { recursive: true });
const { decodeNativeRadar } = await import("../src/lib/weather/nativeRadarDecoder.ts");
const { loadWeatherBundle } = await import("../src/lib/weather/gateway.server.ts");
const { weatherProductRegistry } = await import("../src/lib/weather/productRegistry.ts");
const { layerAvailability } = await import("../src/lib/weather/layerAvailability.ts");
const ids = weatherProductRegistry
  .filter((p) => p.adapterStatus === "implemented")
  .map((p) => p.id);
const bundle = await loadWeatherBundle({
  latitude: 31.2,
  longitude: -98.4,
  requestedLayerIds: ids,
});
await writeFile(".weather-validation/all-layer-bundle.json", JSON.stringify(bundle, null, 2));
const results = [];
for (const p of weatherProductRegistry) {
  const state = layerAvailability(p.id, bundle, { connected: false });
  const frame = [
    ...(bundle.rasterFrames ?? []),
    ...bundle.radarFrames.map((f) => ({ ...f, layerId: "weather.radar.simple" })),
  ]
    .filter((f) => f.layerId === p.id)
    .at(-1);
  let tile = "";
  let cors = "";
  if (frame) {
    try {
      const url = frame.tileUrlTemplate
        .replace("{bbox-epsg-3857}", "-11131949,3248973,-10018754,4163881")
        .replace("{z}", "5")
        .replace("{x}", "7")
        .replace("{y}", "13");
      const r = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { Origin: "https://landdraft-test.tight-sky-0ae1.workers.dev" },
      });
      cors = r.headers.get("access-control-allow-origin") ?? "MISSING";
      const body = new Uint8Array(await r.arrayBuffer());
      tile = r.status + " " + r.headers.get("content-type") + " " + body.length + " bytes";
      if (!r.headers.get("content-type")?.startsWith("image/"))
        tile += " " + new TextDecoder().decode(body).slice(0, 300);
    } catch (e) {
      tile = String(e);
    }
  }
  const native = bundle.nativeRadarFrames?.filter((f) => f.layerId === p.id).at(-1);
  if (native) {
    try {
      const r = await fetch("https://unidata-nexrad-level3.s3.amazonaws.com/" + native.id, {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const scan = decodeNativeRadar(new Uint8Array(await r.arrayBuffer()), native.layerId);
      tile = "decoded " + scan.rays + " rays / " + scan.bins + " bins";
    } catch (e) {
      tile = String(e);
    }
  }
  const row = { id: p.id, adapter: p.adapterStatus, status: state.label, tile, cors };
  results.push(row);
  console.log(JSON.stringify(row));
}
await writeFile(
  ".weather-validation/all-layer-audit.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      results,
      health: bundle.providerHealth,
      warnings: bundle.warnings,
    },
    null,
    2,
  ),
);

const failures = results.filter(
  (row) =>
    row.adapter === "implemented" &&
    row.id !== "weather.storm_chaser.spotters" &&
    row.id !== "weather.lightning.recent" &&
    ((row.status !== "Available" &&
      !row.status.startsWith("Connected") &&
      !row.status.startsWith("Latest image")) ||
      (row.tile && !row.tile.startsWith("200 image/") && !row.tile.startsWith("decoded"))),
);
console.log(
  `${results.length} catalog entries checked; ${failures.length} unexpected failures. Chaser presence requires a signed-in browser check; restricted lightning and planned adapters are reported separately.`,
);
process.exitCode = failures.length ? 1 : 0;
