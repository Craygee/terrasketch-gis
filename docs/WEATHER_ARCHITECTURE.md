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
`WeatherProviderHealth`, `WeatherLayerDefinition`, `WeatherTimelineState`, `WeatherPreset`, and
`WeatherWorkspaceState`. Future lightning strikes, weather events, wind fields, radar sweeps, model
runs, soundings, tracks and cross sections extend the same metadata contract.

## Provider selection and failure behavior

Adapters declare products, coverage, expected latency, cost class, credential needs and
attribution. The gateway selects a configured adapter that actually covers the point/product.
Administrative preferred-provider overrides will be added only after the admin contract is
coordinated. Fundamental product substitutions are never silent.

Requests use product-specific timeouts and caches. A failure can fall back only to an equivalent
normalized product. Failed/stale/unavailable states are first-class responses. Old data retains its
original timestamp and becomes `STALE`; it never becomes `LIVE` because a cache returned it.

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
- Initial CONUS radar uses official NOAA/NWS MRMS quality-controlled composite base-reflectivity
  WMS tiles and immutable source timestamps. It is labeled radar only because the source product is
  radar-derived; future satellite/model precipitation must remain separate.
- Raster and scientific grids use tiled products; the client never downloads a country-scale raw
  archive for a viewport.
- Wind particles require a reviewed gridded vector source and WebGL worker implementation; Phase 1
  exposes the layer and current point wind without inventing a field.
- Layer definitions live in a registry with group, entitlement, type, time/animation/inspection
  support, opacity, zoom range, legend and attribution.
- The universal timeline distinguishes past observation frames, `NOW`, and future/model frames.

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
