# LandDraft 0.9.157 production release

Release date: 2026-09-12 (America/Chicago)  
Source branch: `main`  
Release tag: `landdraft-v0.9.157`  
Rollback tags: `landdraft-v0.9.156`, `landdraft-stable-2026-09-10`

## Scope

- Promote the tested production-safe Storm Chaser presence and recent NWS storm-report layers.
- Make Active Storm Intelligence collapsed by default and focus the detail panel on the selected
  storm.
- Move the desktop weather legend into the Weather Layers sidebar so it does not cover the map;
  retain the compact floating legend on mobile.
- Use OpenStreetMap as the initial and fallback basemap for new or unspecified views while
  preserving the basemap saved with existing projects.
- Render Current Conditions as an actual map layer at the inspected location, including the latest
  supported temperature and concise conditions/wind label. Layer visibility, opacity, and ordering
  now control real rendered map objects.

## Data and safety

- Current Conditions remains sourced from the normalized observation selected by the Weather
  gateway. Missing observations remain unavailable rather than being fabricated.
- Storm guidance, official alerts, reports, timestamps, quality, and provenance remain distinct.
- Community chaser location sharing remains explicit, signed-in, ephemeral, and off by default.

## Coordination

This release does not change payments, plans, pricing, entitlements, administrator permissions,
production infrastructure, or backups. Core mapping remains free. The previously prepared chaser
presence migration is included in source history; no new migration was created for the interface or
Current Conditions changes in this release.

## Verification

- TypeScript and ESLint pass with zero errors.
- All 38 Weather tests pass.
- The Cloudflare production-target build completes.
- The preview deployment serves the Weather and Storm Chaser workspace successfully.
- Production rollback remains forward-only through the preserved release tags.
