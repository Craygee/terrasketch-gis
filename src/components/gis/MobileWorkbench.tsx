import { lazy, Suspense, useState } from "react";
import {
  Database,
  FileDown,
  FolderOpen,
  Layers3,
  PencilRuler,
  Printer,
  Sparkles,
  X,
  Beaker,
  Info,
  PlayCircle,
  LogOut,
  UserRound,
  Map,
  Monitor,
  Navigation,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { WorkbenchProvider, useWorkbench } from "@/lib/gis/store";
import { MapRefProvider, useMapRef } from "@/lib/gis/mapRef";
import { MapCanvas } from "./MapCanvas";
import { LayerPanel } from "./LayerPanel";
import { DrawToolbar } from "./DrawToolbar";
import { DataDrawer } from "./DataDrawer";
import { AttributeTable } from "./AttributeTable";
import { SearchBox } from "./SearchBox";
import { BasemapControl } from "./BasemapControl";
import { RemoteLayerManager } from "./RemoteLayerManager";
import { SelectionToolbar } from "./SelectionToolbar";
import { ExportPanel } from "./ExportMenu";
import { ProjectMenu } from "./ProjectMenu";
import { AuthGate, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { LandDraftMark } from "@/components/brand/LandDraftMark";
import { FeatureDestinationDialog } from "./FeatureDestinationDialog";
import { TourProvider, useTours } from "./TourProvider";
import { ConnectionManager } from "./ConnectionManager";
import { FieldModule } from "./FieldModule";

const AiAssistant = lazy(() =>
  import("./AiAssistant").then((module) => ({ default: module.AiAssistant })),
);
const PrintComposer = lazy(() =>
  import("./PrintComposer").then((module) => ({ default: module.PrintComposer })),
);
const SpatialAnalysisPanel = lazy(() =>
  import("./SpatialAnalysisPanel").then((module) => ({ default: module.SpatialAnalysisPanel })),
);

export default function MobileWorkbench() {
  return (
    <AuthGate>
      <WorkbenchProvider>
        <MapRefProvider>
          <TourProvider>
            <MobileShell />
            <RemoteLayerManager />
            <FeatureDestinationDialog />
            <ConnectionManager />
            <Toaster />
          </TourProvider>
        </MapRefProvider>
      </WorkbenchProvider>
    </AuthGate>
  );
}

type Sheet = "layers" | "data" | "draw" | "export" | "projects" | "help" | null;

function MobileShell() {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [fieldMode, setFieldModeState] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("landdraft.mobile-mode.v1") !== "map";
  });
  const wb = useWorkbench();
  const {
    setDrawerOpen,
    tableOpen,
    assistantOpen,
    setAssistantOpen,
    printOpen,
    setPrintOpen,
    analysisOpen,
    setAnalysisOpen,
  } = useMapRef();

  const setFieldMode = (enabled: boolean) => {
    setFieldModeState(enabled);
    window.localStorage.setItem("landdraft.mobile-mode.v1", enabled ? "field" : "map");
    setSheet(null);
  };

  if (!wb.projectReady)
    return (
      <div className="app-viewport flex items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
        {wb.projectError ? (
          <div>
            <p className="font-semibold text-foreground">Cloud workspace could not open</p>
            <p className="mt-1 text-xs">{wb.projectError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Try again
            </button>
          </div>
        ) : (
          "Opening your latest project…"
        )}
      </div>
    );

  return (
    <div className="app-viewport relative bg-background">
      <MapCanvas />
      {!fieldMode && <SelectionToolbar mobile />}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 p-3 pt-[max(.75rem,env(safe-area-inset-top))]">
        <div className="float-surface pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl px-2.5 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LandDraftMark className="size-5" />
          </span>
          <select
            value={wb.projectId}
            onChange={(event) => void wb.openProject(event.target.value)}
            aria-label="Switch project"
            className="min-w-0 w-16 bg-transparent text-sm font-bold outline-none sm:w-36"
          >
            {wb.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              params.set("desktop", "1");
              window.sessionStorage.setItem("landdraft.force-desktop.v1", "1");
              const query = params.toString();
              window.location.assign(`/${query ? `?${query}` : ""}${window.location.hash}`);
            }}
            aria-label="Open main desktop view"
            title="Open the full main map view"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Monitor className="size-3.5" />
          </button>
        </div>
        <div className="float-surface pointer-events-auto ml-auto grid grid-cols-2 rounded-2xl p-1">
          <button
            onClick={() => setFieldMode(true)}
            aria-pressed={fieldMode}
            title="Field mode"
            className={cn(
              "flex items-center gap-1 rounded-xl px-2.5 py-2 text-[10px] font-semibold",
              fieldMode && "bg-primary text-primary-foreground",
            )}
          >
            <Navigation className="size-3.5" />{" "}
            <span className="hidden min-[370px]:inline">Field</span>
          </button>
          <button
            onClick={() => setFieldMode(false)}
            aria-pressed={!fieldMode}
            title="Full map mode"
            className={cn(
              "flex items-center gap-1 rounded-xl px-2.5 py-2 text-[10px] font-semibold",
              !fieldMode && "bg-primary text-primary-foreground",
            )}
          >
            <Map className="size-3.5" /> <span className="hidden min-[370px]:inline">Map</span>
          </button>
        </div>
        {!fieldMode && (
          <>
            <div data-tour="map-search" className="pointer-events-auto hidden sm:block">
              <SearchBox />
            </div>
            <button
              onClick={() => setSheet(sheet === "help" ? null : "help")}
              aria-label="Help, tours, and account"
              title="Help, tours, and account"
              className="float-surface pointer-events-auto rounded-2xl p-3"
            >
              <Info className="size-4" />
            </button>
            <button
              onClick={() => setSheet(sheet === "projects" ? null : "projects")}
              aria-label="Projects and account"
              title="Open projects and account settings"
              className="float-surface pointer-events-auto rounded-2xl p-3"
              data-tour="top-projects"
            >
              <FolderOpen className="size-4" />
            </button>
          </>
        )}
      </header>

      <div
        data-tour="basemap-control"
        className={cn(
          "pointer-events-auto absolute right-14 z-20",
          fieldMode ? "top-[calc(8.75rem+env(safe-area-inset-top))]" : "bottom-20",
        )}
      >
        <BasemapControl />
      </div>

      <div className={fieldMode ? undefined : "hidden"}>
        <FieldModule active={fieldMode} />
      </div>

      {!fieldMode && sheet && (
        <section className="mobile-sheet-height panel-surface absolute inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 overflow-hidden rounded-3xl">
          <div className="flex items-center border-b border-border px-4 py-2">
            <h2 className="text-sm font-semibold">
              {sheet === "layers"
                ? "Layers"
                : sheet === "data"
                  ? "Data & analysis"
                  : sheet === "draw"
                    ? "Draw and measure"
                    : sheet === "help"
                      ? "Help & tours"
                      : sheet === "projects"
                        ? "Projects and settings"
                        : "Export"}
            </h2>
            <button
              onClick={() => setSheet(null)}
              aria-label="Close"
              title="Close this panel"
              className="ml-auto rounded-xl p-2 hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
          {sheet === "layers" ? (
            <div data-tour="layer-panel" className="mobile-layer-height">
              <LayerPanel />
            </div>
          ) : sheet === "data" ? (
            <div className="grid gap-2 p-4">
              <button
                onClick={() => {
                  setSheet(null);
                  setDrawerOpen(true);
                }}
                className="flex items-center gap-3 rounded-2xl bg-secondary p-4 text-left"
              >
                <Database className="size-5 text-primary" />
                <span>
                  <strong className="block text-sm">Public data</strong>
                  <span className="text-[10px] text-muted-foreground">
                    Search official datasets and add visible-area layers.
                  </span>
                </span>
              </button>
              <button
                onClick={() => {
                  setSheet(null);
                  setAnalysisOpen(true);
                }}
                className="flex items-center gap-3 rounded-2xl bg-secondary p-4 text-left"
              >
                <Beaker className="size-5 text-primary" />
                <span>
                  <strong className="block text-sm">Spatial analysis</strong>
                  <span className="text-[10px] text-muted-foreground">
                    Buffer, merge, intersect, erase, find centers and hulls.
                  </span>
                </span>
              </button>
            </div>
          ) : sheet === "draw" ? (
            <div className="overflow-x-auto p-3">
              <DrawToolbar />
            </div>
          ) : sheet === "help" ? (
            <MobileTourMenu onDone={() => setSheet(null)} />
          ) : sheet === "projects" ? (
            <ProjectMenu onClose={() => setSheet(null)} />
          ) : (
            <ExportPanel onDone={() => setSheet(null)} />
          )}
        </section>
      )}

      {!fieldMode && tableOpen && (
        <div className="absolute inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50">
          <AttributeTable />
        </div>
      )}
      <DataDrawer />
      {analysisOpen && (
        <Suspense fallback={null}>
          <SpatialAnalysisPanel />
        </Suspense>
      )}
      {assistantOpen && (
        <Suspense fallback={null}>
          <AiAssistant />
        </Suspense>
      )}
      {printOpen && (
        <Suspense fallback={null}>
          <PrintComposer />
        </Suspense>
      )}

      {!fieldMode && (
        <nav className="panel-surface absolute inset-x-2 bottom-[max(.5rem,env(safe-area-inset-bottom))] z-30 grid h-14 grid-cols-5 rounded-2xl p-1">
          <NavButton
            active={sheet === "layers"}
            icon={<Layers3 className="size-5" />}
            label="Layers"
            tourId="layer-panel-button"
            onClick={() => setSheet(sheet === "layers" ? null : "layers")}
          />
          <NavButton
            icon={<Database className="size-5" />}
            label="Data"
            active={sheet === "data"}
            tourId="top-public-data"
            onClick={() => setSheet(sheet === "data" ? null : "data")}
          />
          <NavButton
            active={sheet === "draw"}
            icon={<PencilRuler className="size-5" />}
            label="Draw"
            tourId="draw-toolbar"
            onClick={() => setSheet(sheet === "draw" ? null : "draw")}
          />
          <NavButton
            icon={<Sparkles className="size-5" />}
            label="AI"
            tourId="top-ai"
            onClick={() => {
              setSheet(null);
              setAssistantOpen(true);
            }}
          />
          <NavButton
            active={sheet === "export"}
            icon={
              sheet === "export" ? <FileDown className="size-5" /> : <Printer className="size-5" />
            }
            label="Print / export"
            tourId="top-print"
            onClick={() => {
              if (sheet === "export") setPrintOpen(true);
              else setSheet("export");
            }}
          />
        </nav>
      )}
    </div>
  );
}

function NavButton({
  icon,
  label,
  onClick,
  active,
  tourId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  tourId?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium",
        active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
      aria-pressed={active}
      data-tour={tourId}
    >
      {icon}
      {label}
    </button>
  );
}

function MobileTourMenu({ onDone }: { onDone: () => void }) {
  const { startTour, featureTips, setFeatureTips } = useTours();
  const auth = useAuth();
  const { setConnectionsOpen } = useMapRef();
  const launch = (kind: "basic" | "advanced" | "print") => {
    onDone();
    startTour(kind);
  };
  return (
    <div className="space-y-2 p-4 text-xs">
      <button
        onClick={() => {
          onDone();
          setConnectionsOpen(true);
        }}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left font-semibold"
      >
        <Database className="size-4" /> API connections
      </button>
      <button
        onClick={() => launch("basic")}
        className="flex w-full items-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground"
      >
        <PlayCircle className="size-4" /> Quick tour
      </button>
      <button
        onClick={() => launch("advanced")}
        className="w-full rounded-xl bg-secondary px-4 py-3 text-left font-semibold"
      >
        Advanced tour
      </button>
      <button
        onClick={() => launch("print")}
        className="w-full rounded-xl bg-secondary px-4 py-3 text-left font-semibold"
      >
        Print map tour
      </button>
      <label className="flex items-start gap-2 rounded-xl border border-border p-3">
        <input
          type="checkbox"
          checked={featureTips}
          onChange={(event) => setFeatureTips(event.target.checked)}
          className="mt-0.5 accent-primary"
        />
        Offer tours when major new features are added
      </label>
      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <UserRound className="size-4" />
          <span className="min-w-0 flex-1 truncate">{auth.user?.email}</span>
        </div>
        <button
          onClick={() => {
            onDone();
            void auth.signOut();
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left font-semibold text-destructive"
        >
          <LogOut className="size-4" /> Log out
        </button>
      </div>
    </div>
  );
}
