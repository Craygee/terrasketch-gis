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
  const decoded = useRef(new Map<string, NativeRadarReading>());
  const failedTiles = useRef(new Set<string>());
  const completedTiles = useRef(new Set<string>());
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
      let data: unknown;
      try {
        data = await requestRef.current({
          kind: "tile",
          key: match[1],
          z: Number(match[2]),
          x: Number(match[3]),
          y: Number(match[4]),
        });
      } catch (error) {
        if (!abort.signal.aborted) {
          for (const [instanceId, frameId] of active.current) {
            if (frameId !== match[1]) continue;
            const [layerId, site] = instanceId.split("|");
            failedTiles.current.add(instanceId);
            onReadingRef.current({
              layerId: layerId!,
              site: site!,
              state: "error",
              message: error instanceof Error ? error.message : "Radar tile rendering failed",
            });
          }
        }
        throw error;
      }
      if (abort.signal.aborted) throw new Error("Radar tile cancelled");
      completedTiles.current.add(match[1]!);
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

  // Parent workspace updates (menus, forecast clocks, chaser presence) must not
  // cancel a radar decode. Restart only when the radar's actual inputs change.
  const renderInput = useRef({ frames, workspace });
  renderInput.current = { frames, workspace };
  const renderKey = JSON.stringify({
    frames,
    mode: workspace.timeline.mode,
    time: workspace.timeline.selectedTime,
    point: workspace.lastInspectionPoint,
    layers: Object.entries(workspace.layerSettings).filter(([id]) =>
      id.startsWith("weather.radar.pro."),
    ),
    order: workspace.layerOrder,
  });
  useEffect(() => {
    if (!map) return;
    const { frames, workspace } = renderInput.current;
    let cancelled = false;
    const remove = (instanceId: string) => {
      const [layerId, siteId] = instanceId.split("|");
      const id = nativeMapLayerId(layerId!, siteId);
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      const oldFrame = active.current.get(instanceId);
      if (oldFrame) completedTiles.current.delete(oldFrame);
      active.current.delete(instanceId);
      decoded.current.delete(instanceId);
      failedTiles.current.delete(instanceId);
    };
    const reportRendered = () => {
      for (const [instanceId, reading] of decoded.current) {
        const [layerId, siteId] = instanceId.split("|");
        const id = nativeMapLayerId(layerId!, siteId);
        if (
          !completedTiles.current.has(active.current.get(instanceId) ?? "") ||
          failedTiles.current.has(instanceId) ||
          !map.getSource(id) ||
          !map.isSourceLoaded(id)
        )
          continue;
        if (reading.state !== "ready") {
          const ready = { ...reading, state: "ready" as const };
          decoded.current.set(instanceId, ready);
          onReadingRef.current(ready);
        }
      }
    };
    const reportError = (event: { sourceId?: string; error: { message: string } }) => {
      for (const instanceId of active.current.keys()) {
        const [layerId, siteId] = instanceId.split("|");
        if (event.sourceId !== nativeMapLayerId(layerId!, siteId)) continue;
        failedTiles.current.add(instanceId);
        onReadingRef.current({
          layerId: layerId!,
          site: siteId!,
          state: "error",
          message: event.error.message,
        });
      }
    };
    const update = async () => {
      if (cancelled) return;
      // getStyle() means the style can accept sources. isStyleLoaded() also
      // waits for every unrelated source and can block radar indefinitely.
      if (!map.getStyle()) {
        map.off("idle", update);
        map.once("idle", update);
        return;
      }
      const grouped = new Map<string, NativeRadarFrame[]>();
      for (const frame of frames)
        if (workspace.layerSettings[frame.layerId]?.visible)
          grouped.set(`${frame.layerId}|${frame.site.id}`, [
            ...(grouped.get(`${frame.layerId}|${frame.site.id}`) ?? []),
            frame,
          ]);
      for (const layer of active.current.keys())
        if (!grouped.has(layer) || workspace.timeline.mode === "forecast") remove(layer);
      if (workspace.timeline.mode === "forecast") return;
      for (const [instanceId, candidates] of grouped) {
        const [layerId, siteId] = instanceId.split("|");
        const frame = nativeFrameAt(candidates, workspace.timeline.selectedTime);
        if (!frame) {
          remove(instanceId);
          continue;
        }
        const id = nativeMapLayerId(layerId!, siteId);
        if (active.current.get(instanceId) !== frame.id) {
          remove(instanceId);
          onReadingRef.current({ layerId: layerId!, site: siteId!, state: "loading" });
        }
        try {
          const reading = (await requestRef.current({
            kind: "load",
            frame,
            point: workspace.lastInspectionPoint ?? [frame.site.longitude, frame.site.latitude],
          })) as NativeRadarReading;
          if (cancelled) return;
          if (!map.getStyle()) {
            map.off("idle", update);
            map.once("idle", update);
            return;
          }
          if (!map.getSource(id)) {
            completedTiles.current.delete(frame.id);
            failedTiles.current.delete(instanceId);
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
                "raster-opacity": workspace.layerSettings[layerId!]?.opacity ?? 0.78,
                "raster-resampling": "nearest",
                "raster-fade-duration": 0,
              },
            });
          } else
            map.setPaintProperty(
              id,
              "raster-opacity",
              workspace.layerSettings[layerId!]?.opacity ?? 0.78,
            );
          active.current.set(instanceId, frame.id);
          orderNativeLayers(map, workspace, active.current.keys());
          const next = {
            ...reading,
            layerId: layerId!,
            site: siteId!,
            state: "rendering" as const,
          };
          decoded.current.set(instanceId, next);
          onReadingRef.current(next);
          reportRendered();
        } catch (error) {
          if (!cancelled) {
            remove(instanceId);
            onReadingRef.current({
              layerId: layerId!,
              site: siteId!,
              state: "error",
              message: error instanceof Error ? error.message : "Radar unavailable",
            });
          }
        }
      }
    };
    void update();
    map.on("style.load", update);
    map.on("sourcedata", reportRendered);
    map.on("error", reportError);
    return () => {
      cancelled = true;
      map.off("style.load", update);
      map.off("idle", update);
      map.off("sourcedata", reportRendered);
      map.off("error", reportError);
    };
  }, [map, renderKey]);
  useEffect(() => {
    const current = active.current;
    return () => {
      if (!map) return;
      for (const instanceId of current.keys()) {
        const [layerId, siteId] = instanceId.split("|");
        const id = nativeMapLayerId(layerId!, siteId);
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }
      current.clear();
    };
  }, [map]);
  return null;
}

function orderNativeLayers(
  map: RadarMap,
  workspace: WeatherWorkspaceState,
  instances: IterableIterator<string>,
) {
  // Existing weather overlay establishes the complete order on its next update.
  // Put native imagery below official warnings immediately after creation.
  const alert = "landdraft-weather-alert-fill";
  const order = new Map(workspace.layerOrder.map((id, index) => [id, index]));
  const rendered = [...instances]
    .map((instanceId) => {
      const [layerId, siteId] = instanceId.split("|");
      return { layerId: layerId!, id: nativeMapLayerId(layerId!, siteId) };
    })
    .sort((a, b) => (order.get(b.layerId) ?? 0) - (order.get(a.layerId) ?? 0));
  for (const item of rendered) {
    if (map.getLayer(item.id) && map.getLayer(alert)) map.moveLayer(item.id, alert);
  }
}
