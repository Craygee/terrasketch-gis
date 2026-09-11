import { useEffect, useMemo } from "react";
import type { GeoJSONSource, Map as MlMap, MapMouseEvent, RasterTileSource } from "maplibre-gl";
import type { FeatureCollection, Point, Polygon, MultiPolygon } from "geojson";
import { useMapRef } from "@/lib/gis/mapRef";
import type {
  RadarFrame,
  WeatherAlert,
  WeatherBundle,
  WeatherRasterFrame,
  WeatherStationObservation,
  WeatherViewingZone,
  WeatherWorkspaceState,
} from "@/lib/weather/types";

const ALERT_SOURCE = "landdraft-weather-alerts";
const ALERT_FILL = "landdraft-weather-alert-fill";
const ALERT_LINE = "landdraft-weather-alert-line";
const RADAR_SOURCE = "landdraft-weather-radar";
const RADAR_LAYER = "landdraft-weather-radar-layer";
const INSPECT_SOURCE = "landdraft-weather-inspect-point";
const INSPECT_LAYER = "landdraft-weather-inspect-point-layer";
const STATION_SOURCE = "landdraft-weather-stations";
const STATION_CIRCLE = "landdraft-weather-station-circle";
const STATION_LABEL = "landdraft-weather-station-label";
const PHOTO_SOURCE = "landdraft-weather-photo-zones";
const PHOTO_CIRCLE = "landdraft-weather-photo-circle";
const PHOTO_LABEL = "landdraft-weather-photo-label";
const RASTER_PREFIX = "landdraft-weather-product-";

function alertCollection(alerts: WeatherAlert[]): FeatureCollection<Polygon | MultiPolygon> {
  return {
    type: "FeatureCollection",
    features: alerts.flatMap((alert) =>
      alert.geometry
        ? [
            {
              ...alert.geometry,
              properties: {
                id: alert.id,
                event: alert.event,
                headline: alert.headline,
                severity: alert.severity,
              },
            },
          ]
        : [],
    ),
  };
}

function pointCollection(point: [number, number] | undefined): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: point
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: point },
          },
        ]
      : [],
  };
}

function stationCollection(stations: WeatherStationObservation[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      ...station.location,
      properties: {
        id: station.id,
        stationId: station.stationId,
        category: station.flightCategory ?? "",
      },
    })),
  };
}

function photographyCollection(zones: WeatherViewingZone[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: zones.map((zone) => ({
      ...zone.location,
      properties: {
        id: zone.id,
        name: zone.name,
        riskLevel: zone.riskLevel,
        score: zone.score ?? "",
      },
    })),
  };
}

function nearestFrame(frames: RadarFrame[], selectedTime: string) {
  const target = new Date(selectedTime).getTime();
  return frames.reduce<RadarFrame | undefined>((best, frame) => {
    if (!best) return frame;
    return Math.abs(new Date(frame.timestamp).getTime() - target) <
      Math.abs(new Date(best.timestamp).getTime() - target)
      ? frame
      : best;
  }, undefined);
}

function nearestRasterFrame(frames: WeatherRasterFrame[], selectedTime: string) {
  const target = new Date(selectedTime).getTime();
  return frames.reduce<WeatherRasterFrame | undefined>((best, frame) => {
    if (!best) return frame;
    return Math.abs(new Date(frame.timestamp).getTime() - target) <
      Math.abs(new Date(best.timestamp).getTime() - target)
      ? frame
      : best;
  }, undefined);
}

const rasterKey = (layerId: string) => `${RASTER_PREFIX}${layerId.replace(/[^a-z0-9-]/gi, "-")}`;

function moveToTop(map: MlMap, ids: string[]) {
  ids.forEach((id) => {
    if (map.getLayer(id)) map.moveLayer(id);
  });
}

function ensureVectorLayers(map: MlMap) {
  if (!map.getSource(ALERT_SOURCE))
    map.addSource(ALERT_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  if (!map.getLayer(ALERT_FILL))
    map.addLayer({
      id: ALERT_FILL,
      type: "fill",
      source: ALERT_SOURCE,
      paint: {
        "fill-color": [
          "match",
          ["get", "severity"],
          "extreme",
          "#881337",
          "severe",
          "#dc2626",
          "moderate",
          "#f59e0b",
          "minor",
          "#2563eb",
          "#6b7280",
        ],
        "fill-opacity": 0.28,
      },
    });
  if (!map.getLayer(ALERT_LINE))
    map.addLayer({
      id: ALERT_LINE,
      type: "line",
      source: ALERT_SOURCE,
      paint: {
        "line-color": [
          "match",
          ["get", "severity"],
          "extreme",
          "#881337",
          "severe",
          "#dc2626",
          "moderate",
          "#b45309",
          "minor",
          "#1d4ed8",
          "#4b5563",
        ],
        "line-width": 3,
        "line-dasharray": [3, 1.5],
      },
    });
  if (!map.getSource(INSPECT_SOURCE))
    map.addSource(INSPECT_SOURCE, { type: "geojson", data: pointCollection(undefined) });
  if (!map.getLayer(INSPECT_LAYER))
    map.addLayer({
      id: INSPECT_LAYER,
      type: "circle",
      source: INSPECT_SOURCE,
      paint: {
        "circle-radius": 6,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#177542",
        "circle-stroke-width": 3,
      },
    });
  if (!map.getSource(STATION_SOURCE))
    map.addSource(STATION_SOURCE, { type: "geojson", data: stationCollection([]) });
  if (!map.getLayer(STATION_CIRCLE))
    map.addLayer({
      id: STATION_CIRCLE,
      type: "circle",
      source: STATION_SOURCE,
      paint: {
        "circle-radius": 5,
        "circle-color": "#0f766e",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });
  if (!map.getLayer(STATION_LABEL))
    map.addLayer({
      id: STATION_LABEL,
      type: "symbol",
      source: STATION_SOURCE,
      layout: {
        "text-field": ["get", "stationId"],
        "text-size": 10,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
      },
      paint: { "text-color": "#073b35", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
  if (!map.getSource(PHOTO_SOURCE))
    map.addSource(PHOTO_SOURCE, { type: "geojson", data: photographyCollection([]) });
  if (!map.getLayer(PHOTO_CIRCLE))
    map.addLayer({
      id: PHOTO_CIRCLE,
      type: "circle",
      source: PHOTO_SOURCE,
      paint: {
        "circle-radius": 13,
        "circle-color": [
          "match",
          ["get", "riskLevel"],
          "lower",
          "#0f766e",
          "elevated",
          "#d97706",
          "high",
          "#be123c",
          "#64748b",
        ],
        "circle-opacity": 0.82,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  if (!map.getLayer(PHOTO_LABEL))
    map.addLayer({
      id: PHOTO_LABEL,
      type: "symbol",
      source: PHOTO_SOURCE,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-offset": [0, 1.7],
        "text-anchor": "top",
      },
      paint: { "text-color": "#17221b", "text-halo-color": "#ffffff", "text-halo-width": 2 },
    });
}

function ensureRadar(map: MlMap, frame: RadarFrame | undefined) {
  if (!frame) {
    if (map.getLayer(RADAR_LAYER)) map.removeLayer(RADAR_LAYER);
    if (map.getSource(RADAR_SOURCE)) map.removeSource(RADAR_SOURCE);
    return;
  }
  if (!map.getSource(RADAR_SOURCE))
    map.addSource(RADAR_SOURCE, {
      type: "raster",
      tiles: [frame.tileUrlTemplate],
      tileSize: 256,
      attribution: frame.source.attribution,
    });
  else (map.getSource(RADAR_SOURCE) as RasterTileSource).setTiles([frame.tileUrlTemplate]);
  if (!map.getLayer(RADAR_LAYER))
    map.addLayer({
      id: RADAR_LAYER,
      type: "raster",
      source: RADAR_SOURCE,
      paint: { "raster-opacity": 0.72, "raster-fade-duration": 150 },
    });
}

function ensureRasterProducts(
  map: MlMap,
  products: Array<{ frame: WeatherRasterFrame; opacity: number }>,
) {
  const active = new Set(products.map(({ frame }) => rasterKey(frame.layerId)));
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.id.startsWith(RASTER_PREFIX) && !active.has(layer.id)) map.removeLayer(layer.id);
  }
  for (const sourceId of Object.keys(map.getStyle().sources ?? {})) {
    if (sourceId.startsWith(RASTER_PREFIX) && !active.has(sourceId) && !map.getLayer(sourceId))
      map.removeSource(sourceId);
  }
  products.forEach(({ frame, opacity }) => {
    const id = rasterKey(frame.layerId);
    if (!map.getSource(id))
      map.addSource(id, {
        type: "raster",
        tiles: [frame.tileUrlTemplate],
        tileSize: 256,
        attribution: frame.source.attribution,
      });
    else (map.getSource(id) as RasterTileSource).setTiles([frame.tileUrlTemplate]);
    if (!map.getLayer(id))
      map.addLayer({
        id,
        type: "raster",
        source: id,
        paint: { "raster-opacity": opacity, "raster-fade-duration": 120 },
      });
    else map.setPaintProperty(id, "raster-opacity", opacity);
  });
}

export function WeatherMapOverlay({
  bundle,
  workspace,
  onSelectAlert,
}: {
  bundle: WeatherBundle | null;
  workspace: WeatherWorkspaceState;
  onSelectAlert: (alert: WeatherAlert) => void;
}) {
  const { map } = useMapRef();
  const radarVisible = Boolean(workspace.layerSettings["weather.radar.simple"]?.visible);
  const alertsVisible = Boolean(workspace.layerSettings["weather.severe.alerts"]?.visible);
  const stationsVisible = Boolean(workspace.layerSettings["weather.metar"]?.visible);
  const photographyVisible = Boolean(workspace.layerSettings["weather.photo"]?.visible);
  const frame = radarVisible
    ? nearestFrame(bundle?.radarFrames ?? [], workspace.timeline.selectedTime)
    : undefined;
  const rasterProducts = useMemo(() => {
    const byLayer = new Map<string, WeatherRasterFrame[]>();
    for (const product of bundle?.rasterFrames ?? []) {
      const frames = byLayer.get(product.layerId) ?? [];
      frames.push(product);
      byLayer.set(product.layerId, frames);
    }
    return [...byLayer.entries()].flatMap(([layerId, frames]) => {
      const setting = workspace.layerSettings[layerId];
      const selected = setting?.visible
        ? nearestRasterFrame(frames, workspace.timeline.selectedTime)
        : undefined;
      return selected ? [{ frame: selected, opacity: setting?.opacity ?? 0.7 }] : [];
    });
  }, [bundle?.rasterFrames, workspace.layerSettings, workspace.timeline.selectedTime]);

  useEffect(() => {
    if (!map) return;
    const update = () => {
      if (!map.isStyleLoaded()) return;
      ensureRadar(map, frame);
      ensureRasterProducts(map, rasterProducts);
      ensureVectorLayers(map);
      (map.getSource(ALERT_SOURCE) as GeoJSONSource | undefined)?.setData(
        alertsVisible ? alertCollection(bundle?.alerts ?? []) : alertCollection([]),
      );
      (map.getSource(INSPECT_SOURCE) as GeoJSONSource | undefined)?.setData(
        pointCollection(workspace.lastInspectionPoint),
      );
      (map.getSource(STATION_SOURCE) as GeoJSONSource | undefined)?.setData(
        stationCollection(stationsVisible ? (bundle?.stationObservations ?? []) : []),
      );
      (map.getSource(PHOTO_SOURCE) as GeoJSONSource | undefined)?.setData(
        photographyCollection(
          photographyVisible && bundle?.photography?.status === "ready"
            ? bundle.photography.zones
            : [],
        ),
      );
      if (map.getLayer(RADAR_LAYER))
        map.setPaintProperty(
          RADAR_LAYER,
          "raster-opacity",
          workspace.layerSettings["weather.radar.simple"]?.opacity ?? 0.72,
        );
      if (map.getLayer(ALERT_FILL))
        map.setPaintProperty(
          ALERT_FILL,
          "fill-opacity",
          workspace.layerSettings["weather.severe.alerts"]?.opacity ?? 0.28,
        );
      moveToTop(map, [
        RADAR_LAYER,
        ...rasterProducts.map(({ frame: product }) => rasterKey(product.layerId)),
        ALERT_FILL,
        ALERT_LINE,
        STATION_CIRCLE,
        STATION_LABEL,
        PHOTO_CIRCLE,
        PHOTO_LABEL,
        INSPECT_LAYER,
      ]);
    };
    update();
    map.on("style.load", update);
    return () => {
      map.off("style.load", update);
    };
  }, [
    alertsVisible,
    bundle,
    frame,
    map,
    photographyVisible,
    rasterProducts,
    stationsVisible,
    workspace.lastInspectionPoint,
    workspace.layerSettings,
  ]);

  useEffect(() => {
    if (!map) return;
    const select = (event: MapMouseEvent) => {
      if (!map.getLayer(ALERT_FILL)) return;
      const feature = map.queryRenderedFeatures(event.point, { layers: [ALERT_FILL] })[0];
      const id = String(feature?.properties?.["id"] ?? "");
      const alert = bundle?.alerts.find((item) => item.id === id);
      if (alert) onSelectAlert(alert);
    };
    map.on("click", select);
    return () => {
      map.off("click", select);
    };
  }, [bundle?.alerts, map, onSelectAlert]);

  return null;
}
