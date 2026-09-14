# LandDraft 0.9.158 production release

Release date: 2026-09-14 (UTC)
Source branch: `main`
Release tag: `landdraft-v0.9.158`
Rollback tags: `landdraft-v0.9.157`, `landdraft-v0.9.156`, `landdraft-stable-2026-09-10`

## Scope

- Promote the public NOAA/NWS Weather layer foundation tested on the isolated LandDraft site,
  including native NEXRAD Level III products, rainfall periods, SPC outlooks, original ProbSevere
  objects, warnings, satellite, wind and other retained public layers.
- Add the LandDraft Predictive Model and the versioned storm intensity, hazard intensity, trend,
  confidence, source freshness, explainability and history analysis while keeping official hazard
  probabilities separate from LandDraft-derived intensity.
- Select native radar sites from the selected storm, navigation target, device location, inspection
  point or map center. Support automatic all-covering composites and manually selected multiple
  radar sites.
- Keep the established Weather categories and add the shared LandDraft Tools category without
  allowing asynchronous data refreshes to reset the user's selected category.
- Update map legends from all visible Weather data and show exact intensity-color dots in the storm
  object scale.
- Repair Weather layer loading, native radar rendering across basemap changes, public rainfall
  duration controls, original ProbSevere display, mobile layer status, workspace recovery and the
  photography/observation opportunity analysis.
- Add the tested Water evidence-research workspace without changing core mapping access.

## Data, licensing and safety

- The production Weather catalog enables reviewed public and attribution-required sources. No
  commercial provider grant or shared third-party account is added by this release.
- Xweather sign-in and its catalog UI are removed from this release. Restricted community feeds
  remain unavailable; the production-safe, explicit LandDraft chaser-presence capability is kept.
- Official NOAA/NWS/NSSL products retain their source labels. LandDraft intensity, trend,
  confidence, projected motion and viewing analysis remain clearly identified as derived guidance,
  never official warnings or guarantees of safety.
- Missing, partial, degraded and stale values remain distinct from zero. Stale data is never treated
  as weakening.

## Compatibility and operations

- Existing GIS, Pipeline, project, import/export, drawing, measurement, sharing, warning,
  Storm Chaser, meteorology, photography, routing and responsive controls remain in the merged
  application.
- The provider-governance migration is included for future coordinated rollout. This release does
  not apply a production database migration and does not change payments, plans, entitlements,
  administrator permissions, production infrastructure or backups.
- Public upstream radar and weather endpoints can throttle or become unavailable. The current
  bounded in-memory cache is suitable for the present release traffic; managed ingestion, durable
  cache, monitoring and measured request budgets remain recommended before higher-volume use.

## Verification

- The complete Weather test suite passes with 127 tests, including layer preservation, missing-data
  semantics, stale-versus-weakening separation, probability-versus-intensity separation, radar site
  selection, multiple-site rendering, storm analysis, photography and provider policy.
- TypeScript, repository ESLint with zero errors, and the production client/SSR/Cloudflare build
  pass. Existing Fast Refresh warnings remain warnings.
- The isolated hosted test served revision `d751b9ae04b3d375875511567fd3bfa06be70d67`.
  Native radar, public layers, storm objects, category persistence, responsive layer status and
  photography scoring were checked against that release.
- Production rollback remains forward-only through the preserved release tags.
