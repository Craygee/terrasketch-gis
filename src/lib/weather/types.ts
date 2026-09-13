import type { Feature, MultiPolygon, Point, Polygon } from "geojson";

export const WEATHER_MODULE_ID = "weather" as const;
export const WEATHER_LAYER_ID_PATTERN = /^weather\.[a-z0-9._-]+$/i;

export const WEATHER_CAPABILITIES = [
  "weather.basic",
  "weather.radar",
  "weather.advanced",
  "weather.satellite",
  "weather.lightning",
  "weather.forecasting",
  "weather.meteorology",
  "weather.severe",
  "weather.severe_intelligence",
  "weather.storm_chaser",
  "weather.hurricane",
  "weather.aviation",
  "weather.photography",
  "weather.infrastructure",
  "weather.historical",
  "weather.models",
  "weather.ai_analysis",
  "weather.enterprise",
] as const;

export type WeatherCapability = (typeof WEATHER_CAPABILITIES)[number];
export type WeatherUnitSystem = "us" | "metric" | "meteorological";
export type WeatherTemporalKind =
  "observed" | "forecast" | "model" | "estimated" | "development" | "unavailable";
export type WeatherFreshness = "live" | "recent" | "delayed" | "stale" | "unavailable";
export type WeatherQuality = "high" | "moderate" | "low" | "stale" | "estimated" | "unavailable";
export type WeatherProviderStatus = "up" | "degraded" | "down" | "not-configured";
export type WeatherLayerDataType = "point" | "geojson" | "raster" | "vector-field" | "grid";

export interface WeatherSourceMetadata {
  providerId: string;
  providerName: string;
  product: string;
  temporalKind: WeatherTemporalKind;
  sourceTimestamp?: string | undefined;
  receivedTimestamp: string;
  validTime?: string | undefined;
  expirationTime?: string | undefined;
  resolution?: string | undefined;
  confidence?: number | undefined;
  quality: WeatherQuality;
  qualityFlags: string[];
  rawSourceReference?: string | undefined;
  attribution: string;
}

export interface WeatherObservation {
  id: string;
  location: Feature<Point>;
  stationId?: string | undefined;
  placeName?: string | undefined;
  summary?: string | undefined;
  temperatureK?: number | undefined;
  apparentTemperatureK?: number | undefined;
  dewpointK?: number | undefined;
  relativeHumidityPct?: number | undefined;
  windSpeedMS?: number | undefined;
  windGustMS?: number | undefined;
  windDirectionDeg?: number | undefined;
  pressurePa?: number | undefined;
  visibilityM?: number | undefined;
  precipitationMm?: number | undefined;
  cloudCoverPct?: number | undefined;
  source: WeatherSourceMetadata;
}

export interface WeatherForecastPeriod {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  temperatureK?: number | undefined;
  precipitationProbabilityPct?: number | undefined;
  windSpeedMS?: number | undefined;
  windGustMS?: number | undefined;
  windDirectionDeg?: number | undefined;
  summary: string;
  detailedSummary?: string | undefined;
  isDaytime?: boolean | undefined;
  source: WeatherSourceMetadata;
}

export type WeatherAlertSeverity = "extreme" | "severe" | "moderate" | "minor" | "unknown";
export type WeatherAlertStatus = "actual" | "exercise" | "system" | "test" | "draft" | "unknown";

export interface WeatherAlert {
  id: string;
  event: string;
  headline: string;
  description: string;
  instruction?: string | undefined;
  areaDescription?: string | undefined;
  severity: WeatherAlertSeverity;
  certainty?: string | undefined;
  urgency?: string | undefined;
  status: WeatherAlertStatus;
  senderName?: string | undefined;
  messageType?: string | undefined;
  response?: string | undefined;
  category?: string | undefined;
  parameters?: Record<string, string[]> | undefined;
  geometry: Feature<Polygon | MultiPolygon> | null;
  source: WeatherSourceMetadata;
}

export type StormHazardKind = "tornado" | "hail" | "wind" | "flood" | "lightning";
export type StormObjectBasis =
  | "official-alert-area"
  | "official-report"
  | "radar-indicated"
  | "observed"
  | "model"
  | "provider-guidance"
  | "landdraft-derived";
export type StormTrend = "increasing" | "steady" | "decreasing" | "unknown";

export interface StormHazardAssessment {
  kind: StormHazardKind;
  status: "official-context" | "analyzed" | "unavailable";
  /** A LandDraft analysis score, never a literal probability unless calibrated separately. */
  score: number | null;
  probabilityPct: number | null;
  confidence: WeatherQuality;
  trend: StormTrend;
  reasons: string[];
}

export interface StormEvidence {
  id: string;
  label: string;
  value?: string | undefined;
  kind: "official" | "observed" | "model" | "derived";
  validTime?: string | undefined;
  providerId: string;
  sourceReference?: string | undefined;
}

export interface StormMotion {
  bearingDeg: number;
  speedMS: number;
  validTime: string;
  source: WeatherSourceMetadata;
}

export interface StormForecastPosition {
  leadMinutes: number;
  location: Feature<Point>;
  likelyRadiusKm: number;
  possibleRadiusKm: number;
  confidence: WeatherQuality;
  validTime: string;
  source: WeatherSourceMetadata;
}

export interface StormHistorySample {
  validTime: string;
  location: Feature<Point>;
  probabilitySeverePct?: number | undefined;
  probabilityTornadoPct?: number | undefined;
  probabilityHailPct?: number | undefined;
  probabilityWindPct?: number | undefined;
  meshInches?: number | undefined;
  flashRatePerMinute?: number | undefined;
  compositeReflectivityDbz?: number | undefined;
  lowLevelAzimuthalShearS1?: number | undefined;
}

/**
 * Provider-independent severe-weather object. Phase-one objects can be based on
 * official alert areas without claiming that a radar-observed storm was found.
 */
export interface StormObject {
  id: string;
  title: string;
  classification: string;
  classificationConfidence: WeatherQuality;
  basis: StormObjectBasis;
  statusLabel: string;
  centroid: Feature<Point>;
  geometry: Feature<Polygon | MultiPolygon> | null;
  observedAt: string;
  validFrom?: string | undefined;
  validUntil?: string | undefined;
  officialAlertIds: string[];
  hazards: Record<StormHazardKind, StormHazardAssessment>;
  motion: StormMotion | null;
  forecastPositions: StormForecastPosition[];
  history: StormHistorySample[];
  evidence: StormEvidence[];
  limitations: string[];
  source: WeatherSourceMetadata;
}

export interface StormRelativePosition {
  distanceMiles: number;
  bearingDeg: number;
  cardinalBearing: string;
  insideOfficialAlert: boolean;
  insideAnalyzedArea: boolean;
  exposure: "inside-official-hazard" | "near-official-hazard" | "outside-analyzed-area";
  message: string;
}

export interface RadarFrame {
  id: string;
  timestamp: string;
  tileUrlTemplate: string;
  legendUrl?: string | undefined;
  coverage: "conus" | "alaska" | "hawaii" | "caribbean" | "guam" | "global";
  source: WeatherSourceMetadata;
}

export interface WeatherRasterFrame {
  id: string;
  layerId: string;
  timestamp: string;
  tileUrlTemplate: string;
  legendUrl?: string | undefined;
  coverage: string;
  source: WeatherSourceMetadata;
}

export interface WeatherStationObservation {
  id: string;
  stationId: string;
  location: Feature<Point>;
  stationName?: string | undefined;
  temperatureK?: number | undefined;
  dewpointK?: number | undefined;
  windSpeedMS?: number | undefined;
  windGustMS?: number | undefined;
  windDirectionDeg?: number | undefined;
  pressurePa?: number | undefined;
  visibilityM?: number | undefined;
  flightCategory?: string | undefined;
  rawObservation?: string | undefined;
  source: WeatherSourceMetadata;
}

/** A current chaser/spotter position with explicit source and privacy provenance. */
export interface WeatherChaserPosition {
  id: string;
  location: Feature<Point>;
  observedAt: string;
  motionStatus: "moving" | "stationary" | "unknown";
  featured: boolean;
  memberClass: "trained-spotter" | "experienced-reporter" | "unknown";
  displayName?: string | undefined;
  callsign?: string | undefined;
  organization?: string | undefined;
  headingDeg?: number | undefined;
  speedMS?: number | undefined;
  source: WeatherSourceMetadata;
}

export type WeatherStormReportKind =
  "tornado" | "hail" | "wind" | "flood" | "lightning" | "winter" | "other";

/** A time-stamped NWS Local Storm Report location, never a live person location. */
export interface WeatherStormReport {
  id: string;
  event: string;
  kind: WeatherStormReportKind;
  location: Feature<Point>;
  observedAt: string;
  city?: string | undefined;
  county?: string | undefined;
  state?: string | undefined;
  magnitude?: number | undefined;
  office?: string | undefined;
  reportedBy?: string | undefined;
  remarks?: string | undefined;
  source: WeatherSourceMetadata;
}

export type WeatherRiskLevel = "lower" | "elevated" | "high" | "unknown";

export interface WeatherViewingZone {
  id: string;
  name: string;
  location: Feature<Point>;
  radiusMiles: number;
  score: number | null;
  confidence: WeatherQuality;
  riskLevel: WeatherRiskLevel;
  distanceFromTargetMiles: number;
  targetBearingDeg: number;
  reasons: string[];
  cautions: string[];
  activeAlertCount: number;
  source: WeatherSourceMetadata;
}

export interface WeatherPhotographyAssessment {
  status: "ready" | "no-severe-target" | "insufficient-data";
  validTime: string;
  targetDescription: string;
  zones: WeatherViewingZone[];
  methodology: string;
  limitations: string[];
}

export interface WeatherProviderHealth {
  providerId: string;
  providerName: string;
  status: WeatherProviderStatus;
  products: string[];
  coverage: string;
  latencyMs?: number | undefined;
  lastSuccessfulRequest?: string | undefined;
  lastUpdate?: string | undefined;
  error?: string | undefined;
  costClass: "public" | "evaluation" | "commercial" | "self-hosted";
}

export interface WeatherProviderUsageMetric {
  providerId: string;
  product: string;
  requests: number;
  successes: number;
  failures: number;
  cacheHits: number;
  dataVolumeBytes: number | null;
  estimatedCostUsd: number | null;
  updatedAt: string;
}

export interface WeatherLayerDefinition {
  id: string;
  name: string;
  group: string;
  description: string;
  capability: WeatherCapability;
  dataType: WeatherLayerDataType;
  providerProducts: string[];
  units?: string | undefined;
  legend?: Array<{ color: string; label: string }> | undefined;
  defaultOpacity: number;
  minZoom: number;
  maxZoom: number;
  animationSupport: boolean;
  timeSupport: boolean;
  inspectSupport: boolean;
  mobileVisibility: "primary" | "drawer" | "professional";
  audience: "basic" | "professional";
  attribution?: string | undefined;
  providerName?: string | undefined;
  providerCostMultiplier?: number | undefined;
  coverage?: string | undefined;
}

export interface WeatherLayerSetting {
  opacity: number;
  favorite: boolean;
  visible: boolean;
  menuVisible: boolean;
}

export interface WeatherTimelineState {
  mode: "observed" | "forecast" | "historical";
  selectedTime: string;
  rangeStart: string;
  rangeEnd: string;
  playing: boolean;
  loop: boolean;
  speed: 0.5 | 1 | 2;
}

export interface WeatherPreset {
  id: string;
  name: string;
  builtIn?: boolean | undefined;
  layerSettings: Record<string, WeatherLayerSetting>;
  layerOrder?: string[] | undefined;
  timelineMode: WeatherTimelineState["mode"];
  createdAt: string;
}

export interface WeatherWorkspaceState {
  version: 1;
  enabled: boolean;
  introductoryChooserSeen: boolean;
  unitSystem: WeatherUnitSystem;
  selectedCategory: string;
  inspectorEnabled: boolean;
  layerSettings: Record<string, WeatherLayerSetting>;
  layerOrder: string[];
  timeline: WeatherTimelineState;
  presets: WeatherPreset[];
  activePresetId?: string | undefined;
  lastInspectionPoint?: [number, number] | undefined;
}

export interface WeatherPointRequest {
  latitude: number;
  longitude: number;
  requestedLayerIds?: string[] | undefined;
  /**
   * Client capability hint used only to decide whether to return commercial
   * tile descriptors. The tile proxy independently authenticates the user and
   * resolves their encrypted provider credentials before every upstream call.
   */
  xweatherConnected?: boolean | undefined;
}

export interface WeatherBundle {
  request: WeatherPointRequest;
  generatedAt: string;
  current: WeatherObservation | null;
  forecast: WeatherForecastPeriod[];
  alerts: WeatherAlert[];
  stormObjects: StormObject[];
  radarFrames: RadarFrame[];
  rasterFrames: WeatherRasterFrame[];
  stationObservations: WeatherStationObservation[];
  chaserPositions: WeatherChaserPosition[];
  stormReports: WeatherStormReport[];
  photography: WeatherPhotographyAssessment | null;
  providerHealth: WeatherProviderHealth[];
  warnings: string[];
  coverage: {
    nws: boolean;
    radar: boolean;
    globalForecast: boolean;
    satellite: boolean;
    lightningDensity: boolean;
  };
}

export interface WeatherProviderContext {
  now: Date;
  signal: AbortSignal;
}

export interface WeatherProviderAdapter {
  id: string;
  name: string;
  products: string[];
  coverage: string;
  costClass: WeatherProviderHealth["costClass"];
  supportsPoint(input: WeatherPointRequest): boolean;
  loadPoint(
    input: WeatherPointRequest,
    context: WeatherProviderContext,
  ): Promise<{
    current: WeatherObservation | null;
    forecast: WeatherForecastPeriod[];
    warnings: string[];
  }>;
}
