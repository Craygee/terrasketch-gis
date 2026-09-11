import { bearing, booleanPointInPolygon, centroid, destination, distance, point } from "@turf/turf";
import { sourceMetadata } from "./normalize.ts";
import type {
  WeatherAlert,
  WeatherObservation,
  WeatherPhotographyAssessment,
  WeatherPointRequest,
  WeatherRiskLevel,
  WeatherViewingZone,
} from "./types.ts";

type CandidateLoader = (
  request: WeatherPointRequest,
  signal: AbortSignal,
) => Promise<{ alerts: WeatherAlert[]; current: WeatherObservation | null }>;

const normalizeBearing = (value: number) => ((value % 360) + 360) % 360;

function riskFor(alerts: WeatherAlert[], current: WeatherObservation | null): WeatherRiskLevel {
  if (alerts.some((alert) => alert.severity === "extreme" || alert.severity === "severe"))
    return "high";
  if (alerts.length) return "elevated";
  if ((current?.windGustMS ?? current?.windSpeedMS ?? 0) >= 15) return "elevated";
  if ((current?.precipitationMm ?? 0) >= 2) return "elevated";
  return current ? "lower" : "unknown";
}

function photoScore(current: WeatherObservation | null, riskLevel: WeatherRiskLevel) {
  if (!current || riskLevel === "high") return null;
  let score = 60;
  const clouds = current.cloudCoverPct;
  if (clouds !== undefined) {
    if (clouds >= 25 && clouds <= 80) score += 15;
    else if (clouds > 95) score -= 20;
    else if (clouds < 10) score -= 8;
  }
  const wind = current.windGustMS ?? current.windSpeedMS;
  if (wind !== undefined) {
    if (wind < 8) score += 10;
    else if (wind > 18) score -= 25;
    else if (wind > 12) score -= 10;
  }
  if ((current.precipitationMm ?? 0) > 0.5) score -= 15;
  if (riskLevel === "elevated") score -= 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function reasonsFor(current: WeatherObservation | null, score: number | null) {
  const reasons: string[] = [];
  if (score !== null) reasons.push(`Weather photography potential ${score}/100`);
  if (current?.cloudCoverPct !== undefined)
    reasons.push(`Model cloud cover ${Math.round(current.cloudCoverPct)}%`);
  if (current?.windSpeedMS !== undefined)
    reasons.push(`Model wind ${(current.windSpeedMS * 2.2369362921).toFixed(0)} mph`);
  if (!reasons.length) reasons.push("Limited model data at this candidate");
  return reasons;
}

function cautionsFor(alerts: WeatherAlert[], riskLevel: WeatherRiskLevel) {
  const cautions = [
    "Candidate zone only—not a declaration of safety.",
    "Check official warnings, lightning, roads, visibility, and local conditions before travel.",
  ];
  if (alerts.length)
    cautions.unshift(
      `${alerts.length} official alert${alerts.length === 1 ? "" : "s"} affect this point.`,
    );
  if (riskLevel === "high")
    cautions.unshift(
      "Photography scoring is suppressed because significant official hazards are present.",
    );
  return cautions;
}

export async function buildPhotographyAssessment(
  request: WeatherPointRequest,
  alerts: WeatherAlert[],
  signal: AbortSignal,
  loadCandidate: CandidateLoader,
): Promise<WeatherPhotographyAssessment> {
  const target = alerts.find(
    (alert) =>
      alert.geometry &&
      (alert.severity === "extreme" ||
        alert.severity === "severe" ||
        alert.severity === "moderate"),
  );
  const validTime = new Date().toISOString();
  if (!target?.geometry)
    return {
      status: "no-severe-target",
      validTime,
      targetDescription: "No official severe-weather polygon was returned at the inspected point",
      zones: [],
      methodology:
        "LandDraft only generates storm-viewing candidates from an official alert polygon; it does not invent a storm target.",
      limitations: [
        "Select a location inside an official warning or watch polygon to analyze candidate lower-exposure zones.",
        "No alert at one point is not an all-clear.",
      ],
    };

  const targetGeometry = target.geometry;
  const targetCenter = centroid(targetGeometry);
  const inspected = point([request.longitude, request.latitude]);
  const outward = normalizeBearing(bearing(targetCenter, inspected));
  const proposals = [
    { bearing: outward - 28, distanceMiles: 14 },
    { bearing: outward, distanceMiles: 20 },
    { bearing: outward + 28, distanceMiles: 26 },
  ];

  const zones = await Promise.all(
    proposals.map(async (proposal, index): Promise<WeatherViewingZone> => {
      const location = destination(inspected, proposal.distanceMiles, proposal.bearing, {
        units: "miles",
      });
      const longitude = location.geometry.coordinates[0]!;
      const latitude = location.geometry.coordinates[1]!;
      let candidateAlerts: WeatherAlert[] = [];
      let current: WeatherObservation | null = null;
      let lookupFailed = false;
      try {
        const result = await loadCandidate({ latitude, longitude }, signal);
        candidateAlerts = result.alerts;
        current = result.current;
      } catch {
        lookupFailed = true;
      }
      if (
        !candidateAlerts.some((alert) => alert.id === target.id) &&
        booleanPointInPolygon(location, targetGeometry)
      )
        candidateAlerts = [target, ...candidateAlerts];
      const riskLevel = lookupFailed ? "unknown" : riskFor(candidateAlerts, current);
      const score = photoScore(current, riskLevel);
      const source = sourceMetadata({
        providerId: "landdraft-photography-analysis",
        providerName: "LandDraft decision support",
        product: "lower-exposure photography candidate",
        temporalKind: "estimated",
        sourceTimestamp: validTime,
        validTime,
        quality: lookupFailed ? "low" : current ? "moderate" : "low",
        qualityFlags: [
          "DECISION_SUPPORT",
          "NOT_A_SAFETY_DETERMINATION",
          "OFFICIAL_ALERT_SCREEN",
          ...(current ? ["MODEL_WEATHER_INPUT"] : []),
        ],
        confidence: lookupFailed ? 0.25 : current ? 0.58 : 0.4,
        rawSourceReference: target.source.rawSourceReference,
        attribution: `${target.source.attribution}; model conditions where available`,
      });
      return {
        id: `photo-zone-${target.id}-${index}`,
        name: `Candidate ${String.fromCharCode(65 + index)}`,
        location,
        radiusMiles: 2.5,
        score,
        confidence: source.quality,
        riskLevel,
        distanceFromTargetMiles: distance(location, targetCenter, { units: "miles" }),
        targetBearingDeg: normalizeBearing(bearing(location, targetCenter)),
        reasons: reasonsFor(current, score),
        cautions: cautionsFor(candidateAlerts, riskLevel),
        activeAlertCount: candidateAlerts.length,
        source,
      };
    }),
  );

  return {
    status: "ready",
    validTime,
    targetDescription: `${target.event}: ${target.areaDescription ?? target.headline}`,
    zones: zones.sort((a, b) => {
      const riskRank: Record<WeatherRiskLevel, number> = {
        lower: 0,
        elevated: 1,
        unknown: 2,
        high: 3,
      };
      return riskRank[a.riskLevel] - riskRank[b.riskLevel] || (b.score ?? -1) - (a.score ?? -1);
    }),
    methodology:
      "Candidates are projected outward from an official alert polygon, then screened against official point alerts and available model conditions. High-risk candidates receive no photography score.",
    limitations: [
      "LandDraft cannot guarantee safety; official warnings and on-scene judgment always supersede this analysis.",
      "Road access, road closures, terrain line-of-sight, flooding, and individual lightning strikes are not yet included.",
      "Candidate geometry is approximate and is not a routing instruction.",
    ],
  };
}
