import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, LineString } from "geojson";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Calculator,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  FlaskConical,
  Gauge,
  PackageSearch,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Route,
  Save,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
} from "lucide-react";
import { LngLatBounds } from "maplibre-gl";
import { toast } from "sonner";
import { LandDraftMark } from "@/components/brand/LandDraftMark";
import { BasemapControl } from "@/components/gis/BasemapControl";
import { FeatureDestinationDialog } from "@/components/gis/FeatureDestinationDialog";
import { MapCanvas } from "@/components/gis/MapCanvas";
import { SearchBox } from "@/components/gis/SearchBox";
import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { cn } from "@/lib/utils";
import {
  createDefaultScenario,
  emptyPipelineEngineeringState,
  geometryHash,
  pipelineInputHash,
  pipelineUnits,
  routeFromLineFeature,
} from "@/lib/pipeline/model";
import { buildPreliminaryTakeoff, calculatePreliminaryEstimate } from "@/lib/pipeline/estimating";
import { applyLinearManualElevation } from "@/lib/pipeline/elevation";
import { interpolateProfile } from "@/lib/pipeline/liquidSolver";
import { solvePipeline } from "@/lib/pipeline/solver";
import type {
  PipelineEngineeringState,
  PipelineProfilePoint,
  PipelineRoute,
  PipelineScenario,
  PipelineVisualizationMode,
} from "@/lib/pipeline/types";
import { PipelineMapOverlay } from "./PipelineMapOverlay";
import { PipelineProfile } from "./PipelineProfile";

type LineCandidate = {
  key: string;
  layerId: string;
  layerName: string;
  featureIndex: number;
  feature: Feature<LineString>;
  label: string;
};

type MobilePanel = "model" | "properties" | "profile" | null;

function displayFeatureName(feature: Feature<LineString>, fallback: string) {
  const properties = feature.properties ?? {};
  const value = ["NAME", "Name", "name", "LABEL", "label"]
    .map((key) => properties[key])
    .find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value : fallback;
}

function formatStation(distanceM: number) {
  const feet = Math.max(0, distanceM * pipelineUnits.mToFt);
  const major = Math.floor(feet / 100);
  const minor = Math.round(feet - major * 100);
  return `${major}+${minor.toString().padStart(2, "0")}`;
}

function money(value: number | null, currency = "USD") {
  if (value === null) return "Not calculated";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function PipelineWorkspace() {
  const wb = useWorkbench();
  const { map } = useMapRef();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [scrubStationM, setScrubStationM] = useState<number | null>(null);
  const initializedProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!wb.projectReady || wb.pipelineEngineering || !wb.canEditProject) return;
    if (initializedProjectRef.current === wb.projectId) return;
    initializedProjectRef.current = wb.projectId;
    wb.setPipelineEngineering(emptyPipelineEngineeringState());
  }, [wb]);

  const pipeline = wb.pipelineEngineering;
  const lineCandidates = useMemo<LineCandidate[]>(
    () =>
      wb.layers.flatMap((layer) =>
        layer.data.features.flatMap((feature, featureIndex) => {
          if (feature.geometry.type !== "LineString") return [];
          const typed = feature as Feature<LineString>;
          return [
            {
              key: `${layer.id}:${featureIndex}`,
              layerId: layer.id,
              layerName: layer.name,
              featureIndex,
              feature: typed,
              label: `${layer.name} · ${displayFeatureName(typed, `Feature ${featureIndex + 1}`)}`,
            },
          ];
        }),
      ),
    [wb.layers],
  );

  const activeRoute = pipeline?.routes.find((route) => route.id === pipeline.activeRouteId);
  const activeScenario = pipeline?.scenarios.find(
    (scenario) => scenario.id === pipeline.activeScenarioId,
  );
  const activeFluid = pipeline?.fluids.find((fluid) => fluid.id === activeScenario?.fluidId);
  const activePipe = pipeline?.pipeSpecifications.find(
    (pipe) => pipe.id === activeScenario?.pipeSpecificationId,
  );
  const activeRun = pipeline?.solverRuns.find(
    (run) => run.scenarioId === activeScenario?.id && run.routeId === activeRoute?.id,
  );
  const activeTakeoff = pipeline?.quantitySnapshots.find(
    (snapshot) => snapshot.scenarioId === activeScenario?.id,
  );

  const updatePipeline = useCallback(
    (change: (current: PipelineEngineeringState) => PipelineEngineeringState) => {
      const current = wb.pipelineEngineering;
      if (!current || !wb.canEditProject) return;
      wb.setPipelineEngineering({ ...change(current), updatedAt: Date.now() });
    },
    [wb],
  );

  const updateScenario = useCallback(
    (change: Partial<PipelineScenario>) => {
      if (!activeScenario) return;
      updatePipeline((current) => ({
        ...current,
        scenarios: current.scenarios.map((scenario) =>
          scenario.id === activeScenario.id
            ? { ...scenario, ...change, updatedAt: Date.now() }
            : scenario,
        ),
      }));
    },
    [activeScenario, updatePipeline],
  );

  const runNow = useCallback(() => {
    if (!activeRoute || !activeScenario || !activeFluid || !activePipe) return;
    const run = solvePipeline({
      route: activeRoute,
      scenario: activeScenario,
      fluid: activeFluid,
      pipe: activePipe,
      components:
        pipeline?.components.filter((component) => component.routeId === activeRoute.id) ?? [],
    });
    const takeoff = buildPreliminaryTakeoff(activeRoute, activeScenario, activePipe);
    const estimate = calculatePreliminaryEstimate(activeRoute, activeScenario);
    updatePipeline((current) => ({
      ...current,
      solverRuns: [
        run,
        ...current.solverRuns.filter((item) => item.scenarioId !== run.scenarioId),
      ].slice(0, 25),
      quantitySnapshots: [
        takeoff,
        ...current.quantitySnapshots.filter((item) => item.scenarioId !== takeoff.scenarioId),
      ].slice(0, 25),
      latestEstimate: estimate,
    }));
    if (run.status === "unsupported" || run.status === "failed")
      toast.error(run.findings[0]?.title ?? "The pipeline case could not be solved");
  }, [activeFluid, activePipe, activeRoute, activeScenario, pipeline?.components, updatePipeline]);

  const currentInputHash = useMemo(() => {
    if (!activeRoute || !activeScenario || !activeFluid || !activePipe) return null;
    return pipelineInputHash(activeRoute, activeScenario, activeFluid, activePipe);
  }, [activeFluid, activePipe, activeRoute, activeScenario]);

  useEffect(() => {
    if (
      !activeScenario?.liveSolve ||
      !currentInputHash ||
      activeRun?.inputHash === currentInputHash
    )
      return;
    const timer = window.setTimeout(runNow, 450);
    return () => window.clearTimeout(timer);
  }, [activeRun?.inputHash, activeScenario?.liveSolve, currentInputHash, runNow]);

  useEffect(() => {
    if (!pipeline || !activeRoute) return;
    const layer = wb.layers.find((item) => item.id === activeRoute.sourceLayerId);
    const feature = layer?.data.features[activeRoute.sourceFeatureIndex];
    if (!layer || feature?.geometry.type !== "LineString") return;
    const nextHash = geometryHash(feature.geometry.coordinates);
    if (nextHash === activeRoute.geometryHash) return;
    const refreshed = routeFromLineFeature({
      layerId: layer.id,
      layerName: layer.name,
      featureIndex: activeRoute.sourceFeatureIndex,
      feature: feature as Feature<LineString>,
      previous: activeRoute,
    });
    updatePipeline((current) => ({
      ...current,
      routes: current.routes.map((route) => (route.id === refreshed.id ? refreshed : route)),
    }));
  }, [activeRoute, pipeline, updatePipeline, wb.layers]);

  const chooseCandidate = (key: string) => {
    const candidate = lineCandidates.find((item) => item.key === key);
    if (!candidate) return;
    const existing = pipeline?.routes.find(
      (route) =>
        route.sourceLayerId === candidate.layerId &&
        route.sourceFeatureIndex === candidate.featureIndex,
    );
    const route = routeFromLineFeature({
      ...candidate,
      ...(existing ? { previous: existing } : {}),
    });
    updatePipeline((current) => {
      const scenario =
        current.scenarios.find((item) => item.routeId === route.id) ??
        createDefaultScenario(route.id);
      return {
        ...current,
        activeRouteId: route.id,
        activeScenarioId: scenario.id,
        routes: existing
          ? current.routes.map((item) => (item.id === route.id ? route : item))
          : [...current.routes, route],
        scenarios: current.scenarios.some((item) => item.id === scenario.id)
          ? current.scenarios
          : [...current.scenarios, scenario],
      };
    });
    if (map) {
      const first = candidate.feature.geometry.coordinates[0] ?? [-98.5, 31.3];
      const bounds = candidate.feature.geometry.coordinates.reduce(
        (current, coordinate) => current.extend([Number(coordinate[0]), Number(coordinate[1])]),
        new LngLatBounds(
          [Number(first[0]), Number(first[1])],
          [Number(first[0]), Number(first[1])],
        ),
      );
      map.fitBounds(bounds, { padding: 80, duration: 500, maxZoom: 15 });
    }
  };

  const scrubPoint = useMemo(
    () =>
      scrubStationM === null || !activeRun
        ? undefined
        : interpolateProfile(activeRun.profile, scrubStationM),
    [activeRun, scrubStationM],
  );

  if (!wb.projectReady)
    return (
      <div className="app-viewport flex items-center justify-center bg-background text-sm text-muted-foreground">
        Opening the pipeline workspace…
      </div>
    );

  if (!pipeline)
    return (
      <div className="app-viewport flex items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-panel">
          <AlertTriangle className="mx-auto size-8 text-amber-600" />
          <h1 className="mt-3 text-lg font-semibold">Pipeline workspace unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This shared map does not include an enabled pipeline model, or your access is read-only.
          </p>
          <button
            onClick={() => window.location.assign("/")}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Return to LandDraft
          </button>
        </div>
      </div>
    );

  const visualizationMode = pipeline.preferences.visualizationMode;
  const findingCount = activeRun?.findings.length ?? 0;
  const inputIsStale = Boolean(currentInputHash && activeRun?.inputHash !== currentInputHash);

  return (
    <div className="app-safe-frame app-viewport flex flex-col overflow-hidden bg-background">
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-2 lg:px-3">
        <button
          onClick={() => window.location.assign("/")}
          className="flex size-9 items-center justify-center rounded-xl hover:bg-accent"
          title="Return to the LandDraft map"
          aria-label="Return to the LandDraft map"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <LandDraftMark className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold">Pipeline Engineering & Estimating</h1>
          <p className="truncate text-[9px] text-muted-foreground">
            {wb.projectName} · Preliminary screening workspace
          </p>
        </div>

        <div className="ml-auto hidden min-w-0 items-center gap-1 overflow-x-auto md:flex">
          <WorkspaceAction
            icon={<FlaskConical />}
            label="Fluid"
            onClick={() => focusPanel("engineering", updatePipeline)}
          />
          <WorkspaceAction
            icon={<SlidersHorizontal />}
            label="Scenario"
            onClick={() => focusPanel("engineering", updatePipeline)}
          />
          <button
            type="button"
            onClick={() => updateScenario({ liveSolve: !activeScenario?.liveSolve })}
            disabled={!activeScenario}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-[10px] font-semibold disabled:opacity-40",
              activeScenario?.liveSolve ? "bg-primary text-primary-foreground" : "bg-secondary",
            )}
            title="Recalculate after route or engineering inputs change"
          >
            <Gauge className="size-3.5" /> Live solve
          </button>
          <WorkspaceAction
            icon={<Play />}
            label="Analyze"
            onClick={runNow}
            disabled={!activeScenario}
          />
          <WorkspaceAction icon={<Sparkles />} label="Optimize" planned />
          <WorkspaceAction
            icon={<CircleDollarSign />}
            label="Costs"
            onClick={() => focusPanel("costs", updatePipeline)}
          />
          <WorkspaceAction icon={<PackageSearch />} label="Vendors" planned />
          <WorkspaceAction
            icon={<Calculator />}
            label="Estimate"
            onClick={() => focusPanel("costs", updatePipeline)}
          />
          <WorkspaceAction icon={<TableProperties />} label="Bid" planned />
          <button
            onClick={() => void wb.saveProject("manual")}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary hover:bg-accent"
            title="Save pipeline model with this LandDraft project"
          >
            <Save className="size-4" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-card lg:block">
          <ModelPanel
            pipeline={pipeline}
            lineCandidates={lineCandidates}
            activeRoute={activeRoute}
            onChooseCandidate={chooseCandidate}
            onSelectRoute={(routeId) => {
              const scenario = pipeline.scenarios.find((item) => item.routeId === routeId);
              updatePipeline((current) => ({
                ...current,
                activeRouteId: routeId,
                ...(scenario ? { activeScenarioId: scenario.id } : {}),
              }));
            }}
            onDraw={() => wb.setDrawMode("line")}
          />
        </aside>

        <main className="relative min-w-0 flex-1">
          <MapCanvas />
          <PipelineMapOverlay
            route={activeRoute}
            profile={activeRun?.profile ?? []}
            scenario={activeScenario}
            mode={visualizationMode}
            scrubPoint={scrubPoint}
            onScrub={setScrubStationM}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3">
            <div className="pointer-events-auto hidden sm:block">
              <SearchBox />
            </div>
            <div className="pointer-events-auto ml-auto">
              <BasemapControl dropDirection="down" />
            </div>
          </div>
          <ResultLegend mode={visualizationMode} stale={inputIsStale} />
          {scrubPoint && activePipe && (
            <PressureScrubTooltip
              point={scrubPoint}
              route={activeRoute}
              pipe={activePipe.name}
              maopPa={activeScenario?.limits.maopPa ?? 0}
            />
          )}

          <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-2xl border border-border bg-card/95 p-1 shadow-float lg:hidden">
            <MobileAction
              icon={<PanelLeft />}
              label="Model"
              active={mobilePanel === "model"}
              onClick={() => setMobilePanel(mobilePanel === "model" ? null : "model")}
            />
            <MobileAction
              icon={<PanelRight />}
              label="Inputs"
              active={mobilePanel === "properties"}
              onClick={() => setMobilePanel(mobilePanel === "properties" ? null : "properties")}
            />
            <MobileAction
              icon={<Gauge />}
              label="Profile"
              active={mobilePanel === "profile"}
              onClick={() => setMobilePanel(mobilePanel === "profile" ? null : "profile")}
            />
            <MobileAction icon={<Play />} label="Solve" onClick={runNow} />
          </div>

          {mobilePanel && (
            <section className="absolute inset-x-2 bottom-20 z-30 max-h-[60dvh] overflow-y-auto rounded-3xl border border-border bg-card shadow-float lg:hidden">
              <div className="sticky top-0 z-10 flex items-center border-b border-border bg-card px-4 py-2">
                <strong className="text-sm">
                  {mobilePanel === "model"
                    ? "Pipeline model"
                    : mobilePanel === "properties"
                      ? "Engineering inputs"
                      : "Engineering profile"}
                </strong>
                <button
                  onClick={() => setMobilePanel(null)}
                  className="ml-auto rounded-lg px-2 py-1 text-xs hover:bg-accent"
                >
                  Close
                </button>
              </div>
              {mobilePanel === "model" ? (
                <ModelPanel
                  pipeline={pipeline}
                  lineCandidates={lineCandidates}
                  activeRoute={activeRoute}
                  onChooseCandidate={chooseCandidate}
                  onSelectRoute={(routeId) => {
                    const scenario = pipeline.scenarios.find((item) => item.routeId === routeId);
                    updatePipeline((current) => ({
                      ...current,
                      activeRouteId: routeId,
                      ...(scenario ? { activeScenarioId: scenario.id } : {}),
                    }));
                  }}
                  onDraw={() => wb.setDrawMode("line")}
                />
              ) : mobilePanel === "properties" ? (
                <PropertiesPanel
                  pipeline={pipeline}
                  route={activeRoute}
                  scenario={activeScenario}
                  findingCount={findingCount}
                  takeoff={activeTakeoff}
                  onScenarioChange={updateScenario}
                  onApplyElevation={(startElevationFt, endElevationFt) => {
                    if (!activeRoute) return;
                    const route = applyLinearManualElevation({
                      route: activeRoute,
                      startElevationM: startElevationFt / pipelineUnits.mToFt,
                      endElevationM: endElevationFt / pipelineUnits.mToFt,
                      source: "User-entered linear screening profile",
                    });
                    updatePipeline((current) => ({
                      ...current,
                      routes: current.routes.map((item) => (item.id === route.id ? route : item)),
                    }));
                  }}
                  onPreferenceChange={(change) =>
                    updatePipeline((current) => ({
                      ...current,
                      preferences: { ...current.preferences, ...change },
                    }))
                  }
                />
              ) : (
                <PipelineProfile
                  profile={activeRun?.profile ?? []}
                  scrubStationM={scrubStationM}
                  onScrub={setScrubStationM}
                />
              )}
            </section>
          )}
        </main>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-card xl:block">
          <PropertiesPanel
            pipeline={pipeline}
            route={activeRoute}
            scenario={activeScenario}
            findingCount={findingCount}
            takeoff={activeTakeoff}
            onScenarioChange={updateScenario}
            onApplyElevation={(startElevationFt, endElevationFt) => {
              if (!activeRoute) return;
              const route = applyLinearManualElevation({
                route: activeRoute,
                startElevationM: startElevationFt / pipelineUnits.mToFt,
                endElevationM: endElevationFt / pipelineUnits.mToFt,
                source: "User-entered linear screening profile",
              });
              updatePipeline((current) => ({
                ...current,
                routes: current.routes.map((item) => (item.id === route.id ? route : item)),
              }));
            }}
            onPreferenceChange={(change) =>
              updatePipeline((current) => ({
                ...current,
                preferences: { ...current.preferences, ...change },
              }))
            }
          />
        </aside>
      </div>

      <section className="hidden shrink-0 border-t border-border bg-card lg:block">
        <button
          onClick={() =>
            updatePipeline((current) => ({
              ...current,
              preferences: {
                ...current.preferences,
                profileOpen: !current.preferences.profileOpen,
              },
            }))
          }
          className="flex h-9 w-full items-center gap-2 px-4 text-left text-xs font-semibold hover:bg-accent"
        >
          <Gauge className="size-4 text-primary" /> Elevation + hydraulic profile
          {inputIsStale && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] text-amber-800">
              Recalculating
            </span>
          )}
          <span className="ml-auto">
            {pipeline.preferences.profileOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronUp className="size-4" />
            )}
          </span>
        </button>
        {pipeline.preferences.profileOpen && (
          <PipelineProfile
            profile={activeRun?.profile ?? []}
            scrubStationM={scrubStationM}
            onScrub={setScrubStationM}
          />
        )}
      </section>

      <FeatureDestinationDialog />
    </div>
  );
}

function focusPanel(
  panel: PipelineEngineeringState["preferences"]["selectedRightPanel"],
  update: (change: (current: PipelineEngineeringState) => PipelineEngineeringState) => void,
) {
  update((current) => ({
    ...current,
    preferences: { ...current.preferences, selectedRightPanel: panel },
  }));
}

function ModelPanel({
  pipeline,
  lineCandidates,
  activeRoute,
  onChooseCandidate,
  onSelectRoute,
  onDraw,
}: {
  pipeline: PipelineEngineeringState;
  lineCandidates: LineCandidate[];
  activeRoute: PipelineRoute | undefined;
  onChooseCandidate: (key: string) => void;
  onSelectRoute: (id: string) => void;
  onDraw: () => void;
}) {
  return (
    <div className="space-y-4 p-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Route className="size-4 text-primary" /> Routes
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          A route remains linked to its LandDraft line feature. Editing that line invalidates and
          refreshes the engineering results.
        </p>
      </div>
      <select
        value={activeRoute ? `${activeRoute.sourceLayerId}:${activeRoute.sourceFeatureIndex}` : ""}
        onChange={(event) => onChooseCandidate(event.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
      >
        <option value="">Choose a LandDraft line…</option>
        {lineCandidates.map((candidate) => (
          <option key={candidate.key} value={candidate.key}>
            {candidate.label}
          </option>
        ))}
      </select>
      <button
        onClick={onDraw}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
      >
        <Plus className="size-4" /> Draw a new route
      </button>
      <div className="space-y-1">
        {pipeline.routes.map((route) => (
          <button
            key={route.id}
            onClick={() => onSelectRoute(route.id)}
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-left",
              route.id === activeRoute?.id
                ? "border-primary bg-primary/10"
                : "border-border bg-background",
            )}
          >
            <strong className="block truncate text-xs">{route.name}</strong>
            <span className="num text-[9px] text-muted-foreground">
              {(route.lengthM * pipelineUnits.mToMi).toFixed(2)} mi · rev {route.geometryRevision}
            </span>
          </button>
        ))}
        {!pipeline.routes.length && (
          <p className="rounded-xl bg-secondary p-3 text-[10px] text-muted-foreground">
            Choose or draw a line to start. Polygon and point features are not treated as pipeline
            routes.
          </p>
        )}
      </div>
      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Boxes className="size-4 text-primary" /> Components
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {["Source", "Destination", "Valve", "Pump", "Meter", "Booster"].map((name) => (
            <button
              key={name}
              disabled
              className="rounded-lg border border-dashed border-border px-2 py-2 text-[9px] text-muted-foreground disabled:opacity-70"
              title="Component placement is scheduled for the next validated workspace increment"
            >
              {name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[9px] text-muted-foreground">
          Drag/drop component insertion is architected but intentionally disabled until segment
          splitting and equipment equations are verified.
        </p>
      </div>
    </div>
  );
}

function PropertiesPanel({
  pipeline,
  route,
  scenario,
  findingCount,
  takeoff,
  onScenarioChange,
  onApplyElevation,
  onPreferenceChange,
}: {
  pipeline: PipelineEngineeringState;
  route: PipelineRoute | undefined;
  scenario: PipelineScenario | undefined;
  findingCount: number;
  takeoff: PipelineEngineeringState["quantitySnapshots"][number] | undefined;
  onScenarioChange: (change: Partial<PipelineScenario>) => void;
  onApplyElevation: (startElevationFt: number, endElevationFt: number) => void;
  onPreferenceChange: (change: Partial<PipelineEngineeringState["preferences"]>) => void;
}) {
  const activeRun = pipeline.solverRuns.find((run) => run.scenarioId === scenario?.id);
  const panel = pipeline.preferences.selectedRightPanel;
  return (
    <div className="p-3">
      <div className="grid grid-cols-5 gap-1 rounded-xl bg-secondary p-1">
        {(
          [
            ["engineering", "Inputs"],
            ["materials", "Pipe"],
            ["quantities", "QTO"],
            ["costs", "Cost"],
            ["warnings", `${findingCount}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => onPreferenceChange({ selectedRightPanel: id })}
            className={cn(
              "rounded-lg px-1 py-2 text-[9px] font-semibold",
              panel === id && "bg-card text-primary shadow-sm",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!route || !scenario ? (
        <div className="mt-4 rounded-2xl bg-secondary p-4 text-xs text-muted-foreground">
          Select a line route to define the engineering scenario.
        </div>
      ) : panel === "engineering" ? (
        <div className="mt-4 space-y-3">
          <StatusCallout status={activeRun?.status ?? "stale"} />
          <LabeledSelect
            label="Fluid"
            value={scenario.fluidId}
            onChange={(fluidId) => onScenarioChange({ fluidId })}
            options={pipeline.fluids.map((fluid) => ({ value: fluid.id, label: fluid.name }))}
          />
          <NumericField
            label="Inlet pressure"
            unit="psi"
            value={scenario.inletPressurePa * pipelineUnits.paToPsi}
            onChange={(value) =>
              onScenarioChange({ inletPressurePa: value * pipelineUnits.psiToPa })
            }
          />
          <NumericField
            label="Flow"
            unit="US gpm"
            value={scenario.flowM3S * pipelineUnits.m3sToGpm}
            onChange={(value) => onScenarioChange({ flowM3S: value * pipelineUnits.gpmToM3S })}
          />
          <NumericField
            label="Temperature"
            unit="°F"
            value={pipelineUnits.kelvinToFahrenheit(scenario.temperatureK)}
            onChange={(value) =>
              onScenarioChange({ temperatureK: pipelineUnits.fahrenheitToKelvin(value) })
            }
          />
          <NumericField
            label="Minimum delivery pressure"
            unit="psi"
            value={scenario.limits.minimumPressurePa * pipelineUnits.paToPsi}
            onChange={(value) =>
              onScenarioChange({
                limits: { ...scenario.limits, minimumPressurePa: value * pipelineUnits.psiToPa },
              })
            }
          />
          <NumericField
            label="Scenario MAOP"
            unit="psi"
            value={scenario.limits.maopPa * pipelineUnits.paToPsi}
            onChange={(value) =>
              onScenarioChange({
                limits: { ...scenario.limits, maopPa: value * pipelineUnits.psiToPa },
              })
            }
          />
          <NumericField
            label="Max velocity"
            unit="ft/s"
            value={scenario.limits.maximumVelocityMS * pipelineUnits.msToFts}
            onChange={(value) =>
              onScenarioChange({
                limits: { ...scenario.limits, maximumVelocityMS: value / pipelineUnits.msToFts },
              })
            }
          />
          <ManualElevationControl route={route} onApply={onApplyElevation} />
          <LabeledSelect
            label="Route color"
            value={pipeline.preferences.visualizationMode}
            onChange={(value) =>
              onPreferenceChange({ visualizationMode: value as PipelineVisualizationMode })
            }
            options={[
              { value: "pressure-margin", label: "MAOP pressure margin" },
              { value: "minimum-pressure-margin", label: "Minimum-pressure margin" },
              { value: "pressure", label: "Pressure" },
              { value: "velocity", label: "Velocity" },
              { value: "elevation", label: "Elevation" },
            ]}
          />
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-900">
            Static head is omitted wherever elevation is missing. Add authoritative DEM/survey data
            in the next terrain increment before relying on pressure results.
          </p>
        </div>
      ) : panel === "materials" ? (
        <div className="mt-4 space-y-3">
          <LabeledSelect
            label="Pipe screening option"
            value={scenario.pipeSpecificationId}
            onChange={(pipeSpecificationId) => onScenarioChange({ pipeSpecificationId })}
            options={pipeline.pipeSpecifications.map((pipe) => ({
              value: pipe.id,
              label: pipe.name,
            }))}
          />
          {pipeline.pipeSpecifications
            .filter((pipe) => pipe.id === scenario.pipeSpecificationId)
            .map((pipe) => (
              <div
                key={pipe.id}
                className="rounded-2xl bg-secondary p-3 text-[10px] leading-relaxed"
              >
                <strong className="text-xs">PIPE SPECIFICATION — CONFIRM</strong>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Material</dt>
                  <dd>{pipe.material}</dd>
                  <dt className="text-muted-foreground">Specification</dt>
                  <dd>{pipe.manufacturingSpecification}</dd>
                  <dt className="text-muted-foreground">Grade</dt>
                  <dd>{pipe.grade}</dd>
                  <dt className="text-muted-foreground">OD</dt>
                  <dd>{(pipe.outsideDiameterM / 0.0254).toFixed(3)} in</dd>
                  <dt className="text-muted-foreground">Wall</dt>
                  <dd>{(pipe.wallThicknessM / 0.0254).toFixed(3)} in</dd>
                  <dt className="text-muted-foreground">ID</dt>
                  <dd>{(pipe.insideDiameterM / 0.0254).toFixed(3)} in</dd>
                  <dt className="text-muted-foreground">Joint</dt>
                  <dd>{pipe.jointType}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{pipe.confirmedAt ? "Confirmed" : "Screening only"}</dd>
                </dl>
                <p className="mt-2 text-amber-800">
                  Use Recommended/confirmation workflow is not released yet. Selecting this option
                  does not establish code compliance or pressure rating.
                </p>
              </div>
            ))}
        </div>
      ) : panel === "quantities" ? (
        <div className="mt-4 space-y-2">
          <h2 className="text-xs font-semibold">Live traceable takeoff</h2>
          {takeoff?.items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border p-3">
              <strong className="block text-[10px]">{item.description}</strong>
              <span className="num text-xs text-primary">
                {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} {item.unit}
              </span>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {item.formulaVersion} · {item.sourceIds.length} model source
                {item.sourceIds.length === 1 ? "" : "s"}
              </p>
            </div>
          )) ?? (
            <p className="text-xs text-muted-foreground">Run the model to create quantities.</p>
          )}
        </div>
      ) : panel === "costs" ? (
        <CostPanel pipeline={pipeline} scenario={scenario} onScenarioChange={onScenarioChange} />
      ) : (
        <div className="mt-4 space-y-2">
          {(activeRun?.findings ?? []).map((item) => (
            <div
              key={item.id}
              className={cn(
                "rounded-xl border p-3",
                item.severity === "blocker" || item.severity === "error"
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50",
              )}
            >
              <strong className="block text-[10px]">{item.title}</strong>
              <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{item.detail}</p>
              {item.stationM !== undefined && (
                <span className="num mt-1 block text-[9px]">
                  Station {formatStation(item.stationM)}
                </span>
              )}
            </div>
          ))}
          {!activeRun?.findings.length && (
            <p className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
              No findings for the current run. Preliminary status still requires validation.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CostPanel({
  pipeline,
  scenario,
  onScenarioChange,
}: {
  pipeline: PipelineEngineeringState;
  scenario: PipelineScenario;
  onScenarioChange: (change: Partial<PipelineScenario>) => void;
}) {
  const estimate =
    pipeline.latestEstimate?.scenarioId === scenario.id ? pipeline.latestEstimate : undefined;
  const assumptions = scenario.estimateAssumptions;
  const patchAssumptions = (change: Partial<PipelineScenario["estimateAssumptions"]>) =>
    onScenarioChange({ estimateAssumptions: { ...assumptions, ...change } });
  return (
    <div className="mt-4 space-y-3">
      <p className="rounded-xl bg-secondary p-3 text-[10px] leading-relaxed">
        Rates entered here are classified as <strong>Budget Allowance</strong>. They are not vendor
        quotes. Freight, crossings, facilities and indirects are excluded from this foundation
        total.
      </p>
      <OptionalNumericField
        label="Pipe material"
        unit="$/m"
        value={assumptions.pipeMaterialPerM}
        onChange={(value) => {
          const next = { ...assumptions };
          if (value === undefined) delete next.pipeMaterialPerM;
          else next.pipeMaterialPerM = value;
          onScenarioChange({ estimateAssumptions: next });
        }}
      />
      <OptionalNumericField
        label="Installation"
        unit="$/m"
        value={assumptions.installationPerM}
        onChange={(value) => {
          const next = { ...assumptions };
          if (value === undefined) delete next.installationPerM;
          else next.installationPerM = value;
          onScenarioChange({ estimateAssumptions: next });
        }}
      />
      <NumericField
        label="Contingency"
        unit="%"
        value={assumptions.contingencyPercent}
        onChange={(value) => patchAssumptions({ contingencyPercent: value })}
      />
      <NumericField
        label="Markup"
        unit="%"
        value={assumptions.markupPercent}
        onChange={(value) => patchAssumptions({ markupPercent: value })}
      />
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Preliminary indicated total
        </span>
        <strong className="num mt-1 block text-xl text-primary">
          {money(estimate?.recommendedBid ?? null, assumptions.currency)}
        </strong>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
          <dt>Material</dt>
          <dd className="text-right">{money(estimate?.materialCost ?? null)}</dd>
          <dt>Installation</dt>
          <dd className="text-right">{money(estimate?.installationCost ?? null)}</dd>
          <dt>Contingency</dt>
          <dd className="text-right">{money(estimate?.contingency ?? null)}</dd>
          <dt>Markup</dt>
          <dd className="text-right">{money(estimate?.markup ?? null)}</dd>
        </dl>
      </div>
      {estimate?.warnings.map((warning) => (
        <p key={warning} className="text-[9px] leading-relaxed text-amber-800">
          • {warning}
        </p>
      ))}
    </div>
  );
}

function StatusCallout({
  status,
}: {
  status: "solved" | "warning" | "failed" | "unsupported" | "stale";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-[10px]",
        status === "solved"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : status === "unsupported" || status === "failed"
            ? "border-red-200 bg-red-50 text-red-900"
            : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      <strong className="block">
        {status === "solved"
          ? "Preliminary solve completed"
          : status === "unsupported"
            ? "Advanced analysis required"
            : status === "failed"
              ? "Solve failed"
              : status === "warning"
                ? "Solved with findings"
                : "Awaiting calculation"}
      </strong>
      <span>Native liquid solver v0.1.0 · preliminary/unvalidated for final design</span>
    </div>
  );
}

function ResultLegend({ mode, stale }: { mode: PipelineVisualizationMode; stale: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-16 left-3 z-20 rounded-xl border border-border bg-card/95 p-2 text-[9px] shadow-panel lg:bottom-3">
      <div className="font-semibold">
        {mode.replaceAll("-", " ")}
        {stale ? " · stale" : ""}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <LegendDot color="#15803d" label="comfortable" />
        <LegendDot color="#d6a10d" label="approaching" />
        <LegendDot color="#ea580c" label="near limit" />
        <LegendDot color="#b91c1c" label="exceeds" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <i className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function PressureScrubTooltip({
  point,
  route,
  pipe,
  maopPa,
}: {
  point: PipelineProfilePoint;
  route: PipelineRoute | undefined;
  pipe: string;
  maopPa: number;
}) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-20 z-30 w-64 -translate-x-1/2 rounded-2xl border border-border bg-card/95 p-3 text-[10px] shadow-float">
      <div className="flex items-center justify-between">
        <strong>Station {formatStation(point.stationM)}</strong>
        <span className="rounded-full bg-secondary px-2 py-0.5">{point.provenance}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Distance</dt>
        <dd>{(point.stationM * pipelineUnits.mToMi).toFixed(2)} mi</dd>
        <dt className="text-muted-foreground">Elevation</dt>
        <dd>
          {point.pipelineElevationM === undefined
            ? "Not sampled"
            : `${(point.pipelineElevationM * pipelineUnits.mToFt).toFixed(0)} ft`}
        </dd>
        <dt className="text-muted-foreground">Pressure</dt>
        <dd>{(point.pressurePa * pipelineUnits.paToPsi).toFixed(1)} psi</dd>
        <dt className="text-muted-foreground">MAOP</dt>
        <dd>{(maopPa * pipelineUnits.paToPsi).toFixed(0)} psi</dd>
        <dt className="text-muted-foreground">MAOP margin</dt>
        <dd>{(point.pressureMarginPa * pipelineUnits.paToPsi).toFixed(1)} psi</dd>
        <dt className="text-muted-foreground">Flow</dt>
        <dd>{(point.flowM3S * pipelineUnits.m3sToGpm).toFixed(0)} gpm</dd>
        <dt className="text-muted-foreground">Velocity</dt>
        <dd>{(point.velocityMS * pipelineUnits.msToFts).toFixed(2)} ft/s</dd>
        <dt className="text-muted-foreground">Temperature</dt>
        <dd>{pipelineUnits.kelvinToFahrenheit(point.temperatureK).toFixed(1)}°F</dd>
      </dl>
      <p className="mt-2 truncate text-[9px] text-muted-foreground" title={pipe}>
        {pipe}
      </p>
      {route && (
        <p className="truncate text-[9px] text-muted-foreground">
          {route.sourceNodeName} → {route.destinationNodeName}
        </p>
      )}
    </div>
  );
}

function ManualElevationControl({
  route,
  onApply,
}: {
  route: PipelineRoute;
  onApply: (startElevationFt: number, endElevationFt: number) => void;
}) {
  const [startElevationFt, setStartElevationFt] = useState(
    (route.stations[0]?.pipelineElevationM ?? route.stations[0]?.groundElevationM ?? 0) *
      pipelineUnits.mToFt,
  );
  const [endElevationFt, setEndElevationFt] = useState(
    (route.stations.at(-1)?.pipelineElevationM ?? route.stations.at(-1)?.groundElevationM ?? 0) *
      pipelineUnits.mToFt,
  );

  useEffect(() => {
    setStartElevationFt(
      (route.stations[0]?.pipelineElevationM ?? route.stations[0]?.groundElevationM ?? 0) *
        pipelineUnits.mToFt,
    );
    setEndElevationFt(
      (route.stations.at(-1)?.pipelineElevationM ?? route.stations.at(-1)?.groundElevationM ?? 0) *
        pipelineUnits.mToFt,
    );
  }, [route.id, route.stations]);

  return (
    <details className="rounded-xl border border-border p-2">
      <summary className="cursor-pointer text-[10px] font-semibold">
        Manual elevation profile
      </summary>
      <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
        Creates a linear screening profile between endpoints. It is not surveyed data and will be
        replaced only when you choose a higher-authority source.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumericField
          label="Start"
          unit="ft"
          value={startElevationFt}
          onChange={setStartElevationFt}
        />
        <NumericField label="End" unit="ft" value={endElevationFt} onChange={setEndElevationFt} />
      </div>
      <button
        onClick={() => onApply(startElevationFt, endElevationFt)}
        className="mt-2 w-full rounded-lg bg-secondary px-3 py-2 text-[10px] font-semibold hover:bg-accent"
      >
        Apply linear profile
      </button>
    </details>
  );
}

function NumericField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[10px] font-medium">
        <span>{label}</span>
        <span className="text-muted-foreground">{unit}</span>
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="num w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
      />
    </label>
  );
}

function OptionalNumericField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[10px] font-medium">
        <span>{label}</span>
        <span className="text-muted-foreground">{unit}</span>
      </span>
      <input
        type="number"
        value={value ?? ""}
        placeholder="Add allowance"
        onChange={(event) => {
          const text = event.target.value;
          onChange(text === "" ? undefined : Number(text));
        }}
        className="num w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function WorkspaceAction({
  icon,
  label,
  onClick,
  disabled,
  planned,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  planned?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || planned}
      title={planned ? `${label} is documented for a later validated increment` : label}
      className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-secondary px-2 text-[10px] font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className="[&>svg]:size-3.5">{icon}</span>
      {label}
      {planned && <span className="rounded bg-card px-1 text-[7px]">planned</span>}
    </button>
  );
}

function MobileAction({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-w-14 flex-col items-center rounded-xl px-2 py-1.5 text-[9px]",
        active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      <span className="[&>svg]:size-4">{icon}</span>
      {label}
    </button>
  );
}
