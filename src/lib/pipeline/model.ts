import type { Feature, LineString, Position } from "geojson";
import type {
  PipeSpecification,
  PipelineEngineeringState,
  PipelineFluid,
  PipelineRoute,
  PipelineScenario,
} from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);
const INCH_TO_M = 0.0254;
const PSI_TO_PA = 6_894.757293;
const GPM_TO_M3S = 0.0000630901964;

export const SYSTEM_FLUIDS: PipelineFluid[] = [
  {
    id: "fluid-freshwater",
    name: "Freshwater — 68°F",
    family: "liquid",
    kind: "freshwater",
    densityKgM3: 998.2,
    dynamicViscosityPaS: 0.001002,
    vaporPressurePa: 2_339,
    source: "LandDraft preliminary template; user confirmation required",
  },
  {
    id: "fluid-potable-water",
    name: "Potable water — 68°F",
    family: "liquid",
    kind: "potable-water",
    densityKgM3: 998.2,
    dynamicViscosityPaS: 0.001002,
    vaporPressurePa: 2_339,
    source: "LandDraft preliminary template; user confirmation required",
  },
  {
    id: "fluid-produced-water",
    name: "Produced water — define properties",
    family: "liquid",
    kind: "produced-water",
    source: "Project-specific properties required",
  },
  {
    id: "fluid-natural-gas",
    name: "Natural gas — advanced solver required",
    family: "gas",
    kind: "natural-gas",
    source: "Composition and EOS inputs required",
  },
  {
    id: "fluid-dense-co2",
    name: "Dense-phase CO₂ — advanced solver required",
    family: "advanced",
    kind: "dense-phase-co2",
    source: "Specialist property and phase-behavior analysis required",
  },
];

function steelPipe(
  id: string,
  nominalSizeIn: number,
  outsideDiameterIn: number,
  wallThicknessIn: number,
): PipeSpecification {
  return {
    id,
    name: `${nominalSizeIn}" steel screening option · ${wallThicknessIn.toFixed(3)}" WT`,
    serviceFamilies: ["liquid", "gas"],
    nominalSizeIn,
    outsideDiameterM: outsideDiameterIn * INCH_TO_M,
    wallThicknessM: wallThicknessIn * INCH_TO_M,
    insideDiameterM: (outsideDiameterIn - 2 * wallThicknessIn) * INCH_TO_M,
    material: "carbon-steel",
    grade: "API 5L X52 — confirm",
    manufacturingSpecification: "API 5L — edition and applicability must be confirmed",
    roughnessM: 0.000045,
    corrosionAllowanceM: 0,
    jointType: "welded — confirm",
    joiningMethod: "field weld — confirm",
    standardLengthM: 12.192,
    source: "LandDraft dimensional screening template; not a certified material selection",
  };
}

export const SYSTEM_PIPE_SPECIFICATIONS: PipeSpecification[] = [
  steelPipe("pipe-steel-8", 8, 8.625, 0.322),
  steelPipe("pipe-steel-12", 12, 12.75, 0.375),
  steelPipe("pipe-steel-16", 16, 16, 0.5),
  steelPipe("pipe-steel-24", 24, 24, 0.5),
];

export function emptyPipelineEngineeringState(): PipelineEngineeringState {
  const now = Date.now();
  return {
    schemaVersion: 1,
    enabled: true,
    readiness: "preliminary-unvalidated",
    routes: [],
    fluids: SYSTEM_FLUIDS.map((fluid) => ({ ...fluid })),
    pipeSpecifications: SYSTEM_PIPE_SPECIFICATIONS.map((pipe) => ({ ...pipe })),
    components: [],
    scenarios: [],
    solverRuns: [],
    quantitySnapshots: [],
    vendorLibrary: [],
    priceSnapshots: [],
    preferences: {
      profileOpen: true,
      leftPanelOpen: true,
      rightPanelOpen: true,
      visualizationMode: "pressure-margin",
      selectedRightPanel: "engineering",
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultScenario(routeId: string): PipelineScenario {
  const now = Date.now();
  return {
    id: `scenario-${uid()}`,
    name: "Base liquid case",
    routeId,
    fluidId: "fluid-freshwater",
    pipeSpecificationId: "pipe-steel-12",
    solverId: "liquid-steady-v1",
    inletPressurePa: 1_000 * PSI_TO_PA,
    flowM3S: 1_000 * GPM_TO_M3S,
    temperatureK: 293.15,
    totalMinorLossK: 0,
    liveSolve: true,
    limits: {
      minimumPressurePa: 100 * PSI_TO_PA,
      maopPa: 1_440 * PSI_TO_PA,
      minimumPressureMarginPa: 100 * PSI_TO_PA,
      maximumVelocityMS: 3.05,
    },
    estimateAssumptions: {
      currency: "USD",
      contingencyPercent: 15,
      markupPercent: 10,
      evidenceClass: "budget-allowance",
    },
    createdAt: now,
    updatedAt: now,
  };
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function coordinateDistanceM(a: Position, b: Position): number {
  const earthRadiusM = 6_371_008.8;
  const lat1 = radians(a[1] ?? 0);
  const lat2 = radians(b[1] ?? 0);
  const dLat = lat2 - lat1;
  const dLon = radians((b[0] ?? 0) - (a[0] ?? 0));
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(value)));
}

export function geometryHash(coordinates: Position[]): string {
  const source = coordinates
    .map((coordinate) => `${Number(coordinate[0]).toFixed(7)},${Number(coordinate[1]).toFixed(7)}`)
    .join(";");
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export function routeFromLineFeature(input: {
  layerId: string;
  layerName: string;
  featureIndex: number;
  feature: Feature<LineString>;
  previous?: PipelineRoute;
}): PipelineRoute {
  const coordinates = input.feature.geometry.coordinates.map((coordinate) => [...coordinate]);
  let stationM = 0;
  const stations = coordinates.map((coordinate, index) => {
    if (index > 0) stationM += coordinateDistanceM(coordinates[index - 1]!, coordinate);
    const prior = input.previous?.stations.find(
      (sample) => Math.abs(sample.stationM - stationM) < 0.01,
    );
    return {
      stationM,
      coordinate,
      ...(prior?.groundElevationM !== undefined
        ? { groundElevationM: prior.groundElevationM }
        : {}),
      ...(prior?.pipelineElevationM !== undefined
        ? { pipelineElevationM: prior.pipelineElevationM }
        : {}),
      ...(prior?.elevationSampleId ? { elevationSampleId: prior.elevationSampleId } : {}),
    };
  });
  const properties = input.feature.properties ?? {};
  const featureName = ["NAME", "Name", "name", "LABEL", "label"]
    .map((key) => properties[key])
    .find((value) => typeof value === "string" && value.trim());
  const now = Date.now();
  return {
    id: input.previous?.id ?? `route-${uid()}`,
    name:
      input.previous?.name ??
      (typeof featureName === "string"
        ? `${input.layerName} · ${featureName}`
        : `${input.layerName} · Feature ${input.featureIndex + 1}`),
    sourceLayerId: input.layerId,
    sourceFeatureIndex: input.featureIndex,
    ...(input.feature.id === undefined ? {} : { sourceFeatureId: String(input.feature.id) }),
    geometryHash: geometryHash(coordinates),
    geometryRevision: (input.previous?.geometryRevision ?? 0) + 1,
    coordinates,
    stations,
    elevationSamples: input.previous?.elevationSamples ?? [],
    lengthM: stationM,
    sourceNodeName: input.previous?.sourceNodeName ?? "Source",
    destinationNodeName: input.previous?.destinationNodeName ?? "Destination",
    crossings: input.previous?.crossings ?? [],
    constructionRanges: input.previous?.constructionRanges ?? [],
    createdAt: input.previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export function pointAtStation(route: PipelineRoute, requestedStationM: number): Position {
  if (route.stations.length === 0) return [0, 0];
  if (requestedStationM <= 0) return route.stations[0]!.coordinate;
  if (requestedStationM >= route.lengthM) return route.stations.at(-1)!.coordinate;
  for (let index = 1; index < route.stations.length; index += 1) {
    const end = route.stations[index]!;
    if (requestedStationM > end.stationM) continue;
    const start = route.stations[index - 1]!;
    const denominator = Math.max(1e-9, end.stationM - start.stationM);
    const ratio = (requestedStationM - start.stationM) / denominator;
    return [
      Number(start.coordinate[0]) +
        (Number(end.coordinate[0]) - Number(start.coordinate[0])) * ratio,
      Number(start.coordinate[1]) +
        (Number(end.coordinate[1]) - Number(start.coordinate[1])) * ratio,
    ];
  }
  return route.stations.at(-1)!.coordinate;
}

export function pipelineInputHash(
  route: PipelineRoute,
  scenario: PipelineScenario,
  fluid: PipelineFluid,
  pipe: PipeSpecification,
): string {
  const source = JSON.stringify({
    route: route.geometryHash,
    elevations: route.stations.map(
      (station) => station.pipelineElevationM ?? station.groundElevationM,
    ),
    scenario: {
      fluidId: scenario.fluidId,
      pipeSpecificationId: scenario.pipeSpecificationId,
      inletPressurePa: scenario.inletPressurePa,
      flowM3S: scenario.flowM3S,
      temperatureK: scenario.temperatureK,
      totalMinorLossK: scenario.totalMinorLossK,
      limits: scenario.limits,
    },
    fluid,
    pipe,
  });
  let hash = 0;
  for (let index = 0; index < source.length; index += 1)
    hash = (Math.imul(hash, 31) + source.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(36);
}

export const pipelineUnits = {
  psiToPa: PSI_TO_PA,
  paToPsi: 1 / PSI_TO_PA,
  gpmToM3S: GPM_TO_M3S,
  m3sToGpm: 1 / GPM_TO_M3S,
  mToFt: 3.280839895,
  mToMi: 0.000621371192,
  msToFts: 3.280839895,
  kelvinToFahrenheit: (kelvin: number) => ((kelvin - 273.15) * 9) / 5 + 32,
  fahrenheitToKelvin: (fahrenheit: number) => ((fahrenheit - 32) * 5) / 9 + 273.15,
};
