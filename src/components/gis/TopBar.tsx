import { useState } from "react";
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
import { cn } from "@/lib/utils";
import { ExportPanel } from "./ExportMenu";
import { ProjectMenu } from "./ProjectMenu";

export function TopBar({
  onTogglePanel,
  panelOpen,
}: {
  onTogglePanel: () => void;
  panelOpen: boolean;
}) {
  const wb = useWorkbench();
  const { setDrawerOpen, setTableOpen, tableOpen } = useMapRef();
  const [showAbout, setShowAbout] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const save = async () => {
    await wb.saveProject();
    toast.success("Project saved", { description: "A new restore point was added to history." });
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

      <label className="ml-2 hidden items-center gap-1 md:flex">
        <FolderOpen className="size-3.5 text-muted-foreground" />
        <select
          value={wb.projectId}
          onChange={(event) => void wb.openProject(event.target.value)}
          aria-label="Switch project"
          className="w-44 rounded-xl border border-transparent bg-secondary px-3 py-1.5 text-xs font-medium outline-none focus:border-primary"
        >
          {wb.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

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
          icon={<FolderOpen className="size-4" />}
          label="Projects"
          onClick={() => {
            setShowProjects((value) => !value);
            setShowExport(false);
          }}
        />
        <BarBtn
          icon={<FileDown className="size-4" />}
          label="Export"
          onClick={() => {
            setShowExport((value) => !value);
            setShowProjects(false);
          }}
        />
        <button
          onClick={() => setShowAbout((s) => !s)}
          aria-label="About and disclaimers"
          className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent"
        >
          <Info className="size-4" />
        </button>
      </div>

      {wb.lastSavedAt && (
        <span className="num absolute -bottom-6 right-4 rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground shadow-panel">
          {wb.autosave ? "autosaved" : "saved"} {new Date(wb.lastSavedAt).toLocaleTimeString()}
        </span>
      )}

      {showProjects && (
        <div className="float-surface absolute right-2 top-14 rounded-2xl">
          <ProjectMenu onClose={() => setShowProjects(false)} />
        </div>
      )}

      {showExport && (
        <div className="float-surface absolute right-2 top-14 w-80 rounded-2xl">
          <ExportPanel onDone={() => setShowExport(false)} />
        </div>
      )}

      {showAbout && (
        <div className="float-surface absolute right-2 top-14 w-80 rounded-2xl p-4 text-xs leading-relaxed">
          <h2 className="mb-1 text-sm font-semibold">About TerraSketch</h2>
          <p className="text-muted-foreground">
            A friendly browser workbench for maps: bring your own files, stream official public
            datasets, draw, measure, label and organize multiple projects.
          </p>
          <p className="mt-2 font-medium">Legal boundary disclaimer</p>
          <p className="text-muted-foreground">
            Measurements, sketches and public datasets are for planning and reference only. They are
            not surveys and do not determine property lines, ownership, easements or jurisdiction.
            Always verify with county records and a licensed surveyor.
          </p>
          <p className="mt-2 text-muted-foreground">
            Signed-in projects, autosave and up to 25 restore points are stored on this browser and
            device. Export a project backup before clearing browser data.
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
