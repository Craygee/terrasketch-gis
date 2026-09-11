# Weather provider setup and promotion

Updated: 2026-09-11  
Pricing: undecided  
Environment: test feature branch and public preview only

## Already connected — no key required

The NWS API, NOAA/NWS GIS and MRMS services, NOAA nowCOAST satellite/lightning-density services,
Aviation Weather Center METAR API and MET Norway Locationforecast adapter are configured in code.
Users do not need to paste URLs or create accounts for these layers.

If one of these says `CONNECTION ERROR`, inspect **Weather → Data sources**. `NO DATA HERE` should be
reserved for a successful connection that has no product covering the inspected point/time.

## What “Setup required” means

These entries have a stable LandDraft layer/capability id but do not yet have a reviewed production
adapter. Setup is an engineering and licensing task, not an end-user URL field:

| Capability                          | Recommended route                                              | Dependency / possible cost                                              |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Individual global lightning strikes | Licensed Xweather/Tomorrow.io-class feed after contract review | API credentials, redistribution rights and usage fees                   |
| Global/commercial radar             | Commercial tiled radar feed or regional official adapters      | Contract and tile/egress costs                                          |
| Professional radar moments          | NOAA Level II/III ingestion and radar-site processing          | Compute, object storage, tiling and monitoring                          |
| Upper-air/convective/model grids    | ECMWF Open Data or other licensed model ingestion              | GRIB processing, object storage, CDN/egress; attribution                |
| Soundings/hodographs                | Observed/model sounding adapter plus validated calculations    | Processing and numerical-validation work                                |
| Storm objects/rotation              | Phase 2 normalization and carefully validated derived analysis | Engineering/QA; never upgrade algorithmic rotation to confirmed tornado |
| Historical weather                  | NCEI/other archive ingestion                                   | Archive storage, indexing and possibly commercial historical feeds      |

## Test versus production

- Code, normalized contracts and non-secret provider configuration move with the Git commit when the
  feature branch is reviewed and merged.
- API keys and other secrets **do not transfer automatically**. This is intentional environment
  isolation. Store test credentials only as secrets on the `landdraft-preview` Worker.
- If a provider is approved for release, add its production credential separately to the production
  deployment during the coordinated release. Never copy a key into frontend code or Git.
- Database/provider-status migrations, organization controls, billing and production infrastructure
  require administration/billing coordination before merge.

## Adapter checklist

Before a provider changes from `SETUP REQUIRED` to available:

1. Confirm product definition, geographic coverage, resolution, latency and update cadence.
2. Confirm commercial use, caching, attribution and redistribution rights.
3. Record price units, quotas and expected operating cost; leave LandDraft pricing undecided.
4. Implement a server-side provider adapter and normalized source metadata.
5. Add product-specific cache, timeout, rate limit, health and usage telemetry.
6. Add a vetted equivalent fallback where one exists. Never substitute model precipitation for
   radar or lightning density for individual strikes.
7. Simulate primary-provider failure and verify that stale data cannot say `LIVE`.
8. Test desktop, tablet and narrow mobile layouts before promoting.
