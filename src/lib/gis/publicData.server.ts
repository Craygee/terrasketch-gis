const CENSUS_STATE_BOUNDARIES_URL =
  "https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_state_500k.zip";

export async function handlePublicDataDownload(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/public-data/census-state-boundaries") return null;
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

  try {
    const upstream = await fetch(CENSUS_STATE_BOUNDARIES_URL, {
      headers: {
        accept: "application/zip",
        "user-agent": "LandDraft/public-data-import",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok || !upstream.body)
      return new Response("Census state boundaries are temporarily unavailable", { status: 502 });
    const contentLength = Number(upstream.headers.get("content-length") ?? 0);
    if (contentLength > 12 * 1024 * 1024)
      return new Response("Census state-boundary archive exceeded the allowed size", {
        status: 502,
      });
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="cb_2025_us_state_500k.zip"',
        "cache-control": "public, max-age=86400",
        "x-landdraft-source": "U.S. Census Bureau 2025 Cartographic Boundary Files",
      },
    });
  } catch {
    return new Response("Census state boundaries are temporarily unavailable", { status: 502 });
  }
}
