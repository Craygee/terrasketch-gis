import { bearing, booleanPointInPolygon, centroid, destination, distance, point } from "@turf/turf";
import { sourceMetadata } from "./normalize.ts";
import type {
  StormObject,
  WeatherAlert,
  WeatherObservation,
  WeatherPhotographyAssessment,
  WeatherPointRequest,
  WeatherRiskLevel,
  WeatherViewingZone,
} from "./types.ts";

export function selectPhotographyStorm(storms: StormObject[], request: WeatherPointRequest) {
  const fresh = storms.filter(
    (storm) =>
      storm.geometry &&
      Number.isFinite(Date.parse(storm.observedAt)) &&
      Date.parse(storm.observedAt) <= Date.now() + 60000 &&
      Date.now() - Date.parse(storm.observedAt) <= 20 * 60000,
  );
  if (request.photographyStormId)
    return fresh.find((storm) => storm.id === request.photographyStormId);
  const location = point(request.mapCenter ?? [request.longitude, request.latitude]);
  return fresh
    .map((storm) => ({ storm, km: distance(location, storm.centroid) }))
    .filter((item) => item.km <= 300)
    .sort((a, b) => a.km - b.km)[0]?.storm;
}

type CandidateLoader = (
  request: WeatherPointRequest,
  signal: AbortSignal,
) => Promise<{
  alerts: WeatherAlert[];
  current: WeatherObservation | null;
  alertsAvailable?: boolean;
  conditionsAvailable?: boolean;
}>;

const normalizeBearing = (value: number) => ((value % 360) + 360) % 360;

function riskFor(alerts: WeatherAlert[], current: WeatherObservation | null): WeatherRiskLevel {
  if (alerts.some((alert) => alert.severity === "extreme" || alert.severity === "severe"))
    return "high";
  if (alerts.length) return "elevated";
  if ((current?.windGustMS ?? current?.windSpeedMS ?? 0) >= 15) return "elevated";
  if ((current?.precipitationMm ?? 0) >= 2) return "elevated";
  return current ? "lower" : "unknown";
}

function photoScore(current: WeatherObservation | null, suppressForOfficialHazard: boolean) {
  if (!current || suppressForOfficialHazard) return null;
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
  if ((current.windGustMS ?? current.windSpeedMS ?? 0) >= 15 || (current.precipitationMm ?? 0) >= 2)
    score -= 20;
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
  trackedStorm?: StormObject,
): Promise<WeatherPhotographyAssessment> {
  const officialTarget = alerts.find(
    (alert) =>
      alert.geometry &&
      alert.status === "actual" &&
      (alert.severity === "extreme" ||
        alert.severity === "severe" ||
        alert.severity === "moderate"),
  );
  const trackedTarget =
    trackedStorm?.geometry &&
    Date.now() - Date.parse(trackedStorm.observedAt) <= 20 * 60_000 &&
    Date.parse(trackedStorm.observedAt) <= Date.now() + 60_000
      ? trackedStorm
      : undefined;
  const target = trackedTarget
    ? {
        id: trackedTarget.id,
        geometry: trackedTarget.geometry,
        event: "NOAA-tracked storm",
        headline: trackedTarget.title,
        areaDescription: undefined,
        source: trackedTarget.source,
      }
    : officialTarget;
  const validTime = new Date().toISOString();
  if (!target?.geometry)
    return {
      status: "no-severe-target",
      validTime,
      targetDescription:
        "No current selected or nearby tracked storm, or official severe-weather polygon, was found",
      zones: [],
      methodology:
        "LandDraft uses a current NOAA-tracked storm or an official alert polygon; it does not invent a storm target.",
      limitations: [
        "Select a tracked storm on the map, then open Photography, or inspect an official warning polygon.",
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
      const location = destination(
        trackedTarget ? targetCenter : inspected,
        proposal.distanceMiles,
        proposal.bearing,
        {
          units: "miles",
        },
      );
      const longitude = location.geometry.coordinates[0]!;
      const latitude = location.geometry.coordinates[1]!;
      let candidateAlerts: WeatherAlert[] = [];
      let current: WeatherObservation | null = null;
      let alertLookupFailed = false;
      let conditionsLookupFailed = false;
      try {
        const result = await loadCandidate({ latitude, longitude }, signal);
        candidateAlerts = result.alerts;
        current = result.current;
        alertLookupFailed = result.alertsAvailable === false;
        conditionsLookupFailed = result.conditionsAvailable === false;
      } catch {
        alertLookupFailed = true;
        conditionsLookupFailed = true;
      }
      if (
        !trackedTarget &&
        officialTarget &&
        !candidateAlerts.some((alert) => alert.id === target.id) &&
        booleanPointInPolygon(location, targetGeometry)
      )
        candidateAlerts = [officialTarget, ...candidateAlerts];
      const weatherRisk = riskFor(candidateAlerts, current);
      const riskLevel = alertLookupFailed
        ? weatherRisk === "high"
          ? "high"
          : "unknown"
        : weatherRisk;
      // Weather-only conditions cannot establish road access, escape options,
      // lightning exposure or terrain visibility. Never imply a safe location.
      const score = photoScore(current, weatherRisk === "high");
      const source = sourceMetadata({
        providerId: "landdraft-photography-analysis",
        providerName: "LandDraft decision support",
        product: "lower-exposure photography candidate",
        temporalKind: "estimated",
        sourceTimestamp: validTime,
        validTime,
        quality: "low",
        qualityFlags: [
          "DECISION_SUPPORT",
          "NOT_A_SAFETY_DETERMINATION",
          ...(alertLookupFailed ? ["ALERT_SCREEN_FAILED"] : ["OFFICIAL_ALERT_SCREEN"]),
          ...(conditionsLookupFailed ? ["MODEL_CONDITIONS_FAILED"] : []),
          "SAFETY_INPUTS_INCOMPLETE",
          ...(trackedTarget ? ["NOAA_TRACKED_STORM_TARGET", "NOT_AN_OFFICIAL_WARNING"] : []),
          ...(current ? ["MODEL_WEATHER_INPUT"] : []),
        ],
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
        reasons: [
          ...reasonsFor(current, score),
          ...(score === null
            ? [
                "Viewing-conditions score unavailable because observations are missing or a significant official hazard is present.",
              ]
            : [
                "Viewing-conditions score uses model cloud, wind and precipitation inputs; it is not a safety score.",
              ]),
        ],
        cautions: [
          ...(trackedStorm?.analysis
            ? [
                `LandDraft intensity ${trackedStorm.analysis.intensity.value ?? "unavailable"}; trend ${trackedStorm.analysis.trend.state}; confidence ${trackedStorm.analysis.confidence}; quality ${trackedStorm.analysis.quality}. These metrics do not establish safe or desirable viewing.`,
              ]
            : []),
          ...cautionsFor(candidateAlerts, riskLevel),
          "Terrain, road access, escape routes and lightning are not verified.",
          ...(alertLookupFailed
            ? ["Official warning lookup failed; hazard status is unknown."]
            : []),
          ...(conditionsLookupFailed ? ["Candidate weather observations were unavailable."] : []),
        ],
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
      "LandDraft projects candidate viewing locations around the identified storm or official alert polygon, then checks official point alerts and model conditions. Candidates are not validated safe locations.",
    limitations: [
      "LandDraft cannot guarantee safety; official warnings and on-scene judgment always supersede this analysis.",
      "Road access, road closures, terrain line-of-sight, flooding, and individual lightning strikes are not yet included.",
      "Candidate geometry is approximate and is not a routing instruction.",
    ],
  };
}
