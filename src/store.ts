import { create } from 'zustand'
import type { FeatureCollection } from 'geojson'
import { DEFAULT_STYLE, type GisLayer } from './types'

interface GisState {
  layers: GisLayer[]; activeLayerId?: string; basemap: string; mapName: string
  setBasemap: (id: string) => void; setMapName: (name: string) => void; setActive: (id?: string) => void
  addLayer: (name: string, data: FeatureCollection, opts?: Partial<GisLayer>) => string
  updateLayer: (id: string, patch: Partial<GisLayer>) => void; removeLayer: (id: string) => void; reorder: (id: string, delta: number) => void
}

export const useGisStore = create<GisState>((set) => ({
  layers: [], basemap: 'streets', mapName: 'Texas opportunity map',
  setBasemap: (basemap) => set({ basemap }), setMapName: (mapName) => set({ mapName }), setActive: (activeLayerId) => set({ activeLayerId }),
  addLayer: (name, data, opts = {}) => {
    const id = crypto.randomUUID()
    const layer: GisLayer = { id, name, data, group: 'My layers', visible: true, selectedIds: [], style: { ...DEFAULT_STYLE }, ...opts }
    set((state) => ({ layers: [...state.layers, layer], activeLayerId: id })); return id
  },
  updateLayer: (id, patch) => set((state) => ({ layers: state.layers.map((l) => l.id === id ? { ...l, ...patch } : l) })),
  removeLayer: (id) => set((state) => ({ layers: state.layers.filter((l) => l.id !== id), activeLayerId: state.activeLayerId === id ? undefined : state.activeLayerId })),
  reorder: (id, delta) => set((state) => {
    const layers = [...state.layers]; const from = layers.findIndex((l) => l.id === id); const to = Math.max(0, Math.min(layers.length - 1, from + delta))
    const [item] = layers.splice(from, 1); layers.splice(to, 0, item); return { layers }
  }),
}))
