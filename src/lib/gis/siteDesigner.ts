import type { Feature, Polygon } from "geojson";

import type { LayerStyle } from "./types";

export type SiteObjectGeometry = "point" | "rectangle" | "ellipse";

export interface SiteObjectDefinition {
  id: string;
  name: string;
  category: "Structures" | "Landscape" | "Water" | "Utilities" | "Access";
  geometry: SiteObjectGeometry;
  icon: string;
  color: string;
  defaultWidthFt: number;
  defaultLengthFt: number;
  defaultHeightFt?: number;
  defaultDepthFt?: number;
}

export interface SiteObjectPlacementRequest {
  definitionId: string;
  name: string;
  scenario: string;
  widthFt: number;
  lengthFt: number;
  heightFt: number;
  depthFt: number;
  rotationDeg: number;
}

export const SITE_OBJECTS: readonly SiteObjectDefinition[] = [
  {
    id: "building",
    name: "Building",
    category: "Structures",
    geometry: "rectangle",
    icon: "▣",
    color: "#8f5b3d",
    defaultWidthFt: 40,
    defaultLengthFt: 60,
    defaultHeightFt: 20,
  },
  {
    id: "shed",
    name: "Shed",
    category: "Structures",
    geometry: "rectangle",
    icon: "⌂",
    color: "#a8734f",
    defaultWidthFt: 16,
    defaultLengthFt: 24,
    defaultHeightFt: 12,
  },
  {
    id: "barn",
    name: "Barn",
    category: "Structures",
    geometry: "rectangle",
    icon: "▤",
    color: "#a3483f",
    defaultWidthFt: 50,
    defaultLengthFt: 80,
    defaultHeightFt: 30,
  },
  {
    id: "tree",
    name: "Tree",
    category: "Landscape",
    geometry: "point",
    icon: "♣",
    color: "#2f7d4f",
    defaultWidthFt: 30,
    defaultLengthFt: 30,
    defaultHeightFt: 35,
  },
  {
    id: "pond",
    name: "Pond",
    category: "Water",
    geometry: "ellipse",
    icon: "◉",
    color: "#3b82a0",
    defaultWidthFt: 100,
    defaultLengthFt: 150,
    defaultDepthFt: 8,
  },
  {
    id: "tank",
    name: "Water tank",
    category: "Water",
    geometry: "ellipse",
    icon: "◍",
    color: "#3f7f7a",
    defaultWidthFt: 30,
    defaultLengthFt: 30,
    defaultHeightFt: 20,
  },
  {
    id: "gate",
    name: "Gate",
    category: "Access",
    geometry: "point",
    icon: "⊣",
    color: "#72513d",
    defaultWidthFt: 16,
    defaultLengthFt: 2,
  },
  {
    id: "utility-pole",
    name: "Utility pole",
    category: "Utilities",
    geometry: "point",
    icon: "⚡",
    color: "#d28c23",
    defaultWidthFt: 3,
    defaultLengthFt: 3,
    defaultHeightFt: 35,
  },
  {
    id: "well",
    name: "Well",
    category: "Utilities",
    geometry: "point",
    icon: "⊙",
    color: "#246b8e",
    defaultWidthFt: 4,
    defaultLengthFt: 4,
  },
  {
    id: "culvert",
    name: "Culvert",
    category: "Utilities",
    geometry: "point",
    icon: "↔",
    color: "#5f6f78",
    defaultWidthFt: 4,
    defaultLengthFt: 20,
  },
] as const;

const feetToCoordinateOffset = (feetEast: number, feetNorth: number, latitude: number) => {
  const metersEast = feetEast * 0.3048;
  const metersNorth = feetNorth * 0.3048;
  const longitudeMeters = 111_320 * Math.max(0.15, Math.cos((latitude * Math.PI) / 180));
  return [metersEast / longitudeMeters, metersNorth / 110_574] as [number, number];
};

const rotate = (east: number, north: number, degrees: number) => {
  const radians = (degrees * Math.PI) / 180;
  return [
    east * Math.cos(radians) + north * Math.sin(radians),
    -east * Math.sin(radians) + north * Math.cos(radians),
  ] as const;
};

export function rectangleCoordinates(
  center: [number, number],
  widthFt: number,
  lengthFt: number,
  rotationDeg: number,
): Polygon["coordinates"][number] {
  const halfWidth = Math.max(1, widthFt) / 2;
  const halfLength = Math.max(1, lengthFt) / 2;
  const corners = [
    [-halfWidth, halfLength],
    [halfWidth, halfLength],
    [halfWidth, -halfLength],
    [-halfWidth, -halfLength],
  ] as const;
  const ring = corners.map(([east, north]) => {
    const [rotatedEast, rotatedNorth] = rotate(east, north, rotationDeg);
    const [lngOffset, latOffset] = feetToCoordinateOffset(rotatedEast, rotatedNorth, center[1]);
    return [center[0] + lngOffset, center[1] + latOffset];
  });
  return [...ring, ring[0]!] as Polygon["coordinates"][number];
}

export function ellipseCoordinates(
  center: [number, number],
  widthFt: number,
  lengthFt: number,
  rotationDeg: number,
  steps = 36,
): Polygon["coordinates"][number] {
  const ring = Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    const east = (Math.cos(angle) * Math.max(1, widthFt)) / 2;
    const north = (Math.sin(angle) * Math.max(1, lengthFt)) / 2;
    const [rotatedEast, rotatedNorth] = rotate(east, north, rotationDeg);
    const [lngOffset, latOffset] = feetToCoordinateOffset(rotatedEast, rotatedNorth, center[1]);
    return [center[0] + lngOffset, center[1] + latOffset];
  });
  return [...ring, ring[0]!] as Polygon["coordinates"][number];
}

export function siteObjectDefinition(id: string): SiteObjectDefinition {
  return SITE_OBJECTS.find((item) => item.id === id) ?? SITE_OBJECTS[0]!;
}

export function createSiteObjectFeature(
  request: SiteObjectPlacementRequest,
  center: [number, number],
): {
  definition: SiteObjectDefinition;
  feature: Feature;
  layerName: string;
  style: Partial<LayerStyle>;
} {
  const definition = siteObjectDefinition(request.definitionId);
  const widthFt = Math.max(1, request.widthFt || definition.defaultWidthFt);
  const lengthFt = Math.max(1, request.lengthFt || definition.defaultLengthFt);
  const heightFt = Math.max(0, request.heightFt || 0);
  const depthFt = Math.max(0, request.depthFt || 0);
  const areaSqFt =
    definition.geometry === "ellipse"
      ? (Math.PI * widthFt * lengthFt) / 4
      : definition.geometry === "rectangle"
        ? widthFt * lengthFt
        : 0;
  const properties: Record<string, string | number> = {
    NAME: request.name.trim() || definition.name,
    SITE_OBJECT_TYPE: definition.id,
    SITE_OBJECT_CATEGORY: definition.category,
    SCENARIO: request.scenario.trim() || "Proposed",
    WIDTH_FT: Number(widthFt.toFixed(2)),
    LENGTH_FT: Number(lengthFt.toFixed(2)),
    ROTATION_DEG: Number(request.rotationDeg.toFixed(1)),
    HEIGHT_FT: Number(heightFt.toFixed(2)),
    DEPTH_FT: Number(depthFt.toFixed(2)),
    AREA_SQ_FT: Number(areaSqFt.toFixed(1)),
    CREATED: new Date().toISOString(),
  };
  if (definition.id === "pond" && depthFt > 0)
    properties["EST_VOLUME_ACRE_FT"] = Number(((areaSqFt * depthFt) / 43_560).toFixed(2));
  if (definition.geometry === "point") {
    properties["MARKER_ICON"] = definition.icon;
    properties["MARKER_COLOR"] = definition.color;
    properties["MARKER_SIZE"] = 24;
  }
  const geometry: Feature["geometry"] =
    definition.geometry === "point"
      ? { type: "Point", coordinates: center }
      : {
          type: "Polygon",
          coordinates: [
            definition.geometry === "ellipse"
              ? ellipseCoordinates(center, widthFt, lengthFt, request.rotationDeg)
              : rectangleCoordinates(center, widthFt, lengthFt, request.rotationDeg),
          ],
        };
  return {
    definition,
    feature: { type: "Feature", geometry, properties },
    layerName: `${definition.name}s`,
    style: {
      fillColor: definition.color,
      strokeColor: definition.color,
      fillOpacity: definition.id === "pond" ? 0.5 : 0.42,
      strokeWidth: 2,
      pointIconSize: 24,
      labelEnabled: true,
      labelTemplate: "{NAME}",
      labelFields: ["NAME"],
      labelSize: 12,
    },
  };
}

export function imageOverlayCoordinates(
  center: [number, number],
  widthFt: number,
  heightFt: number,
  rotationDeg: number,
): [[number, number], [number, number], [number, number], [number, number]] {
  const ring = rectangleCoordinates(center, widthFt, heightFt, rotationDeg);
  return [ring[0]!, ring[1]!, ring[2]!, ring[3]!] as [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
}

export function imageOverlayFootprint(
  coordinates: [[number, number], [number, number], [number, number], [number, number]],
  name: string,
): Feature<Polygon> {
  return {
    type: "Feature",
    properties: { NAME: name, DESIGN_SOURCE: "image" },
    geometry: { type: "Polygon", coordinates: [[...coordinates, coordinates[0]]] },
  };
}
