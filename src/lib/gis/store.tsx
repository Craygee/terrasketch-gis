import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FeatureCollection } from "geojson";
import {
  defaultStyle,
  type GisLayer,
  type LayerGroup,
  type LayerStyle,
  type LayerSource,
  type ProjectState,
  type AreaUnitsPref,
} from "./types";
import {
  workspaceProjectStore,
  type ProjectSummary,
  type ProjectVersion,
  type SaveReason,
  type StoredProject,
} from "./project";
import { useAuth } from "@/lib/auth";

export type DrawMode =
  "none" | "select-box" | "polygon" | "line" | "point" | "measure-area" | "measure-line";

export interface SelectedFeature {
  layerId: string;
  index: number;
}

interface WorkbenchState {
  projectId: string;
  projectReady: boolean;
  projectError: string | null;
  projectName: string;
  projects: ProjectSummary[];
  saveHistory: ProjectVersion[];
  autosave: boolean;
  lastSavedAt: number | null;
  groups: LayerGroup[];
  layers: GisLayer[];
  basemapId: string;
  units: AreaUnitsPref;
  activeLayerId: string | null;
  selectedLayerIds: string[];
  selectedFeature: SelectedFeature | null;
  selectedFeatures: SelectedFeature[];
  drawMode: DrawMode;
  snapEnabled: boolean;
  selectedStates: string[];
  derivedLayerGroupId: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const initialState = (): WorkbenchState => ({
  projectId: "",
  projectReady: false,
  projectError: null,
  projectName: "Untitled project",
  projects: [],
  saveHistory: [],
  autosave: true,
  lastSavedAt: null,
  groups: [
    { id: "working", name: "Working layers", collapsed: false },
    { id: "sketch", name: "My sketches", collapsed: false },
    { id: "imports", name: "Imported files", collapsed: false },
    { id: "public", name: "Public data", collapsed: false },
  ],
  layers: [],
  basemapId: "street",
  units: { area: "acres", length: "miles" },
  activeLayerId: null,
  selectedLayerIds: [],
  selectedFeature: null,
  selectedFeatures: [],
  drawMode: "none",
  snapEnabled: true,
  selectedStates: ["TX"],
  derivedLayerGroupId: "working",
});

const blankProjectState = (name: string): ProjectState => ({
  version: 1,
  name,
  groups: [
    { id: "working", name: "Working layers", collapsed: false },
    { id: "sketch", name: "My sketches", collapsed: false },
    { id: "imports", name: "Imported files", collapsed: false },
    { id: "public", name: "Public data", collapsed: false },
  ],
  layers: [],
  basemapId: "street",
  units: { area: "acres", length: "miles" },
  selectedStates: ["TX"],
  derivedLayerGroupId: "working",
});

const normalizedLayer = (layer: GisLayer, index: number): GisLayer => {
  const source =
    layer.source.kind === "remote" && layer.source.catalogId && !layer.source.requiresViewport
      ? { ...layer.source, requiresViewport: true }
      : layer.source;
  const style = { ...defaultStyle(index), ...layer.style };
  return {
    ...layer,
    source,
    style: {
      ...style,
      labelFields: Array.isArray(style.labelFields) ? style.labelFields : [],
      labelSeparator: style.labelSeparator || " · ",
    },
  };
};

const durableLayer = (layer: GisLayer): GisLayer => {
  if (layer.source.kind !== "remote" || !layer.source.requiresViewport) return layer;
  const source = { ...layer.source };
  delete source.lastRefreshedAt;
  delete source.loading;
  return {
    ...layer,
    data: { type: "FeatureCollection", features: [] },
    source,
  };
};

const normalizedProject = (project: StoredProject, projects: ProjectSummary[]) => {
  const stored = project.state;
  const groups = stored.groups.some((group) => group.id === "working")
    ? stored.groups
    : [{ id: "working", name: "Working layers", collapsed: false }, ...stored.groups];
  return {
    projectId: project.id,
    projectReady: true,
    projectError: null,
    projectName: stored.name,
    projects,
    saveHistory: project.versions ?? [],
    autosave: project.autosave,
    lastSavedAt: project.updatedAt,
    groups,
    layers: stored.layers.map((layer, index) => durableLayer(normalizedLayer(layer, index))),
    basemapId: stored.basemapId,
    units: stored.units,
    activeLayerId: null,
    selectedLayerIds: [],
    selectedFeature: null,
    selectedFeatures: [],
    drawMode: "none" as DrawMode,
    selectedStates: stored.selectedStates?.length ? stored.selectedStates : ["TX"],
    derivedLayerGroupId: groups.some((group) => group.id === stored.derivedLayerGroupId)
      ? (stored.derivedLayerGroupId as string)
      : "working",
  };
};

const stateToProject = (state: WorkbenchState): ProjectState => ({
  version: 1,
  name: state.projectName,
  groups: state.groups,
  layers: state.layers.map(durableLayer),
  basemapId: state.basemapId,
  units: state.units,
  selectedStates: state.selectedStates,
  derivedLayerGroupId: state.derivedLayerGroupId,
});

export interface WorkbenchApi extends WorkbenchState {
  addLayer: (input: {
    name: string;
    data: FeatureCollection;
    groupId: string;
    source: LayerSource;
    style?: Partial<LayerStyle>;
  }) => GisLayer;
  updateLayer: (id: string, patch: Partial<Omit<GisLayer, "id">>) => void;
  updateStyle: (id: string, patch: Partial<LayerStyle>) => void;
  removeLayers: (ids: string[]) => void;
  duplicateLayer: (id: string, targetGroupId?: string) => void;
  toggleVisible: (id: string) => void;
  moveLayer: (id: string, direction: -1 | 1) => void;
  reorderLayer: (id: string, targetGroupId: string, beforeLayerId?: string) => void;
  setLayerGroup: (id: string, groupId: string) => void;
  addGroup: (name: string) => void;
  addSubgroup: (parentId: string, name: string) => void;
  toggleGroup: (id: string) => void;
  setGroupVisible: (id: string, visible: boolean) => void;
  applyStyleToGroup: (id: string, patch: Partial<LayerStyle>) => void;
  setActiveLayer: (id: string | null) => void;
  toggleLayerSelection: (id: string, additive: boolean) => void;
  setSelectedFeature: (sel: SelectedFeature | null) => void;
  setSelectedFeatures: (selections: SelectedFeature[]) => void;
  setDrawMode: (mode: DrawMode) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSelectedStates: (states: string[]) => void;
  setDerivedLayerGroupId: (groupId: string) => void;
  setBasemapId: (id: string) => void;
  setUnits: (units: Partial<AreaUnitsPref>) => void;
  setProjectName: (name: string) => void;
  appendFeature: (layerId: string, feature: FeatureCollection["features"][number]) => void;
  updateFeatureProperties: (
    layerId: string,
    index: number,
    properties: Record<string, unknown>,
  ) => void;
  saveProject: (reason?: SaveReason) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  restoreVersion: (versionId: string) => Promise<void>;
  setAutosave: (enabled: boolean) => Promise<void>;
  toProjectState: () => ProjectState;
  layersInGroup: (groupId: string) => GisLayer[];
  activeLayer: GisLayer | null;
}

const WorkbenchContext = createContext<WorkbenchApi | null>(null);

const palette = ["#2f7d4f", "#c9832c", "#3b6ea5", "#8e4a86", "#b0453a", "#3f7f7a"];

const colorSeed = (value: string) =>
  Array.from(value).reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 0);

const sourceFamily = (sourceId: string, layers: GisLayer[]): GisLayer | undefined => {
  let current = layers.find((layer) => layer.id === sourceId);
  const visited = new Set<string>();
  while (current?.source.kind === "derived" && !visited.has(current.id)) {
    visited.add(current.id);
    const sourceLayerId = current.source.sourceLayerId;
    current = layers.find((layer) => layer.id === sourceLayerId);
  }
  return current;
};

const derivedStyle = (
  sourceId: string,
  layers: GisLayer[],
  requested: Partial<LayerStyle> = {},
): LayerStyle => {
  const source = sourceFamily(sourceId, layers) ?? layers.find((layer) => layer.id === sourceId);
  const familyId = source?.id ?? sourceId;
  let index = colorSeed(`${familyId}:derived`) % palette.length;
  if (palette[index]?.toLowerCase() === source?.style.fillColor.toLowerCase())
    index = (index + 1) % palette.length;
  const color = palette[index] ?? "#3b6ea5";
  return {
    ...(source?.style ?? defaultStyle(index)),
    ...requested,
    fillColor: color,
    strokeColor: color,
    fillOpacity: 0.5,
  };
};

const descendantGroupIds = (groupId: string, groups: LayerGroup[]): Set<string> => {
  const ids = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (group.parentId && ids.has(group.parentId) && !ids.has(group.id)) {
        ids.add(group.id);
        changed = true;
      }
    }
  }
  return ids;
};

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<WorkbenchState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosave = useRef(true);
  const bootUserId = useRef<string | null>(null);

  const patch = useCallback((p: Partial<WorkbenchState>) => setState((s) => ({ ...s, ...p })), []);

  const addLayer = useCallback<WorkbenchApi["addLayer"]>((input) => {
    const existing = stateRef.current.layers;
    const style =
      input.source.kind === "derived"
        ? derivedStyle(input.source.sourceLayerId, existing, input.style)
        : { ...defaultStyle(Math.floor(Math.random() * 6)), ...input.style };
    const layer: GisLayer = {
      id: uid(),
      name: input.name,
      groupId: input.groupId,
      visible: true,
      data: input.data,
      style,
      source: input.source,
      createdAt: Date.now(),
    };
    setState((s) => ({
      ...s,
      layers: [layer, ...s.layers],
      activeLayerId: layer.id,
      selectedLayerIds: [layer.id],
    }));
    return layer;
  }, []);

  const updateLayer = useCallback<WorkbenchApi["updateLayer"]>((id, p) => {
    setState((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...p } : l)),
    }));
  }, []);

  const updateStyle = useCallback<WorkbenchApi["updateStyle"]>((id, p) => {
    setState((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === id ? { ...l, style: { ...l.style, ...p } } : l)),
    }));
  }, []);

  const removeLayers = useCallback<WorkbenchApi["removeLayers"]>((ids) => {
    setState((s) => ({
      ...s,
      layers: s.layers.filter((l) => !ids.includes(l.id)),
      activeLayerId: ids.includes(s.activeLayerId ?? "") ? null : s.activeLayerId,
      selectedLayerIds: s.selectedLayerIds.filter((id) => !ids.includes(id)),
      selectedFeature:
        s.selectedFeature && ids.includes(s.selectedFeature.layerId) ? null : s.selectedFeature,
      selectedFeatures: s.selectedFeatures.filter((item) => !ids.includes(item.layerId)),
    }));
  }, []);

  const duplicateLayer = useCallback<WorkbenchApi["duplicateLayer"]>((id, targetGroupId) => {
    setState((s) => {
      const source = s.layers.find((l) => l.id === id);
      if (!source) return s;
      const copy: GisLayer = {
        ...source,
        id: uid(),
        name: `${source.name} copy`,
        groupId: targetGroupId ?? source.groupId,
        data: JSON.parse(JSON.stringify(source.data)) as FeatureCollection,
        source: { kind: "derived", sourceLayerId: source.id, query: "Duplicated layer" },
        style: derivedStyle(source.id, s.layers),
        createdAt: Date.now(),
      };
      const index = s.layers.findIndex((l) => l.id === id);
      const layers = [...s.layers];
      const firstInTarget = layers.findIndex((layer) => layer.groupId === copy.groupId);
      layers.splice(firstInTarget >= 0 ? firstInTarget : index, 0, copy);
      return { ...s, layers, activeLayerId: copy.id, selectedLayerIds: [copy.id] };
    });
  }, []);

  const reorderLayer = useCallback<WorkbenchApi["reorderLayer"]>(
    (id, targetGroupId, beforeLayerId) => {
      setState((s) => {
        const source = s.layers.find((layer) => layer.id === id);
        if (!source) return s;
        const moved = { ...source, groupId: targetGroupId };
        const layers = s.layers.filter((layer) => layer.id !== id);
        const beforeIndex = beforeLayerId
          ? layers.findIndex((layer) => layer.id === beforeLayerId)
          : -1;
        if (beforeIndex >= 0) layers.splice(beforeIndex, 0, moved);
        else {
          const lastInGroup = layers.reduce(
            (last, layer, index) => (layer.groupId === targetGroupId ? index : last),
            -1,
          );
          layers.splice(lastInGroup + 1, 0, moved);
        }
        return { ...s, layers, activeLayerId: id, selectedLayerIds: [id] };
      });
    },
    [],
  );

  const toggleVisible = useCallback<WorkbenchApi["toggleVisible"]>((id) => {
    setState((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    }));
  }, []);

  const moveLayer = useCallback<WorkbenchApi["moveLayer"]>((id, direction) => {
    setState((s) => {
      const index = s.layers.findIndex((l) => l.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= s.layers.length) return s;
      const layers = [...s.layers];
      const [moved] = layers.splice(index, 1);
      if (!moved) return s;
      layers.splice(target, 0, moved);
      return { ...s, layers };
    });
  }, []);

  const setLayerGroup = useCallback<WorkbenchApi["setLayerGroup"]>(
    (id, groupId) => reorderLayer(id, groupId),
    [reorderLayer],
  );

  const addGroup = useCallback<WorkbenchApi["addGroup"]>((name) => {
    setState((s) => ({ ...s, groups: [...s.groups, { id: uid(), name, collapsed: false }] }));
  }, []);

  const addSubgroup = useCallback<WorkbenchApi["addSubgroup"]>((parentId, name) => {
    setState((s) => ({
      ...s,
      groups: [...s.groups, { id: uid(), name, collapsed: false, parentId }],
    }));
  }, []);

  const toggleGroup = useCallback<WorkbenchApi["toggleGroup"]>((id) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)),
    }));
  }, []);

  const setGroupVisible = useCallback<WorkbenchApi["setGroupVisible"]>((id, visible) => {
    setState((s) => {
      const groupIds = descendantGroupIds(id, s.groups);
      return {
        ...s,
        layers: s.layers.map((layer) =>
          groupIds.has(layer.groupId) ? { ...layer, visible } : layer,
        ),
      };
    });
  }, []);

  const applyStyleToGroup = useCallback<WorkbenchApi["applyStyleToGroup"]>((id, stylePatch) => {
    setState((s) => {
      const groupIds = descendantGroupIds(id, s.groups);
      return {
        ...s,
        layers: s.layers.map((layer) =>
          groupIds.has(layer.groupId)
            ? { ...layer, style: { ...layer.style, ...stylePatch } }
            : layer,
        ),
      };
    });
  }, []);

  const toggleLayerSelection = useCallback<WorkbenchApi["toggleLayerSelection"]>((id, additive) => {
    setState((s) => {
      const selected = additive
        ? s.selectedLayerIds.includes(id)
          ? s.selectedLayerIds.filter((x) => x !== id)
          : [...s.selectedLayerIds, id]
        : [id];
      return { ...s, selectedLayerIds: selected, activeLayerId: id };
    });
  }, []);

  const appendFeature = useCallback<WorkbenchApi["appendFeature"]>((layerId, feature) => {
    setState((s) => ({
      ...s,
      layers: s.layers.map((l) =>
        l.id === layerId
          ? { ...l, data: { type: "FeatureCollection", features: [...l.data.features, feature] } }
          : l,
      ),
    }));
  }, []);

  const updateFeatureProperties = useCallback<WorkbenchApi["updateFeatureProperties"]>(
    (layerId, index, properties) => {
      setState((s) => ({
        ...s,
        layers: s.layers.map((layer) => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            data: {
              type: "FeatureCollection",
              features: layer.data.features.map((feature, featureIndex) =>
                featureIndex === index
                  ? { ...feature, properties: { ...(feature.properties ?? {}), ...properties } }
                  : feature,
              ),
            },
          };
        }),
      }));
    },
    [],
  );

  const toProjectState = useCallback<WorkbenchApi["toProjectState"]>(
    () => stateToProject(state),
    [state],
  );

  const saveProject = useCallback<WorkbenchApi["saveProject"]>(
    async (reason = "manual") => {
      const userId = auth.user?.id;
      const current = stateRef.current;
      if (!userId || !current.projectId || !current.projectReady) return;
      const project = await workspaceProjectStore.save(
        userId,
        current.projectId,
        stateToProject(current),
        reason,
      );
      const projects = await workspaceProjectStore.list(userId);
      setState((value) => ({
        ...value,
        projects,
        saveHistory: project.versions,
        lastSavedAt: project.updatedAt,
      }));
    },
    [auth.user?.id],
  );

  const createProject = useCallback<WorkbenchApi["createProject"]>(
    async (rawName) => {
      const userId = auth.user?.id;
      if (!userId) return;
      const name = rawName.trim() || "Untitled project";
      const project = await workspaceProjectStore.create(userId, name, blankProjectState(name));
      const projects = await workspaceProjectStore.list(userId);
      skipNextAutosave.current = true;
      setState((current) => ({ ...current, ...normalizedProject(project, projects) }));
    },
    [auth.user?.id],
  );

  const openProject = useCallback<WorkbenchApi["openProject"]>(
    async (id) => {
      const userId = auth.user?.id;
      if (!userId || id === stateRef.current.projectId) return;
      const project = await workspaceProjectStore.load(userId, id);
      if (!project) throw new Error("Project was not found");
      const projects = await workspaceProjectStore.list(userId);
      skipNextAutosave.current = true;
      setState((current) => ({ ...current, ...normalizedProject(project, projects) }));
    },
    [auth.user?.id],
  );

  const deleteProject = useCallback<WorkbenchApi["deleteProject"]>(
    async (id) => {
      const userId = auth.user?.id;
      if (!userId) return;
      await workspaceProjectStore.remove(userId, id);
      let projects = await workspaceProjectStore.list(userId);
      if (id !== stateRef.current.projectId) {
        setState((current) => ({ ...current, projects }));
        return;
      }
      const next = projects[0];
      if (next) {
        const project = await workspaceProjectStore.load(userId, next.id);
        if (project)
          setState((current) => ({ ...current, ...normalizedProject(project, projects) }));
      } else {
        const project = await workspaceProjectStore.create(
          userId,
          "Untitled project",
          blankProjectState("Untitled project"),
        );
        projects = await workspaceProjectStore.list(userId);
        setState((current) => ({ ...current, ...normalizedProject(project, projects) }));
      }
      skipNextAutosave.current = true;
    },
    [auth.user?.id],
  );

  const restoreVersion = useCallback<WorkbenchApi["restoreVersion"]>(
    async (versionId) => {
      const userId = auth.user?.id;
      const current = stateRef.current;
      const version = current.saveHistory.find((item) => item.id === versionId);
      if (!userId || !version) return;
      const versionState = await workspaceProjectStore.loadVersion(version);
      const project = await workspaceProjectStore.save(
        userId,
        current.projectId,
        versionState,
        "restored",
      );
      const projects = await workspaceProjectStore.list(userId);
      skipNextAutosave.current = true;
      setState((value) => ({ ...value, ...normalizedProject(project, projects) }));
    },
    [auth.user?.id],
  );

  const setAutosave = useCallback<WorkbenchApi["setAutosave"]>(
    async (enabled) => {
      const userId = auth.user?.id;
      const projectId = stateRef.current.projectId;
      if (!userId || !projectId) return;
      await workspaceProjectStore.setAutosave(userId, projectId, enabled);
      setState((current) => ({
        ...current,
        autosave: enabled,
        projects: current.projects.map((project) =>
          project.id === projectId ? { ...project, autosave: enabled } : project,
        ),
      }));
    },
    [auth.user?.id],
  );

  useEffect(() => {
    const userId = auth.user?.id;
    if (!userId || bootUserId.current === userId) return;
    bootUserId.current = userId;
    void (async () => {
      try {
        await workspaceProjectStore.migrateLocalAccount(userId, auth.user?.email ?? "");
        let project = await workspaceProjectStore.loadLast(userId);
        if (!project) {
          const legacy = await workspaceProjectStore.readLegacy();
          const initial = legacy ?? blankProjectState("Untitled project");
          project = await workspaceProjectStore.create(userId, initial.name, initial);
        }
        const projects = await workspaceProjectStore.list(userId);
        skipNextAutosave.current = true;
        setState((current) => ({ ...current, ...normalizedProject(project, projects) }));
      } catch (error) {
        setState((current) => ({
          ...current,
          projectError:
            error instanceof Error ? error.message : "The cloud workspace could not be opened",
        }));
      }
    })();
  }, [auth.user?.email, auth.user?.id]);

  useEffect(() => {
    if (!state.projectReady || !state.autosave || !auth.user) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void saveProject("autosave"), 1_500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [
    auth.user,
    saveProject,
    state.autosave,
    state.basemapId,
    state.groups,
    state.layers,
    state.projectId,
    state.projectName,
    state.projectReady,
    state.selectedStates,
    state.derivedLayerGroupId,
    state.units,
  ]);

  const value = useMemo<WorkbenchApi>(
    () => ({
      ...state,
      addLayer,
      updateLayer,
      updateStyle,
      removeLayers,
      duplicateLayer,
      toggleVisible,
      moveLayer,
      reorderLayer,
      setLayerGroup,
      addGroup,
      addSubgroup,
      toggleGroup,
      setGroupVisible,
      applyStyleToGroup,
      setActiveLayer: (id) => patch({ activeLayerId: id }),
      toggleLayerSelection,
      setSelectedFeature: (sel) =>
        patch({ selectedFeature: sel, selectedFeatures: sel ? [sel] : [] }),
      setSelectedFeatures: (selections) =>
        patch({ selectedFeatures: selections, selectedFeature: selections[0] ?? null }),
      setDrawMode: (mode) => patch({ drawMode: mode }),
      setSnapEnabled: (enabled) => patch({ snapEnabled: enabled }),
      setSelectedStates: (states) => patch({ selectedStates: states }),
      setDerivedLayerGroupId: (groupId) => patch({ derivedLayerGroupId: groupId }),
      setBasemapId: (id) => patch({ basemapId: id }),
      setUnits: (units) => setState((s) => ({ ...s, units: { ...s.units, ...units } })),
      setProjectName: (name) => patch({ projectName: name }),
      appendFeature,
      updateFeatureProperties,
      saveProject,
      createProject,
      openProject,
      deleteProject,
      restoreVersion,
      setAutosave,
      toProjectState,
      layersInGroup: (groupId) => state.layers.filter((l) => l.groupId === groupId),
      activeLayer: state.layers.find((l) => l.id === state.activeLayerId) ?? null,
    }),
    [
      state,
      addLayer,
      updateLayer,
      updateStyle,
      removeLayers,
      duplicateLayer,
      toggleVisible,
      moveLayer,
      reorderLayer,
      setLayerGroup,
      addGroup,
      addSubgroup,
      toggleGroup,
      setGroupVisible,
      applyStyleToGroup,
      toggleLayerSelection,
      appendFeature,
      updateFeatureProperties,
      saveProject,
      createProject,
      openProject,
      deleteProject,
      restoreVersion,
      setAutosave,
      toProjectState,
      patch,
    ],
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchApi {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return ctx;
}
