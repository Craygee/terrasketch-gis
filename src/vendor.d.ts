declare module 'tokml' {
  import type { FeatureCollection } from 'geojson'
  export default function tokml(data: FeatureCollection, options?: Record<string, unknown>): string
}

declare module 'togeojson' {
  import type { FeatureCollection } from 'geojson'
  export function kml(doc: Document): FeatureCollection
  export function gpx(doc: Document): FeatureCollection
}

declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson'
  export default function shp(data: ArrayBuffer): Promise<FeatureCollection | FeatureCollection[]>
}

declare module '@mapbox/shp-write' {
  import type { FeatureCollection } from 'geojson'
  const shpwrite: { download(data: FeatureCollection, options?: Record<string, unknown>): void }
  export default shpwrite
}
