# LandDraft Weather / Meteorology continuation context

This file is the durable handoff for future LandDraft Weather sessions.

## Current phase

Phase 1 foundation is being built on `feature/test-module-development`. The module is optional,
test-only, schema-free, and must not change billing, plans, production infrastructure or backups.

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

1. Complete and validate Phase 1 provider gateway, workspace, warnings and project persistence.
2. Add tiled NOAA radar/satellite ingestion only after endpoint/product QA and rendering tests.
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

