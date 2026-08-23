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

## Google and Apple sign-in

LandDraft discovers enabled Supabase social providers at runtime. A provider button appears only
after that provider is configured and enabled, so an incomplete setup never exposes a broken login
choice.

### Google

1. Create a **Web application** OAuth client in Google Auth Platform.
2. Use `https://landdraft.net` as an authorized JavaScript origin.
3. Register `https://txgbeskieqvvptgtjyou.supabase.co/auth/v1/callback` as the authorized redirect
   URI.
4. Store the Google client ID and client secret in **Supabase → Authentication → Sign In /
   Providers → Google**, then enable the provider.

### Apple

1. In an enrolled Apple Developer account, create an App ID with Sign in with Apple, a Services ID
   for the LandDraft website, and a Sign in with Apple key.
2. Configure the Services ID for domain `txgbeskieqvvptgtjyou.supabase.co` and return URL
   `https://txgbeskieqvvptgtjyou.supabase.co/auth/v1/callback`.
3. Generate the Apple OAuth client secret from the Services ID, Team ID, Key ID, and private `.p8`
   signing key. Store the secret only in Supabase; never add it or the `.p8` file to GitHub.
4. Enter the Services ID and generated client secret in **Supabase → Authentication → Sign In /
   Providers → Apple**, then enable the provider.
5. Rotate the Apple OAuth client secret before its six-month expiration.

## Security model

- Row-level security is enabled on every exposed table.
- New projects are created through a guarded database function that derives `owner_id` from the
  authenticated JWT and validates that the snapshot belongs to that same user and project. Direct
  browser inserts into the projects table are revoked.
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
