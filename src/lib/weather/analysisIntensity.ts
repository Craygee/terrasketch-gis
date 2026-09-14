import { STORM_ANALYSIS_CONFIG as config } from "./analysisConfig.ts";
import { inputQuality } from "./analysisFreshness.ts";
import type {
  AnalysisComponent,
  AnalysisObservation,
  ComponentName,
  IntensityResult,
} from "./analysisTypes.ts";

export function intensityClassification(value: number | null) {
  return value === null
    ? "INSUFFICIENT DATA"
    : (config.classifications.find(([threshold]) => value >= threshold)?.[1] ?? "Weak");
}

export function calculateIntensity(observation: AnalysisObservation, now: number): IntensityResult {
  const components: AnalysisComponent[] = [];
  for (const name of Object.keys(config.components) as ComponentName[]) {
    const input = observation.inputs[name];
    const rule = config.components[name];
    if (
      !input ||
      input.unit !== rule.unit ||
      input.value === null ||
      input.value < (name === "reflectivity" ? -32 : 0) ||
      input.status === "NOT APPLICABLE"
    )
      continue;
    if (!["CURRENT", "PARTIAL", "DEGRADED"].includes(inputQuality(input, now))) continue;
    components.push({
      name,
      input,
      weight: rule.weight,
      score: Math.max(0, Math.min(100, ((input.value - rule.low) / (rule.high - rule.low)) * 100)),
    });
  }
  const radar = components.filter((component) => component.input.source === "radar");
  const sufficient =
    components.length >= config.minimumComponents && radar.length >= config.minimumRadarComponents;
  const value = sufficient
    ? Math.round(
        components.reduce((sum, component) => sum + component.score * component.weight, 0) /
          components.reduce((sum, component) => sum + component.weight, 0),
      )
    : null;
  const score = (name: ComponentName) =>
    components.find((component) => component.name === name)?.score ?? null;
  return {
    value,
    classification: intensityClassification(value),
    components,
    hazards: {
      hail: score("hail"),
      rotation: score("rotation"),
      lightning: score("lightning"),
      wind: null,
      rainFlood: null,
    },
  };
}
