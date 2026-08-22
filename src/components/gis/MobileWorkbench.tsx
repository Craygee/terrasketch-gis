import { useState } from "react";
import { Database, FileDown, FolderOpen, Layers3, PencilRuler, X } from "lucide-react";
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

export default function MobileWorkbench() {
  return (
    <AuthGate>
      <WorkbenchProvider>
        <MapRefProvider>
          <MobileShell />
          <RemoteLayerManager />
          <Toaster />
        </MapRefProvider>
      </WorkbenchProvider>
    </AuthGate>
  );
}

type Sheet = "layers" | "draw" | "export" | "projects" | null;

function MobileShell() {
  const [sheet, setSheet] = useState<Sheet>(null);
  const wb = useWorkbench();
  const { setDrawerOpen, tableOpen } = useMapRef();

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
        <div className="pointer-events-auto ml-auto">
          <SearchBox />
        </div>
        <button
          onClick={() => setSheet(sheet === "projects" ? null : "projects")}
          aria-label="Projects and account"
          className="float-surface pointer-events-auto rounded-2xl p-3"
        >
          <FolderOpen className="size-4" />
        </button>
      </header>

      <div className="pointer-events-auto absolute bottom-20 right-14 z-20">
        <BasemapControl />
      </div>

      {sheet && (
        <section className="panel-surface absolute inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 max-h-[62dvh] overflow-hidden rounded-3xl">
          <div className="flex items-center border-b border-border px-4 py-2">
            <h2 className="text-sm font-semibold">
              {sheet === "layers"
                ? "Layers"
                : sheet === "draw"
                  ? "Draw and measure"
                  : sheet === "projects"
                    ? "Projects and settings"
                    : "Export"}
            </h2>
            <button
              onClick={() => setSheet(null)}
              aria-label="Close"
              className="ml-auto rounded-xl p-2 hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
          {sheet === "layers" ? (
            <div className="h-[54dvh]">
              <LayerPanel />
            </div>
          ) : sheet === "draw" ? (
            <div className="overflow-x-auto p-3">
              <DrawToolbar />
            </div>
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

      <nav className="panel-surface absolute inset-x-2 bottom-[max(.5rem,env(safe-area-inset-bottom))] z-30 grid h-14 grid-cols-4 rounded-2xl p-1">
        <NavButton
          active={sheet === "layers"}
          icon={<Layers3 className="size-5" />}
          label="Layers"
          onClick={() => setSheet(sheet === "layers" ? null : "layers")}
        />
        <NavButton
          icon={<Database className="size-5" />}
          label="Data"
          onClick={() => {
            setSheet(null);
            setDrawerOpen(true);
          }}
        />
        <NavButton
          active={sheet === "draw"}
          icon={<PencilRuler className="size-5" />}
          label="Draw"
          onClick={() => setSheet(sheet === "draw" ? null : "draw")}
        />
        <NavButton
          active={sheet === "export"}
          icon={<FileDown className="size-5" />}
          label="Export"
          onClick={() => setSheet(sheet === "export" ? null : "export")}
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
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium",
        active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}
