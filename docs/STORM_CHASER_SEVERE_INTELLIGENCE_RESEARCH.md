# LandDraft Storm Chaser / Severe Intelligence Research

Research checked: 2026-09-11  
Implementation target: `feature/test-module-development`  
Status: NOAA tracked-storm guidance increment implemented in test  
Pricing: undecided

## Executive decision

LandDraft should not ask an ordinary Storm Chaser user to type storm motion or hazard values. The
first operationally useful automated foundation is NOAA/CIMSS ProbSevere v3: a public NOAA feed of
tracked convective-storm polygons with calibrated next-hour hail, wind, tornado and combined-severe
guidance. It updates on an approximately two-minute cycle and combines MRMS radar, satellite,
lightning and environmental/model predictors.[1]

This is a better starting point than creating an undocumented LandDraft score from historical storm
averages. It already supplies a validated storm-object identity, polygon, current guidance and
meteorological predictors. LandDraft can add transparent recent-object history, motion quality
control, map interaction and uncertainty visualization without claiming to reproduce NOAA's
algorithm.

The product distinction must remain visible:

- NWS watch/warning/advisory polygons are **official hazard information**.[2]
- ProbSevere percentages are **NOAA probabilistic guidance for a tracked storm object**, not an
  official warning.[1]
- A LandDraft path based only on displacement of recent object centroids is a **motion-only derived
  projection**, not a deterministic storm or tornado track.
- Historical records are **calibration, validation and replay inputs**. They are not a substitute
  for current radar, lightning, surface observations or model guidance.

## What the live system needs

### Official hazards

The NWS API distributes alerts in JSON-LD/GeoJSON-compatible structures and requires a descriptive
User-Agent. The alerts service is built around CAP watches, warnings and advisories. NWS asks clients
not to poll alerts more frequently than every 30 seconds and recommends resilient access patterns.[2]

LandDraft already normalizes these polygons and excludes test/exercise messages from live storm
objects. Official polygons remain visible beside ProbSevere guidance and are never converted into a
fabricated probability.

### Radar and storm-object guidance

NEXRAD Level II contains base reflectivity, mean radial velocity, spectrum width and
dual-polarization moments; Level III contains processed products. NCEI provides near-real-time and
archived access.[3] Correct rotation, debris-signature and storm-classification work ultimately
requires a server-side decode, quality-control, spatial alignment and temporal tracking pipeline.
Reading colors from a rendered radar screenshot is not an acceptable substitute.

MRMS combines multiple radars and other observations into rapidly updated mosaics. NOAA training
material documents rotation tracks as a derived MRMS product, useful as one input rather than a
confirmed-tornado declaration.[4] Public MRMS access is available, but operational ingestion still
needs rate-aware caching and monitoring.[5]

ProbSevere v3 supplies a practical intermediate layer: coherent storm-object polygons, storm IDs,
hazard probabilities and predictor fields. The published research describes next-hour guidance and
documents performance/verification rather than promising an exact tornado time or location.[1]
The public NOAA directory exposes timestamped immutable GeoJSON frames.[6]

### Historical records

NCEI Storm Events and Severe Weather Data Inventory are valuable for retrospective validation,
case replay and eventual calibration studies.[7][8] Storm Events is a curated historical database,
not a live feed; reports can be delayed and affected by observation/reporting density. Therefore:

1. retain each live storm object's exact source snapshot;
2. associate later verified reports without rewriting the original forecast;
3. measure false alarms, misses, lead time and reliability by region/season;
4. recalibrate only from documented training/validation splits;
5. never use historical climatology alone to draw a live track.

This separation makes historical analysis scientifically useful without encouraging false precision.

## Implemented automatic flow

```text
NOAA timestamped ProbSevere GeoJSON frames
  -> validate FeatureCollection and timestamps
  -> select current plus approximately 5/10/15-minute history
  -> associate objects by provider storm ID
  -> normalize polygon, centroid, probabilities and predictor evidence
  -> calculate probability/flash-rate trends
  -> calculate centroid displacement with speed-quality limits
  -> if history passes QC, draw +5/+10/+15/+30/+45/+60-minute positions
  -> expand likely and possible uncertainty envelopes with lead time
  -> rank active objects and expose source age/quality/limitations
  -> display beside official NWS alerts
```

The motion result is withheld when matching history is missing or calculated speed is implausible.
The projection does not extrapolate beyond 60 minutes in this increment. Storm splits, mergers and
provider ID changes can invalidate simple association and remain an explicit limitation.

## Why historical-only prediction is rejected

A historical record can estimate background climatology or show how similar environments behaved.
It cannot determine whether the current storm has a velocity couplet, debris signature, lightning
jump, boundary interaction or deviant motion. Those are time-sensitive observations. A system that
draws a current track primarily from past analogs would appear sophisticated while hiding missing
live evidence.

LandDraft should eventually use history for:

- probability reliability diagrams and regional/seasonal calibration;
- model/provider performance comparisons;
- archived-case regression tests;
- storm-classification validation;
- feature-weight and threshold evaluation;
- replay mode that clearly says **Historical**.

It should not use history to silently manufacture a current observation.

## Track and uncertainty policy

The current track uses recent provider centroids. A future blended system should retain multiple
solutions:

1. recent object displacement;
2. provider motion vector, when supplied and documented;
3. radar-cell optical/object tracking;
4. environmental steering winds;
5. convection-allowing model solutions;
6. ensemble members and recent forecast-error statistics.

Weights should change with lead time, storm continuity, data age and split/merge detection. The map
should show a most-likely path plus widening likely/possible corridors, never one exact indefinite
line. Future validation must measure position error at each lead time before the corridors are
described as calibrated probability regions.

## “Why?” and provenance

Every selected storm exposes:

- provider and valid time;
- source age and quality flags;
- current next-hour hazard guidance;
- recent probability trend;
- available predictors such as composite reflectivity, MESH, flash rate, low-level azimuthal shear,
  MLCAPE, effective bulk shear, storm-relative helicity and LCL;
- motion source and limitations;
- reasons associated with each hazard field;
- a persistent statement that the guidance is not an official warning.

These predictor values explain available context. LandDraft must not claim that the displayed list is
a local feature-attribution decomposition of the ProbSevere model unless a future upstream product
provides that decomposition.

## Safety and product language

The Storm Chaser module remains decision support. Official instructions supersede it. It must not
say “get closer,” “safe escape route,” or provide an exact tornado formation time. Device position
is ephemeral and requested only after explicit browser permission. Entering a provider storm-object
polygon is not mislabeled as entering an official warning polygon.

Candidate viewing zones and lower-exposure repositioning require current warnings, storm
uncertainty, flooding, lightning, road closures/attributes, terrain and visibility. Until those
inputs are validated together, the system must withhold automatic chase routing.

## Coverage, dependencies and operating cost

ProbSevere is a CONUS-focused U.S. product; it is not global storm coverage. NHC supplies official
GIS tracks, cones and related tropical products for its areas of responsibility.[9] International
coverage will require agency-specific and/or licensed provider adapters with equivalent provenance.

This increment adds no runtime library and no database migration. It uses the existing server
gateway, MapLibre map, Turf geometry, project Weather state and provider-health telemetry. NOAA data
is public, but polling, Worker CPU, caching, CDN egress, monitoring, durable history and archived
replay still have operating costs. Raw radar processing, commercial lightning, global severe feeds,
road closures and message delivery may require paid services or redistribution agreements. Pricing
remains undecided.

## Recommended next increments

1. Add regional/viewport official NWS alerts, SPC outlooks, watches and mesoscale discussions.
2. Store immutable ProbSevere frames and association history in a coordinated temporal/spatial
   backend; do not add shared schema before administration/billing coordination.
3. Detect object split/merge and display identity uncertainty.
4. Validate motion corridor errors on archived cases before calling them calibrated probability
   corridors.
5. Build server-side NEXRAD/MRMS decoding for measured velocity/dual-pol analysis, with archived-case
   test fixtures and meteorological review.
6. Add official reports and NCEI archives for after-the-fact verification, not current inference.
7. Add multi-solution future-cast and model agreement only after time/spatial alignment is tested.
8. Add road/flood/lightning/terrain-aware lower-exposure viewing zones after every required input is
   current and attributable.

## 2026-09-11 track-visibility and signal-history increment

Storm Chaser now selects the highest-ranked current object when its workspace opens and fits the
entire selected storm polygon plus its widening motion corridor in the map viewport. Selecting a
different storm or pressing **Show full track** repeats that fit. Likely and possible envelopes have
separate, stronger outlines so that project map position and low-opacity fills cannot make the
track appear absent.

Recent ProbSevere sampling now reaches approximately 30 minutes when matching object identity is
available. The Storm Intelligence panel plots the provider's any-severe guidance alongside four
documented storm-object predictors: 0–2 km maximum azimuthal shear, MESH, composite reflectivity
and flash rate. These are NOAA/CIMSS object-level inputs, not point measurements and not an
independent LandDraft tornado-detection algorithm.[10]

The longer window adds one small public GeoJSON frame request per uncached Storm Chaser refresh
(five rather than four). It introduces no paid provider charge or new runtime dependency, but it
does increase Worker fetches, parsing CPU and cache traffic; those remain potential operating costs
to measure before production pricing is decided.

MRMS publishes rotation-track grids as compressed GRIB2 products, and NEXRAD Level II supplies the
base velocity and dual-polarization moments needed for deeper analysis.[11][12] Those products need
server-side decoding, temporal/spatial alignment, archived-case validation, durable object history
and meteorological review. This increment deliberately does not label the displayed ProbSevere
predictors as a debris signature or confirmed rotation track. Durable history remains a coordinated
backend dependency and is not emulated with browser storage.

## Sources

1. NOAA Central Library, _ProbSevere v3: Probabilities of Severe Weather Hazards in the Next Hour_,
   https://repository.library.noaa.gov/view/noaa/67694 and
   https://repository.library.noaa.gov/view/noaa/67694/noaa_67694_DS1.pdf
2. National Weather Service API and Alerts documentation,
   https://www.weather.gov/documentation/services-web-api and
   https://www.weather.gov/documentation/services-web-alerts
3. NOAA NCEI, Next Generation Weather Radar (NEXRAD),
   https://www.ncei.noaa.gov/products/radar/next-generation-weather-radar
4. NOAA Warning Decision Training Division, Rotation Tracks,
   https://vlab.noaa.gov/web/wdtd/-/rotation-trac-3?selectedFolder=562123
5. NOAA/NSSL MRMS public data access,
   https://vlab.noaa.gov/web/osti-r2o/mrms
6. NOAA/NCEP MRMS ProbSevere public frame directory,
   https://mrms.ncep.noaa.gov/ProbSevere/PROBSEVERE/
7. NOAA NCEI, Severe Weather Data,
   https://www.ncei.noaa.gov/products/severe-weather
8. NOAA NCEI, Storm Events Database metadata,
   https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ncdc%3AC00510/html
9. National Hurricane Center GIS Products,
   https://www.nhc.noaa.gov/gis/
10. NOAA/CIMSS, _ProbSevere v3 File Description_,
    https://cimss.ssec.wisc.edu/probsevere/wp-content/uploads/sites/29/2025/11/ProbSevere_v3_FileDescription.docx.pdf
11. NOAA/NCEP MRMS public RotationTrackML60min product directory,
    https://mrms.ncep.noaa.gov/2D/RotationTrackML60min/
12. NWS Radar Operations Center, Level II Data Types,
    https://www.roc.noaa.gov/level-two-data-types.php
