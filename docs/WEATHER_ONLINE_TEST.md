# Online Weather test deployment

Target: https://landdraft-test.tight-sky-0ae1.workers.dev/weather

This is an isolated test release of the implemented Weather foundation, Photography baseline repair and public SPC outlooks. It is not completion of the full Weather/Storm Chasing roadmap. Production and recovery were not deployed or migrated.

## Deployment boundary

- Worker: `landdraft-test`, account `af489b2ad3227fd7aaafd91556d7893f`.
- Database: test `unuxnecqjvmtztxxqudb` only. Existing dev@glab.co test identity successfully authenticated through Google on the hosted URL.
- Source branch: `codex/landdraft-test`; local commits preserve published history. No push to production.
- Existing free Cloudflare plan retained. An initial custom CPU limit was rejected by Cloudflare and removed; no plan upgrade requested.
- No commercial grants or provider credentials enabled. Encryption-secret upload was rejected by automatic approval review pending explicit authorization to transfer that existing test secret to this Worker. The successful deployment omitted all secrets. Online Xweather credential management therefore remains server-not-configured.
- Release identity: `/weather-test-release.json`; test responses carry `X-Robots-Tag: noindex, nofollow`.
- Preflight scans browser artifacts for the test database reference, forbidden production/recovery references and the local encryption key. Private server key is not in public assets.

## Checks

- 68 Weather unit/contract tests, nine isolated PostgreSQL migration/RLS/rollback checks and seven hosted anonymous PostgREST checks passed.
- All 15 public SPC endpoints passed the opt-in live contract check.
- Type checking, full repository lint (zero errors; existing warnings remain), production-format test build and Wrangler dry run passed. Local `.release` archives are excluded from lint rather than reformatted.
- Hosted Weather returned HTTP 200, Google sign-in completed, the existing test workspace opened with no startup login popup, and radar/SPC loaded from the deployed server.
- Hosted inspector showed actual SPC issue/valid/retrieval times and explicit below-threshold statements.
- Browser verification caught two pre-existing NWS observation errors: null measurements became zero and km/h wind values were interpreted as m/s. The follow-up fix rejects missing/unknown units and explicitly normalizes wind/gust units. Regression tests added before redeployment.

## Reproduction and rollback

Build with the ignored test-only environment, then run `scripts/prepare-weather-test.mjs`. It requires the test branch, exact test database and zero commercial grants. Deploy using the generated `.output/server/wrangler.json` **without** `--secrets-file` until secret transfer is explicitly approved.

Pre-upgrade rollback Worker version: `14e06e7b-97e4-423a-9763-eebd896b9848` (September 10). First online Weather version: `798072df-9807-424b-96da-9d4e19f0617e`. Rollback must target `landdraft-test` only. Current installed version should be verified with Wrangler deployments list; changing Worker code does not reverse database migrations. The additive Weather schema remains compatible with the earlier build.

Manual QA: open Weather, inspect source cards, toggle optional layers, enable a verified SPC product, scrub backward and return live, inspect Data Sources, resize portrait/landscape. Missing provider data must remain unavailable, never all-clear. Do not enter vendor credentials or treat Photography candidates as validated safe-observation recommendations.

Remaining: expert validation, professional Level II processing, full synchronized historical hazards, observation opportunity heat map, DEM/road evidence and hazard routing, mesoscale discussions and further public feeds, durable provider metering/auditing, licensed BYOK activation, comprehensive browser automation/load testing. The online test deployment does not establish production readiness for these features.
