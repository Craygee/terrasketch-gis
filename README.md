# TerraSketch GIS

TerraSketch is a browser-based GIS workbench for public data, field files, sketching, measurement, styling, inspection, and export. The interface keeps common map actions approachable while retaining powerful spatial workflows.

## Current capabilities

- Street, satellite, topographic, dark, and open-map basemaps.
- GeoJSON, KML, KMZ, zipped Shapefile, GPX, and latitude/longitude CSV import.
- Live public-data connectors for transportation, boundaries, energy, land, demographics, and water.
- Grouped layers with visibility, ordering, duplication, deletion, styling, labels, and attribute tables.
- Polygon, line, and point drawing with area, distance, and coordinate measurements.
- GeoJSON, KML, KMZ, and zipped Shapefile export.
- Local project save and backup workflows.

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

The source repository is authoritative. Application changes must be made in code, reviewed, and committed before the connected preview/deployment service receives them through repository sync.

## Content policy

User-facing copy and documentation must describe TerraSketch with generic GIS terminology. Do not compare it to named third-party products. Third-party names may appear only where technically or legally required, including dependency identifiers, service URLs, licenses, and data attribution.

## Data disclaimer

Public map services can change, throttle requests, omit records, or carry their own license terms. Parcel and utility layers are informational, are not surveys, and must not be used to establish ownership, easements, legal boundaries, navigation, or excavation safety. Confirm important decisions with the authoritative agency and a qualified professional.
