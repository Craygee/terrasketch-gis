import { useEffect, useState } from "react";
import {
  Mountain,
  Save,
  FolderOpen,
  Database,
  Table2,
  PanelLeft,
  Info,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { downloadProjectFile } from "@/lib/gis/project";
import { cn } from "@/lib/utils";
import { exportMapPdf } from "@/lib/gis/mapPdf";

export function TopBar({
  onTogglePanel,
  panelOpen,
}: {
  onTogglePanel: () => void;
  panelOpen: boolean;
}) {
  const wb = useWorkbench();
  const { setDrawerOpen, setTableOpen, tableOpen, map } = useMapRef();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    void wb.loadProject().then((ok) => {
      if (ok) toast.success("Your last project was restored");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    await wb.saveProject();
    setSavedAt(new Date().toLocaleTimeString());
    toast.success("Project saved on this device");
  };

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-2 sm:px-4">
      <button
        onClick={onTogglePanel}
        aria-label="Toggle layer panel"
        className={cn(
          "rounded-xl p-2 transition-colors hover:bg-accent",
          panelOpen && "bg-secondary",
        )}
      >
        <PanelLeft className="size-4" />
      </button>

      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Mountain className="size-4" />
        </span>
        <div className="leading-tight">
          <h1 className="text-sm font-bold tracking-tight">TerraSketch GIS</h1>
          <p className="hidden text-[10px] text-muted-foreground sm:block">
            Map, measure and sketch the world
          </p>
        </div>
      </div>

      <input
        value={wb.projectName}
        onChange={(e) => wb.setProjectName(e.target.value)}
        aria-label="Project name"
        className="ml-2 hidden w-44 rounded-xl border border-transparent bg-secondary px-3 py-1.5 text-xs font-medium outline-none focus:border-primary md:block"
      />

      <div className="ml-auto flex items-center gap-1">
        <BarBtn
          icon={<Database className="size-4" />}
          label="Public data"
          onClick={() => setDrawerOpen(true)}
          primary
        />
        <BarBtn
          icon={<Table2 className="size-4" />}
          label="Table"
          onClick={() => setTableOpen(!tableOpen)}
        />
        <BarBtn icon={<Save className="size-4" />} label="Save" onClick={() => void save()} />
        <BarBtn
          icon={<FileDown className="size-4" />}
          label="PDF"
          onClick={() => {
            if (!map) {
              toast.error("The map is still loading");
              return;
            }
            void exportMapPdf(map, wb.projectName, wb.layers, "letter")
              .then(() => toast.success("PDF map exported"))
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "PDF export failed"),
              );
          }}
        />
        <BarBtn
          icon={<FolderOpen className="size-4" />}
          label="Backup"
          onClick={() => downloadProjectFile(wb.toProjectState())}
        />
        <button
          onClick={() => setShowAbout((s) => !s)}
          aria-label="About and disclaimers"
          className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent"
        >
          <Info className="size-4" />
        </button>
      </div>

      {savedAt && (
        <span className="num absolute -bottom-6 right-4 rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground shadow-panel">
          saved {savedAt}
        </span>
      )}

      {showAbout && (
        <div className="float-surface absolute right-2 top-14 w-80 rounded-2xl p-4 text-xs leading-relaxed">
          <h2 className="mb-1 text-sm font-semibold">About TerraSketch</h2>
          <p className="text-muted-foreground">
            A friendly browser workbench for maps: bring your own files, stream official public
            datasets, draw, measure and label — no account, no API keys.
          </p>
          <p className="mt-2 font-medium">Legal boundary disclaimer</p>
          <p className="text-muted-foreground">
            Measurements, sketches and public datasets are for planning and reference only. They are
            not surveys and do not determine property lines, ownership, easements or jurisdiction.
            Always verify with county records and a licensed surveyor.
          </p>
          <p className="mt-2 text-muted-foreground">
            Projects save locally in your browser. Cloud sync and shared PostGIS projects are
            planned.
          </p>
        </div>
      )}
    </header>
  );
}

function BarBtn({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors",
        primary
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : "bg-secondary text-secondary-foreground hover:bg-accent",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
