import type { StormObject } from "./types";

export type WeatherEventIcon =
  "tornado" | "hail" | "hurricane" | "haboob" | "lightning" | "major-thunderstorm";

export type WeatherSeverityBand = "lower" | "elevated" | "significant" | "severe" | "extreme";

const normalizedText = (storm: StormObject) =>
  `${storm.title} ${storm.classification} ${storm.statusLabel}`.toLowerCase();

export function stormSeverityScore(storm: StormObject) {
  const hazardValues = Object.values(storm.hazards).flatMap((hazard) =>
    hazard.probabilityPct !== null
      ? [hazard.probabilityPct]
      : hazard.score !== null
        ? [hazard.score]
        : hazard.status === "official-context"
          ? [65]
          : [],
  );
  const text = normalizedText(storm);
  const officialFloor = /tornado warning|hurricane warning|extreme/.test(text)
    ? 85
    : /severe thunderstorm warning|flash flood warning|dust storm warning/.test(text)
      ? 68
      : 0;
  return Math.min(100, Math.max(0, officialFloor, ...hazardValues));
}

export function stormSeverityBand(score: number): WeatherSeverityBand {
  if (score >= 85) return "extreme";
  if (score >= 65) return "severe";
  if (score >= 45) return "significant";
  if (score >= 25) return "elevated";
  return "lower";
}

export function stormSeverityColor(score: number) {
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
