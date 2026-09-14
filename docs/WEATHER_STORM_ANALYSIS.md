# Storm analysis enhancement

## Phase 0 inventory (before code changes)

Baseline: a5dcc54. Machine-readable registrations: `weather-analysis-baseline.json` (55 layers, 19 categories, 26 providers).

| Existing capability / implementation                                                                                                               | Classification | Preservation / intended change                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| registry, productRegistry, providerRegistry, entitlements, provider policy and operations                                                          | KEEP           | All layer IDs, categories, license controls, credentials, provider switches retained         |
| WeatherWorkspace navigation, presets, favorites, ordering, opacity, desktop/tablet/mobile drawers                                                  | KEEP           | Add progressive disclosure inside existing storm card                                        |
| NativeRadarControls/Overlay, Level III decoder, PNG renderer, MRMS rainfall durations                                                              | KEEP           | No renderer or source replacement                                                            |
| ProbSevereSourceOverlay, original NOAA polygons and attributes                                                                                     | KEEP           | Remains independent of LandDraft analysis                                                    |
| ProbSevere normalizer and recent object history                                                                                                    | ENHANCE        | Missing semantics, ordered history, analysis inputs, longer history                          |
| stormIntelligence motion, paths, official alert objects, relative exposure                                                                         | ENHANCE        | Suppress extrapolation when critical observations are stale                                  |
| stormPresentation and WeatherMapOverlay event icons / storm colors                                                                                 | REFACTOR       | Separate probability styling from experimental intensity; preserve official warning priority |
| StormChaserPanel cards, hazard probabilities, observed predictor history                                                                           | ENHANCE        | Add intensity, trend, quality, confidence, explanations, history periods                     |
| Storm chaser presence, target selection, centering, routes, safety, terrain/viewing tools                                                          | KEEP           | Existing actions and handlers retained                                                       |
| PhotographyPanel / photography.server                                                                                                              | ENHANCE        | Analysis limitations inform cautions; no intensity desirability bonus                        |
| Meteorology, NWS warnings/watches/advisories, SPC, radar, satellites, wind, lightning, reports, aviation, tropical, winter, air quality, forecasts | KEEP           | Existing registrations, availability checks and renderers retained                           |
| WeatherTimeline, inspection, geolocation, base maps, searches                                                                                      | KEEP           | No removal                                                                                   |
| DataSources, Xweather connection, Spotter Network, telemetry, backend routes and provider governance                                               | KEEP           | No login, integration or database removal                                                    |

No component is designated REPLACE or DEPRECATE. There are no capability removals authorized by this implementation.

## Implemented architecture

The provider adapter normalizes each storm-object predictor into a provenance record. Separate modules calculate input freshness, physical-component intensity, hazard intensities, robust trends, confidence, explanations, history views, bounded outage context and official-alert intersection. The existing storm card, chaser panel, map overlay, photography cautions and layer availability use these results. Map styling supports intensity, the four NOAA probability views, trend and data quality without changing the layer registry.

`StormContextStore` retains up to two hours of last-seen objects inside a running worker isolate. During outage/tracking loss it clears projected positions and current intensity, marks quality stale, and keeps the last reliable value only as timestamped context. This store is bounded to 300 objects.

## Known limitations and calibration follow-up

- Current predictors are fields embedded in the ProbSevere storm-object product. Their individual sensor observation times and per-predictor provider quality are not supplied, so product time is explicitly identified as a proxy.
- Native Level III map pixels are not yet sampled into a storm-volume feature extractor. Wind and heavy-rain/flood intensity remain `INSUFFICIENT DATA` until validated inputs are connected.
- Worker-isolate history is not durable across a cold start. Durable two-hour history and lineage storage should be added before relying on uninterrupted operational archives.
- Provider object IDs are not stitched across splits or mergers without authoritative lineage. A changed/ambiguous identity starts a new trend segment.
- The initial normalization anchors and weights need historical backtesting at T-30/T-20/T-10/event time against authoritative reports, warnings and storm surveys. Store version `ld-storm-0.1.0` and component reasoning with validation records before tuning thresholds.

## Scientific scope

The initial index is an experimental, configurable engineering heuristic, **not scientifically validated**, not an official NOAA/NWS rating, and not a probability of damage. NOAA probabilities remain unchanged. The index uses available physical predictors with documented units; unconnected measurements remain unavailable. Multiple predictors carried in a ProbSevere product are not independent live sensor feeds. Native radar pixels at the inspection point are not a validated storm-volume analysis and must not be substituted for storm-wide measurements.

Radar sampling, distance, beam height and hail contamination affect interpretation. See [NWS radar indicators](https://www.weather.gov/bmx/radar_aboutnwsradar_keyindicators) and [NWS VIL density limitations](https://www.weather.gov/lmk/vil_density). Environmental favorability alone is not current storm power. A high intensity score never establishes safe viewing or replaces official warnings.
