import type {
  PipeSpecification,
  PipelineEstimateSummary,
  PipelineRoute,
  PipelineScenario,
  QuantityTakeoffSnapshot,
} from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

export function buildPreliminaryTakeoff(
  route: PipelineRoute,
  scenario: PipelineScenario,
  pipe: PipeSpecification,
): QuantityTakeoffSnapshot {
  const standardLengthM = pipe.standardLengthM ?? 12.192;
  return {
    id: `qto-${uid()}`,
    scenarioId: scenario.id,
    geometryRevision: route.geometryRevision,
    createdAt: Date.now(),
    items: [
      {
        id: `qto-pipe-${uid()}`,
        category: "pipe",
        description: `${pipe.name} pipe`,
        quantity: route.lengthM,
        unit: "m",
        formulaVersion: "route-length-v1",
        routeId: route.id,
        scenarioId: scenario.id,
        sourceIds: [route.id, pipe.id],
        startStationM: 0,
        endStationM: route.lengthM,
      },
      {
        id: `qto-joints-${uid()}`,
        category: "pipe",
        description: "Estimated field joints",
        quantity: Math.max(0, Math.ceil(route.lengthM / standardLengthM) - 1),
        unit: "each",
        formulaVersion: "standard-length-joints-v1",
        routeId: route.id,
        scenarioId: scenario.id,
        sourceIds: [route.id, pipe.id],
        assumption: `Standard pipe length ${standardLengthM.toFixed(3)} m; confirm lay lengths and fittings.`,
      },
      {
        id: `qto-clearing-${uid()}`,
        category: "clearing-row",
        description: "Route/ROW length",
        quantity: route.lengthM,
        unit: "m",
        formulaVersion: "route-length-v1",
        routeId: route.id,
        scenarioId: scenario.id,
        sourceIds: [route.id],
        assumption: "ROW width is not yet defined; this item reports length only.",
      },
      ...route.crossings
        .filter((crossing) => crossing.confirmation !== "rejected")
        .map((crossing) => ({
          id: `qto-crossing-${crossing.id}`,
          category: "crossing" as const,
          description: `${crossing.type.replaceAll("-", " ")} crossing`,
          quantity: 1,
          unit: "each",
          formulaVersion: "confirmed-crossing-count-v1",
          routeId: route.id,
          scenarioId: scenario.id,
          sourceIds: [route.id, crossing.id],
          startStationM: crossing.stationM,
          endStationM: crossing.stationM,
          assumption: `${crossing.confirmation}; ${crossing.confidence} confidence; source: ${crossing.source}`,
        })),
    ],
  };
}

export function calculatePreliminaryEstimate(
  route: PipelineRoute,
  scenario: PipelineScenario,
): PipelineEstimateSummary {
  const assumptions = scenario.estimateAssumptions;
  const hasMaterial = assumptions.pipeMaterialPerM !== undefined;
  const hasInstallation = assumptions.installationPerM !== undefined;
  const materialCost = hasMaterial ? route.lengthM * assumptions.pipeMaterialPerM! : null;
  const installationCost = hasInstallation ? route.lengthM * assumptions.installationPerM! : null;
  const subtotal =
    materialCost === null || installationCost === null ? null : materialCost + installationCost;
  const contingency = subtotal === null ? null : (subtotal * assumptions.contingencyPercent) / 100;
  const beforeMarkup = subtotal === null || contingency === null ? null : subtotal + contingency;
  const markup = beforeMarkup === null ? null : (beforeMarkup * assumptions.markupPercent) / 100;
  const recommendedBid = beforeMarkup === null || markup === null ? null : beforeMarkup + markup;
  const warnings: string[] = [];
  if (!hasMaterial) warnings.push("Add a material budget allowance or sourced price per length.");
  if (!hasInstallation)
    warnings.push("Add an installation budget allowance or sourced rate per length.");
  warnings.push(
    "Crossings, facilities, labor productivity, indirects, freight, escalation, tax, bond and insurance are not included in this preliminary total.",
  );
  return {
    scenarioId: scenario.id,
    currency: assumptions.currency,
    materialCost,
    installationCost,
    subtotal,
    contingency,
    markup,
    recommendedBid,
    evidenceClass: assumptions.evidenceClass,
    warnings,
    calculatedAt: Date.now(),
  };
}
