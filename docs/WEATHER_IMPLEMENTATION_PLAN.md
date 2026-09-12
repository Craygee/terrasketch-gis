# Weather / Meteorology implementation plan

Status: Phase 1 implementation on `feature/test-module-development`  
Prepared from repository audit: 2026-09-11

Phase 1.1 provider increment connects vetted public official raster/API sources, bounded server-side
failover, global point-model fallback, METAR stations and conservative photography candidates. It
does not add schema, billing, entitlements, admin permissions or production infrastructure.

Phase 1.3 adds an additive test-only bring-your-own-Xweather connection: per-user AES-GCM encrypted
credentials, RLS persistence, authenticated same-origin tile delivery, connection management and no
shared LandDraft Xweather billing fallback. It does not add a plan, price, entitlement or payment.

## Existing architecture findings

- LandDraft is a TanStack Start/React application with file routes, an authenticated root shell,
  MapLibre map rendering, and a central `WorkbenchProvider` that serializes project state.
- Optional Pipeline Engineering already establishes the preferred module pattern: lazy authenticated
  route, its own responsive workspace, shared `WorkbenchProvider`/`MapRefProvider`, and no impact on
  the ordinary map when the module is not opened.
- Projects and restore history are stored through the existing project repository. Optional module
  state can initially live inside the project snapshot without a database migration.
- The app has no production billing/entitlement contract in this branch. Weather therefore receives
  stable capability identifiers and local evaluation hooks, but no paywall, plan, price, or admin
  permission change.
- Cloudflare/Nitro provides the server boundary. Provider credentials and upstream requests belong
  behind LandDraft server routes, never in browser code.

## Phase 1 increment

1. Add typed weather capability, provider, provenance, layer-registry, timeline, preset, observation,
   alert, frame, and provider-health contracts.
2. Add a provider-neutral weather gateway with request validation, timeout/cancellation, per-product
   cache policy, source timestamps, staleness classification, and explicit unavailable states.
3. Add official NWS alert/point forecast adapters for supported U.S. locations and a global-provider
   adapter boundary. No private provider key is exposed to the client.
4. Add an optional `/weather` workspace using the shared LandDraft map and project viewport.
5. Add progressive-disclosure Weather layers, a universal observed/future timeline, inspector,
   compact legends, source/health panel, presets, desktop/tablet panels, and mobile bottom sheet.
6. Add warning polygons as real MapLibre layers. Radar, satellite, wind, and lightning are registered
   with truthful availability/configuration states until a reviewed rendering provider is connected.
7. Persist Weather workspace preferences in the existing project snapshot and add Weather entries to
   existing desktop/mobile navigation without altering core mapping.
8. Add focused tests for normalization, units, staleness, alert classification, entitlements, the
   registry, fallback behavior, and project/geometry helpers.
9. Run typecheck, lint, tests, and production build; publish only to the isolated preview deployment.

## Coordination and release boundary

- Shared files: project state/store, top navigation, mobile navigation, generated route tree, and
  versioned documentation.
- New files: weather domain/provider/gateway code, server route, workspace components, module docs,
  and tests.
- No payments, plans, admin permissions, production infrastructure, backups, or database schema are
  changed. A future database migration for organization settings, alerts, usage, and cached products
  remains blocked on administration/billing coordination.
- Rollback remains the `landdraft-stable-2026-09-10` tag. Weather can be disabled by hiding its route
  entry; stored weather state is optional and inert to the core GIS.
