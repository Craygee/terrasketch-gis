import { useEffect, useRef } from "react";
import { fetchRemoteGeoJSON } from "@/lib/gis/arcgis";
import { useMapRef } from "@/lib/gis/mapRef";
import { useWorkbench } from "@/lib/gis/store";

type Bbox = [number, number, number, number];

interface Coverage {
  bbox: Bbox;
  zoomBucket: number;
  queryKey: string;
}

const contains = (outer: Bbox, inner: Bbox) =>
  outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

const padBbox = (bbox: Bbox, fraction = 0.06): Bbox => {
  const x = (bbox[2] - bbox[0]) * fraction;
  const y = (bbox[3] - bbox[1]) * fraction;
  return [bbox[0] - x, bbox[1] - y, bbox[2] + x, bbox[3] + y];
};

const queryTuning = (zoom: number, latitude: number) => {
  const metersPerPixel =
    (156_543.03392 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180))) / 2 ** zoom;
  return {
    maxAllowableOffset: (metersPerPixel * 0.35) / 111_320,
    geometryPrecision: zoom >= 16 ? 7 : zoom >= 12 ? 6 : 5,
  };
};

/** Keeps dense remote layers bounded to the visible map and refreshes them in place. */
export function RemoteLayerManager() {
  const { map } = useMapRef();
  const wb = useWorkbench();
  const layersRef = useRef(wb.layers);
  const updateRef = useRef(wb.updateLayer);
  const activeRequests = useRef(new Map<string, AbortController>());
  const coverage = useRef(new Map<string, Coverage>());
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
      const visibleBbox: Bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];
      const queryBbox = padBbox(visibleBbox);
      const mapZoom = map.getZoom();
      const zoomBucket = Math.floor(mapZoom);
      const latitude = (visibleBbox[1] + visibleBbox[3]) / 2;
      const tuning = queryTuning(mapZoom, latitude);
      const now = Date.now();
      const pending: Promise<void>[] = [];
      for (const layer of layersRef.current) {
        if (!layer.visible || layer.source.kind !== "remote") continue;
        const source = layer.source;
        if (!source.requiresViewport) continue;
        if ((source.minZoom ?? 0) > map.getZoom()) {
          coverage.current.delete(layer.id);
          if (layer.data.features.length)
            updateRef.current(layer.id, { data: { type: "FeatureCollection", features: [] } });
          continue;
        }
        if (scheduledOnly) {
          if (!source.refreshMinutes) continue;
          if (now - (source.lastRefreshedAt ?? 0) < source.refreshMinutes * 60_000) continue;
        }
        const queryKey = `${source.url}|${source.where ?? ""}`;
        const previousCoverage = coverage.current.get(layer.id);
        if (
          !scheduledOnly &&
          previousCoverage?.zoomBucket === zoomBucket &&
          previousCoverage.queryKey === queryKey &&
          contains(previousCoverage.bbox, visibleBbox)
        )
          continue;
        requests.get(layer.id)?.abort();
        const controller = new AbortController();
        requests.set(layer.id, controller);
        updateRef.current(layer.id, { source: { ...source, loading: true } });
        pending.push(
          (async () => {
            try {
              const data = await fetchRemoteGeoJSON(source.url, {
                bbox: queryBbox,
                where: source.where,
                maxFeatures: 2000,
                maxAllowableOffset: tuning.maxAllowableOffset,
                geometryPrecision: tuning.geometryPrecision,
                cacheHint: true,
                signal: controller.signal,
              });
              coverage.current.set(layer.id, { bbox: queryBbox, zoomBucket, queryKey });
              updateRef.current(layer.id, {
                data,
                source: { ...source, loading: false, lastRefreshedAt: Date.now() },
              });
            } catch (error) {
              if (!(error instanceof DOMException && error.name === "AbortError")) {
                updateRef.current(layer.id, { source: { ...source, loading: false } });
                console.warn(`[data] refresh failed for ${layer.name}`, error);
              }
            } finally {
              if (requests.get(layer.id) === controller) requests.delete(layer.id);
            }
          })(),
        );
      }
      await Promise.all(pending);
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
