export type AnalysisQuality = "CURRENT" | "DEGRADED" | "STALE" | "PARTIAL" | "UNAVAILABLE";
export type AnalysisSource = "radar" | "probability" | "lightning" | "satellite" | "environment";
export type ComponentName = "reflectivity" | "hail" | "rotation" | "lightning";
export interface AnalysisInput {
  value: number | null;
  unit: string;
  source: AnalysisSource;
  provider: string;
  product: string;
  observationTime: string | null;
  observationTimeIsProductProxy?: boolean;
  productTime: string;
  retrievedAt: string;
  providerQuality: string | null;
  status?: "NOT APPLICABLE" | "PARTIAL" | "DEGRADED";
  kind: "OBSERVED" | "MODEL-DERIVED";
  method: string;
}
export interface SourceQuality {
  source: AnalysisSource;
  quality: AnalysisQuality;
  ageSeconds: number | null;
  expectedIntervalSeconds: number;
  inputs: AnalysisInput[];
}
export interface AnalysisObservation {
  time: string;
  identity: string;
  inputs: Partial<Record<ComponentName, AnalysisInput>>;
  probability?: AnalysisInput;
  continuity?: "confirmed" | "new" | "ambiguous";
  coverage?: "adequate" | "degraded" | "unknown";
}
export interface AnalysisComponent {
  name: ComponentName;
  score: number;
  weight: number;
  input: AnalysisInput;
}
export interface IntensityResult {
  value: number | null;
  classification: string;
  components: AnalysisComponent[];
  hazards: Record<"hail" | "wind" | "rotation" | "lightning" | "rainFlood", number | null>;
}
export interface StormAnalysis {
  version: string;
  calculatedAt: string;
  kind: "LANDDRAFT-DERIVED";
  intensity: IntensityResult;
  lastReliable: { time: string; intensity: IntensityResult } | null;
  quality: AnalysisQuality;
  confidence: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH";
  sources: SourceQuality[];
  trend: {
    state:
      | "Rapidly Weakening"
      | "Weakening"
      | "Steady"
      | "Strengthening"
      | "Rapidly Intensifying"
      | "Insufficient data";
    previous: number | null;
    current: number | null;
    change: number | null;
    ratePerMinute: number | null;
    durationMinutes: number | null;
    rapid: boolean;
  };
  history: { time: string; value: number | null; components: AnalysisComponent[] }[];
  drivers: string[];
  limitations: string[];
}
