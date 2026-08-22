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

const compactState = (state: ProjectState): ProjectState => {
  const compact = clone(state);
  compact.layers = compact.layers.map((layer) => {
    if (layer.source.kind !== "remote" || !layer.source.requiresViewport) return layer;
    delete layer.source.lastRefreshedAt;
    delete layer.source.loading;
    return { ...layer, data: { type: "FeatureCollection", features: [] } };
  });
  return compact;
};

const compactProject = (project: StoredProject): StoredProject => ({
  ...project,
  state: compactState(project.state),
  versions: (project.versions ?? []).map((version) => ({
    ...version,
    state: compactState(version.state),
  })),
});

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
    const cleanState = { ...compactState(state), name };
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
    const projects = readProjects();
    const index = projects.findIndex((item) => item.userId === userId && item.id === projectId);
    if (index < 0) return null;
    const stored = projects[index] as StoredProject;
    const project = compactProject(stored);
    if (JSON.stringify(stored) !== JSON.stringify(project)) {
      projects[index] = project;
      writeProjects(projects);
    }
    window.localStorage.setItem(lastProjectKey(userId), project.id);
    return clone(project);
  },

  async loadLast(userId: string): Promise<StoredProject | null> {
    const projects = readProjects();
    const userProjects = projects.filter((item) => item.userId === userId);
    const lastId = window.localStorage.getItem(lastProjectKey(userId));
    const stored =
      userProjects.find((item) => item.id === lastId) ??
      userProjects.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!stored) return null;
    const project = compactProject(stored);
    if (JSON.stringify(stored) !== JSON.stringify(project)) {
      const index = projects.findIndex((item) => item.id === stored.id);
      if (index >= 0) projects[index] = project;
      writeProjects(projects);
    }
    return clone(project);
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
    const storedCurrent = projects[index] as StoredProject;
    const current = compactProject(storedCurrent);
    const cleanState = compactState(state);
    if (reason === "autosave" && JSON.stringify(current.state) === JSON.stringify(cleanState)) {
      if (JSON.stringify(storedCurrent) !== JSON.stringify(current)) {
        projects[index] = current;
        writeProjects(projects);
      }
      return clone(current);
    }
    const now = Date.now();
    const snapshot: ProjectVersion = {
      id: window.crypto.randomUUID(),
      savedAt: now,
      reason,
      state: cleanState,
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
      name: cleanState.name,
      state: cleanState,
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
