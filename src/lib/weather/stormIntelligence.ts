import { bearing, booleanPointInPolygon, centroid, destination, distance, point } from "@turf/turf";
import type { Feature, Point } from "geojson";
import { sourceMetadata } from "./normalize.ts";
import type {
  StormForecastPosition,
  StormHazardAssessment,
  StormHazardKind,
  StormMotion,
  StormObject,
  StormRelativePosition,
  WeatherAlert,
  WeatherQuality,
} from "./types.ts";

const HAZARDS: StormHazardKind[] = ["tornado", "hail", "wind", "flood", "lightning"];

function deterministicSuffix(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(-7);
}

function dateKey(value: string | undefined) {
  const parsed = value ? new Date(value) : new Date(0);
  if (Number.isNaN(parsed.getTime())) return "UNKNOWN";
  return parsed.toISOString().slice(0, 10).replaceAll("-", "");
}

function eventHazards(event: string): Set<StormHazardKind> {
  const value = event.toLowerCase();
  const hazards = new Set<StormHazardKind>();
  if (value.includes("tornado")) hazards.add("tornado");
  if (value.includes("hail") || value.includes("severe thunderstorm")) hazards.add("hail");
  if (
    value.includes("wind") ||
    value.includes("severe thunderstorm") ||
    value.includes("hurricane") ||
    value.includes("tropical storm")
  )
    hazards.add("wind");
  if (value.includes("flood") || value.includes("rain")) hazards.add("flood");
  if (value.includes("thunderstorm")) hazards.add("lightning");
  return hazards;
}

function hazardAssessment(
  kind: StormHazardKind,
  presentInOfficialAlert: boolean,
  alert: WeatherAlert,
): StormHazardAssessment {
  if (!presentInOfficialAlert)
    return {
      kind,
      status: "unavailable",
      score: null,
      probabilityPct: null,
      confidence: "unavailable",
      trend: "unknown",
      reasons: ["No calibrated LandDraft analysis feed is connected for this hazard."],
    };
  return {
    kind,
    status: "official-context",
    score: null,
    probabilityPct: null,
    confidence: alert.source.quality,
    trend: "unknown",
    reasons: [
      `${alert.source.providerName} issued ${alert.event}.`,
      "This indicates official hazard context, not a LandDraft probability or detected storm signature.",
    ],
  };
}

function alertClassification(alert: WeatherAlert) {
  const event = alert.event.toLowerCase();
  if (event.includes("tornado")) return "Tornado alert area";
  if (event.includes("severe thunderstorm")) return "Severe thunderstorm alert area";
  if (event.includes("flash flood")) return "Flash-flood alert area";
  if (event.includes("hurricane")) return "Hurricane alert area";
  if (event.includes("tropical storm")) return "Tropical-storm alert area";
  if (event.includes("winter") || event.includes("blizzard")) return "Winter-storm alert area";
  return "Official weather alert area";
}

function pointFromAlert(alert: WeatherAlert, fallback: [number, number]) {
  return alert.geometry ? centroid(alert.geometry) : point(fallback);
}

/**
 * Converts official alert areas into provider-independent storm-context objects.
 * These objects are intentionally not described as radar-detected storms.
 */
export function buildStormObjectsFromAlerts(
  alerts: WeatherAlert[],
  fallback: [number, number],
): StormObject[] {
  return alerts
    .filter((alert) => alert.status === "actual")
    .map((alert) => {
      const observedAt =
        alert.source.sourceTimestamp ?? alert.source.validTime ?? alert.source.receivedTimestamp;
      const relevantHazards = eventHazards(alert.event);
      const hazards = Object.fromEntries(
        HAZARDS.map((kind) => [kind, hazardAssessment(kind, relevantHazards.has(kind), alert)]),
      ) as Record<StormHazardKind, StormHazardAssessment>;
      const certainty = alert.certainty ? `Certainty: ${alert.certainty}` : undefined;
      const urgency = alert.urgency ? `Urgency: ${alert.urgency}` : undefined;
      return {
        id: `LD-STORM-${dateKey(observedAt)}-${deterministicSuffix(alert.id)}`,
        title: alert.event,
        classification: alertClassification(alert),
        classificationConfidence: alert.source.quality,
        basis: "official-alert-area" as const,
        statusLabel: `OFFICIAL ${alert.event.toUpperCase()}`,
        centroid: pointFromAlert(alert, fallback),
        geometry: alert.geometry,
        observedAt,
        ...(alert.source.validTime ? { validFrom: alert.source.validTime } : {}),
        ...(alert.source.expirationTime ? { validUntil: alert.source.expirationTime } : {}),
        officialAlertIds: [alert.id],
        hazards,
        motion: null,
        forecastPositions: [],
        history: [],
        evidence: [
          {
            id: `${alert.id}-official-alert`,
            label: alert.event,
            value: [alert.severity, certainty, urgency].filter(Boolean).join(" · "),
            kind: "official" as const,
            validTime: alert.source.validTime,
            providerId: alert.source.providerId,
            sourceReference: alert.source.rawSourceReference,
          },
        ],
        limitations: [
          "This object represents an official alert area, not an independently detected storm centroid.",
          "Radar-derived rotation, hail, lightning-jump, and storm-classification feeds are not yet connected to this object.",
          "No future track is drawn without a validated motion input.",
        ],
        source: alert.source,
      } satisfies StormObject;
    })
    .sort((left, right) => {
      const severityRank: Record<WeatherAlert["severity"], number> = {
        extreme: 0,
        severe: 1,
        moderate: 2,
        minor: 3,
        unknown: 4,
      };
      return (
        severityRank[
          alerts.find((item) => item.id === left.officialAlertIds[0])?.severity ?? "unknown"
        ] -
        severityRank[
          alerts.find((item) => item.id === right.officialAlertIds[0])?.severity ?? "unknown"
        ]
      );
    });
}

const qualityByLead = (leadMinutes: number): WeatherQuality =>
  leadMinutes <= 15 ? "moderate" : leadMinutes <= 60 ? "low" : "estimated";

export const MAX_ROLLING_STORM_FORECAST_AGE_MINUTES = 30;

export interface TimeAdjustedStormForecast {
  positions: StormForecastPosition[];
  anchor: Feature<Point>;
  sourceAgeMinutes: number;
  ageAdjusted: boolean;
  expired: boolean;
}

/**
 * Produces a widening motion-only corridor. Callers must provide a validated
 * motion vector and should layer model/object-tracking solutions separately.
 */
export function forecastFromValidatedMotion(
  origin: Feature<Point>,
  motion: StormMotion,
  leadMinutes: number[] = [5, 10, 15, 30, 45, 60],
): StormForecastPosition[] {
  return leadMinutes.map((minutes) => {
    const distanceKm = (motion.speedMS * minutes * 60) / 1_000;
    const location = destination(origin, distanceKm, motion.bearingDeg, { units: "kilometers" });
    const uncertaintyKm = Math.max(2, distanceKm * 0.2 + minutes * 0.12);
    const validTime = new Date(
      new Date(motion.validTime).getTime() + minutes * 60_000,
    ).toISOString();
    return {
      leadMinutes: minutes,
      location,
      likelyRadiusKm: uncertaintyKm,
      possibleRadiusKm: uncertaintyKm * 1.8,
      confidence: qualityByLead(minutes),
      validTime,
      source: sourceMetadata({
        providerId: "landdraft-motion-projection",
        providerName: "LandDraft decision support",
        product: "motion-only storm projection",
        temporalKind: "estimated",
        sourceTimestamp: motion.validTime,
        validTime,
        quality: qualityByLead(minutes),
        confidence: Math.max(0.15, 0.75 - minutes / 120),
        qualityFlags: [
          "DERIVED",
          "MOTION_ONLY",
          "UNCERTAINTY_EXPANDS_WITH_TIME",
          "NOT_AN_OFFICIAL_WARNING",
        ],
        rawSourceReference: motion.source.rawSourceReference,
        attribution: `${motion.source.attribution}; LandDraft motion-only projection`,
      }),
    };
  });
}

/**
 * Keeps displayed +minute positions relative to the viewer's current clock
 * while the latest validated motion is briefly delayed. The projection is
 * withheld after the freshness window rather than extending stale motion
 * indefinitely. New provider data naturally re-anchors this calculation.
 */
export function timeAdjustedStormForecast(
  storm: StormObject,
  referenceTime: string,
  maximumSourceAgeMinutes = MAX_ROLLING_STORM_FORECAST_AGE_MINUTES,
): TimeAdjustedStormForecast {
  if (!storm.motion || storm.forecastPositions.length === 0)
    return {
      positions: [],
      anchor: storm.centroid,
      sourceAgeMinutes: 0,
      ageAdjusted: false,
      expired: false,
    };

  const motionTime = new Date(storm.motion.validTime).getTime();
  const reference = new Date(referenceTime).getTime();
  if (!Number.isFinite(motionTime) || !Number.isFinite(reference))
    return {
      positions: storm.forecastPositions,
      anchor: storm.centroid,
      sourceAgeMinutes: 0,
      ageAdjusted: false,
      expired: false,
    };

  const sourceAgeMinutes = Math.max(0, (reference - motionTime) / 60_000);
  if (sourceAgeMinutes > maximumSourceAgeMinutes)
    return {
      positions: [],
      anchor: storm.centroid,
      sourceAgeMinutes,
      ageAdjusted: false,
      expired: true,
    };

  if (sourceAgeMinutes < 0.25)
    return {
      positions: storm.forecastPositions,
      anchor: storm.centroid,
      sourceAgeMinutes,
      ageAdjusted: false,
      expired: false,
    };

  const displayLeads = storm.forecastPositions.map((position) => position.leadMinutes);
  const adjustedPositions = forecastFromValidatedMotion(
    storm.centroid,
    storm.motion,
    displayLeads.map((lead) => lead + sourceAgeMinutes),
  ).map((position, index) => ({
    ...position,
    leadMinutes: displayLeads[index]!,
    source: {
      ...position.source,
      qualityFlags: Array.from(
        new Set([...position.source.qualityFlags, "AGE_ADJUSTED_DISPLAY", "SOURCE_DATA_DELAYED"]),
      ),
    },
  }));
  const anchor = forecastFromValidatedMotion(storm.centroid, storm.motion, [sourceAgeMinutes])[0]
    ?.location;

  return {
    positions: adjustedPositions,
    anchor: anchor ?? storm.centroid,
    sourceAgeMinutes,
    ageAdjusted: true,
    expired: false,
  };
}

function cardinal(value: number) {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round((((value % 360) + 360) % 360) / 45) % names.length]!;
}

/** Ephemeral chase-relative calculation. No user position is persisted. */
export function stormRelativePosition(
  storm: StormObject,
  userCoordinates: [number, number],
): StormRelativePosition {
  const user = point(userCoordinates);
  const bearingDeg = ((bearing(user, storm.centroid) % 360) + 360) % 360;
  const distanceMiles = distance(user, storm.centroid, { units: "miles" });
  const insideAnalyzedArea = Boolean(storm.geometry && booleanPointInPolygon(user, storm.geometry));
  const insideOfficialAlert = storm.basis === "official-alert-area" && insideAnalyzedArea;
  const nearOfficialHazard = !insideAnalyzedArea && distanceMiles <= 10;
  return {
    distanceMiles,
    bearingDeg,
    cardinalBearing: cardinal(bearingDeg),
    insideOfficialAlert,
    insideAnalyzedArea,
    exposure: insideOfficialAlert
      ? "inside-official-hazard"
      : nearOfficialHazard
        ? "near-official-hazard"
        : "outside-analyzed-area",
    message: insideOfficialAlert
      ? "You are inside an official alert area. Prioritize official instructions; LandDraft will not recommend an observation route."
      : insideAnalyzedArea
        ? "You are inside the selected provider-tracked storm object. This is not an official warning boundary, but conditions may be hazardous."
        : nearOfficialHazard
          ? "You are near the selected official alert area. Conditions can change quickly; no route is represented as safe."
          : "Outside the selected alert polygon does not mean safe. Check warnings, roads, flooding, lightning, and current conditions.",
  };
}
