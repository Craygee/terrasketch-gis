import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { Feature } from "geojson";
import type { LayerSource, LayerStyle } from "./types";

export interface PendingFeatureSave {
  features: Feature[];
  suggestedLayerName: string;
  suggestedFeatureName?: string;
  defaultGroupId: string;
  source: LayerSource;
  style?: Partial<LayerStyle>;
  separate?: boolean;
}

interface MapRefApi {
  map: MlMap | null;
  setMap: (map: MlMap | null) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  tableOpen: boolean;
  setTableOpen: (open: boolean) => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  printOpen: boolean;
  setPrintOpen: (open: boolean) => void;
  analysisOpen: boolean;
  setAnalysisOpen: (open: boolean) => void;
  pendingCatalogQuery: string;
  setPendingCatalogQuery: (q: string) => void;
  lastPoint: { lng: number; lat: number } | null;
  setLastPoint: (p: { lng: number; lat: number } | null) => void;
  pendingFeatureSave: PendingFeatureSave | null;
  setPendingFeatureSave: (pending: PendingFeatureSave | null) => void;
  editEnabled: boolean;
  setEditEnabled: (enabled: boolean) => void;
}

const MapRefContext = createContext<MapRefApi | null>(null);

export function MapRefProvider({ children }: { children: ReactNode }) {
  const [map, setMapState] = useState<MlMap | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [pendingCatalogQuery, setPendingCatalogQuery] = useState("");
  const [lastPoint, setLastPoint] = useState<{ lng: number; lat: number } | null>(null);
  const [pendingFeatureSave, setPendingFeatureSave] = useState<PendingFeatureSave | null>(null);
  const [editEnabled, setEditEnabled] = useState(false);

  const value = useMemo<MapRefApi>(
    () => ({
      map,
      setMap: (m) => {
        mapRef.current = m;
        setMapState(m);
      },
      drawerOpen,
      setDrawerOpen,
      tableOpen,
      setTableOpen,
      assistantOpen,
      setAssistantOpen,
      printOpen,
      setPrintOpen,
      analysisOpen,
      setAnalysisOpen,
      pendingCatalogQuery,
      setPendingCatalogQuery,
      lastPoint,
      setLastPoint,
      pendingFeatureSave,
      setPendingFeatureSave,
      editEnabled,
      setEditEnabled,
    }),
    [
      map,
      drawerOpen,
      tableOpen,
      assistantOpen,
      printOpen,
      analysisOpen,
      pendingCatalogQuery,
      lastPoint,
      pendingFeatureSave,
      editEnabled,
    ],
  );

  return <MapRefContext.Provider value={value}>{children}</MapRefContext.Provider>;
}

export function useMapRef(): MapRefApi {
  const ctx = useContext(MapRefContext);
  if (!ctx) throw new Error("useMapRef must be used inside MapRefProvider");
  return ctx;
}
