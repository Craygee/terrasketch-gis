# Weather database validation

This standalone test package runs actual PostgreSQL SQL and RLS in an ephemeral,
in-memory PGlite engine. It never reads `.env`, accepts a database URL, contacts
Supabase, or uses real accounts. It is not imported by the LandDraft application.

From this directory, with Node and pnpm on PATH:

```sh
pnpm --ignore-workspace install --frozen-lockfile --ignore-scripts
node --test governance.test.mjs
```

The pinned dependency and lockfile make installation reproducible. PGlite is
licensed under Apache-2.0 and the PostgreSQL License; see the
[official project](https://pglite.dev/docs/about). This is a development database
dependency, not a weather-data provider or production service.

## Checks

- Apply and reapply existing credential and new governance migrations.
- Confirm RLS is enabled and new providers/products default to disabled.
- Verify anonymous restrictions and per-user entitlement/audit reads.
- Reject user-written licenses, catalogs, entitlements and forged audits.
- Reject invalid license scopes, intervals, cache durations and product references.
- Verify cross-user credential reads, writes and deletes are blocked.
- Run the governance rollback and prove existing credentials survive.
- Reinstall governance tables after rollback.

Fixtures reproduce the relevant Supabase roles, `auth.uid()`, `auth.users`, and
`set_updated_at()` contracts. They do not reproduce Supabase Auth, PostgREST,
all installed extensions, default privileges, organization membership, or
concurrent network clients. Hosted integration remains a separate release gate.

## Hosted staging handoff

The adjacent admin workstream's product architecture identifies
`unuxnecqjvmtztxxqudb` as the designated test project. Production and recovery
must not be used for this validation. The current preview configuration has not
been verified as that test project. No hosted database password, SQL management
credential, or authorized test SQL session was available during this run.

1. Connect to the designated test project through an authorized SQL session.
2. Compare the existing schema and `set_updated_at()` function to the migration
   prerequisites. Coordinate the additive tables with the admin workstream.
3. Take a staging snapshot and apply the credential prerequisite if missing,
   then `202609130001_weather_provider_governance.sql`.
4. Re-run role checks with staging-only users through both SQL and PostgREST.
   Verify JWT identity, grants and RLS; test expired/revoked grants in the app.
5. In a disposable staging branch, export any test records, run the rollback,
   verify existing credential records remain, and reinstall. Do not drop
   populated governance tables on a shared project just to exercise rollback.
6. Record results before switching any runtime policy to database-backed reads.

## Provider connection configuration

Set `XWEATHER_CREDENTIAL_ENCRYPTION_KEY` as a server-only deployment secret,
using the existing key when sharing an existing credential database. Never
generate a replacement blindly: ciphertext encrypted with the old key would
become unreadable. For a new isolated credential store, generate a cryptographically
random secret of at least 32 bytes using the deployment secret-management flow.
Never use a `VITE_` prefix, commit the key, or paste it into a chat.

Keep `WEATHER_PROVIDER_POLICY` at the empty-grant example until the actual
provider agreement supports the specific product, connection mode, user scope,
display/proxy/derived uses and retention. No license approval is inferred from
an API key. After configuration, use Data Sources to test an authorized product
and verify disconnect/revocation using staging accounts.

Runtime policy remains server-owned configuration; these new tables are prepared
for a subsequent durable-policy integration. Passing this harness does not switch
the runtime policy source or enable any commercial product.

## Hosted validation completed

See `../../docs/WEATHER_STAGING_VALIDATION.md` for the September 13 hosted schema
application and test evidence. The earlier missing-SQL-access blocker was resolved
through the user's signed-in test-project dashboard. Staging app login and actual
commercial rights are still required for their respective tests.
