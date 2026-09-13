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
