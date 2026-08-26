import type { StyleSpecification } from "maplibre-gl";

export interface Basemap {
  id: string;
  label: string;
  blurb: string;
  style: StyleSpecification | string;
  /** Small request used by the sign-in connection check. */
  healthUrl: string;
  /** Equivalent keyless style used only when the preferred provider is unavailable. */
  fallbackStyle?: StyleSpecification | string;
  fallbackHealthUrl?: string;
}

const raster = (
  tiles: string[],
  attribution: string,
  maxzoom = 19,
  background = "#e8e4d9",
): StyleSpecification => ({
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    basemap: { type: "raster", tiles, tileSize: 256, attribution, maxzoom },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": background } },
    { id: "basemap", type: "raster", source: "basemap" },
  ],
});

export const basemaps: Basemap[] = [
  {
    id: "street",
    label: "Street",
    blurb: "Clean roads & places",
    // CARTO's supported MapLibre style endpoint replaces the retired raster URL form.
    style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    healthUrl: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    fallbackStyle: "https://tiles.openfreemap.org/styles/liberty",
    fallbackHealthUrl: "https://tiles.openfreemap.org/styles/liberty",
  },
  {
    id: "satellite",
    label: "Satellite",
    blurb: "Global satellite imagery",
    style: raster(
      [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      "Imagery © Esri, Maxar, Earthstar Geographics",
      19,
      "#0b1a12",
    ),
    healthUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0",
  },
  {
    id: "topo",
    label: "Topo",
    blurb: "Contours & terrain",
    style: raster(
      ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
      "© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors",
      17,
    ),
    healthUrl: "https://tile.opentopomap.org/0/0/0.png",
  },
  {
    id: "dark",
    label: "Dark",
    blurb: "Night mode canvas",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    healthUrl: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    fallbackStyle: "https://tiles.openfreemap.org/styles/dark",
    fallbackHealthUrl: "https://tiles.openfreemap.org/styles/dark",
  },
  {
    id: "osm",
    label: "OSM",
    blurb: "Standard OpenStreetMap",
    style: raster(
      ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      "© OpenStreetMap contributors",
      19,
    ),
    healthUrl: "https://tile.openstreetmap.org/0/0/0.png",
  },
];

export const getBasemap = (id: string): Basemap =>
  basemaps.find((b) => b.id === id) ?? basemaps[0]!;

const BASEMAP_FALLBACKS_KEY = "landdraft.basemap-fallbacks.v1";

function fallbackIds(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(BASEMAP_FALLBACKS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function setBasemapFallback(id: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  const ids = new Set(fallbackIds());
  const wasEnabled = ids.has(id);
  if (wasEnabled === enabled) return;
  if (enabled) ids.add(id);
  else ids.delete(id);
  window.localStorage.setItem(BASEMAP_FALLBACKS_KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new CustomEvent("landdraft:basemap-health", { detail: { id, enabled } }));
}

export function getBasemapStyle(id: string): StyleSpecification | string {
  const basemap = getBasemap(id);
  if (
    typeof window !== "undefined" &&
    basemap.fallbackStyle &&
    fallbackIds().includes(basemap.id)
  ) {
    return basemap.fallbackStyle;
  }
  return basemap.style;
}
