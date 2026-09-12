# LandDraft Weather / Meteorology architecture

## Boundaries

Weather is an optional project-aware workspace. The core GIS owns geography, map viewport, project
assets, permissions, layers and drawing. Weather owns time-aware environmental products,
provider selection, provenance, animation, meteorological inspection and operational risk hints.
Opening or disabling Weather does not rewrite ordinary GIS layers.

```text
Official/commercial providers
        ↓
Weather provider adapters
        ↓
Server gateway: validation, timeouts, cache, health, usage, normalization
        ↓
Normalized weather contracts + source provenance
        ↓
Weather layer registry / timeline / inspector
        ↓
Shared LandDraft MapLibre map and project geometry
```

## Module and capability hooks

Stable module id: `weather`.

Capabilities:

- `weather.basic`
- `weather.radar`
- `weather.satellite`
- `weather.lightning`
- `weather.forecasting`
- `weather.meteorology`
- `weather.severe`
- `weather.storm_chaser`
- `weather.photography`
- `weather.infrastructure`
- `weather.historical`
- `weather.models`
- `weather.enterprise`

The Phase 1 evaluator allows the optional module in the test workspace and exists only to centralize
future account/organization/subscription decisions. It does not introduce a paywall or modify core
mapping entitlements.

## Normalized contracts

Every payload uses normalized SI values internally and carries provider, source/received/valid/
expiration timestamps, quality, observed/model/forecast/development status, resolution when known,
and a raw source reference. UI unit preferences format values without changing stored values.

Current core types are `WeatherObservation`, `WeatherForecastPeriod`, `WeatherAlert`, `RadarFrame`,
`WeatherRasterFrame`, `WeatherStationObservation`, `WeatherPhotographyAssessment`,
`WeatherProviderHealth`, `WeatherLayerDefinition`, `WeatherTimelineState`, `WeatherPreset`, and
`WeatherWorkspaceState`. Future individual lightning strikes, weather events, wind fields, radar
sweeps, model runs, soundings, tracks and cross sections extend the same metadata contract.

## Provider selection and failure behavior

Adapters declare products, coverage, expected latency, cost class, credential needs and
attribution. The gateway selects a configured adapter that actually covers the point/product.
Administrative preferred-provider overrides will be added only after the admin contract is
coordinated. Fundamental product substitutions are never silent.

Requests use product-specific timeouts and caches. A failure can fall back only to an equivalent
normalized product. Failed/stale/unavailable states are first-class responses. Old data retains its
original timestamp and becomes `STALE`; it never becomes `LIVE` because a cache returned it.

### User-owned Xweather connection

Optional Xweather products use a bring-your-own-account boundary rather than a shared LandDraft
provider credential. The browser sends the combined API key once over HTTPS to the same-origin
Worker. The Worker authenticates the Supabase session, validates the credential with Xweather,
encrypts the pair with AES-GCM and user-bound authenticated data, and writes only ciphertext plus a
masked hint/status to `weather_provider_connections` under per-user RLS.

MapLibre attaches the current LandDraft bearer token only to same-origin Xweather tile URLs. The
Worker validates or briefly caches that authorization, reads the requesting user's ciphertext,
decrypts it in memory and calls Xweather. Tiles use private browser caching; LandDraft does not
cross-cache one user's provider response for another user. Credential memory cache TTL is 30 seconds.
Disconnect removes the persisted record. Provider-side key revocation remains the immediate kill
switch. The client-supplied `xweatherConnected` bundle hint controls only whether tile descriptors
are returned and is never an authorization decision; every tile is independently authenticated.

## Cache strategy

| Product                          | Initial policy                                      |
| -------------------------------- | --------------------------------------------------- |
| Active warnings                  | 30 seconds; revalidate, retain issued/updated times |
| Current/point forecast           | 5 minutes                                           |
| Immutable radar/satellite frames | Content/frame timestamp key; long immutable cache   |
| Forecast grid/model run          | Run + forecast-hour key; immutable after ingestion  |
| Observations                     | Product cadence with short TTL                      |
| Provider health                  | 60 seconds, separate from user payload cache        |

The Phase 1 gateway uses bounded in-process caching suitable for test deployment. Distributed cache,
object storage, queues and spatial/temporal database tables require production coordination.

## Map/rendering strategy

- Active warning polygons for the inspected point use bounded GeoJSON and MapLibre fill/line layers.
- CONUS radar uses official NOAA/NWS MRMS quality-controlled composite base-reflectivity WMS tiles
  with an automatic official NWS base-reflectivity WMS fallback. It is labeled radar only because
  both products are radar-derived; satellite/model precipitation remains separate.
- NOAA nowCOAST satellite imagery is selected between GOES and global mosaic products by coverage.
- U.S. NDFD temperature, wind and precipitation; fire, winter, tropical and smoke products use
  product-specific official WMS adapters and never load until their layer is enabled.
- Aviation Weather Center METAR observations render as bounded station points.
- NOAA lightning activity renders as a 15-minute 8 km density raster, not exact strike points.
- Raster and scientific grids use tiled products; the client never downloads a country-scale raw
  archive for a viewport.
- Wind particles require a reviewed gridded vector source and WebGL worker implementation; Phase 1
  exposes the layer and current point wind without inventing a field.
- Layer definitions live in a registry with group, entitlement, type, time/animation/inspection
  support, opacity, zoom range, legend and attribution.
- The universal timeline distinguishes past observation frames, `NOW`, and future/model frames.

## Photography decision support

LandDraft does not label viewing locations “safe.” The current analysis requires an official alert
polygon at the inspected point, projects several candidate zones outward from that polygon, checks
official alerts at each candidate, and adds MET Norway model cloud/wind/precipitation context.
Significant official hazards suppress the photography score. Every candidate retains method,
confidence, sources, valid time and limitations. Road access/closures, terrain line of sight,
flooding and individual lightning strikes are explicitly not yet included, so the output is not a
route instruction or safety determination.

## Mobile architecture

Desktop uses a collapsible left Weather tree, shared center map, right inspector/source panel and
bottom timeline. Mobile uses a small top control, full map, thumb-accessible layer actions, a gesture
timeline and a three-state bottom sheet. Professional dual panels become product switching on phone.

## Safety and privacy

- Official warnings supersede LandDraft summaries. Storm chasing is decision support, never a safety
  guarantee or autonomous intercept instruction.
- Observed, radar-indicated, reported, model-derived and inferred states have distinct types.
- Phase 1 does not store continuous device location. Future proximity/alert rules require explicit
  consent, minimum retention and organization-isolated RLS.
- Provider credentials remain server-side. Inputs are bounded and validated; upstream errors expose
  no secret or raw internal stack.

## Future schema and real-time delivery

Planned additive objects include provider configuration/status, immutable frames/model runs,
weather events/tracks, presets, project rules, alerts and usage metrics with spatial/temporal
indexes. These require RLS and administration/billing review before migration.

Delivery is product-specific: warnings can use short polling/SSE, lightning may use a licensed
stream, radar updates at scan cadence, and model data at run cadence. There is deliberately no
global every-few-seconds poll.
