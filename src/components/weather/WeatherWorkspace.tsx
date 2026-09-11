import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudRainWind,
  CloudSun,
  Crosshair,
  Database,
  Eye,
  GripVertical,
  Heart,
  Layers3,
  LoaderCircle,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Thermometer,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { LandDraftMark } from "@/components/brand/LandDraftMark";
import { BasemapControl } from "@/components/gis/BasemapControl";
import { MapCanvas } from "@/components/gis/MapCanvas";
import { SearchBox } from "@/components/gis/SearchBox";
import { useMapRef } from "@/lib/gis/mapRef";
import { useWorkbench } from "@/lib/gis/store";
import { cn } from "@/lib/utils";
import { getWeatherAtPoint } from "@/lib/weather/api";
import { hasWeatherCapability } from "@/lib/weather/entitlements";
import {
  formatPressure,
  formatTemperature,
  formatVisibility,
  formatWind,
  weatherAgeLabel,
} from "@/lib/weather/format";
import { createWeatherPreset, normalizeWeatherWorkspace } from "@/lib/weather/model";
import { WEATHER_LAYER_GROUPS, weatherLayerRegistry } from "@/lib/weather/registry";
import type {
  WeatherAlert,
  WeatherBundle,
  WeatherLayerSetting,
  WeatherTimelineState,
  WeatherWorkspaceState,
} from "@/lib/weather/types";
import { WeatherMapOverlay } from "./WeatherMapOverlay";
import { WeatherTimeline } from "./WeatherTimeline";

type MobileSheet = "layers" | "weather" | "sources" | null;
type WorkspaceView = "weather" | "meteorology" | "storm-chaser" | "photography";

const starterChoices = [
  { name: "Current Weather", category: "Current", layer: "weather.current", icon: CloudSun },
  { name: "Radar", category: "Radar", layer: "weather.radar.simple", icon: CloudRainWind },
  { name: "Storms", category: "Severe weather", layer: "weather.severe.alerts", icon: ShieldAlert },
  { name: "Wind", category: "Wind", layer: "weather.wind.surface", icon: Wind },
  { name: "Lightning", category: "Lightning", layer: "weather.lightning.recent", icon: Zap },
  { name: "Forecast", category: "Forecast", layer: "weather.current", icon: Cloud },
] as const;

const workspaceChoices: Array<{ id: WorkspaceView; name: string; help: string }> = [
  { id: "weather", name: "Weather", help: "Simple weather layers and inspection" },
  { id: "meteorology", name: "Meteorology", help: "Professional products and analysis" },
  { id: "storm-chaser", name: "Storm Chaser", help: "Warnings, storm context, and field safety" },
  { id: "photography", name: "Photography", help: "Viewing and light-planning foundation" },
];

const CONNECTED_LAYERS = new Set([
  "weather.current",
  "weather.radar.simple",
  "weather.radar.pro.reflectivity",
  "weather.radar.pro.velocity",
  "weather.radar.pro.hydrometeor",
  "weather.satellite.clouds",
  "weather.satellite.true-color",
  "weather.satellite.infrared",
  "weather.satellite.water-vapor",
  "weather.satellite.cloud-top",
  "weather.satellite.smoke",
  "weather.wind.surface",
  "weather.lightning.recent",
  "weather.severe.alerts",
  "weather.forecast.precipitation",
  "weather.surface",
  "weather.metar",
  "weather.tropical",
  "weather.winter",
  "weather.fire",
  "weather.air-quality",
  "weather.photo",
]);

function closestFrameIndex(frames: Array<{ timestamp: string }>, selectedTime: string) {
  const target = new Date(selectedTime).getTime();
  let selected = 0;
  let distance = Number.POSITIVE_INFINITY;
  frames.forEach((frame, index) => {
    const next = Math.abs(new Date(frame.timestamp).getTime() - target);
    if (next < distance) {
      selected = index;
      distance = next;
    }
  });
  return selected;
}

export function WeatherWorkspace() {
  const wb = useWorkbench();
  const { map } = useMapRef();
  const workspace = useMemo(
    () => normalizeWeatherWorkspace(wb.weatherWorkspace),
    [wb.weatherWorkspace],
  );
  const requestedLayerIds = useMemo(
    () =>
      Array.from(
        new Set([
          "weather.current",
          "weather.severe.alerts",
          ...Object.entries(workspace.layerSettings).flatMap(([id, setting]) =>
            setting.visible ? [id] : [],
          ),
        ]),
      ),
    [workspace.layerSettings],
  );
  const [bundle, setBundle] = useState<WeatherBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [advancedLayers, setAdvancedLayers] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<WeatherAlert | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("weather");
  const [presetName, setPresetName] = useState("");
  const loadedProject = useRef<string | null>(null);
  const latestWeatherRequest = useRef(0);

  useEffect(() => {
    if (wb.projectReady && !wb.weatherWorkspace) wb.setWeatherWorkspace(workspace);
  }, [wb, workspace]);

  const updateWorkspace = useCallback(
    (change: Partial<WeatherWorkspaceState>) => wb.setWeatherWorkspace({ ...workspace, ...change }),
    [wb, workspace],
  );

  const updateTimeline = useCallback(
    (change: Partial<WeatherTimelineState>) =>
      updateWorkspace({ timeline: { ...workspace.timeline, ...change } }),
    [updateWorkspace, workspace.timeline],
  );

  const loadPoint = useCallback(
    async (point: [number, number], quietly = false, layers: string[] = requestedLayerIds) => {
      const requestId = ++latestWeatherRequest.current;
      if (!quietly) setLoading(true);
      setError(null);
      try {
        const next = await getWeatherAtPoint({
          data: { longitude: point[0], latitude: point[1], requestedLayerIds: layers },
        });
        if (requestId === latestWeatherRequest.current) setBundle(next);
        return next;
      } catch (nextError) {
        const message =
          nextError instanceof Error ? nextError.message : "Weather data did not load";
        if (requestId === latestWeatherRequest.current) {
          setError(message);
          if (!quietly) toast.error("Weather did not load", { description: message });
        }
        return null;
      } finally {
        if (requestId === latestWeatherRequest.current) setLoading(false);
      }
    },
    [requestedLayerIds],
  );

  useEffect(() => {
    if (!wb.projectReady || loadedProject.current === wb.projectId) return;
    loadedProject.current = wb.projectId;
    const point = workspace.lastInspectionPoint ?? wb.mapView.center;
    if (!workspace.lastInspectionPoint)
      wb.setWeatherWorkspace({ ...workspace, lastInspectionPoint: point });
    void loadPoint(point);
  }, [loadPoint, wb, workspace]);

  useEffect(() => {
    if (!map || !workspace.inspectorEnabled) return;
    const inspect = (event: MapMouseEvent) => {
      const point: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      updateWorkspace({ lastInspectionPoint: point });
      setSelectedAlert(null);
      void loadPoint(point);
    };
    map.on("click", inspect);
    return () => {
      map.off("click", inspect);
    };
  }, [loadPoint, map, updateWorkspace, workspace.inspectorEnabled]);

  const timelineFrames = useMemo(() => {
    const candidates = [
      ...(workspace.layerSettings["weather.radar.simple"]?.visible
        ? (bundle?.radarFrames ?? [])
        : []),
      ...(bundle?.rasterFrames ?? []).filter(
        (frame) => workspace.layerSettings[frame.layerId]?.visible,
      ),
    ];
    return [...new Map(candidates.map((frame) => [frame.timestamp, frame])).values()].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }, [bundle?.radarFrames, bundle?.rasterFrames, workspace.layerSettings]);

  useEffect(() => {
    if (!workspace.timeline.playing || timelineFrames.length < 2) return;
    const timer = window.setInterval(() => {
      const currentIndex = closestFrameIndex(timelineFrames, workspace.timeline.selectedTime);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= timelineFrames.length) {
        if (!workspace.timeline.loop) {
          updateTimeline({ playing: false });
          return;
        }
        updateTimeline({ selectedTime: timelineFrames[0]!.timestamp });
        return;
      }
      updateTimeline({ selectedTime: timelineFrames[nextIndex]!.timestamp });
    }, 1_100 / workspace.timeline.speed);
    return () => window.clearInterval(timer);
  }, [timelineFrames, updateTimeline, workspace.timeline]);

  const setLayer = useCallback(
    (id: string, change: Partial<WeatherLayerSetting>) => {
      const current = workspace.layerSettings[id];
      if (!current) return;
      updateWorkspace({
        layerSettings: {
          ...workspace.layerSettings,
          [id]: { ...current, ...change },
        },
      });
      if (change.visible && !current.visible) {
        const point = workspace.lastInspectionPoint ?? wb.mapView.center;
        void loadPoint(point, true, Array.from(new Set([...requestedLayerIds, id])));
      }
    },
    [
      loadPoint,
      requestedLayerIds,
      updateWorkspace,
      wb.mapView.center,
      workspace.lastInspectionPoint,
      workspace.layerSettings,
    ],
  );

  const reorderWeatherLayer = useCallback(
    (sourceId: string, targetId: string, edge: "before" | "after") => {
      if (sourceId === targetId) return;
      const next = workspace.layerOrder.filter((id) => id !== sourceId);
      const targetIndex = next.indexOf(targetId);
      if (targetIndex < 0) return;
      next.splice(targetIndex + (edge === "after" ? 1 : 0), 0, sourceId);
      updateWorkspace({ layerOrder: next });
    },
    [updateWorkspace, workspace.layerOrder],
  );

  const chooseStarter = (choice: (typeof starterChoices)[number]) => {
    const currentSetting = workspace.layerSettings[choice.layer];
    updateWorkspace({
      introductoryChooserSeen: true,
      selectedCategory: choice.category,
      layerSettings: currentSetting
        ? {
            ...workspace.layerSettings,
            [choice.layer]: { ...currentSetting, visible: true },
          }
        : workspace.layerSettings,
    });
    void loadPoint(
      workspace.lastInspectionPoint ?? wb.mapView.center,
      true,
      Array.from(new Set([...requestedLayerIds, choice.layer])),
    );
  };

  const openWorkspace = (view: WorkspaceView) => {
    setWorkspaceView(view);
    if (view === "weather") return;
    setAdvancedLayers(true);
    const photographySetting = workspace.layerSettings["weather.photo"];
    const layerSettings =
      view === "photography" && photographySetting
        ? {
            ...workspace.layerSettings,
            "weather.photo": { ...photographySetting, visible: true },
          }
        : workspace.layerSettings;
    updateWorkspace({
      selectedCategory:
        view === "meteorology"
          ? "Meteorology"
          : view === "storm-chaser"
            ? "Storm chaser"
            : "Photography",
      layerSettings,
    });
    if (view === "photography")
      void loadPoint(
        workspace.lastInspectionPoint ?? wb.mapView.center,
        false,
        Array.from(new Set([...requestedLayerIds, "weather.photo"])),
      );
  };

  const activeLayerCount = Object.values(workspace.layerSettings).filter(
    (setting) => setting.visible,
  ).length;
  const current = bundle?.current;
  const activeAlert = selectedAlert ?? bundle?.alerts[0] ?? null;

  const visibleGroups = useMemo(
    () =>
      WEATHER_LAYER_GROUPS.filter((group) => {
        const layers = weatherLayerRegistry.filter((layer) => layer.group === group);
        return layers.some((layer) => advancedLayers || layer.audience === "basic");
      }),
    [advancedLayers],
  );

  if (!workspace.enabled)
    return (
      <div className="app-safe-frame app-viewport flex items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-float">
          <CloudSun className="mx-auto size-10 text-primary" />
          <h1 className="mt-3 text-lg font-bold">Weather is disabled for this project</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Core LandDraft mapping remains available. Re-enable the optional workspace to restore
            this project’s weather presets.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => window.location.assign("/")}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-semibold"
            >
              Return to map
            </button>
            {wb.canEditProject && (
              <button
                onClick={() => updateWorkspace({ enabled: true })}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Enable Weather
              </button>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <div className="app-safe-frame app-viewport flex flex-col overflow-hidden bg-background">
      <header className="relative z-50 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-2 lg:px-3">
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
          <h1 className="truncate text-sm font-bold">Weather & Meteorology</h1>
          <p className="truncate text-[9px] text-muted-foreground">
            {wb.projectName} · Observed, forecast, and model data stay labeled
          </p>
        </div>

        <div className="ml-auto hidden items-center gap-1 overflow-x-auto md:flex">
          {workspaceChoices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => openWorkspace(choice.id)}
              className={cn(
                "h-9 shrink-0 rounded-xl px-3 text-[10px] font-semibold",
                workspaceView === choice.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-accent",
              )}
              title={choice.help}
            >
              {choice.name}
            </button>
          ))}
          <button
            onClick={() => void loadPoint(workspace.lastInspectionPoint ?? wb.mapView.center)}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary hover:bg-accent"
            title="Refresh weather at inspected point"
            aria-label="Refresh weather"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => void wb.saveProject("manual")}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary hover:bg-accent"
            title="Save Weather workspace with this project"
            aria-label="Save project"
          >
            <Save className="size-4" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {leftOpen && (
          <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-card lg:block">
            <WeatherLayerPanel
              workspace={workspace}
              bundle={bundle}
              groups={visibleGroups}
              advanced={advancedLayers}
              presetName={presetName}
              onPresetName={setPresetName}
              onAdvanced={setAdvancedLayers}
              onCategory={(selectedCategory) => updateWorkspace({ selectedCategory })}
              onLayer={setLayer}
              onLayerOrder={reorderWeatherLayer}
              onWorkspace={(next) => wb.setWeatherWorkspace(next)}
            />
          </aside>
        )}

        <main className="relative min-w-0 flex-1">
          <MapCanvas />
          <WeatherMapOverlay
            bundle={bundle}
            workspace={workspace}
            onSelectAlert={setSelectedAlert}
          />

          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-2 sm:p-3">
            <div className="pointer-events-auto hidden sm:block">
              <SearchBox />
            </div>
            <div className="pointer-events-auto ml-auto flex items-center gap-2">
              <button
                onClick={() => setLeftOpen((open) => !open)}
                className="hidden size-10 items-center justify-center rounded-2xl border border-border bg-card/95 shadow-float lg:flex"
                title={leftOpen ? "Hide weather layers" : "Show weather layers"}
                aria-label={leftOpen ? "Hide weather layers" : "Show weather layers"}
              >
                <PanelLeft className="size-4" />
              </button>
              <button
                onClick={() => setRightOpen((open) => !open)}
                className="hidden size-10 items-center justify-center rounded-2xl border border-border bg-card/95 shadow-float xl:flex"
                title={rightOpen ? "Hide weather inspector" : "Show weather inspector"}
                aria-label={rightOpen ? "Hide weather inspector" : "Show weather inspector"}
              >
                <PanelRight className="size-4" />
              </button>
              <BasemapControl dropDirection="down" />
            </div>
          </div>

          <div className="pointer-events-none absolute left-3 top-16 z-30 flex max-w-[calc(100%-6rem)] flex-col gap-2">
            <WeatherStatusPill bundle={bundle} loading={loading} error={error} />
            {workspaceView !== "weather" && workspaceView !== "photography" && (
              <div className="pointer-events-auto max-w-sm rounded-2xl border border-border bg-card/95 p-3 text-[10px] shadow-float backdrop-blur">
                <strong>{workspaceChoices.find((item) => item.id === workspaceView)?.name}</strong>
                <p className="mt-1 text-muted-foreground">
                  Connected professional products are available in the layer drawer. Additional
                  products remain disabled until their data and licensing are validated.
                </p>
              </div>
            )}
          </div>

          <div className="absolute inset-x-3 bottom-4 z-30 hidden lg:block">
            <WeatherTimeline
              timeline={workspace.timeline}
              frames={timelineFrames}
              onChange={updateTimeline}
            />
          </div>

          <WeatherLegends workspace={workspace} />

          <div className="absolute inset-x-2 bottom-[calc(.5rem+env(safe-area-inset-bottom))] z-40 grid grid-cols-4 gap-1 rounded-3xl border border-border bg-card/95 p-1 shadow-float backdrop-blur lg:hidden">
            <MobileButton
              icon={<Layers3 />}
              label="Layers"
              active={mobileSheet === "layers"}
              onClick={() => setMobileSheet(mobileSheet === "layers" ? null : "layers")}
            />
            <MobileButton
              icon={<CloudSun />}
              label="Weather"
              active={mobileSheet === "weather"}
              onClick={() => setMobileSheet(mobileSheet === "weather" ? null : "weather")}
            />
            <MobileButton
              icon={<Crosshair />}
              label="Inspect"
              active={workspace.inspectorEnabled}
              onClick={() => updateWorkspace({ inspectorEnabled: !workspace.inspectorEnabled })}
            />
            <MobileButton
              icon={<Database />}
              label="Sources"
              active={mobileSheet === "sources"}
              onClick={() => setMobileSheet(mobileSheet === "sources" ? null : "sources")}
            />
          </div>

          {mobileSheet && (
            <section className="absolute inset-x-2 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-40 max-h-[62dvh] overflow-hidden rounded-3xl border border-border bg-card shadow-float lg:hidden">
              <div className="flex items-center border-b border-border px-4 py-2">
                <strong className="text-sm">
                  {mobileSheet === "layers"
                    ? `Weather layers · ${activeLayerCount} on`
                    : mobileSheet === "sources"
                      ? "Data sources"
                      : "Weather at map point"}
                </strong>
                <button
                  onClick={() => setMobileSheet(null)}
                  className="ml-auto flex size-8 items-center justify-center rounded-xl hover:bg-accent"
                  aria-label="Close weather panel"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="max-h-[calc(62dvh-3rem)] overflow-y-auto">
                {mobileSheet === "layers" ? (
                  <WeatherLayerPanel
                    workspace={workspace}
                    bundle={bundle}
                    groups={visibleGroups}
                    advanced={advancedLayers}
                    presetName={presetName}
                    onPresetName={setPresetName}
                    onAdvanced={setAdvancedLayers}
                    onCategory={(selectedCategory) => updateWorkspace({ selectedCategory })}
                    onLayer={setLayer}
                    onLayerOrder={reorderWeatherLayer}
                    onWorkspace={(next) => wb.setWeatherWorkspace(next)}
                    compact
                  />
                ) : mobileSheet === "sources" ? (
                  <SourcePanel bundle={bundle} />
                ) : (
                  <InspectorPanel bundle={bundle} activeAlert={activeAlert} workspace={workspace} />
                )}
              </div>
              {mobileSheet === "weather" && (
                <div className="border-t border-border p-2">
                  <WeatherTimeline
                    timeline={workspace.timeline}
                    frames={timelineFrames}
                    onChange={updateTimeline}
                    compact
                  />
                </div>
              )}
            </section>
          )}

          {!workspace.introductoryChooserSeen && (
            <FirstRunPanel
              choices={starterChoices}
              onChoose={chooseStarter}
              onSkip={() => updateWorkspace({ introductoryChooserSeen: true })}
            />
          )}
        </main>

        {rightOpen && (
          <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-card xl:block">
            <InspectorPanel bundle={bundle} activeAlert={activeAlert} workspace={workspace} />
            <SourcePanel bundle={bundle} />
          </aside>
        )}
      </div>
    </div>
  );
}

function FirstRunPanel({
  choices,
  onChoose,
  onSkip,
}: {
  choices: typeof starterChoices;
  onChoose: (choice: (typeof starterChoices)[number]) => void;
  onSkip: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-5 shadow-float">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <CloudSun className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold">What do you want to see?</h2>
            <p className="text-xs text-muted-foreground">
              Start simply. Professional products stay one level deeper and every source keeps its
              observation or forecast time.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {choices.map((choice) => (
            <button
              key={choice.name}
              onClick={() => onChoose(choice)}
              className="rounded-2xl bg-secondary p-4 text-left transition-colors hover:bg-accent"
            >
              <choice.icon className="size-5 text-primary" />
              <strong className="mt-2 block text-xs">{choice.name}</strong>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-[9px] text-muted-foreground">
            Official warnings supersede LandDraft analysis.
          </p>
          <button
            onClick={onSkip}
            className="rounded-xl px-3 py-2 text-xs font-semibold hover:bg-accent"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function WeatherLayerPanel({
  workspace,
  bundle,
  groups,
  advanced,
  presetName,
  compact = false,
  onPresetName,
  onAdvanced,
  onCategory,
  onLayer,
  onLayerOrder,
  onWorkspace,
}: {
  workspace: WeatherWorkspaceState;
  bundle: WeatherBundle | null;
  groups: readonly string[];
  advanced: boolean;
  presetName: string;
  compact?: boolean;
  onPresetName: (name: string) => void;
  onAdvanced: (advanced: boolean) => void;
  onCategory: (category: string) => void;
  onLayer: (id: string, change: Partial<WeatherLayerSetting>) => void;
  onLayerOrder: (sourceId: string, targetId: string, edge: "before" | "after") => void;
  onWorkspace: (workspace: WeatherWorkspaceState) => void;
}) {
  const [draggedLayer, setDraggedLayer] = useState<string | null>(null);
  const [layerSearch, setLayerSearch] = useState("");
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    edge: "before" | "after";
  } | null>(null);
  const normalizedSearch = layerSearch.trim().toLowerCase();
  const selectedLayers = weatherLayerRegistry.filter((layer) => {
    if (!advanced && !normalizedSearch && layer.audience !== "basic") return false;
    if (!normalizedSearch) return layer.group === workspace.selectedCategory;
    return [
      layer.name,
      layer.description,
      layer.group,
      layer.providerName,
      ...layer.providerProducts,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedSearch));
  });
  const activeLayers = workspace.layerOrder.flatMap((id) => {
    const layer = weatherLayerRegistry.find((candidate) => candidate.id === id);
    return layer && workspace.layerSettings[id]?.visible ? [layer] : [];
  });
  const layerStatus = (id: string) => {
    const requested = bundle?.request.requestedLayerIds?.includes(id) ?? false;
    const hasRaster = bundle?.rasterFrames.some((frame) => frame.layerId === id) ?? false;
    const available =
      id === "weather.current"
        ? Boolean(bundle?.current || bundle?.forecast.length)
        : id === "weather.radar.simple"
          ? Boolean(bundle?.radarFrames.length)
          : id === "weather.severe.alerts"
            ? Boolean(bundle && requested)
            : id === "weather.wind.surface"
              ? hasRaster || bundle?.current?.windSpeedMS !== undefined
              : id === "weather.metar"
                ? Boolean(bundle?.stationObservations.length)
                : id === "weather.photo"
                  ? Boolean(bundle?.photography)
                  : hasRaster;
    if (available) return { ready: true, label: "AVAILABLE" };
    const registered = weatherLayerRegistry.find((layer) => layer.id === id);
    const hasConnectedProvider = registered?.providerProducts.some((product) =>
      product.startsWith("xweather:"),
    );
    const xweatherNeedsSetup =
      hasConnectedProvider &&
      bundle?.providerHealth.some(
        (provider) =>
          provider.providerId === "xweather-raster" && provider.status === "not-configured",
      );
    if (xweatherNeedsSetup) return { ready: false, label: "SETUP REQUIRED" };
    if (!CONNECTED_LAYERS.has(id) && !hasConnectedProvider)
      return { ready: false, label: "SETUP REQUIRED" };
    return { ready: false, label: requested ? "NO DATA HERE" : "TURN ON TO LOAD" };
  };
  const savePreset = () => {
    const preset = createWeatherPreset(presetName, workspace);
    onWorkspace({ ...workspace, presets: [...workspace.presets, preset].slice(-25) });
    onPresetName("");
    toast.success("Weather preset saved");
  };

  return (
    <div className={cn("space-y-4", compact ? "p-3" : "p-4")}>
      <div>
        <div className="flex items-center gap-2">
          <CloudSun className="size-4 text-primary" />
          <strong className="text-xs">Weather layers</strong>
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[9px]">
            {Object.values(workspace.layerSettings).filter((item) => item.visible).length} on
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Products load for the visible location. Layers without a validated feed remain clearly
          unavailable.
        </p>
      </div>

      <details className="rounded-2xl border border-border bg-background" open>
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
          Active layer stack · {activeLayers.length}
        </summary>
        <div className="border-t border-border p-2">
          <p className="mb-2 text-[9px] leading-relaxed text-muted-foreground">
            Top item draws in front. Drag a row between layers, or use the arrows.
          </p>
          <div className="space-y-1">
            {activeLayers.map((layer, index) => (
              <div
                key={layer.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", layer.id);
                  setDraggedLayer(layer.id);
                }}
                onDragEnd={() => {
                  setDraggedLayer(null);
                  setDropTarget(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setDropTarget({
                    id: layer.id,
                    edge: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
                  });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain") || draggedLayer;
                  if (sourceId && dropTarget) onLayerOrder(sourceId, layer.id, dropTarget.edge);
                  setDraggedLayer(null);
                  setDropTarget(null);
                }}
                className={cn(
                  "relative flex min-w-0 items-center gap-1 rounded-xl bg-secondary px-1.5 py-1.5",
                  draggedLayer === layer.id && "opacity-45",
                )}
              >
                {dropTarget?.id === layer.id && (
                  <span
                    className={cn(
                      "pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary",
                      dropTarget.edge === "before" ? "-top-0.5" : "-bottom-0.5",
                    )}
                  />
                )}
                <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 truncate text-[10px] font-semibold"
                  title={layer.name}
                >
                  {layer.name}
                </span>
                <button
                  onClick={() => {
                    const target = activeLayers[index - 1];
                    if (target) onLayerOrder(layer.id, target.id, "before");
                  }}
                  disabled={index === 0}
                  className="flex size-7 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-25"
                  title="Move toward front"
                  aria-label={`Move ${layer.name} toward front`}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  onClick={() => {
                    const target = activeLayers[index + 1];
                    if (target) onLayerOrder(layer.id, target.id, "after");
                  }}
                  disabled={index === activeLayers.length - 1}
                  className="flex size-7 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-25"
                  title="Move toward back"
                  aria-label={`Move ${layer.name} toward back`}
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  onClick={() => onLayer(layer.id, { visible: false })}
                  className="flex size-7 items-center justify-center rounded-lg text-primary hover:bg-accent"
                  title="Hide layer"
                  aria-label={`Hide ${layer.name}`}
                >
                  <Eye className="size-3.5" />
                </button>
              </div>
            ))}
            {!activeLayers.length && (
              <p className="rounded-xl bg-secondary p-3 text-[10px] text-muted-foreground">
                Turn on a Weather layer to add it to this stack.
              </p>
            )}
          </div>
        </div>
      </details>

      <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={layerSearch}
          onChange={(event) => setLayerSearch(event.target.value)}
          placeholder="Search weather layers"
          className="min-w-0 flex-1 bg-transparent text-[10px] outline-none placeholder:text-muted-foreground"
        />
        {layerSearch && (
          <button
            type="button"
            onClick={() => setLayerSearch("")}
            className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary"
            aria-label="Clear weather layer search"
          >
            <X className="size-3" />
          </button>
        )}
      </label>

      <div className="grid grid-cols-2 gap-1">
        {groups.map((group) => (
          <button
            key={group}
            onClick={() => onCategory(group)}
            className={cn(
              "truncate rounded-xl px-2 py-2 text-left text-[10px] font-semibold",
              workspace.selectedCategory === group
                ? "bg-primary text-primary-foreground"
                : "bg-secondary hover:bg-accent",
            )}
            title={group}
          >
            {group}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {!selectedLayers.length && (
          <div className="rounded-2xl bg-secondary p-3 text-[10px] text-muted-foreground">
            {normalizedSearch
              ? "No weather layers match this search."
              : "Turn on professional layers to see this category."}
          </div>
        )}
        {selectedLayers.map((layer) => {
          const setting = workspace.layerSettings[layer.id];
          if (!setting || !hasWeatherCapability(layer.capability)) return null;
          const status = layerStatus(layer.id);
          return (
            <div key={layer.id} className="rounded-2xl border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                <button
                  onClick={() => onLayer(layer.id, { visible: !setting.visible })}
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl",
                    setting.visible ? "bg-primary text-primary-foreground" : "bg-secondary",
                  )}
                  aria-label={`${setting.visible ? "Hide" : "Show"} ${layer.name}`}
                >
                  <Eye className="size-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <strong className="truncate text-xs">{layer.name}</strong>
                    <button
                      onClick={() => onLayer(layer.id, { favorite: !setting.favorite })}
                      className={cn(
                        "ml-auto rounded-lg p-1",
                        setting.favorite ? "text-primary" : "text-muted-foreground",
                      )}
                      aria-label={`${setting.favorite ? "Remove" : "Add"} favorite`}
                    >
                      <Heart className={cn("size-3.5", setting.favorite && "fill-current")} />
                    </button>
                  </div>
                  <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
                    {layer.description}
                  </p>
                  <span
                    className={cn(
                      "mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-semibold",
                      status.ready
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {status.label}
                  </span>
                  {layer.providerName && (
                    <div className="mt-1 flex flex-wrap gap-1 text-[8px] text-muted-foreground">
                      <span className="rounded-full bg-secondary px-1.5 py-0.5">
                        {layer.providerName}
                      </span>
                      {layer.providerCostMultiplier && (
                        <span className="rounded-full bg-secondary px-1.5 py-0.5">
                          {layer.providerCostMultiplier}× provider access
                        </span>
                      )}
                      {layer.coverage && (
                        <span className="rounded-full bg-secondary px-1.5 py-0.5">
                          {layer.coverage}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {setting.visible && layer.dataType !== "point" && (
                <label className="mt-2 flex items-center gap-2 text-[9px] text-muted-foreground">
                  Opacity
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={setting.opacity}
                    onChange={(event) => onLayer(layer.id, { opacity: Number(event.target.value) })}
                    className="min-w-0 flex-1 accent-primary"
                  />
                  {Math.round(setting.opacity * 100)}%
                </label>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => onAdvanced(!advanced)}
        className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold"
      >
        {advanced ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        Professional layers
      </button>

      <details className="rounded-2xl border border-border p-3">
        <summary className="cursor-pointer text-xs font-semibold">Presets & units</summary>
        <div className="mt-3 space-y-2">
          <select
            value={workspace.unitSystem}
            onChange={(event) =>
              onWorkspace({
                ...workspace,
                unitSystem: event.target.value as WeatherWorkspaceState["unitSystem"],
              })
            }
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
            aria-label="Weather units"
          >
            <option value="us">US customary</option>
            <option value="metric">Metric</option>
            <option value="meteorological">Meteorological</option>
          </select>
          {workspace.presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() =>
                onWorkspace({
                  ...workspace,
                  layerSettings: preset.layerSettings,
                  layerOrder: preset.layerOrder ?? workspace.layerOrder,
                  timeline: { ...workspace.timeline, mode: preset.timelineMode },
                  activePresetId: preset.id,
                })
              }
              className="flex w-full items-center rounded-xl bg-secondary px-3 py-2 text-left text-[10px] font-semibold"
            >
              {preset.name}
              <ChevronRight className="ml-auto size-3.5" />
            </button>
          ))}
          <div className="flex gap-1">
            <input
              value={presetName}
              onChange={(event) => onPresetName(event.target.value)}
              placeholder="Preset name"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs"
            />
            <button
              onClick={savePreset}
              className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"
              aria-label="Save weather preset"
              title="Save preset"
            >
              <Save className="size-4" />
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

function InspectorPanel({
  bundle,
  activeAlert,
  workspace,
}: {
  bundle: WeatherBundle | null;
  activeAlert: WeatherAlert | null;
  workspace: WeatherWorkspaceState;
}) {
  const current = bundle?.current;
  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2">
          <Crosshair className="size-4 text-primary" />
          <strong className="text-xs">Weather inspector</strong>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Tap the map to load consolidated weather for that exact point.
        </p>
      </div>

      {current ? (
        <div className="rounded-2xl bg-secondary p-3">
          <div className="flex items-start gap-2">
            <Thermometer className="size-5 text-primary" />
            <div className="min-w-0">
              <strong className="block truncate text-sm">{current.placeName ?? "Map point"}</strong>
              <span className="text-[9px] font-semibold text-primary">
                {weatherAgeLabel(current.source)} · {current.source.temporalKind.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Condition
              label="Temperature"
              value={formatTemperature(current.temperatureK, workspace.unitSystem)}
            />
            <Condition
              label="Dew point"
              value={formatTemperature(current.dewpointK, workspace.unitSystem)}
            />
            <Condition label="Wind" value={formatWind(current.windSpeedMS, workspace.unitSystem)} />
            <Condition label="Gust" value={formatWind(current.windGustMS, workspace.unitSystem)} />
            <Condition
              label="Pressure"
              value={formatPressure(current.pressurePa, workspace.unitSystem)}
            />
            <Condition
              label="Visibility"
              value={formatVisibility(current.visibilityM, workspace.unitSystem)}
            />
          </div>
          {current.summary && <p className="mt-3 text-[10px] leading-relaxed">{current.summary}</p>}
          <p className="mt-2 text-[8px] text-muted-foreground">{current.source.attribution}</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-secondary p-4 text-xs text-muted-foreground">
          Current observed conditions are unavailable at this point.
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <ShieldAlert className="size-4 text-primary" /> Official alerts
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[9px]">
            {bundle?.alerts.length ?? 0}
          </span>
        </div>
        {activeAlert ? (
          <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-950">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              <strong className="text-xs">{activeAlert.event}</strong>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed">{activeAlert.headline}</p>
            <div className="mt-2 flex flex-wrap gap-1 text-[8px] font-semibold uppercase">
              <span className="rounded-full bg-white/70 px-2 py-1">{activeAlert.severity}</span>
              <span className="rounded-full bg-white/70 px-2 py-1">{activeAlert.status}</span>
              <span className="rounded-full bg-white/70 px-2 py-1">
                {weatherAgeLabel(activeAlert.source)}
              </span>
            </div>
            {activeAlert.instruction && (
              <details className="mt-2 text-[9px]">
                <summary className="cursor-pointer font-semibold">Official instruction</summary>
                <p className="mt-1 whitespace-pre-line leading-relaxed">
                  {activeAlert.instruction}
                </p>
              </details>
            )}
            <p className="mt-2 text-[8px]">{activeAlert.source.attribution}</p>
          </div>
        ) : (
          <p className="mt-2 rounded-2xl bg-secondary p-3 text-[10px] text-muted-foreground">
            No active alert was returned for the inspected point. This is not an all-clear; follow
            official local guidance.
          </p>
        )}
      </div>

      {bundle?.photography && <PhotographyPanel assessment={bundle.photography} />}

      <div>
        <strong className="text-xs">Forecast</strong>
        <div className="mt-2 flex snap-x gap-2 overflow-x-auto pb-1">
          {(bundle?.forecast ?? []).slice(0, 6).map((period) => (
            <div key={period.id} className="w-36 shrink-0 snap-start rounded-2xl bg-secondary p-3">
              <strong className="block truncate text-[10px]">{period.name}</strong>
              <span className="mt-1 block text-lg font-bold">
                {formatTemperature(period.temperatureK, workspace.unitSystem)}
              </span>
              <p className="mt-1 line-clamp-3 text-[9px] text-muted-foreground">{period.summary}</p>
              <span className="mt-2 block text-[8px] font-semibold text-primary">FORECAST</span>
            </div>
          ))}
          {!bundle?.forecast.length && (
            <p className="rounded-2xl bg-secondary p-3 text-[10px] text-muted-foreground">
              Forecast unavailable.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotographyPanel({
  assessment,
}: {
  assessment: NonNullable<WeatherBundle["photography"]>;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold">
        <CloudSun className="size-4 text-primary" /> Photography candidate analysis
      </div>
      <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
        {assessment.targetDescription}
      </p>
      {assessment.status === "no-severe-target" ? (
        <p className="mt-2 rounded-2xl bg-secondary p-3 text-[10px] text-muted-foreground">
          No candidate zones were generated. LandDraft requires an official warning/watch polygon
          before it treats a storm as an analysis target.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {assessment.zones.map((zone) => (
            <div key={zone.id} className="rounded-2xl border border-border bg-secondary p-3">
              <div className="flex items-center gap-2">
                <strong className="text-[11px]">{zone.name}</strong>
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase",
                    zone.riskLevel === "lower"
                      ? "bg-emerald-100 text-emerald-800"
                      : zone.riskLevel === "high"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-800",
                  )}
                >
                  {zone.riskLevel} exposure
                </span>
              </div>
              <p className="mt-1 text-[10px] font-semibold">
                {zone.score === null
                  ? "Photography score suppressed"
                  : `Photography ${zone.score}/100`}
              </p>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {zone.distanceFromTargetMiles.toFixed(1)} mi from alert center · target bearing{" "}
                {Math.round(zone.targetBearingDeg)}°
              </p>
              <ul className="mt-2 space-y-0.5 text-[9px] text-muted-foreground">
                {zone.reasons.slice(0, 3).map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 rounded-xl bg-amber-50 p-3 text-[9px] leading-relaxed text-amber-950">
        Candidate zones are decision support, not declarations of safety or routing instructions.
        Official warnings and on-scene conditions always take priority.
      </p>
      <details className="mt-2 text-[9px] text-muted-foreground">
        <summary className="cursor-pointer font-semibold">Method and limitations</summary>
        <p className="mt-1">{assessment.methodology}</p>
        <ul className="mt-1 space-y-1">
          {assessment.limitations.map((limitation) => (
            <li key={limitation}>• {limitation}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function SourcePanel({ bundle }: { bundle: WeatherBundle | null }) {
  return (
    <div className="border-t border-border p-4">
      <div className="flex items-center gap-2">
        <Database className="size-4 text-primary" />
        <strong className="text-xs">Data sources</strong>
      </div>
      <p className="mt-1 text-[9px] text-muted-foreground">
        Provider identity and health are never hidden during fallback.
      </p>
      <div className="mt-3 space-y-2">
        {(bundle?.providerHealth ?? []).map((provider) => (
          <div key={provider.providerId} className="rounded-xl bg-secondary p-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  provider.status === "up"
                    ? "bg-emerald-600"
                    : provider.status === "degraded"
                      ? "bg-amber-500"
                      : "bg-rose-600",
                )}
              />
              <strong className="truncate text-[10px]">{provider.providerName}</strong>
              <span className="ml-auto text-[8px] font-semibold uppercase text-muted-foreground">
                {provider.status}
              </span>
            </div>
            <p className="mt-1 text-[8px] text-muted-foreground">{provider.coverage}</p>
            {provider.lastUpdate && (
              <p className="mt-1 text-[8px]">
                Updated {new Date(provider.lastUpdate).toLocaleString()}
              </p>
            )}
            {provider.error && <p className="mt-1 text-[8px] text-amber-800">{provider.error}</p>}
          </div>
        ))}
        {!bundle && (
          <p className="text-[10px] text-muted-foreground">
            Inspect a map point to check providers.
          </p>
        )}
      </div>
      <p className="mt-3 rounded-xl bg-secondary p-3 text-[9px] leading-relaxed text-muted-foreground">
        NOAA/NWS satellite, regional lightning-density, radar, forecast layers and METAR stations
        are connected. Individual global lightning strikes, global radar and advanced model grids
        still require reviewed licensed sources. LandDraft never substitutes invented values.
      </p>
    </div>
  );
}

function WeatherStatusPill({
  bundle,
  loading,
  error,
}: {
  bundle: WeatherBundle | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading)
    return (
      <div className="pointer-events-auto flex w-fit items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-[10px] font-semibold shadow-float">
        <LoaderCircle className="size-3.5 animate-spin text-primary" /> Loading official weather…
      </div>
    );
  if (error)
    return (
      <div className="pointer-events-auto flex w-fit items-center gap-2 rounded-full bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-900 shadow-float">
        <AlertTriangle className="size-3.5" /> Weather connection unavailable
      </div>
    );
  if (!bundle) return null;
  return (
    <div className="pointer-events-auto flex w-fit items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-[10px] font-semibold shadow-float">
      <span className="size-2 rounded-full bg-emerald-600" />
      {bundle.current ? weatherAgeLabel(bundle.current.source) : "FORECAST / ALERTS"}
      <span className="text-muted-foreground">· {bundle.alerts.length} alerts</span>
    </div>
  );
}

function WeatherLegends({ workspace }: { workspace: WeatherWorkspaceState }) {
  const layers = weatherLayerRegistry.filter(
    (layer) => workspace.layerSettings[layer.id]?.visible && layer.legend?.length,
  );
  if (!layers.length) return null;
  return (
    <details className="absolute bottom-20 right-3 z-30 hidden max-w-56 rounded-2xl border border-border bg-card/95 p-3 text-[9px] shadow-float backdrop-blur sm:block lg:bottom-24">
      <summary className="cursor-pointer font-semibold">Weather legends · {layers.length}</summary>
      <div className="mt-2 space-y-3">
        {layers.map((layer) => (
          <div key={layer.id}>
            <strong className="block text-[9px]">{layer.name}</strong>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
              {layer.legend?.map((entry) => (
                <span key={entry.label} className="flex items-center gap-1 text-muted-foreground">
                  <span
                    className="size-2.5 rounded-sm border border-black/10"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function Condition({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card p-2">
      <span className="block text-[8px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <strong className="mt-0.5 block text-xs">{value}</strong>
    </div>
  );
}

function MobileButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-12 flex-col items-center justify-center rounded-2xl text-[9px] font-semibold",
        active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      <span className="[&>svg]:size-5">{icon}</span>
      {label}
    </button>
  );
}
