import assert from "node:assert/strict";
import { test } from "node:test";
import type { Feature, LineString } from "geojson";
import { createPipelineComponent, reprojectRouteComponents } from "./components.ts";
import { solvePipeline } from "./solver.ts";
import {
  SYSTEM_FLUIDS,
  SYSTEM_PIPE_SPECIFICATIONS,
  createDefaultScenario,
  pipelineUnits,
  routeFromLineFeature,
} from "./model.ts";

function line(coordinates: number[][]): Feature<LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } };
}

function flatRoute() {
  const route = routeFromLineFeature({
    layerId: "routes",
    layerName: "Routes",
    featureIndex: 0,
    feature: line([
      [-97, 32],
      [-96.99, 32],
    ]),
  });
  return {
    ...route,
    stations: route.stations.map((station) => ({
      ...station,
      groundElevationM: 100,
      pipelineElevationM: 100,
    })),
  };
}

test("pipeline components are created on the route at the selected station", () => {
  const route = flatRoute();
  const component = createPipelineComponent({
    route,
    kind: "block-valve",
    stationM: route.lengthM / 2,
    sequence: 1,
  });
  assert.equal(component.routeId, route.id);
  assert.equal(component.kind, "block-valve");
  assert.equal(component.properties["minorLossK"], 0.2);
  assert.ok(Math.abs(component.stationM - route.lengthM / 2) < 0.001);
});

test("component locations remain at the same route fraction after geometry edits", () => {
  const route = flatRoute();
  const component = createPipelineComponent({
    route,
    kind: "flow-meter",
    stationM: route.lengthM * 0.25,
    sequence: 1,
  });
  const edited = routeFromLineFeature({
    layerId: route.sourceLayerId,
    layerName: "Routes",
    featureIndex: route.sourceFeatureIndex,
    feature: line([
      [-97, 32],
      [-96.98, 32],
    ]),
    previous: route,
  });
  const [moved] = reprojectRouteComponents([component], route, edited);
  assert.ok(moved);
  assert.ok(Math.abs(moved.stationM / edited.lengthM - 0.25) < 1e-9);
});

test("a configured pump is inserted into the profile and increases downstream pressure", () => {
  const route = flatRoute();
  const scenario = { ...createDefaultScenario(route.id), flowM3S: 0 };
  const pump = createPipelineComponent({
    route,
    kind: "centrifugal-pump",
    stationM: route.lengthM / 2,
    sequence: 1,
  });
  pump.properties["pressureBoostPa"] = 100 * pipelineUnits.psiToPa;
  const run = solvePipeline({
    route,
    scenario,
    fluid: SYSTEM_FLUIDS.find((fluid) => fluid.id === scenario.fluidId)!,
    pipe: SYSTEM_PIPE_SPECIFICATIONS.find((pipe) => pipe.id === scenario.pipeSpecificationId)!,
    components: [pump],
  });
  assert.notEqual(run.status, "unsupported");
  assert.ok(run.profile.some((point) => Math.abs(point.stationM - pump.stationM) < 0.001));
  const pressureGainPsi =
    (run.profile.at(-1)!.pressurePa - run.profile[0]!.pressurePa) * pipelineUnits.paToPsi;
  assert.ok(Math.abs(pressureGainPsi - 100) < 0.001);
});
