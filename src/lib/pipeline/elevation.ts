import type { Position } from "geojson";
import type { ElevationSample, PipelineRoute } from "./types";

export interface ElevationProviderDescriptor {
  id: string;
  name: string;
  authority: string;
  availability: "available" | "configuration-required" | "planned";
  potentialCost: "free-public-service" | "provider-usage-based" | "project-supplied";
  sourceUrl: string;
}

export interface ElevationRequest {
  route: PipelineRoute;
  maximumSpacingM: number;
  preferredResolutionM?: number;
}

export interface ElevationBatch {
  providerId: string;
  routeId: string;
  geometryRevision: number;
  samples: ElevationSample[];
  requestedAt: number;
  completedAt: number;
  warnings: string[];
}

export interface ElevationProvider {
  descriptor: ElevationProviderDescriptor;
  sampleRoute(request: ElevationRequest, signal: AbortSignal): Promise<ElevationBatch>;
}

export const elevationProviderCatalog: ElevationProviderDescriptor[] = [
  {
    id: "manual-survey",
    name: "Manual / surveyed elevations",
    authority: "Project-provided",
    availability: "available",
    potentialCost: "project-supplied",
    sourceUrl: "project://manual-survey",
  },
  {
    id: "usgs-3dep",
    name: "USGS 3DEP",
    authority: "U.S. Geological Survey",
    availability: "planned",
    potentialCost: "free-public-service",
    sourceUrl: "https://www.usgs.gov/the-national-map-data-delivery/gis-data-download",
  },
  {
    id: "esri-elevation",
    name: "Esri Elevation/Profile",
    authority: "Esri hosted service",
    availability: "configuration-required",
    potentialCost: "provider-usage-based",
    sourceUrl: "https://developers.arcgis.com/rest/elevation/index.html",
  },
];

export function applyLinearManualElevation(input: {
  route: PipelineRoute;
  startElevationM: number;
  endElevationM: number;
  source: string;
}): PipelineRoute {
  const now = Date.now();
  const samples = input.route.stations.map((station, index) => {
    const ratio = input.route.lengthM <= 0 ? 0 : station.stationM / input.route.lengthM;
    const groundElevationM =
      input.startElevationM + (input.endElevationM - input.startElevationM) * ratio;
    return {
      id: `manual-elevation-${input.route.id}-${index}-${now}`,
      stationM: station.stationM,
      coordinate: [...station.coordinate] as Position,
      groundElevationM,
      source: input.source,
      sourceKind: "manual" as const,
      capturedAt: now,
      quality: "unknown" as const,
      provenance: "user" as const,
    };
  });
  return {
    ...input.route,
    elevationSamples: samples,
    stations: input.route.stations.map((station, index) => ({
      ...station,
      groundElevationM: samples[index]!.groundElevationM,
      pipelineElevationM: samples[index]!.groundElevationM,
      elevationSampleId: samples[index]!.id,
    })),
    updatedAt: now,
  };
}
