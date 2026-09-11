# LandDraft Weather / Meteorology continuation context

This file is the durable handoff for future LandDraft Weather sessions.

## Current phase

Phase 1 foundation is implemented on `feature/test-module-development`. The module is optional,
test-only, schema-free, and does not change billing, plans, production infrastructure or backups.

Implemented entry point: `/weather`.

Implemented code:

- `src/lib/weather/`: contracts, registry, capability hooks, source normalization, formatting,
  project-state defaults, server function, provider gateway and in-memory test usage telemetry.
- `src/components/weather/`: responsive workspace, layer drawer, inspector, source health, radar
  timeline and MapLibre weather overlay.
- `src/routes/weather.tsx`: authenticated, lazy-loaded module route.

Read first:

1. `docs/WEATHER_IMPLEMENTATION_PLAN.md`
2. `docs/WEATHER_ARCHITECTURE.md`
3. `docs/WEATHER_PROVIDER_MATRIX.md`
4. `docs/modules/weather-meteorology.md`
5. `docs/MODULE_DEVELOPMENT.md`

## Non-negotiable product rules

- Preserve observed/forecast/model/estimated/development provenance and source time.
- Never fabricate radar values, lightning, tornadoes, tracks, safety, models or confidence.
- Never call model precipitation radar.
- Provider keys remain server-side; the frontend uses the LandDraft Weather gateway.
- Use viewport/time/zoom bounded requests and product-specific caches.
- Storm Chaser features are decision support and must prioritize official hazards over photography.
- Core mapping remains free and fully functional with Weather disabled.

## Next disciplined increments

1. Validate Phase 1 in the public test deployment across desktop, tablet and phone viewports.
2. Add reviewed satellite imagery and a production global forecast provider; the initial official
   NOAA/NWS MRMS composite radar adapter is complete for CONUS.
3. Add severe event normalization/cards without algorithmically upgrading possible rotation to a
   confirmed tornado.
4. Coordinate organization settings, RLS, provider secrets, cache/usage tables and entitlements
   before any schema migration.
5. Add meteorology/model/sounding capabilities incrementally with published definitions and
   numerical validation.

## Provider setup still required

- Production-grade global forecast agreement or self-hosted open-data ingestion.
- Licensed low-latency lightning feed.
- Reviewed radar/satellite tile generation and CDN/object-storage design.
- Weather provider identity/contact strings and operational monitoring.
- Optional notification providers, each disabled until explicitly configured.

## Current provider/environment configuration

- NWS point forecast, latest station observation and active alert polygons require no private key.
- NOAA/NWS MRMS CONUS radar metadata and tiled imagery require no private key.
- `WEATHER_ENABLE_OPEN_METEO_EVALUATION=true` enables the optional global evaluation adapter on the
  server. Keep it disabled for production unless its usage/license has been reviewed. Output is
  labeled `MODEL` and `EVALUATION_ONLY`.
- Lightning, advanced satellite, numerical model grids and commercial global radar have no
  credential configured and deliberately return `not-configured`/`Unavailable` states.

Live adapter verification on 2026-09-11 at Midland, Texas returned a current NWS observation, 14
forecast periods and 15 official MRMS frames. Provider failure still returns normalized health and
warnings instead of fabricated values.
