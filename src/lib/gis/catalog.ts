export interface CatalogEntry {
  id: string;
  name: string;
  agency: string;
  category: "Transportation" | "Boundaries" | "Energy" | "Land" | "Water" | "Demographics";
  description: string;
  url: string;
  geometry: "polygon" | "line" | "point";
  keywords: string[];
  /** Query bbox is required for very large national services. */
  requiresViewport?: boolean;
  license: string;
}

/**
 * Public / official ArcGIS + GeoJSON connectors. No keys, no login.
 * Everything here is published openly by the listed agency.
 */
export const catalog: CatalogEntry[] = [
  {
    id: "txdot-roadways",
    name: "TxDOT Roadways",
    agency: "Texas Department of Transportation",
    category: "Transportation",
    description: "State-maintained roadway centerlines with route names and highway systems.",
    url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0",
    geometry: "line",
    keywords: ["road", "highway", "street", "centerline", "txdot"],
    requiresViewport: true,
    license: "TxDOT Open Data",
  },
  {
    id: "txdot-aadt",
    name: "TxDOT AADT Traffic Counts",
    agency: "Texas Department of Transportation",
    category: "Transportation",
    description: "Annual Average Daily Traffic count locations and volumes.",
    url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_AADT_Annuals/FeatureServer/0",
    geometry: "point",
    keywords: ["traffic", "aadt", "counts", "volume", "txdot"],
    requiresViewport: true,
    license: "TxDOT Open Data",
  },
  {
    id: "tx-counties",
    name: "Texas County Boundaries",
    agency: "Texas Dept. of Information Resources / TNRIS",
    category: "Boundaries",
    description: "All 254 Texas county polygons with FIPS codes and names.",
    url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/Texas_County_Boundaries/FeatureServer/0",
    geometry: "polygon",
    keywords: ["county", "counties", "boundary", "texas", "admin"],
    license: "Texas Open Data",
  },
  {
    id: "transmission-lines",
    name: "Electric Transmission Lines",
    agency: "U.S. HIFLD / EIA",
    category: "Energy",
    description: "Bulk electric transmission line corridors with voltage class.",
    url: "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0",
    geometry: "line",
    keywords: ["electric", "transmission", "power", "grid", "voltage", "utility"],
    requiresViewport: true,
    license: "HIFLD Open",
  },
  {
    id: "gas-pipelines",
    name: "Major Natural Gas Pipelines",
    agency: "U.S. Energy Information Administration",
    category: "Energy",
    description: "Interstate and intrastate natural gas transmission pipelines.",
    url: "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Natural_Gas_Liquid_Pipelines/FeatureServer/0",
    geometry: "line",
    keywords: ["pipeline", "gas", "energy", "midstream", "oil"],
    requiresViewport: true,
    license: "EIA / HIFLD Open",
  },
  {
    id: "glo-psf-lands",
    name: "Texas GLO Permanent School Fund Lands",
    agency: "Texas General Land Office",
    category: "Land",
    description: "State-owned Permanent School Fund surface and mineral tracts.",
    url: "https://gisweb.glo.texas.gov/arcgis/rest/services/GLOMapServices/PSFLands/MapServer/0",
    geometry: "polygon",
    keywords: ["glo", "psf", "school fund", "state land", "tract"],
    requiresViewport: true,
    license: "Texas GLO Public Data",
  },
  {
    id: "glo-leases",
    name: "Texas GLO Oil & Gas Leases",
    agency: "Texas General Land Office",
    category: "Land",
    description: "Active state mineral lease tracts administered by the GLO.",
    url: "https://gisweb.glo.texas.gov/arcgis/rest/services/GLOMapServices/StateLeases/MapServer/0",
    geometry: "polygon",
    keywords: ["lease", "mineral", "oil", "gas", "glo"],
    requiresViewport: true,
    license: "Texas GLO Public Data",
  },
  {
    id: "census-tracts",
    name: "Census Tracts (2020)",
    agency: "U.S. Census Bureau TIGERweb",
    category: "Demographics",
    description: "2020 census tract polygons for demographic joins and analysis.",
    url: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/1",
    geometry: "polygon",
    keywords: ["census", "tract", "demographics", "tiger", "population"],
    requiresViewport: true,
    license: "U.S. Census Bureau, public domain",
  },
  {
    id: "nhd-flowlines",
    name: "NHD Flowlines",
    agency: "U.S. Geological Survey",
    category: "Water",
    description: "National Hydrography Dataset streams, rivers and channels.",
    url: "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6",
    geometry: "line",
    keywords: ["stream", "river", "creek", "hydrology", "nhd", "water"],
    requiresViewport: true,
    license: "USGS, public domain",
  },
];

export const categories = Array.from(new Set(catalog.map((c) => c.category)));

export function searchCatalog(query: string, category: string | null): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  return catalog.filter((entry) => {
    if (category && entry.category !== category) return false;
    if (!q) return true;
    return (
      entry.name.toLowerCase().includes(q) ||
      entry.agency.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.keywords.some((k) => k.includes(q))
    );
  });
}
