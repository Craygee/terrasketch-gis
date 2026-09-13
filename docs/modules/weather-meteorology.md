# Weather / Meteorology

Status: Merged
Owner branch: `main`
Core mapping impact: None; optional workspace, core map remains free  
Pricing: Undecided

## Capabilities

Phase 1.5 provides the optional Weather workspace, normalized provider contracts, capability hooks,
layer catalog, universal multi-product timeline, responsive weather drawer/inspector,
project-aware viewport, official U.S. warning ingestion, NWS current conditions/forecast,
MET Norway global model fallback, NOAA/NWS MRMS radar with official NWS radar failover, nearest-site
NOAA RIDGE II base reflectivity/base radial velocity/hydrometeor classification, NOAA nowCOAST
satellite imagery and lightning-density, NASA MODIS cloud-top temperature, NDFD temperature/wind/precipitation, NHC
tropical summary, WSSI, SPC fire outlook, NOAA smoke guidance, Aviation Weather Center METAR
stations, source health/provenance, a conservative photography-candidate analysis, and a server-only
Xweather bring-your-own-account adapter for global radar/satellite/lightning coverage plus a searchable,
progressively disclosed catalog of 76 weather-relevant Xweather raster products.

The Storm Chaser workspace now automatically loads NOAA/CIMSS ProbSevere v3 tracked-storm polygons,
calibrated next-hour hail/wind/tornado guidance, recent trends and quality-controlled centroid
motion. Selecting a storm flies to it and draws widening +5 to +60 minute motion-only uncertainty
corridors. Official-alert-backed contexts remain separate, as do provider guidance and LandDraft
derived projections. Ephemeral device GPS supplies distance/bearing and preserves inside-warning
route suppression. Unsupported classifications, exact event locations and unsafe routes remain
withheld.

Visible products appear in a persistent **Active layer stack**. The top item renders in front;
desktop users can drag between insertion lines and touch/keyboard users can move layers forward or
back with explicit controls. Layer order is stored in the project and in new Weather presets. Older
projects receive registry order automatically.

It does not claim raw Level II radar decoding, individual raw lightning strikes,
storm-relative velocity, correlation coefficient, differential reflectivity, storm-cell detection,
safe chase routing, soundings or certified operational risk.

## Dependencies

- Shared React, TanStack Start, MapLibre, project store, authenticated shell and responsive styles.
- Server-side Weather gateway; official NWS API/GIS, MRMS, RIDGE II, nowCOAST, NASA EOSDIS GIBS and
  Aviation Weather Center adapters; public MET Norway Locationforecast adapter; and Turf geometry
  already used by LandDraft.
- No new runtime package. The additive `weather_provider_connections` migration stores only
  AES-GCM ciphertext and non-secret connection status under per-user RLS.
- Server-side test telemetry counts logical provider requests, successes, failures and cache hits;
  it deliberately leaves unknown data volume and provider cost as `null` rather than inventing a
  price.
- Xweather requires each user to connect their own client ID and secret. The Worker requires one
  `XWEATHER_CREDENTIAL_ENCRYPTION_KEY`, verifies the LandDraft session, decrypts only the requesting
  user's record and proxies same-origin tiles. Provider credentials never enter the browser bundle
  or public tile URL. Legacy shared Xweather deployment credentials are not used.
- Future providers may require Cloudflare cache/object storage/queues, PostGIS, licensed feeds and
  additional server-side environment variables.
- Storm Chaser contracts and calculations use the existing Weather gateway, NOAA public ProbSevere
  GeoJSON frames and Turf geometry. This
  increment adds no runtime package or shared database table.

## Potential operating costs

- Public data still creates server compute, bandwidth, caching and monitoring costs.
- Xweather global radar/satellite/lightning uses access-based PAYG metering on each connected user's
  Xweather account. The current public terms include 15,000 free accesses per account each month,
  but interactive tiles and animation can consume multiple accesses per view. Air-quality products
  may count at 5× and detailed lightning products at 10×; the layer card discloses that multiplier.
  LandDraft still incurs ordinary authentication, database and Worker traffic; pricing remains
  undecided.
- Exact lightning strike APIs and commercial forecast redistribution may require additional
  contracts. MET Norway requires attribution and appropriate request identification/rates.
- Radar/satellite/model processing drives compute, object storage and egress.
- Push, email, SMS, offline packs, historical archives and AI explanations are usage-based cost
  candidates. Product pricing remains undecided.
- Low-latency raw radar decoding, storm-object history and future road/lightning/terrain-aware chase
  analysis may add material compute, storage and licensed-data costs.

## Administration/billing coordination

- Shared frontend state, navigation and route tree are touched.
- Capability ids are declared, but no subscription, plan, price, paywall, admin permission or
  production setting is created.
- Per-user Xweather credentials are an additive, non-entitlement connection setting. Future
  organization-managed connections, capability overrides, durable usage metering and billing remain
  pending administration/billing coordination.
- Phase 1 telemetry is in-memory and not user/org attributed. Durable metering requires the pending
  coordinated schema and privacy review.
- Release coordination on 2026-09-12 confirmed that the separate administration portal does not yet
  enforce GIS module access and currently defines only the free core-mapping contract. Weather is
  therefore released as an open optional workspace without changing that portal, plans, permissions,
  grants or billing. Its existing capability ids are the stable integration boundary for later work.

## Security and privacy

- Provider keys are encrypted server-side with AES-GCM and authenticated additional data bound to
  the LandDraft user. Commercial tile requests require the user's Supabase bearer token and use a
  validated same-origin proxy; only normalized metadata plus LandDraft URLs reach clients.
- Phase 1 creates Weather display preferences in the existing project snapshot only after the
  workspace is opened and stores no continuous GPS trail.
- Provider errors, inputs, cache keys and source references are sanitized and bounded.
- Official warning data retains provenance and times; stale data cannot be labeled live.

## Test plan

- Verification for this increment covers TypeScript, ESLint, focused Weather tests, production build
  and live capabilities checks for each official WMS/API endpoint.
- Automated tests cover unit conversions, timestamps/staleness, alert severity, registry uniqueness,
  entitlement decisions, usage telemetry aggregation, unknown-cost handling, Storm Object
  determinism, exercise-data rejection, widening motion uncertainty and chase safety suppression.
- Provider failures produce explicit health/warning states; MRMS can switch to official NWS radar,
  and missing NWS point data can switch to a clearly labeled MET Norway model result.
- Signed-in visual QA remains required in the public preview at desktop, tablet, iPhone and narrow
  mobile widths. The repository currently has no general Vitest package/runner, so the dedicated
  Weather tests use Node's built-in test runner without adding a dependency.

## Release notes

- Weather appears as an optional Data/module entry and opens `/weather`.
- The module can be disabled by removing/hiding its entry; optional project state remains inert.
- Provider setup/connection status is visible and missing feeds say `Unavailable`, never fake data.
- Xweather products are searchable across categories; only enabled products load, and active products
  use the existing draggable layer stack for ordering.
- **Connect Xweather** in the layer/source panels supports test-and-save, masked status, credential
  replacement and disconnect. Public NOAA layers remain available without an Xweather account.
- Rollback: `landdraft-stable-2026-09-10`.
- Production release intentionally leaves the noncommercial Spotter Network position feed disabled.
  Enabling community spotter positions outside the isolated preview still requires written provider
  permission and a separate production configuration review.
