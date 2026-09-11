import { useEffect } from "react";
import type { GeoJSONSource, Map as MlMap, MapMouseEvent, RasterTileSource } from "maplibre-gl";
import type { FeatureCollection, Point, Polygon, MultiPolygon } from "geojson";
import { useMapRef } from "@/lib/gis/mapRef";
import type {
  RadarFrame,
  WeatherAlert,
  WeatherBundle,
  WeatherWorkspaceState,
} from "@/lib/weather/types";

const ALERT_SOURCE = "landdraft-weather-alerts";
const ALERT_FILL = "landdraft-weather-alert-fill";
const ALERT_LINE = "landdraft-weather-alert-line";
const RADAR_SOURCE = "landdraft-weather-radar";
const RADAR_LAYER = "landdraft-weather-radar-layer";
const INSPECT_SOURCE = "landdraft-weather-inspect-point";
const INSPECT_LAYER = "landdraft-weather-inspect-point-layer";

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
  const frame = radarVisible
    ? nearestFrame(bundle?.radarFrames ?? [], workspace.timeline.selectedTime)
    : undefined;

  useEffect(() => {
    if (!map) return;
    const update = () => {
      if (!map.isStyleLoaded()) return;
      ensureRadar(map, frame);
      ensureVectorLayers(map);
      (map.getSource(ALERT_SOURCE) as GeoJSONSource | undefined)?.setData(
        alertsVisible ? alertCollection(bundle?.alerts ?? []) : alertCollection([]),
      );
      (map.getSource(INSPECT_SOURCE) as GeoJSONSource | undefined)?.setData(
        pointCollection(workspace.lastInspectionPoint),
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
      moveToTop(map, [RADAR_LAYER, ALERT_FILL, ALERT_LINE, INSPECT_LAYER]);
    };
    update();
    map.on("style.load", update);
    return () => {
      map.off("style.load", update);
    };
  }, [alertsVisible, bundle, frame, map, workspace.lastInspectionPoint, workspace.layerSettings]);

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
