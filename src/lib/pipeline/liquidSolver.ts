import type {
  PipeSpecification,
  PipelineFluid,
  PipelineProfilePoint,
  PipelineRoute,
  PipelineScenario,
  PipelineSolverRun,
  SolverFinding,
} from "./types";
import { pipelineInputHash } from "./model";

const GRAVITY_MS2 = 9.80665;

function finding(
  severity: SolverFinding["severity"],
  code: string,
  title: string,
  detail: string,
  stationM?: number,
): SolverFinding {
  return {
    id: `${code}-${stationM ?? "model"}`,
    severity,
    code,
    title,
    detail,
    ...(stationM === undefined ? {} : { stationM }),
  };
}

export function darcyFrictionFactor(reynoldsNumber: number, relativeRoughness: number): number {
  if (!Number.isFinite(reynoldsNumber) || reynoldsNumber <= 0) return Number.NaN;
  if (reynoldsNumber < 2_300) return 64 / reynoldsNumber;
  let factor = 0.02;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const denominator =
      -2 * Math.log10(relativeRoughness / 3.7 + 2.51 / (reynoldsNumber * Math.sqrt(factor)));
    const next = 1 / denominator ** 2;
    if (Math.abs(next - factor) < 1e-10) return next;
    factor = next;
  }
  return factor;
}

export function solveSteadyLiquid(input: {
  route: PipelineRoute;
  scenario: PipelineScenario;
  fluid: PipelineFluid;
  pipe: PipeSpecification;
}): PipelineSolverRun {
  const { route, scenario, fluid, pipe } = input;
  const startedAt = Date.now();
  const findings: SolverFinding[] = [];
  const inputHash = pipelineInputHash(route, scenario, fluid, pipe);

  if (fluid.family !== "liquid") {
    return {
      id: `run-${startedAt}`,
      scenarioId: scenario.id,
      routeId: route.id,
      solverId: "liquid-steady-v1",
      solverVersion: "0.1.0-preliminary",
      readiness: "preliminary-unvalidated",
      status: "unsupported",
      inputHash,
      geometryRevision: route.geometryRevision,
      startedAt,
      completedAt: Date.now(),
      profile: [],
      findings: [
        finding(
          "blocker",
          "ADVANCED_ANALYSIS_REQUIRED",
          "Advanced multiphase analysis required",
          `The native liquid screening solver cannot analyze ${fluid.name}. Select a supported incompressible liquid or a validated specialist solver.`,
        ),
      ],
    };
  }

  const density = fluid.densityKgM3;
  const viscosity = fluid.dynamicViscosityPaS;
  if (!density || density <= 0 || !viscosity || viscosity <= 0)
    findings.push(
      finding(
        "blocker",
        "FLUID_PROPERTIES_REQUIRED",
        "Fluid properties required",
        "Positive density and dynamic viscosity are required at the scenario temperature.",
      ),
    );
  if (pipe.insideDiameterM <= 0)
    findings.push(
      finding(
        "blocker",
        "PIPE_DIAMETER_INVALID",
        "Pipe inside diameter is invalid",
        "Confirm OD, wall thickness and corrosion allowance before solving.",
      ),
    );
  if (scenario.flowM3S < 0)
    findings.push(
      finding(
        "blocker",
        "FLOW_DIRECTION_UNSUPPORTED",
        "Negative flow is not supported in this preliminary solver",
        "Reverse-flow network solving is planned for a validated network adapter.",
      ),
    );
  if (route.stations.length < 2 || route.lengthM <= 0)
    findings.push(
      finding(
        "blocker",
        "ROUTE_REQUIRED",
        "A valid route is required",
        "Choose a LineString feature with at least two different coordinates.",
      ),
    );

  if (findings.some((item) => item.severity === "blocker")) {
    return {
      id: `run-${startedAt}`,
      scenarioId: scenario.id,
      routeId: route.id,
      solverId: "liquid-steady-v1",
      solverVersion: "0.1.0-preliminary",
      readiness: "preliminary-unvalidated",
      status: "failed",
      inputHash,
      geometryRevision: route.geometryRevision,
      startedAt,
      completedAt: Date.now(),
      profile: [],
      findings,
    };
  }

  const rho = density!;
  const mu = viscosity!;
  const diameterM = pipe.insideDiameterM;
  const areaM2 = (Math.PI * diameterM ** 2) / 4;
  const velocityMS = scenario.flowM3S / areaM2;
  const reynoldsNumber = (rho * Math.abs(velocityMS) * diameterM) / mu;
  const frictionFactor =
    scenario.flowM3S === 0 ? 0 : darcyFrictionFactor(reynoldsNumber, pipe.roughnessM / diameterM);
  const dynamicPressurePa = (rho * velocityMS ** 2) / 2;
  const hasCompleteElevation = route.stations.every(
    (station) => station.pipelineElevationM !== undefined || station.groundElevationM !== undefined,
  );

  if (!hasCompleteElevation)
    findings.push(
      finding(
        "warning",
        "ELEVATION_MISSING",
        "Static elevation head is incomplete",
        "Missing route elevations are treated as level for this run. Add USGS 3DEP, surveyed or manual profile elevations before relying on pressure results.",
      ),
    );

  if (!pipe.confirmedAt)
    findings.push(
      finding(
        "warning",
        "PIPE_SPEC_UNCONFIRMED",
        "Pipe specification is not confirmed",
        "This result uses a dimensional screening template. Confirm specification, grade, wall, pressure basis, temperature basis and compatibility before Engineering Model status.",
      ),
    );

  const profile: PipelineProfilePoint[] = [];
  let pressurePa = scenario.inletPressurePa;
  let remainingMinorK = scenario.totalMinorLossK;

  route.stations.forEach((station, index) => {
    if (index > 0) {
      const previous = route.stations[index - 1]!;
      const lengthM = Math.max(0, station.stationM - previous.stationM);
      const previousElevation = previous.pipelineElevationM ?? previous.groundElevationM;
      const elevation = station.pipelineElevationM ?? station.groundElevationM;
      const elevationDeltaM =
        previousElevation === undefined || elevation === undefined
          ? 0
          : elevation - previousElevation;
      const frictionLossPa =
        scenario.flowM3S === 0 ? 0 : frictionFactor * (lengthM / diameterM) * dynamicPressurePa;
      const segmentMinorK = index === route.stations.length - 1 ? remainingMinorK : 0;
      remainingMinorK -= segmentMinorK;
      const minorLossPa = segmentMinorK * dynamicPressurePa;
      pressurePa -= frictionLossPa + minorLossPa + rho * GRAVITY_MS2 * elevationDeltaM;
    }

    const elevation = station.pipelineElevationM ?? station.groundElevationM;
    const pressureMarginPa = scenario.limits.maopPa - pressurePa;
    const minimumPressureMarginPa = pressurePa - scenario.limits.minimumPressurePa;
    const pressureLossPaPerM =
      scenario.flowM3S === 0 ? 0 : (frictionFactor / diameterM) * dynamicPressurePa;
    profile.push({
      stationM: station.stationM,
      coordinate: station.coordinate,
      ...(station.groundElevationM === undefined
        ? {}
        : { groundElevationM: station.groundElevationM }),
      ...(elevation === undefined ? {} : { pipelineElevationM: elevation }),
      pressurePa,
      ...(elevation === undefined
        ? {}
        : { hydraulicGradeM: elevation + pressurePa / (rho * GRAVITY_MS2) }),
      pressureMarginPa,
      minimumPressureMarginPa,
      flowM3S: scenario.flowM3S,
      velocityMS,
      temperatureK: scenario.temperatureK,
      reynoldsNumber,
      frictionFactor,
      pressureLossPaPerM,
      provenance: "calculated",
    });
  });

  for (const point of profile) {
    if (point.pressurePa > scenario.limits.maopPa)
      findings.push(
        finding(
          "error",
          "MAOP_EXCEEDED",
          "Pressure exceeds the scenario MAOP",
          "The calculated pressure is above the user-entered maximum allowable operating pressure.",
          point.stationM,
        ),
      );
    if (point.pressurePa < scenario.limits.minimumPressurePa)
      findings.push(
        finding(
          "error",
          "MINIMUM_PRESSURE",
          "Pressure falls below the delivery minimum",
          "Change route, pipe, inlet condition or equipment before treating the case as feasible.",
          point.stationM,
        ),
      );
  }
  if (velocityMS > scenario.limits.maximumVelocityMS)
    findings.push(
      finding(
        "warning",
        "VELOCITY_LIMIT",
        "Velocity exceeds the scenario limit",
        "Review diameter, throughput, material-specific criteria, transients and erosion/noise limits.",
      ),
    );
  if (reynoldsNumber >= 2_300 && reynoldsNumber < 4_000)
    findings.push(
      finding(
        "warning",
        "TRANSITIONAL_FLOW",
        "Flow is in the transitional Reynolds-number range",
        "Friction-factor uncertainty is higher in this range.",
      ),
    );

  const status = findings.some((item) => item.severity === "error")
    ? "warning"
    : findings.length
      ? "warning"
      : "solved";
  return {
    id: `run-${startedAt}`,
    scenarioId: scenario.id,
    routeId: route.id,
    solverId: "liquid-steady-v1",
    solverVersion: "0.1.0-preliminary",
    readiness: "preliminary-unvalidated",
    status,
    inputHash,
    geometryRevision: route.geometryRevision,
    startedAt,
    completedAt: Date.now(),
    profile,
    findings,
  };
}

export function interpolateProfile(
  profile: PipelineProfilePoint[],
  stationM: number,
): PipelineProfilePoint | undefined {
  if (!profile.length) return undefined;
  if (stationM <= profile[0]!.stationM) return profile[0];
  if (stationM >= profile.at(-1)!.stationM) return profile.at(-1);
  const endIndex = profile.findIndex((point) => point.stationM >= stationM);
  if (endIndex <= 0) return profile[0];
  const start = profile[endIndex - 1]!;
  const end = profile[endIndex]!;
  const fraction = (stationM - start.stationM) / Math.max(1e-9, end.stationM - start.stationM);
  const number = (a: number, b: number) => a + (b - a) * fraction;
  const optional = (a: number | undefined, b: number | undefined) =>
    a === undefined || b === undefined ? undefined : number(a, b);
  return {
    ...start,
    stationM,
    coordinate: [
      number(Number(start.coordinate[0]), Number(end.coordinate[0])),
      number(Number(start.coordinate[1]), Number(end.coordinate[1])),
    ],
    ...(optional(start.groundElevationM, end.groundElevationM) === undefined
      ? {}
      : { groundElevationM: optional(start.groundElevationM, end.groundElevationM)! }),
    ...(optional(start.pipelineElevationM, end.pipelineElevationM) === undefined
      ? {}
      : { pipelineElevationM: optional(start.pipelineElevationM, end.pipelineElevationM)! }),
    pressurePa: number(start.pressurePa, end.pressurePa),
    ...(optional(start.hydraulicGradeM, end.hydraulicGradeM) === undefined
      ? {}
      : { hydraulicGradeM: optional(start.hydraulicGradeM, end.hydraulicGradeM)! }),
    pressureMarginPa: number(start.pressureMarginPa, end.pressureMarginPa),
    minimumPressureMarginPa: number(start.minimumPressureMarginPa, end.minimumPressureMarginPa),
    flowM3S: number(start.flowM3S, end.flowM3S),
    velocityMS: number(start.velocityMS, end.velocityMS),
    temperatureK: number(start.temperatureK, end.temperatureK),
    reynoldsNumber: number(start.reynoldsNumber, end.reynoldsNumber),
    frictionFactor: number(start.frictionFactor, end.frictionFactor),
    pressureLossPaPerM: number(start.pressureLossPaPerM, end.pressureLossPaPerM),
    provenance: "interpolated",
  };
}
