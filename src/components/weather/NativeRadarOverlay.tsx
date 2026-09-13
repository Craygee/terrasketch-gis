import { useEffect, useRef } from "react";
import { addProtocol, removeProtocol, type Map as RadarMap } from "maplibre-gl";
import { useMapRef } from "@/lib/gis/mapRef";
import {
  nativeFrameAt,
  nativeMapLayerId,
  type NativeRadarFrame,
  type NativeRadarReading,
} from "@/lib/weather/nativeRadar";
import type { WeatherWorkspaceState } from "@/lib/weather/types";

type Pending = { resolve(value: unknown): void; reject(error: Error): void };

export function NativeRadarOverlay({
  frames,
  workspace,
  onReading,
}: {
  frames: NativeRadarFrame[];
  workspace: WeatherWorkspaceState;
  onReading(reading: NativeRadarReading): void;
}) {
  const { map } = useMapRef();
  const workerRef = useRef<Worker | null>(null),
    pending = useRef(new Map<number, Pending>()),
    sequence = useRef(0);
  const active = useRef(new Map<string, string>());
  const onReadingRef = useRef(onReading);
  onReadingRef.current = onReading;
  const requestRef = useRef<(data: Record<string, unknown>) => Promise<unknown>>(() =>
    Promise.reject(new Error("Radar worker unavailable")),
  );

  useEffect(() => {
    const worker = new Worker(new URL("../../lib/weather/nativeRadar.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    requestRef.current = (data) =>
      new Promise((resolve, reject) => {
        if (pending.current.size >= 256) {
          reject(new Error("Radar tile queue full"));
          return;
        }
        const id = ++sequence.current;
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(new Error("Radar processing timed out"));
        }, 30000);
        pending.current.set(id, {
          resolve(value) {
            clearTimeout(timer);
            resolve(value);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          },
        });
        worker.postMessage({ ...data, id });
      });
    worker.onmessage = ({ data }) => {
      const task = pending.current.get(data.id);
      if (!task) return;
      pending.current.delete(data.id);
      if (data.error) task.reject(new Error(data.error));
      else task.resolve(data.result);
    };
    worker.onerror = () => {
      for (const task of pending.current.values()) task.reject(new Error("Radar worker failed"));
      pending.current.clear();
    };
    addProtocol("landdraft-radar", async (params, abort) => {
      if (abort.signal.aborted) throw new Error("Radar tile cancelled");
      const match = /^landdraft-radar:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
      if (!match) throw new Error("Invalid radar tile URL");
      const data = await requestRef.current({
        kind: "tile",
        key: match[1],
        z: Number(match[2]),
        x: Number(match[3]),
        y: Number(match[4]),
      });
      if (abort.signal.aborted) throw new Error("Radar tile cancelled");
      return { data: data as ArrayBuffer };
    });
    const currentPending = pending.current;
    return () => {
      worker.terminate();
      removeProtocol("landdraft-radar");
      workerRef.current = null;
      for (const task of currentPending.values()) task.reject(new Error("Radar view closed"));
      currentPending.clear();
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    const remove = (layerId: string) => {
      const id = nativeMapLayerId(layerId);
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      active.current.delete(layerId);
    };
    const update = async () => {
      if (cancelled) return;
      // getStyle() is absent until the style is initialized; unrelated tile loads must not block radar.
      if (!map.getStyle()) return;
      const grouped = new Map<string, NativeRadarFrame[]>();
      for (const frame of frames)
        if (workspace.layerSettings[frame.layerId]?.visible)
          grouped.set(frame.layerId, [...(grouped.get(frame.layerId) ?? []), frame]);
      for (const layer of active.current.keys())
        if (!grouped.has(layer) || workspace.timeline.mode === "forecast") remove(layer);
      if (workspace.timeline.mode === "forecast") return;
      for (const [layerId, candidates] of grouped) {
        const frame = nativeFrameAt(candidates, workspace.timeline.selectedTime);
        if (!frame) {
          remove(layerId);
          continue;
        }
        const id = nativeMapLayerId(layerId);
        if (active.current.get(layerId) !== frame.id) {
          remove(layerId);
          onReadingRef.current({ layerId, state: "loading" });
        }
        try {
          const reading = (await requestRef.current({
            kind: "load",
            frame,
            point: workspace.lastInspectionPoint ?? [frame.site.longitude, frame.site.latitude],
          })) as NativeRadarReading;
          if (cancelled) return;
          onReadingRef.current(reading);
          if (!map.getStyle()) return;
          if (!map.getSource(id)) {
            map.addSource(id, {
              type: "raster",
              tiles: [`landdraft-radar://${frame.id}/{z}/{x}/{y}`],
              tileSize: 256,
              minzoom: 2,
              maxzoom: 16,
              attribution: "NOAA/NWS NEXRAD · LandDraft rendering",
            });
            map.addLayer({
              id,
              type: "raster",
              source: id,
              paint: {
                "raster-opacity": workspace.layerSettings[layerId]?.opacity ?? 0.78,
                "raster-resampling": "nearest",
                "raster-fade-duration": 0,
              },
            });
          } else
            map.setPaintProperty(
              id,
              "raster-opacity",
              workspace.layerSettings[layerId]?.opacity ?? 0.78,
            );
          active.current.set(layerId, frame.id);
          orderNativeLayers(map, workspace);
        } catch (error) {
          if (!cancelled) {
            remove(layerId);
            onReadingRef.current({
              layerId,
              state: "error",
              message: error instanceof Error ? error.message : "Radar unavailable",
            });
          }
        }
      }
    };
    void update();
    map.on("style.load", update);
    return () => {
      cancelled = true;
      map.off("style.load", update);
      map.off("idle", update);
    };
  }, [map, frames, workspace]);
  useEffect(() => {
    const current = active.current;
    return () => {
      if (!map) return;
      for (const layerId of current.keys()) {
        const id = nativeMapLayerId(layerId);
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }
      current.clear();
    };
  }, [map]);
  return null;
}

function orderNativeLayers(map: RadarMap, workspace: WeatherWorkspaceState) {
  // Existing weather overlay establishes the complete order on its next update.
  // Put native imagery below official warnings immediately after creation.
  const alert = "landdraft-weather-alert-fill";
  for (const id of [...workspace.layerOrder].reverse()) {
    const rendered = nativeMapLayerId(id);
    if (map.getLayer(rendered) && map.getLayer(alert)) map.moveLayer(rendered, alert);
  }
}
