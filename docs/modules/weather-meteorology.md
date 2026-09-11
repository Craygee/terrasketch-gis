# Weather / Meteorology

Status: In test  
Owner branch: `feature/test-module-development`  
Core mapping impact: None; optional workspace, core map remains free  
Pricing: Undecided

## Capabilities

Phase 1.1 provides the optional Weather workspace, normalized provider contracts, capability hooks,
layer catalog, universal multi-product timeline, responsive weather drawer/inspector,
project-aware viewport, official U.S. warning ingestion, NWS current conditions/forecast,
MET Norway global model fallback, NOAA/NWS MRMS radar with official NWS radar failover, NOAA
nowCOAST satellite imagery and lightning-density, NDFD temperature/wind/precipitation, NHC
tropical summary, WSSI, SPC fire outlook, NOAA smoke guidance, Aviation Weather Center METAR
stations, source health/provenance, and a conservative photography-candidate analysis.

Visible products appear in a persistent **Active layer stack**. The top item renders in front;
desktop users can drag between insertion lines and touch/keyboard users can move layers forward or
back with explicit controls. Layer order is stored in the project and in new Weather presets. Older
projects receive registry order automatically.

It does not claim professional Level II radar decoding, global radar, individual global lightning
strikes, storm-cell detection, safe chase routing, soundings or certified operational risk.

## Dependencies

- Shared React, TanStack Start, MapLibre, project store, authenticated shell and responsive styles.
- Server-side Weather gateway; official NWS API/GIS, MRMS, nowCOAST and Aviation Weather Center
  adapters; public MET Norway Locationforecast adapter; and Turf geometry already used by LandDraft.
- No new runtime package and no database migration in Phase 1.
- Server-side test telemetry counts logical provider requests, successes, failures and cache hits;
  it deliberately leaves unknown data volume and provider cost as `null` rather than inventing a
  price.
- Future providers may require Cloudflare cache/object storage/queues, PostGIS, licensed feeds and
  server-side environment variables.

## Potential operating costs

- Public data still creates server compute, bandwidth, caching and monitoring costs.
- Low-latency global radar, exact lightning strikes and commercial forecast redistribution may
  require contracts. MET Norway requires attribution and appropriate request identification/rates.
- Radar/satellite/model processing drives compute, object storage and egress.
- Push, email, SMS, offline packs, historical archives and AI explanations are usage-based cost
  candidates. Product pricing remains undecided.

## Administration/billing coordination

- Shared frontend state, navigation and route tree are touched.
- Capability ids are declared, but no subscription, plan, price, paywall, admin permission or
  production setting is created.
- Future organization capability overrides, provider credentials, usage metering and schema/RLS are
  pending coordination with administration/billing before merge.
- Phase 1 telemetry is in-memory and not user/org attributed. Durable metering requires the pending
  coordinated schema and privacy review.

## Security and privacy

- Provider keys stay server-side; only normalized bounded responses reach clients.
- Phase 1 creates Weather display preferences in the existing project snapshot only after the
  workspace is opened and stores no continuous GPS trail.
- Provider errors, inputs, cache keys and source references are sanitized and bounded.
- Official warning data retains provenance and times; stale data cannot be labeled live.

## Test plan

- Verification for this increment covers TypeScript, ESLint, focused Weather tests, production build
  and live capabilities checks for each official WMS/API endpoint.
- Automated tests cover unit conversions, timestamps/staleness, alert severity, registry uniqueness,
  entitlement decisions, usage telemetry aggregation and unknown-cost handling.
- Provider failures produce explicit health/warning states; MRMS can switch to official NWS radar,
  and missing NWS point data can switch to a clearly labeled MET Norway model result.
- Signed-in visual QA remains required in the public preview at desktop, tablet, iPhone and narrow
  mobile widths. The repository currently has no general Vitest package/runner, so the dedicated
  Weather tests use Node's built-in test runner without adding a dependency.

## Release notes

- Weather appears as an optional Data/module entry and opens `/weather`.
- The module can be disabled by removing/hiding its entry; optional project state remains inert.
- Provider setup/connection status is visible and missing feeds say `Unavailable`, never fake data.
- Rollback: `landdraft-stable-2026-09-10`.
