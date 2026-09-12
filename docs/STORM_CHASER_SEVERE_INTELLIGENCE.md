# Storm Chaser / Severe Weather Intelligence

Status: Phase 1 foundation in test  
Owner branch: `feature/test-module-development`  
Pricing: Undecided  
Core mapping impact: None; optional Weather workspace

## Product boundary

Storm Chaser is decision-support software. Official watches, warnings and instructions supersede
LandDraft. The system must not represent an alert polygon as an observed tornado, a motion-only
projection as a deterministic track, or a candidate viewing area as safe.

The durable distinction is:

- **Official**: issued by NWS, SPC, NHC or another identified authority.
- **Observed**: a measurement/report with provider, valid time and quality metadata.
- **Model**: a forecast/model field, never relabeled as observed.
- **LandDraft derived**: a reproducible calculation with inputs, method, valid time, uncertainty and
  limitations.
- **Unavailable**: shown instead of a fabricated score, track, tornado location or route.

## Implemented foundation

- Optional `Storm Chaser` workspace on desktop, tablet and mobile.
- Mobile workspace selector so Storm Chaser is reachable without shrinking the desktop header.
- Provider-independent `StormObject`, hazard, evidence, motion and forecast-position contracts.
- Stable `LD-STORM-YYYYMMDD-*` IDs for official alert contexts.
- Actual NWS alert areas become storm-context objects; exercise/test messages are excluded.
- Official context is not converted into invented tornado/hail/wind/lightning probabilities.
- Storm objects render as selectable map reference points while the official alert polygon remains
  authoritative geometry.
- `Why / provenance` explains the actual official input, age and known limitations.
- Motion-only forecast helper exists but produces no output until a validated motion vector is
  supplied. Its likely/possible uncertainty radii widen with lead time and every output is labeled
  `DERIVED`, `MOTION_ONLY` and `NOT_AN_OFFICIAL_WARNING`.
- Chase mode requests explicit browser GPS permission, holds coordinates only in component memory,
  shows GPS accuracy and continuously recalculates distance/bearing to the alert-area reference
  point.
- If the device is inside an official alert polygon, the UI prioritizes official guidance and
  explicitly withholds observation-route recommendations.
- Automated tests cover deterministic objects, exclusion of exercise data, absence of fabricated
  scores, widening uncertainty and inside-warning safety suppression.

## Current data flow

```text
NWS CAP alert
  -> bounded fetch + product-specific cache
  -> schema and timestamp normalization
  -> official WeatherAlert polygon
  -> StormObject context (basis = official-alert-area)
  -> map marker + intelligence/provenance card
```

Datasets are not time-aligned merely because they appear on the same map. Each normalized object
retains source, observation/issue time, retrieval time, valid time, expiration and quality flags.

## Authoritative-source research

- The [NWS API](https://www.weather.gov/documentation/services-web-api) provides open forecasts,
  alerts and observations in cache-friendly JSON/GeoJSON. It requires an identifying User-Agent.
- The [NWS alerts service](https://www.weather.gov/documentation/services-web-alerts) distributes
  CAP 1.2 watches, warnings and advisories and asks clients not to poll more often than every 30
  seconds. NWS recommends resilient CAP access rather than treating one endpoint as infallible.
- [NCEI NEXRAD](https://www.ncei.noaa.gov/products/radar/next-generation-weather-radar) documents
  free archived and near-real-time Level II/III access. Level II contains base reflectivity,
  velocity, spectrum width and dual-polarization moments; real storm-object analysis requires a
  separate validated ingestion/decoding pipeline, not a visual raster screenshot.
- [NHC GIS products](https://www.nhc.noaa.gov/gis/) provide official advisory tracks, cones and
  related tropical GIS data. Official NHC geometry must remain visible beside any future LandDraft
  consensus.

Provider documentation and endpoints must be rechecked before production release. No proprietary
algorithm, interface or database is copied.

## Dependencies

- Existing React/TanStack Start Weather route and project snapshot.
- Existing MapLibre map, NWS alert gateway, normalized provenance and Turf geometry.
- No new runtime package and no database migration in this increment.
- Future raw NEXRAD/MRMS storm analysis needs server-side ingestion, decoding, gridding, quality
  control, object tracking, storage and operational validation.
- Road-aware candidate observation analysis needs authoritative closures/road attributes, flood and
  lightning data, terrain/visibility analysis and conservative routing rules.

## Potential operating costs

- NWS/NOAA data is public, but low-latency polling, tile/radar processing, Worker CPU, object storage,
  CDN egress, monitoring and alert delivery have operating cost.
- Raw radar mosaics/object tracking and historical replay can create substantial compute and storage
  demand.
- Individual lightning, global radar, model grids, road closures, push/SMS and commercial SLA feeds
  may require paid licenses and redistribution agreements.
- Generative explanations are not enabled. A future AI explanation service would add inference cost
  and may only verbalize structured evidence produced by deterministic analysis.

Pricing remains undecided. This increment does not change plans, payments, entitlements, admin
permissions, production infrastructure or backups.

## Next validated increments

1. Add viewport/regional official alert retrieval instead of point-only contexts, with rate-aware
   caching and resilient CAP source strategy.
2. Ingest official SPC outlook/watch/mesoscale products as separate official layers with source time.
3. Build a raw radar processing service for measured radar moments; validate against archived cases
   before enabling automated rotation, debris-signature, hail or storm classification outputs.
4. Add storm-object association and time-series tracking with split/merge handling and explicit
   identity uncertainty.
5. Add calibrated analysis scores only after datasets, equations, validation set and false-alarm
   behavior are documented. Keep analysis score distinct from probability.
6. Add multi-solution future-cast corridors (object motion, environmental steering and model
   guidance), not one exact line.
7. Add road/flood/lightning/terrain-aware candidate observation zones only after every required
   input is live and current. Never label a route safe.
8. Coordinate any shared PostGIS/time-series schema, durable telemetry and capability administration
   with the administration/billing work before merge.

## Known limitations

- Storm contexts currently come from official alert polygons returned for the inspected point, not
  a nationwide/global event feed.
- The marker is the alert polygon centroid/fallback reference point, not a detected storm centroid.
- No raw velocity, correlation coefficient, lightning strike, road closure or model-analysis grid is
  yet part of a storm object.
- Tornado/hail/wind/flood/lightning scores, trends and future tracks intentionally show unavailable.
- Continuous GPS is ephemeral and works only while Chase mode is active; no location history is
  persisted.
- No route is represented as safe or recommended toward a storm.
