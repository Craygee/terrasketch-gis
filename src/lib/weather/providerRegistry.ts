export type LicenseStatus =
  | "PUBLIC_OPEN"
  | "COMMERCIAL_LICENSE_REQUIRED"
  | "LANDDRAFT_LICENSED"
  | "USER_BYOK"
  | "USER_OAUTH"
  | "ATTRIBUTION_REQUIRED"
  | "RESEARCH_ONLY"
  | "NONCOMMERCIAL_ONLY"
  | "UNKNOWN"
  | "DISABLED";
export type Permission = boolean | "unknown";
export interface WeatherProviderLicense {
  provider_id: string;
  provider_name: string;
  provider_type: "government" | "commercial" | "community";
  official_documentation_url: string;
  terms_url: string;
  licensing_status: LicenseStatus;
  commercial_use_status: "permitted" | "contract-required" | "unconfirmed";
  attribution_requirement: string;
  redistribution_allowed: Permission;
  derived_products_allowed: Permission;
  caching_allowed: Permission;
  maximum_cache_duration: number | null;
  tile_storage_allowed: Permission;
  API_key_required: boolean;
  OAuth_supported: Permission;
  BYOK_supported: Permission;
  LandDraft_managed_credentials_allowed: Permission;
  user_subscription_required: boolean;
  rate_limit: string;
  geographic_coverage: string;
  temporal_coverage: string;
  update_frequency: string;
  current_operational_status: "unknown" | "adapter-required";
  last_license_reviewed_at: string | null;
  notes: string;
}

function provider(id: string, name: string, docs: string, terms = docs): WeatherProviderLicense {
  return {
    provider_id: id,
    provider_name: name,
    provider_type: "commercial",
    official_documentation_url: docs,
    terms_url: terms,
    licensing_status: "UNKNOWN",
    commercial_use_status: "unconfirmed",
    attribution_requirement: "Confirm in executed product agreement",
    redistribution_allowed: "unknown",
    derived_products_allowed: "unknown",
    caching_allowed: "unknown",
    maximum_cache_duration: null,
    tile_storage_allowed: "unknown",
    API_key_required: true,
    OAuth_supported: "unknown",
    BYOK_supported: "unknown",
    LandDraft_managed_credentials_allowed: "unknown",
    user_subscription_required: true,
    rate_limit: "Product/account dependent; not verified",
    geographic_coverage: "Product dependent",
    temporal_coverage: "Product dependent",
    update_frequency: "Product dependent",
    current_operational_status: "adapter-required",
    last_license_reviewed_at: null,
    notes: "LICENSE REVIEW REQUIRED. Credentials alone do not establish redistribution rights.",
  };
}
function government(id: string, name: string, docs: string): WeatherProviderLicense {
  return {
    ...provider(id, name, docs, "https://www.weather.gov/disclaimer"),
    provider_type: "government",
    licensing_status: "PUBLIC_OPEN",
    commercial_use_status: "permitted",
    attribution_requirement:
      "Credit NOAA/NWS and the product; label modifications LandDraft analysis. No endorsement implied.",
    redistribution_allowed: true,
    derived_products_allowed: true,
    caching_allowed: true,
    tile_storage_allowed: true,
    API_key_required: false,
    OAuth_supported: false,
    BYOK_supported: false,
    LandDraft_managed_credentials_allowed: false,
    user_subscription_required: false,
    last_license_reviewed_at: "2026-09-13",
    notes:
      "Applies only to NOAA-origin public products. Third-party data and experimental products require separate review. Operational availability must be checked per product.",
  };
}
export const weatherProviderRegistry: WeatherProviderLicense[] = [
  government(
    "nws",
    "NOAA / National Weather Service",
    "https://www.weather.gov/documentation/services-web-api",
  ),
  government(
    "nexrad",
    "NOAA NEXRAD Level II / III",
    "https://www.ncei.noaa.gov/products/radar/next-generation-weather-radar",
  ),
  government("mrms", "NOAA operational MRMS", "https://www.nssl.noaa.gov/projects/mrms/"),
  government("goes", "NOAA GOES ABI / GLM", "https://www.goes-r.gov/products/overview.html"),
  government("hrrr", "NOAA HRRR / NCEP models", "https://www.nco.ncep.noaa.gov/pmb/products/hrrr/"),
  government("spc", "NOAA Storm Prediction Center", "https://www.spc.noaa.gov/products/"),
  government("awc", "NOAA Aviation Weather Center", "https://aviationweather.gov/data/api/"),
  {
    ...government(
      "nasa-gibs",
      "NASA GIBS / MODIS",
      "https://www.earthdata.nasa.gov/data/tools/gibs",
    ),
    terms_url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy",
    attribution_requirement:
      "NASA EOSDIS GIBS / MODIS; identify derived analysis. No endorsement implied.",
    notes: "NASA-led MODIS products; non-NASA products require their own license review.",
  },
  {
    ...government(
      "iem",
      "Iowa Environmental Mesonet / NWS reports",
      "https://mesonet.agron.iastate.edu/",
    ),
    terms_url: "https://mesonet.agron.iastate.edu/disclaimer.php",
    attribution_requirement:
      "NOAA/NWS Local Storm Reports via Iowa Environmental Mesonet / Iowa State University",
    notes:
      "IEM publishes its website material as public domain. Preserve report source, observation time and limitations.",
  },
  {
    ...provider(
      "nowcoast-lightning",
      "NOAA nowCOAST lightning density",
      "https://nowcoast.noaa.gov/",
    ),
    provider_type: "government",
    API_key_required: false,
    user_subscription_required: false,
    notes:
      "LICENSE REVIEW REQUIRED for third-party lightning inputs. This is not GLM. Do not infer redistribution rights from NOAA hosting.",
  },
  {
    ...provider(
      "spotter-network",
      "Spotter Network",
      "https://www.spotternetwork.org/pages/feeds/gibson-ridge",
      "https://www.spotternetwork.org/pages/terms-of-use",
    ),
    provider_type: "community",
    licensing_status: "NONCOMMERCIAL_ONLY",
    last_license_reviewed_at: "2026-09-13",
    notes:
      "Published terms limit use to personal noncommercial purposes; commercial permission required. Existing parsing fixtures are synthetic.",
  },
  {
    ...provider(
      "landdraft",
      "LandDraft private workspace / analysis",
      "https://landdraft.net/privacy",
      "https://landdraft.net/terms",
    ),
    provider_type: "community",
    licensing_status: "USER_BYOK",
    API_key_required: false,
    user_subscription_required: false,
    notes:
      "First-party workspace data. Sharing requires explicit consent. Analysis inherits restrictions of every upstream input.",
  },
  provider("unassigned", "Provider not yet selected", "https://landdraft.net/"),
  {
    ...provider("met-norway", "MET Norway", "https://api.met.no/doc/TermsOfService"),
    provider_type: "government",
    licensing_status: "ATTRIBUTION_REQUIRED",
    commercial_use_status: "permitted",
    attribution_requirement: "MET Norway — CC BY 4.0; identify derived analysis",
    redistribution_allowed: true,
    derived_products_allowed: true,
    caching_allowed: true,
    API_key_required: false,
    user_subscription_required: false,
    last_license_reviewed_at: "2026-09-13",
    notes:
      "Identify the application; respect cache headers and API usage terms. Locationforecast is model guidance, not a station observation.",
  },
  provider(
    "xweather",
    "Vaisala / Xweather",
    "https://www.xweather.com/docs",
    "https://new.xweather.com/legal",
  ),
  provider("meteomatics", "Meteomatics", "https://www.meteomatics.com/en/api/"),
  provider("synoptic", "Synoptic Data", "https://docs.synopticdata.com/"),
  provider("tomorrow", "Tomorrow.io", "https://docs.tomorrow.io/"),
  {
    ...provider(
      "open-meteo",
      "Open-Meteo commercial",
      "https://open-meteo.com/en/docs",
      "https://open-meteo.com/en/terms",
    ),
    licensing_status: "COMMERCIAL_LICENSE_REQUIRED",
    commercial_use_status: "contract-required",
    last_license_reviewed_at: "2026-09-13",
    notes:
      "Free hosted API is noncommercial. Review commercial subscription and redistribution conditions separately from the data license.",
  },
  provider("weatherbit", "Weatherbit", "https://www.weatherbit.io/api"),
  provider("here", "HERE", "https://www.here.com/docs"),
  provider("mapbox", "Mapbox", "https://docs.mapbox.com/"),
  provider("dot", "State DOT / 511 cameras and roads", "https://ops.fhwa.dot.gov/511/"),
  provider("tempest", "Tempest / WeatherFlow", "https://weatherflow.github.io/Tempest/api/"),
  provider("davis", "Davis WeatherLink", "https://weatherlink.github.io/v2-api/"),
  provider("ambient", "Ambient Weather", "https://ambientweather.docs.apiary.io/"),
];

export function publicProviderPermitted(id: string): boolean {
  const item = weatherProviderRegistry.find((candidate) => candidate.provider_id === id);
  return (
    !!item &&
    ["PUBLIC_OPEN", "ATTRIBUTION_REQUIRED"].includes(item.licensing_status) &&
    item.commercial_use_status === "permitted" &&
    item.redistribution_allowed === true
  );
}
