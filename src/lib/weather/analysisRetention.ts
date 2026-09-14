import type { StormObject } from "./types.ts";
import { analyzeStormObject } from "./stormAnalysis.ts";

/** Bounded per-worker context, not durable archival storage. Missing objects are never extrapolated. */
export class StormContextStore {
  private objects = new Map<string, StormObject>();
  update(incoming: StormObject[], now = Date.now(), outage = false) {
    for (const storm of incoming) {
      const previous = this.objects.get(storm.id);
      if (!previous || Date.parse(storm.observedAt) >= Date.parse(previous.observedAt))
        this.objects.set(storm.id, storm);
    }
    const active = new Set(incoming.map((storm) => storm.id));
    const result: StormObject[] = [];
    for (const [id, storm] of this.objects) {
      if (now - Date.parse(storm.observedAt) > 120 * 60_000) {
        this.objects.delete(id);
        continue;
      }
      const missing = outage || !active.has(id);
      const copy = missing
        ? {
            ...storm,
            forecastPositions: [],
            statusLabel: `${storm.statusLabel} · TRACKING ${outage ? "OUTAGE" : "LOST"} · LAST OBSERVATION`,
            source: {
              ...storm.source,
              quality: "stale" as const,
              qualityFlags: [...storm.source.qualityFlags, "TRACKING_LOST"],
            },
          }
        : storm;
      copy.analysis = analyzeStormObject(copy, now);
      if (missing) {
        copy.analysis.intensity = {
          ...copy.analysis.intensity,
          value: null,
          classification: "INSUFFICIENT DATA",
          components: [],
          hazards: { hail: null, wind: null, rotation: null, lightning: null, rainFlood: null },
        };
        copy.analysis.quality = "STALE";
        copy.analysis.confidence = "LOW";
      }
      result.push(copy);
    }
    if (this.objects.size > 300)
      for (const storm of [...this.objects.values()]
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        .slice(0, this.objects.size - 300))
        this.objects.delete(storm.id);
    return result.slice(-300);
  }
}
