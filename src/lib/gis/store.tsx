import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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
import { localProjectStore } from "./project";

export type DrawMode = "none" | "polygon" | "line" | "point" | "measure-area" | "measure-line";

export interface SelectedFeature {
  layerId: string;
  index: number;
}

interface WorkbenchState {
  projectName: string;
  groups: LayerGroup[];
  layers: GisLayer[];
  basemapId: string;
  units: AreaUnitsPref;
  activeLayerId: string | null;
  selectedLayerIds: string[];
  selectedFeature: SelectedFeature | null;
  drawMode: DrawMode;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const initialState = (): WorkbenchState => ({
  projectName: "Untitled project",
  groups: [
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
  drawMode: "none",
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
  duplicateLayer: (id: string) => void;
  toggleVisible: (id: string) => void;
  moveLayer: (id: string, direction: -1 | 1) => void;
  setLayerGroup: (id: string, groupId: string) => void;
  addGroup: (name: string) => void;
  toggleGroup: (id: string) => void;
  setActiveLayer: (id: string | null) => void;
  toggleLayerSelection: (id: string, additive: boolean) => void;
  setSelectedFeature: (sel: SelectedFeature | null) => void;
  setDrawMode: (mode: DrawMode) => void;
  setBasemapId: (id: string) => void;
  setUnits: (units: Partial<AreaUnitsPref>) => void;
  setProjectName: (name: string) => void;
  appendFeature: (layerId: string, feature: FeatureCollection["features"][number]) => void;
  saveProject: () => Promise<void>;
  loadProject: () => Promise<boolean>;
  toProjectState: () => ProjectState;
  layersInGroup: (groupId: string) => GisLayer[];
  activeLayer: GisLayer | null;
}

const WorkbenchContext = createContext<WorkbenchApi | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkbenchState>(initialState);

  const patch = useCallback((p: Partial<WorkbenchState>) => setState((s) => ({ ...s, ...p })), []);

  const addLayer = useCallback<WorkbenchApi["addLayer"]>((input) => {
    const layer: GisLayer = {
      id: uid(),
      name: input.name,
      groupId: input.groupId,
      visible: true,
      data: input.data,
      style: { ...defaultStyle(Math.floor(Math.random() * 6)), ...input.style },
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
    }));
  }, []);

  const duplicateLayer = useCallback<WorkbenchApi["duplicateLayer"]>((id) => {
    setState((s) => {
      const source = s.layers.find((l) => l.id === id);
      if (!source) return s;
      const copy: GisLayer = {
        ...source,
        id: uid(),
        name: `${source.name} copy`,
        data: JSON.parse(JSON.stringify(source.data)) as FeatureCollection,
        createdAt: Date.now(),
      };
      const index = s.layers.findIndex((l) => l.id === id);
      const layers = [...s.layers];
      layers.splice(index, 0, copy);
      return { ...s, layers, activeLayerId: copy.id, selectedLayerIds: [copy.id] };
    });
  }, []);

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

  const setLayerGroup = useCallback<WorkbenchApi["setLayerGroup"]>((id, groupId) => {
    setState((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === id ? { ...l, groupId } : l)),
    }));
  }, []);

  const addGroup = useCallback<WorkbenchApi["addGroup"]>((name) => {
    setState((s) => ({ ...s, groups: [...s.groups, { id: uid(), name, collapsed: false }] }));
  }, []);

  const toggleGroup = useCallback<WorkbenchApi["toggleGroup"]>((id) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)),
    }));
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

  const toProjectState = useCallback<WorkbenchApi["toProjectState"]>(
    () => ({
      version: 1,
      name: state.projectName,
      groups: state.groups,
      layers: state.layers,
      basemapId: state.basemapId,
      units: state.units,
    }),
    [state],
  );

  const saveProject = useCallback(async () => {
    await localProjectStore.save(toProjectState());
  }, [toProjectState]);

  const loadProject = useCallback(async () => {
    const loaded = await localProjectStore.load();
    if (!loaded) return false;
    setState((s) => ({
      ...s,
      projectName: loaded.name,
      groups: loaded.groups,
      layers: loaded.layers,
      basemapId: loaded.basemapId,
      units: loaded.units,
      activeLayerId: null,
      selectedLayerIds: [],
      selectedFeature: null,
    }));
    return true;
  }, []);

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
      setLayerGroup,
      addGroup,
      toggleGroup,
      setActiveLayer: (id) => patch({ activeLayerId: id }),
      toggleLayerSelection,
      setSelectedFeature: (sel) => patch({ selectedFeature: sel }),
      setDrawMode: (mode) => patch({ drawMode: mode }),
      setBasemapId: (id) => patch({ basemapId: id }),
      setUnits: (units) => setState((s) => ({ ...s, units: { ...s.units, ...units } })),
      setProjectName: (name) => patch({ projectName: name }),
      appendFeature,
      saveProject,
      loadProject,
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
      setLayerGroup,
      addGroup,
      toggleGroup,
      toggleLayerSelection,
      appendFeature,
      saveProject,
      loadProject,
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
