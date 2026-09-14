export type Bounds = [number, number, number, number];
export const SOURCE_URL =
  "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/2025_Land_Parcels/FeatureServer/328";
export const MAX_FEATURES = 5000;
export const MAX_BYTES = 12_000_000;

function validPolygonGeometry(geometry: { type?: string; coordinates?: unknown }) {
  const ring = (value: unknown): boolean =>
    Array.isArray(value) &&
    value.length >= 4 &&
    value.every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    ) &&
    value[0][0] === value[value.length - 1][0] &&
    value[0][1] === value[value.length - 1][1];
  const polygon = (value: unknown): boolean =>
    Array.isArray(value) && value.length > 0 && value.every(ring);
  return geometry?.type === "Polygon"
    ? polygon(geometry.coordinates)
    : geometry?.type === "MultiPolygon" &&
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every(polygon);
}

export function validateBounds(value: unknown): Bounds {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite))
    throw new Error("Save a project area with valid geographic bounds first.");
  const [w, s, e, n] = value as Bounds;
  if (w < -107 || e > -93 || s < 25 || n > 37 || w >= e || s >= n)
    throw new Error("Choose a project area within Texas coverage.");
  if ((e - w) * (n - s) > 0.05)
    throw new Error(
      "This project area is too large for a saved parcel copy. Save a smaller study area.",
    );
  return [w, s, e, n];
}

// Query IDs first, then fetch exact batches. Never publish a truncated viewport result.
export async function downloadParcels(
  bounds: Bounds,
  request: typeof fetch = fetch,
  options: { where?: string | undefined; signal?: AbortSignal | undefined } = {},
) {
  validateBounds(bounds);
  const get = async (params: Record<string, string>) => {
    const response = await request(`${SOURCE_URL}/query?${new URLSearchParams(params)}`, {
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        `Parcel publisher unavailable (${response.status}). Last saved copy retained.`,
      );
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new Error("Parcel response exceeds the project-area limit.");
    const data = JSON.parse(text);
    if (data.error)
      throw new Error(
        "Parcel publisher could not complete this request. Last saved copy retained.",
      );
    return data;
  };
  const ids = await get({
    f: "json",
    where: options.where || "1=1",
    geometry: bounds.join(","),
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    returnIdsOnly: "true",
  });
  if (
    !Array.isArray(ids.objectIds) ||
    ids.exceededTransferLimit ||
    ids.objectIds.length > MAX_FEATURES
  )
    throw new Error(
      "Complete parcel coverage could not be downloaded. Save a smaller project area.",
    );
  if (!ids.objectIdFieldName || !ids.objectIds.every((id: unknown) => Number.isSafeInteger(id)))
    throw new Error("Parcel publisher returned an unexpected ID schema.");
  const expected = new Set<number>(ids.objectIds);
  if (expected.size !== ids.objectIds.length)
    throw new Error("Parcel publisher returned duplicate IDs.");
  const found = new Set<number>();
  const features = [];
  let bytes = 0;
  for (let start = 0; start < ids.objectIds.length; start += 200) {
    const page = await get({
      f: "geojson",
      objectIds: ids.objectIds.slice(start, start + 200).join(","),
      outFields: "*",
      outSR: "4326",
      returnGeometry: "true",
    });
    if (
      page.type !== "FeatureCollection" ||
      !Array.isArray(page.features) ||
      page.exceededTransferLimit
    )
      throw new Error("Parcel download was incomplete. Last saved copy retained.");
    for (const feature of page.features) {
      const id = feature.properties?.[ids.objectIdFieldName] ?? feature.id;
      if (!expected.has(id) || found.has(id) || !validPolygonGeometry(feature.geometry))
        throw new Error("Parcel geometry or identity failed validation.");
      found.add(id);
      features.push(feature);
    }
    bytes += JSON.stringify(page).length;
    if (bytes > MAX_BYTES) throw new Error("Saved parcels exceed the project-area storage limit.");
  }
  if (found.size !== expected.size)
    throw new Error("Parcel download was incomplete. Last saved copy retained.");
  return { type: "FeatureCollection" as const, features };
}
