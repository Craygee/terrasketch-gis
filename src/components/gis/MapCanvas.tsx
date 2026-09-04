import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MlMap,
  Marker,
  NavigationControl,
  ScaleControl,
  GeolocateControl,
  setWorkerUrl,
  type MapMouseEvent,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { toast } from "sonner";
import {
  Copy,
  MapPin,
  Database,
  Crosshair,
  Trash2,
  Check,
  Undo2,
  X,
  Lock,
  Move,
  ZoomIn,
} from "lucide-react";

import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { getBasemapStyle } from "@/lib/gis/basemaps";
import {
  buildLayerSpecs,
  sourceId,
  allLayerIds,
  fillId,
  lineId,
  lineHitId,
  markerIconId,
  pointId,
} from "@/lib/gis/mapStyle";
import { composeLabel } from "@/lib/gis/labels";
import type { GisLayer } from "@/lib/gis/types";
import {
  formatArea,
  formatLength,
  formatLatLon,
  meters,
  squareMeters,
  toDms,
} from "@/lib/gis/measure";
import { cn } from "@/lib/utils";

const TEXAS_CENTER: [number, number] = [-98.5, 31.3];

// Vite can relocate the MapLibre module independently from its worker in
// production builds. Pin the worker to an emitted asset so GeoJSON sources are
// parsed reliably in hosted previews and deployments.
setWorkerUrl(mapLibreWorkerUrl);

interface MenuState {
  x: number;
  y: number;
  lng: number;
  lat: number;
}

interface SelectionBoxState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface PreparedCacheEntry {
  data: FeatureCollection;
  labelKey: string;
  fc: FeatureCollection;
}

const sourcePerformanceOptions = (layer: GisLayer, featureCount: number) => {
  if (layer.source.kind === "remote" && layer.source.requiresViewport)
    return { tolerance: 0.8, maxzoom: 17, buffer: 64, generateId: true };
  if (featureCount >= 10_000) return { tolerance: 1.2, maxzoom: 16, buffer: 64, generateId: true };
  if (featureCount >= 2_000) return { tolerance: 0.75, maxzoom: 17, buffer: 96, generateId: true };
  return { tolerance: 0.375, maxzoom: 18, buffer: 128, generateId: true };
};

function renderedLayerId(styleLayerId: string): string {
  return styleLayerId.replace(/^(line-hit|hl-point|fill|line|point|marker|label|hl)-/, "");
}

const selectableLayerIds = (layerId: string) => [
  pointId(layerId),
  markerIconId(layerId),
  lineHitId(layerId),
  lineId(layerId),
  fillId(layerId),
];

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<MlMap | null>(null);
  const wb = useWorkbench();
  const wbRef = useRef(wb);
  wbRef.current = wb;
  const {
    setMap,
    setDrawerOpen,
    setPendingCatalogQuery,
    setLastPoint,
    setPendingFeatureSave,
    editEnabled,
    setEditEnabled,
  } = useMapRef();

  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [draft, setDraft] = useState<Position[]>([]);
  const [ready, setReady] = useState(false);
  const [styleRevision, setStyleRevision] = useState(0);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null);
  const [panLocked, setPanLocked] = useState(false);
  const [zoomLocked, setZoomLocked] = useState(false);
  const selectionBoxRef = useRef<SelectionBoxState | null>(null);
  const boxDidSelectRef = useRef(false);
  const editMarkerRefs = useRef<Marker[]>([]);
  const styledBasemapRef = useRef(wb.basemapId);
  const preparedCacheRef = useRef(new Map<string, PreparedCacheEntry>());
  const sourcePayloadRef = useRef(new Map<string, FeatureCollection>());
  const styleSignatureRef = useRef(new Map<string, string>());
  const orderSignatureRef = useRef("");
  const selectedStateRef = useRef(new Map<string, Set<number>>());
  const appliedProjectRef = useRef("");

  const drawModeRef = useRef(wb.drawMode);
  drawModeRef.current = wb.drawMode;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!wb.canEditProject && editEnabled) setEditEnabled(false);
  }, [editEnabled, setEditEnabled, wb.canEditProject]);

  /* ---------------- map init ---------------- */
  useEffect(() => {
    if (!containerRef.current || mapObj.current) return;
    const map = new MlMap({
      container: containerRef.current,
      style: getBasemapStyle(wb.basemapId),
      center: wb.mapView?.center ?? TEXAS_CENTER,
      zoom: wb.mapView?.zoom ?? 6,
      bearing: wb.mapView?.bearing ?? 0,
      pitch: wb.mapView?.pitch ?? 0,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.addControl(new NavigationControl({ visualizePitch: false }), "bottom-right");
    map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-left");
    map.addControl(
      new GeolocateControl({ trackUserLocation: false, showAccuracyCircle: true }),
      "bottom-right",
    );
    mapObj.current = map;
    setMap(map);
    const onStyleLoad = () => {
      setStyleRevision((version) => version + 1);
    };
    map.on("style.load", onStyleLoad);
    map.on("load", () => {
      setReady(true);
      setStyleRevision((version) => version + 1);
      map.resize();
    });
    map.on("error", (e) => console.error("[map]", e.error ?? e));
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    map.on("mousemove", (e) => setCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.on("mouseout", () => setCursor(null));
    const rememberView = () => {
      const center = map.getCenter();
      wbRef.current.setMapView({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    };
    map.on("moveend", rememberView);
    return () => {
      observer.disconnect();
      map.off("style.load", onStyleLoad);
      map.off("moveend", rememberView);
      map.remove();
      mapObj.current = null;
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapObj.current;
    const viewKey = `${wb.projectId}:${wb.activeShare?.id ?? "project"}:${wb.activeShare?.updatedAt ?? ""}`;
    if (!map || !ready || appliedProjectRef.current === viewKey) return;
    appliedProjectRef.current = viewKey;
    map.jumpTo({
      center: wb.mapView.center,
      zoom: wb.mapView.zoom,
      bearing: wb.mapView.bearing,
      pitch: wb.mapView.pitch,
    });
  }, [ready, wb.activeShare?.id, wb.activeShare?.updatedAt, wb.mapView, wb.projectId]);

  useEffect(() => {
    const applyVerifiedBasemap = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; enabled?: boolean }>).detail;
      if (!detail?.id || detail.id !== styledBasemapRef.current) return;
      const currentMap = mapObj.current;
      if (!currentMap) return;
      currentMap.setStyle(getBasemapStyle(detail.id), { diff: false });
      if (detail.enabled) {
        toast.warning("Basemap provider switched", {
          description:
            "The preferred connection is unavailable, so an equivalent map style is active.",
        });
      }
    };
    window.addEventListener("landdraft:basemap-health", applyVerifiedBasemap);
    return () => window.removeEventListener("landdraft:basemap-health", applyVerifiedBasemap);
  }, []);

  /* ---------------- basemap switching ---------------- */
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready || styledBasemapRef.current === wb.basemapId) return;
    styledBasemapRef.current = wb.basemapId;
    map.setStyle(getBasemapStyle(wb.basemapId), { diff: false });
  }, [wb.basemapId, ready]);

  /* ---------------- layer sync ---------------- */
  const prepared = useMemo(() => {
    // Project layer-array order is the global draw stack, independent of category/group.
    // The first layer is frontmost and the final layer is backmost.
    const ordered = wb.displayLayers;
    const nextCache = new Map<string, PreparedCacheEntry>();
    const result = ordered.map((layer) => {
      const labelKey = layer.style.labelTemplate;
      const cached = preparedCacheRef.current.get(layer.id);
      if (cached && cached.data === layer.data && cached.labelKey === labelKey) {
        nextCache.set(layer.id, cached);
        return { layer, fc: cached.fc };
      }
      const features: Feature[] = layer.data.features.map((f, index) => ({
        ...f,
        properties: {
          ...(f.properties ?? {}),
          __idx: index,
          __label: layer.style.labelTemplate
            ? composeLabel(f as never, layer.style.labelTemplate)
            : "",
        },
      }));
      const fc = { type: "FeatureCollection", features } as FeatureCollection;
      nextCache.set(layer.id, { data: layer.data, labelKey, fc });
      return { layer, fc };
    });
    preparedCacheRef.current = nextCache;
    return result;
  }, [wb.displayLayers]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const sync = () => {
      if (cancelled) return;
      try {
        const keep = new Set(prepared.map((p) => sourceId(p.layer.id)));
        let rebuiltLayers = false;
        for (const spec of map.getStyle().layers ?? []) {
          const sid = (spec as { source?: string }).source;
          if (sid && sid.startsWith("src-") && !keep.has(sid)) map.removeLayer(spec.id);
        }
        for (const sid of Object.keys(map.getStyle().sources ?? {})) {
          if (sid.startsWith("src-") && !keep.has(sid)) {
            map.removeSource(sid);
            sourcePayloadRef.current.delete(sid);
            styleSignatureRef.current.delete(sid.replace(/^src-/, ""));
          }
        }

        for (const { layer, fc } of prepared) {
          const sid = sourceId(layer.id);
          const existing = map.getSource(sid) as GeoJSONSource | undefined;
          if (existing) {
            if (sourcePayloadRef.current.get(sid) !== fc) existing.setData(fc);
          } else {
            map.addSource(sid, {
              type: "geojson",
              data: fc,
              ...sourcePerformanceOptions(layer, fc.features.length),
            });
          }
          sourcePayloadRef.current.set(sid, fc);

          const styleSignature = JSON.stringify([
            layer.style,
            layer.source.kind === "remote" ? layer.source.minZoom : null,
          ]);
          const fillLayerId = allLayerIds(layer.id).at(-1) as string;
          if (
            styleSignatureRef.current.get(layer.id) !== styleSignature ||
            !map.getLayer(fillLayerId)
          ) {
            for (const id of allLayerIds(layer.id)) if (map.getLayer(id)) map.removeLayer(id);
            for (const spec of buildLayerSpecs(layer, map)) map.addLayer(spec);
            styleSignatureRef.current.set(layer.id, styleSignature);
            rebuiltLayers = true;
          }
          for (const id of allLayerIds(layer.id))
            if (map.getLayer(id))
              map.setLayoutProperty(id, "visibility", layer.visible ? "visible" : "none");
        }

        // Reorder: first item in the composed project/subproject stack is topmost.
        const orderSignature = prepared.map(({ layer }) => layer.id).join("|");
        if (rebuiltLayers || orderSignatureRef.current !== orderSignature) {
          for (const { layer } of [...prepared].reverse()) {
            for (const id of [...allLayerIds(layer.id)].reverse()) {
              if (map.getLayer(id)) map.moveLayer(id);
            }
          }
          orderSignatureRef.current = orderSignature;
        }
        ensureDraftLayers(map);
        map.triggerRepaint();
      } catch (error) {
        attempts += 1;
        if (attempts < 20) {
          retryTimer = setTimeout(sync, Math.min(500, attempts * 50));
          return;
        }
        console.error("[map] could not synchronize overlay layers", error);
      }
    };

    sync();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [prepared, ready, styleRevision]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;
    const next = new Map<string, Set<number>>();
    for (const selection of wb.selectedFeatures) {
      const sid = sourceId(selection.layerId);
      const indexes = next.get(sid) ?? new Set<number>();
      indexes.add(selection.index);
      next.set(sid, indexes);
    }
    for (const [sid, indexes] of selectedStateRef.current) {
      if (!map.getSource(sid)) continue;
      const nextIndexes = next.get(sid) ?? new Set<number>();
      for (const index of indexes)
        if (!nextIndexes.has(index))
          map.setFeatureState({ source: sid, id: index }, { selected: false });
    }
    for (const [sid, indexes] of next) {
      if (!map.getSource(sid)) continue;
      const previous = selectedStateRef.current.get(sid) ?? new Set<number>();
      for (const index of indexes)
        if (!previous.has(index))
          map.setFeatureState({ source: sid, id: index }, { selected: true });
    }
    selectedStateRef.current = next;
  }, [prepared, ready, wb.selectedFeatures]);

  /* ---------------- draft (sketch in progress) ---------------- */
  const draftFc = useMemo<FeatureCollection>(() => {
    const features: Feature[] = draft.map((p, i) => ({
      type: "Feature",
      properties: { vertex: i + 1 },
      geometry: { type: "Point", coordinates: p },
    }));
    if (draft.length >= 2)
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: draft },
      });
    const areaMode = wb.drawMode === "polygon" || wb.drawMode === "measure-area";
    if (areaMode && draft.length >= 3)
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[...draft, draft[0] as Position]] },
      });
    return { type: "FeatureCollection", features };
  }, [draft, wb.drawMode]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;
    try {
      ensureDraftLayers(map);
      (map.getSource("draft") as GeoJSONSource | undefined)?.setData(draftFc);
      map.triggerRepaint();
    } catch {
      // The layer synchronization pass retries while a replacement style initializes.
    }
  }, [draftFc, ready, styleRevision]);

  const editableFeature = useMemo(() => {
    if (!editEnabled || !wb.selectedFeature) return null;
    const layer = wb.layers.find((item) => item.id === wb.selectedFeature?.layerId);
    if (!layer || layer.source.kind === "remote") return null;
    const feature = layer.data.features[wb.selectedFeature.index];
    return feature && ["Point", "LineString", "Polygon"].includes(feature.geometry.type)
      ? feature
      : null;
  }, [editEnabled, wb.layers, wb.selectedFeature]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;
    ensureEditLayers(map);
    const source = map.getSource("feature-edit") as GeoJSONSource | undefined;
    source?.setData(
      editableFeature ? editFeatureCollection(editableFeature) : emptyFeatureCollection(),
    );
    if (editEnabled && !editableFeature) setEditEnabled(false);
  }, [editEnabled, editableFeature, ready, setEditEnabled, styleRevision]);

  useEffect(() => {
    if (editEnabled && wb.drawMode !== "none") setEditEnabled(false);
  }, [editEnabled, setEditEnabled, wb.drawMode]);

  const changeEditableGeometry = useCallback(
    (coordinate: Position, vertexIndex: number, insert = false) => {
      const selection = wb.selectedFeature;
      if (!selection || !editableFeature) return;
      const geometry = editableFeature.geometry;
      const saveGeometry = (nextGeometry: Geometry) => {
        wb.updateFeatureGeometry(selection.layerId, selection.index, nextGeometry);
        const measured = { type: "Feature", properties: {}, geometry: nextGeometry } as Feature;
        if (nextGeometry.type === "Point")
          wb.updateFeatureProperties(selection.layerId, selection.index, {
            LON: Number(nextGeometry.coordinates[0]?.toFixed(6)),
            LAT: Number(nextGeometry.coordinates[1]?.toFixed(6)),
          });
        else {
          const sqm = squareMeters(measured);
          const length = meters(measured);
          wb.updateFeatureProperties(selection.layerId, selection.index, {
            ACRES: Number((sqm / 4046.8564224).toFixed(3)),
            SQ_FT: Number((sqm * 10.7639104167).toFixed(0)),
            LENGTH_MI: Number((length / 1609.344).toFixed(3)),
          });
        }
      };
      if (geometry.type === "Point") {
        saveGeometry({
          ...geometry,
          coordinates: coordinate,
        });
      } else if (geometry.type === "LineString") {
        const coordinates = geometry.coordinates.map((item) => [...item] as Position);
        if (insert) coordinates.splice(vertexIndex + 1, 0, coordinate);
        else coordinates[vertexIndex] = coordinate;
        saveGeometry({ ...geometry, coordinates });
      } else if (geometry.type === "Polygon") {
        const rings = geometry.coordinates.map((ring) => ring.map((item) => [...item] as Position));
        const vertices = (rings[0] ?? []).slice(0, -1);
        if (insert) vertices.splice(vertexIndex + 1, 0, coordinate);
        else vertices[vertexIndex] = coordinate;
        if (vertices[0]) rings[0] = [...vertices, [...vertices[0]] as Position];
        saveGeometry({
          ...geometry,
          coordinates: rings,
        });
      }
    },
    [editableFeature, wb],
  );

  useEffect(() => {
    const map = mapObj.current;
    editMarkerRefs.current.forEach((marker) => marker.remove());
    editMarkerRefs.current = [];
    if (!map || !ready || !editableFeature) return;

    editMarkerRefs.current = editableVertices(editableFeature).map((coordinate, vertexIndex) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "feature-edit-marker";
      element.title = `Drag vertex ${vertexIndex + 1}`;
      element.setAttribute("aria-label", `Drag vertex ${vertexIndex + 1}`);
      element.addEventListener("click", (event) => event.stopPropagation());

      const marker = new Marker({ element, draggable: true, anchor: "center" })
        .setLngLat([Number(coordinate[0]), Number(coordinate[1])])
        .addTo(map);
      marker.on("dragend", () => {
        const next = marker.getLngLat();
        changeEditableGeometry([next.lng, next.lat], vertexIndex);
      });
      return marker;
    });

    return () => {
      editMarkerRefs.current.forEach((marker) => marker.remove());
      editMarkerRefs.current = [];
    };
  }, [changeEditableGeometry, editableFeature, ready]);

  /* ---------------- interactions ---------------- */
  const finishDraft = useCallback(() => {
    const coords = draftRef.current;
    const mode = drawModeRef.current;
    if (mode === "none" || mode === "select-multiple" || mode === "select-box") return;
    const isMeasure = mode === "measure-area" || mode === "measure-line";
    const wantsPolygon = mode === "polygon" || mode === "measure-area";
    if (!isMeasure) {
      if (mode === "point") return;
      if (wantsPolygon && coords.length < 3) {
        toast.error("A shape needs at least 3 points");
        return;
      }
      if (mode === "line" && coords.length < 2) {
        toast.error("A line needs at least 2 points");
        return;
      }
      const geometry: Feature["geometry"] = wantsPolygon
        ? { type: "Polygon", coordinates: [[...coords, coords[0] as Position]] }
        : { type: "LineString", coordinates: coords };
      const sqm = squareMeters({ type: "Feature", properties: {}, geometry } as Feature);
      const len = meters({ type: "Feature", properties: {}, geometry } as Feature);
      const feature: Feature = {
        type: "Feature",
        geometry,
        properties: {
          NAME: wantsPolygon ? "New shape" : "New line",
          ACRES: Number((sqm / 4046.8564224).toFixed(3)),
          SQ_FT: Number((sqm * 10.7639104167).toFixed(0)),
          LENGTH_MI: Number((len / 1609.344).toFixed(3)),
          CREATED: new Date().toISOString().slice(0, 10),
        },
      };
      setPendingFeatureSave({
        features: [feature],
        suggestedLayerName: wantsPolygon ? "Drawn areas" : "Drawn lines",
        suggestedFeatureName: wantsPolygon ? "New shape" : "New line",
        defaultGroupId: "sketch",
        source: { kind: "draw" },
      });
      setDraft([]);
      wb.setDrawMode("none");
      return;
    }
    // measurement: keep the draft on screen, just stop adding vertices
    wb.setDrawMode("none");
  }, [setPendingFeatureSave, wb]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;

    const onClick = (e: MapMouseEvent) => {
      setMenu(null);
      const mode = drawModeRef.current;
      if (mode === "none" || mode === "select-multiple") {
        if (editEnabled && map.getLayer("feature-edit-vertex")) {
          const vertexHit = map.queryRenderedFeatures(e.point, {
            layers: ["feature-edit-vertex"],
          })[0];
          if (vertexHit) return;
          const segmentHit = map.queryRenderedFeatures(e.point, {
            layers: ["feature-edit-segment-hit"],
          })[0];
          const segmentIndex = Number(segmentHit?.properties?.["segmentIndex"] ?? -1);
          if (segmentIndex >= 0) {
            changeEditableGeometry([e.lngLat.lng, e.lngLat.lat], segmentIndex, true);
            toast.success("Vertex added — drag it to refine the shape");
            return;
          }
        }
        if (boxDidSelectRef.current) {
          boxDidSelectRef.current = false;
          return;
        }
        const ids = wb.displayLayers
          .filter((l) => l.visible)
          .flatMap((l) => selectableLayerIds(l.id))
          .filter((id) => map.getLayer(id));
        const hits = ids.length > 0 ? map.queryRenderedFeatures(e.point, { layers: ids }) : [];
        const uniqueHits = new Map<string, (typeof hits)[number]>();
        for (const candidate of hits) {
          const layerId = renderedLayerId(String(candidate.layer.id));
          const index = Number((candidate.properties as Record<string, unknown>)?.["__idx"] ?? -1);
          if (index >= 0 && !uniqueHits.has(`${layerId}:${index}`))
            uniqueHits.set(`${layerId}:${index}`, candidate);
        }
        const candidates = [...uniqueHits.values()];
        const hit = wb.activeLayerId
          ? (candidates.find(
              (candidate) => renderedLayerId(String(candidate.layer.id)) === wb.activeLayerId,
            ) ?? candidates[0])
          : candidates[0];
        const additive =
          mode === "select-multiple" ||
          e.originalEvent.shiftKey ||
          e.originalEvent.ctrlKey ||
          e.originalEvent.metaKey;
        if (!hit) {
          if (!additive) wb.setSelectedFeature(null);
          return;
        }
        const layerId = renderedLayerId(String(hit.layer.id));
        const index = Number((hit.properties as Record<string, unknown>)?.["__idx"] ?? -1);
        if (index >= 0) {
          const selection = { layerId, index };
          if (additive) {
            const exists = wb.selectedFeatures.some(
              (item) => item.layerId === layerId && item.index === index,
            );
            wb.setSelectedFeatures(
              exists
                ? wb.selectedFeatures.filter(
                    (item) => item.layerId !== layerId || item.index !== index,
                  )
                : [...wb.selectedFeatures, selection],
            );
          } else {
            wb.setSelectedFeature(selection);
          }
          wb.setActiveLayer(layerId);
        }
        return;
      }
      if (mode === "select-box") return;
      const coord: Position = wb.snapEnabled
        ? (nearestVisibleVertex(map, e.point.x, e.point.y) ?? [e.lngLat.lng, e.lngLat.lat])
        : [e.lngLat.lng, e.lngLat.lat];
      if (mode === "point") {
        setPendingFeatureSave({
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: coord },
              properties: {
                NAME: "New point",
                LAT: Number(Number(coord[1]).toFixed(6)),
                LON: Number(Number(coord[0]).toFixed(6)),
                SNAPPED: coord[0] !== e.lngLat.lng || coord[1] !== e.lngLat.lat,
              },
            },
          ],
          suggestedLayerName: "Drawn points",
          suggestedFeatureName: "New point",
          defaultGroupId: "sketch",
          source: { kind: "draw" },
        });
        wb.setDrawMode("none");
        return;
      }
      setDraft((d) => [...d, coord]);
    };

    const onDblClick = (e: MapMouseEvent) => {
      if (
        drawModeRef.current === "none" ||
        drawModeRef.current === "select-multiple" ||
        drawModeRef.current === "select-box"
      )
        return;
      e.preventDefault();
      finishDraft();
    };

    const onContext = (e: MapMouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.point.x, y: e.point.y, lng: e.lngLat.lng, lat: e.lngLat.lat });
    };

    const onMouseDown = (e: MapMouseEvent) => {
      if (drawModeRef.current !== "select-box") return;
      e.preventDefault();
      const box = {
        startX: e.point.x,
        startY: e.point.y,
        currentX: e.point.x,
        currentY: e.point.y,
      };
      selectionBoxRef.current = box;
      setSelectionBox(box);
    };

    const onMouseMove = (e: MapMouseEvent) => {
      const box = selectionBoxRef.current;
      if (!box || drawModeRef.current !== "select-box") return;
      const next = { ...box, currentX: e.point.x, currentY: e.point.y };
      selectionBoxRef.current = next;
      setSelectionBox(next);
    };

    const onMouseUp = (e: MapMouseEvent) => {
      const box = selectionBoxRef.current;
      if (!box || drawModeRef.current !== "select-box") return;
      selectionBoxRef.current = null;
      setSelectionBox(null);
      const width = Math.abs(e.point.x - box.startX);
      const height = Math.abs(e.point.y - box.startY);
      if (width < 4 && height < 4) return;
      const ids = wb.displayLayers
        .filter((layer) => layer.visible)
        .flatMap((layer) => selectableLayerIds(layer.id))
        .filter((id) => map.getLayer(id));
      const hits = ids.length
        ? map.queryRenderedFeatures(
            [
              [Math.min(box.startX, e.point.x), Math.min(box.startY, e.point.y)],
              [Math.max(box.startX, e.point.x), Math.max(box.startY, e.point.y)],
            ],
            { layers: ids },
          )
        : [];
      const unique = new Map<string, { layerId: string; index: number }>();
      for (const hit of hits) {
        const layerId = renderedLayerId(String(hit.layer.id));
        const index = Number((hit.properties as Record<string, unknown>)?.["__idx"] ?? -1);
        if (index >= 0) unique.set(`${layerId}:${index}`, { layerId, index });
      }
      const selections = [...unique.values()];
      wb.setSelectedFeatures(selections);
      if (selections[0]) wb.setActiveLayer(selections[0].layerId);
      boxDidSelectRef.current = true;
      toast.success(
        selections.length
          ? `${selections.length} feature${selections.length === 1 ? "" : "s"} selected`
          : "No features in that box",
      );
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    map.on("contextmenu", onContext);
    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      map.off("contextmenu", onContext);
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
    };
  }, [ready, wb, finishDraft, setPendingFeatureSave, editEnabled, changeEditableGeometry]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    map.getCanvas().style.cursor =
      wb.drawMode === "none" || wb.drawMode === "select-multiple" ? "" : "crosshair";
    if (wb.drawMode !== "select-box") boxDidSelectRef.current = false;
    if (wb.drawMode === "select-box" || panLocked) map.dragPan.disable();
    else map.dragPan.enable();
  }, [wb.drawMode, panLocked]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    const zoomHandlers = [map.scrollZoom, map.doubleClickZoom, map.boxZoom, map.touchZoomRotate];
    zoomHandlers.forEach((handler) => (zoomLocked ? handler.disable() : handler.enable()));
    if (zoomLocked || panLocked) map.keyboard.disable();
    else map.keyboard.enable();
  }, [panLocked, zoomLocked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft([]);
        wb.setDrawMode("none");
        setMenu(null);
      }
      if (e.key === "Enter") finishDraft();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishDraft, wb]);

  /* ---------------- live readout ---------------- */
  const readout = useMemo(() => {
    if (draft.length < 2) return null;
    const areaMode = wb.drawMode === "polygon" || wb.drawMode === "measure-area";
    const line: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: draft },
    };
    const perimeter = meters(line);
    if (areaMode && draft.length >= 3) {
      const poly: Feature = {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[...draft, draft[0] as Position]] },
      };
      const sqm = squareMeters(poly);
      return {
        primary: formatArea(sqm, wb.units.area),
        secondary: `perimeter ${formatLength(perimeter, wb.units.length)}`,
        extra: `${formatArea(sqm, "sqft")} · ${formatArea(sqm, "hectares")} · ${formatArea(sqm, "sqm")}`,
      };
    }
    return {
      primary: formatLength(perimeter, wb.units.length),
      secondary: `${draft.length} points`,
      extra: `${formatLength(perimeter, "feet")} · ${formatLength(perimeter, "meters")}`,
    };
  }, [draft, wb.drawMode, wb.units]);

  const copyCoords = async (lng: number, lat: number) => {
    try {
      await navigator.clipboard.writeText(formatLatLon(lng, lat, 6));
      toast.success("Coordinates copied", { description: formatLatLon(lng, lat, 6) });
    } catch {
      toast.error("Clipboard blocked by the browser");
    }
  };

  const dropPin = (lng: number, lat: number) => {
    setPendingFeatureSave({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            NAME: "Dropped pin",
            LAT: Number(lat.toFixed(6)),
            LON: Number(lng.toFixed(6)),
          },
        },
      ],
      suggestedLayerName: "Map pins",
      suggestedFeatureName: "Dropped pin",
      defaultGroupId: "sketch",
      source: { kind: "draw" },
    });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-auto absolute bottom-48 right-2 z-20 flex flex-col gap-1">
        <button
          onClick={() => setPanLocked((locked) => !locked)}
          className={cn(
            "float-surface flex size-9 items-center justify-center rounded-xl",
            panLocked && "bg-primary text-primary-foreground",
          )}
          aria-pressed={panLocked}
          aria-label={panLocked ? "Unlock map movement" : "Lock map movement"}
          title={panLocked ? "Unlock map dragging" : "Lock the map in this location"}
        >
          {panLocked ? <Lock className="size-4" /> : <Move className="size-4" />}
        </button>
        <button
          onClick={() => setZoomLocked((locked) => !locked)}
          className={cn(
            "float-surface flex size-9 items-center justify-center rounded-xl",
            zoomLocked && "bg-primary text-primary-foreground",
          )}
          aria-pressed={zoomLocked}
          aria-label={zoomLocked ? "Unlock map zoom" : "Lock map zoom"}
          title={zoomLocked ? "Unlock map zoom" : "Lock the current zoom level"}
        >
          {zoomLocked ? <Lock className="size-4" /> : <ZoomIn className="size-4" />}
        </button>
      </div>

      {selectionBox && (
        <div
          className="pointer-events-none absolute z-30 border-2 border-primary bg-primary/15"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.currentX),
            top: Math.min(selectionBox.startY, selectionBox.currentY),
            width: Math.abs(selectionBox.currentX - selectionBox.startX),
            height: Math.abs(selectionBox.currentY - selectionBox.startY),
          }}
        />
      )}

      {editEnabled && editableFeature && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-float">
          Drag white vertices · click a highlighted edge to add a vertex
        </div>
      )}

      {/* drawing helper bar */}
      {(wb.drawMode !== "none" || draft.length > 0) && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-20 -translate-x-1/2 md:top-16">
          <div className="float-surface flex items-center gap-2 rounded-full px-3 py-2 text-xs">
            <Crosshair className="size-4 text-primary" />
            <span className="font-medium">
              {wb.drawMode === "none"
                ? "Measurement"
                : wb.drawMode === "select-multiple"
                  ? "Click features to add or remove them · New layer saves the selection"
                  : wb.drawMode === "select-box"
                    ? "Drag a box across features to select them"
                    : wb.drawMode === "point"
                      ? "Click the map to drop points"
                      : "Click to add points, double-click or Enter to finish"}
            </span>
            {readout && (
              <span className="num rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
                {readout.primary} · {readout.secondary}
              </span>
            )}
            {draft.length > 0 && (
              <button
                onClick={() => setDraft((d) => d.slice(0, -1))}
                className="rounded-full p-1 hover:bg-muted"
                aria-label="Undo last point"
                title="Remove the last point"
              >
                <Undo2 className="size-3.5" />
              </button>
            )}
            {wb.drawMode !== "none" && wb.drawMode !== "point" && wb.drawMode !== "select-box" && (
              <button
                onClick={finishDraft}
                className="flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-primary-foreground"
              >
                <Check className="size-3.5" /> Finish
              </button>
            )}
            <button
              onClick={() => {
                setDraft([]);
                wb.setDrawMode("none");
              }}
              className="rounded-full p-1 hover:bg-muted"
              aria-label="Cancel"
              title="Cancel the current drawing"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {readout && (
            <div className="num mt-1 rounded-full bg-card/90 px-3 py-1 text-center text-[10px] text-muted-foreground shadow-panel">
              {readout.extra}
            </div>
          )}
        </div>
      )}

      {/* coordinate readout */}
      <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 sm:left-24 sm:translate-x-0">
        <div className="num float-surface flex items-center gap-2 rounded-full px-3 py-1 text-[11px]">
          <span className="text-muted-foreground">WGS84</span>
          <span>{cursor ? formatLatLon(cursor.lng, cursor.lat) : "—, —"}</span>
          <span className="hidden text-muted-foreground sm:inline">
            {cursor ? `${toDms(cursor.lat, true)} ${toDms(cursor.lng, false)}` : ""}
          </span>
        </div>
      </div>

      {/* right-click menu */}
      {menu && (
        <>
          <button
            className="absolute inset-0 z-30 cursor-default"
            aria-label="Close menu"
            title="Close map menu"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="float-surface absolute z-40 w-56 overflow-hidden rounded-xl py-1 text-sm"
            style={{
              left: Math.min(menu.x, (containerRef.current?.clientWidth ?? 400) - 230),
              top: Math.min(menu.y, (containerRef.current?.clientHeight ?? 400) - 200),
            }}
          >
            <div className="num px-3 py-1.5 text-[11px] text-muted-foreground">
              {formatLatLon(menu.lng, menu.lat, 6)}
            </div>
            <MenuItem
              icon={<Copy className="size-4" />}
              label="Copy coordinates"
              onClick={() => {
                void copyCoords(menu.lng, menu.lat);
                setMenu(null);
              }}
            />
            <MenuItem
              icon={<MapPin className="size-4" />}
              label="Drop a pin here"
              onClick={() => {
                dropPin(menu.lng, menu.lat);
                setMenu(null);
              }}
            />
            <MenuItem
              icon={<Database className="size-4" />}
              label="Find data here"
              onClick={() => {
                setLastPoint({ lng: menu.lng, lat: menu.lat });
                setPendingCatalogQuery("");
                setDrawerOpen(true);
                setMenu(null);
              }}
            />
            <MenuItem
              icon={<Crosshair className="size-4" />}
              label="Center map here"
              onClick={() => {
                mapObj.current?.easeTo({ center: [menu.lng, menu.lat] });
                setMenu(null);
              }}
            />
            {draft.length > 0 && (
              <MenuItem
                icon={<Trash2 className="size-4" />}
                label="Clear measurement"
                onClick={() => {
                  setDraft([]);
                  setMenu(null);
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function nearestVisibleVertex(map: MlMap, x: number, y: number): Position | null {
  const tolerance = 12;
  const appLayerIds = (map.getStyle().layers ?? [])
    .filter(
      (layer) =>
        "source" in layer &&
        typeof layer.source === "string" &&
        layer.source.startsWith("src-") &&
        map.getLayer(layer.id),
    )
    .map((layer) => layer.id);
  const hits = appLayerIds.length
    ? map.queryRenderedFeatures(
        [
          [x - tolerance, y - tolerance],
          [x + tolerance, y + tolerance],
        ],
        { layers: appLayerIds },
      )
    : [];
  let bestCoordinate: Position | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      const point = map.project([value[0], value[1]]);
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= tolerance && distance < bestDistance) {
        bestCoordinate = [value[0], value[1]];
        bestDistance = distance;
      }
      return;
    }
    for (const child of value) visit(child);
  };
  for (const hit of hits) {
    if (hit.geometry.type === "GeometryCollection") {
      for (const geometry of hit.geometry.geometries) {
        if ("coordinates" in geometry) visit(geometry.coordinates);
      }
    } else visit(hit.geometry.coordinates);
  }
  return bestCoordinate;
}

function ensureDraftLayers(map: MlMap) {
  if (!map.getSource("draft"))
    map.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  if (!map.getLayer("draft-fill"))
    map.addLayer({
      id: "draft-fill",
      type: "fill",
      source: "draft",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#f2b73d", "fill-opacity": 0.22 },
    });
  if (!map.getLayer("draft-line"))
    map.addLayer({
      id: "draft-line",
      type: "line",
      source: "draft",
      filter: ["match", ["geometry-type"], ["LineString", "Polygon"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#f2b73d", "line-width": 3, "line-dasharray": [2, 1] },
    });
  if (!map.getLayer("draft-vertex"))
    map.addLayer({
      id: "draft-vertex",
      type: "circle",
      source: "draft",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#c9832c",
        "circle-stroke-width": 2.5,
      },
    });
}

function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function editFeatureCollection(feature: Feature): FeatureCollection {
  const features: Feature[] = [];
  const vertices = editableVertices(feature);
  const closed = feature.geometry.type === "Polygon";
  vertices.forEach((coordinate, vertexIndex) =>
    features.push({
      type: "Feature",
      properties: { editKind: "vertex", vertexIndex },
      geometry: { type: "Point", coordinates: coordinate },
    }),
  );
  const segmentCount = closed ? vertices.length : Math.max(0, vertices.length - 1);
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const start = vertices[segmentIndex];
    const end = vertices[(segmentIndex + 1) % vertices.length];
    if (!start || !end) continue;
    features.push({
      type: "Feature",
      properties: { editKind: "segment", segmentIndex },
      geometry: { type: "LineString", coordinates: [start, end] },
    });
  }
  return { type: "FeatureCollection", features };
}

function editableVertices(feature: Feature): Position[] {
  if (feature.geometry.type === "Point") return [feature.geometry.coordinates];
  if (feature.geometry.type === "LineString") return feature.geometry.coordinates;
  if (feature.geometry.type === "Polygon")
    return (feature.geometry.coordinates[0] ?? []).slice(0, -1);
  return [];
}

function ensureEditLayers(map: MlMap) {
  if (!map.getSource("feature-edit"))
    map.addSource("feature-edit", { type: "geojson", data: emptyFeatureCollection() });
  if (!map.getLayer("feature-edit-segment"))
    map.addLayer({
      id: "feature-edit-segment",
      type: "line",
      source: "feature-edit",
      filter: ["==", ["get", "editKind"], "segment"],
      paint: { "line-color": "#f2b73d", "line-width": 3, "line-dasharray": [2, 1] },
    });
  if (!map.getLayer("feature-edit-segment-hit"))
    map.addLayer({
      id: "feature-edit-segment-hit",
      type: "line",
      source: "feature-edit",
      filter: ["==", ["get", "editKind"], "segment"],
      paint: { "line-color": "#000000", "line-width": 18, "line-opacity": 0.01 },
    });
  if (!map.getLayer("feature-edit-vertex"))
    map.addLayer({
      id: "feature-edit-vertex",
      type: "circle",
      source: "feature-edit",
      filter: ["==", ["get", "editKind"], "vertex"],
      paint: {
        "circle-radius": 6,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#c9832c",
        "circle-stroke-width": 3,
      },
    });
}
