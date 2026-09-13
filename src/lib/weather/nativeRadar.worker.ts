import { decodeNativeRadar } from "./nativeRadarDecoder.ts";
import { renderNativeRadarTile } from "./nativeRadarRender.ts";
import {
  radarSample,
  HYDROMETEORS,
  NATIVE_RADAR_PRODUCTS,
  type NativeRadarScan,
  type NativeRadarFrame,
} from "./nativeRadar.ts";

type Task =
  | { id: number; kind: "load"; frame: NativeRadarFrame; point: [number, number] }
  | { id: number; kind: "tile"; key: string; z: number; x: number; y: number };
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Task>) => void) | null;
  postMessage(value: unknown, transfer?: Transferable[]): void;
};
const scans = new Map<string, NativeRadarScan>();
scope.onmessage = async ({ data: task }) => {
  try {
    if (task.kind === "load") {
      const started = performance.now();
      let scan = scans.get(task.frame.id);
      if (!scan) {
        const response = await fetch(task.frame.binaryUrl, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("NOAA radar scan could not be loaded");
        const binary = new Uint8Array(await response.arrayBuffer());
        scan = decodeNativeRadar(binary, task.frame.layerId);
        if (
          Math.abs(scan.latitude - task.frame.site.latitude) > 0.1 ||
          Math.abs(scan.longitude - task.frame.site.longitude) > 0.1 ||
          Math.abs(Date.parse(scan.timestamp) - Date.parse(task.frame.timestamp)) > 60000
        )
          throw new Error("Radar scan metadata does not match the requested site/time");
        if (scans.size >= 12) scans.delete(scans.keys().next().value!);
        scans.set(task.frame.id, scan);
      }
      const sample = radarSample(scan, ...task.point);
      scope.postMessage({
        id: task.id,
        result: {
          layerId: scan.layerId,
          state: "ready",
          site: task.frame.site.id,
          timestamp: scan.timestamp,
          elevationDeg: scan.elevationDeg,
          rangeKm: sample.rangeKm,
          beamHeightM: sample.beamHeightM,
          value: sample.value,
          units: NATIVE_RADAR_PRODUCTS[scan.layerId].units,
          sampleState: sample.state,
          ...(scan.layerId.endsWith("hydrometeor") && sample.value !== null
            ? { category: HYDROMETEORS[sample.value] }
            : {}),
          decodeMs: Math.round(performance.now() - started),
        },
      });
    } else {
      const scan = scans.get(task.key);
      if (!scan) throw new Error("Radar scan expired from the local cache");
      const pixels = renderNativeRadarTile(scan, task.z, task.x, task.y);
      const canvas = new OffscreenCanvas(256, 256),
        ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Radar rendering is not supported in this browser");
      ctx.putImageData(new ImageData(pixels, 256, 256), 0, 0);
      const binary = await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
      scope.postMessage({ id: task.id, result: binary }, [binary]);
    }
  } catch (error) {
    scope.postMessage({
      id: task.id,
      error: error instanceof Error ? error.message : "Radar processing failed",
    });
  }
};
