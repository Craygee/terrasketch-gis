# LandDraft cloud setup

LandDraft uses a managed PostgreSQL project for cross-device accounts and maps. Authentication,
row-level security, project metadata, compressed map snapshots, restore history, private file
storage, and PostGIS live in one
service. Passwords are handled by the authentication service and are never stored by LandDraft.

## Recommended plan

- Use the free plan for private development and beta testing.
- Upgrade to the $25/month Pro plan before depending on the app for uninterrupted production use.
  Free projects may pause after inactivity and do not include the same backup guarantees.
- Enable a spend cap and budget alerts before launch.

## Provisioning

1. Create a Supabase project in the closest practical US region.
2. Open **SQL Editor**, paste
   `supabase/migrations/202608220001_cloud_workspace.sql`, and run it once.
3. In **Authentication → URL Configuration**, set the Site URL to the production LandDraft URL and
   add the preview and local development URLs as allowed redirects.
4. Keep email confirmation enabled. Configure a custom SMTP provider before a public launch so
   confirmation and reset emails have reliable delivery.
5. Copy the project URL and publishable browser key from **Project Settings → API**. Do not use or
   expose the secret/service-role key.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the deployment environment. Use
   `.env.local` for local development; it is ignored by Git.
7. Rebuild and deploy. The sign-in screen will say that projects sync securely across devices.

## Security model

- Row-level security is enabled on every exposed table.
- Users can create, update, and delete only projects they own. Explicit project memberships provide
  the foundation for read-only or editor sharing.
- The private `project-assets` bucket restricts every path to the signed-in user's UUID.
- Map snapshots are content-addressed, gzip-compressed files. PostgreSQL stores only small project
  metadata and private object paths, keeping large imported GIS layers out of the costlier database
  quota. Older snapshots download only when the user restores one.
- The browser receives only the publishable key. The database enforces authorization using the
  signed-in user's short-lived token; no administrator key belongs in frontend code or GitHub.
- Project restore history is trimmed transactionally to the latest 25 snapshots.
- Existing device projects are copied once after the matching email address signs into the cloud
  account. The local copy is preserved as a recovery source during migration.

## Verification checklist

1. Create an account, confirm its email, and create a map.
2. Sign in from a private window or second device and confirm the project and history appear.
3. Verify a second account cannot read or modify the first account's project through the REST API.
4. Test password recovery and confirmation redirects on production and preview URLs.
5. Check database size, egress, authentication usage, and backup status monthly.
