import { useState } from "react";
import { Database, FileDown, Layers3, Mountain, PencilRuler, X } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { WorkbenchProvider, useWorkbench } from "@/lib/gis/store";
import { MapRefProvider, useMapRef } from "@/lib/gis/mapRef";
import { exportMapPdf, type MapPaper } from "@/lib/gis/mapPdf";
import { MapCanvas } from "./MapCanvas";
import { LayerPanel } from "./LayerPanel";
import { DrawToolbar } from "./DrawToolbar";
import { DataDrawer } from "./DataDrawer";
import { AttributeTable } from "./AttributeTable";
import { SearchBox } from "./SearchBox";
import { BasemapControl } from "./BasemapControl";
import { RemoteLayerManager } from "./RemoteLayerManager";
import { cn } from "@/lib/utils";

export default function MobileWorkbench() {
  return (
    <WorkbenchProvider>
      <MapRefProvider>
        <MobileShell />
        <RemoteLayerManager />
        <Toaster />
      </MapRefProvider>
    </WorkbenchProvider>
  );
}

type Sheet = "layers" | "draw" | "pdf" | null;

function MobileShell() {
  const [sheet, setSheet] = useState<Sheet>(null);
  const wb = useWorkbench();
  const { map, setDrawerOpen, tableOpen } = useMapRef();
  const exportPdf = (paper: MapPaper) => {
    if (!map) {
      toast.error("The map is still loading");
      return;
    }
    void exportMapPdf(map, wb.projectName, wb.layers, paper)
      .then(() => toast.success(`${paper === "a4" ? "A4" : "Letter"} PDF map exported`))
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "PDF export failed"),
      );
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <MapCanvas />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 p-3 pt-[max(.75rem,env(safe-area-inset-top))]">
        <div className="float-surface pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Mountain className="size-4" />
          </span>
          <input
            value={wb.projectName}
            onChange={(event) => wb.setProjectName(event.target.value)}
            aria-label="Project name"
            className="min-w-0 w-36 bg-transparent text-sm font-bold outline-none"
          />
        </div>
        <div className="pointer-events-auto ml-auto">
          <SearchBox />
        </div>
      </header>

      <div className="pointer-events-auto absolute bottom-20 right-3 z-20">
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
                  : "Export PDF map"}
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
          ) : (
            <div className="grid grid-cols-2 gap-2 p-4">
              <button
                onClick={() => exportPdf("letter")}
                className="rounded-2xl bg-primary px-3 py-4 text-sm font-semibold text-primary-foreground"
              >
                Letter · landscape
              </button>
              <button
                onClick={() => exportPdf("a4")}
                className="rounded-2xl bg-secondary px-3 py-4 text-sm font-semibold"
              >
                A4 · landscape
              </button>
              <p className="col-span-2 text-center text-[10px] text-muted-foreground">
                Includes the current map, title, visible-layer legend, timestamp and planning
                disclaimer.
              </p>
            </div>
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
          active={sheet === "pdf"}
          icon={<FileDown className="size-5" />}
          label="PDF"
          onClick={() => setSheet(sheet === "pdf" ? null : "pdf")}
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
