import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGeoData, isArcGisService, normalizeArcGisUrl } from './importers'

describe('ArcGIS service loading', () => {
  afterEach(() => vi.restoreAllMocks())

  it('builds a bounded, generalized GeoJSON query', () => {
    const request = new URL(normalizeArcGisUrl('https://example.com/FeatureServer', 3, [-101, 28, -94, 34]))
    expect(request.pathname).toBe('/FeatureServer/3/query')
    expect(request.searchParams.get('geometry')).toBe('-101,28,-94,34')
    expect(request.searchParams.get('spatialRel')).toBe('esriSpatialRelIntersects')
    expect(Number(request.searchParams.get('maxAllowableOffset'))).toBeGreaterThan(0)
    expect(request.searchParams.get('f')).toBe('geojson')
  })

  it('recognizes both service and layer URLs', () => {
    expect(isArcGisService('https://example.com/FeatureServer')).toBe(true)
    expect(isArcGisService('https://example.com/FeatureServer/0')).toBe(true)
    expect(isArcGisService('https://example.com/data.geojson')).toBe(false)
  })

  it('surfaces ArcGIS JSON errors returned with HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: { message: 'Invalid query', details: ['Layer unavailable'] } }) }))
    await expect(fetchGeoData('https://example.com/FeatureServer')).rejects.toThrow('Invalid query — Layer unavailable')
  })
})
