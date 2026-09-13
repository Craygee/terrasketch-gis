# LandDraft 0.9.154 production release

Release date: 2026-09-12 (America/Chicago)  
Source branch: `main`  
Release tag: `landdraft-v0.9.154`  
Rollback tag: `landdraft-stable-2026-09-10`

## Scope

- Promote the tested application/versioning, Pipeline Engineering foundation, Weather &
  Meteorology foundation and Storm Chaser increments from the isolated preview branch.
- Preserve core mapping as free and unchanged by any entitlement or payment decision.
- Preserve project ownership, sharing permissions, database isolation and existing backups.
- Keep pricing undecided for optional modules.

## Production provider policy

- NOAA/NWS and other reviewed public-provider adapters retain source, observation/valid time and
  stale-data handling.
- Xweather remains bring-your-own-account. LandDraft does not fund or share a common customer quota.
- The Spotter Network feed remains preview-only and disabled in production because its published
  terms require separate permission for commercial use.
- RadarScope and RadarOmega remain clearly labeled companion applications; LandDraft does not claim
  access to their private feeds.

## Coordination

The separate administration portal was inspected before release. It currently defines free core
mapping only and does not enforce module access in the GIS application. This release does not edit
the portal, payments, plans, grants, permissions or billing. Stable capability identifiers remain
available for a later coordinated entitlement implementation.

## Verification and rollback

The release requires TypeScript, ESLint, Weather tests, a production-channel build, a production
deployment smoke test and a signed-in map/module smoke test. Git history remains forward-only.
Rollback is performed by creating a new forward commit from the preserved stable tag or by
republishing a prior verified deployment; published Git history must never be force-pushed.
