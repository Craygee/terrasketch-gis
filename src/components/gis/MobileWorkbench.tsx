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
import { AuthGate } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { LandDraftMark } from "@/components/brand/LandDraftMark";
import { FeatureDestinationDialog } from "./FeatureDestinationDialog";
import { TourProvider, useTours } from "./TourProvider";

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

  if (!wb.projectReady)
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
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
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <MapCanvas />
      <SelectionToolbar mobile />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 p-3 pt-[max(.75rem,env(safe-area-inset-top))]">
        <div className="float-surface pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LandDraftMark className="size-5" />
          </span>
          <select
            value={wb.projectId}
            onChange={(event) => void wb.openProject(event.target.value)}
            aria-label="Switch project"
            className="min-w-0 w-36 bg-transparent text-sm font-bold outline-none"
          >
            {wb.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div data-tour="map-search" className="pointer-events-auto ml-auto">
          <SearchBox />
        </div>
        <button
          onClick={() => setSheet(sheet === "help" ? null : "help")}
          aria-label="Help and tours"
          title="Help and tours"
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
      </header>

      <div
        data-tour="basemap-control"
        className="pointer-events-auto absolute bottom-20 right-14 z-20"
      >
        <BasemapControl />
      </div>

      {sheet && (
        <section className="panel-surface absolute inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 max-h-[62dvh] overflow-hidden rounded-3xl">
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
            <div data-tour="layer-panel" className="h-[54dvh]">
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

      {tableOpen && (
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
  const launch = (kind: "basic" | "advanced" | "print") => {
    onDone();
    startTour(kind);
  };
  return (
    <div className="space-y-2 p-4 text-xs">
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
    </div>
  );
}
