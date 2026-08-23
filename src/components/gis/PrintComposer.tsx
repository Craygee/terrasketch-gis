import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Crosshair,
  LocateFixed,
  MapPin,
  MessageSquareText,
  Minus,
  Printer,
  RotateCcw,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  Map as MlMap,
  Marker,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
} from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";

import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { getBasemap } from "@/lib/gis/basemaps";
import { allLayerIds, buildLayerSpecs, sourceId } from "@/lib/gis/mapStyle";
import { composeLabel } from "@/lib/gis/labels";
import type { GisLayer, PrintAnnotation, PrintComposition } from "@/lib/gis/types";
import { cn } from "@/lib/utils";

const uid = () => window.crypto.randomUUID();

const defaultComposition = (
  projectName: string,
  layers: GisLayer[],
  view?: PrintComposition["mapView"],
): PrintComposition => ({
  title: projectName,
  subtitle: "",
  paper: "letter",
  orientation: "landscape",
  showTitle: true,
  showLegend: true,
  showCompass: true,
  showScale: true,
  showDate: false,
  showAttribution: true,
  frameBorder: true,
  frame: { x: 5, y: 14, width: 90, height: 78 },
  includedLayerIds: layers.filter((layer) => layer.visible).map((layer) => layer.id),
  legendItems: Object.fromEntries(
    layers.map((layer) => [layer.id, { visible: layer.visible, name: layer.name }]),
  ),
  annotations: [],
  ...(view ? { mapView: view } : {}),
});

export function PrintComposer() {
  const wb = useWorkbench();
  const { map: liveMap, lastPoint, setPrintOpen } = useMapRef();
  const liveView = liveMap
    ? {
        center: [liveMap.getCenter().lng, liveMap.getCenter().lat] as [number, number],
        zoom: liveMap.getZoom(),
        bearing: liveMap.getBearing(),
        pitch: liveMap.getPitch(),
      }
    : undefined;
  const [composition, setComposition] = useState<PrintComposition>(() => {
    const base = wb.printComposition ?? defaultComposition(wb.projectName, wb.displayLayers);
    const known = new Set(wb.displayLayers.map((layer) => layer.id));
    const included = base.includedLayerIds.filter((id) => known.has(id));
    const legendItems = Object.fromEntries(
      wb.displayLayers.map((layer) => [
        layer.id,
        base.legendItems?.[layer.id] ?? { visible: layer.visible, name: layer.name },
      ]),
    );
    return {
      ...defaultComposition(wb.projectName, wb.displayLayers, liveView),
      ...base,
      ...((liveView ?? base.mapView) ? { mapView: liveView ?? base.mapView } : {}),
      includedLayerIds:
        included.length > 0
          ? included
          : wb.displayLayers.filter((layer) => layer.visible).map((layer) => layer.id),
      legendItems,
    };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<
    null | { kind: "line" | "arrow"; start?: { x: number; y: number } } | { kind: "callout" }
  >(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const printMapRef = useRef<MlMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const scaleRef = useRef<ScaleControl | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapBearing, setMapBearing] = useState(liveView?.bearing ?? 0);
  const [mapRevision, setMapRevision] = useState(0);
  const setSavedComposition = wb.setPrintComposition;

  const selected = composition.annotations.find((item) => item.id === selectedId);
  const includedLayers = useMemo(
    () => wb.displayLayers.filter((layer) => composition.includedLayerIds.includes(layer.id)),
    [composition.includedLayerIds, wb.displayLayers],
  );
  const legendLayers = useMemo(
    () => wb.displayLayers.filter((layer) => composition.legendItems[layer.id]?.visible),
    [composition.legendItems, wb.displayLayers],
  );
  const hasCallouts = composition.annotations.some((item) => item.type === "callout");

  const update = useCallback((patch: Partial<PrintComposition>) => {
    setComposition((current) => ({ ...current, ...patch }));
  }, []);

  const updateAnnotation = useCallback((id: string, patch: Partial<PrintAnnotation>) => {
    setComposition((current) => ({
      ...current,
      annotations: current.annotations.map((item) =>
        item.id === id ? ({ ...item, ...patch } as PrintAnnotation) : item,
      ),
    }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSavedComposition(composition), 500);
    return () => window.clearTimeout(timer);
  }, [composition, setSavedComposition]);

  useEffect(() => {
    if (!mapContainerRef.current || printMapRef.current) return;
    const view = composition.mapView;
    const map = new MlMap({
      container: mapContainerRef.current,
      style: getBasemap(wb.basemapId).style,
      center: view?.center ?? [-98.5, 31.3],
      zoom: view?.zoom ?? 6,
      bearing: view?.bearing ?? 0,
      pitch: view?.pitch ?? 0,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.addControl(new NavigationControl({ visualizePitch: false }), "bottom-right");
    map.on("load", () => setMapReady(true));
    map.on("moveend", () => {
      const center = map.getCenter();
      setMapBearing(map.getBearing());
      setMapRevision((revision) => revision + 1);
      setComposition((current) => ({
        ...current,
        mapView: {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        },
      }));
    });
    printMapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(mapContainerRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      printMapRef.current = null;
    };
    // The print map is a snapshot and deliberately initializes only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = printMapRef.current;
    if (!map) return;
    const timer = window.setTimeout(() => {
      map.resize();
      setMapRevision((revision) => revision + 1);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [composition.frame, composition.orientation, composition.paper]);

  useEffect(() => {
    const map = printMapRef.current;
    if (!map || !mapReady) return;
    const keep = new Set(includedLayers.map((layer) => sourceId(`print-${layer.id}`)));
    for (const spec of map.getStyle().layers ?? []) {
      const sid = (spec as { source?: string }).source;
      if (sid?.startsWith("src-print-") && !keep.has(sid)) map.removeLayer(spec.id);
    }
    for (const sid of Object.keys(map.getStyle().sources ?? {})) {
      if (sid.startsWith("src-print-") && !keep.has(sid)) map.removeSource(sid);
    }
    for (const layer of [...includedLayers].reverse()) {
      const printLayer: GisLayer = { ...layer, id: `print-${layer.id}` };
      const sid = sourceId(printLayer.id);
      const data: FeatureCollection = {
        type: "FeatureCollection",
        features: layer.data.features.map((feature, index) => ({
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            __idx: index,
            __label: layer.style.labelTemplate
              ? composeLabel(feature as never, layer.style.labelTemplate)
              : "",
          },
        })) as Feature[],
      };
      const source = map.getSource(sid) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource(sid, { type: "geojson", data, generateId: true });
        for (const spec of buildLayerSpecs(printLayer, map)) map.addLayer(spec);
      }
      for (const id of allLayerIds(printLayer.id))
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    }
  }, [includedLayers, mapReady]);

  useEffect(() => {
    const map = printMapRef.current;
    if (!map || !mapReady) return;
    if (composition.showScale && !scaleRef.current) {
      scaleRef.current = new ScaleControl({ unit: "imperial", maxWidth: 110 });
      map.addControl(scaleRef.current, "bottom-left");
    } else if (!composition.showScale && scaleRef.current) {
      map.removeControl(scaleRef.current);
      scaleRef.current = null;
    }
  }, [composition.showScale, mapReady]);

  useEffect(() => {
    const map = printMapRef.current;
    if (!map || !mapReady) return;
    for (const marker of markerRefs.current) marker.remove();
    markerRefs.current = composition.annotations
      .filter(
        (item): item is Extract<PrintAnnotation, { type: "marker" }> => item.type === "marker",
      )
      .map((item) => {
        const element = document.createElement("button");
        element.className = "print-map-marker";
        element.style.setProperty("--marker-color", item.color);
        element.title = item.label;
        const coordinates = `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`;
        element.innerHTML = `<span></span><b>${item.gpsOnly ? coordinates : escapeHtml(item.label)}${
          item.showCoordinates && !item.gpsOnly ? `<small>${coordinates}</small>` : ""
        }</b>`;
        element.onclick = () => setSelectedId(item.id);
        const marker = new Marker({ element, anchor: "bottom", draggable: true })
          .setLngLat([item.lng, item.lat])
          .addTo(map);
        marker.on("dragend", () => {
          const lngLat = marker.getLngLat();
          updateAnnotation(item.id, { lng: lngLat.lng, lat: lngLat.lat });
        });
        return marker;
      });
    return () => {
      for (const marker of markerRefs.current) marker.remove();
      markerRefs.current = [];
    };
  }, [composition.annotations, mapReady, updateAnnotation]);

  const addAnnotation = (type: "text" | "line" | "arrow") => {
    const item: PrintAnnotation =
      type === "text"
        ? {
            id: uid(),
            type,
            x: 45,
            y: 45,
            text: "Map note",
            textColor: "#17221a",
            backgroundColor: "#ffffff",
            font: "Inter",
            fontSize: 14,
          }
        : {
            id: uid(),
            type,
            x: 35,
            y: 50,
            x2: 62,
            y2: 50,
            color: "#b0453a",
            width: 3,
          };
    update({ annotations: [...composition.annotations, item] });
    setSelectedId(item.id);
  };

  const pointOnPage = (clientX: number, clientY: number) => {
    const page = pageRef.current;
    if (!page) return null;
    const rect = page.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const startPointDrag = (
    event: React.PointerEvent,
    item: Extract<PrintAnnotation, { type: "line" | "arrow" }>,
    endpoint: "start" | "end" | "whole",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    const origin = pointOnPage(event.clientX, event.clientY);
    if (!origin) return;
    const initial = { x: item.x, y: item.y, x2: item.x2, y2: item.y2 };
    const move = (pointerEvent: PointerEvent) => {
      const point = pointOnPage(pointerEvent.clientX, pointerEvent.clientY);
      if (!point) return;
      if (endpoint === "start") updateAnnotation(item.id, { x: point.x, y: point.y });
      else if (endpoint === "end") updateAnnotation(item.id, { x2: point.x, y2: point.y });
      else {
        const dx = point.x - origin.x;
        const dy = point.y - origin.y;
        updateAnnotation(item.id, {
          x: Math.max(0, Math.min(100, initial.x + dx)),
          y: Math.max(0, Math.min(100, initial.y + dy)),
          x2: Math.max(0, Math.min(100, initial.x2 + dx)),
          y2: Math.max(0, Math.min(100, initial.y2 + dy)),
        });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const startBoxDrag = (
    event: React.PointerEvent,
    item: Extract<PrintAnnotation, { type: "text" | "callout" }>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    const origin = pointOnPage(event.clientX, event.clientY);
    if (!origin) return;
    const initial = { x: item.x, y: item.y };
    const move = (pointerEvent: PointerEvent) => {
      const point = pointOnPage(pointerEvent.clientX, pointerEvent.clientY);
      if (!point) return;
      updateAnnotation(item.id, {
        x: Math.max(0, Math.min(100, initial.x + point.x - origin.x)),
        y: Math.max(0, Math.min(100, initial.y + point.y - origin.y)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const calloutTarget = useCallback(
    (item: Extract<PrintAnnotation, { type: "callout" }>) => {
      void mapRevision;
      const map = printMapRef.current;
      const mapElement = mapContainerRef.current;
      const page = pageRef.current;
      if (!map || !mapElement || !page) return { x: 50, y: 50 };
      const point = map.project([item.lng, item.lat]);
      const mapRect = mapElement.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      return {
        x: ((mapRect.left - pageRect.left + point.x) / pageRect.width) * 100,
        y: ((mapRect.top - pageRect.top + point.y) / pageRect.height) * 100,
      };
    },
    [mapRevision],
  );

  const arrangeCallouts = (annotations: PrintAnnotation[], map: MlMap): PrintAnnotation[] => {
    const callouts = annotations.filter(
      (item): item is Extract<PrintAnnotation, { type: "callout" }> => item.type === "callout",
    );
    const centerLng = map.getCenter().lng;
    const left = callouts.filter((item) => item.lng <= centerLng).sort((a, b) => b.lat - a.lat);
    const right = callouts.filter((item) => item.lng > centerLng).sort((a, b) => b.lat - a.lat);
    const positions = new Map<string, { x: number; y: number }>();
    const place = (items: typeof callouts, x: number) =>
      items.forEach((item, index) =>
        positions.set(item.id, {
          x,
          y: 20 + ((index + 1) / (items.length + 1)) * 68,
        }),
      );
    place(left, 8);
    place(right, 92);
    return annotations.map((item) => {
      if (item.type !== "callout") return item;
      return { ...item, ...(positions.get(item.id) ?? { x: 8, y: 50 }) };
    });
  };

  const handlePlacement = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!placementMode) return;
    const point = pointOnPage(event.clientX, event.clientY);
    if (!point) return;
    if (placementMode.kind === "line" || placementMode.kind === "arrow") {
      if (!placementMode.start) {
        setPlacementMode({ ...placementMode, start: point });
        return;
      }
      const item: PrintAnnotation = {
        id: uid(),
        type: placementMode.kind,
        x: placementMode.start.x,
        y: placementMode.start.y,
        x2: point.x,
        y2: point.y,
        color: "#b0453a",
        width: 3,
      };
      update({ annotations: [...composition.annotations, item] });
      setSelectedId(item.id);
      setPlacementMode(null);
      return;
    }
    const map = printMapRef.current;
    const mapElement = mapContainerRef.current;
    if (!map || !mapElement) return;
    const rect = mapElement.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      return;
    const lngLat = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
    const item: PrintAnnotation = {
      id: uid(),
      type: "callout",
      lng: lngLat.lng,
      lat: lngLat.lat,
      x: lngLat.lng <= map.getCenter().lng ? 8 : 92,
      y: point.y,
      text: "Location note",
      color: "#b0453a",
      backgroundColor: "#ffffff",
      textColor: "#17221a",
      contentMode: "label",
    };
    const annotations = arrangeCallouts([...composition.annotations, item], map);
    const bounds = map.getBounds();
    bounds.extend([lngLat.lng, lngLat.lat]);
    update({
      annotations,
      frame: { ...composition.frame, x: 18, width: 64 },
    });
    setSelectedId(item.id);
    setPlacementMode(null);
    window.setTimeout(() => {
      map.resize();
      map.fitBounds(bounds, { padding: 55, maxZoom: map.getZoom(), duration: 450 });
    }, 120);
  };

  const addMarker = (point?: { lng: number; lat: number } | null, gpsOnly = false) => {
    const center = printMapRef.current?.getCenter();
    const location = point ?? (center ? { lng: center.lng, lat: center.lat } : null);
    if (!location) return;
    const item: PrintAnnotation = {
      id: uid(),
      type: "marker",
      lng: location.lng,
      lat: location.lat,
      label: point ? "GPS location" : "Map marker",
      color: "#c9832c",
      showCoordinates: Boolean(point),
      gpsOnly,
    };
    update({ annotations: [...composition.annotations, item] });
    setSelectedId(item.id);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    update({ annotations: composition.annotations.filter((item) => item.id !== selectedId) });
    setSelectedId(null);
  };

  const resetView = () => {
    if (!liveMap || !printMapRef.current) return;
    printMapRef.current.jumpTo({
      center: liveMap.getCenter(),
      zoom: liveMap.getZoom(),
      bearing: liveMap.getBearing(),
      pitch: liveMap.getPitch(),
    });
  };

  const close = () => {
    setSavedComposition(composition);
    setPrintOpen(false);
  };

  const pageRatio = pageAspect(composition.paper, composition.orientation);

  return (
    <div className="print-composer fixed inset-0 z-[100] flex flex-col bg-[#e9e8e2] text-foreground">
      <header className="print-composer-ui flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-3">
        <button
          onClick={close}
          className="rounded-xl p-2 hover:bg-accent"
          aria-label="Close print preview"
        >
          <X className="size-4" />
        </button>
        <div className="hidden shrink-0 sm:block">
          <h1 className="text-sm font-bold">Print map</h1>
          <p className="text-[10px] text-muted-foreground">
            A saved composition—your project map stays unchanged
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ComposerButton icon={<Type />} label="Text" onClick={() => addAnnotation("text")} />
          <ComposerButton
            icon={<Minus />}
            label="Line"
            active={placementMode?.kind === "line"}
            onClick={() => setPlacementMode({ kind: "line" })}
          />
          <ComposerButton
            icon={<ArrowRight />}
            label="Arrow"
            active={placementMode?.kind === "arrow"}
            onClick={() => setPlacementMode({ kind: "arrow" })}
          />
          <ComposerButton
            icon={<MessageSquareText />}
            label="Callout"
            active={placementMode?.kind === "callout"}
            onClick={() => setPlacementMode({ kind: "callout" })}
          />
          <ComposerButton icon={<MapPin />} label="Marker" onClick={() => addMarker()} />
          <ComposerButton
            icon={<Crosshair />}
            label="Decimal GPS"
            onClick={() => {
              const center = printMapRef.current?.getCenter();
              const point = lastPoint ?? (center ? { lng: center.lng, lat: center.lat } : null);
              addMarker(point, true);
            }}
          />
          <ComposerButton icon={<RotateCcw />} label="Project view" onClick={resetView} />
          <button
            onClick={() => window.print()}
            className="ml-1 flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Printer className="size-4" /> Print / Save PDF
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="print-composer-ui w-64 shrink-0 overflow-y-auto border-r border-border bg-card p-3 text-xs">
          <h2 className="mb-2 font-semibold">Page</h2>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={composition.paper}
              onChange={(paper) => update({ paper: paper as PrintComposition["paper"] })}
              options={["letter", "legal", "a4"]}
            />
            <Select
              value={composition.orientation}
              onChange={(orientation) =>
                update({ orientation: orientation as PrintComposition["orientation"] })
              }
              options={["landscape", "portrait"]}
            />
          </div>
          <Field label="Title" value={composition.title} onChange={(title) => update({ title })} />
          <Field
            label="Subtitle"
            value={composition.subtitle}
            onChange={(subtitle) => update({ subtitle })}
          />
          <div className="mt-3 grid grid-cols-2 gap-1">
            {(
              [
                ["showTitle", "Title"],
                ["showLegend", "Legend"],
                ["showCompass", "Compass"],
                ["showScale", "Scale"],
              ] as const
            ).map(([key, label]) => (
              <CheckOption
                key={key}
                checked={composition[key]}
                label={label}
                onChange={(checked) => update({ [key]: checked })}
              />
            ))}
          </div>

          <details className="group mt-3 rounded-xl border border-border">
            <summary className="cursor-pointer list-none px-3 py-2 font-semibold">
              Map layers
            </summary>
            <div className="space-y-1 border-t border-border p-2">
              <div className="grid grid-cols-[auto_auto_1fr] gap-2 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Map</span>
                <span>Key</span>
                <span>Legend name</span>
              </div>
              {wb.displayLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="grid grid-cols-[auto_auto_1fr] items-center gap-2 rounded-lg p-1.5 hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={composition.includedLayerIds.includes(layer.id)}
                    onChange={(event) =>
                      update({
                        includedLayerIds: event.target.checked
                          ? [...composition.includedLayerIds, layer.id]
                          : composition.includedLayerIds.filter((id) => id !== layer.id),
                      })
                    }
                    className="accent-primary"
                    aria-label={`Show ${layer.name} on print map`}
                  />
                  <input
                    type="checkbox"
                    checked={composition.legendItems[layer.id]?.visible ?? false}
                    onChange={(event) =>
                      update({
                        legendItems: {
                          ...composition.legendItems,
                          [layer.id]: {
                            visible: event.target.checked,
                            name: composition.legendItems[layer.id]?.name ?? layer.name,
                          },
                        },
                      })
                    }
                    className="accent-primary"
                    aria-label={`Show ${layer.name} in legend`}
                  />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-3 rounded-sm"
                      style={{ background: layer.style.fillColor }}
                    />
                    <input
                      value={composition.legendItems[layer.id]?.name ?? layer.name}
                      onChange={(event) =>
                        update({
                          legendItems: {
                            ...composition.legendItems,
                            [layer.id]: {
                              visible: composition.legendItems[layer.id]?.visible ?? true,
                              name: event.target.value,
                            },
                          },
                        })
                      }
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 outline-none focus:border-primary focus:bg-card"
                      aria-label={`Legend name for ${layer.name}`}
                    />
                  </div>
                </div>
              ))}
              <p className="px-1 pt-1 text-[9px] leading-relaxed text-muted-foreground">
                Map and legend are independent. A layer can appear in either, both, or neither.
              </p>
            </div>
          </details>

          <details className="group mt-2 rounded-xl border border-border">
            <summary className="cursor-pointer list-none px-3 py-2 font-semibold">
              Advanced layout
            </summary>
            <div className="space-y-2 border-t border-border p-3">
              <Range
                label="Map width"
                value={composition.frame.width}
                min={35}
                max={96}
                onChange={(width) => update({ frame: { ...composition.frame, width } })}
              />
              <Range
                label="Map height"
                value={composition.frame.height}
                min={30}
                max={86}
                onChange={(height) => update({ frame: { ...composition.frame, height } })}
              />
              <Range
                label="Map left"
                value={composition.frame.x}
                min={0}
                max={60}
                onChange={(x) => update({ frame: { ...composition.frame, x } })}
              />
              <Range
                label="Map top"
                value={composition.frame.y}
                min={4}
                max={55}
                onChange={(y) => update({ frame: { ...composition.frame, y } })}
              />
              <CheckOption
                checked={composition.frameBorder}
                label="Frame border"
                onChange={(frameBorder) => update({ frameBorder })}
              />
              <CheckOption
                checked={composition.showDate}
                label="Print date"
                onChange={(showDate) => update({ showDate })}
              />
              <CheckOption
                checked={composition.showAttribution}
                label="Source credits"
                onChange={(showAttribution) => update({ showAttribution })}
              />
            </div>
          </details>

          <div className="mt-3 grid grid-cols-2 gap-1">
            <button
              onClick={() =>
                update({
                  annotations: composition.annotations.filter((item) => item.type === "marker"),
                })
              }
              className="rounded-lg bg-secondary px-2 py-2 text-[10px] font-medium"
            >
              Clear overlays
            </button>
            <button
              onClick={() =>
                update({
                  annotations: composition.annotations.filter((item) => item.type !== "marker"),
                })
              }
              className="rounded-lg bg-secondary px-2 py-2 text-[10px] font-medium"
            >
              Clear markers
            </button>
            <button
              onClick={() => update({ annotations: [] })}
              className="col-span-2 rounded-lg border border-destructive/30 px-2 py-2 text-[10px] font-medium text-destructive"
            >
              Clear all print additions
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          {placementMode && (
            <div className="print-composer-ui sticky top-0 z-50 mx-auto mb-2 w-fit rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-float">
              {placementMode.kind === "callout"
                ? "Click the map feature or location to label"
                : placementMode.start
                  ? "Click the end point"
                  : "Click the start point"}
              <button
                onClick={() => setPlacementMode(null)}
                className="ml-3 opacity-80 hover:opacity-100"
              >
                Cancel
              </button>
            </div>
          )}
          <div
            ref={pageRef}
            className="print-composer-page relative mx-auto overflow-hidden bg-white shadow-2xl"
            style={{
              aspectRatio: pageRatio,
              width: pageRatio > 1 ? "min(100%, 1100px)" : "min(70%, 720px)",
            }}
          >
            {composition.showTitle && (
              <div className="absolute inset-x-[5%] top-[3%] z-20 pointer-events-none">
                <h2 className="text-center text-[clamp(16px,2.2vw,30px)] font-bold tracking-tight">
                  {composition.title}
                </h2>
                {composition.subtitle && (
                  <p className="mt-0.5 text-center text-[clamp(9px,1vw,14px)] text-slate-600">
                    {composition.subtitle}
                  </p>
                )}
              </div>
            )}
            <div
              className={cn(
                "absolute overflow-hidden bg-slate-100",
                composition.frameBorder && "ring-1 ring-slate-700",
              )}
              style={{
                left: `${composition.frame.x}%`,
                top: `${composition.frame.y}%`,
                width: `${composition.frame.width}%`,
                height: `${composition.frame.height}%`,
              }}
            >
              <div ref={mapContainerRef} className="h-full w-full" />
            </div>

            {composition.showLegend && (
              <div
                className="absolute z-20 max-h-[38%] min-w-32 overflow-hidden rounded-md border border-slate-300 bg-white/95 p-2 text-[clamp(7px,.75vw,11px)] shadow"
                style={
                  hasCallouts
                    ? {
                        left: `${composition.frame.x + 2}%`,
                        bottom: `${Math.max(3, 100 - composition.frame.y - composition.frame.height + 2)}%`,
                      }
                    : { right: "7%", bottom: "9%" }
                }
              >
                <strong>Legend</strong>
                <div className="mt-1 space-y-1">
                  {legendLayers.map((layer) => (
                    <div key={layer.id} className="flex items-center gap-1.5">
                      <span
                        className="size-2.5 shrink-0 rounded-sm border"
                        style={{
                          backgroundColor: layer.style.fillColor,
                          opacity: Math.max(layer.style.fillOpacity, 0.35),
                          borderColor: layer.style.strokeColor,
                        }}
                      />
                      <span className="max-w-40 truncate">
                        {composition.legendItems[layer.id]?.name || layer.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {composition.showCompass && <Compass bearing={mapBearing} />}

            <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
              <defs>
                <marker
                  id="print-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                </marker>
              </defs>
              {composition.annotations
                .filter(
                  (item): item is Extract<PrintAnnotation, { type: "line" | "arrow" }> =>
                    item.type === "line" || item.type === "arrow",
                )
                .map((item) => (
                  <g key={item.id}>
                    <line
                      x1={`${item.x}%`}
                      y1={`${item.y}%`}
                      x2={`${item.x2}%`}
                      y2={`${item.y2}%`}
                      stroke="transparent"
                      strokeWidth={Math.max(14, item.width + 10)}
                      className="pointer-events-auto cursor-move"
                      onPointerDown={(event) => startPointDrag(event, item, "whole")}
                    />
                    <line
                      x1={`${item.x}%`}
                      y1={`${item.y}%`}
                      x2={`${item.x2}%`}
                      y2={`${item.y2}%`}
                      stroke={item.color}
                      strokeWidth={item.width}
                      markerEnd={item.type === "arrow" ? "url(#print-arrow)" : undefined}
                      className="pointer-events-none"
                    />
                    {selectedId === item.id && (
                      <>
                        <circle
                          cx={`${item.x}%`}
                          cy={`${item.y}%`}
                          r="7"
                          fill="white"
                          stroke={item.color}
                          strokeWidth="3"
                          className="pointer-events-auto cursor-grab"
                          onPointerDown={(event) => startPointDrag(event, item, "start")}
                        />
                        <circle
                          cx={`${item.x2}%`}
                          cy={`${item.y2}%`}
                          r="7"
                          fill="white"
                          stroke={item.color}
                          strokeWidth="3"
                          className="pointer-events-auto cursor-grab"
                          onPointerDown={(event) => startPointDrag(event, item, "end")}
                        />
                      </>
                    )}
                  </g>
                ))}
              {composition.annotations
                .filter(
                  (item): item is Extract<PrintAnnotation, { type: "callout" }> =>
                    item.type === "callout",
                )
                .map((item) => {
                  const target = calloutTarget(item);
                  return (
                    <line
                      key={`line-${item.id}`}
                      x1={`${item.x}%`}
                      y1={`${item.y}%`}
                      x2={`${target.x}%`}
                      y2={`${target.y}%`}
                      stroke={item.color}
                      strokeWidth="2.5"
                      markerEnd="url(#print-arrow)"
                      className="pointer-events-none"
                    />
                  );
                })}
            </svg>
            {composition.annotations
              .filter(
                (item): item is Extract<PrintAnnotation, { type: "text" }> => item.type === "text",
              )
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  onPointerDown={(event) => startBoxDrag(event, item)}
                  className={cn(
                    "absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded px-2 py-1 text-left",
                    selectedId === item.id && "ring-2 ring-primary ring-offset-1",
                  )}
                  style={{
                    left: `${item.x}%`,
                    top: `${item.y}%`,
                    color: item.textColor,
                    backgroundColor: item.backgroundColor ?? "transparent",
                    fontFamily: item.font,
                    fontSize: `${item.fontSize}px`,
                  }}
                >
                  {item.text}
                </button>
              ))}
            {composition.annotations
              .filter(
                (item): item is Extract<PrintAnnotation, { type: "callout" }> =>
                  item.type === "callout",
              )
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  onPointerDown={(event) => startBoxDrag(event, item)}
                  className={cn(
                    "absolute z-40 w-[15%] -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1.5 text-left shadow-sm",
                    selectedId === item.id && "ring-2 ring-primary ring-offset-1",
                  )}
                  style={{
                    left: `${item.x}%`,
                    top: `${item.y}%`,
                    color: item.textColor,
                    backgroundColor: item.backgroundColor,
                    borderColor: item.color,
                  }}
                >
                  <span className="block text-[clamp(7px,.75vw,11px)] font-semibold leading-tight">
                    {item.contentMode === "gps" ? formatDecimalGps(item) : item.text}
                  </span>
                  {item.contentMode === "label-gps" && (
                    <span className="num mt-1 block text-[clamp(6px,.6vw,9px)] opacity-75">
                      {formatDecimalGps(item)}
                    </span>
                  )}
                </button>
              ))}
            {(composition.showDate || composition.showAttribution) && (
              <div className="absolute inset-x-[5%] bottom-[2%] flex justify-between text-[clamp(6px,.65vw,9px)] text-slate-500">
                <span>{composition.showAttribution ? getBasemap(wb.basemapId).blurb : ""}</span>
                <span>{composition.showDate ? new Date().toLocaleDateString() : ""}</span>
              </div>
            )}
            {placementMode && (
              <div
                className="absolute inset-0 z-[60] cursor-crosshair bg-transparent"
                onPointerDown={handlePlacement}
                aria-label="Print item placement surface"
              />
            )}
          </div>
        </main>

        {selected && (
          <aside className="print-composer-ui w-64 shrink-0 overflow-y-auto border-l border-border bg-card p-3 text-xs">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold capitalize">{selected.type}</h2>
              <button
                onClick={removeSelected}
                className="ml-auto rounded-lg p-2 text-destructive hover:bg-destructive/10"
                aria-label="Remove selected print item"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {selected.type === "text" && (
              <>
                <Field
                  label="Text"
                  value={selected.text}
                  onChange={(text) => updateAnnotation(selected.id, { text })}
                />
                <Select
                  value={selected.font}
                  onChange={(font) =>
                    updateAnnotation(selected.id, {
                      font: font as Extract<PrintAnnotation, { type: "text" }>["font"],
                    })
                  }
                  options={["Inter", "Arial", "Georgia", "Courier New"]}
                />
                <Range
                  label="Text size"
                  value={selected.fontSize}
                  min={8}
                  max={36}
                  onChange={(fontSize) => updateAnnotation(selected.id, { fontSize })}
                />
                <Color
                  label="Text color"
                  value={selected.textColor}
                  onChange={(textColor) => updateAnnotation(selected.id, { textColor })}
                />
                <CheckOption
                  checked={selected.backgroundColor !== null}
                  label="Text background"
                  onChange={(checked) =>
                    updateAnnotation(selected.id, { backgroundColor: checked ? "#ffffff" : null })
                  }
                />
                {selected.backgroundColor && (
                  <Color
                    label="Background"
                    value={selected.backgroundColor}
                    onChange={(backgroundColor) =>
                      updateAnnotation(selected.id, { backgroundColor })
                    }
                  />
                )}
              </>
            )}
            {(selected.type === "line" || selected.type === "arrow") && (
              <>
                <Color
                  label="Color"
                  value={selected.color}
                  onChange={(color) => updateAnnotation(selected.id, { color })}
                />
                <Range
                  label="Width"
                  value={selected.width}
                  min={1}
                  max={10}
                  onChange={(width) => updateAnnotation(selected.id, { width })}
                />
              </>
            )}
            {selected.type === "marker" && (
              <>
                <Field
                  label="Label"
                  value={selected.label}
                  onChange={(label) => updateAnnotation(selected.id, { label })}
                />
                <Color
                  label="Marker color"
                  value={selected.color}
                  onChange={(color) => updateAnnotation(selected.id, { color })}
                />
                <CheckOption
                  checked={selected.showCoordinates}
                  label="GPS coordinates"
                  onChange={(showCoordinates) => updateAnnotation(selected.id, { showCoordinates })}
                />
                <CheckOption
                  checked={selected.gpsOnly ?? false}
                  label="GPS only (decimal)"
                  onChange={(gpsOnly) =>
                    updateAnnotation(selected.id, {
                      gpsOnly,
                      showCoordinates: gpsOnly ? true : selected.showCoordinates,
                    })
                  }
                />
                <p className="num mt-2 text-[10px] text-muted-foreground">
                  {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
                </p>
              </>
            )}
            {selected.type === "callout" && (
              <>
                <Field
                  label="Callout text"
                  value={selected.text}
                  onChange={(text) => updateAnnotation(selected.id, { text })}
                />
                <label className="mt-2 block">
                  <span className="mb-1 block text-[10px] font-medium text-muted-foreground">
                    Label content
                  </span>
                  <select
                    value={selected.contentMode}
                    onChange={(event) =>
                      updateAnnotation(selected.id, {
                        contentMode: event.target.value as Extract<
                          PrintAnnotation,
                          { type: "callout" }
                        >["contentMode"],
                      })
                    }
                    className="w-full rounded-lg border border-border bg-card px-2 py-1.5"
                  >
                    <option value="label">Label</option>
                    <option value="label-gps">Label + decimal GPS</option>
                    <option value="gps">Decimal GPS only</option>
                  </select>
                </label>
                <Color
                  label="Arrow and border"
                  value={selected.color}
                  onChange={(color) => updateAnnotation(selected.id, { color })}
                />
                <Color
                  label="Text"
                  value={selected.textColor}
                  onChange={(textColor) => updateAnnotation(selected.id, { textColor })}
                />
                <Color
                  label="Box background"
                  value={selected.backgroundColor}
                  onChange={(backgroundColor) => updateAnnotation(selected.id, { backgroundColor })}
                />
                <button
                  onClick={() => {
                    const map = printMapRef.current;
                    if (!map) return;
                    update({ annotations: arrangeCallouts(composition.annotations, map) });
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-secondary px-2 py-2 text-[10px] font-medium"
                >
                  <LocateFixed className="size-3.5" /> Auto-arrange all callouts
                </button>
                <p className="num mt-2 text-[10px] text-muted-foreground">
                  Target: {formatDecimalGps(selected)}
                </p>
              </>
            )}
            {selected.type !== "marker" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Range
                  label="Left"
                  value={selected.x}
                  min={0}
                  max={100}
                  onChange={(x) => updateAnnotation(selected.id, { x })}
                />
                <Range
                  label="Top"
                  value={selected.y}
                  min={0}
                  max={100}
                  onChange={(y) => updateAnnotation(selected.id, { y })}
                />
              </div>
            )}
            <p className="mt-4 rounded-lg bg-secondary p-2 text-[10px] leading-relaxed text-muted-foreground">
              Print items are saved with this map composition. Map markers stay attached to their
              geographic coordinates.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

function ComposerButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-[10px] font-medium hover:bg-accent",
        active ? "bg-primary text-primary-foreground" : "bg-secondary",
      )}
    >
      {<span className="[&>svg]:size-3.5">{icon}</span>}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function Compass({ bearing }: { bearing: number }) {
  return (
    <div className="absolute right-[8%] top-[17%] z-20 flex size-14 items-center justify-center rounded-full border border-slate-400 bg-white/90 text-[8px] font-bold shadow">
      <span className="absolute top-1">N</span>
      <span className="absolute bottom-1">S</span>
      <span className="absolute left-1">W</span>
      <span className="absolute right-1">E</span>
      <div
        className="relative h-8 w-3 transition-transform"
        style={{ transform: `rotate(${-bearing}deg)` }}
      >
        <div className="absolute left-1 top-0 h-4 w-0 border-x-[4px] border-b-[16px] border-x-transparent border-b-red-600" />
        <div className="absolute bottom-0 left-1 h-4 w-0 rotate-180 border-x-[4px] border-b-[16px] border-x-transparent border-b-slate-700" />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-2 block">
      <span className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-card px-2 py-1.5 outline-none focus:border-primary"
      />
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-border bg-card px-2 py-1.5 capitalize"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function CheckOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-lg bg-secondary p-2 text-[10px] font-medium">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-primary"
      />
      {label}
    </label>
  );
}

function Range({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}

function Color({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-2 flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="size-8 rounded border-0 bg-transparent"
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </label>
  );
}

function pageAspect(
  paper: PrintComposition["paper"],
  orientation: PrintComposition["orientation"],
) {
  const portrait = paper === "a4" ? 210 / 297 : paper === "legal" ? 8.5 / 14 : 8.5 / 11;
  return orientation === "portrait" ? portrait : 1 / portrait;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ??
      character,
  );
}

function formatDecimalGps(point: { lat: number; lng: number }) {
  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
}
