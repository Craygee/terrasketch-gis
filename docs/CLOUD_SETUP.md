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

## LandDraft AI and live web research

The browser never receives an AI provider key. LandDraft sends an authenticated, size-limited map
summary to the `gis-assistant` Supabase Edge Function. That function verifies the signed-in user and
then uses the OpenAI Responses API for product guidance, current-project questions, supported map
actions, and live web research. Named place searches use current OpenStreetMap/Nominatim/Overpass
records and return a reviewable Working-layer draft.

1. Create a restricted OpenAI API project/key for LandDraft and set a monthly usage budget/alert.
2. Add `OPENAI_API_KEY` to **Supabase → Edge Functions → Secrets**. Optionally set `OPENAI_MODEL`;
   the function defaults to `gpt-5-mini`.
3. Deploy `supabase/functions/gis-assistant`. Keep gateway JWT verification enabled, as configured
   in `supabase/config.toml`. The function also validates the current user token against the
   project's Auth service before processing any request.
4. Test a help question, a current-project question, an attribute selection, and a live place query
   such as “Show me all libraries in Midland, Texas.” Verify the returned source links and inspect
   imported public records before relying on them.
5. Never put `OPENAI_API_KEY` in `.env`, `.env.example`, GitHub, Lovable browser variables, or client
   code. Rotate the key immediately if it is ever exposed.

## Production email intake and SMTP

LandDraft uses Resend for the first production email integration because one verified provider can
handle both inbound project records and Supabase Auth SMTP while Name.com continues to host DNS.
Inbound mail uses the isolated `inbound.landdraft.net` subdomain so it cannot replace or interfere
with a future normal mailbox on `@landdraft.net`.

### Repository foundation

- Run `supabase/migrations/202609040001_project_email_intake.sql` in the production project. It
  creates opaque account/project aliases, inbound email and attachment metadata, owner-only RLS,
  idempotent provider IDs, and guarded assignment/import functions.
- Deploy `supabase/functions/resend-inbound`. This endpoint deliberately disables Supabase JWT
  verification because Resend is the caller; the function instead verifies the raw request with
  the Resend/Svix signing secret before doing any work.
- Set `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` only in Supabase Edge Function secrets. Never add
  either value to GitHub, Lovable, browser variables, or `.env.example`.
- Set the deployment's public `VITE_INBOUND_EMAIL_DOMAIN` to `inbound.landdraft.net` only after the
  domain, MX record, webhook, migration, and function have all passed an end-to-end test.

### Provider and DNS steps

1. Create the LandDraft Resend account and a restricted API key.
2. Add and verify a sending subdomain such as `notify.landdraft.net`; copy Resend's exact DKIM,
   SPF/return-path, and optional DMARC records into Name.com DNS.
3. Add `inbound.landdraft.net` as the receiving domain. Copy the exact MX host, value, and priority
   shown by Resend into Name.com. Do not put the receiving MX record on the root domain.
4. Deploy the Edge Function at
   `https://txgbeskieqvvptgtjyou.supabase.co/functions/v1/resend-inbound` and add that endpoint as a
   Resend webhook subscribed to `email.received`.
5. Copy the webhook signing secret and API key into Supabase Edge Function secrets, then send a test
   email to a generated project alias. Confirm the message and attachments appear in Project
   records → Email and can be added to the project.
6. In Supabase Authentication → Email → SMTP Settings, use host `smtp.resend.com`, port `465`,
   username `resend`, the Resend API key as the password, and a verified LandDraft sender such as
   `LandDraft <accounts@notify.landdraft.net>`.
7. Test signup confirmation, password reset, Google sign-in return, share invitation delivery, one
   project-specific intake address, the account inbox, duplicate webhook delivery, an invalid
   signature, and an attachment near the 50 MB per-file limit.

### Intake security and retention defaults

- Intake aliases contain 120 bits of randomness and do not expose a project UUID or user email.
- Provider events are unique by provider email ID, so webhook retries cannot create duplicates.
- The signed webhook is the only unauthenticated entry point. Database tables remain owner-only in
  the browser, and the provider/Supabase secret keys never reach client code.
- Each attachment is limited to 50 MB and the stored original plus extracted attachments are
  limited to 75 MB per message. Over-limit files are recorded as skipped instead of accepted
  silently.
- HTML is archived privately but never rendered in the LandDraft interface; the UI shows plain text
  to avoid untrusted email scripts and tracking content.
- Resend is transport/retry storage, not the LandDraft archive. The function copies accepted mail
  into private Supabase Storage; normal project/account deletion remains the authoritative removal
  path. Establish a written customer retention period before public onboarding.
