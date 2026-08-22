import {
  ChevronRight,
  Clock3,
  FolderOpen,
  LogOut,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { useWorkbench } from "@/lib/gis/store";
import { cn } from "@/lib/utils";

type View = "projects" | "settings";

export function ProjectMenu({ onClose }: { onClose: () => void }) {
  const wb = useWorkbench();
  const auth = useAuth();
  const [newName, setNewName] = useState("");
  const [view, setView] = useState<View>("projects");

  const createProject = () => {
    if (!newName.trim()) return;
    void wb.createProject(newName).then(() => {
      setNewName("");
      toast.success("New project created");
    });
  };

  return (
    <div className="max-h-[78vh] w-[min(92vw,410px)] overflow-y-auto p-3 text-xs">
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-secondary p-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <UserRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{auth.user?.name}</div>
          <div className="truncate text-[10px] text-muted-foreground">{auth.user?.email}</div>
        </div>
        <button
          onClick={auth.signOut}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 rounded-xl bg-secondary p-1">
        <TabButton
          active={view === "projects"}
          onClick={() => setView("projects")}
          icon={<FolderOpen className="size-3.5" />}
          label="Projects"
        />
        <TabButton
          active={view === "settings"}
          onClick={() => setView("settings")}
          icon={<Settings2 className="size-3.5" />}
          label="Settings"
        />
      </div>

      {view === "projects" ? (
        <>
          <div className="mb-3 flex gap-1">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createProject();
              }}
              placeholder="New project name"
              className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 outline-none focus:border-primary"
            />
            <button
              onClick={createProject}
              className="rounded-xl bg-primary px-3 text-primary-foreground"
              aria-label="Create project"
            >
              <Plus className="size-4" />
            </button>
          </div>

          <section>
            <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
              <FolderOpen className="size-3.5 text-primary" /> Switch project
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                {wb.projects.length} maps
              </span>
            </h3>
            <div className="space-y-1">
              {wb.projects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "flex items-center gap-1 rounded-xl p-1",
                    project.id === wb.projectId ? "bg-accent ring-1 ring-primary" : "bg-secondary",
                  )}
                >
                  <button
                    onClick={() => void wb.openProject(project.id).then(onClose)}
                    className="min-w-0 flex-1 px-2 py-1.5 text-left"
                  >
                    <span className="block truncate font-medium">{project.name}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {project.id === wb.projectId ? "Open now · " : ""}
                      {new Date(project.updatedAt).toLocaleString()} · {project.versionCount} saves
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Delete “${project.name}”?`)) return;
                      void wb
                        .deleteProject(project.id)
                        .then(() => toast.success("Project deleted"));
                    }}
                    className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
                    aria-label={`Delete ${project.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="space-y-3">
          <section className="space-y-1 rounded-xl border border-border p-3">
            <label className="block font-semibold" htmlFor="project-settings-name">
              Project name
            </label>
            <input
              id="project-settings-name"
              value={wb.projectName}
              onChange={(event) => wb.setProjectName(event.target.value)}
              className="w-full rounded-lg border border-border bg-card px-2 py-1.5 outline-none focus:border-primary"
            />
          </section>

          <section className="space-y-1 rounded-xl border border-border p-3">
            <label className="block font-semibold" htmlFor="derived-layer-category">
              New layers from selections
            </label>
            <select
              id="derived-layer-category"
              value={wb.derivedLayerGroupId}
              onChange={(event) => wb.setDerivedLayerGroupId(event.target.value)}
              className="w-full rounded-lg border border-border bg-card px-2 py-1.5"
            >
              {wb.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              “New layer,” split selections, and table-result layers go here. Newly created
              categories appear automatically.
            </p>
          </section>

          <details className="group rounded-xl border border-border">
            <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2.5 font-semibold">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
              Advanced project options
            </summary>
            <div className="space-y-3 border-t border-border p-3">
              <label className="flex items-center gap-2 rounded-lg bg-secondary p-2.5">
                <input
                  type="checkbox"
                  checked={wb.autosave}
                  onChange={(event) => void wb.setAutosave(event.target.checked)}
                  className="accent-primary"
                />
                <span className="font-medium">Autosave this project</span>
                <span className="ml-auto text-[10px] text-muted-foreground">after changes</span>
              </label>

              <section>
                <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
                  <Clock3 className="size-3.5 text-primary" /> Save history
                  <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                    {wb.saveHistory.length}/25
                  </span>
                </h3>
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {wb.saveHistory.map((version, index) => (
                    <div
                      key={version.id}
                      className="flex items-center rounded-xl bg-secondary px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block text-[11px] font-medium">
                          {index === 0 ? "Latest · " : ""}
                          {new Date(version.savedAt).toLocaleString()}
                        </span>
                        <span className="capitalize text-[10px] text-muted-foreground">
                          {version.reason}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          void wb
                            .restoreVersion(version.id)
                            .then(() => toast.success("Save restored"))
                        }
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium hover:bg-accent"
                      >
                        <RotateCcw className="size-3" /> Restore
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </details>
        </div>
      )}

      <p className="mt-3 text-center text-[9px] leading-relaxed text-muted-foreground">
        Account and project data are stored on this browser/device. Save a project backup before
        clearing browser data.
      </p>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 font-medium",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
