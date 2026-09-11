# Weather / Meteorology

Status: In test  
Owner branch: `feature/test-module-development`  
Core mapping impact: None; optional workspace, core map remains free  
Pricing: Undecided

## Capabilities

Phase 1 provides the optional Weather workspace, normalized provider contracts, capability hooks,
layer catalog, universal timeline, responsive weather drawer/inspector, project-aware viewport,
official U.S. warning ingestion, point conditions/forecast gateway, official NOAA/NWS MRMS CONUS
composite radar frames, source age/quality labels, presets, compact legends and explicit
unavailable/configuration states for satellite grids, wind fields and lightning awaiting reviewed
feeds.

It does not claim professional Level II radar decoding, global radar, live lightning, storm-cell
detection, safe chase routing, soundings, numerical model rendering or certified operational risk.

## Dependencies

- Shared React, TanStack Start, MapLibre, project store, authenticated shell and responsive styles.
- Server-side Weather gateway, official NWS API adapter and official NOAA/NWS MRMS WMS adapter.
- No new runtime package and no database migration in Phase 1.
- Server-side test telemetry counts logical provider requests, successes, failures and cache hits;
  it deliberately leaves unknown data volume and provider cost as `null` rather than inventing a
  price.
- Future providers may require Cloudflare cache/object storage/queues, PostGIS, licensed feeds and
  server-side environment variables.

## Potential operating costs

- Public data still creates server compute, bandwidth, caching and monitoring costs.
- Low-latency global radar/lightning and commercial forecast redistribution may require contracts.
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

- Passed: TypeScript typecheck, full ESLint (existing fast-refresh warnings only), six focused Node
  tests and Cloudflare production build.
- Passed live provider check at a Midland, Texas point: current NWS observation, 14 forecast periods
  and 15 timestamped NOAA/NWS MRMS frames.
- Automated tests cover unit conversions, timestamps/staleness, alert severity, registry uniqueness,
  entitlement decisions, usage telemetry aggregation and unknown-cost handling.
- Provider failures produce explicit health/warning states; unconfigured feeds remain unavailable.
- Signed-in visual QA remains required in the public preview at desktop, tablet, iPhone and narrow
  mobile widths. The repository currently has no general Vitest package/runner, so the dedicated
  Weather tests use Node's built-in test runner without adding a dependency.

## Release notes

- Weather appears as an optional Data/module entry and opens `/weather`.
- The module can be disabled by removing/hiding its entry; optional project state remains inert.
- Provider setup/connection status is visible and missing feeds say `Unavailable`, never fake data.
- Rollback: `landdraft-stable-2026-09-10`.
