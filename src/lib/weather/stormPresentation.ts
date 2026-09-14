import type { StormObject } from "./types";
import { analyzeStormObject } from "./stormAnalysis.ts";
import { STORM_ANALYSIS_CONFIG } from "./analysisConfig.ts";

export function intensityColor(score: number | null) {
  if (score === null) return "#6b7280";
  const index = STORM_ANALYSIS_CONFIG.classifications.findIndex(([minimum]) => score >= minimum);
  return ["#7f1d1d", "#dc2626", "#ea580c", "#ca8a04", "#15803d"][index] ?? "#6b7280";
}

export function stormStyleLegend(mode: StormStyleMode = "Intensity"): string {
  if (mode === "Intensity")
    return (
      STORM_ANALYSIS_CONFIG.classifications
        .slice()
        .reverse()
        .map(([minimum, label]) => `${minimum}+ ${label}`)
        .join(" · ") + " · gray: insufficient current data"
    );
  if (mode === "Trend")
    return "Orange: strengthening / rapidly intensifying · blue: weakening · gray: steady or insufficient data; read storm labels";
  if (mode === "Data quality")
    return "Blue: current · amber: partial/degraded/unavailable · gray: stale; read storm labels";
  return "NOAA probability (%): green <25 · yellow 25–44 · orange 45–64 · red 65–84 · dark red 85–100 · gray unavailable";
}

export const STORM_STYLE_MODES = [
  "Intensity",
  "ProbSevere",
  "Tornado probability",
  "Hail probability",
  "Wind probability",
  "Trend",
  "Data quality",
] as const;
export type StormStyleMode = (typeof STORM_STYLE_MODES)[number];

export function stormMapStyle(storm: StormObject, mode: StormStyleMode = "Intensity") {
  if (storm.basis === "official-alert-area")
    return { color: "#b91c1c", label: "OFFICIAL WARNING CONTEXT" };
  const analysis = analyzeStormObject(storm);
  if (mode === "Data quality")
    return {
      color:
        analysis.quality === "CURRENT"
          ? "#2563eb"
          : analysis.quality === "STALE"
            ? "#6b7280"
            : "#a16207",
      label: analysis.quality,
    };
  if (mode === "Trend")
    return {
      color:
        analysis.trend.state.includes("Intensifying") || analysis.trend.state === "Strengthening"
          ? "#c2410c"
          : analysis.trend.state.includes("Weakening")
            ? "#2563eb"
            : "#6b7280",
      label: analysis.trend.state,
    };
  if (mode !== "Intensity") {
    const value =
      mode === "ProbSevere"
        ? (storm.history.at(-1)?.probabilitySeverePct ?? null)
        : storm.hazards[
            mode === "Tornado probability"
              ? "tornado"
              : mode === "Hail probability"
                ? "hail"
                : "wind"
          ].probabilityPct;
    return {
      color: stormSeverityColor(value),
      label: `${mode} ${value === null ? "unavailable" : `${value}%`}${analysis.sources.find((source) => source.source === "probability")?.quality === "STALE" ? " · STALE" : ""}`,
    };
  }
  return {
    color: intensityColor(analysis.intensity.value),
    label:
      analysis.intensity.value === null
        ? `${analysis.quality} · intensity unavailable`
        : `LD ${analysis.intensity.value}/100 ${analysis.intensity.classification}`,
  };
}

export type WeatherEventIcon =
  "tornado" | "hail" | "hurricane" | "haboob" | "lightning" | "major-thunderstorm";

export type WeatherSeverityBand = "lower" | "elevated" | "significant" | "severe" | "extreme";

const normalizedText = (storm: StormObject) =>
  `${storm.title} ${storm.classification} ${storm.statusLabel}`.toLowerCase();

export function stormSeverityScore(storm: StormObject) {
  return storm.history ? analyzeStormObject(storm).intensity.value : null;
}

export function stormSeverityBand(score: number): WeatherSeverityBand {
  if (score >= 85) return "extreme";
  if (score >= 65) return "severe";
  if (score >= 45) return "significant";
  if (score >= 25) return "elevated";
  return "lower";
}

export function stormSeverityColor(score: number | null) {
  if (score === null) return "#6b7280";
  switch (stormSeverityBand(score)) {
    case "extreme":
      return "#7f1d1d";
    case "severe":
      return "#dc2626";
    case "significant":
      return "#ea580c";
    case "elevated":
      return "#ca8a04";
    default:
      return "#15803d";
  }
}

export function stormEventIcon(storm: StormObject): WeatherEventIcon {
  const text = normalizedText(storm);
  if (/hurricane|tropical cyclone|typhoon/.test(text)) return "hurricane";
  if (/haboob|dust storm|blowing dust/.test(text)) return "haboob";
  if (/tornado warning|confirmed tornado|observed tornado/.test(text)) return "tornado";
  if (/lightning/.test(text)) return "lightning";
  if (/hail/.test(text)) return "hail";

  // A probability is not a detected event. Generic tracked cells use a thunderstorm icon.
  return "major-thunderstorm";
}

export function stormIconImageId(icon: WeatherEventIcon) {
  return `landdraft-weather-event-${icon}`;
}
