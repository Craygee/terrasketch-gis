# Application and project versioning

Status: Merged
Owner branch: `main`
Core mapping impact: None; version information extends the existing project and backup workflows
Pricing: Undecided

## Capabilities

- Shows an automatic LandDraft application version in the desktop header, desktop Help & About
  panel, and mobile Help panel.
- Builds the version from the package major/minor line plus the Git commit count and short commit
  hash. Non-release branches are visibly marked `test`.
- Gives every existing and future project restore point a permanent `PV-YYYYMMDD-HHMMSSZ` label
  derived from its already-persisted save timestamp. The label is stable across devices and does
  not depend on its position in the 25-save list.
- Lets a user restore a saved project version or duplicate that version into a separate project.
  Duplication preserves the saved map state and navigation visibility while leaving the source
  project unchanged.
- Adds the application version and export timestamp to portable project backups and includes the
  project version label in the backup filename.
- Keeps the existing 25-restore-point retention behavior. This module does not create a new backup
  service, extend retention, or alter production backup infrastructure.

## Dependencies

- Vite compile-time constants generated from `package.json`, Git metadata, or the documented
  `VITE_LANDDRAFT_BUILD_NUMBER`, `VITE_LANDDRAFT_COMMIT_SHA`, and `VITE_LANDDRAFT_BRANCH`
  environment overrides.
- Existing project state blobs, `project_versions` timestamps, project creation flow, and private
  cloud/local project stores.
- Existing Help, mobile Help, Project Settings, and project backup interfaces.
- No new database table, column, function, policy, storage bucket, provider, secret, or API.

## Potential operating costs

- No new service or fixed operating cost.
- Project-version duplication uses the same database and private object-storage capacity as an
  ordinary duplicated project. Storage and bandwidth remain the only provider-controlled cost
  drivers.
- Version labels and build metadata have negligible bundle and storage overhead.

Pricing remains undecided. Core mapping and its existing save/restore capability remain free.

## Administration/billing coordination

- Shared frontend files touched: application build configuration, project state typing and store,
  Project Settings, desktop header, mobile Help, and project backup export.
- No payments, plans, entitlements, administration permissions, or billing contracts are changed.
- No database migration is required, avoiding schema or migration-order overlap.
- Release coordination on 2026-09-12 found no schema, entitlement, payment, permission or
  administrator-portal dependency. The versioning extension can ship independently while the
  existing free core-mapping contract remains unchanged.

## Security and privacy

- Version metadata contains only a source revision identifier, build channel, and timestamps. It
  contains no credentials or user data.
- Historical duplication continues through the authenticated project store and existing row-level
  security policies.
- A duplicated version becomes a normal independent project owned by the signed-in user; it does
  not modify the original project or bypass share permissions.
- Backup files continue to contain the user's project data and should be handled as private project
  records.

## Test plan

- Confirm the desktop header and Help panel show the same version, with `test` visible on the test
  branch.
- Confirm mobile Help shows the same version without crowding the mobile header.
- Confirm manual, autosave, and restored entries receive stable timestamp-based labels after refresh
  and login.
- Restore an older entry and verify the normal restore workflow still creates a new restore point.
- Duplicate an older entry and verify the copy opens as a separate project with the expected layers,
  style, map state, parent, and navigation visibility.
- Export a project backup and verify its filename includes the project version label and its JSON
  records the LandDraft version and export timestamp.
- Verify older projects without `landDraftVersion` load normally.
- Run TypeScript, changed-file lint, the production build, and a desktop/mobile interface check in
  the test environment.

## Release notes

- LandDraft now identifies every build and project restore point.
- Save history can restore an earlier version or create a separate project from it.
- Project backup filenames identify when they were created, and backup content identifies the
  LandDraft build that exported it.
- The application code can be rolled back to the preserved `landdraft-stable-2026-09-10` tag or any
  recorded Git revision without rewriting published history. An earlier release can be duplicated
  safely by creating a new branch from its tag/commit.
- No setup, connection, database, billing, entitlement, production-infrastructure, or backup-system
  change is required.
