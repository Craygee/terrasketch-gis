# Test/live reconciliation — September 14, 2026

Application source under `src/` was reconciled between the development checkout and the live release worktree. Included Weather authenticated transport/session-cookie recovery with one bounded gateway retry, statewide TxGIO parcel storage, Field-mode mobile spacing, and saved project bounds. Removed the obsolete project-area Supabase parcel-cache polling; its unapplied migration is not needed for statewide storage.

Live release: 0.9.162, source `25d82dea6b6da52d42a0a07a5abc947e9d2278a6`.
Test release: 0.9.207-test, source `9f7361c6`, Cloudflare Worker version `f37d7cb4-1e04-4a77-871c-d22fb86f0d39`.
Separate version counters do not indicate feature ordering across repositories.

Validation: five focused Weather/session and parcel tests passed; TypeScript in both checkouts passed; scoped lint passed; both builds passed. Test artifact scan verified isolated test database configuration and absence of secrets/production references. Public assets on test contain Weather session recovery, statewide parcels and Water. Both sites serve the corrected Field-mode CSS and reject unauthenticated module session creation with HTTP403.

Production Supabase functions and admin controls were preserved: the separate account-control workstream has already applied minimal guards against the actual deployed functions, which differ from old local copies. No database migrations, account grants, production credentials, or private data were copied between environments. Outstanding unrelated administrator changes were excluded.

Rollback through normal source reverts and prior hosting versions; never rewrite published history. This reconciliation is a release sync, not a claim that every item in the larger Weather/Water roadmaps is complete. Authenticated full-device workflow testing was not repeated for this transport/source synchronization.
