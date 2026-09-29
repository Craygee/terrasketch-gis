# LandDraft access controls — release checkpoint 2026-09-14

## Test deployed and active
- GIS test Worker: 82d7722d-f9fa-4e94-88a1-cff144469975.
- Admin test Worker: 21722d1e-ba06-4fdd-a158-4074fe9b7fa7.
- Supabase test: unuxnecqjvmtztxxqudb. All three access migrations installed, request guard registered, existing test signup hook connected to invitation/registration policy.
- Activation preserved one existing user, three projects, and all three module grants. Public registration remains closed; explicit invitations enabled. Dev remains protected.
- Actual remote SQL transaction tested invitation module isolation, complimentary revoke, continued mapping access, lockout, owner protection and lockdown. Fixture changes were rolled back; no test accounts left behind.
- Deployed protected API/server endpoints return 403 without authentication; home page returns 200.
- Local SQL policy tests, three request-boundary tests, 31 admin tests, TypeScript and builds passed.
- Share panel prepares copyable invitation text. It does not send email automatically.
- User previously verified the authenticated test portal on iPad. An asynchronous request now asks them to refresh and confirm the newly activated controls appear. Cloud-computer passkey is unavailable; do not repeat that login request.

## Live remains unchanged
Read-only baseline: three production users, nine projects, one verified dev owner, zero public buckets. No landdraft_control schema exists there yet. Production backup workflow last completed successfully at 2026-09-13T06:32:38Z (run 34743005287).

Before live activation:
1. Confirm authenticated test portal mutation UI with the owner on iPad. The remote database mutation checks are complete.
2. Install inactive production schema and reviewed read-only backup views. Enable the opt-in seven-table encrypted backup extension, capture and verify recovery before activating new policy.
3. Coordinate production GIS and service-role Edge Function releases. Test currently has no Edge Functions. Edited GIS assistant, sharing and inbound-email guards are not deployed to production.
4. Activate once, grandfathering every existing user into all three modules. Verify production user/project counts and owner access afterward. No payments are enabled.

## Future module deployments
Test database controls are active. Keep VITE_LANDDRAFT_ACCESS_ENFORCEMENT=true during builds. The weather test deployment helper now rejects an omitted flag, and the local staging environment includes it. Preserve the shared auth/server gates. Do not deploy an older build that omits them.

## Remaining limits
- SQL audit currently returns recent 100 events, not a full paginated historical export.
- A user can retain already downloaded data. Account lockout prevents new authorized operations; it cannot recall old downloads.
- Production backup extension source is prepared and locally tested, not pushed or enabled.
- No production schema, account, project, file, or access setting changed during this test activation.
