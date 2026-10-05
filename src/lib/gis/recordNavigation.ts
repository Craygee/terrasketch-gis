import type { Geometry } from "geojson";

import type { GisLayer, LayerGroup } from "./types";

export type MapBounds = [west: number, south: number, east: number, north: number];

export function groupLayersForMap(
  groupId: string,
  groups: LayerGroup[],
  layers: GisLayer[],
): GisLayer[] {
  const groupIds = new Set([groupId]);
  let foundDescendant = true;

  while (foundDescendant) {
    foundDescendant = false;
    for (const group of groups) {
      if (group.parentId && groupIds.has(group.parentId) && !groupIds.has(group.id)) {
        groupIds.add(group.id);
        foundDescendant = true;
      }
    }
  }

  return layers.filter((layer) => groupIds.has(layer.groupId));
}

export function mapBoundsForLayers(layers: GisLayer[]): MapBounds | null {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  const visitPosition = (position: unknown) => {
    if (!Array.isArray(position)) return;
    if (
      position.length >= 2 &&
      typeof position[0] === "number" &&
      typeof position[1] === "number" &&
      Number.isFinite(position[0]) &&
      Number.isFinite(position[1])
    ) {
      west = Math.min(west, position[0]);
      south = Math.min(south, position[1]);
      east = Math.max(east, position[0]);
      north = Math.max(north, position[1]);
      return;
    }
    position.forEach(visitPosition);
  };

  const visitGeometry = (geometry: Geometry | null) => {
    if (!geometry) return;
    if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach(visitGeometry);
      return;
    }
    visitPosition(geometry.coordinates);
  };

  for (const layer of layers) {
    layer.data.features.forEach((feature) => visitGeometry(feature.geometry));
  }

  return [west, south, east, north].every(Number.isFinite) ? [west, south, east, north] : null;
}
