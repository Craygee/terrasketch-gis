import { describe, expect, it } from 'vitest'
import * as turf from '@turf/turf'
import { runAnalysis } from './analysis'

describe('runAnalysis', () => {
  const points = turf.featureCollection([
    turf.point([-97.75, 30.26], { name: 'Austin' }),
    turf.point([-96.8, 32.78], { name: 'Dallas' }),
    turf.point([-95.37, 29.76], { name: 'Houston' }),
  ])

  it('creates one buffered polygon per source feature', () => {
    const result = runAnalysis('buffer', points, { distance: 1, units: 'miles' })
    expect(result.features).toHaveLength(3)
    expect(result.features.every((feature) => feature.geometry.type === 'Polygon')).toBe(true)
  })

  it('builds a single convex study boundary', () => {
    const result = runAnalysis('convexHull', points)
    expect(result.features).toHaveLength(1)
    expect(result.features[0].geometry.type).toBe('Polygon')
  })

  it('selects only features intersecting an overlay', () => {
    const overlay = turf.featureCollection([turf.polygon([[[-98, 30], [-97.5, 30], [-97.5, 30.5], [-98, 30.5], [-98, 30]]])])
    const result = runAnalysis('selectWithin', points, { overlay })
    expect(result.features.map((feature) => feature.properties?.name)).toEqual(['Austin'])
  })
})
