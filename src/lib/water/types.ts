import type { Feature, MultiPolygon, Point, Polygon } from "geojson";

export type WaterClassification = "OBSERVED" | "DERIVED" | "INTERPOLATED" | "MODELED" | "INFERRED";
export type WaterArea = Feature<Polygon | MultiPolygon>;
export type WaterSourceId = "usgs-sites" | "twdb-wells" | "usgs-measurements" | "twdb-aquifers";
export interface WaterSource {
  id: WaterSourceId;
  agency: string;
  title: string;
  url: string;
  endpoint: string;
  terms: string;
  attribution: string;
  coverage: string;
  license: "PUBLIC_OPEN" | "REVIEW_REQUIRED";
  enabled: boolean;
  exportAllowed: boolean;
  cacheSeconds: number;
  reviewedAt: string;
}
export interface WaterRecord {
  id: string;
  sourceId: WaterSourceId;
  sourceRecordId: string;
  name: string;
  kind: string;
  geometry: Point | Polygon | MultiPolygon;
  classification: WaterClassification;
  evidence: "Source reported";
  aquifer: string | null;
  county: string | null;
  state: string | null;
  huc: string | null;
  depth: number | null;
  depthUnit: "ft" | null;
  verticalDatum: string | null;
  locationAccuracy: string | null;
  observationTime: string | null;
  retrievedAt: string;
  sourceUrl: string;
  raw: Record<string, unknown>;
  flags: string[];
  measurement?: {
    parameterCode: string;
    originalValue: string;
    value: number | null;
    unit: string | null;
    approval: string | null;
    qualifier: string | null;
  };
}
export interface WaterSourceResult {
  sourceId: WaterSourceId;
  status: "available" | "degraded" | "unavailable" | "rate-limited" | "outside-coverage";
  retrievedAt: string;
  records: WaterRecord[];
  message: string;
  truncated: boolean;
  requestUrl: string;
  rejectedCount: number;
}
export interface WaterAnalysis {
  id: string;
  version: "water-evidence-1";
  area: WaterArea;
  createdAt: string;
  results: WaterSourceResult[];
}
export interface WaterWorkspaceState {
  version: 1;
  enabled: boolean;
  area?: WaterArea;
  analysis?: WaterAnalysis;
}

// Extension contract; optional methods are absent until their adapter is verified.
export interface WaterAdapter {
  metadata(): WaterSource;
  fetchFeatures(area: WaterArea): Promise<WaterSourceResult>;
  healthCheck(): Promise<{ status: string; checkedAt: string }>;
  fetchTimeSeries?: (siteId: string) => Promise<unknown>;
  fetchDocuments?: (area: WaterArea) => Promise<unknown>;
}
export const WATER_DISCLAIMER =
  "LandDraft Water is desktop-level hydrogeologic screening based on available public/user-provided information. Subsurface conditions can vary; aquifer depths, yields, quality, availability and production potential require field verification and appropriate professional evaluation before drilling, acquisition, design or investment decisions.";
