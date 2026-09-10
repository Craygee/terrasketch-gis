import { Check, ChevronDown, ChevronRight, EyeOff, FolderOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { ProjectSummary } from "@/lib/gis/project";
import { useWorkbench } from "@/lib/gis/store";
import { cn } from "@/lib/utils";

type SwitcherMode = "desktop" | "mobile";

export function ProjectSwitcher({ mode }: { mode: SwitcherMode }) {
  const wb = useWorkbench();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const activeProject = wb.projects.find((project) => project.id === wb.projectId);
  const visibilityKey = mode === "desktop" ? "showInQuickSwitch" : "showInMobileBar";
  const visibleProjects = useMemo(
    () => wb.projects.filter((project) => project[visibilityKey]),
    [visibilityKey, wb.projects],
  );

  const openProject = async (id: string) => {
    try {
      await wb.openProject(id);
      if (detailsRef.current) detailsRef.current.open = false;
    } catch (error) {
      toast.error("Project could not be opened", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <details ref={detailsRef} className="group relative min-w-0">
      <summary
        aria-label={mode === "desktop" ? "Quick Switch projects" : "Mobile project bar"}
        title={
          activeProject?.[visibilityKey]
            ? "Switch project"
            : `${activeProject?.name ?? wb.projectName} is hidden from this navigation list`
        }
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-transparent bg-secondary px-2.5 py-1.5 text-xs font-medium outline-none transition-colors hover:bg-accent focus-visible:border-primary [&::-webkit-details-marker]:hidden",
          mode === "desktop" ? "w-36 lg:w-44" : "w-[clamp(4.5rem,28vw,9rem)]",
        )}
      >
        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">
          {activeProject?.name ?? wb.projectName}
        </span>
        {!activeProject?.[visibilityKey] && (
          <EyeOff className="size-3 shrink-0 text-muted-foreground" />
        )}
        <ChevronDown className="size-3 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div
        className={cn(
          "float-surface absolute top-[calc(100%+.35rem)] z-50 max-h-[min(26rem,calc(100dvh-5rem))] overflow-y-auto rounded-2xl border border-border p-1.5",
          mode === "desktop" ? "left-0 w-72" : "-left-12 w-[calc(100vw-1.5rem)] max-w-[21rem]",
        )}
      >
        <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {mode === "desktop" ? "Quick Switch" : "Mobile projects"}
        </div>
        {visibleProjects.length === 0 ? (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-muted-foreground">
            No projects are shown here. Use Projects to turn on this navigation list for a project.
          </p>
        ) : mode === "desktop" ? (
          <DesktopProjectList
            projects={wb.projects}
            visibleProjects={visibleProjects}
            activeId={wb.projectId}
            onOpen={openProject}
          />
        ) : (
          <MobileProjectTree
            projects={wb.projects}
            visibleProjects={visibleProjects}
            activeId={wb.projectId}
            onOpen={openProject}
          />
        )}
      </div>
    </details>
  );
}

function DesktopProjectList({
  projects,
  visibleProjects,
  activeId,
  onOpen,
}: {
  projects: ProjectSummary[];
  visibleProjects: ProjectSummary[];
  activeId: string;
  onOpen: (id: string) => void;
}) {
  const ordered = flattenProjectTree(projects).filter(({ project }) =>
    visibleProjects.some((visible) => visible.id === project.id),
  );
  return (
    <div className="space-y-0.5">
      {ordered.map(({ project }) => {
        const path = projectPath(project, projects);
        const parentContext = path
          .slice(0, -1)
          .map((item) => item.name)
          .join(" / ");
        const active = project.id === activeId;
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onOpen(project.id)}
            title={path.map((item) => item.name).join(" / ")}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent",
              active && "bg-accent ring-1 ring-primary",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {path.length > 1 ? "↳ " : ""}
                {project.name}
              </span>
              {parentContext && (
                <span className="block truncate text-[9px] text-muted-foreground">
                  {parentContext}
                </span>
              )}
            </span>
            {active && <Check className="size-3.5 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function MobileProjectTree({
  projects,
  visibleProjects,
  activeId,
  onOpen,
}: {
  projects: ProjectSummary[];
  visibleProjects: ProjectSummary[];
  activeId: string;
  onOpen: (id: string) => void;
}) {
  const visibleIds = useMemo(
    () => new Set(visibleProjects.map((project) => project.id)),
    [visibleProjects],
  );
  const relevantIds = useMemo(() => {
    const ids = new Set(visibleIds);
    visibleProjects.forEach((project) =>
      projectPath(project, projects).forEach((ancestor) => ids.add(ancestor.id)),
    );
    return ids;
  }, [projects, visibleIds, visibleProjects]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(
        projectPathById(activeId, projects)
          .slice(0, -1)
          .map((project) => project.id),
      ),
  );

  useEffect(() => {
    const ancestors = projectPathById(activeId, projects).slice(0, -1);
    if (ancestors.length === 0) return;
    setExpanded((current) => new Set([...current, ...ancestors.map((project) => project.id)]));
  }, [activeId, projects]);

  const roots = projects.filter(
    (project) =>
      relevantIds.has(project.id) &&
      (!project.parentProjectId || !projects.some((item) => item.id === project.parentProjectId)),
  );

  const renderNode = (project: ProjectSummary, depth: number): React.ReactNode => {
    const children = projects.filter(
      (item) => item.parentProjectId === project.id && relevantIds.has(item.id),
    );
    const isExpanded = expanded.has(project.id);
    const selectable = visibleIds.has(project.id);
    const active = selectable && project.id === activeId;
    return (
      <div key={project.id}>
        <div
          className={cn(
            "flex min-w-0 items-center rounded-xl py-0.5 pr-1",
            active && "bg-accent ring-1 ring-primary",
          )}
          style={{ paddingLeft: `${Math.min(depth, 6) * 14 + 2}px` }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(project.id)) next.delete(project.id);
                  else next.add(project.id);
                  return next;
                })
              }
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${project.name}`}
              aria-expanded={isExpanded}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-card"
            >
              <ChevronRight
                className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")}
              />
            </button>
          ) : (
            <span className="size-7 shrink-0" aria-hidden="true" />
          )}
          {selectable ? (
            <button
              type="button"
              onClick={() => onOpen(project.id)}
              title={projectPath(project, projects)
                .map((item) => item.name)
                .join(" / ")}
              aria-current={active ? "page" : undefined}
              className="min-w-0 flex-1 px-1.5 py-2 text-left"
            >
              <span className="block truncate text-xs font-medium">{project.name}</span>
            </button>
          ) : (
            <span
              className="min-w-0 flex-1 truncate px-1.5 py-2 text-xs font-medium text-muted-foreground"
              title={`${project.name} (parent context)`}
            >
              {project.name}
            </span>
          )}
          {active && <Check className="mr-1 size-3.5 shrink-0 text-primary" />}
        </div>
        {children.length > 0 && isExpanded && (
          <div>{children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return <div className="space-y-0.5">{roots.map((project) => renderNode(project, 0))}</div>;
}

function flattenProjectTree(
  projects: ProjectSummary[],
): Array<{ project: ProjectSummary; depth: number }> {
  const ordered: Array<{ project: ProjectSummary; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (project: ProjectSummary, depth: number) => {
    if (visited.has(project.id)) return;
    visited.add(project.id);
    ordered.push({ project, depth });
    projects
      .filter((candidate) => candidate.parentProjectId === project.id)
      .forEach((child) => visit(child, depth + 1));
  };
  projects
    .filter(
      (project) =>
        !project.parentProjectId ||
        !projects.some((candidate) => candidate.id === project.parentProjectId),
    )
    .forEach((project) => visit(project, 0));
  projects.filter((project) => !visited.has(project.id)).forEach((project) => visit(project, 0));
  return ordered;
}

function projectPath(project: ProjectSummary, projects: ProjectSummary[]): ProjectSummary[] {
  return projectPathById(project.id, projects);
}

function projectPathById(id: string, projects: ProjectSummary[]): ProjectSummary[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const path: ProjectSummary[] = [];
  const visited = new Set<string>();
  let current = byId.get(id);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentProjectId ? byId.get(current.parentProjectId) : undefined;
  }
  return path;
}
