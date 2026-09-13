# LandDraft public weather layers

Owner direction: build original LandDraft layers from data suitable for commercial use. External weather subscriptions and companion radar apps are not the core product.

## Implemented in this change

- Six original native radar layers from NOAA Level III: reflectivity, radial velocity, correlation coefficient, differential reflectivity, specific differential phase and hydrometeor classification. Public NODD objects are proxied through a fixed, bounded endpoint; the browser worker decompresses packet-16 radial scans, applies physical scales, reprojects polar gates to Web Mercator and produces LandDraft-colored tiles. No vendor-rendered image or credential is involved for these six layers.
- Radar-site selection and four elevation-product selections; actual elevation comes from scan metadata. Up to six available scans per field within one hour support playback. Gate inspection includes units, missing/range-folded state, time, distance and estimated beam-center height above mean sea level. Site/time mismatches, malformed products, decompression limits and corrupt compression fail closed.
- NOAA data remains attributed to NOAA/NWS; LandDraft rendering is identified separately. The bundled MIT compression and buffer dependency notices ship at `/radar-open-source-notices.txt`.
- The active layer catalog, point API and radar fallback no longer select Xweather. The workspace no longer requests its connection state or opens its sign-in dialog. Existing credential storage and legacy proxy code remain isolated for compatibility; this change does not delete user credentials.
- Public layers can be discovered before data is loaded. Unavailable adapters remain identified as unavailable.
- Seven original LandDraft rainfall renderings: 1, 3, 6, 12, 24, 48 and 72 hours. The layer definitions, thresholds, palette, inspection and freshness rules belong to LandDraft; NOAA supplies the numeric MRMS grids.
- The NOAA catalog is queried for rasters covering the inspected point. Each accumulation is locked to advertised raster IDs and a real end time. Grids older than two hours or with invalid/future times are rejected. Different regional update times are not combined.
- Raster Remap and Colormap processing renders LandDraft's scale through NOAA's public image service. This is not yet a LandDraft-hosted GRIB decoder or tile service.
- Point sampling preserves zero, rejects missing/sentinel values and converts raw millimetres into inches. The inspector also supports metric display. Rainfall is an estimate at approximately 1 km resolution, not a parcel measurement or flood depth.
- Latest accumulations are excluded from historical/forecast playback and from observed playback before the accumulation end time. Public provider controls apply to these new layers.

## Source and unit evidence

Reviewed 2026-09-13:

- [NEXRAD NODD distribution and use terms](https://registry.opendata.aws/noaa-nexrad/): NOAA data is openly reusable, with attribution and no implication of endorsement. Native Level III source is `unidata-nexrad-level3.s3.amazonaws.com`; current products are N0B/N0G/N0C/N0X/N0K/N0H and elevation variants N1–N3. Product codes 153/154/161/159/163/165 and packet-16 scaling were cross-checked against [Unidata MetPy's Level III reader](https://github.com/Unidata/MetPy/blob/main/src/metpy/io/nexrad.py).
- [NWS use terms](https://www.weather.gov/disclaimer): NOAA/NWS-origin data is public domain unless otherwise specified; retain attribution, do not imply endorsement, and identify modified material. Third-party inputs require their own permission.
- [MRMS QPE service](https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer): radar-only accumulations for CONUS, Alaska, Hawaii and Puerto Rico; generally updated hourly. The catalog provides `idp_validendtime` and `idp_subset`.
- [NOAA usage tutorial](https://www.weather.gov/gis/mrms_data_quick_tutorial): explains selecting the matching raster and renderer. Its description of displayed inches does not establish the units returned by an unrendered pixel query.
- Live unit cross-check: at longitude -90, latitude 35, the 48-hour grid ending 2026-09-13 18:00 UTC returned raw `18.300001144`. NOAA's `rft_48hr` image at the same point matched its `0.50–0.75 inch` legend swatch. Dividing by 25.4 gives 0.72047 inches. Both LandDraft thresholds and inspector apply this conversion; treating raw values as inches was rejected during verification.
- [Raster function specification](https://developers.arcgis.com/rest/services-reference/enterprise/raster-function-objects/): documents custom Remap/Colormap processing on an image service. No Esri SDK or user account is required for these NOAA endpoints.

Run `node --experimental-strip-types scripts/check-public-rainfall.mjs` for live metadata, sample and PNG checks, and `node scripts/check-native-radar.mjs` for live six-field decoding, tile rendering and corruption checks. Local evidence goes to ignored `.weather-validation/`. Offline tests cover freshness, accumulation selection, timestamp isolation, units, missing samples, playback, decoder bounds and public-only catalog routing. A separate browser harness verified the actual compiled worker for all six NOAA scans dated 2026-09-13 19:28:53 UTC, including PNG tiles and numeric inspections. This is not independent meteorological certification.

## Hosted verification, 2026-09-13

Deployed source revision `7bdab2c` to `https://landdraft-test.tight-sky-0ae1.workers.dev/weather`; Worker version `3c41d6c6-f074-4f92-ad04-0efcf1052f61`. The public scan proxy returned HTTP 200 with a fresh 305,771-byte NOAA reflectivity product. Browser verification confirmed the native KGRK map overlay and a clicked gate reading of -10.0 dBZ at 30.76341, -97.22559, scan time 21:16:16 UTC, elevation 0.5°, distance 15.7 km and estimated beam center 335 m MSL. Eighty-one weather tests, type checking and build passed; lint has zero errors and nine existing warnings. Production and database schema were not changed.

## Remaining work toward a superior weather tool

This release does not establish superiority over professional radar applications. Native Level III discovery, decoding, georeferencing, elevation selection and raw-value inspection are implemented. Remaining substantial work includes durable ingestion and historical storage, Level II full-volume/3D inspection, storm-relative velocity with verified storm-motion inputs, and an independently operated MRMS GRIB tile pipeline. Shared public endpoints and an in-memory bounded cache are suitable for this test beta, not a guaranteed production SLA.

For forecast fields, process NOAA NDFD/HRRR grids with issue time, valid time, units and accumulation semantics preserved. GOES ABI/GLM should have separate adapters and accurate spatial resolution; satellite lightning is not interchangeable with proprietary ground-strike locations. Confirm each product's origin and operational/experimental status before enabling commercial redistribution.

Differentiate LandDraft with project-specific exposure: intersect official warning areas with project geometry, summarize rainfall across sites rather than a single point, and retain exportable source/time evidence. Do not infer flood depth, structural damage or safe routes from rainfall alone.

Before production scale, add a managed ingestion/cache tier, monitoring and measured request budgets. Public data is free; processing, bandwidth, storage and uptime still cost money. Shared public services are not a guaranteed low-latency production backend. Benchmark rendering speed, frame completeness, age and numerical accuracy before making comparative claims.
