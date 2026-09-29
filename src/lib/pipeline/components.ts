import { pointAtStation } from "./model.ts";
import type { PipelineComponent, PipelineComponentKind, PipelineRoute } from "./types.ts";

export interface PipelineComponentTemplate {
  kind: PipelineComponentKind;
  label: string;
  defaultProperties: Record<string, number | string | boolean | null>;
}

export const PIPELINE_COMPONENT_TEMPLATES: PipelineComponentTemplate[] = [
  { kind: "source", label: "Source", defaultProperties: {} },
  { kind: "destination", label: "Destination", defaultProperties: {} },
  {
    kind: "block-valve",
    label: "Valve",
    defaultProperties: { minorLossK: 0.2, normallyOpen: true, basis: "screening-default" },
  },
  {
    kind: "centrifugal-pump",
    label: "Pump",
    defaultProperties: { pressureBoostPa: 0, basis: "user-input-required" },
  },
  {
    kind: "flow-meter",
    label: "Meter",
    defaultProperties: { minorLossK: 2, basis: "screening-default" },
  },
  {
    kind: "booster-station",
    label: "Booster",
    defaultProperties: { pressureBoostPa: 0, basis: "user-input-required" },
  },
];

export function componentTemplate(kind: PipelineComponentKind): PipelineComponentTemplate {
  return (
    PIPELINE_COMPONENT_TEMPLATES.find((template) => template.kind === kind) ?? {
      kind,
      label: kind.replaceAll("-", " "),
      defaultProperties: {},
    }
  );
}

export function createPipelineComponent(input: {
  route: PipelineRoute;
  kind: PipelineComponentKind;
  stationM: number;
  sequence: number;
}): PipelineComponent {
  const template = componentTemplate(input.kind);
  const now = Date.now();
  const stationM = Math.max(0, Math.min(input.route.lengthM, input.stationM));
  return {
    id: `component-${input.kind}-${now}-${input.sequence}`,
    routeId: input.route.id,
    kind: input.kind,
    name: `${template.label} ${input.sequence}`,
    stationM,
    coordinate: pointAtStation(input.route, stationM),
    properties: { ...template.defaultProperties },
    source: "user",
    createdAt: now,
    updatedAt: now,
  };
}

export function reprojectRouteComponents(
  components: PipelineComponent[],
  previousRoute: PipelineRoute,
  nextRoute: PipelineRoute,
): PipelineComponent[] {
  return components.map((component) => {
    if (component.routeId !== previousRoute.id) return component;
    const fraction = previousRoute.lengthM <= 0 ? 0 : component.stationM / previousRoute.lengthM;
    const stationM = Math.max(0, Math.min(nextRoute.lengthM, fraction * nextRoute.lengthM));
    return {
      ...component,
      stationM,
      coordinate: pointAtStation(nextRoute, stationM),
      updatedAt: Date.now(),
    };
  });
}

export function numericComponentProperty(
  component: PipelineComponent,
  property: "minorLossK" | "pressureBoostPa",
): number {
  const value = component.properties[property];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
