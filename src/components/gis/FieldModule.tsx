import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, Geometry, Position } from "geojson";
import { GeoJSONSource, Marker } from "maplibre-gl";
import {
  Car,
  ChevronDown,
  CircleStop,
  Crosshair,
  Footprints,
  Gauge,
  Hexagon,
  LocateFixed,
  MapPinned,
  Navigation,
  Pause,
  Play,
  Route,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useMapRef } from "@/lib/gis/mapRef";
import { useWorkbench } from "@/lib/gis/store";
import { catalog } from "@/lib/gis/catalog";
import { resolveCatalogUrl } from "@/lib/gis/connectionHealth";
import { formatLength, squareMeters } from "@/lib/gis/measure";
import { cn } from "@/lib/utils";

type Activity = "walking" | "driving";
type TrackKind = "path" | "area";

interface FieldLocation {
  lng: number;
  lat: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

interface TrackSession {
  kind: TrackKind;
  activity: Activity;
  startedAt: number;
  paused: boolean;
}

interface PendingCapture {
  kind: "point" | TrackKind;
  geometry: Geometry;
  properties: Record<string, unknown>;
  suggestedName: string;
}

const FIELD_PREVIEW_SOURCE = "landdraft-field-preview";
const FIELD_PREVIEW_FILL = "landdraft-field-preview-fill";
const FIELD_PREVIEW_LINE = "landdraft-field-preview-line";

const rad = (value: number) => (value * Math.PI) / 180;
const segmentMeters = (a: Position, b: Position) => {
  const lat1 = rad(Number(a[1]));
  const lat2 = rad(Number(b[1]));
  const dLat = lat2 - lat1;
  const dLng = rad(Number(b[0]) - Number(a[0]));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const featureDestination = (geometry: Geometry): [number, number] | null => {
  if (geometry.type === "Point")
    return [Number(geometry.coordinates[0]), Number(geometry.coordinates[1])];
  const coordinates: Position[] = [];
  const collect = (value: unknown) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      coordinates.push(value as Position);
      return;
    }
    if (Array.isArray(value)) value.forEach(collect);
  };
  collect("coordinates" in geometry ? geometry.coordinates : []);
  if (!coordinates.length) return null;
  const bounds = coordinates.reduce(
    (current, coordinate) => ({
      minX: Math.min(current.minX, Number(coordinate[0])),
      minY: Math.min(current.minY, Number(coordinate[1])),
      maxX: Math.max(current.maxX, Number(coordinate[0])),
      maxY: Math.max(current.maxY, Number(coordinate[1])),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
};

const captureName = (prefix: string) =>
  `${prefix} · ${new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;

export function FieldModule({ active = true }: { active?: boolean }) {
  const wb = useWorkbench();
  const { map } = useMapRef();
  const wbRef = useRef(wb);
  wbRef.current = wb;
  const markerRef = useRef<Marker | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const mapInstanceRef = useRef(map);
  mapInstanceRef.current = map;
  const watchIdRef = useRef<number | null>(null);
  const trackRef = useRef<TrackSession | null>(null);
  const pointsRef = useRef<Position[]>([]);
  const distanceRef = useRef(0);
  const lastAcceptedAtRef = useRef(0);
  const locationErrorShown = useRef(false);
  const [activity, setActivity] = useState<Activity>("walking");
  const [location, setLocation] = useState<FieldLocation | null>(null);
  const [track, setTrackState] = useState<TrackSession | null>(null);
  const [trackPoints, setTrackPoints] = useState<Position[]>([]);
  const [trackDistance, setTrackDistance] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [follow, setFollow] = useState(true);
  const followRef = useRef(follow);
  followRef.current = follow;
  const [pending, setPending] = useState<PendingCapture | null>(null);
  const [captureNameValue, setCaptureNameValue] = useState("");
  const [captureNotes, setCaptureNotes] = useState("");
  const [attributesOpen, setAttributesOpen] = useState(false);

  const parcelLayer = wb.layers.find(
    (layer) => layer.source.kind === "remote" && layer.source.catalogId === "tx-parcels",
  );
  const selected = useMemo(() => {
    const selectedFeature = wb.selectedFeatures[0];
    if (!selectedFeature) return null;
    const layer = wb.displayLayers.find((item) => item.id === selectedFeature.layerId);
    const feature = layer?.data.features[selectedFeature.index];
    return layer && feature ? { layer, feature } : null;
  }, [wb.displayLayers, wb.selectedFeatures]);

  const setTrack = (value: TrackSession | null) => {
    trackRef.current = value;
    setTrackState(value);
  };

  const updateLocation = useCallback((position: GeolocationPosition) => {
    const next: FieldLocation = {
      lng: position.coords.longitude,
      lat: position.coords.latitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
      timestamp: position.timestamp,
    };
    setLocation(next);
    const currentMap = mapInstanceRef.current;
    if (currentMap && followRef.current && activeRef.current) {
      currentMap.easeTo({
        center: [next.lng, next.lat],
        zoom: Math.max(currentMap.getZoom(), 16),
        duration: 500,
      });
    }
    const session = trackRef.current;
    if (!session || session.paused || next.accuracy > 80) return;
    const coordinate: Position = [next.lng, next.lat];
    const previous = pointsRef.current.at(-1);
    if (!previous) {
      pointsRef.current = [coordinate];
      lastAcceptedAtRef.current = next.timestamp;
      setTrackPoints([coordinate]);
      return;
    }
    const step = segmentMeters(previous, coordinate);
    const elapsed = Math.max(1, (next.timestamp - lastAcceptedAtRef.current) / 1000);
    const minimumStep = session.activity === "walking" ? 2 : 7;
    const maximumSpeed = session.activity === "walking" ? 12 : 75;
    if (step < minimumStep || step / elapsed > maximumSpeed) return;
    distanceRef.current += step;
    lastAcceptedAtRef.current = next.timestamp;
    const points = [...pointsRef.current, coordinate];
    pointsRef.current = points;
    setTrackPoints(points);
    setTrackDistance(distanceRef.current);
  }, []);

  const ensureWatch = useCallback(() => {
    if (watchIdRef.current !== null) return true;
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return false;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      updateLocation,
      (error) => {
        if (!locationErrorShown.current) {
          toast.error("Location could not be read", { description: error.message });
          locationErrorShown.current = true;
        }
      },
      { enableHighAccuracy: true, maximumAge: 1_000, timeout: 20_000 },
    );
    return true;
  }, [updateLocation]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(
    () => () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (active || trackRef.current || watchIdRef.current === null) return;
    navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, [active]);

  useEffect(() => {
    if (!map || !location) return;
    if (!markerRef.current) {
      const element = document.createElement("div");
      element.className = "field-location-dot";
      element.title = "Current GPS location";
      markerRef.current = new Marker({ element }).addTo(map);
    }
    markerRef.current.setLngLat([location.lng, location.lat]);
  }, [location, map]);

  useEffect(() => {
    if (!map) return;
    const drawPreview = () => {
      if (!map.isStyleLoaded()) return;
      const geometry: Geometry =
        track?.kind === "area" && trackPoints.length >= 3
          ? { type: "Polygon", coordinates: [[...trackPoints, trackPoints[0]!]] }
          : { type: "LineString", coordinates: trackPoints };
      const data = {
        type: "FeatureCollection" as const,
        features: trackPoints.length
          ? [{ type: "Feature" as const, properties: {}, geometry }]
          : [],
      };
      const source = map.getSource(FIELD_PREVIEW_SOURCE) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else map.addSource(FIELD_PREVIEW_SOURCE, { type: "geojson", data });
      if (!map.getLayer(FIELD_PREVIEW_FILL))
        map.addLayer({
          id: FIELD_PREVIEW_FILL,
          type: "fill",
          source: FIELD_PREVIEW_SOURCE,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#f2b73d", "fill-opacity": 0.22 },
        });
      if (!map.getLayer(FIELD_PREVIEW_LINE))
        map.addLayer({
          id: FIELD_PREVIEW_LINE,
          type: "line",
          source: FIELD_PREVIEW_SOURCE,
          paint: { "line-color": "#f2b73d", "line-width": 5, "line-opacity": 0.95 },
        });
    };
    drawPreview();
    map.on("styledata", drawPreview);
    return () => {
      map.off("styledata", drawPreview);
    };
  }, [map, track?.kind, trackPoints]);

  const locate = () => {
    setFollow(true);
    if (!ensureWatch()) return;
    if (location)
      map?.easeTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 16) });
  };

  const startTrack = (kind: TrackKind) => {
    if (!wb.canEditProject) {
      toast.error("This shared map is view only");
      return;
    }
    const session = { kind, activity, startedAt: Date.now(), paused: false };
    pointsRef.current = [];
    distanceRef.current = 0;
    lastAcceptedAtRef.current = 0;
    setTrackPoints([]);
    setTrackDistance(0);
    setTrack(session);
    setFollow(true);
    if (!ensureWatch()) setTrack(null);
  };

  const stopTrack = () => {
    const session = trackRef.current;
    const points = pointsRef.current;
    if (!session) return;
    if (points.length < (session.kind === "area" ? 3 : 2)) {
      toast.error(
        session.kind === "area"
          ? "Keep moving until at least three GPS positions are recorded"
          : "Keep moving until at least two GPS positions are recorded",
      );
      return;
    }
    const geometry: Geometry =
      session.kind === "area"
        ? { type: "Polygon", coordinates: [[...points, points[0]!]] }
        : { type: "LineString", coordinates: points };
    const areaSquareMeters = squareMeters({ type: "Feature", properties: {}, geometry });
    const durationSeconds = Math.round((Date.now() - session.startedAt) / 1_000);
    const prefix = session.kind === "area" ? "Field area" : "Field path";
    setPending({
      kind: session.kind,
      geometry,
      suggestedName: captureName(prefix),
      properties: {
        ACTIVITY: session.activity,
        DISTANCE_M: Number(distanceRef.current.toFixed(1)),
        DISTANCE_MI: Number((distanceRef.current / 1609.344).toFixed(3)),
        DURATION_SEC: durationSeconds,
        GPS_POINTS: points.length,
        ...(session.kind === "area"
          ? {
              AREA_ACRES: Number((areaSquareMeters / 4046.8564224).toFixed(3)),
              AREA_SQ_FT: Math.round(areaSquareMeters * 10.7639104167),
            }
          : {}),
        CAPTURED: new Date().toISOString(),
        FIELD_SOURCE: "GPS track",
      },
    });
    setCaptureNameValue(captureName(prefix));
    setCaptureNotes("");
    setTrack(null);
    setTrackPoints([]);
  };

  const capturePoint = () => {
    if (!wb.canEditProject) {
      toast.error("This shared map is view only");
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateLocation(position);
        const suggestedName = captureName("Field point");
        setPending({
          kind: "point",
          geometry: {
            type: "Point",
            coordinates: [position.coords.longitude, position.coords.latitude],
          },
          suggestedName,
          properties: {
            LAT: Number(position.coords.latitude.toFixed(7)),
            LON: Number(position.coords.longitude.toFixed(7)),
            ACCURACY_M: Math.round(position.coords.accuracy),
            ALTITUDE_M:
              position.coords.altitude === null
                ? null
                : Number(position.coords.altitude.toFixed(1)),
            CAPTURED: new Date().toISOString(),
            FIELD_SOURCE: "GPS point",
          },
        });
        setCaptureNameValue(suggestedName);
        setCaptureNotes("");
      },
      (error) => toast.error("Location could not be read", { description: error.message }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  };

  const saveCapture = () => {
    if (!pending) return;
    const current = wbRef.current;
    const groupId =
      current.groups.find((group) => group.name.toLowerCase() === "field collection")?.id ??
      current.addGroup("Field collection");
    const layerName =
      pending.kind === "point"
        ? "Field GPS points"
        : pending.kind === "path"
          ? "Field paths"
          : "Field areas";
    const feature: Feature = {
      type: "Feature",
      geometry: pending.geometry,
      properties: {
        ...pending.properties,
        NAME: captureNameValue.trim() || pending.suggestedName,
        ...(captureNotes.trim() ? { NOTES: captureNotes.trim() } : {}),
      },
    };
    const existing = current.layers.find(
      (layer) => layer.groupId === groupId && layer.name === layerName,
    );
    if (existing) current.appendFeature(existing.id, feature);
    else
      current.addLayer({
        name: layerName,
        data: { type: "FeatureCollection", features: [feature] },
        groupId,
        source: { kind: "draw" },
        style:
          pending.kind === "point"
            ? {
                fillColor: "#f2b73d",
                strokeColor: "#1e6f43",
                pointSize: 8,
                labelEnabled: true,
                labelTemplate: "{NAME}",
                labelFields: ["NAME"],
                labelMinZoom: 14,
              }
            : pending.kind === "path"
              ? { fillOpacity: 0, strokeColor: "#f2b73d", strokeWidth: 4 }
              : {
                  fillColor: "#f2b73d",
                  fillOpacity: 0.2,
                  strokeColor: "#1e6f43",
                  strokeWidth: 3,
                  labelEnabled: true,
                  labelTemplate: "{NAME}",
                  labelFields: ["NAME"],
                  labelMinZoom: 13,
                },
      });
    setPending(null);
    toast.success(`${layerName} saved to ${current.projectName}`);
    window.setTimeout(() => void wbRef.current.saveProject("manual"), 300);
  };

  const toggleParcels = () => {
    const current = wbRef.current;
    if (parcelLayer) {
      current.updateStyle(parcelLayer.id, {
        fillOpacity: 0,
        strokeColor: "#2f7d4f",
        strokeWidth: 1.5,
        labelEnabled: true,
        labelTemplate: "{OWNER_NAME}",
        labelFields: ["OWNER_NAME"],
        labelMinZoom: 14,
        labelMaxZoom: 24,
      });
      if (parcelLayer.visible) current.toggleVisible(parcelLayer.id);
      else {
        current.toggleVisible(parcelLayer.id);
        if (map && map.getZoom() < 14) map.easeTo({ zoom: 14 });
      }
      return;
    }
    const entry = catalog.find((item) => item.id === "tx-parcels");
    if (!entry) return;
    const url =
      (current.connectionHints["catalog:tx-parcels"]?.verified
        ? current.connectionHints["catalog:tx-parcels"]?.url
        : undefined) ?? resolveCatalogUrl(entry);
    if (!url) {
      toast.error("The parcel connection is not available");
      return;
    }
    current.addLayer({
      name: entry.name,
      data: { type: "FeatureCollection", features: [] },
      groupId: "public",
      source: {
        kind: "remote",
        url,
        catalogId: entry.id,
        attribution: entry.agency,
        requiresViewport: true,
        minZoom: 12,
      },
      style: {
        fillOpacity: 0,
        strokeColor: "#2f7d4f",
        strokeWidth: 1.5,
        labelEnabled: true,
        labelTemplate: "{OWNER_NAME}",
        labelFields: ["OWNER_NAME"],
        labelMinZoom: 14,
        labelMaxZoom: 24,
      },
    });
    if (map && map.getZoom() < 14) map.easeTo({ zoom: 14 });
    toast.success("Parcels enabled", {
      description: "Owner labels appear at close zoom. Tap a parcel for its attributes.",
    });
  };

  const openDirections = (feature: Feature) => {
    const destination = featureDestination(feature.geometry);
    if (!destination) return;
    const [lng, lat] = destination;
    const params = new URLSearchParams({
      api: "1",
      destination: `${lat},${lng}`,
      travelmode: activity,
    });
    window.open(`https://www.google.com/maps/dir/?${params}`, "_blank", "noopener,noreferrer");
  };

  const accuracyTone = !location
    ? "text-muted-foreground"
    : location.accuracy <= 10
      ? "text-emerald-700"
      : location.accuracy <= 30
        ? "text-amber-700"
        : "text-red-700";
  const selectedProperties = Object.entries(selected?.feature.properties ?? {}).filter(
    ([key]) => !key.startsWith("__"),
  );
  const selectedName = selected
    ? String(
        selected.feature.properties?.["OWNER_NAME"] ??
          selected.feature.properties?.["NAME"] ??
          selected.layer.name,
      )
    : "";

  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 top-[calc(4.75rem+env(safe-area-inset-top))] z-20 flex items-start justify-between gap-2">
        <button
          onClick={locate}
          className="float-surface pointer-events-auto flex items-center gap-2 rounded-2xl px-3 py-2 text-left"
        >
          <Gauge className={cn("size-4", accuracyTone)} />
          <span>
            <strong className="block text-[11px]">
              {location ? `GPS ±${Math.round(location.accuracy)} m` : "Enable GPS"}
            </strong>
            <span className="block text-[9px] text-muted-foreground">
              {location
                ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
                : "Tap to locate"}
            </span>
          </span>
        </button>
        <button
          onClick={toggleParcels}
          aria-pressed={Boolean(parcelLayer?.visible)}
          className={cn(
            "float-surface pointer-events-auto flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold",
            parcelLayer?.visible && "bg-primary text-primary-foreground",
          )}
        >
          <MapPinned className="size-4" /> Parcels
        </button>
      </div>

      {selected && (
        <section className="panel-surface pointer-events-auto absolute left-3 right-3 top-[calc(8.5rem+env(safe-area-inset-top))] z-30 max-h-[34dvh] overflow-y-auto rounded-2xl p-3 shadow-float">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selectedName}</p>
              <p className="text-[10px] text-muted-foreground">{selected.layer.name}</p>
            </div>
            <button
              onClick={() => openDirections(selected.feature)}
              className="flex items-center gap-1 rounded-xl bg-primary px-2.5 py-2 text-[10px] font-semibold text-primary-foreground"
            >
              <Navigation className="size-3.5" /> Directions
            </button>
            <button
              onClick={() => wb.setSelectedFeatures([])}
              aria-label="Close selected feature"
              className="rounded-lg p-2 hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
          <button
            onClick={() => setAttributesOpen((value) => !value)}
            className="mt-2 flex w-full items-center justify-between rounded-xl bg-secondary px-3 py-2 text-[10px] font-semibold"
          >
            View attributes
            <ChevronDown
              className={cn("size-3.5 transition-transform", attributesOpen && "rotate-180")}
            />
          </button>
          {attributesOpen && (
            <dl className="mt-2 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 text-[10px]">
              {selectedProperties.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="truncate font-semibold text-muted-foreground">{key}</dt>
                  <dd className="break-words">{String(value ?? "")}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      <section className="panel-surface pointer-events-auto absolute inset-x-2 bottom-[max(.5rem,env(safe-area-inset-bottom))] z-30 rounded-3xl p-2 shadow-float">
        {track ? (
          <div className="space-y-2 p-1">
            <div className="flex items-center gap-3 rounded-2xl bg-secondary px-3 py-2">
              <span className="relative flex size-3">
                {!track.paused && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
                )}
                <span className="relative inline-flex size-3 rounded-full bg-red-600" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">
                  Recording {track.kind === "area" ? "area boundary" : "path"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatLength(trackDistance, wb.units.length)} ·{" "}
                  {Math.max(0, Math.round((clock - track.startedAt) / 1000))} sec ·{" "}
                  {trackPoints.length} GPS points
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const next = { ...track, paused: !track.paused };
                  setTrack(next);
                }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-xs font-semibold"
              >
                {track.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                {track.paused ? "Resume" : "Pause"}
              </button>
              <button
                onClick={stopTrack}
                className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 py-3 text-xs font-semibold text-white"
              >
                <CircleStop className="size-4" /> Finish & review
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2 px-1">
              <div className="grid flex-1 grid-cols-2 rounded-xl bg-secondary p-1">
                <button
                  onClick={() => setActivity("walking")}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold",
                    activity === "walking" && "bg-card shadow-sm",
                  )}
                >
                  <Footprints className="size-3.5" /> Walk
                </button>
                <button
                  onClick={() => setActivity("driving")}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold",
                    activity === "driving" && "bg-card shadow-sm",
                  )}
                >
                  <Car className="size-3.5" /> Drive
                </button>
              </div>
              <button
                onClick={() => setFollow((value) => !value)}
                aria-pressed={follow}
                className={cn(
                  "flex items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-semibold",
                  follow ? "bg-primary text-primary-foreground" : "bg-secondary",
                )}
              >
                <Crosshair className="size-3.5" /> Follow
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <FieldAction icon={<LocateFixed />} label="Locate" onClick={locate} />
              <FieldAction icon={<MapPinned />} label="Mark" onClick={capturePoint} />
              <FieldAction icon={<Route />} label="Track path" onClick={() => startTrack("path")} />
              <FieldAction
                icon={<Hexagon />}
                label="Track area"
                onClick={() => startTrack("area")}
              />
            </div>
          </>
        )}
      </section>

      {pending && (
        <div className="fixed inset-0 z-[80] flex items-end bg-foreground/25 p-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur-[2px]">
          <section className="w-full rounded-3xl border border-border bg-card p-4 shadow-float">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Save field capture</h2>
                <p className="text-[10px] text-muted-foreground">
                  It will sync with this project and open in the full map.
                </p>
              </div>
              <button onClick={() => setPending(null)} className="rounded-xl p-2 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-3 block text-[10px] font-semibold text-muted-foreground">
              Name
              <input
                value={captureNameValue}
                onChange={(event) => setCaptureNameValue(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="mt-2 block text-[10px] font-semibold text-muted-foreground">
              Notes (optional)
              <textarea
                value={captureNotes}
                onChange={(event) => setCaptureNotes(event.target.value)}
                rows={2}
                placeholder="Condition, access, observation…"
                className="mt-1 w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setPending(null)}
                className="flex-1 rounded-2xl bg-secondary py-3 text-xs font-semibold"
              >
                Discard
              </button>
              <button
                onClick={saveCapture}
                className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-xs font-semibold text-primary-foreground"
              >
                <Save className="size-4" /> Save to project
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function FieldAction({
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
      className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-secondary px-1 text-[10px] font-semibold active:bg-accent"
    >
      <span className="[&>svg]:size-5">{icon}</span>
      {label}
    </button>
  );
}
