# Weather layer connection audit

Checked 2026-09-13T22:32:39.906Z at 31.2 N, 98.4 W (Texas). This checks connections at one point and time, not guaranteed geographic coverage or future uptime.

## Repairs

- NASA GIBS rejected fractional seconds in TIME with HTTP 400. Daily requests now use YYYY-MM-DD, and observed frame selection excludes future dates. [NASA request format](https://nasa-gibs.github.io/gibs-api-docs/access-basics/).
- Forecast imagery now starts near the current valid time instead of the final 16 frames of the forecast horizon.
- Aviation, ProbSevere, and storm-report requests receive independent timeouts instead of inheriting an already exhausted observation timeout.
- Chaser layer activation checks the signed-in presence service instead of looking for its data in the weather gateway response.
- Empty photography assessments are shown as connected with no target; latest-image fallback discloses missing source time without suppressing a reviewed image endpoint.
- Rainfall options are grouped in one initially collapsed LandDraft rainfall section; hour toggles, opacity, favorites and stack controls remain available.

## Results

All 21 raster/composite image requests returned HTTP 200 PNG; the 20 raster variants also passed CORS checks with the hosted test origin. All six native fields downloaded and decoded successfully. All 15 SPC outlooks parsed successfully.

| Layer | Data status | Image / binary check |
|---|---|---|
| weather.spc.day1.categorical | Available | Data response only |
| weather.spc.day2.categorical | Available | Data response only |
| weather.spc.day3.categorical | Available | Data response only |
| weather.spc.day1.tornado | Available | Data response only |
| weather.spc.day1.wind | Available | Data response only |
| weather.spc.day1.hail | Available | Data response only |
| weather.spc.day2.tornado | Available | Data response only |
| weather.spc.day2.wind | Available | Data response only |
| weather.spc.day2.hail | Available | Data response only |
| weather.spc.day3.severe | Available | Data response only |
| weather.spc.day4.severe | Available | Data response only |
| weather.spc.day5.severe | Available | Data response only |
| weather.spc.day6.severe | Available | Data response only |
| weather.spc.day7.severe | Available | Data response only |
| weather.spc.day8.severe | Available | Data response only |
| weather.current | Available | Data response only |
| weather.rainfall.1h | Available | 200 image/png 4061 bytes |
| weather.rainfall.3h | Available | 200 image/png 7984 bytes |
| weather.rainfall.6h | Available | 200 image/png 10617 bytes |
| weather.rainfall.12h | Available | 200 image/png 12924 bytes |
| weather.rainfall.24h | Available | 200 image/png 16370 bytes |
| weather.rainfall.48h | Available | 200 image/png 26191 bytes |
| weather.rainfall.72h | Available | 200 image/png 32085 bytes |
| weather.radar.simple | Available | 200 image/png 11619 bytes |
| weather.radar.pro.reflectivity | Available | decoded 720 rays / 1840 bins |
| weather.radar.pro.velocity | Available | decoded 720 rays / 1200 bins |
| weather.radar.pro.storm-velocity | Provider adapter required | Data response only |
| weather.radar.pro.correlation | Available | decoded 360 rays / 1200 bins |
| weather.radar.pro.differential-reflectivity | Available | decoded 360 rays / 1200 bins |
| weather.radar.pro.specific-phase | Available | decoded 360 rays / 1200 bins |
| weather.radar.pro.hydrometeor | Available | decoded 360 rays / 1200 bins |
| weather.satellite.clouds | Available | 200 image/png 39884 bytes |
| weather.satellite.true-color | Available | 200 image/png 43661 bytes |
| weather.satellite.infrared | Available | 200 image/png 39884 bytes |
| weather.satellite.water-vapor | Available | 200 image/png 19638 bytes |
| weather.satellite.cloud-top | Available | 200 image/png 12982 bytes |
| weather.satellite.smoke | Available | 200 image/png 1836 bytes |
| weather.wind.surface | Available | 200 image/png 14391 bytes |
| weather.lightning.recent | LICENSE REVIEW REQUIRED | Data response only |
| weather.severe.alerts | Available | Data response only |
| weather.severe.intelligence | Available | Data response only |
| weather.storm_chaser.spotters | No usable data returned here | Data response only |
| weather.severe.reports | Available | Data response only |
| weather.forecast.precipitation | Available | 200 image/png 4293 bytes |
| weather.surface | Available | 200 image/png 15437 bytes |
| weather.upper-air | Provider adapter required | Data response only |
| weather.convection | Provider adapter required | Data response only |
| weather.metar | Available | Data response only |
| weather.tropical | Available | 200 image/png 854 bytes |
| weather.winter | Available | 200 image/png 854 bytes |
| weather.fire | Available | 200 image/png 854 bytes |
| weather.air-quality | Available | 200 image/png 1836 bytes |
| weather.photo | Available | Data response only |
| weather.historical | Provider adapter required | Data response only |

The raw-gateway chaser result above is expected: this layer uses LandDraft's authenticated presence service separately. Photography may have no candidate zones when no severe target exists. Transparent tropical/winter/fire images are valid responses where the sampled area has no matching feature. Lightning is restricted by the existing commercial-use policy; upper-air, convection, historical, and storm-relative velocity have no implemented adapter. No provider accounts or commercial grants were added.

Repeat the public checks with `node --experimental-strip-types tools/weather-layer-audit.mjs`. Detailed JSON is written to ignored .weather-validation.

## Hosted verification and chaser schema repair

Deployed application commit `4519fb8` to `landdraft-test`, Worker version `74c70d38-195c-470a-9413-25192e1f475c`. Build, TypeScript, targeted lint and 90 weather tests passed.

Hosted UI verified the initially collapsed rainfall section, expansion to all seven hour options, 24-hour activation and sample, NASA cloud-top activation, and NOAA ProbSevere / storm-report loading.

The hosted chaser check exposed missing `public.weather_chaser_presence` and `public.list_active_weather_chasers(...)`. Confirmed both absent with `to_regclass` / `to_regprocedure` in the authenticated **Landdraft Test / GLAB Test** SQL editor, project `unuxnecqjvmtztxxqudb`; `extensions.gen_random_uuid()` existed. Applied the existing `202609120001_weather_chaser_presence.sql` migration in one transaction using equivalent whitespace, followed by a PostgREST schema reload notification. Confirmed `relrowsecurity=true`. No existing data was removed, no real locations were submitted, and production/recovery were untouched.

The isolated `tools/weather-db/chaser.test.mjs` check passed authenticated upsert/list/stop, direct-table denial and anonymous denial. Hosted chaser activation subsequently returned Available, 0 paused, and cleared the missing-function error. Zero nearby chasers is a valid empty result.

## Layer recheck — 2026-09-13

- Re-ran `tools/weather-layer-audit.mjs` with the test environment: all 54 catalog entries checked, zero unexpected public-source failures. Planned adapters and restricted lightning remain explicitly unavailable.
- Independently fetched all six native radar scan routes from the hosted test Worker: HTTP 200, binary payloads. Source tiles and decoding are covered by the audit; this does not establish every overlay renders correctly in every browser.
- Fixed full-catalog requests being silently truncated at 30 layers, forecast timestamps freezing observed refresh, and invalid point opacity (>1) reported by the hosted map renderer.
- A stale open browser requested removed JavaScript chunks after deployment. The error page's retry now reloads the document for chunk errors instead of resetting a cached rejected lazy import.
- Added LandDraft tools as an additional category for the six native radar fields, seven rainfall durations, predictive model, photography and opt-in chasers; original categories and shared settings are retained.
- Added a 45-second client request timeout so an interrupted transport does not leave the module indefinitely loading.
- Automated weather tests: 96 passing. Public-source and proxy success must not be represented as complete interactive browser verification.

## Blank-map reproduction and repair — 2026-09-14

The user confirmed layers turn on but the map remains blank. The previous endpoint audit did not establish rendering correctness.

- Reproduced all six native fields with fixed NOAA scans using the actual `NativeRadarOverlay` in an isolated browser page. Each reached `ready`; reflectivity and classification pixels were visually confirmed.
- Found automatic radar selection used a saved inspection coordinate even when the displayed map was over a distant storm. Added separately validated `mapCenter`, automatic selection on map-center changes, and a fresh location check when enabling a native field. Explicit site selection is preserved.
- Photography's automatic storm selection now uses the visible map center too; an explicitly selected storm still takes precedence.
- Turning on native radar or rainfall now selects observed/live time instead of leaving the new layer hidden by an earlier or forecast timeline selection.
- Added a stable, bounded JSON weather endpoint using the same provider policy/context and point validation. The previous hosted server-function probe returned ~3.1 MB of transport data (~1.9 MB plain JSON); browser requests had timed out. This removes the serialization envelope and hashed transport identifier from weather loads.
- Native cards show loading, decoded scan state, or the worker error instead of using source availability alone. Ready reporting occurs after attaching the map layer.
- 100 weather tests pass, including distant-inspection/map-center regression tests and activation timeline tests. Typecheck and scoped lint pass.

## Mobile blank radar follow-up — 2026-09-14

User screenshot still showed blank Memphis-area imagery with all native cards reporting decoded scans. Captured a separate hosted crash (`Style is not done loading`) in the feature-edit overlay while a replacement basemap initialized. Guarded that source creation and deferred weather/native additions until style readiness, with idle/style-load retries.

Replaced worker OffscreenCanvas PNG encoding with a canvas-independent RGBA PNG encoder. This removes an unverified mobile-worker capability dependency; the user's exact Safari failure cannot be proved from the screenshot alone. Tile/protocol and map-source errors now reach the card, and ready requires a completed tile plus a loaded MapLibre source rather than only a decoded NOAA scan. Cards show the radar site.

Fetched all six KNQA products from the deployed API (00:39 UTC), rendered them together in the actual WeatherMapOverlay, and visually confirmed Memphis-area echoes before and after basemap replacement. No browser errors in that check. Added exact-pixel PNG/zlib round-trip tests; 101 weather tests pass.

## Stalled-source regression — 2026-09-14

The previous readiness guard was too broad. MapLibre `isStyleLoaded()` includes all source loading, whereas `getStyle()` is undefined only until the stylesheet can accept mutations (verified against installed MapLibre `Style.serialize()`). A never-resolving unrelated GeoJSON source reproduced six enabled native products with no imagery. Changing weather/native/edit guards to stylesheet readiness rendered the same six KNQA scans despite that source remaining stalled. This is a reproduced regression introduced by the previous repair, not evidence that every earlier mobile failure had this cause. Mobile layer-stack rows now expose radar tile loading/errors/site instead of showing only enabled-eye icons.
