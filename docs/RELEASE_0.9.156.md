# LandDraft 0.9.156 production release

Release date: 2026-09-12 (America/Chicago)  
Source branch: `main`  
Release tag: `landdraft-v0.9.156`  
Rollback tags: `landdraft-v0.9.155`, `landdraft-v0.9.154`, `landdraft-stable-2026-09-10`

## Scope

- Promote the authenticated Xweather Raster Maps transport verified on the isolated public preview.
- Keep each user's Xweather credentials server-side and out of browser-visible tile URLs.
- Correct the obsolete Xweather product identifiers for one-hour precipitation and snow depth.
- Surface provider authorization, product availability and usage-limit errors in the Weather layer
  panel instead of leaving a connected layer silently blank.
- Verify that a stored Xweather connection can still be decrypted before reporting it as connected.

This release does not change projects, permissions, billing, entitlements, administration,
production infrastructure, backups or core mapping behavior.

## Verification

- The same signed-in LandDraft/Xweather account loaded authenticated Xweather layers on the public
  preview before production promotion.
- TypeScript, ESLint, all focused Weather tests and the production build must pass before publishing.
- The production Weather workspace must load through the normal authentication boundary and report
  application version `0.9.156` without a test-channel marker.
- Rollback remains forward-only by publishing a new commit from a preserved release tag; published
  Git history must not be rewritten.
