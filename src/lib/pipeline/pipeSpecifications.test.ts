import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HDPE_DIMENSION_RATIOS,
  SYSTEM_PIPE_SPECIFICATIONS,
  emptyPipelineEngineeringState,
  normalizePipelineEngineeringState,
} from "./model.ts";

test("HDPE IPS screening options calculate wall and inside diameter from SDR/DR", () => {
  const pipe = SYSTEM_PIPE_SPECIFICATIONS.find(
    (candidate) => candidate.id === "pipe-hdpe-ips-12-dr-11",
  );
  assert.ok(pipe);
  assert.equal(pipe.material, "hdpe");
  assert.equal(pipe.sizingSystem, "IPS");
  assert.equal(pipe.dimensionRatio, 11);
  assert.ok(Math.abs(pipe.wallThicknessM - pipe.outsideDiameterM / 11) < 1e-12);
  assert.ok(
    Math.abs(pipe.insideDiameterM - (pipe.outsideDiameterM - 2 * pipe.wallThicknessM)) < 1e-12,
  );
});

test("each offered HDPE size includes every configured SDR/DR", () => {
  const twelveInch = SYSTEM_PIPE_SPECIFICATIONS.filter(
    (pipe) => pipe.material === "hdpe" && pipe.nominalSizeIn === 12,
  );
  assert.deepEqual(
    twelveInch.map((pipe) => pipe.dimensionRatio),
    [...HDPE_DIMENSION_RATIOS],
  );
});

test("saved pipeline projects receive new system pipe options without losing existing entries", () => {
  const state = emptyPipelineEngineeringState();
  const custom = {
    ...state.pipeSpecifications[0]!,
    id: "custom-confirmed-pipe",
    name: "Project-confirmed pipe",
    confirmedAt: 1,
  };
  const oldState = {
    ...state,
    pipeSpecifications: [
      custom,
      ...state.pipeSpecifications.filter((pipe) => pipe.material !== "hdpe"),
    ],
  };
  const normalized = normalizePipelineEngineeringState(oldState);
  assert.ok(normalized.pipeSpecifications.some((pipe) => pipe.id === custom.id));
  assert.ok(normalized.pipeSpecifications.some((pipe) => pipe.material === "hdpe"));
  assert.equal(normalized.pipeSpecifications.filter((pipe) => pipe.id === custom.id).length, 1);
});
