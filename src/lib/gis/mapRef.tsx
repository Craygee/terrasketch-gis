import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Map as MlMap } from "maplibre-gl";

interface MapRefApi {
  map: MlMap | null;
  setMap: (map: MlMap | null) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  tableOpen: boolean;
  setTableOpen: (open: boolean) => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  pendingCatalogQuery: string;
  setPendingCatalogQuery: (q: string) => void;
  lastPoint: { lng: number; lat: number } | null;
  setLastPoint: (p: { lng: number; lat: number } | null) => void;
}

const MapRefContext = createContext<MapRefApi | null>(null);

export function MapRefProvider({ children }: { children: ReactNode }) {
  const [map, setMapState] = useState<MlMap | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pendingCatalogQuery, setPendingCatalogQuery] = useState("");
  const [lastPoint, setLastPoint] = useState<{ lng: number; lat: number } | null>(null);

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
      pendingCatalogQuery,
      setPendingCatalogQuery,
      lastPoint,
      setLastPoint,
    }),
    [map, drawerOpen, tableOpen, assistantOpen, pendingCatalogQuery, lastPoint],
  );

  return <MapRefContext.Provider value={value}>{children}</MapRefContext.Provider>;
}

export function useMapRef(): MapRefApi {
  const ctx = useContext(MapRefContext);
  if (!ctx) throw new Error("useMapRef must be used inside MapRefProvider");
  return ctx;
}
