import { useEffect, useMemo } from "react";
import { Popup } from "maplibre-gl";
import type { GeoJSONSource, Map as MlMap, MapMouseEvent, RasterTileSource } from "maplibre-gl";
import { circle } from "@turf/turf";
import type { Feature, FeatureCollection, LineString, Point, Polygon, MultiPolygon } from "geojson";
import { useMapRef } from "@/lib/gis/mapRef";
import type {
  RadarFrame,
  WeatherAlert,
  WeatherBundle,
  WeatherChaserPosition,
  WeatherRasterFrame,
  WeatherStationObservation,
  StormObject,
  WeatherViewingZone,
  WeatherWorkspaceState,
} from "@/lib/weather/types";
import {
  stormEventIcon,
  stormIconImageId,
  stormSeverityColor,
  stormSeverityScore,
  type WeatherEventIcon,
} from "@/lib/weather/stormPresentation";
import { timeAdjustedStormForecast } from "@/lib/weather/stormIntelligence";

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
const STORM_SOURCE = "landdraft-weather-storm-objects";
const STORM_CIRCLE = "landdraft-weather-storm-circle";
const STORM_ICON = "landdraft-weather-storm-icon";
const STORM_LABEL = "landdraft-weather-storm-label";
const STORM_AREA_SOURCE = "landdraft-weather-storm-areas";
const STORM_AREA_FILL = "landdraft-weather-storm-area-fill";
const STORM_AREA_LINE = "landdraft-weather-storm-area-line";
const STORM_FORECAST_SOURCE = "landdraft-weather-storm-forecast";
const STORM_FORECAST_POSSIBLE = "landdraft-weather-storm-forecast-possible";
const STORM_FORECAST_POSSIBLE_LINE = "landdraft-weather-storm-forecast-possible-line";
const STORM_FORECAST_LIKELY = "landdraft-weather-storm-forecast-likely";
const STORM_FORECAST_LIKELY_LINE = "landdraft-weather-storm-forecast-likely-line";
const STORM_HISTORY_LINE = "landdraft-weather-storm-history-line";
const STORM_HISTORY_POINT = "landdraft-weather-storm-history-point";
const STORM_HISTORY_LABEL = "landdraft-weather-storm-history-label";
const STORM_FORECAST_LINE = "landdraft-weather-storm-forecast-line";
const STORM_FORECAST_POINT = "landdraft-weather-storm-forecast-point";
const STORM_FORECAST_ICON = "landdraft-weather-storm-forecast-icon";
const STORM_FORECAST_LABEL = "landdraft-weather-storm-forecast-label";
const CHASER_SOURCE = "landdraft-weather-chaser-location";
const CHASER_CIRCLE = "landdraft-weather-chaser-location-circle";
const COMMUNITY_CHASER_SOURCE = "landdraft-weather-community-chasers";
const COMMUNITY_CHASER_CLUSTER = "landdraft-weather-community-chaser-cluster";
const COMMUNITY_CHASER_CLUSTER_COUNT = "landdraft-weather-community-chaser-cluster-count";
const COMMUNITY_CHASER_POINT = "landdraft-weather-community-chaser-point";
const COMMUNITY_CHASER_FEATURED = "landdraft-weather-community-chaser-featured";
const NAVIGATION_TARGET_SOURCE = "landdraft-weather-navigation-target";
const NAVIGATION_TARGET_CIRCLE = "landdraft-weather-navigation-target-circle";
const NAVIGATION_TARGET_LABEL = "landdraft-weather-navigation-target-label";
const RASTER_PREFIX = "landdraft-weather-product-";

const WEATHER_EVENT_ICONS: WeatherEventIcon[] = [
  "tornado",
  "hail",
  "hurricane",
  "haboob",
  "lightning",
  "major-thunderstorm",
];

function drawWeatherEventIcon(context: CanvasRenderingContext2D, icon: WeatherEventIcon) {
  context.strokeStyle = "#ffffff";
  context.fillStyle = "#ffffff";
  context.lineWidth = 4.5;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (icon === "tornado") {
    context.moveTo(17, 16);
    context.lineTo(47, 16);
    context.moveTo(21, 24);
    context.lineTo(43, 24);
    context.moveTo(25, 32);
    context.lineTo(39, 32);
    context.moveTo(29, 40);
    context.lineTo(35, 40);
  } else if (icon === "hail") {
    context.arc(32, 32, 14, 0, Math.PI * 2);
    context.moveTo(32, 21);
    context.lineTo(32, 43);
    context.moveTo(21, 32);
    context.lineTo(43, 32);
    context.moveTo(24, 24);
    context.lineTo(40, 40);
    context.moveTo(40, 24);
    context.lineTo(24, 40);
  } else if (icon === "hurricane") {
    context.arc(32, 32, 7, 0, Math.PI * 2);
    context.moveTo(25, 27);
    context.bezierCurveTo(11, 14, 13, 39, 25, 39);
    context.moveTo(39, 25);
    context.bezierCurveTo(53, 16, 50, 43, 39, 39);
  } else if (icon === "haboob") {
    context.moveTo(13, 22);
    context.bezierCurveTo(23, 16, 33, 28, 51, 20);
    context.moveTo(13, 32);
    context.bezierCurveTo(25, 26, 37, 39, 51, 31);
    context.moveTo(17, 42);
    context.lineTo(46, 42);
  } else if (icon === "lightning") {
    context.moveTo(37, 12);
    context.lineTo(21, 34);
    context.lineTo(32, 34);
    context.lineTo(25, 52);
    context.lineTo(45, 27);
    context.lineTo(34, 27);
    context.closePath();
  } else {
    context.arc(28, 29, 10, Math.PI, Math.PI * 2);
    context.arc(39, 29, 8, Math.PI, Math.PI * 2);
    context.moveTo(18, 30);
    context.lineTo(48, 30);
    context.moveTo(35, 34);
    context.lineTo(29, 45);
    context.lineTo(37, 45);
    context.lineTo(33, 53);
  }
  context.stroke();
  if (icon === "lightning") context.fill();
}

function ensureWeatherEventIcons(map: MlMap) {
  for (const icon of WEATHER_EVENT_ICONS) {
    const id = stormIconImageId(icon);
    if (map.hasImage(id)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) continue;
    drawWeatherEventIcon(context, icon);
    map.addImage(id, context.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
  }
}

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

function communityChaserCollection(positions: WeatherChaserPosition[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: positions.map((position) => ({
      ...position.location,
      properties: {
        id: position.id,
        observedAt: position.observedAt,
        motionStatus: position.motionStatus,
        featured: position.featured,
        displayName: position.displayName ?? "",
        callsign: position.callsign ?? "",
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

function stormCollection(
  storms: StormObject[],
  selectedStormId: string | null,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: storms.map((storm) => {
      const severity = stormSeverityScore(storm);
      return {
        ...storm.centroid,
        properties: {
          id: storm.id,
          alertId: storm.officialAlertIds[0] ?? "",
          title: storm.title,
          basis: storm.basis,
          selected: storm.id === selectedStormId,
          severity,
          severityColor: stormSeverityColor(severity),
          icon: stormIconImageId(stormEventIcon(storm)),
          temporalState: storm.basis === "provider-guidance" ? "ANALYZED" : "OFFICIAL",
        },
      };
    }),
  };
}

function stormAreaCollection(
  storms: StormObject[],
  selectedStormId: string | null = null,
): FeatureCollection<Polygon | MultiPolygon> {
  return {
    type: "FeatureCollection",
    features: storms.flatMap((storm) =>
      storm.geometry && storm.basis === "provider-guidance"
        ? [
            {
              ...storm.geometry,
              properties: {
                id: storm.id,
                title: storm.title,
                selected: storm.id === selectedStormId,
                maximumProbability: Math.max(
                  storm.hazards.tornado.probabilityPct ?? 0,
                  storm.hazards.hail.probabilityPct ?? 0,
                  storm.hazards.wind.probabilityPct ?? 0,
                ),
              },
            },
          ]
        : [],
    ),
  };
}

function stormForecastCollection(
  storm: StormObject | null,
  referenceTime: string,
): FeatureCollection<Polygon | LineString | Point> {
  if (!storm) return { type: "FeatureCollection", features: [] };
  const features: Array<Feature<Polygon | LineString | Point>> = [];
  const severity = stormSeverityScore(storm);
  const eventIcon = stormIconImageId(stormEventIcon(storm));
  const rollingForecast = timeAdjustedStormForecast(storm, referenceTime);
  const forecastPositions = rollingForecast.positions;
  if (storm.history.length > 1) {
    const latestTime = new Date(storm.history.at(-1)!.validTime).getTime();
    features.push({
      type: "Feature",
      properties: { kind: "history-track", id: storm.id },
      geometry: {
        type: "LineString",
        coordinates: storm.history.map((sample) => sample.location.geometry.coordinates),
      },
    });
    for (const sample of storm.history.slice(0, -1)) {
      const minutesAgo = Math.max(
        1,
        Math.round((latestTime - new Date(sample.validTime).getTime()) / 60_000),
      );
      features.push({
        ...sample.location,
        properties: { kind: "history-position", id: storm.id, label: `−${minutesAgo}m` },
      });
    }
  }
  for (const forecast of forecastPositions) {
    const possible = circle(forecast.location, forecast.possibleRadiusKm, {
      units: "kilometers",
      steps: 48,
    });
    const likely = circle(forecast.location, forecast.likelyRadiusKm, {
      units: "kilometers",
      steps: 48,
    });
    features.push(
      {
        ...possible,
        properties: { kind: "possible", id: storm.id, leadMinutes: forecast.leadMinutes },
      },
      {
        ...likely,
        properties: { kind: "likely", id: storm.id, leadMinutes: forecast.leadMinutes },
      },
      {
        ...forecast.location,
        properties: {
          kind: "position",
          id: storm.id,
          leadMinutes: forecast.leadMinutes,
          label: `+${forecast.leadMinutes}m`,
          severity,
          severityColor: stormSeverityColor(severity),
          icon: eventIcon,
          temporalState: "PREDICTED",
        },
      },
    );
  }
  if (forecastPositions.length)
    features.push({
      type: "Feature",
      properties: {
        kind: "track",
        id: storm.id,
        ageAdjusted: rollingForecast.ageAdjusted,
        sourceAgeMinutes: rollingForecast.sourceAgeMinutes,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          rollingForecast.anchor.geometry.coordinates,
          ...forecastPositions.map((forecast) => forecast.location.geometry.coordinates),
        ],
      },
    });
  return { type: "FeatureCollection", features };
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
  ensureWeatherEventIcons(map);
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
  if (!map.getSource(STORM_SOURCE))
    map.addSource(STORM_SOURCE, { type: "geojson", data: stormCollection([], null) });
  if (!map.getLayer(STORM_CIRCLE))
    map.addLayer({
      id: STORM_CIRCLE,
      type: "circle",
      source: STORM_SOURCE,
      paint: {
        "circle-radius": ["case", ["boolean", ["get", "selected"], false], 18, 15],
        "circle-color": ["get", "severityColor"],
        "circle-opacity": 0.94,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["case", ["boolean", ["get", "selected"], false], 3, 2],
      },
    });
  if (!map.getLayer(STORM_ICON))
    map.addLayer({
      id: STORM_ICON,
      type: "symbol",
      source: STORM_SOURCE,
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["case", ["boolean", ["get", "selected"], false], 0.74, 0.62],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  if (!map.getSource(STORM_AREA_SOURCE))
    map.addSource(STORM_AREA_SOURCE, { type: "geojson", data: stormAreaCollection([]) });
  if (!map.getLayer(STORM_AREA_FILL))
    map.addLayer({
      id: STORM_AREA_FILL,
      type: "fill",
      source: STORM_AREA_SOURCE,
      paint: {
        "fill-color": [
          "step",
          ["get", "maximumProbability"],
          "#facc15",
          30,
          "#f97316",
          60,
          "#dc2626",
          80,
          "#7f1d1d",
        ],
        "fill-opacity": 0.16,
      },
    });
  if (!map.getLayer(STORM_AREA_LINE))
    map.addLayer({
      id: STORM_AREA_LINE,
      type: "line",
      source: STORM_AREA_SOURCE,
      paint: {
        "line-color": "#7f1d1d",
        "line-width": ["case", ["boolean", ["get", "selected"], false], 4, 1.5],
        "line-opacity": ["case", ["boolean", ["get", "selected"], false], 1, 0.55],
        "line-dasharray": [2, 1],
      },
    });
  if (!map.getSource(STORM_FORECAST_SOURCE))
    map.addSource(STORM_FORECAST_SOURCE, {
      type: "geojson",
      data: stormForecastCollection(null, new Date().toISOString()),
    });
  if (!map.getLayer(STORM_FORECAST_POSSIBLE))
    map.addLayer({
      id: STORM_FORECAST_POSSIBLE,
      type: "fill",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "possible"],
      paint: { "fill-color": "#fdba74", "fill-opacity": 0.13 },
    });
  if (!map.getLayer(STORM_FORECAST_POSSIBLE_LINE))
    map.addLayer({
      id: STORM_FORECAST_POSSIBLE_LINE,
      type: "line",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "possible"],
      paint: {
        "line-color": "#ea580c",
        "line-width": 1.5,
        "line-opacity": 0.75,
        "line-dasharray": [3, 2],
      },
    });
  if (!map.getLayer(STORM_FORECAST_LIKELY))
    map.addLayer({
      id: STORM_FORECAST_LIKELY,
      type: "fill",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "likely"],
      paint: { "fill-color": "#f97316", "fill-opacity": 0.23 },
    });
  if (!map.getLayer(STORM_FORECAST_LIKELY_LINE))
    map.addLayer({
      id: STORM_FORECAST_LIKELY_LINE,
      type: "line",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "likely"],
      paint: { "line-color": "#c2410c", "line-width": 2, "line-opacity": 0.95 },
    });
  if (!map.getLayer(STORM_HISTORY_LINE))
    map.addLayer({
      id: STORM_HISTORY_LINE,
      type: "line",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "history-track"],
      paint: { "line-color": "#0369a1", "line-width": 3, "line-opacity": 0.95 },
    });
  if (!map.getLayer(STORM_HISTORY_POINT))
    map.addLayer({
      id: STORM_HISTORY_POINT,
      type: "circle",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "history-position"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#e0f2fe",
        "circle-stroke-color": "#0369a1",
        "circle-stroke-width": 2,
      },
    });
  if (!map.getLayer(STORM_HISTORY_LABEL))
    map.addLayer({
      id: STORM_HISTORY_LABEL,
      type: "symbol",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "history-position"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 9,
        "text-offset": [0, -1.1],
        "text-anchor": "bottom",
      },
      paint: { "text-color": "#075985", "text-halo-color": "#ffffff", "text-halo-width": 2 },
    });
  if (!map.getLayer(STORM_FORECAST_LINE))
    map.addLayer({
      id: STORM_FORECAST_LINE,
      type: "line",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "track"],
      paint: { "line-color": "#c2410c", "line-width": 3, "line-dasharray": [2, 1.5] },
    });
  if (!map.getLayer(STORM_FORECAST_POINT))
    map.addLayer({
      id: STORM_FORECAST_POINT,
      type: "circle",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "position"],
      paint: {
        "circle-radius": 11,
        "circle-color": ["get", "severityColor"],
        "circle-opacity": 0.72,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  if (!map.getLayer(STORM_FORECAST_ICON))
    map.addLayer({
      id: STORM_FORECAST_ICON,
      type: "symbol",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "position"],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": 0.44,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  if (!map.getLayer(STORM_FORECAST_LABEL))
    map.addLayer({
      id: STORM_FORECAST_LABEL,
      type: "symbol",
      source: STORM_FORECAST_SOURCE,
      filter: ["==", ["get", "kind"], "position"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 10,
        "text-offset": [0, 1.65],
        "text-anchor": "top",
      },
      paint: { "text-color": "#7c2d12", "text-halo-color": "#ffffff", "text-halo-width": 2 },
    });
  if (!map.getLayer(STORM_LABEL))
    map.addLayer({
      id: STORM_LABEL,
      type: "symbol",
      source: STORM_SOURCE,
      layout: {
        "text-field": ["get", "title"],
        "text-size": 11,
        "text-offset": [0, 2.05],
        "text-anchor": "top",
        "text-max-width": 16,
      },
      paint: { "text-color": "#571414", "text-halo-color": "#ffffff", "text-halo-width": 2 },
    });
  if (!map.getSource(CHASER_SOURCE))
    map.addSource(CHASER_SOURCE, { type: "geojson", data: pointCollection(undefined) });
  if (!map.getLayer(CHASER_CIRCLE))
    map.addLayer({
      id: CHASER_CIRCLE,
      type: "circle",
      source: CHASER_SOURCE,
      paint: {
        "circle-radius": 8,
        "circle-color": "#1687ff",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3,
      },
    });
  if (!map.getSource(COMMUNITY_CHASER_SOURCE))
    map.addSource(COMMUNITY_CHASER_SOURCE, {
      type: "geojson",
      data: communityChaserCollection([]),
      cluster: true,
      clusterMaxZoom: 10,
      clusterRadius: 36,
    });
  if (!map.getLayer(COMMUNITY_CHASER_CLUSTER))
    map.addLayer({
      id: COMMUNITY_CHASER_CLUSTER,
      type: "circle",
      source: COMMUNITY_CHASER_SOURCE,
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": ["step", ["get", "point_count"], 13, 10, 17, 50, 21],
        "circle-color": "#93c5fd",
        "circle-opacity": 0.94,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  if (!map.getLayer(COMMUNITY_CHASER_CLUSTER_COUNT))
    map.addLayer({
      id: COMMUNITY_CHASER_CLUSTER_COUNT,
      type: "symbol",
      source: COMMUNITY_CHASER_SOURCE,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 10,
      },
      paint: { "text-color": "#172554" },
    });
  if (!map.getLayer(COMMUNITY_CHASER_POINT))
    map.addLayer({
      id: COMMUNITY_CHASER_POINT,
      type: "circle",
      source: COMMUNITY_CHASER_SOURCE,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["case", ["boolean", ["get", "featured"], false], 9, 7],
        "circle-color": [
          "case",
          ["boolean", ["get", "featured"], false],
          "#f59e0b",
          ["==", ["get", "motionStatus"], "moving"],
          "#1d4ed8",
          "#2563eb",
        ],
        "circle-opacity": 0.92,
        "circle-stroke-color": [
          "case",
          ["boolean", ["get", "featured"], false],
          "#78350f",
          "#ffffff",
        ],
        "circle-stroke-width": ["case", ["boolean", ["get", "featured"], false], 2.5, 2],
      },
    });
  if (!map.getLayer(COMMUNITY_CHASER_FEATURED))
    map.addLayer({
      id: COMMUNITY_CHASER_FEATURED,
      type: "symbol",
      source: COMMUNITY_CHASER_SOURCE,
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "featured"], true]],
      layout: {
        "text-field": "★",
        "text-size": 11,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff", "text-halo-color": "#78350f", "text-halo-width": 0.5 },
    });
  if (!map.getSource(NAVIGATION_TARGET_SOURCE))
    map.addSource(NAVIGATION_TARGET_SOURCE, { type: "geojson", data: pointCollection(undefined) });
  if (!map.getLayer(NAVIGATION_TARGET_CIRCLE))
    map.addLayer({
      id: NAVIGATION_TARGET_CIRCLE,
      type: "circle",
      source: NAVIGATION_TARGET_SOURCE,
      paint: {
        "circle-radius": 10,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#17221b",
        "circle-stroke-width": 3,
      },
    });
  if (!map.getLayer(NAVIGATION_TARGET_LABEL))
    map.addLayer({
      id: NAVIGATION_TARGET_LABEL,
      type: "symbol",
      source: NAVIGATION_TARGET_SOURCE,
      layout: { "text-field": "TARGET", "text-size": 10, "text-offset": [0, 1.7] },
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

function renderedLayerIds(weatherLayerId: string) {
  if (weatherLayerId === "weather.radar.simple") return [RADAR_LAYER];
  if (weatherLayerId === "weather.severe.alerts") return [ALERT_FILL, ALERT_LINE];
  if (weatherLayerId === "weather.severe.intelligence")
    return [
      STORM_AREA_FILL,
      STORM_AREA_LINE,
      STORM_FORECAST_POSSIBLE,
      STORM_FORECAST_POSSIBLE_LINE,
      STORM_FORECAST_LIKELY,
      STORM_FORECAST_LIKELY_LINE,
      STORM_HISTORY_LINE,
      STORM_HISTORY_POINT,
      STORM_HISTORY_LABEL,
      STORM_FORECAST_LINE,
      STORM_FORECAST_POINT,
      STORM_FORECAST_ICON,
      STORM_FORECAST_LABEL,
      STORM_CIRCLE,
      STORM_ICON,
      STORM_LABEL,
    ];
  if (weatherLayerId === "weather.metar") return [STATION_CIRCLE, STATION_LABEL];
  if (weatherLayerId === "weather.storm_chaser.spotters")
    return [
      COMMUNITY_CHASER_CLUSTER,
      COMMUNITY_CHASER_CLUSTER_COUNT,
      COMMUNITY_CHASER_POINT,
      COMMUNITY_CHASER_FEATURED,
    ];
  if (weatherLayerId === "weather.photo") return [PHOTO_CIRCLE, PHOTO_LABEL];
  if (weatherLayerId.startsWith("weather.")) return [rasterKey(weatherLayerId)];
  return [];
}

export function WeatherMapOverlay({
  bundle,
  workspace,
  onSelectAlert,
  onSelectStorm,
  onSelectCommunityChaser,
  stormObjectsVisible = false,
  selectedStormId = null,
  forecastReferenceTime,
  chaserLocation,
  navigationTarget,
}: {
  bundle: WeatherBundle | null;
  workspace: WeatherWorkspaceState;
  onSelectAlert: (alert: WeatherAlert) => void;
  onSelectStorm: (storm: StormObject) => void;
  onSelectCommunityChaser: (position: WeatherChaserPosition) => void;
  stormObjectsVisible?: boolean;
  selectedStormId?: string | null;
  forecastReferenceTime: string;
  chaserLocation?: [number, number] | undefined;
  navigationTarget?: [number, number] | undefined;
}) {
  const { map } = useMapRef();
  const radarVisible = Boolean(workspace.layerSettings["weather.radar.simple"]?.visible);
  const alertsVisible = Boolean(workspace.layerSettings["weather.severe.alerts"]?.visible);
  const stationsVisible = Boolean(workspace.layerSettings["weather.metar"]?.visible);
  const photographyVisible = Boolean(workspace.layerSettings["weather.photo"]?.visible);
  const communityChasersVisible = Boolean(
    workspace.layerSettings["weather.storm_chaser.spotters"]?.visible,
  );
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
      (map.getSource(STORM_SOURCE) as GeoJSONSource | undefined)?.setData(
        stormCollection(stormObjectsVisible ? (bundle?.stormObjects ?? []) : [], selectedStormId),
      );
      (map.getSource(STORM_AREA_SOURCE) as GeoJSONSource | undefined)?.setData(
        stormAreaCollection(
          stormObjectsVisible ? (bundle?.stormObjects ?? []) : [],
          selectedStormId,
        ),
      );
      const selectedStorm =
        bundle?.stormObjects.find((storm) => storm.id === selectedStormId) ?? null;
      (map.getSource(STORM_FORECAST_SOURCE) as GeoJSONSource | undefined)?.setData(
        stormForecastCollection(stormObjectsVisible ? selectedStorm : null, forecastReferenceTime),
      );
      (map.getSource(CHASER_SOURCE) as GeoJSONSource | undefined)?.setData(
        pointCollection(chaserLocation),
      );
      (map.getSource(COMMUNITY_CHASER_SOURCE) as GeoJSONSource | undefined)?.setData(
        communityChaserCollection(communityChasersVisible ? (bundle?.chaserPositions ?? []) : []),
      );
      (map.getSource(NAVIGATION_TARGET_SOURCE) as GeoJSONSource | undefined)?.setData(
        pointCollection(navigationTarget),
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
      if (map.getLayer(STORM_AREA_FILL))
        map.setPaintProperty(
          STORM_AREA_FILL,
          "fill-opacity",
          (workspace.layerSettings["weather.severe.intelligence"]?.opacity ?? 0.72) * 0.22,
        );
      for (const id of [COMMUNITY_CHASER_CLUSTER, COMMUNITY_CHASER_POINT])
        if (map.getLayer(id))
          map.setPaintProperty(
            id,
            "circle-opacity",
            workspace.layerSettings["weather.storm_chaser.spotters"]?.opacity ?? 0.92,
          );
      const orderedLayers = [...workspace.layerOrder]
        .reverse()
        .filter((id) => workspace.layerSettings[id]?.visible)
        .flatMap(renderedLayerIds);
      moveToTop(map, [
        ...orderedLayers,
        INSPECT_LAYER,
        STORM_AREA_FILL,
        STORM_AREA_LINE,
        STORM_FORECAST_POSSIBLE,
        STORM_FORECAST_POSSIBLE_LINE,
        STORM_FORECAST_LIKELY,
        STORM_FORECAST_LIKELY_LINE,
        STORM_HISTORY_LINE,
        STORM_HISTORY_POINT,
        STORM_HISTORY_LABEL,
        STORM_FORECAST_LINE,
        STORM_FORECAST_POINT,
        STORM_FORECAST_ICON,
        STORM_FORECAST_LABEL,
        STORM_CIRCLE,
        STORM_ICON,
        STORM_LABEL,
        COMMUNITY_CHASER_CLUSTER,
        COMMUNITY_CHASER_CLUSTER_COUNT,
        COMMUNITY_CHASER_POINT,
        COMMUNITY_CHASER_FEATURED,
        CHASER_CIRCLE,
        NAVIGATION_TARGET_CIRCLE,
        NAVIGATION_TARGET_LABEL,
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
    stormObjectsVisible,
    selectedStormId,
    forecastReferenceTime,
    chaserLocation,
    communityChasersVisible,
    navigationTarget,
    workspace.lastInspectionPoint,
    workspace.layerOrder,
    workspace.layerSettings,
  ]);

  useEffect(() => {
    if (!map) return;
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 14 });
    let hoveredId = "";
    const hover = (event: MapMouseEvent) => {
      if (!map.getLayer(COMMUNITY_CHASER_POINT)) return;
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [COMMUNITY_CHASER_POINT],
      })[0];
      const id = String(feature?.properties?.["id"] ?? "");
      if (!id) {
        hoveredId = "";
        popup.remove();
        map.getCanvas().style.cursor = "";
        return;
      }
      map.getCanvas().style.cursor = "pointer";
      if (id === hoveredId) return;
      const position = bundle?.chaserPositions.find((item) => item.id === id);
      if (!position) return;
      hoveredId = id;
      const container = document.createElement("div");
      container.className = "min-w-44 space-y-1 p-1 text-[11px] text-foreground";
      const title = document.createElement("strong");
      title.className = "block";
      title.textContent =
        position.displayName ??
        position.callsign ??
        (position.featured ? "Featured experienced reporter" : "Community spotter");
      container.append(title);
      const identity = document.createElement("div");
      identity.className = "text-[9px] text-muted-foreground";
      identity.textContent =
        position.displayName || position.callsign
          ? [position.callsign, position.organization].filter(Boolean).join(" · ")
          : "Name unavailable in the current privacy feed";
      container.append(identity);
      const details = document.createElement("div");
      details.className = "text-[9px]";
      details.textContent = `${position.motionStatus} · observed ${new Date(
        position.observedAt,
      ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      container.append(details);
      const coordinates = position.location.geometry.coordinates as [number, number];
      popup.setLngLat(coordinates).setDOMContent(container).addTo(map);
    };
    const leaveMap = () => {
      hoveredId = "";
      popup.remove();
      map.getCanvas().style.cursor = "";
    };
    map.on("mousemove", hover);
    map.on("mouseout", leaveMap);
    return () => {
      map.off("mousemove", hover);
      map.off("mouseout", leaveMap);
      leaveMap();
    };
  }, [bundle?.chaserPositions, map]);

  useEffect(() => {
    if (!map) return;
    const select = (event: MapMouseEvent) => {
      if (!map.getLayer(ALERT_FILL)) return;
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [
          STORM_ICON,
          STORM_CIRCLE,
          STORM_FORECAST_ICON,
          STORM_FORECAST_POINT,
          STORM_AREA_FILL,
          COMMUNITY_CHASER_CLUSTER,
          COMMUNITY_CHASER_POINT,
          ALERT_FILL,
        ].filter((id) => map.getLayer(id)),
      })[0];
      const isStormFeature =
        feature?.layer.id === STORM_ICON ||
        feature?.layer.id === STORM_CIRCLE ||
        feature?.layer.id === STORM_FORECAST_ICON ||
        feature?.layer.id === STORM_FORECAST_POINT ||
        feature?.layer.id === STORM_AREA_FILL;
      const id = String(feature?.properties?.["id"] ?? "");
      if (feature?.layer.id === COMMUNITY_CHASER_CLUSTER) {
        const clusterId = Number(feature.properties?.["cluster_id"]);
        const coordinates =
          feature.geometry.type === "Point"
            ? (feature.geometry.coordinates as [number, number])
            : undefined;
        const source = map.getSource(COMMUNITY_CHASER_SOURCE) as GeoJSONSource | undefined;
        if (source && Number.isFinite(clusterId) && coordinates)
          void source.getClusterExpansionZoom(clusterId).then((zoom) => {
            map.easeTo({ center: coordinates, zoom, duration: 500, essential: true });
          });
        event.originalEvent.stopPropagation();
        return;
      }
      if (feature?.layer.id === COMMUNITY_CHASER_POINT) {
        const position = bundle?.chaserPositions.find((item) => item.id === id);
        if (position) {
          event.originalEvent.stopPropagation();
          onSelectCommunityChaser(position);
          return;
        }
      }
      if (isStormFeature) {
        const storm = bundle?.stormObjects.find((item) => item.id === id);
        if (storm) {
          event.originalEvent.stopPropagation();
          onSelectStorm(storm);
          return;
        }
      }
      const alert = bundle?.alerts.find((item) => item.id === id);
      if (alert) onSelectAlert(alert);
    };
    map.on("click", select);
    return () => {
      map.off("click", select);
    };
  }, [
    bundle?.alerts,
    bundle?.chaserPositions,
    bundle?.stormObjects,
    map,
    onSelectAlert,
    onSelectCommunityChaser,
    onSelectStorm,
  ]);

  return null;
}
