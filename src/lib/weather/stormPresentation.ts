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
  if (/tornado|rotation|mesocyclone/.test(text)) return "tornado";
  if (/lightning/.test(text)) return "lightning";
  if (/hail/.test(text)) return "hail";

  const hazards = storm.hazards;
  const candidates: Array<[WeatherEventIcon, number]> = [
    ["tornado", hazards.tornado.probabilityPct ?? hazards.tornado.score ?? 0],
    ["hail", hazards.hail.probabilityPct ?? hazards.hail.score ?? 0],
    ["lightning", hazards.lightning.probabilityPct ?? hazards.lightning.score ?? 0],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0]![1] > 0 ? candidates[0]![0] : "major-thunderstorm";
}

export function stormIconImageId(icon: WeatherEventIcon) {
  return `landdraft-weather-event-${icon}`;
}
