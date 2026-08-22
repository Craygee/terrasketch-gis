import type { Map as MlMap, LayerSpecification } from "maplibre-gl";
import type { GisLayer, FillPattern } from "./types";

export const sourceId = (layerId: string) => `src-${layerId}`;
export const fillId = (layerId: string) => `fill-${layerId}`;
export const lineId = (layerId: string) => `line-${layerId}`;
export const pointId = (layerId: string) => `point-${layerId}`;
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
  const patternId = ensurePatternImage(map, s.fillPattern, s.fillColor);
  const zoomRange =
    layer.source.kind === "remote" && layer.source.minZoom !== undefined
      ? { minzoom: layer.source.minZoom }
      : {};
  const lineDash =
    s.strokePattern === "dashed" ? [3, 2] : s.strokePattern === "dotted" ? [0.2, 1.6] : undefined;

  const fillPaint: Record<string, unknown> = patternId
    ? { "fill-pattern": patternId, "fill-opacity": Math.min(1, s.fillOpacity + 0.35) }
    : { "fill-color": s.fillColor, "fill-opacity": s.fillOpacity };

  const specs: LayerSpecification[] = [
    {
      id: fillId(layer.id),
      type: "fill",
      source: src,
      filter: ["==", "$type", "Polygon"],
      paint: fillPaint as never,
      ...zoomRange,
    },
    {
      id: lineId(layer.id),
      type: "line",
      source: src,
      filter: ["in", "$type", "LineString", "Polygon"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": s.strokeColor,
        "line-width": s.strokeWidth,
        "line-opacity": s.strokeOpacity,
        ...(lineDash ? { "line-dasharray": lineDash } : {}),
      },
      ...zoomRange,
    },
    {
      id: pointId(layer.id),
      type: "circle",
      source: src,
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": s.pointSize,
        "circle-color": s.fillColor,
        "circle-opacity": Math.max(0.5, s.fillOpacity + 0.4),
        "circle-stroke-color": s.strokeColor,
        "circle-stroke-width": Math.min(3, s.strokeWidth),
      },
      ...zoomRange,
    },
    {
      id: highlightId(layer.id),
      type: "line",
      source: src,
      filter: ["==", ["get", "__selected"], true],
      paint: { "line-color": "#f2b73d", "line-width": s.strokeWidth + 3, "line-opacity": 0.95 },
      ...zoomRange,
    },
    {
      id: highlightPointId(layer.id),
      type: "circle",
      source: src,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "__selected"], true]],
      paint: {
        "circle-radius": s.pointSize + 5,
        "circle-color": "#f2b73d",
        "circle-opacity": 0.3,
        "circle-stroke-color": "#f2b73d",
        "circle-stroke-width": 3,
      },
      ...zoomRange,
    },
  ];

  if (s.labelEnabled && s.labelTemplate.trim().length > 0) {
    specs.push({
      id: labelId(layer.id),
      type: "symbol",
      source: src,
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
  pointId(layerId),
  lineId(layerId),
  fillId(layerId),
];
