/** Experimental anchors, not validated damage thresholds. Probabilities have zero weight. */
export const STORM_ANALYSIS_CONFIG = {
  version: "ld-storm-0.1.0",
  classifications: [
    [80, "Extreme"],
    [60, "Severe"],
    [40, "Strong"],
    [20, "Moderate"],
    [0, "Weak"],
  ] as const,
  components: {
    reflectivity: { weight: 0.4, low: 20, high: 70, unit: "dBZ", source: "radar" },
    hail: { weight: 0.3, low: 0, high: 3, unit: "in", source: "radar" },
    rotation: { weight: 0.2, low: 0, high: 0.02, unit: "s⁻¹", source: "radar" },
    lightning: { weight: 0.1, low: 0, high: 100, unit: "flashes/min", source: "lightning" },
  },
  minimumComponents: 2,
  minimumRadarComponents: 2,
  freshness: { radar: 120, probability: 120, lightning: 60, satellite: 300, environment: 1800 },
  staleIntervals: 3,
  historyMinutes: [15, 30, 60, 120] as const,
  trend: {
    windowMinutes: 30,
    minimumSamples: 5,
    minimumMinutes: 10,
    maximumGapMinutes: 12,
    change: 5,
    rapidChange: 15,
    rapidRate: 1,
    persistence: 3,
  },
  confidence: { moderate: 0.45, high: 0.75, veryHigh: 0.9 },
} as const;
