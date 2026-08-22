import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MlMap,
  NavigationControl,
  ScaleControl,
  GeolocateControl,
  type MapMouseEvent,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Position } from "geojson";
import { toast } from "sonner";
import { Copy, MapPin, Database, Crosshair, Trash2, Check, Undo2, X } from "lucide-react";

import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { getBasemap } from "@/lib/gis/basemaps";
import { buildLayerSpecs, sourceId, allLayerIds } from "@/lib/gis/mapStyle";
import { composeLabel } from "@/lib/gis/labels";
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

interface MenuState {
  x: number;
  y: number;
  lng: number;
  lat: number;
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<MlMap | null>(null);
  const wb = useWorkbench();
  const { setMap, setDrawerOpen, setPendingCatalogQuery, setLastPoint } = useMapRef();

  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);
  const [zoom, setZoom] = useState(6);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [draft, setDraft] = useState<Position[]>([]);
  const [ready, setReady] = useState(false);
  const [styleRevision, setStyleRevision] = useState(0);
  const styledBasemapRef = useRef(wb.basemapId);

  const drawModeRef = useRef(wb.drawMode);
  drawModeRef.current = wb.drawMode;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  /* ---------------- map init ---------------- */
  useEffect(() => {
    if (!containerRef.current || mapObj.current) return;
    const map = new MlMap({
      container: containerRef.current,
      style: getBasemap(wb.basemapId).style,
      center: TEXAS_CENTER,
      zoom: 6,
      attributionControl: { compact: true },
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
    map.on("zoom", () => setZoom(map.getZoom()));
    map.on("mousemove", (e) => setCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.on("mouseout", () => setCursor(null));
    return () => {
      observer.disconnect();
      map.off("style.load", onStyleLoad);
      map.remove();
      mapObj.current = null;
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- basemap switching ---------------- */
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready || styledBasemapRef.current === wb.basemapId) return;
    styledBasemapRef.current = wb.basemapId;
    map.setStyle(getBasemap(wb.basemapId).style, { diff: false });
  }, [wb.basemapId, ready]);

  /* ---------------- layer sync ---------------- */
  const prepared = useMemo(
    () =>
      wb.layers.map((layer) => {
        const features: Feature[] = layer.data.features.map((f, index) => ({
          ...f,
          properties: {
            ...(f.properties ?? {}),
            __idx: index,
            __selected:
              wb.selectedFeature?.layerId === layer.id && wb.selectedFeature.index === index,
            __label:
              layer.style.labelEnabled && layer.style.labelTemplate
                ? composeLabel(f as never, layer.style.labelTemplate)
                : "",
          },
        }));
        return { layer, fc: { type: "FeatureCollection", features } as FeatureCollection };
      }),
    [wb.layers, wb.selectedFeature],
  );

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
        for (const spec of map.getStyle().layers ?? []) {
          const sid = (spec as { source?: string }).source;
          if (sid && sid.startsWith("src-") && !keep.has(sid)) map.removeLayer(spec.id);
        }
        for (const sid of Object.keys(map.getStyle().sources ?? {})) {
          if (sid.startsWith("src-") && !keep.has(sid)) map.removeSource(sid);
        }

        for (const { layer, fc } of prepared) {
          const sid = sourceId(layer.id);
          const existing = map.getSource(sid) as GeoJSONSource | undefined;
          if (existing) existing.setData(fc);
          else map.addSource(sid, { type: "geojson", data: fc });

          for (const id of allLayerIds(layer.id)) if (map.getLayer(id)) map.removeLayer(id);
          for (const spec of buildLayerSpecs(layer, map)) {
            map.addLayer(spec);
            map.setLayoutProperty(spec.id, "visibility", layer.visible ? "visible" : "none");
          }
        }

        // Reorder: first item in wb.layers is topmost.
        for (const { layer } of [...prepared].reverse()) {
          for (const id of [...allLayerIds(layer.id)].reverse()) {
            if (map.getLayer(id)) map.moveLayer(id);
          }
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

  /* ---------------- interactions ---------------- */
  const addToSketchLayer = useCallback(
    (feature: Feature) => {
      const existing = wb.layers.find((l) => l.source.kind === "draw");
      if (existing) wb.appendFeature(existing.id, feature as never);
      else
        wb.addLayer({
          name: "My sketch",
          groupId: "sketch",
          source: { kind: "draw" },
          data: { type: "FeatureCollection", features: [feature] },
        });
    },
    [wb],
  );

  const finishDraft = useCallback(() => {
    const coords = draftRef.current;
    const mode = drawModeRef.current;
    if (mode === "none") return;
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
      addToSketchLayer(feature);
      toast.success(
        wantsPolygon
          ? `Shape added — ${formatArea(sqm, wb.units.area)}`
          : `Line added — ${formatLength(len, wb.units.length)}`,
      );
      setDraft([]);
      wb.setDrawMode("none");
      return;
    }
    // measurement: keep the draft on screen, just stop adding vertices
    wb.setDrawMode("none");
  }, [addToSketchLayer, wb]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !ready) return;

    const onClick = (e: MapMouseEvent) => {
      setMenu(null);
      const mode = drawModeRef.current;
      if (mode === "none") {
        const ids = wb.layers
          .filter((l) => l.visible)
          .flatMap((l) => allLayerIds(l.id))
          .filter((id) => map.getLayer(id));
        const hits = ids.length > 0 ? map.queryRenderedFeatures(e.point, { layers: ids }) : [];
        const hit = hits[0];
        if (!hit) {
          wb.setSelectedFeature(null);
          return;
        }
        const layerId = String(hit.layer.id).replace(/^(fill|line|point|label|hl)-/, "");
        const index = Number((hit.properties as Record<string, unknown>)?.["__idx"] ?? -1);
        if (index >= 0) {
          wb.setSelectedFeature({ layerId, index });
          wb.setActiveLayer(layerId);
        }
        return;
      }
      const coord: Position = [e.lngLat.lng, e.lngLat.lat];
      if (mode === "point") {
        addToSketchLayer({
          type: "Feature",
          geometry: { type: "Point", coordinates: coord },
          properties: {
            NAME: "New point",
            LAT: Number(e.lngLat.lat.toFixed(6)),
            LON: Number(e.lngLat.lng.toFixed(6)),
          },
        });
        toast.success("Point added");
        return;
      }
      setDraft((d) => [...d, coord]);
    };

    const onDblClick = (e: MapMouseEvent) => {
      if (drawModeRef.current === "none") return;
      e.preventDefault();
      finishDraft();
    };

    const onContext = (e: MapMouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.point.x, y: e.point.y, lng: e.lngLat.lng, lat: e.lngLat.lat });
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    map.on("contextmenu", onContext);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      map.off("contextmenu", onContext);
    };
  }, [ready, wb, finishDraft, addToSketchLayer]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    map.getCanvas().style.cursor = wb.drawMode === "none" ? "" : "crosshair";
  }, [wb.drawMode]);

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
    addToSketchLayer({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        NAME: "Dropped pin",
        LAT: Number(lat.toFixed(6)),
        LON: Number(lng.toFixed(6)),
      },
    });
    toast.success("Pin dropped");
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* drawing helper bar */}
      {(wb.drawMode !== "none" || draft.length > 0) && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-20 -translate-x-1/2 md:top-16">
          <div className="float-surface flex items-center gap-2 rounded-full px-3 py-2 text-xs">
            <Crosshair className="size-4 text-primary" />
            <span className="font-medium">
              {wb.drawMode === "none"
                ? "Measurement"
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
              >
                <Undo2 className="size-3.5" />
              </button>
            )}
            {wb.drawMode !== "none" && wb.drawMode !== "point" && (
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
          <span className="text-muted-foreground">z{zoom.toFixed(1)}</span>
        </div>
      </div>

      {/* right-click menu */}
      {menu && (
        <>
          <button
            className="absolute inset-0 z-30 cursor-default"
            aria-label="Close menu"
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
