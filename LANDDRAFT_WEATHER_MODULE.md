# LandDraft Weather / Meteorology continuation context

This file is the durable handoff for future LandDraft Weather sessions.

## Current phase

Phase 1.5 provider and automated Storm Chaser foundation is implemented on `feature/test-module-development`. The module is optional,
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
- NOAA/CIMSS ProbSevere v3 tracked-storm objects, calibrated next-hour provider guidance, recent
  object history (approximately 30 minutes when object identity persists), quality-controlled
  centroid motion, separately styled recent-object trails, automatically fitted widening
  motion-only map corridors, official alert contexts and ephemeral GPS-relative Chase context are
  implemented. The selected track can be re-centered explicitly and recent low-level azimuthal
  shear, MESH, composite reflectivity and flash-rate signals are visible with their provider
  provenance. Provider guidance is never labeled as an official warning.
  Individual raw lightning strikes, additional professional radar moments (including storm-relative
  velocity, correlation coefficient and differential reflectivity), calibrated storm signatures,
  upper-air/convective grids, soundings, historical archives and commercial global radar remain
  unconfigured.

Research and safety decisions for automated Storm Chaser analysis are maintained in
`docs/STORM_CHASER_SEVERE_INTELLIGENCE_RESEARCH.md`.

## Photography analysis state

Photography mode now creates ranked **lower-exposure candidate zones**, never “safe locations.” It
requires an official alert polygon, screens candidates against official point alerts and uses
labeled model cloud/wind/precipitation context. Significant alert exposure suppresses scoring.
Roads, terrain, flood conditions and exact lightning are not yet inputs and are plainly disclosed.

Live adapter verification on 2026-09-11 at Midland, Texas returned a current NWS observation, 14
forecast periods and 15 official MRMS frames. Provider failure still returns normalized health and
warnings instead of fabricated values.

## Mobile Field / Storm Chaser integration

- The mobile Field header links directly to the Weather Storm Chaser workspace while retaining the
  same project context. Weather layers remain independently switchable and reorderable there.
- Chase GPS is explicit and ephemeral. Once enabled, **Follow car** keeps the Weather map centered
  on the device; a deliberate map pan/zoom disables follow so the user remains in control.
- A user may tap **Target**, choose a map point and open same-tab external directions. Apple touch
  devices use Apple Maps; Android and other browsers use Google Maps. The destination is explicitly
  user-selected and is never described as safe or chosen automatically by LandDraft.
- Current/analyzed severe objects and their motion-only projected positions use event-specific white
  glyphs for tornado/rotation, hail, hurricane/tropical cyclone, dust/haboob, lightning and major
  thunderstorm. Background severity progresses from green to dark red and is reinforced with text,
  labels and provenance so color is not the only signal.
- Phone controls reserve separate screen regions for the compact header, map controls, bottom
  navigation and capped bottom sheet. The prior permanent Storm Chaser decision-support map bubble
  was removed; safety/provenance remains in the contextual Storm Intelligence panel.

## Production storm reports and chaser presence

- The restricted Spotter Network feed is not used on the live site. Its published feed terms are
  non-commercial and remain subject to separate written authorization.
- `weather.severe.reports` loads the Iowa Environmental Mesonet's five-minute GeoJSON of NWS Local
  Storm Reports. These are observed event locations, not live people, and retain event time, type,
  place, magnitude, remarks and source provenance.
- `weather.storm_chaser.spotters` now represents voluntary LandDraft chaser presence. Enabling GPS
  does not publish a location; the user must separately opt in. The table has one replaceable row per
  user, authenticated read access through a bounded RPC and automatic ten-minute expiry. No travel
  history is stored.
- Apply `supabase/migrations/202609120001_weather_chaser_presence.sql` in test and production before
  enabling the live sharing control. The module otherwise degrades without exposing a location.

This increment adds no paid provider or runtime dependency. It adds one small Supabase table and
three authenticated RPCs. Expected costs are normal database calls, Worker requests and bandwidth;
pricing remains undecided. External navigation providers, GPS, NOAA/CIMSS/IEM data and basemap
services retain their own terms and operating limits. Future authoritative road-closure, flood and
individual-lightning feeds may add provider and infrastructure costs.
