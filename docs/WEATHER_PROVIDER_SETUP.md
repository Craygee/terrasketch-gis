# Weather provider setup and promotion

Updated: 2026-09-11  
Pricing: undecided  
Environment: test feature branch and public preview only

## Already connected — no key required

The NWS API, NOAA/NWS GIS and MRMS services, NOAA RIDGE II single-site radar, NOAA nowCOAST
satellite/lightning-density services, NASA EOSDIS GIBS cloud-top-temperature imagery, Aviation
Weather Center METAR API and MET Norway Locationforecast adapter are configured in code.
Users do not need to paste URLs or create accounts for these layers.

If one of these says `CONNECTION ERROR`, inspect **Weather → Data sources**. `NO DATA HERE` should be
reserved for a successful connection that has no product covering the inspected point/time.

The Weather point request uses a POST server function so its requested-layer list is preserved across
the Vite development server and Cloudflare. Requested NOAA WMS overlays start in parallel with point
conditions/radar, have an independent timeout, and coalesce shared GetCapabilities calls. This keeps
Clouds, Visible Satellite and Lightning from being starved by a slower unrelated provider while still
returning source-specific health and warning information when an overlay genuinely fails.

NOAA nowCOAST currently rejects its GetCapabilities request from Cloudflare's edge with HTTP 403 even
though its browser-facing WMS image tiles remain public and return `Access-Control-Allow-Origin: *`.
For the reviewed nowCOAST satellite and lightning-density layer names only, LandDraft therefore falls
back to the service's latest image without a `TIME` parameter. The image remains NOAA data, but the UI
marks provider health degraded and does not invent an observation timestamp or animated history. If
GetCapabilities becomes available, the normal verified frame timeline resumes automatically.

## What “Setup required” means

These entries have a stable LandDraft layer/capability id but do not yet have a reviewed production
adapter. Setup is an engineering and licensing task, not an end-user URL field:

| Capability                            | Recommended route                                              | Dependency / possible cost                                              |
| ------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Individual global lightning strikes   | Licensed Xweather/Tomorrow.io-class feed after contract review | API credentials, redistribution rights and usage fees                   |
| Global/commercial radar               | Commercial tiled radar feed or regional official adapters      | Contract and tile/egress costs                                          |
| Additional professional radar moments | NOAA Level II ingestion and radar-site processing              | Compute, object storage, tiling and monitoring                          |
| Upper-air/convective/model grids      | ECMWF Open Data or other licensed model ingestion              | GRIB processing, object storage, CDN/egress; attribution                |
| Soundings/hodographs                  | Observed/model sounding adapter plus validated calculations    | Processing and numerical-validation work                                |
| Storm objects/rotation                | Phase 2 normalization and carefully validated derived analysis | Engineering/QA; never upgrade algorithmic rotation to confirmed tornado |
| Historical weather                    | NCEI/other archive ingestion                                   | Archive storage, indexing and possibly commercial historical feeds      |

## Test versus production

- Code, normalized contracts and non-secret provider configuration move with the Git commit when the
  feature branch is reviewed and merged.
- API keys and other secrets **do not transfer automatically**. This is intentional environment
  isolation. Store test credentials only as secrets on the `landdraft-preview` Worker.
- If a provider is approved for release, add its production credential separately to the production
  deployment during the coordinated release. Never copy a key into frontend code or Git.
- Database/provider-status migrations, organization controls, billing and production infrastructure
  require administration/billing coordination before merge.

## Xweather bring-your-own-account adapter

LandDraft now includes a server-only Xweather Raster Maps adapter for its weather-relevant catalog.
The professional-layer drawer offers 76 verified product choices across radar, current conditions,
wind, forecasts, severe weather, lightning, air quality, fire, maritime, tropical and CPC outlooks.
Xweather base maps, masks and administrative overlays are deliberately excluded because LandDraft
already supplies those as ordinary GIS layers. Browser clients receive only a same-origin LandDraft
tile URL. Each signed-in user connects an Xweather application and its allowance/charges remain on
that Xweather account. LandDraft never requests the user's Xweather password.

The combined API key travels once over HTTPS to the LandDraft Worker, is tested against Xweather,
and its components are AES-GCM encrypted before storage in `weather_provider_connections`. The ciphertext is bound
to the LandDraft user ID. MapLibre adds the user's existing Supabase access token to same-origin
Xweather tile requests; the Worker verifies that session, decrypts only that user's credentials and
proxies the upstream tile. Provider credentials are never returned to the browser, committed to Git,
embedded in a frontend bundle, placed in a public tile URL or written to logs.

Required server-only deployment secret:

```text
XWEATHER_CREDENTIAL_ENCRYPTION_KEY
```

Deployments sharing the same Supabase project must receive the same encryption key so a user's
connection works after promotion. The key is infrastructure configuration, does not enter Git, and
must be backed up in the approved secret manager before production. Apply
`202609110001_user_weather_connections.sql` before enabling the connection UI. The legacy shared
`XWEATHER_CLIENT_ID` and `XWEATHER_CLIENT_SECRET` bindings are no longer read by the Weather runtime.

Users select **API Keys** in the current Xweather dashboard and copy the combined API key shown
there, or use **Manage your API keys** to create a dedicated key named LandDraft. LandDraft accepts
that complete key and separates its client ID and secret server-side for Raster Maps requests.
Legacy client-ID/secret connection requests remain accepted for backward compatibility. Users can
test, replace and disconnect credentials from **Weather → Data sources**. Disconnect invalidates
the UI immediately;
already-authorized Worker isolates may retain the encrypted credential in memory for at most 30
seconds. Revoking the application in Xweather is the immediate provider-side kill switch.

The connection dialog links directly to **Xweather Weather API — Pay As You Go** signup and the
Weather API dashboard. LandDraft currently consumes the Weather API's **Raster Maps** products; it
does not require customers to choose Xweather Protect, Optimize, Observe or another enterprise
software product.

Cost controls in this increment:

- NOAA remains the free primary U.S. radar source. Xweather is used only after the current LandDraft
  user connects their own Xweather application; there is no site-owner paid fallback.
- Provider tiles are requested only for active layers and the visible viewport.
- Xweather imagery uses private product-specific browser cache headers so one user's paid response is
  not served as another user's provider usage.
- Satellite and radar histories are short; 5× and 10× products start with one current frame.
- Every catalog card shows provider coverage and access multiplier; all new entries stay behind
  Professional layers unless found through the search box.
- Xweather usage remains visible in each connected user's provider portal and LandDraft provider
  health. At the current PAYG terms, the first 15,000 accesses per account each month are free;
  usage beyond that amount belongs to that account and may become billable if its owner enables
  billing.

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

## Production storm reports and chaser locations

The live Storm Chaser workspace does not depend on a restricted third-party people feed:

- **Recent NWS storm reports** load from Iowa Environmental Mesonet's five-minute Local Storm
  Report GeoJSON. IEM explicitly permits lawful commercial use. These points show observed event
  locations and remain clearly separate from live people.
- **LandDraft chaser locations** are first-party, explicit opt-in positions. Enabling GPS alone does
  not publish a location. A signed-in user must press **Share my live chaser location**. LandDraft
  stores one replaceable current point, not a path/history; authenticated users can read only active
  points, and a point expires ten minutes after updates stop.

Apply `supabase/migrations/202609120001_weather_chaser_presence.sql` to every environment that will
offer live chaser sharing. No provider key or paid account is required. Expected operating cost is
normal Supabase database/RPC traffic plus application refresh traffic; pricing remains undecided.

## Spotter Network evaluation adapter (not used on the live site)

LandDraft includes a server-side, privacy-minimized adapter for Spotter Network's trained-member
position feed. The official feed page marks the feed **non-commercial use only** and tells
application developers to contact Spotter Network. Therefore this integration must not be enabled
in a commercial or production deployment until written provider permission and any attribution,
caching, redistribution and cost terms are recorded.

Historical test/evaluation configuration:

```text
SPOTTER_NETWORK_NONCOMMERCIAL_FEED_ENABLED=true
SPOTTER_NETWORK_POSITION_FEED_URL=https://www.spotternetwork.org/feeds/gr-no.txt
SPOTTER_NETWORK_FEATURED_POSITION_FEED_URL=https://www.spotternetwork.org/feeds/gr-p-no.txt
```

The URL is restricted in code to the official HTTPS Spotter Network host. Even the no-name feed can
contain voluntary identity/contact text. LandDraft parses only coordinates, position time and a
basic moving/stationary state, then discards the rest before caching. The optional featured feed
contains members with more than five Acceptable-or-better reports in the prior 12 months; matching
no-name positions receive a gold Featured marker. This is not a safety or skill endorsement.
Positions older than 30 minutes are rejected, results are limited to 500 positions within 800 km
of the inspected point, and the browser never receives the upstream raw feed.

Potential operating cost is currently provider-permission/licensing work plus Worker requests and
bandwidth; pricing remains undecided. Production activation must be coordinated before merge.

## Connected in the September 11 public-provider increment

- **Base reflectivity**, **base radial velocity** and **hydrometeor classification** use NOAA's
  official radar-site catalog and the nearest available NEXRAD RIDGE II WMS. The selected site and
  distance are shown in source health. These are U.S. site products; LandDraft does not pretend
  they provide global radar coverage.
- **Cloud-top temperature** uses NASA EOSDIS GIBS MODIS Terra/Aqua day/night imagery. It is an
  observed daily orbital product, so transparent gaps between passes are normal. The current
  increment displays the official colorized product but does not invent a point temperature from
  image pixels.
- These integrations require no secret in test or production. The same reviewed adapter code moves
  between environments, while each deployment keeps independent caches and health telemetry.
- Storm-relative velocity, correlation coefficient, differential reflectivity, upper-air/model
  grids, convective grids, individual lightning strikes, historical archives and derived storm
  objects remain setup-required. Enabling them requires either additional processing or a licensed
  commercial feed; none is silently substituted.
