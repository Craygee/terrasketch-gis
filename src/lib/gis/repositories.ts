export interface PublicRepository {
  id: string;
  name: string;
  agency: string;
  description: string;
  url: string;
  states: "US" | string[];
  topics: string[];
  kind: "catalog" | "download" | "services";
}

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const dataGovSearch = (query: string) =>
  `https://catalog.data.gov/dataset/?metadata_type=geospatial&q=${encodeURIComponent(query)}`;

const stateRepositories: PublicRepository[] = Object.entries(STATE_NAMES).map(([state, name]) => ({
  id: `state-${state.toLowerCase()}`,
  name: `${name} public GIS catalog`,
  agency: "Data.gov federated government catalog",
  description: `Search geospatial datasets published by ${name} state, county, city, university and tribal agencies.`,
  url: dataGovSearch(`${name} GIS`),
  states: [state],
  topics: ["state", "county", "parcel", "transportation", "water", "environment"],
  kind: "catalog",
}));

const nationalRepositories: PublicRepository[] = [
  {
    id: "data-gov",
    name: "Data.gov Geospatial Catalog",
    agency: "U.S. General Services Administration",
    description:
      "Federal, state, county, city, university and tribal metadata in one searchable catalog.",
    url: "https://catalog.data.gov/dataset/?metadata_type=geospatial",
    states: "US",
    topics: ["all topics", "state", "county", "local", "open data"],
    kind: "catalog",
  },
  {
    id: "census-tiger",
    name: "Census TIGER/Line & TIGERweb",
    agency: "U.S. Census Bureau",
    description:
      "Current nationwide boundaries, roads, rail, places, school districts, tracts, blocks and demographic geographies.",
    url: "https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_restmapservice.html",
    states: "US",
    topics: ["boundaries", "roads", "rail", "demographics", "tracts", "counties"],
    kind: "services",
  },
  {
    id: "usgs-national-map",
    name: "The National Map",
    agency: "U.S. Geological Survey",
    description:
      "Elevation, hydrography, structures, transportation, land cover and topographic downloads and services.",
    url: "https://www.usgs.gov/the-national-map-data-delivery/gis-data-download",
    states: "US",
    topics: ["elevation", "water", "topography", "structures", "land cover"],
    kind: "download",
  },
  {
    id: "fema-msc",
    name: "FEMA Flood Map Service Center",
    agency: "Federal Emergency Management Agency",
    description:
      "Authoritative flood hazard products, National Flood Hazard Layer downloads and map services.",
    url: "https://msc.fema.gov/portal/advanceSearch",
    states: "US",
    topics: ["flood", "hazard", "insurance", "NFHL", "FIRM"],
    kind: "services",
  },
  {
    id: "epa-enviroatlas",
    name: "EPA Geospatial Resources",
    agency: "U.S. Environmental Protection Agency",
    description:
      "Environmental facilities, compliance, watersheds, air, water, EJScreen and EnviroAtlas resources.",
    url: "https://www.epa.gov/geospatial",
    states: "US",
    topics: ["environment", "facilities", "water", "air", "compliance"],
    kind: "catalog",
  },
  {
    id: "usda-geospatial",
    name: "USDA Geospatial Data Gateway",
    agency: "U.S. Department of Agriculture",
    description:
      "Soils, cropland, conservation, imagery and natural-resource datasets by area of interest.",
    url: "https://datagateway.nrcs.usda.gov/",
    states: "US",
    topics: ["soils", "agriculture", "cropland", "imagery", "conservation"],
    kind: "download",
  },
  {
    id: "noaa-data",
    name: "NOAA Data Discovery",
    agency: "National Oceanic and Atmospheric Administration",
    description:
      "Weather, climate, coastal, ocean, wetlands and environmental observations and services.",
    url: "https://www.noaa.gov/information-technology/open-data-dissemination",
    states: "US",
    topics: ["weather", "climate", "coastal", "ocean", "wetlands"],
    kind: "catalog",
  },
  {
    id: "blm-geospatial",
    name: "BLM Geospatial Business Platform",
    agency: "Bureau of Land Management",
    description:
      "Public lands, PLSS, minerals, grazing, recreation, administrative boundaries and land-use data.",
    url: "https://www.blm.gov/services/geospatial/GISData",
    states: "US",
    topics: ["public lands", "PLSS", "minerals", "grazing", "recreation"],
    kind: "services",
  },
  {
    id: "eia-maps",
    name: "EIA U.S. Energy Atlas",
    agency: "U.S. Energy Information Administration",
    description:
      "Power plants, transmission, pipelines, renewable assets and other national energy infrastructure.",
    url: "https://atlas.eia.gov/",
    states: "US",
    topics: ["energy", "transmission", "pipeline", "power plant", "renewable"],
    kind: "services",
  },
  {
    id: "dot-ntad",
    name: "National Transportation Atlas Database",
    agency: "U.S. Department of Transportation",
    description:
      "Airports, rail, highways, bridges, ports, pipelines and other national transportation layers.",
    url: "https://geodata.bts.gov/",
    states: "US",
    topics: ["transportation", "roads", "rail", "airport", "bridge", "port"],
    kind: "catalog",
  },
];

export const publicRepositories = [...nationalRepositories, ...stateRepositories];

export function searchRepositories(query: string, states: string[]): PublicRepository[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return publicRepositories.filter((repository) => {
    if (repository.states !== "US" && !repository.states.some((state) => states.includes(state)))
      return false;
    const haystack = [
      repository.name,
      repository.agency,
      repository.description,
      ...repository.topics,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function dataGovDiscoveryUrl(query: string, states: string[], county?: string): string {
  const locations = states.map((state) => STATE_NAMES[state] ?? state).join(" OR ");
  const terms = [query.trim(), locations, county?.trim() ? `${county.trim()} County` : "GIS"]
    .filter(Boolean)
    .join(" ");
  return dataGovSearch(terms);
}
