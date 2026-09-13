import { mkdir, writeFile } from "node:fs/promises";
import { loadPublicRainfall } from "../src/lib/weather/publicRainfall.server.ts";
import { RAINFALL_HOURS, rainfallLayerId } from "../src/lib/weather/publicRainfall.ts";

// Read-only integration check: NOAA metadata, raw point samples and original
// LandDraft rendering. Run explicitly; unit tests do not depend on the network.
const frames = await loadPublicRainfall(
  { longitude: -90, latitude: 35, requestedLayerIds: RAINFALL_HOURS.map(rainfallLayerId) },
  AbortSignal.timeout(45000),
);
if (frames.length !== 7)
  throw new Error(`Expected 7 fresh rainfall periods, received ${frames.length}`);
await mkdir(".weather-validation", { recursive: true });
for (const frame of frames) {
  const url = frame.tileUrlTemplate.replace(
    "{bbox-epsg-3857}",
    "-11000000,3500000,-9000000,5500000",
  );
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok || !response.headers.get("content-type")?.includes("image/png"))
    throw new Error(`${frame.layerId}: ${response.status} ${await response.text()}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71)
    throw new Error("Invalid PNG");
  await writeFile(`.weather-validation/${frame.layerId}.png`, bytes);
  console.log(
    JSON.stringify({
      layer: frame.layerId,
      sourceTime: frame.timestamp,
      bytes: bytes.length,
      sample: frame.pointSample,
    }),
  );
}
