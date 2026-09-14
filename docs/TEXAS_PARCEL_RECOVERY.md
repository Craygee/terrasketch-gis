# Texas parcel recovery and scheduled storage investigation

Checked September 14, 2026. No production configuration or project data changed.

## Confirmed failure

Catalog `tx-parcels` references the retired 2019 StratMap ArcGIS service under
`services1.arcgis.com/1mtXwieMId59thmg`. Its layer metadata returns error 499:
"Item does not exist or is inaccessible."

The primary current TxGIO service is
`https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0`.
Metadata is available, but bounded and single-object query requests returned error
400, "Requested operation is not supported by this service." Do not use metadata
success as proof this source can supply the existing vector layer.

TxDOT item `bfee1546d60b4a998ad37a8765941898` publishes 2025 Land Parcels at
`https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/2025_Land_Parcels/FeatureServer/328`.
Layer ID is 328, not 0. Single-object GeoJSON works. Small Austin-area spatial
queries timed out after 25 seconds. This is not yet a verified usable replacement.

## Publication and terms

Official program: https://gio.texas.gov/stratmap/land-parcels.html

TxGIO offers county/state shapefile and geodatabase downloads through DataHub.
Acquisition is generally annual, varying by county. A weekly check does not mean
the publisher creates weekly parcel records. Preserve county, tax year, acquisition
date, attribution, original source and retrieval time. Parcel boundaries are not surveys.

The TxDOT item publishes a spatial accuracy/completeness/currency disclaimer and
credits county appraisal districts/BIS Consultants. The older TxGIO item
`ac01f3669dde4e9ea67cee11f2771038` has no explicit licenseInfo and notes some county
data may be available only to government agencies. Before bulk caching or
redistribution, record the applicable collection/county download terms; public
access alone is not a blanket redistribution grant. Do not mirror restricted counties.

## Storage gap and proposed implementation

`RemoteLayerManager` refreshes visible remote layers in the browser, while
`project.ts` and `store.tsx` strip viewport data from saved projects. An actual saved
copy must not use that transient viewport path. No parcel ingestion scheduler exists.

Add an opt-in saved dataset with an explicit project-area/county/state scope,
provider terms record, immutable completed snapshots, atomic active-version pointer,
job status, last check, source edition, next check, manual refresh and disable controls.
Use server-side weekly checks; retain the last successful snapshot if refresh fails.
Never call a truncated download complete. Large county/state acquisitions need bounded
background ingestion and tiled display, not statewide GeoJSON in the browser.
Keep private project membership checks on subscriptions and stored assets. Public
source caches can be shared only where the source terms permit it.

Before releasing: verify real viewport queries on a replacement, migrate only known
retired URLs (preserve custom sources), test download completeness, interrupted refresh,
tenant access, scheduler retries, source age, and disabled subscriptions. Verify the
actual live deployment separately from the isolated test Worker.

## Project-area implementation (September 14)

The user selected project area. `ProjectAreaControl` now saves fixed WGS84 bounds
alongside the camera. Old areas require saving again; screen dimensions never silently
determine the download footprint. The first release caps each area at 5,000 parcels,
0.05 square degrees, and 12 MB of source JSON. Larger areas fail explicitly.

The TxDOT source works using **spatial object-ID lookup followed by ID batches**.
Live verification returned 26 parcels for the previously failing Austin viewport and
4 parcels for a San Antonio viewport. Ordinary spatial feature pagination remains
unreliable. `arcgis.ts` now uses the ID-first adapter for this exact source and maps
only the known retired 2019 URL to it; unrelated/custom URLs remain unchanged.

Layer settings now offer fixed-project-area download and weekly-check controls.
They remain unavailable until the server policy and scheduler are enabled. The new
additive migration creates RLS-protected project subscriptions, job leases and two
snapshot generations; no production database change has been applied. Only owners
can configure jobs, authorized project readers can load copies, and only the worker
can publish snapshots. Saved copies load as durable derived layers and check for
new server snapshots while the map is open. Server jobs do the weekly acquisition
even when the app is closed. Pause preserves existing data. The initial subscription
uses fixed bounds; changing its area requires an operator-managed removal/recreation.

Deployment prerequisites: validate collection-specific storage terms, apply and test
`202609140010_parcel_project_cache.sql` in staging, deploy `parcel-cache`, provision a
dedicated random scheduler secret in Edge Function secrets and Vault, install
`tools/parcel-cache-schedule.sql`, then enable `parcel_cache_policy` with a recorded
terms URL/review time. The policy remains false by default. Do not upload secrets to
source control or pretend a browser timer provides offline weekly refreshes.

Validation: four downloader tests and an isolated PostgreSQL integration test passed
(migration, owner-only configuration, cross-user denial, worker-only writes, leases,
failure preservation, and pause). Type checking, targeted lint and staging build pass.
Actual hosted scheduler, authenticated mobile workflow and live cache activation are
not yet verified. Rollback: disable policy and unschedule dispatcher; preserve cache
tables and last successful data. The live-query repair does not depend on the migration.
