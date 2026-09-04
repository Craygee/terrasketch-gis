# LandDraft

LandDraft is a browser-based GIS workbench for public data, field files, sketching, measurement, styling, inspection, and export. The interface keeps common map actions approachable while retaining powerful spatial workflows.

## Current capabilities

- Street, satellite, topographic, dark, and open-map basemaps.
- GeoJSON, KML, KMZ, zipped Shapefile, GPX, and latitude/longitude CSV import.
- Live public-data connectors for transportation, boundaries, energy, land, demographics, and water, plus searchable federal and all-state repository discovery.
- Selective ArcGIS attribute import, geographic filtering, and viewport-only streaming for responsive large datasets.
- Nested layer groups and subgroups with inherited visibility and styling, ordering, duplication, labels, and attribute tables.
- LandDraft AI-assisted attribute queries, feature selection, derived-layer creation, contextual help, public-data discovery, and map-based PDF reports.
- Polygon, line, and point drawing with area, distance, and coordinate measurements.
- GeoJSON, KML, KMZ, and zipped Shapefile export.
- Secure cloud accounts, cross-device projects, autosave, and 25 restore points.
- Project/subproject notes, timestamped activity, private document folders, email-file intake,
  printable/downloadable record packets, and saved map copies.
- Search-result markers plus layer-, feature-, and attribute-driven marker icons, colors, and sizes.
- Project backup workflows for portable offline copies.

## Development

Install dependencies and run the development server:

```sh
bun install
bun run dev
```

Build the production application:

```sh
bun run build
```

Cloud account and project storage setup is documented in
[`docs/CLOUD_SETUP.md`](docs/CLOUD_SETUP.md). The app keeps its existing local workspace only when
cloud environment variables are absent, so repository previews remain usable during initial setup.

The source repository is authoritative. Application changes must be made in code, reviewed, and committed before the connected preview/deployment service receives them through repository sync.

## Content policy

User-facing copy and documentation must describe LandDraft with generic GIS terminology. Do not compare it to named third-party products. Third-party names may appear only where technically or legally required, including dependency identifiers, service URLs, licenses, and data attribution.

## Data disclaimer

Public map services can change, throttle requests, omit records, or carry their own license terms. Parcel and utility layers are informational, are not surveys, and must not be used to establish ownership, easements, legal boundaries, navigation, or excavation safety. Confirm important decisions with the authoritative agency and a qualified professional.
