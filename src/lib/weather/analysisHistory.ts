import { STORM_ANALYSIS_CONFIG as config } from "./analysisConfig.ts";
import type { AnalysisObservation, StormAnalysis } from "./analysisTypes.ts";

/** Do not stitch different provider IDs by proximity: split/merger attribution is ambiguous. */
export function normalizeAnalysisHistory(observations: AnalysisObservation[], now: number) {
  const ordered = observations
    .filter(
      (item) =>
        Number.isFinite(Date.parse(item.time)) &&
        Date.parse(item.time) <= now + 60_000 &&
        Date.parse(item.time) >= now - 120 * 60_000,
    )
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const identity = ordered.at(-1)?.identity;
  const byTime = new Map<string, AnalysisObservation>();
  for (const observation of ordered.filter((item) => item.identity === identity)) {
    // Conflicting duplicates are excluded from trends rather than arbitrarily creating a jump.
    const key = new Date(observation.time).toISOString();
    const previous = byTime.get(key);
    byTime.set(
      key,
      previous &&
        (previous.continuity === "ambiguous" ||
          JSON.stringify(previous.inputs) !== JSON.stringify(observation.inputs))
        ? { ...previous, continuity: "ambiguous" }
        : observation,
    );
  }
  return [...byTime.values()];
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};
export const unavailableTrend = (): StormAnalysis["trend"] => ({
  state: "Insufficient data",
  previous: null,
  current: null,
  change: null,
  ratePerMinute: null,
  durationMinutes: null,
  rapid: false,
});

export function calculateTrend(
  history: StormAnalysis["history"],
  observations: AnalysisObservation[],
  current: boolean,
): StormAnalysis["trend"] {
  if (!current) return unavailableTrend();
  const latest = history.at(-1);
  const window = history.filter(
    (item) =>
      latest &&
      Date.parse(item.time) >= Date.parse(latest.time) - config.trend.windowMinutes * 60_000,
  );
  if (window.length < config.trend.minimumSamples || window.some((item) => item.value === null))
    return unavailableTrend();
  const relevant = observations.filter((item) =>
    window.some((sample) => sample.time === item.time),
  );
  if (relevant.some((item) => item.continuity === "ambiguous")) return unavailableTrend();
  // A changing input mix is not a meteorological change.
  const signature = (item: StormAnalysis["history"][number]) =>
    item.components
      .map((component) => component.name)
      .sort()
      .join();
  if (window.some((item) => signature(item) !== signature(window[0]!))) return unavailableTrend();
  if (
    window.some(
      (item, index) =>
        index > 0 &&
        Date.parse(item.time) - Date.parse(window[index - 1]!.time) >
          config.trend.maximumGapMinutes * 60_000,
    )
  )
    return unavailableTrend();
  const duration = (Date.parse(window.at(-1)!.time) - Date.parse(window[0]!.time)) / 60_000;
  if (duration < config.trend.minimumMinutes) return unavailableTrend();
  const first = median(window.slice(0, 3).map((item) => item.value!));
  const last = median(window.slice(-3).map((item) => item.value!));
  const change = last - first;
  const rate = change / duration;
  const direction = Math.sign(change);
  const persistent = window
    .slice(-config.trend.persistence)
    .every((item) => (item.value! - first) * direction >= config.trend.rapidChange);
  const rapid =
    persistent &&
    Math.abs(change) >= config.trend.rapidChange &&
    Math.abs(rate) >= config.trend.rapidRate;
  return {
    state:
      Math.abs(change) < config.trend.change
        ? "Steady"
        : change > 0
          ? rapid
            ? "Rapidly Intensifying"
            : "Strengthening"
          : rapid
            ? "Rapidly Weakening"
            : "Weakening",
    previous: first,
    current: last,
    change,
    ratePerMinute: rate,
    durationMinutes: duration,
    rapid: rapid && change > 0,
  };
}

/** Backtesting snapshots never use observations later than the requested analysis instant. */
export function observationsAtEventOffset(
  observations: AnalysisObservation[],
  eventTime: string,
  minutes: 0 | 10 | 20 | 30,
) {
  const cutoff = Date.parse(eventTime) - minutes * 60_000;
  return normalizeAnalysisHistory(
    observations.filter((item) => Date.parse(item.time) <= cutoff),
    cutoff,
  );
}
