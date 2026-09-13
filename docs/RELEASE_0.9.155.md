# LandDraft 0.9.155 production release

Release date: 2026-09-12 (America/Chicago)  
Source branch: `main`  
Release tag: `landdraft-v0.9.155`  
Rollback tags: `landdraft-v0.9.154`, `landdraft-stable-2026-09-10`

## Scope

This follow-up release corrects production version detection on Lovable's shallow detached Git
checkout. A forward-only deployment commit named `Publish LandDraft X.Y.Z` now supplies the
authoritative release number and marks the deployed application as a release build. Source builds
on `main` continue to use the authoritative repository commit count.

No user data, project schema, provider, module behavior, permissions, billing, infrastructure or
backup behavior changes in this release.

## Verification

- TypeScript, ESLint, Weather tests and the production build must pass.
- The served production JavaScript must contain `0.9.155` without the `-test` channel marker.
- The public homepage, Weather route and Pipeline route must continue to load through their normal
  authentication boundary.
