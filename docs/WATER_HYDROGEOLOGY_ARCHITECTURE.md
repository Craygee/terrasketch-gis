# Water & Hydrogeology implementation record

Discovery and design: 2026-09-13. Status: incremental foundation; not a completed hydrogeology platform.

## Existing architecture and reuse

React/TypeScript, TanStack Start server functions, MapLibre, Turf, Vite/Nitro on Cloudflare; existing Supabase authentication and project access. `/weather` and `/pipeline` establish optional workspace routes. Reuse `AuthGate`, `WorkbenchProvider`, `MapRefProvider`, `MapCanvas`, `FeatureDestinationDialog`, drawing/imported project polygons, layer styling, selection and project persistence. `PrintComposer` handles cartographic figures. Existing project JSON accommodates an optional versioned Water workspace without a database migration. Do not create a second user, organization, geometry or GIS subsystem.

Pipeline's elevation service currently interpolates manually supplied elevations; it is not an operational DEM provider. Weather's precipitation context is not a recharge model. Reuse future shared terrain and weather services through interfaces, without presenting either as available hydrogeologic analysis today.

## Source and terms review

Only source-owned data reviewed below may be automatically queried. Provider availability does not imply evidence completeness, rights, production capacity or physical water availability.

| Source | Verified access / terms | Initial scope |
| --- | --- | --- |
| USGS Water Data | [OGC documentation](https://api.waterdata.usgs.gov/docs/ogcapi); live v0 responses redirect to v1. [USGS-produced data public domain; credit requested](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits). Exclude third-party copyrighted material. | Monitoring locations, source well depth, aquifer codes, coordinate quality and datum; time-series adapters separately verified. |
| TWDB GWDB | [Published agency services](https://www.twdb.texas.gov/mapping/data-services.asp); HTTPS FeatureServer verified. [Copyright policy permits copying/distribution with acknowledgment requested](https://www.twdb.texas.gov/policies/site/index.asp#copyright). | Selected well/spring records and source aquifer assignments. The spatial service flags quality/level availability; it does not contain the actual chemistry or level history. |
| NGWMN / Principal Aquifers / Ground Water Atlas | USGS discovery candidates; endpoint and dataset-specific validation still required. | Source-library links; no fictitious loaded layer. |
| TWDB SDR / BRACS / GAM / GMA / DFC / districts | Agency discovery candidates, separately version and review each dataset. | Original-source links initially; distinguish regulatory screening from hydrology. |
| 3DHP / 3DEP / SSURGO / EPA / BOR / USACE / NOAA / FEMA / NASA | Candidate adapters, not implicit blanket rights to all hosted third-party datasets. | Disabled until endpoint, units, attribution and relevant coverage verified. |

USGS live response confirms WGS84 coordinates while retaining original horizontal datum, coordinate method/accuracy, vertical datum, county and HUC. Well constructed depth is feet below land surface. TWDB fields include StateWellNumber, WellType, WellDepth, AquiferCodeName, CountyName, WaterQualityAvailable and WaterLevelObservationType; transfer limit is 1,000. Neither record count nor a quality-available flag demonstrates current potable water.

## Professional workflow research

These are workflow references, not code/UI sources or dependencies:

- [MODFLOW / ModelMuse](https://www.usgs.gov/software/modelmuse-a-graphical-user-interface-groundwater-models): separate model construction, inputs and calculated outputs; retain model versions.
- [Groundwater Vistas](https://groundwatermodels.com/Groundwater_Vistas.php): explicit numerical-model workflow and inspection.
- [Visual MODFLOW Flex / Hydro GeoAnalyst](https://www.waterloohydrogeologic.com/support/software-faq/): separate data management from simulation.
- [Leapfrog Works](https://help.seequent.com/Works/2026.1/en-GB/Content/flow-models/flow-models.htm): geological framework and flow-model linkage.
- [RockWorks](https://www.rockware.com/rockworks-borehole-manager/): retain borehole intervals and original logs alongside sections.
- [AQTESOLV](https://www.aqtesolv.com/versions.htm): aquifer-test solutions require hydraulic assumptions and appropriate test data.
- [Surfer cross validation](https://surferhelp.goldensoftware.com/griddata/grid_data_cross_validation.htm): evaluate interpolation error, not just appearance.
- [ArcGIS groundwater tools](https://pro.arcgis.com/en/pro-app/3.5/tool-reference/spatial-analyst/an-overview-of-the-groundwater-tools.htm) and [QGIS interpolation](https://docs.qgis.org/4.2/en/docs/gentle_gis_introduction/spatial_analysis_interpolation.html): heads, hydraulic inputs and sample distribution matter. Well depth is not hydraulic head.
- [TWDB Water Data Interactive](https://www.twdb.texas.gov/mapping/index.asp): agency records remain inspectable through original links.

Architecture consequence: evidence first, interpretation second, modeling last. No automated 3D volume, flow arrows, salinity interpolation or sustainable yield without defensible source inputs.

## Adapter and normalized schema

`WaterSource`: ID, agency, jurisdiction, resource type, homepage, endpoint, access method, terms, license state, attribution, permitted export/cache, refresh cadence, review date, quality tier, health. Adapter methods: metadata, search/fetchFeatures(area), normalize, healthCheck; optional time-series/documents methods exposed only when implemented. Arbitrary client URLs are never fetched.

All evidence: source ID and record ID, source URL, retrieval time, observation/valid time (nullable), classification OBSERVED/DERIVED/INTERPOLATED/MODELED/INFERRED, original values/units, normalized values/units, quality flags, coordinate accuracy, horizontal/vertical datum and method version. Source-reported observed records are explicitly marked reported; no assumption of independent verification.

Planned relational entities: WaterStudyArea, WaterSource, Aquifer, HydrogeologicUnit, Well, WellConstruction, WellScreen, WellLog, LithologyInterval, GeophysicalLog, WaterLevelMeasurement, PumpTest, WaterQualitySample, WaterQualityResult, Spring, SurfaceWaterFeature, StreamGauge, WastewaterFacility, RechargeDataset, GroundwaterModel, GroundwaterModelLayer, RegulatoryArea, WaterRight, InterpolatedSurface, WaterAnalysis, WaterReport, WaterScenario and ProposedWell. Evidence references are immutable; aliases and conflicts retain original terms. Samples retain qualifier/detection limit, sample depth, date and laboratory. Model outputs never overwrite observed records.

Initial persistence: optional `waterWorkspace` in the existing project payload; source features use existing layers. No new credentials, private index or global precise-location cache. Later relational migration requires project/organization access policies matching the central account architecture, geometry indexes, time indexes and retention. Do not fabricate organization grants or paid tiers. Planned capability contract: module, tier Basic/Professional/Advanced, organization, role, region and source entitlements. Initial enable/disable is a project preference, explicitly not billing authorization.

## Flow and UI

Study geometry → bounded server adapter requests → normalization and polygon filtering → independent source status → existing map layers → evidence cards and tables → provenance snapshot/export.

Desktop uses map with compact left tools and evidence panel. Tablet/mobile uses a collapsible, height-limited panel retaining map space and touch targets. Begin with Overview, Wells/records and Sources; advanced tabs become operational only with a real workflow. Show all possible layers reveals precise unmet requirements. Analysis failures, truncation and missing measurements are visible. Data age distinguishes retrieval time from unknown measurement time.

## Phases, acceptance and rollback

1. Foundation: `/water`, `components/water`, `lib/water`, optional project state and navigation. No database migration or new dependency. Acceptance: selected polygon/current extent queried; USGS/TWDB responses survive independent failures; records map to source cards; report/snapshot retains geometry and provenance; missing dates/units remain unknown. Remaining Phase 1 products (aquifer polygons, NGWMN, measured levels/quality) require dedicated verified adapters, not well-dot substitutes.
2. Analytics: separate aquifer/date/datum cohorts; distributions, yield distinctions, validation-gated surfaces, trends and cross sections. Require data-density/edge/extrapolation tests and professional methodology review.
3. Advanced: BRACS/logs, aquifer surfaces, terrain integration, 3D, recharge and storage with explicit assumptions; asynchronous worker infrastructure first.
4. Research: indexed discovery, document extraction with page references, source triage, district/model discovery and private-project isolation. No auto-ingestion of unreviewed URLs or private records into public indexes.
5. Decision support: scenarios, field plans, use/treatment thresholds, opportunity dimensions, comparison and professional reporting. Regulatory conclusions remain screening.
6. Models: versioned MODFLOW imports, model grids/heads/budgets and backend runs; no unsupported authoritative model generation.

Rollback: remove Water navigation or disable its route/server capability, retain additive project field so saved work survives rollback. No changes to Weather/Pipeline science or production provider licenses. Every phase must pass relevant unit/contract/integration and responsive browser checks before promotion.

## Tests and risks

Test Texas data-rich region, non-Texas US region and data-poor area; polygon holes and multipolygons; wrong coordinates, excessive area, malformed response, rate limit/outage, transfer limit, duplicate IDs, unknown units/dates/datums, and null not zero. Confirm stale asynchronous replies cannot replace a newer study. Export provenance and formula-injection safeguards; read-only project actions must remain read-only.

Targets for initial bounded queries: max 1,000 source records per request, finite timeout, no national bulk download, independent provider failure, visible progress. Wider areas require subdivision/background infrastructure. No claims of complete coverage from limited pages. Source response/timeout/error statuses are surfaced without logging private geometry or credentials.

Release risks: legacy datum mismatches; sparse/time-inconsistent evidence; source changes; selected GWDB records not exhaustive; uncatalogued private/municipal rights; no dedicated heavy-job queue; centralized paid-module grants not yet integrated. Advanced predictions remain unavailable until these dependencies and expert validation are satisfied.

## Implemented foundation preview

`/water` reuses the existing authenticated map and project store. Project enable/disable, current-extent and drawn/imported polygon/multipolygon boundaries, bounded sequential source requests with progressive results, searchable evidence cards, layer visibility/opacity, source registry and optional-source requirements are implemented. Existing SHP ZIP/KML/KMZ/GeoJSON importer and cartographic PDF composer are reused. JSON analysis snapshots, CSV and Markdown evidence reports preserve source references. No new database migration or dependency was required.

Additional verified adapters: USGS `latest-continuous` (original numeric strings, source units, timestamps, approval and qualifiers) and the existing LandDraft Texas-major-aquifer FeatureServer entry, which credits TWDB. Aquifer polygons are published interpretations, simplified for display; they do not establish subsurface geometry. An actual latest-continuous response contained a 2015 observation, validating the need for explicit historical status. Parameter definitions use `/parameter-codes/items/{code}`; the list endpoint ignored the initially tested `parameter_code` filter, so it is not used for definition links.

Source-owned public data only. TWDB owner names are not requested. Server verifies the existing Supabase session before analysis, caps each authenticated user at 12 source requests/minute per runtime and caps concurrent source queries at six. `VITE_WATER_MODULE_DISABLED=true` is a build-time server kill switch; each source also has an enforced registry `enabled`/license gate. Distributed rate limiting, central subscription/organization grants and persistent queues remain future infrastructure. No provider secrets, API key purchase or private-data registry was introduced.

Validation performed: typecheck, targeted lint, build, synthetic Water contracts and existing Weather tests; live San Antonio, Phoenix and sparse West Texas source checks. San Antonio returned 78 USGS locations, 81 GWDB records, nine sensor readings and two aquifer polygons. Phoenix returned 46 eligible locations with rejected source/geometry records flagged as degraded, one reading and Texas sources outside coverage. All four sources returned no evidence in the small sparse cell. Counts are test-time observations, not guaranteed coverage.

Authenticated browser workflow: enable, extent selection, analysis, record inspection and Save exercised. A Central Texas study returned three aquifer polygons, three sensor readings, four monitoring locations and 50 GWDB records. Layout geometry checked at 390×844, 1024×768 and 844×390 with no horizontal page overflow; mobile portrait kept the panel within 52% of map height. These are browser fit checks, not a full visual-regression/accessibility certification.

### Outstanding Phase 1 work

NGWMN ingestion, national aquifer polygons, complete lab chemistry and dated level histories, surface-water network geometries/HUC selection, county selection, project-boundary aggregation UX, full report builder and centralized account-module grants remain incomplete. The optional-source catalog labels those dependencies honestly. Later interpolation, recharge, 3D, drilling favorability, Deep Research and MODFLOW are not enabled. This preview must not be described as the full Phase 1 or six-phase module completed.

### Manual QA / release checks

1. Open `/water` while signed in. Enable for an editable test project. Zoom to a small region or import a boundary. Run Analyze Water.
2. Inspect each source status; compare records and parameter definitions with originals. Inspect a historical/provisional reading and a TWDB quality-available flag.
3. Toggle source layers, inspect aquifer classifications, change area and confirm old results hide. Try oversized/self-intersecting boundaries.
4. Save, reopen the project and check the snapshot; export CSV/JSON/Markdown and compose a map figure. Verify sources and measured/retrieval dates remain present.
5. Test read-only access, expired session, source 429/timeout, rate limits, module kill switch, offline use and mobile keyboard/orientation. Some of these require broader end-to-end automation before promotion.
