# Pipeline Engineering & Estimating architecture

Status: Approved implementation direction for the test branch  
Owner branch: `feature/test-module-development`  
Related research: [PIPELINE_ENGINEERING_RESEARCH.md](./PIPELINE_ENGINEERING_RESEARCH.md)

## Purpose

Pipeline Engineering & Estimating is an optional LandDraft workspace that connects route
geography, an engineering network, constructability, quantities, immutable price evidence, an
estimate, and a bid package. It extends the existing project; it does not fork or duplicate the
base GIS project and does not put core mapping behind an entitlement.

The workspace is for feasibility and preliminary engineering until the selected solver, data,
materials, design criteria and review process have passed a separate validation gate. The first
native liquid solver is explicitly `preliminary-unvalidated`.

## Product boundaries

### In scope

- Convert or link LandDraft line features to engineering routes.
- Keep route vertices, stationing, equipment, terrain, crossings, construction ranges, quantities
  and costs synchronized by immutable IDs and revision hashes.
- Provide alternate route and engineering scenarios without destroying the baseline.
- Run capability-aware solver adapters.
- Visualize the route, engineering profile, warnings, quantities and cost changes together.
- Preserve sources, assumptions, confidence and exact snapshots through reports/bids.

### Out of scope until separately validated

- Construction-ready or professionally sealed design.
- Automatic code-compliance certification.
- Survey-grade elevations, subsurface utility locating, confirmed rock/geotechnical conditions or
  jurisdictional wetland determinations.
- Native transient surge, transient gas, compositional flow-assurance or multiphase parity with
  specialist commercial products.
- Fabricated vendor quotes, availability or lead times.
- Pricing/entitlement decisions, payment changes, production infrastructure and backup changes.

## Workspace composition

Desktop uses four coordinated regions:

- **Left:** model tree, alternatives and component palette.
- **Center:** the existing LandDraft MapLibre map and GIS layers.
- **Right:** selected route/component properties, design criteria, warnings, materials and costs.
- **Bottom, collapsible:** synchronized terrain/hydraulic profile.
- **Top:** Fluid, Scenario, Live Solve, Analyze, Optimize, Costs, Vendors, Estimate and Bid.

Tablet/mobile uses one map surface with drawers or bottom sheets. It must never attempt to show
the tree, properties and profile at the same time. A compact mode switch selects Map, Model,
Profile, Results or Costs.

The module entry is deliberately placed inside an existing compact menu. After activation the
specialized top actions belong to the workspace, not the normal LandDraft toolbar.

## Canonical aggregate

`PipelineProjectModel` is the aggregate root and holds a schema version plus a link to the normal
LandDraft project.

```text
PipelineProjectModel
├── landdraftProjectId
├── routes[]
│   ├── sourceLayerId + sourceFeatureId
│   ├── geometryRevision + coordinateReference
│   ├── nodes[] + segments[] + branches[]
│   ├── elevationSamples[]
│   ├── crossings[]
│   └── constructionRanges[]
├── fluids[]
├── pipeSpecifications[]
├── components[]
├── scenarios[]
├── solverRuns[]
├── quantitySnapshots[]
├── vendorLibrary[] + priceSnapshots[]
├── estimateRevisions[]
└── bidRevisions[]
```

Every record carries stable `id`, `createdAt`, `updatedAt`, origin/provenance and the revision or
scenario it belongs to. Quantities and prices are immutable snapshots once referenced by a bid.

### Three synchronized models

1. **Geographic model:** route/branches, coordinates, stationing, parcels, crossings, terrain,
   land restrictions and construction ranges.
2. **Engineering model:** nodes/segments, fluid, pipe, pressure, flow, temperature, components,
   equipment curves, controls, design criteria and solver results.
3. **Estimating model:** traceable quantities, unit rates, vendor/freight snapshots, labor and
   equipment assumptions, adders, indirects, escalation, contingency, markup and bid revisions.

Synchronization uses stable route-segment IDs and station ranges. No estimate line may exist
without a quantity formula or explicit allowance basis.

## Units, precision and provenance

- SI values are canonical in the compute layer.
- Display units are presentation-only and carry explicit conversion metadata.
- Inputs reject ambiguous nominal/actual diameter and pressure units.
- Display precision never implies source precision.
- Every scalar can carry `provenanceKind`: `measured`, `surveyed`, `user`, `provider`,
  `calculated`, `interpolated`, `estimated` or `allowance`.
- A profile tooltip labels calculated/interpolated/measured values separately.

## Route and event architecture

GIS edits publish a `route.geometry.changed` event with the route ID and new geometry revision.
Dependent jobs form a directed recalculation graph:

```text
geometry
├── stationing + length
├── terrain samples ──> slope/head
├── parcel intersections
├── crossing candidates
└── construction ranges
     ├── hydraulic solve
     ├── quantity takeoff
     └── cost/estimate refresh
```

During pointer drag, cheap geometry/station updates are debounced. Remote terrain/intersection
requests and full solve/takeoff wait until release. Every async result includes the originating
revision; a stale response is discarded rather than applied to a newer route.

## Engineering network

Routes are converted into graph nodes and hydraulic segments. A branch/tie-in creates topology,
not merely a visual overlay. A component snapped to a line:

1. projects to the centerline;
2. resolves station and elevation;
3. splits the owning hydraulic segment with stable replacement IDs;
4. inserts a typed component/node;
5. invalidates dependent results;
6. schedules solve, profile, quantities and estimate work.

Components implement a versioned descriptor contract with type, supported services, property
schema, validation, symbol and solver behavior. Unknown plugin components remain visible and
round-trip safely even if their plugin is unavailable.

## Solver contract

```ts
interface PipelineSolver {
  descriptor: SolverDescriptor;
  supports(model: SolverModel): CapabilityReport;
  validate(model: SolverModel): ValidationFinding[];
  solve(model: SolverModel, signal: AbortSignal): Promise<SolverResult>;
}
```

`SolverDescriptor` declares phase model, fluid/services, steady/transient behavior, components,
equations/property provider, version, validation status and benchmark set. The dispatcher refuses
unsupported physics.

### Planned adapters

- `liquid-steady-v1`: native, single-path/branch-capable steady incompressible implementation;
  Darcy-Weisbach, Colebrook, static head and minor losses. Begins as
  `preliminary-unvalidated`.
- `epanet-2.2`: future Web Worker or isolated compute-service adapter for water networks under the
  MIT license.
- `gas-steady-v1`: future pressure/temperature/composition-aware implementation with a validated
  property/EOS provider.
- `external-advanced`: exchange adapter for licensed specialist transient/multiphase systems.

When no adapter supports the case, return a structured finding headed **Advanced multiphase
analysis required**; never fall back to the liquid solver.

## Terrain service contract

```ts
interface ElevationProvider {
  descriptor: ProviderDescriptor;
  sampleRoute(request: ElevationRequest, signal: AbortSignal): Promise<ElevationBatch>;
}
```

Initial providers are `manual-survey` and a planned `usgs-3dep` adapter. Optional Esri elevation
adapters require a project/server-side key. Cache keys include provider, product, datum, route hash,
spacing and requested resolution. Survey values carry an influence range and override DEM values
only where defined.

## Profile and pressure scrub

Solver output stores station-ordered result points and segment ranges. The profile reads these
records directly. Map/profile hover both resolve the nearest route station and update one shared
`scrubStation` state. Line hit testing uses a wider invisible interaction layer without changing
the visual width.

Interpolation rules are field-specific:

- linear between solver nodes only for fields declared interpolable by that solver;
- no interpolation through a discontinuity such as a pump, compressor, regulator or closed valve;
- measured/surveyed values retain their original status;
- missing/gap values display as unavailable.

Colorization uses solver/design thresholds saved with the scenario. A legend shows units,
thresholds, run revision and stale state.

## Fluids, pipes and confirmation

Fluid and pipe libraries contain templates copied into the project; templates never silently
update a historical model. A `SolverCapabilityReport` determines whether a fluid is actually
supported.

Pipe recommendations evaluate complete configurations: service/material/spec/grade, nominal and
actual dimensions, pressure class or wall, roughness, lining/coating, corrosion allowance, joint,
temperature, availability and price evidence. Compatibility is a hard constraint; price alone
cannot make an alternative acceptable.

The Engineering Model status gate records confirmation of material, specification edition, grade,
NPS/OD/ID/wall, coating/lining, joint, pressure and temperature bases, corrosion allowance, MAOP,
compatibility, assumptions and reviewer. It is not a professional approval.

## Optimization

Optimization is an orchestrator over deterministic evaluators:

```text
candidate generator
  -> hard compatibility/land/design filters
  -> hydraulic/equipment solve
  -> quantities
  -> CAPEX/OPEX/lifecycle evaluator
  -> feasibility + objective vector
  -> Pareto alternatives + explanation
```

Candidate variables may include route, full pipe configuration, station count/location,
equipment, pressure and operating configuration. Land tags are hard constraints for permitted
equipment types. Results retain rejected reasons and objective contributions. The UI reports
multiple alternatives rather than disguising a weighted preference as the only answer.

Browser workers may screen small candidate sets. Large nonlinear/mixed-integer work belongs in a
versioned isolated compute service after the shared infrastructure and cost review. OR-Tools,
HiGHS and SciPy remain candidates, not committed dependencies.

## Crossing and constructability model

Crossing detectors implement provider-specific adapters and return candidates. User confirmation
creates an auditable crossing record. Construction conditions and methods are station ranges that
can overlap; precedence is explicit:

`field/geotechnical confirmed > user confirmed > provider mapped > model estimated > default`.

Rock quantity is derived from affected station length and trench geometry, with separate estimated,
mapped and confirmed ranges. Blasting is never assumed permissible. Each adder has its own unit,
quantity and rate evidence.

## Quantity takeoff

Each quantity item contains:

- item/category/specification and unit;
- calculated value and formula version;
- route/segment/component/crossing source IDs;
- station range or geometry reference;
- scenario/model revision;
- assumption and override history.

The takeoff engine emits pipe LF by configuration, joints/fittings/valves, trench/excavation/
rock/bedding/backfill, crossing and casing/HDD quantities, facilities, clearing/ROW, restoration,
test water and mobilization allowances. Map selection and quantity-row selection highlight each
other.

## Vendors and immutable pricing

`PricingProvider` returns evidence, not a naked number. It records vendor/manufacturer, product,
specification, location, unit, availability, lead time, freight assumption, retrieval/quote date,
source URL/attachment, evidence class and confidence.

Project-specific quotes are uploaded/entered and may be associated with a contact/location.
Automatic public searches may suggest published prices but cannot create `Vendor Quote` evidence.
Provider terms and robots/access rules are respected. Missing prices remain missing or become a
clearly named Budget Allowance after user acceptance.

Every estimate/bid references immutable `priceSnapshotId` values. Corrections create a new
snapshot. Historical charts group compatible products/units and never mutate prior bids.

## Estimate and bid revisions

Estimate calculation is a ledger of quantity × rate plus explicit labor/equipment productivity,
freight, subcontract, indirect, escalation, contingency, allowance, tax/bond/insurance and markup
rows. Each row has inclusion state, source, notes and uncertainty classification. Totals can be
summarized without losing line-level traceability.

Bid/proposal generation freezes:

- route/model/scenario/solver revisions;
- pipe/equipment configuration;
- quantity snapshot;
- price and cost snapshot;
- exclusions, qualifications, assumptions and validity period;
- selected maps/profiles/schedules and attachments.

Generated proposals are drafts requiring user review. Templates are LandDraft-owned or
customer-provided; no copied third-party template is permitted.

## Persistence and shared-schema coordination

Phase 1 stores a compact, versioned `pipelineEngineering` object inside the existing project state.
This makes the module optional and rollback-friendly without a database migration. It is not the
final multi-user/high-volume design.

Before production or multi-user estimate/vendor use, coordinate additive tables and RLS with the
administration/billing workstream. Expected future objects include:

- `pipeline_models`, `pipeline_routes`, `pipeline_scenarios`;
- `pipeline_solver_runs` and object-storage result artifacts;
- `pipeline_elevation_samples`, `pipeline_crossings`, `pipeline_construction_ranges`;
- `pipeline_pipe_specs`, `pipeline_components`;
- `pipeline_quantity_snapshots`, `pipeline_price_snapshots`, `pipeline_estimate_revisions`,
  `pipeline_bid_revisions`;
- company-scoped vendor/contact/cost libraries with project link tables.

All require tenant/project RLS, share-role review, immutable revision policies, audit events,
storage limits and migration-order agreement. No production schema or entitlement is changed by
the foundation build.

## Security and reliability

- Provider keys stay server-side; browser clients receive scoped endpoints/tokens only.
- Vendor contacts, quote attachments and bids are private tenant/project data.
- Shared-map roles do not automatically grant access to costs, contacts, quotes or bids.
- File scanning, content-type/size limits, signed URLs, audit events and retention policies are
  release requirements.
- Network calls use timeouts, aborts, quotas, provider health and cached fallback where licensing
  permits.
- A provider outage leaves prior sourced data visible with its age; it never changes provenance.
- AI may explain or propose an action, but deterministic validation and explicit user confirmation
  control engineering/model/bid mutations.

## Performance

- Route edits use revisioned debouncing and request cancellation.
- Heavy solver/optimization/crossing jobs run off the UI thread.
- Long profiles are decimated for drawing but retain full-resolution data for calculation/export.
- Result layers are viewport/zoom aware and use MapLibre sources rather than individual DOM marks.
- Terrain and provider results are chunked and cached.
- Derived layers are replaced atomically so stale layers do not cover the active result.

## Validation plan

1. Unit conversions, stationing and geodesic-vs-engineering-distance decisions.
2. Analytical laminar and static-head cases.
3. Published Darcy-Weisbach/Colebrook benchmark cases.
4. EPANET comparison models for supported water-network cases.
5. Pump/component discontinuity and reverse/elevation cases.
6. Invalid, unsupported and non-convergent inputs.
7. Geometry-change stale-result cancellation.
8. Quantity trace-back and estimate snapshot reproducibility.
9. Mobile scrub, drawer and offline/provider-error behavior.
10. Independent licensed engineer review before a validated release status.

## Delivery phases

### Phase 1 — test-branch foundation

- Optional route/workspace shell.
- Versioned domain contracts and project-state storage.
- Route linkage and stationing.
- Preliminary native incompressible single-route screening solver.
- Synchronized result profile and warning/status surface.
- Initial traceable takeoff and estimate summary contracts.

### Phase 2 — authoritative terrain and constructability

- USGS 3DEP/manual-survey elevation providers and caching.
- Crossings, parcels, land facility permissions and station-range construction conditions.
- Map/profile scrub and result colorization.

### Phase 3 — materials, equipment and cost

- Pipe/component libraries, confirmation gate, pump data and instant pipe alternatives.
- Quantity engine, company/project cost library, immutable pricing and vendor contacts.
- Estimate revisions and professional draft proposal output.

### Phase 4 — validated networks and optimization

- EPANET adapter, network branches and expanded equipment.
- Explainable multi-objective route/pipe/equipment optimization.
- Gas solver only after property-method and benchmark validation.

### Phase 5 — specialist integrations

- Licensed external transient/multiphase exchange adapters.
- Organization validation governance and advanced compute scaling.

Each phase remains disabled independently until its validation, security, cost and shared-change
coordination gates pass.
