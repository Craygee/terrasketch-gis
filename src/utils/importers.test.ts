import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGeoData, isFeatureService, normalizeFeatureServiceUrl } from './importers'

describe('feature-service loading', () => {
  afterEach(() => vi.restoreAllMocks())

  it('builds a bounded, generalized GeoJSON query', () => {
    const request = new URL(normalizeFeatureServiceUrl('https://example.com/FeatureServer', 3, [-101, 28, -94, 34]))
    expect(request.pathname).toBe('/FeatureServer/3/query')
    expect(request.searchParams.get('geometry')).toBe('-101,28,-94,34')
    expect(request.searchParams.get('spatialRel')).toBe('esriSpatialRelIntersects')
    expect(Number(request.searchParams.get('maxAllowableOffset'))).toBeGreaterThan(0)
    expect(request.searchParams.get('f')).toBe('geojson')
  })

  it('recognizes both service and layer URLs', () => {
    expect(isFeatureService('https://example.com/FeatureServer')).toBe(true)
    expect(isFeatureService('https://example.com/FeatureServer/0')).toBe(true)
    expect(isFeatureService('https://example.com/data.geojson')).toBe(false)
  })

  it('surfaces JSON service errors returned with HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: { message: 'Invalid query', details: ['Layer unavailable'] } }) }))
    await expect(fetchGeoData('https://example.com/FeatureServer')).rejects.toThrow('Invalid query — Layer unavailable')
  })
})
