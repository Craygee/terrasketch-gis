import type { ProjectState } from "./types";

export type SaveReason = "manual" | "autosave" | "restored";

export interface ProjectVersion {
  id: string;
  savedAt: number;
  reason: SaveReason;
  state: ProjectState;
}

export interface StoredProject {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  autosave: boolean;
  state: ProjectState;
  versions: ProjectVersion[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  autosave: boolean;
  versionCount: number;
}

const WORKSPACE_KEY = "terrasketch.workspace.v2";
const LEGACY_KEY = "terrasketch.project.v1";
const lastProjectKey = (userId: string) => `terrasketch.last-project.${userId}`;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const readProjects = (): StoredProject[] => {
  try {
    return JSON.parse(window.localStorage.getItem(WORKSPACE_KEY) ?? "[]") as StoredProject[];
  } catch {
    return [];
  }
};

const writeProjects = (projects: StoredProject[]) =>
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(projects));

const summary = (project: StoredProject): ProjectSummary => ({
  id: project.id,
  name: project.name,
  updatedAt: project.updatedAt,
  autosave: project.autosave,
  versionCount: project.versions.length,
});

export const workspaceProjectStore = {
  async list(userId: string): Promise<ProjectSummary[]> {
    return readProjects()
      .filter((project) => project.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(summary);
  },

  async create(userId: string, name: string, state: ProjectState): Promise<StoredProject> {
    const now = Date.now();
    const cleanState = { ...clone(state), name };
    const project: StoredProject = {
      id: window.crypto.randomUUID(),
      userId,
      name,
      createdAt: now,
      updatedAt: now,
      autosave: true,
      state: cleanState,
      versions: [
        { id: window.crypto.randomUUID(), savedAt: now, reason: "manual", state: cleanState },
      ],
    };
    writeProjects([...readProjects(), project]);
    window.localStorage.setItem(lastProjectKey(userId), project.id);
    return clone(project);
  },

  async load(userId: string, projectId: string): Promise<StoredProject | null> {
    const project = readProjects().find((item) => item.userId === userId && item.id === projectId);
    if (project) window.localStorage.setItem(lastProjectKey(userId), project.id);
    return project ? clone(project) : null;
  },

  async loadLast(userId: string): Promise<StoredProject | null> {
    const projects = readProjects().filter((item) => item.userId === userId);
    const lastId = window.localStorage.getItem(lastProjectKey(userId));
    const project =
      projects.find((item) => item.id === lastId) ??
      projects.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return project ? clone(project) : null;
  },

  async save(
    userId: string,
    projectId: string,
    state: ProjectState,
    reason: SaveReason,
  ): Promise<StoredProject> {
    const projects = readProjects();
    const index = projects.findIndex((item) => item.userId === userId && item.id === projectId);
    if (index < 0) throw new Error("Project was not found");
    const current = projects[index] as StoredProject;
    const now = Date.now();
    const snapshot: ProjectVersion = {
      id: window.crypto.randomUUID(),
      savedAt: now,
      reason,
      state: clone(state),
    };
    let versions = current.versions ?? [];
    if (
      reason === "autosave" &&
      versions[0]?.reason === "autosave" &&
      now - versions[0].savedAt < 60_000
    )
      versions = [snapshot, ...versions.slice(1)];
    else versions = [snapshot, ...versions];
    const project: StoredProject = {
      ...current,
      name: state.name,
      state: clone(state),
      updatedAt: now,
      versions: versions.slice(0, 25),
    };
    projects[index] = project;
    writeProjects(projects);
    window.localStorage.setItem(lastProjectKey(userId), project.id);
    return clone(project);
  },

  async setAutosave(userId: string, projectId: string, autosave: boolean): Promise<void> {
    const projects = readProjects();
    const index = projects.findIndex((item) => item.userId === userId && item.id === projectId);
    if (index < 0) return;
    projects[index] = { ...(projects[index] as StoredProject), autosave };
    writeProjects(projects);
  },

  async remove(userId: string, projectId: string): Promise<void> {
    writeProjects(readProjects().filter((item) => item.userId !== userId || item.id !== projectId));
  },

  async readLegacy(): Promise<ProjectState | null> {
    try {
      const raw = window.localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw) as ProjectState;
      return state.version === 1 ? state : null;
    } catch {
      return null;
    }
  },
};

export function downloadProjectFile(state: ProjectState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.name.replace(/[^\w-]+/g, "_") || "terrasketch"}.tsketch.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
