import { useEffect } from "react";
import type { GeoJSONSource, MapLayerMouseEvent, MapTouchEvent, Map as MlMap } from "maplibre-gl";
import type { FeatureCollection, LineString, Point } from "geojson";
import { useMapRef } from "@/lib/gis/mapRef";
import type {
  PipelineProfilePoint,
  PipelineRoute,
  PipelineScenario,
  PipelineVisualizationMode,
} from "@/lib/pipeline/types";

const SOURCE_ID = "landdraft-pipeline-result";
const SCRUB_SOURCE_ID = "landdraft-pipeline-scrub";
const LINE_ID = "landdraft-pipeline-result-line";
const HIT_ID = "landdraft-pipeline-result-hit";
const SCRUB_ID = "landdraft-pipeline-scrub-point";

function resultColor(
  point: PipelineProfilePoint,
  scenario: PipelineScenario,
  mode: PipelineVisualizationMode,
  elevationRange: [number, number],
): string {
  if (mode === "velocity") {
    const ratio = point.velocityMS / Math.max(1e-9, scenario.limits.maximumVelocityMS);
    if (ratio > 1) return "#b91c1c";
    if (ratio > 0.9) return "#ea580c";
    if (ratio > 0.75) return "#d6a10d";
    return "#15803d";
  }
  if (mode === "elevation") {
    const elevation = point.pipelineElevationM ?? point.groundElevationM;
    if (elevation === undefined) return "#64748b";
    const ratio =
      (elevation - elevationRange[0]) / Math.max(1e-9, elevationRange[1] - elevationRange[0]);
    if (ratio > 0.75) return "#7c3aed";
    if (ratio > 0.5) return "#2563eb";
    if (ratio > 0.25) return "#0891b2";
    return "#0f766e";
  }
  if (mode === "minimum-pressure-margin") {
    const margin = point.minimumPressureMarginPa;
    const target = Math.max(1, scenario.limits.minimumPressureMarginPa);
    if (margin < 0) return "#b91c1c";
    if (margin < target) return "#ea580c";
    if (margin < target * 2) return "#d6a10d";
    return "#15803d";
  }
  if (mode === "pressure") {
    if (
      point.pressurePa > scenario.limits.maopPa ||
      point.pressurePa < scenario.limits.minimumPressurePa
    )
      return "#b91c1c";
    const highMargin = scenario.limits.maopPa - point.pressurePa;
    const lowMargin = point.pressurePa - scenario.limits.minimumPressurePa;
    const margin = Math.min(highMargin, lowMargin);
    const target = Math.max(1, scenario.limits.minimumPressureMarginPa);
    if (margin < target) return "#ea580c";
    if (margin < target * 2) return "#d6a10d";
    return "#15803d";
  }
  const margin = point.pressureMarginPa;
  const target = Math.max(1, scenario.limits.minimumPressureMarginPa);
  if (margin < 0) return "#b91c1c";
  if (margin < target) return "#ea580c";
  if (margin < target * 2) return "#d6a10d";
  return "#15803d";
}

function buildSegments(
  profile: PipelineProfilePoint[],
  scenario: PipelineScenario,
  mode: PipelineVisualizationMode,
): FeatureCollection<LineString> {
  const elevations = profile
    .map((point) => point.pipelineElevationM ?? point.groundElevationM)
    .filter((value): value is number => value !== undefined);
  const range: [number, number] = elevations.length
    ? [Math.min(...elevations), Math.max(...elevations)]
    : [0, 1];
  return {
    type: "FeatureCollection",
    features: profile.slice(1).map((point, index) => ({
      type: "Feature",
      properties: {
        color: resultColor(point, scenario, mode, range),
        startStationM: profile[index]!.stationM,
        endStationM: point.stationM,
      },
      geometry: {
        type: "LineString",
        coordinates: [profile[index]!.coordinate, point.coordinate],
      },
    })),
  };
}

function emptyPoint(): FeatureCollection<Point> {
  return { type: "FeatureCollection", features: [] };
}

function ensureLayers(map: MlMap) {
  if (!map.getSource(SOURCE_ID))
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  if (!map.getLayer(LINE_ID))
    map.addLayer({
      id: LINE_ID,
      type: "line",
      source: SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#177542"],
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });
  if (!map.getLayer(HIT_ID))
    map.addLayer({
      id: HIT_ID,
      type: "line",
      source: SOURCE_ID,
      paint: { "line-color": "#000000", "line-width": 24, "line-opacity": 0.01 },
    });
  if (!map.getSource(SCRUB_SOURCE_ID))
    map.addSource(SCRUB_SOURCE_ID, { type: "geojson", data: emptyPoint() });
  if (!map.getLayer(SCRUB_ID))
    map.addLayer({
      id: SCRUB_ID,
      type: "circle",
      source: SCRUB_SOURCE_ID,
      paint: {
        "circle-radius": 7,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#17221a",
        "circle-stroke-width": 3,
      },
    });
}

function nearestStationFromPoint(
  map: MlMap,
  point: { x: number; y: number },
  route: PipelineRoute,
): { stationM: number; distancePx: number } {
  let best = { distance: Number.POSITIVE_INFINITY, stationM: 0 };
  for (let index = 1; index < route.stations.length; index += 1) {
    const start = route.stations[index - 1]!;
    const end = route.stations[index]!;
    const a = map.project([Number(start.coordinate[0]), Number(start.coordinate[1])]);
    const b = map.project([Number(end.coordinate[0]), Number(end.coordinate[1])]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denominator = dx * dx + dy * dy;
    const fraction =
      denominator === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator));
    const x = a.x + dx * fraction;
    const y = a.y + dy * fraction;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < best.distance)
      best = {
        distance,
        stationM: start.stationM + (end.stationM - start.stationM) * fraction,
      };
  }
  return { stationM: best.stationM, distancePx: best.distance };
}

export function PipelineMapOverlay({
  route,
  profile,
  scenario,
  mode,
  scrubPoint,
  onScrub,
}: {
  route: PipelineRoute | undefined;
  profile: PipelineProfilePoint[];
  scenario: PipelineScenario | undefined;
  mode: PipelineVisualizationMode;
  scrubPoint: PipelineProfilePoint | undefined;
  onScrub: (stationM: number | null) => void;
}) {
  const { map } = useMapRef();

  useEffect(() => {
    if (!map) return;
    const update = () => {
      if (!map.isStyleLoaded()) return;
      ensureLayers(map);
      const data = scenario
        ? buildSegments(profile, scenario, mode)
        : { type: "FeatureCollection", features: [] };
      (map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(data as FeatureCollection);
      if (map.getLayer(LINE_ID)) map.moveLayer(LINE_ID);
      if (map.getLayer(HIT_ID)) map.moveLayer(HIT_ID);
      if (map.getLayer(SCRUB_ID)) map.moveLayer(SCRUB_ID);
    };
    update();
    map.on("style.load", update);
    return () => {
      map.off("style.load", update);
    };
  }, [map, mode, profile, scenario]);

  useEffect(() => {
    if (!map || !map.isStyleLoaded() || !map.getSource(SCRUB_SOURCE_ID)) return;
    const data: FeatureCollection<Point> = scrubPoint
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: scrubPoint.coordinate },
            },
          ],
        }
      : emptyPoint();
    (map.getSource(SCRUB_SOURCE_ID) as GeoJSONSource).setData(data);
  }, [map, scrubPoint]);

  useEffect(() => {
    if (!map || !route) return;
    const handleMouse = (event: MapLayerMouseEvent) => {
      const nearest = nearestStationFromPoint(map, event.point, route);
      if (nearest.distancePx <= 20) onScrub(nearest.stationM);
    };
    const handleLeave = () => onScrub(null);
    const handleTouch = (event: MapTouchEvent) => {
      const point = event.points[0];
      if (!point) return;
      const nearest = nearestStationFromPoint(map, point, route);
      if (nearest.distancePx <= 28) onScrub(nearest.stationM);
    };
    let attached = false;
    const attach = () => {
      if (attached || !map.getLayer(HIT_ID)) return;
      attached = true;
      map.on("mousemove", HIT_ID, handleMouse);
      map.on("mouseleave", HIT_ID, handleLeave);
      map.on("touchmove", handleTouch);
    };
    attach();
    map.on("style.load", attach);
    return () => {
      map.off("style.load", attach);
      if (attached) {
        map.off("mousemove", HIT_ID, handleMouse);
        map.off("mouseleave", HIT_ID, handleLeave);
        map.off("touchmove", handleTouch);
      }
    };
  }, [map, onScrub, route]);

  return null;
}
