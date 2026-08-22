import type { FeatureCollection } from 'geojson'

export type Pattern = 'solid' | 'diagonal' | 'crosshatch' | 'dots'

export interface LayerStyle {
  color: string
  opacity: number
  width: number
  radius: number
  pattern: Pattern
  labelTemplate: string
  labelSize: number
}

export interface GisLayer {
  id: string
  name: string
  group: string
  subgroup?: string
  visible: boolean
  data: FeatureCollection
  style: LayerStyle
  source?: string
  selectedIds: Array<string | number>
}

export interface CatalogItem {
  id: string
  name: string
  provider: string
  category: string
  description: string
  serviceUrl: string
  layerId?: number
  color: string
  tags: string[]
}

export interface SavedMap {
  id: string
  name: string
  updatedAt: string
}

export type MapVisibility = 'private' | 'link' | 'public'

export interface MapSnapshot {
  mapName: string
  basemap: string
  layers: GisLayer[]
  center?: [number, number]
  zoom?: number
}

export interface CloudMap {
  id: string
  owner_id: string
  title: string
  description: string
  snapshot: MapSnapshot
  visibility: MapVisibility
  allow_link_edit: boolean
  updated_at: string
  created_at: string
}

export const DEFAULT_STYLE: LayerStyle = {
  color: '#f97316', opacity: 0.72, width: 2.5, radius: 5,
  pattern: 'solid', labelTemplate: '', labelSize: 12,
}
