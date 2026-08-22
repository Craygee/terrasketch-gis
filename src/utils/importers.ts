import { unzipSync, strFromU8 } from 'fflate'
import { kml, gpx } from 'togeojson'
import shp from 'shpjs'
import type { FeatureCollection, Feature, Geometry } from 'geojson'

const asCollection = (value: unknown): FeatureCollection => {
  const candidate = value as FeatureCollection | Feature
  if (candidate?.type === 'FeatureCollection') return candidate
  if (candidate?.type === 'Feature') return { type: 'FeatureCollection', features: [candidate] }
  throw new Error('No supported geographic features were found.')
}

export async function importGeoFile(file: File): Promise<FeatureCollection> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.geojson') || name.endsWith('.json')) return asCollection(JSON.parse(await file.text()))
  if (name.endsWith('.kml')) return asCollection(kml(new DOMParser().parseFromString(await file.text(), 'text/xml')))
  if (name.endsWith('.gpx')) return asCollection(gpx(new DOMParser().parseFromString(await file.text(), 'text/xml')))
  if (name.endsWith('.kmz')) {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
    const kmlName = Object.keys(entries).find((key) => key.toLowerCase().endsWith('.kml'))
    if (!kmlName) throw new Error('This KMZ does not contain a KML document.')
    return asCollection(kml(new DOMParser().parseFromString(strFromU8(entries[kmlName]), 'text/xml')))
  }
  if (name.endsWith('.zip')) {
    const parsed = await shp(await file.arrayBuffer())
    if (Array.isArray(parsed)) return { type: 'FeatureCollection', features: parsed.flatMap((item) => item.features) }
    return asCollection(parsed)
  }
  if (name.endsWith('.csv')) {
    const rows = (await file.text()).trim().split(/\r?\n/).map((line) => line.split(',').map((v) => v.trim()))
    const headers = rows.shift() ?? []
    const lat = headers.findIndex((h) => /^(lat|latitude)$/i.test(h)); const lon = headers.findIndex((h) => /^(lon|lng|longitude|x)$/i.test(h))
    if (lat < 0 || lon < 0) throw new Error('CSV needs latitude and longitude columns.')
    const features: Feature[] = rows.map((row, index): Feature => ({
      type: 'Feature' as const, id: index, geometry: { type: 'Point', coordinates: [Number(row[lon]), Number(row[lat])] } as Geometry,
      properties: Object.fromEntries(headers.map((h, i) => [h, row[i]])),
    })).filter((f) => Number.isFinite((f.geometry as {coordinates:number[]}).coordinates[0]))
    return { type: 'FeatureCollection', features }
  }
  if (name.endsWith('.shp')) throw new Error('Drop a ZIP containing the .shp, .dbf, .shx and .prj files together.')
  throw new Error('Supported formats: GeoJSON, KML, KMZ, zipped Shapefile, GPX, and CSV.')
}

export function normalizeArcGisUrl(url: string, layerId = 0, bbox?: [number, number, number, number]) {
  const trimmed = url.replace(/\/$/, '')
  const withLayer = /\/(FeatureServer|MapServer)\/\d+$/i.test(trimmed) ? trimmed : `${trimmed}/${layerId}`
  const params = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'geojson', resultRecordCount: '2000' })
  if (bbox) {
    params.set('geometry', bbox.join(',')); params.set('geometryType', 'esriGeometryEnvelope'); params.set('inSR', '4326'); params.set('spatialRel', 'esriSpatialRelIntersects')
  }
  return `${withLayer}/query?${params}`
}

export async function fetchGeoData(url: string, layerId = 0, bbox?: [number, number, number, number]): Promise<FeatureCollection> {
  const requestUrl = /\/(FeatureServer|MapServer)(\/\d+)?\/?$/i.test(url) ? normalizeArcGisUrl(url, layerId, bbox) : url
  const response = await fetch(requestUrl)
  if (!response.ok) throw new Error(`Data service returned ${response.status}.`)
  return asCollection(await response.json())
}
