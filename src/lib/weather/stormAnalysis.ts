import { STORM_ANALYSIS_CONFIG as config } from "./analysisConfig.ts";
import { sourceQuality } from "./analysisFreshness.ts";
import { calculateIntensity } from "./analysisIntensity.ts";
import { calculateTrend, normalizeAnalysisHistory, unavailableTrend } from "./analysisHistory.ts";
import type {
  AnalysisInput,
  AnalysisObservation,
  ComponentName,
  StormAnalysis,
} from "./analysisTypes.ts";
import type { StormObject } from "./types.ts";

export function analyzeStorm(observations: AnalysisObservation[], now = Date.now()): StormAnalysis {
  // Keep last observation available for stale context even when its history window has elapsed.
  const anchor = observations.reduce((time, item) => Math.max(time, Date.parse(item.time) || 0), 0);
  const ordered = normalizeAnalysisHistory(observations, Math.min(now, anchor || now));
  const latest = ordered.at(-1) ?? {
    time: new Date(now).toISOString(),
    identity: "missing",
    inputs: {},
  };
  const inputs = [
    ...Object.values(latest.inputs),
    ...(latest.probability ? [latest.probability] : []),
  ].filter((item): item is AnalysisInput => !!item);
  const sources = sourceQuality(inputs, now);
  const intensity = calculateIntensity(latest, now);
  const history = ordered.map((observation) => {
    const result = calculateIntensity(observation, Date.parse(observation.time));
    return { time: observation.time, value: result.value, components: result.components };
  });
  const reliable = [...ordered]
    .reverse()
    .find(
      (observation) => calculateIntensity(observation, Date.parse(observation.time)).value !== null,
    );
  const radarQuality = sources.find((source) => source.source === "radar")!.quality;
  const quality =
    radarQuality === "STALE"
      ? "STALE"
      : intensity.value === null
        ? "UNAVAILABLE"
        : radarQuality === "DEGRADED" || latest.coverage === "degraded"
          ? "DEGRADED"
          : sources.some((source) => source.quality !== "CURRENT")
            ? "PARTIAL"
            : "CURRENT";
  const limitations = [
    "Experimental index; not scientifically validated or an official NOAA/NWS rating.",
  ];
  if (latest.coverage !== "adequate")
    limitations.push(
      `Radar coverage, beam height and distance ${latest.coverage === "degraded" ? "are degraded" : "have not been independently verified"}.`,
    );
  for (const source of sources.filter((item) => item.quality !== "CURRENT"))
    limitations.push(
      `${source.source}: ${source.quality}${source.ageSeconds === null ? "" : ` (${Math.round(source.ageSeconds / 60)} min old)`}.`,
    );
  const providers = new Set(inputs.map((input) => input.provider));
  if (providers.size < 2)
    limitations.push(
      "Predictors share a single provider product; independent source agreement is unverified.",
    );
  if (ordered.length < config.trend.minimumSamples)
    limitations.push(
      "Insufficient continuous history for a reliable trend; identity changes start a new segment.",
    );
  if (latest.continuity === "ambiguous")
    limitations.push("Ambiguous tracking or conflicting duplicate; trend withheld.");
  // Confidence reflects support, never the score or a NOAA probability.
  const support =
    intensity.value === null || quality === "STALE"
      ? 0
      : (intensity.components.length / 4) * 0.45 +
        (latest.coverage === "adequate" ? 0.2 : 0) +
        (providers.size >= 2 ? 0.15 : 0) +
        (ordered.length >= config.trend.minimumSamples ? 0.1 : 0) +
        (sources.every((source) => source.quality === "CURRENT") ? 0.1 : 0);
  const confidence =
    quality === "DEGRADED" || latest.continuity === "ambiguous"
      ? "LOW"
      : support >= config.confidence.veryHigh
        ? "VERY HIGH"
        : support >= config.confidence.high
          ? "HIGH"
          : support >= config.confidence.moderate
            ? "MODERATE"
            : "LOW";
  const trend = calculateTrend(
    history,
    ordered,
    intensity.value !== null && quality !== "STALE" && confidence !== "LOW",
  );
  return {
    version: config.version,
    calculatedAt: new Date(now).toISOString(),
    kind: "LANDDRAFT-DERIVED",
    intensity,
    lastReliable: reliable
      ? { time: reliable.time, intensity: calculateIntensity(reliable, Date.parse(reliable.time)) }
      : null,
    quality,
    confidence,
    sources,
    trend,
    history,
    drivers: intensity.components.map(
      (component) =>
        `${component.name}: ${component.input.value} ${component.input.unit} → ${Math.round(component.score)}/100 component; weight ${component.weight}.`,
    ),
    limitations,
  };
}

/** Adapter deliberately uses storm-object predictors, never the map inspection gate. */
export function stormAnalysisObservations(storm: StormObject): AnalysisObservation[] {
  return storm.history.map((sample) => {
    const input = (
      value: number | undefined,
      source: AnalysisInput["source"],
      unit: string,
    ): AnalysisInput => ({
      value: value ?? null,
      unit,
      source,
      provider: storm.source.providerId,
      product: storm.source.product,
      observationTime: sample.validTime,
      observationTimeIsProductProxy: true,
      productTime: sample.validTime,
      retrievedAt: storm.source.receivedTimestamp,
      providerQuality: storm.source.quality,
      kind: "MODEL-DERIVED",
      method:
        "Provider storm-object predictor; observation time approximated by product time; individual sensor time unavailable",
    });
    const inputs: Partial<Record<ComponentName, AnalysisInput>> = {
      reflectivity: input(sample.compositeReflectivityDbz, "radar", "dBZ"),
      hail: input(sample.meshInches, "radar", "in"),
      rotation: input(sample.lowLevelAzimuthalShearS1, "radar", "s⁻¹"),
      lightning: input(sample.flashRatePerMinute, "lightning", "flashes/min"),
    };
    return {
      time: sample.validTime,
      identity: storm.id,
      inputs,
      probability: input(sample.probabilitySeverePct, "probability", "%"),
      coverage: "unknown",
      continuity: storm.source.qualityFlags.includes("TRACKING_LOST") ? "ambiguous" : "confirmed",
    };
  });
}

export function analyzeStormObject(storm: StormObject, now = Date.now()) {
  const result = analyzeStorm(stormAnalysisObservations(storm), now);
  if (storm.source.qualityFlags.includes("TRACKING_LOST")) {
    const retained =
      storm.analysis?.lastReliable ??
      (storm.analysis?.intensity.value !== null && storm.analysis?.intensity.value !== undefined
        ? { time: storm.observedAt, intensity: storm.analysis.intensity }
        : null);
    result.intensity = {
      ...result.intensity,
      value: null,
      classification: "INSUFFICIENT DATA",
      components: [],
      hazards: { hail: null, wind: null, rotation: null, lightning: null, rainFlood: null },
    };
    result.quality = "STALE";
    result.confidence = "LOW";
    result.trend = unavailableTrend();
    result.lastReliable = retained ?? result.lastReliable;
    result.limitations.push(
      "Tracking lost or provider outage; last observations retained, current analysis withheld.",
    );
  }
  return result;
}
