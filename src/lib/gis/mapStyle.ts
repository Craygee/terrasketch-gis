import type { Map as MlMap, LayerSpecification } from "maplibre-gl";
import type { GisLayer, FillPattern } from "./types";

export const sourceId = (layerId: string) => `src-${layerId}`;
export const fillId = (layerId: string) => `fill-${layerId}`;
export const lineId = (layerId: string) => `line-${layerId}`;
export const lineHitId = (layerId: string) => `line-hit-${layerId}`;
export const pointId = (layerId: string) => `point-${layerId}`;
export const markerIconId = (layerId: string) => `marker-${layerId}`;
export const labelId = (layerId: string) => `label-${layerId}`;
export const highlightId = (layerId: string) => `hl-${layerId}`;
export const highlightPointId = (layerId: string) => `hl-point-${layerId}`;

export const patternImageId = (pattern: FillPattern, color: string) =>
  `pat-${pattern}-${color.replace("#", "")}`;

/** Draws hatch/dot fill patterns into a canvas and registers them with MapLibre. */
export function ensurePatternImage(map: MlMap, pattern: FillPattern, color: string): string | null {
  if (pattern === "solid") return null;
  const id = patternImageId(pattern, color);
  if (map.hasImage(id)) return id;
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  if (pattern === "diagonal" || pattern === "crosshatch") {
    ctx.beginPath();
    ctx.moveTo(-4, size + 4);
    ctx.lineTo(size + 4, -4);
    ctx.moveTo(-4, size / 2 + 4);
    ctx.lineTo(size / 2 + 4, -4);
    ctx.moveTo(size / 2 - 4, size + 4);
    ctx.lineTo(size + 4, size / 2 - 4);
    ctx.stroke();
  }
  if (pattern === "horizontal" || pattern === "vertical") {
    ctx.beginPath();
    for (let offset = 4; offset < size; offset += 8) {
      if (pattern === "horizontal") {
        ctx.moveTo(0, offset);
        ctx.lineTo(size, offset);
      } else {
        ctx.moveTo(offset, 0);
        ctx.lineTo(offset, size);
      }
    }
    ctx.stroke();
  }
  if (pattern === "crosshatch") {
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(size + 4, size + 4);
    ctx.moveTo(size / 2 - 4, -4);
    ctx.lineTo(size + 4, size / 2 + 4);
    ctx.moveTo(-4, size / 2 - 4);
    ctx.lineTo(size / 2 + 4, size + 4);
    ctx.stroke();
  }
  if (pattern === "dotted") {
    for (const [x, y] of [
      [4, 4],
      [12, 12],
      [12, 4],
      [4, 12],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const data = ctx.getImageData(0, 0, size, size);
  map.addImage(id, { width: size, height: size, data: new Uint8Array(data.data) });
  return id;
}

export function buildLayerSpecs(layer: GisLayer, map: MlMap): LayerSpecification[] {
  const src = sourceId(layer.id);
  const s = layer.style;
  const labelMinZoom = s.labelMinZoom ?? 4;
  const labelMaxZoom = s.labelMaxZoom ?? 24;
  const categorized = s.categorized?.enabled && s.categorized.field ? s.categorized : undefined;
  const categorizedIcons =
    s.categorizedIcons?.enabled && s.categorizedIcons.field ? s.categorizedIcons : undefined;
  const patternId = categorized ? null : ensurePatternImage(map, s.fillPattern, s.fillColor);
  const zoomRange =
    layer.source.kind === "remote" && layer.source.minZoom !== undefined
      ? { minzoom: layer.source.minZoom }
      : {};
  const lineDash =
    s.strokePattern === "dashed" ? [3, 2] : s.strokePattern === "dotted" ? [0.2, 1.6] : undefined;

  const categoryValue = categorized
    ? ["to-string", ["coalesce", ["get", categorized.field], ""]]
    : undefined;
  const categoryMatch = (fallback: string) =>
    categorized && categoryValue
      ? [
          "match",
          categoryValue,
          ...categorized.rules.flatMap((rule) => [rule.value, rule.color]),
          fallback,
        ]
      : fallback;
  const categoryOpacity = (opacity: number) =>
    categorized && categoryValue
      ? [
          "match",
          categoryValue,
          ...categorized.rules.flatMap((rule) => [rule.value, rule.visible ? opacity : 0]),
          categorized.fallbackVisible ? opacity : 0,
        ]
      : opacity;
  const iconValue = categorizedIcons
    ? ["to-string", ["coalesce", ["get", categorizedIcons.field], ""]]
    : undefined;
  const categoryIcon =
    categorizedIcons && iconValue
      ? [
          "match",
          iconValue,
          ...categorizedIcons.rules.flatMap((rule) => [rule.value, rule.icon]),
          categorizedIcons.fallbackIcon,
        ]
      : (s.pointIcon ?? "");
  const markerText = ["coalesce", ["get", "MARKER_ICON"], categoryIcon, ""];
  const shownFilter = ["!", ["boolean", ["get", "__hidden"], false]];
  const geometryFilter = (filter: unknown[]) => ["all", filter, shownFilter];
  const fillPaint: Record<string, unknown> = patternId
    ? { "fill-pattern": patternId, "fill-opacity": s.fillOpacity }
    : {
        "fill-color": categoryMatch(categorized?.fallbackColor ?? s.fillColor),
        "fill-opacity": categoryOpacity(s.fillOpacity),
      };

  const specs: LayerSpecification[] = [
    {
      id: fillId(layer.id),
      type: "fill",
      source: src,
      filter: geometryFilter(["==", ["geometry-type"], "Polygon"]) as never,
      paint: fillPaint as never,
      ...zoomRange,
    },
    {
      id: lineId(layer.id),
      type: "line",
      source: src,
      filter: geometryFilter([
        "match",
        ["geometry-type"],
        ["LineString", "Polygon"],
        true,
        false,
      ]) as never,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": categoryMatch(categorized?.fallbackColor ?? s.strokeColor) as never,
        "line-width": s.strokeWidth,
        "line-opacity": categoryOpacity(s.strokeOpacity) as never,
        ...(lineDash ? { "line-dasharray": lineDash } : {}),
      },
      ...zoomRange,
    },
    {
      id: lineHitId(layer.id),
      type: "line",
      source: src,
      filter: geometryFilter(["==", ["geometry-type"], "LineString"]) as never,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#000000",
        "line-width": Math.max(12, s.strokeWidth + 8),
        "line-opacity": 0.01,
      },
      ...zoomRange,
    },
    {
      id: pointId(layer.id),
      type: "circle",
      source: src,
      filter: geometryFilter(["==", ["geometry-type"], "Point"]) as never,
      paint: {
        "circle-radius": s.pointSize,
        "circle-color": categoryMatch(categorized?.fallbackColor ?? s.fillColor) as never,
        "circle-opacity": categoryOpacity(Math.max(0.5, s.fillOpacity + 0.4)) as never,
        "circle-stroke-color": categoryMatch(categorized?.fallbackColor ?? s.strokeColor) as never,
        "circle-stroke-width": Math.min(3, s.strokeWidth),
      },
      ...zoomRange,
    },
    {
      id: markerIconId(layer.id),
      type: "symbol",
      source: src,
      filter: geometryFilter([
        "all",
        ["==", ["geometry-type"], "Point"],
        ["!=", markerText, ""],
      ]) as never,
      layout: {
        "text-field": markerText as never,
        "text-size": [
          "to-number",
          ["coalesce", ["get", "MARKER_SIZE"], s.pointIconSize ?? 18],
          s.pointIconSize ?? 18,
        ],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": [
          "coalesce",
          ["get", "MARKER_COLOR"],
          s.pointIconColor ?? categoryMatch(categorized?.fallbackColor ?? s.fillColor),
        ] as never,
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.6,
      },
      ...zoomRange,
    },
    {
      id: highlightId(layer.id),
      type: "line",
      source: src,
      filter: geometryFilter([
        "match",
        ["geometry-type"],
        ["LineString", "Polygon"],
        true,
        false,
      ]) as never,
      paint: {
        "line-color": "#f2b73d",
        "line-width": s.strokeWidth + 3,
        "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.95, 0],
      },
      ...zoomRange,
    },
    {
      id: highlightPointId(layer.id),
      type: "circle",
      source: src,
      filter: geometryFilter(["==", ["geometry-type"], "Point"]) as never,
      paint: {
        "circle-radius": s.pointSize + 5,
        "circle-color": "#f2b73d",
        "circle-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.3, 0],
        "circle-stroke-color": "#f2b73d",
        "circle-stroke-width": 3,
        "circle-stroke-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0],
      },
      ...zoomRange,
    },
  ];

  if (s.labelEnabled && s.labelTemplate.trim().length > 0) {
    specs.push({
      id: labelId(layer.id),
      type: "symbol",
      source: src,
      filter: shownFilter as never,
      layout: {
        "text-field": ["coalesce", ["get", "__label"], ""],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          labelMinZoom,
          10,
          16,
          14,
          labelMaxZoom,
          18,
        ],
        "text-anchor": "center",
        "text-offset": [
          "case",
          ["!=", markerText, ""],
          ["literal", [0, 1.65]],
          ["literal", [0, 0]],
        ] as never,
        "text-allow-overlap": false,
        "text-max-width": 12,
        "symbol-placement": "point",
      },
      minzoom: labelMinZoom,
      maxzoom: labelMaxZoom,
      paint: {
        "text-color": "#1d2a20",
        "text-halo-color": "#fdfbf3",
        "text-halo-width": 1.6,
      },
      ...zoomRange,
    });
  }
  return specs;
}

export const allLayerIds = (layerId: string) => [
  labelId(layerId),
  highlightPointId(layerId),
  highlightId(layerId),
  markerIconId(layerId),
  pointId(layerId),
  lineHitId(layerId),
  lineId(layerId),
  fillId(layerId),
];
