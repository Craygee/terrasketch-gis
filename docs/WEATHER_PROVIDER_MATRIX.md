# Weather provider matrix

Research checked 2026-09-11. Endpoints must be health-checked and reverified before production use.
This matrix records candidates; it is not permission to use restricted data commercially.

| Provider/product | Coverage | Typical update | Access and license | Phase 1 decision |
| --- | --- | --- | --- | --- |
| [NWS API](https://www.weather.gov/documentation/services-web-api) alerts, point metadata and forecasts | United States and territories | Alerts are event driven; NWS asks clients not to request alerts more often than every 30 seconds | Official U.S. government API; identify the application and preserve source metadata | Enabled through the LandDraft server gateway for alerts and point forecasts |
| [NWS public-cloud GIS services](https://www.weather.gov/gis/cloudgiswebservices) | Primarily U.S. | Product dependent | Official WMS/WFS/WCS catalog; service/product names must be selected from the live catalog | Registry/provider boundary only until product-specific QA is complete |
| [NOAA NEXRAD Level II/III on AWS](https://registry.opendata.aws/noaa-nexrad/) | U.S. radar network | New objects as available | NOAA open data; attribution requested; current Level II archive bucket is `unidata-nexrad-level2` | Ingestion architecture documented; browser does not download raw national archives |
| [NOAA GOES-R imagery/data](https://www.nesdis.noaa.gov/satellite-imagery-and-data-links) | GOES sectors | Product/scan dependent | Official NOAA links; informational viewers are not operational feeds | Satellite registry entry; tiled/processed ingestion deferred |
| [NHC GIS](https://www.nhc.noaa.gov/gis/) | Atlantic, East/Central Pacific products issued by NHC | Advisory cycle | Official tracks, cones, wind radii and warnings in GIS formats | Tropical adapter planned for Phase 2/3 |
| [SPC products](https://www.spc.noaa.gov/products/) | CONUS | Product dependent | Official outlook/watch/mesoscale products; each product needs format and refresh review | Severe adapter planned after NWS warning foundation |
| [Aviation Weather Center API](https://aviationweather.gov/data/api/) | Global METAR/TAF/SIGMET with product-specific limits | One minute to hourly, depending on product | Official API; 100 requests/minute, bounded queries, custom user agent; no browser CORS | Server adapter planned for Aviation phase |
| [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data) | Global | Model run dependent | Open subset under current ECMWF terms/CC BY 4.0 products; processing/egress required | Model-ingestion candidate, not directly queried by the UI |
| [Open-Meteo](https://open-meteo.com/en/docs) | Global best-match model forecasts | Model dependent | Data attribution required; free endpoint is for non-commercial evaluation and has no uptime guarantee; commercial endpoint/key required for commercial service | Optional evaluation adapter only, off unless explicitly configured |
| Commercial radar/lightning/model providers | Provider dependent | Seconds to hours | Contract/API key/redistribution terms and costs vary | Adapter slots only; no fabricated endpoint or credential |

## Coverage rules

- NWS alerts are `observed/issued` official products, not LandDraft predictions.
- Model precipitation is never labeled radar. Where radar coverage is unavailable, the UI reports
  `RADAR UNAVAILABLE` and may separately offer a labeled model/satellite product.
- Lightning remains `UNAVAILABLE` until a reviewed real-time provider is configured. Development
  fixtures must carry `DEV DATA` and are rejected outside development/test channels.
- Source, issued/observed time, valid time, received time, age, quality, and provider identity travel
  with every normalized object.

## Potential costs

- NOAA/NWS data is public, but reliable ingestion still consumes worker CPU, cache/object storage,
  bandwidth, monitoring, and engineering support.
- Raw NEXRAD/GOES processing can require significant compute and object storage; use immutable frame
  caching and spatial/temporal tiling rather than client-side bulk downloads.
- Global commercial weather, lightning, low-latency radar, road closures, push/SMS, offline packs,
  and historical archives may carry usage or redistribution fees.
- Open-Meteo's free API is evaluation/non-commercial; production commercial use requires a suitable
  commercial agreement or self-hosted infrastructure plus attribution compliance.

