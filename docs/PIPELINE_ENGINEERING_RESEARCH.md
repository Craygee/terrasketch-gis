# Pipeline Engineering & Estimating research

Status: Research baseline for test-branch development  
Research date: 2026-09-11  
Scope: Preliminary pipeline feasibility, routing, hydraulic screening, constructability,
quantity takeoff, estimating, procurement comparison, and bid preparation.

## Executive conclusions

LandDraft should not try to reproduce a commercial simulator screen-for-screen or present one
formula as adequate for every service. The useful pattern shared by the strongest products is a
synchronized network model, map, profile, scenario system, warnings, and traceable outputs. The
appropriate LandDraft implementation is an original, map-first workflow that separates liquid,
gas, and future advanced/multiphase solvers while keeping every calculated value tied to a route
station, an input revision, a source, and a confidence/status label.

The first defensible capability is a steady-state, single-phase, incompressible screening solver
using conservation of mass, the energy equation, Darcy-Weisbach, Reynolds number, and a validated
friction-factor method. EPANET 2.2 is a strong candidate for a later water-network adapter because
it is published by the US EPA, has a documented toolkit, and is MIT licensed.[1][2] Compressible
gas must be a separate solver with pressure-dependent properties and an equation-of-state
abstraction. Dynamic surge, transient gas, dense-phase CO2, slurry, and multiphase work require
independent validation or a licensed specialist integration; the product must say **Advanced
analysis required** rather than inventing results.

Terrain, parcel, wetland, flood, transportation, and soil sources are screening inputs, not field
verification. DEM elevations do not replace survey. Mapped soils/geology do not prove excavation
conditions. Public pipeline maps do not locate underground facilities. Those distinctions must
remain visible in the UI, data model, report, and bid assumptions.

Cost results need the same discipline. Every amount must retain its quantity basis, unit, region,
currency, effective date, escalation method, source classification, and exact price snapshot.
Public prices and market indices can inform an estimate, but LandDraft must never label them as a
vendor quotation. Estimate maturity should be expressed from the actual definition of scope, not
from a misleading single accuracy claim.[3]

## Commercial workflow review

The table records capability classes worth learning from, not code or interface elements to copy.
Product names are used only to identify researched sources.

| Product and current public evidence                                                    | Relevant capability classes                                                                                                                                 | LandDraft interpretation                                                                                                                             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNV Synergi Pipeline Simulator 11.2 Update 4 (July 2026)[4][5]                         | Steady/transient single-phase liquid and gas simulation, scenario work, operational connections, compositional and batch workflows                          | Keep model topology, profiles, scenarios, and warnings synchronized; do not claim transient parity in the initial solver                             |
| DNV Synergi Gas[6]                                                                     | Steady and transient gas networks, thermal behavior, gas composition/EOS choices, compressor/valve/storage models, GIS and operational-data integration     | Create a gas-specific adapter contract with explicit property/EOS provider and equipment maps; keep it unavailable until validated                   |
| Emerson PipelineStudio v5.4 public release notice and January 2025 product sheet[7][8] | Steady/transient liquid and gas models, line inventory, survival time, leak and operational studies                                                         | Preserve network state over scenarios and time; reserve transient/operations studies for later validated solvers                                     |
| Datacor Fathom 14 (November 2025 maintenance release)[9][10]                           | Steady liquid networks, Darcy-Weisbach/Hazen-Williams, heat transfer, pump curves, NPSH, minor losses, scenario comparison, cost and visual gradients       | Adopt focused property panels, alternatives, pump-curve data, traceable warnings, and result colorization in an original LandDraft workflow          |
| Datacor Arrow 11 (November 2025 maintenance release)[9][11]                            | Steady compressible gas/steam networks, mass/momentum/energy equations, choking, real-gas and heat-transfer options, compressor maps and regulators         | Never route gas through the liquid solver; model convergence, sonic/choking, compressor envelope, and property-method warnings explicitly            |
| Bentley OpenFlows Water 2026[12][13]                                                   | Water-network steady/extended-period/transient analyses, scenarios, calibration, optimization, pump scheduling, GIS/CAD/SCADA integration and model sharing | Use alternatives instead of destructive scenario edits; support GIS-to-network traceability and later EPANET/network adapters                        |
| US EPA EPANET 2.2[1][2]                                                                | Extended-period pressurized water networks with pipes, junctions, reservoirs, tanks, pumps, valves, energy and water-quality analysis                       | Prefer a tested adapter to reimplementing a mature distribution-network engine; preserve EPANET attribution and license notices                      |
| SLB Pipesim 2026.2[14][15]                                                             | Steady-state multiphase production-system simulation, fluid/PVT models, profiles, sensitivity, GIS model creation and network calculation                   | Treat as evidence that multiphase is a specialist discipline; support import/export/integration points but do not reproduce proprietary correlations |
| SLB Olga 2026.2[16][17]                                                                | Dynamic multiphase flow, time-varying composition/temperature/solids and operational transients                                                             | Explicitly outside the native initial scope; expose a future solver/plugin boundary and an **Advanced multiphase analysis required** result          |

### Product patterns that are appropriate to implement

1. A geographic route and engineering graph that share stable IDs.
2. A synchronized map, engineering profile, tabular results, and component tree.
3. Scenario/alternative inheritance so one change does not overwrite the baseline.
4. Purpose-specific liquid, gas, and external advanced solvers.
5. Equipment represented both geographically and hydraulically.
6. Color-by-result views with limits derived from scenario criteria.
7. Explainable warnings, input provenance, convergence status, and result revisions.
8. Side-by-side engineering and economic comparison.
9. Model-building helpers from GIS with review instead of silent conversion.
10. Reports that preserve the exact model, cost, and price snapshots used.

### Patterns deliberately excluded

- Proprietary correlations, algorithms, databases, UI layouts, training materials, or standards
  text.
- Claims of commercial-product equivalence.
- A single formula presented as valid for liquids, gases, multiphase fluids, slurries, hydrogen,
  dense-phase CO2, or ammonia.
- Unreviewed AI-generated pipe specifications, MAOP values, vendor quotes, or compliance claims.
- Scraping or redistributing restricted pipeline-location data.

## Published engineering basis

### Single-phase liquid screening

The initial native solver can use the following public engineering relationships with SI units
internally:

- Continuity: flow at each node balances for the solved steady condition.
- Velocity: `v = Q / A`.
- Reynolds number: `Re = rho * v * D / mu`.
- Darcy-Weisbach friction loss: `deltaP_f = f * (L / D) * rho * v^2 / 2`.
- Static pressure change: `deltaP_z = rho * g * deltaZ`.
- Minor loss: `deltaP_k = K * rho * v^2 / 2`.
- Laminar Darcy friction factor `64 / Re`; turbulent friction factor from an iterative
  Colebrook-White solution or a documented validated approximation.
- Pump behavior from user/vendor curves and efficiency data; affinity-law extrapolation must be
  marked as calculated and limited to a stated range.

EPANET's manual and source provide a reference implementation and verification target for water
networks, including Darcy-Weisbach and pump/valve behavior.[1][2] LandDraft must establish its own
unit, regression, benchmark, and independent engineering-review suite before calling any result
validated.

### Compressible gas

The gas solver contract needs conservation of mass, momentum and energy, pressure-dependent
density, temperature, gas composition, compressibility and an explicit EOS/property provider.
Compressor maps, power/efficiency, regulators, sonic limits and Mach number cannot be cosmetic
fields. The Fathom/Arrow distinction and Synergi Gas capability set reinforce the need for this
separation.[6][10][11]

CoolProp is MIT licensed and offers a broad open-source property library, but it must be evaluated
for each supported fluid, validity range, web/server packaging strategy, and benchmark case before
use in an engineering result.[18][19]

### Advanced fluids and transient behavior

Hydrogen, ammonia, dense-phase CO2, slurry, surge, transient gas, linepack, compositional tracking,
and multiphase flow each need specific validation. The architecture may store these fluids and
their inputs, but a stored fluid record is not proof that a solver supports it. Solver capability
negotiation must refuse unsupported cases. Pipesim and Olga show the depth of property, correlation,
heat-transfer, phase-behavior, solids, and transient work involved.[14][16]

## Terrain and elevation sources

### USGS 3DEP

USGS 3DEP is the default US terrain source. The National Map provides bulk elevation products,
an Elevation Point Query Service, and a bulk-point service.[20] The service adapter should store
the exact product/source, resolution, timestamp, vertical reference where known, request status,
and quality flag for every sample batch.

Rules:

- Sample along the route according to source resolution and an explicit maximum spacing.
- Cache samples by geometry hash, provider, resolution, and datum.
- Do not invent precision beyond the source resolution.
- Manual/survey points override DEM samples only over their stated station influence.
- Show mixed-source profiles and gaps.

### Esri elevation services

Esri's Elevation API can return elevations for points (including batches) and identifies source
resolution; its hosted elevation-analysis profile service can densify a line and return source
metadata.[21][22] These are optional providers because they require an account/token and may incur
usage charges. As of the research date, Esri publishes a limited free allocation and usage-based
pricing for the point API; this must be rechecked before release rather than embedded as a product
promise.[21]

## GIS screening sources

| Need                                | Candidate authoritative source                                                       | Required qualification                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Hydrography/drainage                | USGS 3D Hydrography Program services and downloads[23][24]                           | Geometry and service vintage; legacy NHD is reference data as 3DHP replaces it                                  |
| Soils                               | USDA NRCS SSURGO/Soil Data Access services[25][26]                                   | Soil survey interpretation, not geotechnical confirmation                                                       |
| Wetlands                            | US Fish & Wildlife Service National Wetlands Inventory[27][28]                       | Screening layer; jurisdiction and current field condition require review                                        |
| Flood hazard                        | FEMA Flood Map Service Center/NFHL[29]                                               | Effective-map date, zone, and source; not a substitute for project floodplain determination                     |
| Roads, rail, airports and crossings | USDOT Bureau of Transportation Statistics National Transportation Atlas Database[30] | Dataset-specific metadata and update frequency                                                                  |
| Existing regulated pipeline context | PHMSA National Pipeline Mapping System public viewer[31][32]                         | Do not scrape restricted data; public view is generalized and must never replace One Call/811 or field locating |
| State/local constraints             | LandDraft public-data catalog and owner-provided services                            | Preserve provider terms, spatial accuracy, dates, and connection health                                         |

Crossing detection is a spatial-screening workflow. Every generated candidate needs type,
geometry, station, source feature ID, confidence, proposed method, cost allowance and human review
status. Imagery may help a user inspect a location but cannot establish underground utilities or
subsurface conditions.

## Regulatory and standards boundaries

US federal minimum pipeline-safety regulations include 49 CFR Part 192 for gas and Part 195 for
hazardous liquids.[33][34][35] State, local, environmental, railroad, road-owner, utility, and
project-specific requirements may add constraints. LandDraft should provide source links,
structured user inputs, completeness checks and dated review acknowledgements; it must not declare
regulatory compliance automatically.

ASME B31.4 and B31.8, API, ASTM, AWWA and other standards are copyrighted/licensed works. The
application may store user-entered edition identifiers and derived project criteria, link to the
publisher, and test required-field completeness. It must not reproduce paid tables or standards
text. ASME's public catalog currently identifies B31.4-2025 for liquid/slurry transportation and
the B31 family identifies B31.8 for gas transmission/distribution.[36][37]

A pipe confirmation gate should therefore ask the user to confirm material, edition/specification,
grade, OD, wall, ID, corrosion allowance, coating/lining, joint, pressure basis, temperature basis,
compatibility and MAOP/design pressure. “Use Recommended” means use an explainable, project-specific
candidate subject to confirmation—not professional approval.

## Constructability and cost-estimating research

PHMSA's construction overview emphasizes that route, soil and population affect design and that
ROW, utility location, trenching, installation, testing and restoration are distinct construction
steps.[38] LandDraft should model construction method and condition by station range, allow field or
geotechnical evidence to supersede mapped estimates, and retain the override history.

AACE's cost-estimate classification guidance ties estimate class to scope-definition maturity,
not simply a percentage complete.[3][39] Because the detailed AACE practices are copyrighted,
LandDraft should store the user's chosen classification, basis, exclusions, maturity checklist and
uncertainty inputs without reproducing protected tables.

FHWA's National Highway Construction Cost Index is based on winning-bid pay-item prices and can be
used as an external trend indicator, not a pipeline-specific unit-price database.[40][41] BLS PPI
provides public price indices for producer output, including relevant construction/material series;
again, these are escalation evidence rather than quotes.[42] EIA's API v2 provides free registered
access to energy price time series useful for energy/OPEX scenarios.[43][44]

### Price evidence classes

The application must show one of these labels everywhere a price is used:

1. **Vendor Quote** — attached project-specific quote; never inferred.
2. **Published Current Price** — public price with URL, retrieval time and units.
3. **Recent Historical Price** — an immutable prior project/vendor snapshot.
4. **Market Estimate** — a documented calculation/index/region adjustment.
5. **Budget Allowance** — an explicit user/model assumption.

No provider response may overwrite history. A bid revision points to immutable quantity, rate,
vendor, freight, escalation and exchange-rate snapshots.

## Open-source numerical and geospatial candidates

| Library           | License          | Candidate role                                                       | Adoption condition                                                                    |
| ----------------- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| US EPA EPANET 2.2 | MIT[1]           | Water-distribution network adapter/reference                         | Pin version, preserve notices, benchmark through toolkit boundary                     |
| CoolProp          | MIT[18]          | Thermophysical properties/EOS plugin                                 | Validate fluid/range, deployment footprint and benchmark cases                        |
| SciPy             | BSD-style[45]    | Server-side roots, nonlinear systems, interpolation and optimization | Use only in an isolated compute service with pinned environment and validation suite  |
| Google OR-Tools   | Apache-2.0[46]   | Routing, assignment and mixed optimization orchestration             | Objective/constraint audit trail; do not imply global optimum without solver evidence |
| HiGHS             | MIT core[47]     | LP/MIP/convex QP engine                                              | Audit bundled third-party binaries and license notices before deployment              |
| Turf.js           | MIT[48]          | Browser geospatial measurement/segmentation                          | Already present; retain unit tests for stationing and geometry edge cases             |
| MapLibre GL JS    | BSD-3-Clause[49] | Existing interactive map rendering                                   | Already present; derived result layers remain separate from basemaps                  |

No library's license is a validation certificate. Engineering verification and software license
review are separate release gates.

## Validation and professional-use guardrails

Each result set needs:

- solver ID/version and capability declaration;
- input/model revision hashes;
- converged/failed/stale status;
- value provenance: measured, surveyed, user-entered, provider-derived, calculated, or
  interpolated;
- warnings and unsupported-physics findings;
- units and significant-figure rules;
- independent benchmark-case version;
- reviewer identity/date when formally reviewed.

Initial native calculations must be labeled **Preliminary screening — unvalidated for final
design**. Moving a model to an “Engineering Model” status requires pipe-spec confirmation and an
organization-defined technical-review workflow; LandDraft alone does not supply a professional
seal, approve a code design, locate utilities, or issue a construction-ready bid.

## Sources

1. [US EPA, EPANET](https://www.epa.gov/water-research/epanet)
2. [US EPA, EPANET 2.2 source and license](https://github.com/USEPA/EPANET2.2)
3. [AACE International RP 17R-97 contents/purpose](https://web.aacei.org/docs/default-source/toc/toc_17r-97.pdf)
4. [DNV, Synergi Pipeline Simulator downloads](https://mysoftware.dnv.com/knowledge-centre/synergi-pipeline-simulator/softwaredownloads/)
5. [DNV, Synergi Pipeline Simulator](https://www.dnv.com/services/synergi-pipeline-simulator/)
6. [DNV, Synergi Gas](https://www.dnv.com/services/synergi-gas/)
7. [Emerson, PipelineStudio v5.4 release notice](https://www.emerson.com/is/content/emerson/en/systems-and-software/deltav-scada-systems/brochures-and-flyers/documents/release-notice-pipelinestudio.pdf)
8. [Emerson, PipelineStudio product data sheet](https://www.emerson.com/is/content/emerson/en/systems-and-software/deltav-scada-systems/product-data-sheets/documents/pipelinestudio-software.pdf)
9. [Datacor, November 2025 Pipe Flow Modeling Suite release notes](https://www.datacor.com/resources/pipe-flow-modeling-suite-release-notes-november-2025)
10. [Datacor, Fathom capabilities](https://www.datacor.com/products/fathom/capabilities)
11. [Datacor, Arrow capabilities](https://www.datacor.com/products/arrow/capabilities)
12. [Bentley, OpenFlows Water 2026](https://www.bentley.com/en/blog/introducing-openflows-2026/)
13. [Bentley, OpenFlows Water capabilities](https://www.bentley.com/products/openflows-water)
14. [SLB, Pipesim 2026.2 release](https://www.software.slb.com/software-news/support-news/pipesim/pipesim-2026_2)
15. [SLB, Pipesim overview](https://www.software.slb.com/products/pipesim)
16. [SLB, Olga 2026.2 release](https://www.software.slb.com/software-news/support-news/olga/olga-2026-2)
17. [SLB, Olga overview](https://www.software.slb.com/products/olga)
18. [CoolProp source and MIT license](https://github.com/CoolProp/CoolProp)
19. [CoolProp documentation](https://coolprop.sourceforge.net/)
20. [USGS, National Map data delivery and 3DEP services](https://www.usgs.gov/the-national-map-data-delivery/gis-data-download)
21. [Esri, Elevation API](https://developers.arcgis.com/rest/elevation/index.html)
22. [Esri, elevation profile analysis](https://developers.arcgis.com/rest/elevation-analysis/profile/)
23. [USGS, 3D Hydrography Program data](https://www.usgs.gov/3d-hydrography-program/access-3dhp-data-products)
24. [USGS, 3DHP public feature/map service endpoints](https://www.usgs.gov/media/images/3dhp-web-feature-service)
25. [USDA NRCS, SSURGO](https://www.nrcs.usda.gov/resources/data-and-reports/soil-survey-geographic-database-ssurgo)
26. [USDA NRCS, Soil Data Access web services](https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx)
27. [US FWS, National Wetlands Inventory data](https://www.fws.gov/program/national-wetlands-inventory/wetlands-data)
28. [US FWS, wetlands web mapping services](https://www.fws.gov/program/national-wetlands-inventory/web-mapping-services)
29. [FEMA, Flood Map Service Center](https://msc.fema.gov/)
30. [USDOT BTS, National Transportation Atlas Database](https://www.bts.gov/ntad)
31. [PHMSA, NPMS public viewer scope](https://www.npms.phmsa.dot.gov/AboutPublicViewer.aspx)
32. [PHMSA, pipeline-data access and limitations](https://www.npms.phmsa.dot.gov/PipelineData.aspx)
33. [eCFR, Title 49 Subtitle B Chapter I](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I)
34. [PHMSA, 49 CFR Part 192](https://www.phmsa.dot.gov/regulations/title49/part/192)
35. [PHMSA, 49 CFR Part 195](https://www.phmsa.dot.gov/regulations/title49/part/195)
36. [ASME, B31.4 catalog](https://www.asme.org/codes-standards/find-codes-standards/b31-4-pipeline-transportation-systems-liquids-slurries)
37. [ASME, B31 piping standards overview](https://www.asme.org/resources/b31piping)
38. [PHMSA, phases of pipeline construction](https://www.phmsa.dot.gov/technical-resources/pipeline/pipeline-construction/phases-pipeline-construction-overview)
39. [AACE International professional guidance documents](https://web.aacei.org/resources/professional-guidance-documents)
40. [FHWA, National Highway Construction Cost Index](https://www.fhwa.dot.gov/policy/otps/nhcci/)
41. [FHWA, NHCCI methodology](https://www.fhwa.dot.gov/policy/otps/nhcci/methodology.cfm)
42. [US Bureau of Labor Statistics, Producer Price Index](https://www.bls.gov/ppi/)
43. [US Energy Information Administration, Open Data](https://www.eia.gov/opendata/index.php/api)
44. [US EIA, API v2 technical documentation](https://www.eia.gov/opendata/documentation.php)
45. [SciPy project](https://scipy.org/)
46. [Google OR-Tools source and Apache-2.0 license](https://github.com/google/or-tools)
47. [HiGHS source and MIT license](https://github.com/ERGO-Code/HiGHS)
48. [Turf.js source and MIT license](https://github.com/Turfjs/turf)
49. [MapLibre GL JS source and BSD-3-Clause license](https://github.com/maplibre/maplibre-gl-js)
