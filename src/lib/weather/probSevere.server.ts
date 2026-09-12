import { bearing, centroid, distance, point } from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { sourceMetadata } from "./normalize.ts";
import { forecastFromValidatedMotion } from "./stormIntelligence.ts";
import { recordWeatherUsage } from "./telemetry.server.ts";
import type {
  StormHazardAssessment,
  StormHazardKind,
  StormHistorySample,
  StormMotion,
  StormObject,
  StormTrend,
  WeatherPointRequest,
  WeatherQuality,
  WeatherSourceMetadata,
} from "./types.ts";

const INDEX_URL = "https://mrms.ncep.noaa.gov/ProbSevere/PROBSEVERE/";
const PROVIDER_ID = "noaa-probsevere-v3";
const PROVIDER_NAME = "NOAA / CIMSS ProbSevere";
const headers = {
  Accept: "application/json, text/html;q=0.9",
  "User-Agent": "LandDraftWeather/0.1 (https://landdraft.net)",
};

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

type ProbSevereProperties = Record<string, unknown> & { ID?: string | number };
type ProbSevereCollection = FeatureCollection<Polygon | MultiPolygon, ProbSevereProperties>;
export interface ProbSevereInputFrame {
  filename: string;
  validTime: string;
  data: ProbSevereCollection;
}

function numeric(properties: ProbSevereProperties, key: string) {
  const value = Number(properties[key]);
  return Number.isFinite(value) ? value : undefined;
}

function probability(properties: ProbSevereProperties, key: string) {
  const value = numeric(properties, key);
  return value === undefined ? undefined : Math.max(0, Math.min(100, value));
}

function frameTime(filename: string) {
  const match = filename.match(/_(\d{8})_(\d{6})\.json$/);
  if (!match) return undefined;
  const date = match[1]!;
  const time = match[2]!;
  const parsed = new Date(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`,
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function dataQuality(validTime: string) {
  const ageMinutes = Math.max(0, (Date.now() - new Date(validTime).getTime()) / 60_000);
  return ageMinutes <= 6 ? ("moderate" as const) : ("stale" as const);
}

async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) {
    recordWeatherUsage({ providerId: PROVIDER_ID, product: key, success: true, cacheHit: true });
    return existing.value;
  }
  try {
    const value = await loader();
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    recordWeatherUsage({ providerId: PROVIDER_ID, product: key, success: true, cacheHit: false });
    return value;
  } catch (error) {
    recordWeatherUsage({ providerId: PROVIDER_ID, product: key, success: false, cacheHit: false });
    throw error;
  }
}

async function fetchText(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, headers });
  if (!response.ok) throw new Error(`ProbSevere HTTP ${response.status}`);
  return response.text();
}

async function fetchFrame(filename: string, signal: AbortSignal) {
  return cached(`frame:${filename}`, 30 * 60_000, async () => {
    const response = await fetch(`${INDEX_URL}${filename}`, { signal, headers });
    if (!response.ok) throw new Error(`ProbSevere frame HTTP ${response.status}`);
    const payload = (await response.json()) as Partial<ProbSevereCollection>;
    if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features))
      throw new Error("ProbSevere returned an invalid feature collection");
    return payload as ProbSevereCollection;
  });
}

async function recentFrameNames(signal: AbortSignal) {
  const index = await cached("index", 60_000, () => fetchText(INDEX_URL, signal));
  return Array.from(new Set(index.match(/MRMS_PROBSEVERE_\d{8}_\d{6}\.json/g) ?? [])).sort(
    (left, right) => (frameTime(left) ?? "").localeCompare(frameTime(right) ?? ""),
  );
}

function selectHistoryFrames(filenames: string[]) {
  const latest = filenames.at(-1);
  const latestTime = latest ? frameTime(latest) : undefined;
  if (!latest || !latestTime) return [];
  const latestMs = new Date(latestTime).getTime();
  const selected = [0, 5, 10, 15].flatMap((minutes) => {
    const target = latestMs - minutes * 60_000;
    const closest = filenames.reduce<string | undefined>((best, candidate) => {
      const candidateTime = frameTime(candidate);
      const bestTime = best ? frameTime(best) : undefined;
      if (!candidateTime) return best;
      if (!bestTime) return candidate;
      return Math.abs(new Date(candidateTime).getTime() - target) <
        Math.abs(new Date(bestTime).getTime() - target)
        ? candidate
        : best;
    }, undefined);
    return closest ? [closest] : [];
  });
  return Array.from(new Set(selected)).sort((left, right) =>
    (frameTime(left) ?? "").localeCompare(frameTime(right) ?? ""),
  );
}

function sampleFrom(
  feature: Feature<Polygon | MultiPolygon, ProbSevereProperties>,
  validTime: string,
): StormHistorySample {
  const center = centroid(feature);
  const properties = feature.properties;
  return {
    validTime,
    location: center,
    ...(probability(properties, "ProbSevere") !== undefined
      ? { probabilitySeverePct: probability(properties, "ProbSevere") }
      : {}),
    ...(probability(properties, "ProbTor") !== undefined
      ? { probabilityTornadoPct: probability(properties, "ProbTor") }
      : {}),
    ...(probability(properties, "ProbHail") !== undefined
      ? { probabilityHailPct: probability(properties, "ProbHail") }
      : {}),
    ...(probability(properties, "ProbWind") !== undefined
      ? { probabilityWindPct: probability(properties, "ProbWind") }
      : {}),
    ...(numeric(properties, "MESH") !== undefined
      ? { meshInches: numeric(properties, "MESH") }
      : {}),
    ...(numeric(properties, "FLASH_RATE") !== undefined
      ? { flashRatePerMinute: numeric(properties, "FLASH_RATE") }
      : {}),
    ...(numeric(properties, "COMPREF") !== undefined
      ? { compositeReflectivityDbz: numeric(properties, "COMPREF") }
      : {}),
    ...(numeric(properties, "MAXLLAZ") !== undefined
      ? { lowLevelAzimuthalShearS1: numeric(properties, "MAXLLAZ") }
      : {}),
  };
}

function trend(current: number | undefined, previous: number | undefined): StormTrend {
  if (current === undefined || previous === undefined) return "unknown";
  const change = current - previous;
  if (change >= 3) return "increasing";
  if (change <= -3) return "decreasing";
  return "steady";
}

function changeReason(label: string, current: number | undefined, previous: number | undefined) {
  if (current === undefined || previous === undefined) return undefined;
  const change = current - previous;
  const sign = change > 0 ? "+" : "";
  return `${label} ${sign}${change.toFixed(0)} points over ${change === 0 ? "the sampled history" : "about 15 minutes"}.`;
}

function guidanceHazard(
  kind: StormHazardKind,
  probabilityPct: number | undefined,
  previousProbabilityPct: number | undefined,
  validTime: string,
): StormHazardAssessment {
  if (probabilityPct === undefined)
    return {
      kind,
      status: "unavailable",
      score: null,
      probabilityPct: null,
      confidence: "unavailable",
      trend: "unknown",
      reasons: ["This ProbSevere frame did not supply a probability for this hazard."],
    };
  return {
    kind,
    status: "analyzed",
    score: null,
    probabilityPct,
    confidence: dataQuality(validTime),
    trend: trend(probabilityPct, previousProbabilityPct),
    reasons: [
      `NOAA/CIMSS ProbSevere next-hour ${kind} guidance is ${probabilityPct.toFixed(0)}%.`,
      changeReason("Probability change", probabilityPct, previousProbabilityPct),
      "This is probabilistic guidance for the tracked storm object, not an official warning or an exact event location.",
    ].filter((value): value is string => Boolean(value)),
  };
}

function unavailableHazard(kind: StormHazardKind): StormHazardAssessment {
  return {
    kind,
    status: "unavailable",
    score: null,
    probabilityPct: null,
    confidence: "unavailable",
    trend: "unknown",
    reasons: ["ProbSevere does not provide this hazard probability in the connected product."],
  };
}

function lightningHazard(
  current: StormHistorySample,
  previous: StormHistorySample | undefined,
  validTime: string,
): StormHazardAssessment {
  const rate = current.flashRatePerMinute;
  if (rate === undefined) return unavailableHazard("lightning");
  return {
    kind: "lightning",
    status: "analyzed",
    score: null,
    probabilityPct: null,
    confidence: dataQuality(validTime),
    trend: trend(rate, previous?.flashRatePerMinute),
    reasons: [
      `Current provider flash-rate predictor: ${rate.toFixed(0)} flashes/min.`,
      changeReason("Flash-rate change", rate, previous?.flashRatePerMinute),
      "Flash rate is context, not a probability and not an individual-strike location.",
    ].filter((value): value is string => Boolean(value)),
  };
}

function motionFromHistory(
  history: StormHistorySample[],
  latestSource: WeatherSourceMetadata,
): StormMotion | null {
  const latest = history.at(-1);
  const previous = history.find(
    (sample) =>
      latest &&
      new Date(latest.validTime).getTime() - new Date(sample.validTime).getTime() >= 4 * 60_000,
  );
  if (!latest || !previous) return null;
  const elapsedSeconds =
    (new Date(latest.validTime).getTime() - new Date(previous.validTime).getTime()) / 1_000;
  const traveledMeters =
    distance(previous.location, latest.location, { units: "kilometers" }) * 1_000;
  const speedMS = traveledMeters / elapsedSeconds;
  if (!Number.isFinite(speedMS) || speedMS <= 0.5 || speedMS > 80) return null;
  return {
    bearingDeg: ((bearing(previous.location, latest.location) % 360) + 360) % 360,
    speedMS,
    validTime: latest.validTime,
    source: sourceMetadata({
      providerId: "landdraft-probsevere-motion",
      providerName: "LandDraft decision support",
      product: "ProbSevere object-centroid motion",
      temporalKind: "estimated",
      sourceTimestamp: latest.validTime,
      validTime: latest.validTime,
      quality: "moderate",
      confidence: 0.62,
      qualityFlags: ["DERIVED", "RECENT_OBJECT_HISTORY", "NOT_AN_OFFICIAL_TRACK"],
      rawSourceReference: latestSource.rawSourceReference,
      attribution: `${latestSource.attribution}; LandDraft centroid-motion calculation`,
    }),
  };
}

function evidenceFor(properties: ProbSevereProperties, validTime: string) {
  const entries: Array<[string, number | undefined, string]> = [
    ["Composite reflectivity", numeric(properties, "COMPREF"), "dBZ"],
    ["MESH", numeric(properties, "MESH"), "in"],
    ["Flash rate", numeric(properties, "FLASH_RATE"), "flashes/min"],
    ["Low-level azimuthal shear", numeric(properties, "MAXLLAZ"), "s⁻¹"],
    ["Mixed-layer CAPE", numeric(properties, "MLCAPE"), "J/kg"],
    ["Effective bulk shear", numeric(properties, "EBSHEAR"), "provider units"],
    ["0–1 km SRH", numeric(properties, "SRH01KM"), "m²/s²"],
    ["LCL", numeric(properties, "LCL"), "m"],
  ];
  return entries.flatMap(([label, value, unit], index) =>
    value === undefined
      ? []
      : [
          {
            id: `${label}-${index}`,
            label,
            value: `${value} ${unit}`,
            kind: "observed" as const,
            validTime,
            providerId: PROVIDER_ID,
            sourceReference: INDEX_URL,
          },
        ],
  );
}

function stormFromFeature(
  feature: Feature<Polygon | MultiPolygon, ProbSevereProperties>,
  validTime: string,
  history: StormHistorySample[],
  filename: string,
): StormObject | null {
  const providerId = String(feature.properties.ID ?? "").trim();
  if (!providerId) return null;
  const source = sourceMetadata({
    providerId: PROVIDER_ID,
    providerName: PROVIDER_NAME,
    product: "ProbSevere v3 tracked storm object",
    temporalKind: "forecast",
    sourceTimestamp: validTime,
    validTime,
    expirationTime: new Date(new Date(validTime).getTime() + 6 * 60_000).toISOString(),
    quality: dataQuality(validTime),
    confidence: dataQuality(validTime) === "stale" ? 0.2 : 0.75,
    resolution: "Storm-object polygon; approximately 2-minute update cycle",
    qualityFlags: [
      "NOAA_GUIDANCE",
      "NEXT_HOUR_PROBABILITIES",
      "NOT_AN_OFFICIAL_WARNING",
      ...(dataQuality(validTime) === "stale" ? ["STALE"] : []),
    ],
    rawSourceReference: `${INDEX_URL}${filename}`,
    attribution: "NOAA / CIMSS ProbSevere v3 via NCEP MRMS",
  });
  const current = history.at(-1) ?? sampleFrom(feature, validTime);
  const previous = history[0];
  const tornado = probability(feature.properties, "ProbTor");
  const hail = probability(feature.properties, "ProbHail");
  const wind = probability(feature.properties, "ProbWind");
  const motion = motionFromHistory(history, source);
  return {
    id: `LD-STORM-${validTime.slice(0, 10).replaceAll("-", "")}-PS${providerId}`,
    title: `ProbSevere storm ${providerId}`,
    classification: "Tracked convective storm object",
    classificationConfidence: dataQuality(validTime),
    basis: "provider-guidance",
    statusLabel: "NOAA PROBSEVERE GUIDANCE · NOT AN OFFICIAL WARNING",
    centroid: centroid(feature),
    geometry: { type: "Feature", properties: {}, geometry: feature.geometry },
    observedAt: validTime,
    validFrom: validTime,
    validUntil: source.expirationTime,
    officialAlertIds: [],
    hazards: {
      tornado: guidanceHazard("tornado", tornado, previous?.probabilityTornadoPct, validTime),
      hail: guidanceHazard("hail", hail, previous?.probabilityHailPct, validTime),
      wind: guidanceHazard("wind", wind, previous?.probabilityWindPct, validTime),
      flood: unavailableHazard("flood"),
      lightning: lightningHazard(current, previous, validTime),
    },
    motion,
    forecastPositions: motion
      ? forecastFromValidatedMotion(centroid(feature), motion, [5, 10, 15, 30, 45, 60])
      : [],
    history,
    evidence: [
      {
        id: `${providerId}-probsevere`,
        label: "Any-severe probability",
        value:
          probability(feature.properties, "ProbSevere") === undefined
            ? "Unavailable"
            : `${probability(feature.properties, "ProbSevere")!.toFixed(0)}% in the next hour`,
        kind: "model",
        validTime,
        providerId: PROVIDER_ID,
        sourceReference: source.rawSourceReference,
      },
      ...evidenceFor(feature.properties, validTime),
    ],
    limitations: [
      "ProbSevere is NOAA/CIMSS probabilistic guidance for the next hour; it is not an official warning.",
      "The generic tracked-object label is not a supercell or tornado classification.",
      ...(motion
        ? [
            "Future positions are LandDraft motion-only extrapolations from recent provider centroids; they are not deterministic storm tracks.",
          ]
        : ["No future corridor is drawn because recent matching object history was insufficient."]),
      "Displayed predictors explain available context but are not local feature-attribution values from the ProbSevere model.",
    ],
    source,
  };
}

export async function loadProbSevereStormObjects(
  request: WeatherPointRequest,
  signal: AbortSignal,
): Promise<StormObject[]> {
  const filenames = await recentFrameNames(signal);
  const selectedNames = selectHistoryFrames(filenames);
  if (!selectedNames.length) throw new Error("ProbSevere published no current frame");
  const frames = await Promise.all(
    selectedNames.map(async (filename) => ({
      filename,
      validTime: frameTime(filename)!,
      data: await fetchFrame(filename, signal),
    })),
  );
  return normalizeProbSevereFrames(frames, request);
}

/** Pure normalizer used by the gateway and deterministic fixture tests. */
export function normalizeProbSevereFrames(
  frames: ProbSevereInputFrame[],
  request: WeatherPointRequest,
): StormObject[] {
  const latest = frames.at(-1);
  if (!latest) return [];
  const requestPoint = point([request.longitude, request.latitude]);
  return latest.data.features
    .flatMap((feature) => {
      const providerId = String(feature.properties.ID ?? "").trim();
      if (!providerId) return [];
      const history = frames.flatMap((frame) => {
        const match = frame.data.features.find(
          (candidate) => String(candidate.properties.ID ?? "").trim() === providerId,
        );
        return match ? [sampleFrom(match, frame.validTime)] : [];
      });
      const storm = stormFromFeature(feature, latest.validTime, history, latest.filename);
      return storm ? [storm] : [];
    })
    .sort((left, right) => {
      const maximum = (storm: StormObject) =>
        Math.max(
          storm.hazards.tornado.probabilityPct ?? -1,
          storm.hazards.hail.probabilityPct ?? -1,
          storm.hazards.wind.probabilityPct ?? -1,
        );
      return (
        maximum(right) - maximum(left) ||
        distance(requestPoint, left.centroid) - distance(requestPoint, right.centroid)
      );
    })
    .slice(0, 150);
}
