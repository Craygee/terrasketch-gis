# TerraSketch GIS

TerraSketch is a friendly, browser-first GIS workbench for public records, field files, drawing, measurement, styling, inspection, and export. It combines a Felt-like interface with familiar desktop GIS concepts while staying understandable to a first-time mapmaker.

## Included in this release

- Five switchable basemaps: streets, satellite, USGS topo, dark, and OpenStreetMap.
- Drag-and-drop GeoJSON, KML, KMZ, zipped Shapefile, GPX, and latitude/longitude CSV files.
- ArcGIS FeatureServer/MapServer and direct GeoJSON URL connections.
- Curated public-data catalog seeded with TxDOT, Texas GLO, HIFLD, Census, USGS/EPA, and public parcel sources.
- Grouped layers, visibility, reorder, selection, duplicated selections, and attribute tables.
- Solid, diagonal, crosshatch, and dotted polygon fills; color, opacity, size, and stroke controls.
- Composed labels using attribute recipes such as `{OWNER} · {ACRES} acres`.
- Point, line, and polygon drawing plus live acreage, square-foot, hectare, and perimeter measurement.
- Coordinate readout, right-click coordinate tools, place search, local project save, GeoJSON/KML/KMZ export helpers.

## Run locally

```bash
pnpm install
pnpm dev
```

Production build:

```bash
pnpm build
```

## Architecture

The current app is a static React/Vite client using MapLibre GL, Turf, shpjs, and togeojson. This makes the first release inexpensive to host and useful without an account. The data catalog and import/export code are intentionally isolated so a PostGIS/PMTiles backend, collaboration, authentication, saved cloud projects, server-side reprojection, and larger-than-browser datasets can be added without replacing the map UI.

## Data and boundary disclaimer

Public map services can change, throttle requests, omit records, or carry their own license terms. Parcel and utility layers are informational, are not surveys, and should not be used to establish ownership, easements, legal boundaries, navigation, or excavation safety. Confirm important decisions with the authoritative agency and a qualified professional.
