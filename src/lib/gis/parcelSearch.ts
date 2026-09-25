import type { Feature } from "geojson";
import { fetchTexasParcels, TEXAS_PARCEL_URL } from "./texasParcels.ts";

const PARCEL_SEARCH_ORIGIN = new URL(TEXAS_PARCEL_URL).origin;

export interface TexasParcelSearchFilters {
  county?: string;
  owner?: string;
  parcelId?: string;
  block?: string;
  section?: string;
  address?: string;
  limit?: number;
}

export interface TexasParcelSearchResult {
  sourceFeatureId?: string;
  propertyId?: string;
  geoId?: string;
  ownerName?: string;
  legalDescription?: string;
  situsAddress?: string;
  county: string;
  fips: string;
  block?: string;
  section?: string;
  bounds: [number, number, number, number];
}

export interface TexasParcelSearchMetadata {
  status: "ready";
  sourceDate: string;
  updatedAt: string;
  minimumTextLength: number;
  maximumResults: number;
  counties: Array<{ name: string; fips: string }>;
}

export interface TexasParcelSearchResponse {
  results: TexasParcelSearchResult[];
  limited: boolean;
  sourceDate: string;
  searched: Omit<TexasParcelSearchFilters, "limit">;
}

const text = (value: unknown) => String(value ?? "").trim();

export function validateTexasParcelSearch(filters: TexasParcelSearchFilters): string | null {
  const county = text(filters.county);
  const parcelId = text(filters.parcelId);
  const owner = text(filters.owner);
  const block = text(filters.block);
  const section = text(filters.section);
  const address = text(filters.address);
  if (!county && !parcelId && !owner && !block && !section && !address)
    return "Enter at least one parcel search filter.";
  if ((block || section) && !county) return "Choose a county when searching by block or section.";
  if (parcelId && parcelId.replace(/[^a-z0-9]/gi, "").length < 3)
    return "Enter at least 3 letters or numbers for the parcel/property ID.";
  if (owner && owner.replace(/[^a-z0-9]/gi, "").length < 3)
    return "Enter at least 3 letters or numbers for the owner or name.";
  if (address && address.replace(/[^a-z0-9]/gi, "").length < 3)
    return "Enter at least 3 letters or numbers for the address.";
  return null;
}

const responseError = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || `Texas parcel search is unavailable (${response.status}).`;
};

export async function getTexasParcelSearchMetadata(
  signal?: AbortSignal,
): Promise<TexasParcelSearchMetadata> {
  const response = await fetch(`${PARCEL_SEARCH_ORIGIN}/texas/search/meta`, {
    signal: signal ?? null,
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as TexasParcelSearchMetadata;
}

export async function searchTexasParcels(
  filters: TexasParcelSearchFilters,
  signal?: AbortSignal,
): Promise<TexasParcelSearchResponse> {
  const problem = validateTexasParcelSearch(filters);
  if (problem) throw new Error(problem);
  const params = new URLSearchParams();
  for (const key of ["county", "owner", "parcelId", "block", "section", "address"] as const) {
    const value = text(filters[key]);
    if (value) params.set(key, value);
  }
  params.set("limit", String(Math.max(1, Math.min(filters.limit ?? 25, 50))));
  const response = await fetch(`${PARCEL_SEARCH_ORIGIN}/texas/search?${params}`, {
    signal: signal ?? null,
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as TexasParcelSearchResponse;
}

const identifiersMatch = (feature: Feature, result: TexasParcelSearchResult) => {
  const properties = feature.properties ?? {};
  const sameCounty =
    text(properties["COUNTY"] ?? properties["county"]).toUpperCase() ===
    result.county.toUpperCase();
  if (!sameCounty) return false;
  const propertyId = text(properties["Prop_ID"] ?? properties["PROP_ID"] ?? properties["prop_id"]);
  const geoId = text(properties["GEO_ID"] ?? properties["geo_id"]);
  return Boolean(
    (result.propertyId && propertyId === result.propertyId) ||
    (result.geoId && geoId === result.geoId) ||
    (result.sourceFeatureId && String(feature.id ?? "") === result.sourceFeatureId),
  );
};

export async function resolveTexasParcelSearchResult(
  result: TexasParcelSearchResult,
  signal?: AbortSignal,
): Promise<Feature> {
  const [west, south, east, north] = result.bounds;
  const pad = Math.max(0.00002, Math.max(east - west, north - south) * 0.03);
  const response = await fetchTexasParcels({
    bbox: [west - pad, south - pad, east + pad, north + pad],
    maxTotalFeatures: 10_000,
    signal,
  });
  const feature = response.data.features.find((candidate) => identifiersMatch(candidate, result));
  if (!feature)
    throw new Error(
      "The parcel was found in the statewide search index, but its boundary could not be loaded. Refresh the parcel source and try again.",
    );
  return feature;
}
