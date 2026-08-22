import type { FeatureCollection } from 'geojson'

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportGeoJSON(data: FeatureCollection, name: string) {
  save(new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' }), `${name}.geojson`)
}

export async function exportKml(data: FeatureCollection, name: string, kmz = false) {
  const { default: tokml } = await import('tokml')
  const text = tokml(data, { name: 'name', description: 'description', simplestyle: true })
  if (!kmz) return save(new Blob([text], { type: 'application/vnd.google-earth.kml+xml' }), `${name}.kml`)
  const { zipSync, strToU8 } = await import('fflate')
  const bytes = zipSync({ 'doc.kml': strToU8(text) })
  save(new Blob([bytes as BlobPart], { type: 'application/vnd.google-earth.kmz' }), `${name}.kmz`)
}

export async function exportShapefile(data: FeatureCollection, name: string) {
  const { default: shpwrite } = await import('@mapbox/shp-write')
  shpwrite.download(data, { outputType: 'blob', compression: 'DEFLATE', folder: name, filename: name })
}
