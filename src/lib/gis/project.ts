import type { ProjectState } from "./types";

/**
 * Local project persistence. Deliberately isolated behind this tiny interface
 * so a PostGIS / cloud collaboration backend can implement the same shape.
 */
export interface ProjectStore {
  save(state: ProjectState): Promise<void>;
  load(): Promise<ProjectState | null>;
  clear(): Promise<void>;
}

const KEY = "terrasketch.project.v1";

export const localProjectStore: ProjectStore = {
  async save(state) {
    if (typeof window === "undefined") return;
    const payload: ProjectState = { ...state, savedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  },
  async load() {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ProjectState;
      return parsed.version === 1 ? parsed : null;
    } catch {
      return null;
    }
  },
  async clear() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(KEY);
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
