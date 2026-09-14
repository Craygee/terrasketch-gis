import type { WaterSource } from "./types.ts";

export const WATER_SOURCES: WaterSource[] = [
  {
    id: "twdb-aquifers",
    agency: "Texas Water Development Board",
    title: "Texas major aquifer extents",
    url: "https://www.twdb.texas.gov/groundwater/aquifer/major.asp",
    endpoint:
      "https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/TWDB_Major_Aquifers/FeatureServer/0/query",
    terms: "https://www.twdb.texas.gov/policies/site/index.asp",
    attribution: "Texas Water Development Board; existing LandDraft catalog distribution",
    coverage: "Texas",
    license: "PUBLIC_OPEN",
    enabled: true,
    exportAllowed: true,
    cacheSeconds: 3600,
    reviewedAt: "2026-09-13",
  },
  {
    id: "usgs-measurements",
    agency: "U.S. Geological Survey",
    title: "USGS latest sensor measurements",
    url: "https://api.waterdata.usgs.gov/docs/ogcapi",
    endpoint: "https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items",
    terms: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
    attribution: "U.S. Geological Survey; provisional data subject to revision",
    coverage: "United States",
    license: "PUBLIC_OPEN",
    enabled: true,
    exportAllowed: true,
    cacheSeconds: 60,
    reviewedAt: "2026-09-13",
  },
  {
    id: "usgs-sites",
    agency: "U.S. Geological Survey",
    title: "USGS monitoring locations",
    url: "https://api.waterdata.usgs.gov/docs/ogcapi",
    endpoint: "https://api.waterdata.usgs.gov/ogcapi/v1/collections/monitoring-locations/items",
    terms: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
    attribution: "U.S. Geological Survey",
    coverage: "United States",
    license: "PUBLIC_OPEN",
    enabled: true,
    exportAllowed: true,
    cacheSeconds: 300,
    reviewedAt: "2026-09-13",
  },
  {
    id: "twdb-wells",
    agency: "Texas Water Development Board",
    title: "TWDB Groundwater Database",
    url: "https://www.twdb.texas.gov/groundwater/data/gwdbrpt.asp",
    endpoint:
      "https://services.twdb.texas.gov/arcgis/rest/services/Public/TWDB_Groundwater_database/FeatureServer/0/query",
    terms: "https://www.twdb.texas.gov/policies/site/index.asp",
    attribution: "Texas Water Development Board",
    coverage: "Texas",
    license: "PUBLIC_OPEN",
    enabled: true,
    exportAllowed: true,
    cacheSeconds: 300,
    reviewedAt: "2026-09-13",
  },
];

export const WATER_OPTIONAL_SOURCES = [
  {
    title: "NGWMN levels and quality",
    url: "https://cida.usgs.gov/ngwmn/",
    requirement: "Measurement adapter and provider-specific coverage validation pending",
  },
  {
    title: "USGS Principal Aquifers",
    url: "https://www.usgs.gov/mission-areas/water-resources/science/principal-aquifers-united-states",
    requirement: "Aquifer polygon adapter pending; well assignments are not aquifer boundaries",
  },
  {
    title: "TWDB BRACS and geophysical logs",
    url: "https://www.twdb.texas.gov/groundwater/bracs/",
    requirement: "Log and salinity adapters pending",
  },
  {
    title: "TWDB groundwater models",
    url: "https://www.twdb.texas.gov/groundwater/models/gam/",
    requirement: "Model metadata and output ingestion pending",
  },
  {
    title: "Texas groundwater districts",
    url: "https://www.twdb.texas.gov/groundwater/conservation_districts/",
    requirement: "District boundary and current-rule verification pending",
  },
  {
    title: "Aquifer depth, yield and TDS surfaces",
    url: "https://www.twdb.texas.gov/groundwater/data/gwdbrpt.asp",
    requirement: "Requires compatible measurements, dates, aquifer identity and validation",
  },
];
