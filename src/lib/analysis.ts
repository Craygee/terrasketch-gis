import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson'

export type AnalysisOperation = 'buffer' | 'centroids' | 'envelopes' | 'convexHull' | 'dissolve' | 'selectWithin'

export interface AnalysisTool {
  id: AnalysisOperation
  name: string
  description: string
  needsSecondLayer?: boolean
  needsDistance?: boolean
}

export const ANALYSIS_TOOLS: AnalysisTool[] = [
  { id: 'buffer', name: 'Buffer', description: 'Create setback, service, or impact zones around features.', needsDistance: true },
  { id: 'centroids', name: 'Feature centers', description: 'Create one representative center point per feature.' },
  { id: 'envelopes', name: 'Bounding boxes', description: 'Create the smallest rectangular extent around every feature.' },
  { id: 'convexHull', name: 'Convex hull', description: 'Wrap all features in the smallest convex study boundary.' },
  { id: 'dissolve', name: 'Dissolve polygons', description: 'Merge overlapping polygon features into one geometry.' },
  { id: 'selectWithin', name: 'Select by location', description: 'Copy features that intersect polygons in another layer.', needsSecondLayer: true },
]

export function runAnalysis(operation: AnalysisOperation, source: FeatureCollection, options: { distance?: number; units?: turf.Units; overlay?: FeatureCollection } = {}): FeatureCollection {
  if (!source.features.length) throw new Error('The source layer has no features.')
  if (operation === 'buffer') {
    const features = source.features.map((feature) => turf.buffer(feature, options.distance ?? 1, { units: options.units ?? 'miles' })).filter(Boolean) as Feature<Polygon | MultiPolygon>[]
    return turf.featureCollection(features)
  }
  if (operation === 'centroids') return turf.featureCollection(source.features.map((feature) => turf.centroid(feature, { ...feature.properties })))
  if (operation === 'envelopes') return turf.featureCollection(source.features.map((feature) => turf.envelope(feature)))
  if (operation === 'convexHull') {
    const hull = turf.convex(turf.featureCollection(source.features.flatMap((feature) => turf.explode(feature).features)))
    if (!hull) throw new Error('A convex hull needs at least three distinct points.')
    return turf.featureCollection([hull])
  }
  if (operation === 'dissolve') {
    const polygons = source.features.filter((f) => f.geometry?.type === 'Polygon') as Feature<Polygon>[]
    if (!polygons.length) throw new Error('Dissolve needs polygon features.')
    let merged: Feature<Polygon | MultiPolygon> = polygons[0]
    for (const polygon of polygons.slice(1)) merged = turf.union(turf.featureCollection([merged, polygon])) ?? merged
    return turf.featureCollection([merged])
  }
  if (operation === 'selectWithin') {
    if (!options.overlay?.features.length) throw new Error('Choose an overlay polygon layer.')
    const selected = source.features.filter((feature) => options.overlay!.features.some((mask) => {
      try { return turf.booleanIntersects(feature, mask) } catch { return false }
    }))
    return turf.featureCollection(selected)
  }
  throw new Error('Unknown analysis operation.')
}
