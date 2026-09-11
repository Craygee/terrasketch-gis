import type { Feature, MultiPolygon, Point, Polygon } from "geojson";

export const WEATHER_MODULE_ID = "weather" as const;

export const WEATHER_CAPABILITIES = [
  "weather.basic",
  "weather.radar",
  "weather.satellite",
  "weather.lightning",
  "weather.forecasting",
  "weather.meteorology",
  "weather.severe",
  "weather.storm_chaser",
  "weather.photography",
  "weather.infrastructure",
  "weather.historical",
  "weather.models",
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
  geometry: Feature<Polygon | MultiPolygon> | null;
  source: WeatherSourceMetadata;
}

export interface RadarFrame {
  id: string;
  timestamp: string;
  tileUrlTemplate: string;
  legendUrl?: string | undefined;
  coverage: "conus" | "alaska" | "hawaii" | "caribbean" | "guam";
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
}

export interface WeatherLayerSetting {
  opacity: number;
  favorite: boolean;
  visible: boolean;
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
  timeline: WeatherTimelineState;
  presets: WeatherPreset[];
  activePresetId?: string | undefined;
  lastInspectionPoint?: [number, number] | undefined;
}

export interface WeatherPointRequest {
  latitude: number;
  longitude: number;
  requestedLayerIds?: string[] | undefined;
}

export interface WeatherBundle {
  request: WeatherPointRequest;
  generatedAt: string;
  current: WeatherObservation | null;
  forecast: WeatherForecastPeriod[];
  alerts: WeatherAlert[];
  radarFrames: RadarFrame[];
  rasterFrames: WeatherRasterFrame[];
  stationObservations: WeatherStationObservation[];
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
