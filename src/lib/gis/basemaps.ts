import type { StyleSpecification } from "maplibre-gl";

export interface Basemap {
  id: string;
  label: string;
  blurb: string;
  style: StyleSpecification;
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
    style: raster(
      ["https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"],
      "© OpenStreetMap contributors, © CARTO",
    ),
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
  },
  {
    id: "dark",
    label: "Dark",
    blurb: "Night mode canvas",
    style: raster(
      ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
      "© OpenStreetMap contributors, © CARTO",
      19,
      "#0a0f0c",
    ),
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
  },
];

export const getBasemap = (id: string): Basemap =>
  basemaps.find((b) => b.id === id) ?? basemaps[0]!;
