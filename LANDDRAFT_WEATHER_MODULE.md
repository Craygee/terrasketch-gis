# LandDraft Weather / Meteorology continuation context

This file is the durable handoff for future LandDraft Weather sessions.

## Current phase

Phase 1.4 provider and Storm Chaser foundation is implemented on `feature/test-module-development`. The module is optional,
test-only, and does not change billing, plans, production infrastructure or backups. One additive
per-user RLS table supports encrypted bring-your-own Xweather credentials.

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
4. `docs/WEATHER_PROVIDER_SETUP.md`
5. `docs/modules/weather-meteorology.md`
6. `docs/MODULE_DEVELOPMENT.md`
7. `docs/STORM_CHASER_SEVERE_INTELLIGENCE.md`

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
2. Validate the searchable 76-product Xweather raster catalog with a user-connected test account, measure
   actual 1×/5×/10× tile usage and confirm redistribution/attribution terms before production release.
3. Extend the implemented official-alert Storm Object cards into viewport/regional event retrieval,
   then add raw-radar object tracking without algorithmically upgrading possible rotation to a
   confirmed tornado.
4. Coordinate organization settings, RLS, provider secrets, cache/usage tables and entitlements
   before any schema migration.
5. Add meteorology/model/sounding capabilities incrementally with published definitions and
   numerical validation.

## Provider setup still required

- Optional production-grade global forecast SLA or self-hosted open-data ingestion beyond the
  public MET Norway fallback.
- Licensed individual raw-strike lightning access beyond the connected raster flash product.
- CDN/object-storage design if public upstream tile demand outgrows bounded direct use.
- Weather provider identity/contact strings and operational monitoring.
- Optional notification providers, each disabled until explicitly configured.

## Current provider/environment configuration

- NWS point forecast, latest station observation and active alert polygons require no private key.
- NOAA/NWS MRMS CONUS radar metadata and tiled imagery require no private key.
- Official NWS WMS radar provides an automatic equivalent fallback if MRMS fails.
- NOAA nowCOAST satellite and regional lightning-density WMS products require no private key.
- NDFD wind/temperature/precipitation, NHC tropical, WSSI, SPC fire and NOAA smoke products require
  no private key and load only when selected.
- MET Norway provides the global model point fallback and requires identifying User-Agent and
  attribution. Aviation Weather Center provides bounded global METAR station queries.
- `WEATHER_ENABLE_OPEN_METEO_EVALUATION=true` enables the optional global evaluation adapter on the
  server. Keep it disabled for production unless its usage/license has been reviewed. Output is
  labeled `MODEL` and `EVALUATION_ONLY`.
- NOAA nearest-site base reflectivity, base radial velocity and digital hydrometeor classification
  are connected through the public RIDGE II WFS/WMS. NASA MODIS cloud-top-temperature imagery is
  connected through EOSDIS GIBS; it is a daily orbital product and may contain pass gaps.
- The Xweather Raster Maps adapter is implemented for global radar, GeoColor/infrared/water-vapor
  satellite and a 76-product weather-relevant catalog spanning conditions, wind, forecasts, severe,
  lightning, air quality, fire, maritime, tropical and outlooks. Each user connects their own
  Xweather API key; its client ID/secret components are encrypted server-side and never embedded in a browser
  URL or frontend bundle. The Worker needs `XWEATHER_CREDENTIAL_ENCRYPTION_KEY`, and deployments
  sharing Supabase must share that encryption key. NOAA remains primary for U.S. radar.
- Official-alert-backed Storm Objects and ephemeral GPS-relative Chase context are implemented.
  Individual raw lightning strikes, additional professional radar moments (including storm-relative
  velocity, correlation coefficient and differential reflectivity), calibrated storm signatures,
  upper-air/convective grids, soundings, historical archives and commercial global radar remain
  unconfigured.

## Photography analysis state

Photography mode now creates ranked **lower-exposure candidate zones**, never “safe locations.” It
requires an official alert polygon, screens candidates against official point alerts and uses
labeled model cloud/wind/precipitation context. Significant alert exposure suppresses scoring.
Roads, terrain, flood conditions and exact lightning are not yet inputs and are plainly disclosed.

Live adapter verification on 2026-09-11 at Midland, Texas returned a current NWS observation, 14
forecast periods and 15 official MRMS frames. Provider failure still returns normalized health and
warnings instead of fabricated values.
