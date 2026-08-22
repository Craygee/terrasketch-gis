# TerraSketch product research

The second release is guided by recurring strengths across leading mapping tools rather than copying any one interface.

## Patterns worth adopting

- **Felt:** live maps, link-level view/comment/edit permissions, simple sharing, map-centric collaboration, grouped storytelling, and contextual feedback.
- **QGIS:** a searchable processing toolbox; select-by-location; buffer, dissolve, centroids, joins, repeatable operations, flexible attributes, snapping, and right-click workflows.
- **ArcGIS Online:** account-backed map items, explicit sharing levels, saved views, feature/raster analysis, and outputs that become new layers.
- **Land id:** parcel-first discovery, visual property context, shareable interactive maps, launch views, embedded media, practical buffers and boundary manipulation.
- **onX:** instant waypoints, field location, straightforward line/area measurement, tracks, offline resilience, and minimal friction around common field actions.
- **Kepler.gl:** drag-and-drop exploration, high-performance rendering, filters, temporal playback, data-driven styles, and spatial aggregation.

## TerraSketch design rules

1. Every analysis creates a new layer, so work is reversible.
2. Common actions stay visible; advanced actions live in searchable drawers.
3. A shared map must open directly to useful content without requiring GIS knowledge.
4. Public-record sources always show provenance and a boundary/accuracy disclaimer.
5. Local-first behavior remains available when cloud credentials or connectivity are absent.
6. GitHub is the source of truth; Lovable is preview/deployment only.
