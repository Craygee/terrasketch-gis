# Weather / Meteorology

Status: In test  
Owner branch: `feature/test-module-development`  
Core mapping impact: None; optional workspace, core map remains free  
Pricing: Undecided

## Capabilities

Phase 1 provides the optional Weather workspace, normalized provider contracts, capability hooks,
layer catalog, universal timeline, responsive weather drawer/inspector, project-aware viewport,
official U.S. warning ingestion, point conditions/forecast gateway, source age/quality labels,
presets, compact legends and explicit unavailable/configuration states for radar, satellite, wind
and lightning products awaiting reviewed feeds.

It does not claim professional Level II radar decoding, global radar, live lightning, storm-cell
detection, safe chase routing, soundings, numerical model rendering or certified operational risk.

## Dependencies

- Shared React, TanStack Start, MapLibre, project store, authenticated shell and responsive styles.
- Server-side Weather gateway and official NWS API adapter.
- No new runtime package and no database migration in Phase 1.
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

## Security and privacy

- Provider keys stay server-side; only normalized bounded responses reach clients.
- Phase 1 stores display preferences in the existing project snapshot and no continuous GPS trail.
- Provider errors, inputs, cache keys and source references are sanitized and bounded.
- Official warning data retains provenance and times; stale data cannot be labeled live.

## Test plan

- Unit conversions, timestamps/staleness, alert severity/status, registry uniqueness, entitlement
  decisions, provider failover/unavailable states and project geometry intersection helpers.
- Desktop, tablet, iPhone and narrow-mobile workspace layout.
- Provider timeout/failure and stale-cache behavior.
- Typecheck, ESLint, focused tests and production build.

## Release notes

- Weather appears as an optional Data/module entry and opens `/weather`.
- The module can be disabled by removing/hiding its entry; optional project state remains inert.
- Provider setup/connection status is visible and missing feeds say `Unavailable`, never fake data.
- Rollback: `landdraft-stable-2026-09-10`.

