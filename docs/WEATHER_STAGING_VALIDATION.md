# Hosted Weather staging validation — 2026-09-13

## Destination and recovery evidence

Verified in the signed-in Supabase dashboard: **Landdraft Test / GLAB Test**, project
`unuxnecqjvmtztxxqudb`. Production and recovery were not modified.
The scheduled-backup page showed a physical database backup from
2026-09-13 08:07:44 UTC. No restore was run. Storage objects are outside this
database-backup scope and were not touched.

Before execution the public schema contained the existing ten GIS tables;
`auth.users` and `public.set_updated_at()` existed. No Weather tables existed.

## Schema application

The credential and governance DDL was submitted through the test project's SQL
Editor, combined into one transaction. Source migration references:

| File | SHA-256 |
| --- | --- |
| `202609110001_user_weather_connections.sql` | `ADA35D02D92F26F6EDC94730AC73D8ADB6637DF675EEF7BBB1ADD7695C9A35AF` |
| `202609130001_weather_provider_governance.sql` | `3D285D43DF523311DBA6304977766A88C4EABEF28469C0BAB5FD757CCA1A4F0A` |

The submitted DDL used equivalent whitespace and one outer transaction, rather
than executing both original files independently. These are source-file hashes,
not a hash of the combined browser submission.

1. Rehearsed the combined DDL with `ROLLBACK`: six tables, all with RLS enabled.
2. Rehearsed again with two synthetic auth identities, credential/entitlement/audit
   records, `SET LOCAL ROLE`, and JWT-subject settings. Assertions passed for own-row
   reads, blocked cross-user updates/deletes, blocked self-grants, protected license
   evidence, blocked audit forgery and anonymous denial. Rolled back the entire
   transaction, including the temporary identities and any auth-trigger side effects.
3. Committed the empty schema after the rehearsals passed.
4. A subsequent query confirmed six Weather tables with RLS enabled, zero saved
   credentials, zero license grants, zero catalog records, and zero remaining
   synthetic identities.

No populated table was dropped for a hosted rollback test. Hosted rollback evidence
is transaction rollback of the rehearsals. The explicit down-migration/reinstall
test remains covered by the isolated PostgreSQL harness.

The project has no `supabase_migrations.schema_migrations` ledger. This was a
direct SQL Editor application; the dashboard's migration history is not a record
of this execution. Reconcile baseline/migration history before future CLI deployment
or a durable-policy rollout. No migration ledger was invented or overwritten.

## Hosted HTTP checks

`tools/weather-db/staging-anonymous.test.mjs` passed six resource checks (seven Node
test results including its parent): both catalogs return HTTP 200, and connections,
license reviews, entitlements and audit events deny anonymous requests. The script
uses the public publishable key, limits responses to zero rows and refuses any
destination other than the designated test project.

Run from the repository root:

```sh
node --env-file=.env.weather-staging.local --test tools/weather-db/staging-anonymous.test.mjs
```

## Isolated local staging preview

Created `.env.weather-staging.local`, confirmed ignored by Git. It targets only the
verified test project, uses its public publishable key, and contains a newly generated
32-byte server encryption secret for the verified empty credential store. The secret
was not printed, committed, placed in a VITE variable, or deployed to Cloudflare.
Commercial policy has zero grants. Existing `.env` and port 5173 were preserved.

Startup from the repository root:

```sh
node --env-file=.env.weather-staging.local node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 5174 --strictPort --mode weather-staging
```

The development process needs network access to test Supabase and public weather
providers. The unauthenticated Xweather connection endpoint returns HTTP 401,
confirming login enforcement with server configuration present. The browser reaches
the staging LandDraft sign-in page at `http://127.0.0.1:5174/weather`.

`tools/weather-db/prepare-staging.mjs` is a one-time initializer for a verified empty
test credential store. Exclusive file creation prevents replacing an existing key.
Do not run it as a key-rotation mechanism or against a populated store.

## Remaining gates

- User sign-in to the staging LandDraft application, distinct from dashboard login.
- Authenticated app/PostgREST integration and real credential lifecycle testing.
- Actual provider license evidence before approving commercial products.
- Durable runtime policy/audit integration; runtime still uses server configuration.
- Other Weather migrations/products, full physical-device QA and later release slices.
- Cloudflare deployment secret configuration and controlled rollout, neither performed here.

Passing these schema tests does not make the complete Weather upgrade production-ready.

## Authenticated staging and controlled outage — 2026-09-13

The user signed into the separate staging application on port 5174. The existing
staging project opened successfully, and the authenticated Data Sources workflow
reported Xweather as not connected with license review required, without the earlier
server-not-configured error. Credential entry and submission remained disabled with
zero grants; no vendor credential was requested or submitted.

A process-only policy override temporarily disabled NWS and MRMS in staging. The map
remained usable, the official-alert badge explicitly displayed Alerts unavailable,
and dependent layers were paused. This exposed an availability bug: the current
conditions layer inherited the NWS kill switch even when it held a reviewed MET
Norway fallback. The resolver now checks the actual MET source for that fallback.
A regression test covers independent fallback operation and the fallback's own kill
switch. Model/estimated conditions are now explicitly labeled on map markers.

The controlled outage was removed by restarting with the original staging env file.
The browser subsequently showed the three original active layers and visible MRMS
radar again. No workspace-save action or location-sharing permission was used.

Remaining commercial lifecycle checks require an actual permitted provider agreement
and account; database role tests are not a substitute for a real vendor entitlement
test. Existing OpenFreeMap glyph/filter warnings were observed; local glyph fallback
rendered labels, but cross-basemap glyph compatibility remains on the UI backlog.
# SPC categorical outlook slice — 2026-09-13

Implemented in the existing Weather components, without schema changes or new dependencies:

- Registered public SPC Day 1–3 categorical outlooks; strict server parser preserves source colors, issue time, valid period, retrieval time and provenance.
- Official source: https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson (corresponding day2/day3 products). Rights basis: https://www.weather.gov/disclaimer; operational NWS content, attributed, no endorsement claim. No commercial provider enabled.
- Requested CONUS products load independently with 12-second request limits and a five-minute shared cache. Invalid/empty/partial/expired products fail closed. Retrieval older than ten minutes disables display. An empty response is not interpreted as no risk.
- Kill switch: include `spc` in the existing policy `disabledProviders`. NWS warning requests remain independent. No database rollback required; revert the SPC adapter/registry/UI slice to remove it.
- Latest issuance only. Historical scrub/animation now sets historical mode and hides current-only SPC; Jump to latest restores live mode. This is not an SPC archive implementation. The broader synchronized historical-warning/storm/route roadmap remains incomplete.

Authenticated local staging verification (port 5174):

1. Layers → Show unavailable & optional layers → SPC showed three unverified products.
2. Activating Day 1 fetched actual products; all three days reported Available; Day 1 showed 4 active / 0 paused with existing layers retained.
3. Map showed source-colored polygons and an explicit OFFICIAL SPC / FORECAST badge.
4. Inspector displayed actual issue 2026-09-13T12:44Z, valid 13:00Z to 2026-09-14T12:00Z, retrieval time, issuance age, input quality and text risk labels.
5. Previous frame hid the SPC product; Jump to latest restored it. This caught and repaired the existing missing timeline-mode transition.
6. Visual checks at mobile portrait 390×844, landscape 844×390, tablet 768×1024 / 1024×768 and desktop DOM at 1440×900. Viewport reset afterward. These are browser simulations, not physical-device certification or a saved visual-regression suite.

Automated suite: 63 weather tests pass, including malformed geometry, mixed times, empty/partial feeds, expired/future issuance, source-color validation, forecast/historical selection, staleness and provider kill switch. Typecheck, scoped lint and production build checked separately. No production deployment, database mutation, credential entry or project save during this slice.

Remaining SPC work: hazard probabilities/intensity products, Days 4–8, mesoscale discussions, watches/reports expansion, recorded browser regression automation, archived forecasts and service-level performance validation. Automated outage tests cover parsing/availability; this slice did not perform a new live provider outage injection.
# SPC probability and extended outlook slice — 2026-09-13

Added twelve products to the three existing categorical outlooks: Day 1–2 tornado/wind/hail probabilities, Day 3 severe probability, and separate Days 4–8 severe probabilities. Shared allowlisted catalog drives registration, endpoint selection and rendering. No migration, dependency, commercial license activation or production deployment.

Official endpoint inventory was read from https://www.spc.noaa.gov/gis/. Extended products are operational despite the legacy `/exper/` URL: https://www.weather.gov/media/notification/pdfs/scn14-54spc_day_4-8_severe.pdf. Existing NOAA/NWS public-data rights and attribution apply. Conditional intensity products are intentionally separate and remain pending; no legacy significant-severe label is substituted for current CIG products.

Validated special no-contour responses: a single empty GeometryCollection with DN=0, blank colors, recognized official statement and valid source times. These display the provider's statement (e.g. Less Than 2% All Areas, Potential Too Low, Predictability Too Low), not a fabricated polygon or an all-clear. Empty feature collections, unknown statements, mixed sentinel/contour data and missing contour colors remain failures. Future valid periods do not become future observation times.

Checks: 66 weather tests passed; all 15 public endpoints passed the opt-in `node --experimental-strip-types tools/weather-spc-smoke.mjs` live contract check. No downloaded payloads or credentials persisted. Authenticated staging activated Day 1 tornado probability and Day 8 severe probability. Inspector displayed separate issue/valid/retrieval times, source links, explicit no-contour statements and the no-all-clear qualification. Multiple active outlooks use one compact map badge with detailed cards in the inspector.

Rollback: existing `spc` provider kill switch; remove new catalog entries to disable individual products. Existing categorical IDs are retained. Remaining work includes mesoscale discussions (official service inspected; adapter not implemented in this slice), watches, conditional intensity, archived products, saved visual regression automation, broader outage/load validation and the remaining release roadmap. No expert approval or full-upgrade completion is claimed.
