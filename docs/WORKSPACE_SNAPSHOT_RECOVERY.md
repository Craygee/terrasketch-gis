# Cloud workspace snapshot recovery

2026-09-13: Main LandDraft displayed “Cloud workspace could not open / Object not found.” The project metadata existed but its referenced private-storage snapshot did not. This was reproduced in the authenticated local staging workspace; an intact earlier snapshot from 17:09:56 could be read and opened with the recovery notice. No cloud snapshot pointer was changed and no recovered project was saved over the original.

The client also had unsafe snapshot garbage collection: after saving, it listed stored objects and deleted anything not in a previously fetched version list. A concurrent save can upload a new object before its database transaction records the reference; an older cleanup can then delete that live upload. Shared references and concurrent version changes are additional hazards. The missing object's deletion history was not audited, so this race is a confirmed code defect, not a proven account-specific incident cause.

Fix:

- Remove browser-triggered snapshot garbage collection from save. Explicit user-requested project deletion remains unchanged. Future retention needs server-side reference checks, a grace period and safe coordination with uploads/shares.
- On missing-object errors only, try the newest intact retained version. Do not fall back for authentication, permissions, network or server errors.
- Recover in memory with autosave paused and a visible notice. Do not update database snapshot references on read. Create/save operations require their just-uploaded snapshot and do not silently substitute an old one.
- If all snapshots are missing, preserve metadata and expose another-project/new-workspace options in desktop and mobile startup screens. Do not fabricate an empty replacement for the existing project.

Validation: nine recovery unit/integration tests pass, including the actual project loader and save path with controlled storage responses. Typecheck passes and targeted lint has no errors (one pre-existing store fast-refresh warning). Authenticated local main-workspace startup reproduced a missing current snapshot and successfully opened an older version without writes. Water regression tests pass. No schema migration or credential change is required.

Limitations: this cannot recreate deleted file content. Recovery is limited to available retained versions; completely missing projects require restoring storage backups. iPad users should reload after publication and review any recovery notice before explicitly saving the recovered content.

Published to the existing test site on 2026-09-13: application `fec2c29411c56d9d90c4d2dddf8167e2113939b9`, Worker version `1eb013ce-714b-41bc-9373-5b6c1c93c308`. Hosted authenticated `/` opens the map with the recovery notice instead of the startup error. Verified at 1024×768 with the map present and no horizontal page overflow. Recovery plus Water tests: 22 passed. Staging build and artifact-isolation/secret scan passed. No production deployment or cloud snapshot-pointer repair was performed.
