import { STORM_ANALYSIS_CONFIG as config } from "./analysisConfig.ts";
import type {
  AnalysisInput,
  AnalysisQuality,
  AnalysisSource,
  SourceQuality,
} from "./analysisTypes.ts";

export function inputQuality(input: AnalysisInput, now: number): AnalysisQuality {
  if (input.status === "NOT APPLICABLE" || input.value === null || !Number.isFinite(input.value))
    return "UNAVAILABLE";
  const time = Date.parse(input.observationTime ?? "");
  if (!Number.isFinite(time) || time > now + 60_000) return "UNAVAILABLE";
  const retrievalTime = Date.parse(input.retrievedAt);
  const providerStateApplies = !Number.isFinite(retrievalTime) || now >= retrievalTime;
  if (
    now - time > config.freshness[input.source] * config.staleIntervals * 1000 ||
    (providerStateApplies && /stale/i.test(input.providerQuality ?? ""))
  )
    return "STALE";
  if (providerStateApplies && /unavailable|down|bad/i.test(input.providerQuality ?? ""))
    return "UNAVAILABLE";
  if (input.status === "PARTIAL" || /partial/i.test(input.providerQuality ?? "")) return "PARTIAL";
  if (
    input.status === "DEGRADED" ||
    (providerStateApplies && /low|degraded/i.test(input.providerQuality ?? ""))
  )
    return "DEGRADED";
  return "CURRENT";
}

export function sourceQuality(inputs: AnalysisInput[], now: number): SourceQuality[] {
  return (Object.keys(config.freshness) as AnalysisSource[]).map((source) => {
    const entries = inputs.filter((input) => input.source === source);
    const states = entries.map((input) => inputQuality(input, now));
    const ages = entries.flatMap((input) =>
      Number.isFinite(Date.parse(input.observationTime ?? ""))
        ? [Math.max(0, (now - Date.parse(input.observationTime!)) / 1000)]
        : [],
    );
    const usable = states.filter((state) => state !== "UNAVAILABLE");
    const quality: AnalysisQuality = !usable.length
      ? "UNAVAILABLE"
      : usable.every((state) => state === "STALE")
        ? "STALE"
        : states.some((state) => state === "DEGRADED")
          ? "DEGRADED"
          : states.some((state) => state !== "CURRENT")
            ? "PARTIAL"
            : "CURRENT";
    return {
      source,
      quality,
      ageSeconds: ages.length ? Math.max(...ages) : null,
      expectedIntervalSeconds: config.freshness[source],
      inputs: entries,
    };
  });
}
