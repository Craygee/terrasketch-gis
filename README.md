# TerraSketch GIS

TerraSketch is a friendly, browser-first GIS workbench for public records, field files, drawing, measurement, styling, inspection, and export. It combines a Felt-like interface with familiar desktop GIS concepts while staying understandable to a first-time mapmaker.

## Included in this release

- Five switchable basemaps: streets, satellite, USGS topo, dark, and OpenStreetMap.
- Drag-and-drop GeoJSON, KML, KMZ, zipped Shapefile, GPX, and latitude/longitude CSV files.
- ArcGIS FeatureServer/MapServer and direct GeoJSON URL connections.
- Viewport-streamed ArcGIS agency layers that refresh after navigation instead of retaining offscreen national datasets.
- Curated public-data catalog seeded with TxDOT, Texas GLO, HIFLD, Census, USGS/EPA, and public parcel sources.
- Grouped layers, visibility, reorder, selection, duplicated selections, and attribute tables.
- Solid, diagonal, crosshatch, and dotted polygon fills; color, opacity, size, and stroke controls.
- Composed labels using attribute recipes such as `{OWNER} · {ACRES} acres`.
- Point, line, and polygon drawing plus live acreage, square-foot, hectare, and perimeter measurement.
- Coordinate readout, right-click coordinate tools, place search, local project save, and GeoJSON/KML/KMZ/zipped Shapefile export.
- Optional Supabase authentication, account-backed map library, unlisted/public live links, configurable link editing, and realtime map refresh.
- Browser-native spatial analysis that creates reversible result layers: buffers, centroids, envelopes, convex hulls, polygon dissolves, and select-by-location.
- Search-across-all-fields attribute filtering, lightweight 100-row paging, and one-click GPS location.

## Run locally

```bash
pnpm install
pnpm dev
```

Production build:

```bash
pnpm build
```

## Enable login and live shared maps

TerraSketch remains fully usable as a local-first GIS without a cloud account. To enable authentication, cloud projects, link sharing, and realtime updates:

1. Create a Supabase project.
2. Run [`supabase/migrations/202608210001_maps.sql`](supabase/migrations/202608210001_maps.sql) in its SQL editor or through the Supabase CLI.
3. Copy `.env.example` to `.env.local` and add the public project URL and anonymous key.
4. In Supabase Authentication, add your deployed domain and `/map/**` URLs to the allowed redirect URLs.
5. Rebuild or redeploy the app.

Only the public anonymous browser key belongs in the Vite environment. Never place a service-role key in this repository or client application. Row-level security in the migration controls access.

The GitHub repository is the source of truth. Lovable is used only for GitHub sync, preview, and deployment; do not use its AI agent to modify the application.

## Architecture

The app is a React/Vite client using MapLibre GL, Turf, shpjs, togeojson, and an optional Supabase backend. This keeps it inexpensive to host and useful without an account while enabling authenticated projects and realtime shared maps when configured. The data catalog, analysis, import/export, cloud service, and map state are isolated so PostGIS/PMTiles processing, server-side reprojection, and larger-than-browser datasets can be added without replacing the map UI.

## Data and boundary disclaimer

Public map services can change, throttle requests, omit records, or carry their own license terms. Parcel and utility layers are informational, are not surveys, and should not be used to establish ownership, easements, legal boundaries, navigation, or excavation safety. Confirm important decisions with the authoritative agency and a qualified professional.
