import { useState } from "react";
import {
  Save,
  FolderOpen,
  Database,
  Table2,
  PanelLeft,
  Info,
  FileDown,
  Sparkles,
  Printer,
  Beaker,
  PlayCircle,
  LogOut,
  UserRound,
  Share2,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkbench } from "@/lib/gis/store";
import { useAuth } from "@/lib/auth";
import { useMapRef } from "@/lib/gis/mapRef";
import { cn } from "@/lib/utils";
import { ExportPanel } from "./ExportMenu";
import { ProjectMenu } from "./ProjectMenu";
import { LandDraftMark } from "@/components/brand/LandDraftMark";
import { useTours } from "./TourProvider";
import { SharePanel } from "./SharePanel";

export function TopBar({
  onTogglePanel,
  panelOpen,
}: {
  onTogglePanel: () => void;
  panelOpen: boolean;
}) {
  const wb = useWorkbench();
  const auth = useAuth();
  const {
    setDrawerOpen,
    setTableOpen,
    tableOpen,
    assistantOpen,
    setAssistantOpen,
    setPrintOpen,
    analysisOpen,
    setAnalysisOpen,
    setConnectionsOpen,
  } = useMapRef();
  const { startTour, featureTips, setFeatureTips } = useTours();
  const [showAbout, setShowAbout] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const save = async () => {
    await wb.saveProject();
    toast.success("Project saved", { description: "A new restore point was added to history." });
  };

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-2 sm:px-4">
      <button
        onClick={onTogglePanel}
        aria-label="Toggle layer panel"
        title={panelOpen ? "Hide the layer panel" : "Show the layer panel"}
        className={cn(
          "rounded-xl p-2 transition-colors hover:bg-accent",
          panelOpen && "bg-secondary",
        )}
      >
        <PanelLeft className="size-4" />
      </button>

      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <LandDraftMark className="size-5" />
        </span>
        <div className="leading-tight">
          <h1 className="text-sm font-bold tracking-tight">LandDraft</h1>
          <p className="hidden text-[10px] text-muted-foreground sm:block">
            Map, measure and shape the land
          </p>
        </div>
      </div>

      {wb.canEditProject && (
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
      )}

      <button
        onClick={() => {
          window.localStorage.setItem("landdraft.mobile-mode.v1", "field");
          window.location.assign("/mobile");
        }}
        aria-label="Open field notes view"
        title="Open the streamlined field notes and GPS view"
        className="hidden size-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-accent md:flex"
      >
        <Navigation className="size-4" />
      </button>

      <div className="ml-auto flex items-center gap-1">
        <BarBtn
          icon={<Sparkles className="size-4" />}
          label="AI"
          help="Ask LandDraft AI to search, select, explain, or report"
          onClick={() => setAssistantOpen(!assistantOpen)}
          primary
          tourId="top-ai"
        />
        {wb.canEditProject && (
          <BarBtn
            icon={<Database className="size-4" />}
            label="Public data"
            help="Find and add official public datasets"
            onClick={() => setDrawerOpen(true)}
            tourId="top-public-data"
          />
        )}
        {wb.canEditProject && (
          <BarBtn
            icon={<Beaker className="size-4" />}
            label="Analysis"
            help="Create buffers, centroids, intersections and other derived layers"
            onClick={() => setAnalysisOpen(!analysisOpen)}
            tourId="top-analysis"
          />
        )}
        <BarBtn
          icon={<Table2 className="size-4" />}
          label="Table"
          help={
            wb.canEditProject
              ? "Search and edit layer attribute tables"
              : "Search shared attributes"
          }
          onClick={() => setTableOpen(!tableOpen)}
          tourId="top-table"
        />
        {wb.canEditProject && (
          <BarBtn
            icon={<Save className="size-4" />}
            label="Save"
            help="Save this project and add a restore point"
            onClick={() => void save()}
          />
        )}
        <BarBtn
          icon={<Printer className="size-4" />}
          label="Print map"
          help="Open the printable map composer"
          onClick={() => setPrintOpen(true)}
          tourId="top-print"
        />
        <BarBtn
          icon={<Share2 className="size-4" />}
          label="Share"
          help="Create secure map links and manage access"
          onClick={() => {
            setShowShare((value) => !value);
            setShowProjects(false);
            setShowExport(false);
          }}
          tourId="top-share"
        />
        {wb.canEditProject && (
          <BarBtn
            icon={<FolderOpen className="size-4" />}
            label="Projects"
            help="Switch, duplicate, or organize projects"
            onClick={() => {
              setShowProjects((value) => !value);
              setShowExport(false);
            }}
            tourId="top-projects"
          />
        )}
        {wb.canEditProject && (
          <BarBtn
            icon={<FileDown className="size-4" />}
            label="Export"
            help="Export map data to GIS file formats"
            onClick={() => {
              setShowExport((value) => !value);
              setShowProjects(false);
            }}
            tourId="top-export"
          />
        )}
        <button
          onClick={() => {
            setShowAbout((s) => !s);
            setShowProjects(false);
            setShowExport(false);
          }}
          aria-label="Help, account, and disclaimers"
          title="Help, account, and LandDraft information"
          data-tour="top-info"
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

      {showShare && (
        <div className="float-surface absolute right-2 top-14 rounded-2xl">
          <SharePanel onClose={() => setShowShare(false)} />
        </div>
      )}

      {showAbout && (
        <div className="float-surface absolute right-2 top-14 max-h-[calc(100dvh-4rem)] w-80 overflow-y-auto rounded-2xl p-4 text-xs leading-relaxed">
          <h2 className="text-sm font-semibold">Help & tours</h2>
          <p className="mt-1 text-muted-foreground">
            Replay a walkthrough at any time. Tours point to the controls on the real screen.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                setShowAbout(false);
                startTour("basic");
              }}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 font-semibold text-primary-foreground"
            >
              <PlayCircle className="size-3.5" /> Quick tour
            </button>
            <button
              onClick={() => {
                setShowAbout(false);
                startTour("advanced");
              }}
              className="rounded-xl bg-secondary px-3 py-2 font-semibold hover:bg-accent"
            >
              Advanced tour
            </button>
            <button
              onClick={() => {
                setShowAbout(false);
                startTour("print");
              }}
              className="col-span-2 rounded-xl bg-secondary px-3 py-2 font-semibold hover:bg-accent"
            >
              Print map tour
            </button>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <input
              type="checkbox"
              checked={featureTips}
              onChange={(event) => setFeatureTips(event.target.checked)}
              className="accent-primary"
            />
            <span>
              <strong className="block font-semibold">Offer tours for major new features</strong>
              <span className="text-[10px] text-muted-foreground">
                You can turn this back on even if you skipped the welcome tour.
              </span>
            </span>
          </label>

          <button
            onClick={() => {
              setShowAbout(false);
              setConnectionsOpen(true);
            }}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-accent"
          >
            <Database className="size-4 text-primary" />
            <span className="min-w-0 flex-1">
              <strong className="block font-semibold">API connections</strong>
              <span className="block text-[10px] text-muted-foreground">
                Check sources, repair links, or enter a URL
              </span>
            </span>
          </button>

          <h3 className="mb-1 mt-4 border-t border-border pt-3 text-sm font-semibold">
            About LandDraft
          </h3>
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
            {auth.cloudEnabled
              ? "Signed-in projects, autosave, and up to 25 restore points are stored in your private cloud workspace and follow you across devices."
              : "Cloud connection is pending; this deployment is temporarily using its existing device workspace."}
          </p>
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-sm font-semibold">Account</h3>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-secondary p-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{auth.user?.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">{auth.user?.email}</div>
              </div>
              <button
                onClick={() => {
                  setShowAbout(false);
                  void auth.signOut();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 font-semibold text-destructive hover:bg-accent"
                title="Log out of LandDraft"
              >
                <LogOut className="size-3.5" /> Log out
              </button>
            </div>
          </div>
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
  help,
  tourId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  help?: string;
  tourId?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={help ?? label}
      aria-label={label}
      data-tour={tourId}
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
