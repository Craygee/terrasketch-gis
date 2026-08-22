import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import * as turf from '@turf/turf'
import {
  ChevronDown, ChevronRight, CircleHelp, Copy, Database, Download, Eye, EyeOff,
  FileUp, Folder, GripVertical, Layers3, Map as MapIcon, MapPin, Menu, MoveDown,
  MoveUp, Paintbrush, Plus, Redo2, Ruler, Save, Search, Sparkles, Table2,
  Trash2, Undo2, X, Zap,
} from 'lucide-react'
import type { Feature } from 'geojson'
import { BASEMAPS, DATA_CATALOG } from './data/catalog'
import { useGisStore } from './store'
import { fetchGeoData, importGeoFile } from './utils/importers'
import { exportGeoJSON, exportKml, exportShapefile } from './utils/exporters'
import type { GisLayer, LayerStyle, Pattern } from './types'

const COLORS = ['#f97316', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#ec4899']
const DRAW_STYLES: object[] = [
  { id: 'gl-draw-polygon-fill', type: 'fill', filter: ['all', ['==', '$type', 'Polygon']], paint: { 'fill-color': ['case', ['==', ['get', 'active'], 'true'], '#f97316', '#0f766e'], 'fill-opacity': .16 } },
  { id: 'gl-draw-lines', type: 'line', filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'active'], 'true'], '#f97316', '#0f766e'], 'line-width': 3 } },
  { id: 'gl-draw-point', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature']], paint: { 'circle-radius': 6, 'circle-color': ['case', ['==', ['get', 'active'], 'true'], '#f97316', '#0f766e'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
  { id: 'gl-draw-vertex', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']], paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#f97316', 'circle-stroke-width': 2 } },
  { id: 'gl-draw-midpoint', type: 'circle', filter: ['all', ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 4, 'circle-color': '#f97316' } },
]

function rasterStyle(tile: string, attribution: string): maplibregl.StyleSpecification {
  return { version: 8, sources: { basemap: { type: 'raster', tiles: [tile], tileSize: 256, attribution } }, layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }] }
}

function geometryKinds(layer: GisLayer) {
  const types = new Set(layer.data.features.map((f) => f.geometry?.type))
  return { polygon: [...types].some((t) => t?.includes('Polygon')), line: [...types].some((t) => t?.includes('LineString')), point: [...types].some((t) => t?.includes('Point')) }
}

function makePattern(kind: Pattern, color: string): ImageData | null {
  if (kind === 'solid') return null
  const size = 12; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, size, size); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2
  if (kind === 'diagonal' || kind === 'crosshatch') { ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(9, 15); ctx.moveTo(3, -3); ctx.lineTo(15, 9); ctx.stroke() }
  if (kind === 'crosshatch') { ctx.beginPath(); ctx.moveTo(-3, 9); ctx.lineTo(9, -3); ctx.moveTo(3, 15); ctx.lineTo(15, 3); ctx.stroke() }
  if (kind === 'dots') { ctx.beginPath(); ctx.arc(3, 3, 1.8, 0, Math.PI * 2); ctx.arc(9, 9, 1.8, 0, Math.PI * 2); ctx.fill() }
  return ctx.getImageData(0, 0, size, size)
}

function labelExpression(template: string): maplibregl.ExpressionSpecification | string {
  const parts = template.split(/(\{[^}]+\})/g).filter(Boolean).map((part) => {
    const match = part.match(/^\{(.+)\}$/); return match ? ['coalesce', ['to-string', ['get', match[1]]], ''] : part
  })
  return parts.length ? ['concat', ...parts] as maplibregl.ExpressionSpecification : ''
}

function MapCanvas({ onCoordinates, onSelection, onContext }: {
  onCoordinates: (value: string) => void
  onSelection: (layerId: string, feature: Feature) => void
  onContext: (x: number, y: number, lng: number, lat: number) => void
}) {
  const container = useRef<HTMLDivElement>(null); const mapRef = useRef<MapLibreMap>(); const drawRef = useRef<MapboxDraw>()
  const { layers, basemap, addLayer } = useGisStore(); const styledBasemap = useRef(basemap)
  const base = BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0]

  const syncLayers = useCallback((map: MapLibreMap) => {
    for (const layer of layers) {
      const sourceId = `source-${layer.id}`; const kinds = geometryKinds(layer)
      if (!map.getSource(sourceId)) map.addSource(sourceId, { type: 'geojson', data: layer.data, promoteId: 'OBJECTID' })
      else (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(layer.data)
      const patternId = `pattern-${layer.id}`; const pattern = makePattern(layer.style.pattern, layer.style.color)
      if (pattern) { if (map.hasImage(patternId)) map.updateImage(patternId, pattern); else map.addImage(patternId, pattern) }
      if (kinds.polygon && !map.getLayer(`fill-${layer.id}`)) map.addLayer({ id: `fill-${layer.id}`, type: 'fill', source: sourceId, paint: { 'fill-color': layer.style.color, 'fill-opacity': layer.style.opacity * .55 } })
      if (kinds.line || kinds.polygon) if (!map.getLayer(`line-${layer.id}`)) map.addLayer({ id: `line-${layer.id}`, type: 'line', source: sourceId, paint: { 'line-color': layer.style.color, 'line-width': layer.style.width, 'line-opacity': layer.style.opacity } })
      if (kinds.point && !map.getLayer(`circle-${layer.id}`)) map.addLayer({ id: `circle-${layer.id}`, type: 'circle', source: sourceId, paint: { 'circle-color': layer.style.color, 'circle-radius': layer.style.radius, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-opacity': layer.style.opacity } })
      if (!layer.style.labelTemplate && map.getLayer(`label-${layer.id}`)) map.removeLayer(`label-${layer.id}`)
      if (layer.style.labelTemplate && !map.getLayer(`label-${layer.id}`)) map.addLayer({ id: `label-${layer.id}`, type: 'symbol', source: sourceId, layout: { 'text-field': labelExpression(layer.style.labelTemplate), 'text-size': layer.style.labelSize, 'text-offset': [0, 1.1] }, paint: { 'text-color': '#12211c', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } })
      for (const prefix of ['fill', 'line', 'circle', 'label']) {
        const id = `${prefix}-${layer.id}`; if (!map.getLayer(id)) continue
        map.setLayoutProperty(id, 'visibility', layer.visible ? 'visible' : 'none')
        if (prefix === 'fill') { map.setPaintProperty(id, 'fill-color', layer.style.color); map.setPaintProperty(id, 'fill-opacity', layer.style.opacity * .55); map.setPaintProperty(id, 'fill-pattern', pattern ? patternId : null) }
        if (prefix === 'line') { map.setPaintProperty(id, 'line-color', layer.style.color); map.setPaintProperty(id, 'line-width', layer.style.width); map.setPaintProperty(id, 'line-opacity', layer.style.opacity) }
        if (prefix === 'circle') { map.setPaintProperty(id, 'circle-color', layer.style.color); map.setPaintProperty(id, 'circle-radius', layer.style.radius); map.setPaintProperty(id, 'circle-opacity', layer.style.opacity) }
        if (prefix === 'label' && layer.style.labelTemplate) { map.setLayoutProperty(id, 'text-field', labelExpression(layer.style.labelTemplate)); map.setLayoutProperty(id, 'text-size', layer.style.labelSize) }
      }
    }
    const live = new Set(layers.flatMap((l) => ['fill', 'line', 'circle', 'label'].map((p) => `${p}-${l.id}`)))
    map.getStyle().layers?.filter((l) => /^(fill|line|circle|label)-/.test(l.id) && !live.has(l.id)).forEach((l) => map.removeLayer(l.id))
    Object.keys(map.getStyle().sources).filter((id) => id.startsWith('source-') && !layers.some((l) => `source-${l.id}` === id)).forEach((id) => map.removeSource(id))
  }, [layers])

  useEffect(() => {
    if (!container.current || mapRef.current) return
    const map = new maplibregl.Map({ container: container.current, style: rasterStyle(base.tile, base.attribution), center: [-98.7, 31.1], zoom: 5.3, attributionControl: false })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right'); map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right'); map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, line_string: true, point: true, trash: true }, defaultMode: 'simple_select', styles: DRAW_STYLES })
    map.addControl(draw as unknown as maplibregl.IControl, 'top-right'); drawRef.current = draw
    map.on('mousemove', (e) => onCoordinates(`${e.lngLat.lat.toFixed(6)}°, ${e.lngLat.lng.toFixed(6)}°`))
    map.on('contextmenu', (e) => { e.preventDefault(); onContext(e.point.x, e.point.y, e.lngLat.lng, e.lngLat.lat) })
    map.on('click', (e) => {
      const ids = layers.flatMap((l) => ['fill', 'line', 'circle'].map((p) => `${p}-${l.id}`)).filter((id) => map.getLayer(id))
      const found = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids })[0] : undefined
      if (found) { const layerId = found.layer.id.replace(/^(fill|line|circle)-/, ''); onSelection(layerId, found as Feature) }
    })
    map.on('draw.create', () => {
      const all = draw.getAll(); const last = all.features.at(-1); if (!last) return
      const suffix = last.geometry.type.includes('Polygon') ? ` · ${turf.area(last).toLocaleString(undefined, { maximumFractionDigits: 0 })} m²` : ''
      addLayer(`Drawing${suffix}`, { type: 'FeatureCollection', features: [last] }, { group: 'Drawings', style: { color: '#0f766e', opacity: .75, width: 3, radius: 6, pattern: 'solid', labelTemplate: '', labelSize: 12 } })
      draw.deleteAll()
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = undefined }
  // Map is intentionally initialized once; store updates are synced below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { const map = mapRef.current; if (!map || styledBasemap.current === basemap) return; styledBasemap.current = basemap; map.setStyle(rasterStyle(base.tile, base.attribution)); map.once('styledata', () => syncLayers(map)) }, [basemap, base.tile, base.attribution, syncLayers])
  useEffect(() => { const map = mapRef.current; if (!map) return; if (map.isStyleLoaded()) syncLayers(map); else map.once('load', () => syncLayers(map)) }, [syncLayers])
  return <div ref={container} className="map-canvas" aria-label="Interactive map" />
}

function LayerTree({ onStyle, onTable }: { onStyle: (l: GisLayer) => void; onTable: (l: GisLayer) => void }) {
  const { layers, activeLayerId, setActive, updateLayer, removeLayer, reorder } = useGisStore(); const [closed, setClosed] = useState<Record<string, boolean>>({})
  const groups = useMemo(() => layers.reduce<Record<string, GisLayer[]>>((all, layer) => {
    const group = layer.group || 'My layers'; (all[group] ??= []).push(layer); return all
  }, {}), [layers])
  if (!layers.length) return <div className="empty-state"><Layers3 size={32}/><strong>Your map is ready</strong><span>Drop a GIS file here or add a public dataset.</span></div>
  return <div className="layer-tree">{Object.entries(groups).map(([group, items]) => <div className="layer-group" key={group}>
    <button className="group-title" onClick={() => setClosed((v) => ({ ...v, [group]: !v[group] }))}>{closed[group] ? <ChevronRight/> : <ChevronDown/>}<Folder/> <span>{group}</span><em>{items?.length}</em></button>
    {!closed[group] && items?.map((layer) => <div className={`layer-row ${activeLayerId === layer.id ? 'active' : ''}`} key={layer.id} onClick={() => setActive(layer.id)}>
      <GripVertical className="grip"/><button className="icon-btn" title={layer.visible ? 'Hide layer' : 'Show layer'} onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }) }}>{layer.visible ? <Eye/> : <EyeOff/>}</button>
      <span className="swatch" style={{ background: layer.style.color, opacity: layer.style.opacity }} /><div className="layer-copy"><strong>{layer.name}</strong><span>{layer.data.features.length.toLocaleString()} features</span></div>
      <div className="row-actions"><button title="Style" onClick={(e) => { e.stopPropagation(); onStyle(layer) }}><Paintbrush/></button><button title="Attribute table" onClick={(e) => { e.stopPropagation(); onTable(layer) }}><Table2/></button><button title="Move up" onClick={(e) => { e.stopPropagation(); reorder(layer.id, 1) }}><MoveUp/></button><button title="Move down" onClick={(e) => { e.stopPropagation(); reorder(layer.id, -1) }}><MoveDown/></button><button title="Delete" onClick={(e) => { e.stopPropagation(); removeLayer(layer.id) }}><Trash2/></button></div>
    </div>)}
  </div>)}</div>
}

function StylePanel({ layer, onClose }: { layer: GisLayer; onClose: () => void }) {
  const update = useGisStore((s) => s.updateLayer); const patchStyle = (patch: Partial<LayerStyle>) => update(layer.id, { style: { ...layer.style, ...patch } })
  const fields = Object.keys(layer.data.features[0]?.properties ?? {})
  return <aside className="drawer style-drawer"><header><div><span className="eyebrow">Layer design</span><h2>{layer.name}</h2></div><button className="icon-btn" onClick={onClose}><X/></button></header>
    <section><label>Color</label><div className="color-grid">{COLORS.map((c) => <button key={c} className={c === layer.style.color ? 'selected' : ''} style={{ background: c }} onClick={() => patchStyle({ color: c })}/>) }<input type="color" value={layer.style.color} onChange={(e) => patchStyle({ color: e.target.value })}/></div></section>
    <section><div className="label-line"><label>Opacity</label><output>{Math.round(layer.style.opacity * 100)}%</output></div><input type="range" min="0" max="1" step=".05" value={layer.style.opacity} onChange={(e) => patchStyle({ opacity: +e.target.value })}/></section>
    <section><label>Polygon fill</label><div className="segmented">{(['solid','diagonal','crosshatch','dots'] as Pattern[]).map((p) => <button className={layer.style.pattern === p ? 'on' : ''} onClick={() => patchStyle({ pattern: p })} key={p}>{p}</button>)}</div></section>
    <section><div className="label-line"><label>Stroke width</label><output>{layer.style.width}px</output></div><input type="range" min="0" max="12" step=".5" value={layer.style.width} onChange={(e) => patchStyle({ width: +e.target.value })}/></section>
    <section><label>Label recipe</label><p className="helper">Combine fields and text, like <code>{'{OWNER}'}</code> · <code>{'{ACRES}'} acres</code>.</p><input className="text-input" value={layer.style.labelTemplate} placeholder="{NAME} · {ACRES} acres" onChange={(e) => patchStyle({ labelTemplate: e.target.value })}/><div className="field-chips">{fields.slice(0, 20).map((f) => <button key={f} onClick={() => patchStyle({ labelTemplate: `${layer.style.labelTemplate}{${f}}` })}>{f}</button>)}</div></section>
  </aside>
}

function AttributeTable({ layer, onClose, onDuplicate }: { layer: GisLayer; onClose: () => void; onDuplicate: (features: Feature[]) => void }) {
  const update = useGisStore((s) => s.updateLayer); const fields = useMemo(() => [...new Set(layer.data.features.flatMap((f) => Object.keys(f.properties ?? {})))].slice(0, 40), [layer])
  const selected = new Set(layer.selectedIds.map(String)); const toggle = (feature: Feature, index: number) => { const id = String(feature.id ?? feature.properties?.OBJECTID ?? index); const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); update(layer.id, { selectedIds: [...next] }) }
  const selectedFeatures = layer.data.features.filter((f, i) => selected.has(String(f.id ?? f.properties?.OBJECTID ?? i)))
  return <section className="attribute-panel"><header><div><span className="eyebrow">Attribute table</span><h2>{layer.name}</h2></div><div className="table-tools"><span>{selected.size} of {layer.data.features.length} selected</span><button className="soft-btn" disabled={!selected.size} onClick={() => onDuplicate(selectedFeatures)}><Copy/> Duplicate selection</button><button className="icon-btn" onClick={onClose}><X/></button></div></header>
    <div className="table-wrap"><table><thead><tr><th></th><th>#</th>{fields.map((f) => <th key={f}>{f}</th>)}</tr></thead><tbody>{layer.data.features.slice(0, 1000).map((feature, i) => { const id = String(feature.id ?? feature.properties?.OBJECTID ?? i); return <tr key={id} className={selected.has(id) ? 'selected' : ''} onClick={() => toggle(feature, i)}><td><input type="checkbox" readOnly checked={selected.has(id)}/></td><td>{i + 1}</td>{fields.map((f) => <td key={f}>{String(feature.properties?.[f] ?? '')}</td>)}</tr> })}</tbody></table></div>
  </section>
}

function DataCatalog({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, url: string, layerId?: number, color?: string, group?: string) => Promise<void> }) {
  const [search, setSearch] = useState(''); const [custom, setCustom] = useState(false); const [name, setName] = useState('Web layer'); const [url, setUrl] = useState(''); const [busy, setBusy] = useState('')
  const results = DATA_CATALOG.filter((i) => `${i.name} ${i.provider} ${i.category} ${i.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()))
  const add = async (item: typeof DATA_CATALOG[number]) => { setBusy(item.id); try { await onAdd(item.name, item.serviceUrl, item.layerId, item.color, `Public data / ${item.category}`) } finally { setBusy('') } }
  return <aside className="drawer catalog-drawer"><header><div><span className="eyebrow">Data library</span><h2>Find public data</h2></div><button className="icon-btn" onClick={onClose}><X/></button></header>
    <div className="search-box"><Search/><input autoFocus placeholder="Search roads, parcels, pipelines…" value={search} onChange={(e) => setSearch(e.target.value)}/><kbd>⌘ K</kbd></div>
    <button className="wide-btn" onClick={() => setCustom(!custom)}><Plus/> Add a service URL <ChevronDown/></button>
    {custom && <div className="custom-source"><input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Layer name"/><input className="text-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="GeoJSON or ArcGIS FeatureServer URL"/><button className="primary-btn" disabled={!url} onClick={() => onAdd(name, url)}>Connect layer</button></div>}
    <div className="catalog-meta"><span>{results.length} trusted sources</span><span>Live agency services</span></div>
    <div className="catalog-list">{results.map((item) => <article key={item.id}><div className="catalog-icon" style={{ color: item.color, background: `${item.color}18` }}><Database/></div><div><span className="pill">{item.category}</span><h3>{item.name}</h3><p>{item.description}</p><small>{item.provider}</small></div><button className="add-circle" disabled={!!busy} onClick={() => add(item)}>{busy === item.id ? <span className="spinner"/> : <Plus/>}</button></article>)}</div>
    <footer className="disclaimer">Public services can change or limit records. Always confirm boundaries and rights with the authoritative agency.</footer>
  </aside>
}

function MeasureCard({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const isPoly = feature.geometry?.type.includes('Polygon'); const area = isPoly ? turf.area(feature) : 0
  const line = feature.geometry?.type.includes('LineString') ? turf.length(feature as never, { units: 'miles' }) : isPoly ? turf.length(turf.polygonToLine(feature as never) as never, { units: 'miles' }) : 0
  return <div className="measure-card"><header><Ruler/><strong>Live measurement</strong><button onClick={onClose}><X/></button></header>{isPoly && <><div className="big-measure">{(area / 4046.8564224).toLocaleString(undefined, { maximumFractionDigits: 3 })}<span>acres</span></div><div className="measure-grid"><span>{(area * 10.7639).toLocaleString(undefined, { maximumFractionDigits: 0 })}<small>sq ft</small></span><span>{area.toLocaleString(undefined, { maximumFractionDigits: 0 })}<small>sq m</small></span><span>{(area / 1e4).toFixed(3)}<small>hectares</small></span></div></>}<div className="measure-foot">Boundary length <strong>{line.toFixed(3)} mi</strong></div></div>
}

export default function App() {
  const { layers, addLayer, mapName, setMapName, basemap, setBasemap } = useGisStore()
  const fileInput = useRef<HTMLInputElement>(null); const [leftOpen, setLeftOpen] = useState(true); const [catalog, setCatalog] = useState(false); const [styleLayer, setStyleLayer] = useState<GisLayer>(); const [tableLayer, setTableLayer] = useState<GisLayer>(); const [coords, setCoords] = useState('31.100000°, -98.700000°'); const [toast, setToast] = useState(''); const [dragging, setDragging] = useState(false); const [selected, setSelected] = useState<Feature>(); const [context, setContext] = useState<{x:number;y:number;lng:number;lat:number}>(); const [baseOpen, setBaseOpen] = useState(false); const [exportOpen, setExportOpen] = useState(false); const [searching, setSearching] = useState(false); const [query, setQuery] = useState('')
  const liveStyle = styleLayer ? layers.find((l) => l.id === styleLayer.id) : undefined; const liveTable = tableLayer ? layers.find((l) => l.id === tableLayer.id) : undefined
  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(''), 3500) }
  const handleFiles = async (files: FileList | File[]) => { for (const file of Array.from(files)) { try { const data = await importGeoFile(file); addLayer(file.name.replace(/\.[^.]+$/, ''), data); notify(`Added ${data.features.length.toLocaleString()} features from ${file.name}`) } catch (error) { notify(error instanceof Error ? error.message : 'Could not import file') } } }
  const addRemote = async (name: string, url: string, layerId = 0, color = COLORS[layers.length % COLORS.length], group = 'Web layers') => { try { const data = await fetchGeoData(url, layerId); addLayer(name, data, { group, source: url, style: { color, opacity: .75, width: 2.5, radius: 5, pattern: 'solid', labelTemplate: '', labelSize: 12 } }); notify(`Added ${data.features.length.toLocaleString()} ${name} features`) } catch (e) { notify(`${name}: ${e instanceof Error ? e.message : 'service unavailable'}`) } }
  const duplicate = (features: Feature[]) => { if (!liveTable) return; addLayer(`${liveTable.name} — selection`, { type: 'FeatureCollection', features }, { group: 'Selections', style: { ...liveTable.style, color: COLORS[layers.length % COLORS.length] } }); notify('Selection duplicated into a new layer') }
  const searchMap = async (e: React.FormEvent) => { e.preventDefault(); if (!query.trim()) return; setSearching(true); try { const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`); const result = (await res.json())[0]; if (!result) notify('No matching place found'); else { const marker: Feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [+result.lon, +result.lat] }, properties: { name: result.display_name } }; addLayer(`Search: ${query}`, { type: 'FeatureCollection', features: [marker] }, { group: 'Search results' }); notify(result.display_name) } } catch { notify('Search is temporarily unavailable') } finally { setSearching(false) } }
  const saveLocal = () => { localStorage.setItem('terrasketch-project', JSON.stringify({ mapName, basemap, layers })); notify('Map saved in this browser') }
  const loadSample = () => { const poly = turf.polygon([[[-97.78,30.19],[-97.51,30.19],[-97.51,30.39],[-97.78,30.39],[-97.78,30.19]]], { NAME: 'Austin study area', ACRES: 10291 }); addLayer('Austin study area', { type: 'FeatureCollection', features: [poly] }, { group: 'Example', style: { color: '#f97316', opacity: .72, width: 3, radius: 5, pattern: 'diagonal', labelTemplate: '{NAME}', labelSize: 13 } }) }

  // Restore only once on startup; store actions are stable Zustand references.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const saved = localStorage.getItem('terrasketch-project'); if (!saved) return; try { const parsed = JSON.parse(saved); if (Array.isArray(parsed.layers) && !layers.length) parsed.layers.forEach((l: GisLayer) => addLayer(l.name, l.data, l)); if (parsed.mapName) setMapName(parsed.mapName); if (parsed.basemap) setBasemap(parsed.basemap) } catch { /* ignore old projects */ } }, [])
  useEffect(() => { const handler = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveLocal() } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCatalog(true) } if (e.key === 'Escape') { setContext(undefined); setBaseOpen(false) } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) })

  return <main className="app-shell" onDragEnter={(e) => { e.preventDefault(); setDragging(true) }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }} onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}>
    <header className="topbar"><div className="brand"><button className="icon-btn mobile-menu" onClick={() => setLeftOpen(!leftOpen)}><Menu/></button><div className="brand-mark"><MapIcon/></div><span>TerraSketch</span><em>GIS</em></div><div className="crumb"><span>My maps</span><ChevronRight/><input value={mapName} onChange={(e) => setMapName(e.target.value)}/><span className="saved"><span/>Saved</span></div><div className="top-actions"><button className="ghost-btn"><Undo2/></button><button className="ghost-btn"><Redo2/></button><button className="soft-btn" onClick={saveLocal}><Save/> Save</button><div className="export-menu"><button className="primary-btn" disabled={!layers.length} onClick={() => setExportOpen(!exportOpen)}><Download/> Export <ChevronDown/></button>{exportOpen && layers[0] && <div className="export-popover"><small>Export top layer</small><strong>{layers[0].name}</strong><button onClick={() => exportGeoJSON(layers[0].data, layers[0].name)}>GeoJSON <span>.geojson</span></button><button onClick={() => exportKml(layers[0].data, layers[0].name)}>Google Earth <span>.kml</span></button><button onClick={() => exportKml(layers[0].data, layers[0].name, true)}>Google Earth archive <span>.kmz</span></button><button onClick={() => exportShapefile(layers[0].data, layers[0].name)}>ESRI Shapefile <span>.zip</span></button></div>}</div><button className="avatar">JG</button></div></header>
    <div className="workspace">
      {leftOpen && <aside className="left-panel"><div className="panel-tabs"><button className="active"><Layers3/>Layers</button><button onClick={() => setCatalog(true)}><Database/>Data</button><button><Zap/>Tools</button></div><div className="panel-head"><div><span className="eyebrow">Map content</span><h2>Layers</h2></div><button className="icon-btn" onClick={() => setCatalog(true)}><Plus/></button></div><LayerTree onStyle={setStyleLayer} onTable={setTableLayer}/><div className="panel-bottom"><button className="primary-btn wide" onClick={() => fileInput.current?.click()}><FileUp/> Import data</button><button className="soft-btn wide" onClick={() => setCatalog(true)}><Database/> Browse public data</button><input ref={fileInput} hidden type="file" multiple accept=".geojson,.json,.kml,.kmz,.zip,.shp,.gpx,.csv" onChange={(e) => e.target.files && handleFiles(e.target.files)}/>{!layers.length && <button className="sample-link" onClick={loadSample}><Sparkles/> Try an example layer</button>}</div></aside>}
      <section className="map-stage"><div className="map-search"><form onSubmit={searchMap}><Search/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search places or coordinates"/><kbd>↵</kbd>{searching && <span className="spinner"/>}</form></div><div className="floating-left"><button onClick={() => setLeftOpen(!leftOpen)}><Layers3/><span>{layers.length}</span></button><button onClick={() => fileInput.current?.click()}><Plus/></button></div><div className="floating-base"><button onClick={() => setBaseOpen(!baseOpen)}><span className={`base-thumb ${basemap}`}/><div><small>Basemap</small><strong>{BASEMAPS.find((b) => b.id === basemap)?.name}</strong></div><ChevronDown/></button>{baseOpen && <div className="base-menu">{BASEMAPS.map((b) => <button className={b.id === basemap ? 'active' : ''} key={b.id} onClick={() => { setBasemap(b.id); setBaseOpen(false) }}><span className={`base-thumb ${b.id}`}/>{b.name}</button>)}</div>}</div><MapCanvas onCoordinates={setCoords} onSelection={(layerId, feature) => { useGisStore.getState().setActive(layerId); setSelected(feature) }} onContext={(x,y,lng,lat) => setContext({x,y,lng,lat})}/><div className="coordinate-bar"><MapPin/>{coords}<span>WGS 84</span></div><div className="map-status"><span><span className="status-dot"/> Online data</span><span>{layers.reduce((n,l) => n + l.data.features.length, 0).toLocaleString()} features</span></div>
        {selected && <MeasureCard feature={selected} onClose={() => setSelected(undefined)}/>} {context && <div className="context-menu" style={{ left: context.x, top: context.y }}><div className="context-coord">{context.lat.toFixed(5)}, {context.lng.toFixed(5)}</div><button onClick={() => { navigator.clipboard.writeText(`${context.lat}, ${context.lng}`); setContext(undefined); notify('Coordinates copied') }}><Copy/> Copy coordinates</button><button onClick={() => { const point = turf.point([context.lng, context.lat], { name: 'Dropped pin' }); addLayer('Dropped pin', { type:'FeatureCollection', features:[point] }, { group:'Drawings' }); setContext(undefined) }}><MapPin/> Drop a pin</button><button onClick={() => { setCatalog(true); setContext(undefined) }}><Database/> Find data here</button></div>}
      </section>
      {liveStyle && <StylePanel layer={liveStyle} onClose={() => setStyleLayer(undefined)}/>} {catalog && <DataCatalog onClose={() => setCatalog(false)} onAdd={addRemote}/>} {liveTable && <AttributeTable layer={liveTable} onClose={() => setTableLayer(undefined)} onDuplicate={duplicate}/>} 
    </div>
    {dragging && <div className="drop-zone"><div><FileUp/><h2>Drop spatial data anywhere</h2><p>KML · KMZ · zipped Shapefile · GeoJSON · GPX · CSV</p></div></div>}
    {toast && <div className="toast"><CircleHelp/>{toast}</div>}
  </main>
}
