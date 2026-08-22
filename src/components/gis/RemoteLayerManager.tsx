import { useEffect, useRef } from "react";
import { fetchRemoteGeoJSON } from "@/lib/gis/arcgis";
import { useMapRef } from "@/lib/gis/mapRef";
import { useWorkbench } from "@/lib/gis/store";

/** Keeps dense remote layers bounded to the visible map and refreshes them in place. */
export function RemoteLayerManager() {
  const { map } = useMapRef();
  const wb = useWorkbench();
  const layersRef = useRef(wb.layers);
  const updateRef = useRef(wb.updateLayer);
  const activeRequests = useRef(new Map<string, AbortController>());
  layersRef.current = wb.layers;
  updateRef.current = wb.updateLayer;
  const remoteSignature = wb.layers
    .filter((layer) => layer.source.kind === "remote")
    .map((layer) =>
      layer.source.kind === "remote"
        ? [
            layer.id,
            layer.visible,
            layer.source.url,
            layer.source.where ?? "",
            layer.source.minZoom ?? 0,
          ].join(":")
        : "",
    )
    .join("|");

  useEffect(() => {
    if (!map) return;
    const requests = activeRequests.current;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async (scheduledOnly = false) => {
      const bounds = map.getBounds();
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];
      const now = Date.now();
      for (const layer of layersRef.current) {
        if (!layer.visible || layer.source.kind !== "remote") continue;
        const source = layer.source;
        if (!source.requiresViewport) continue;
        if ((source.minZoom ?? 0) > map.getZoom()) {
          if (layer.data.features.length)
            updateRef.current(layer.id, { data: { type: "FeatureCollection", features: [] } });
          continue;
        }
        if (scheduledOnly) {
          if (!source.refreshMinutes) continue;
          if (now - (source.lastRefreshedAt ?? 0) < source.refreshMinutes * 60_000) continue;
        }
        requests.get(layer.id)?.abort();
        const controller = new AbortController();
        requests.set(layer.id, controller);
        try {
          const data = await fetchRemoteGeoJSON(source.url, {
            bbox,
            where: source.where,
            maxFeatures: 3000,
            signal: controller.signal,
          });
          updateRef.current(layer.id, { data, source: { ...source, lastRefreshedAt: Date.now() } });
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError"))
            console.warn(`[data] refresh failed for ${layer.name}`, error);
        } finally {
          if (requests.get(layer.id) === controller) requests.delete(layer.id);
        }
      }
    };

    void refresh(false);
    const onMoveEnd = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(false), 450);
    };
    map.on("moveend", onMoveEnd);
    const interval = window.setInterval(() => void refresh(true), 60_000);
    return () => {
      if (timer) clearTimeout(timer);
      window.clearInterval(interval);
      map.off("moveend", onMoveEnd);
      for (const controller of requests.values()) controller.abort();
      requests.clear();
    };
  }, [map, remoteSignature]);

  return null;
}
