import { z } from "zod";

export const WEATHER_FEATURES = [
  "weather_provider_registry",
  "unavailable_layer_catalog",
  "nexrad_level2",
  "mrms",
  "goes_satellite",
  "glm",
  "storm_objects",
  "boundary_analysis",
  "photography_heatmap",
  "terrain_los",
  "hazard_routing",
  "chaser_network",
  "computer_vision_cameras",
  "experimental_tornado_analysis",
] as const;
export type WeatherFeature = (typeof WEATHER_FEATURES)[number];
const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/);
const grantSchema = z
  .object({
    id: identifier,
    providerId: identifier,
    products: z.array(identifier).min(1).max(200),
    connectionType: z.enum(["USER_BYOK", "LANDDRAFT_MANAGED", "USER_OAUTH"]),
    scope: z.enum(["application", "user"]),
    subjectId: z.string().min(1).max(128).optional(),
    reviewedAt: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }),
    reviewedBy: z.string().min(1).max(128),
    evidenceReference: z.string().min(1).max(512),
    proxyAllowed: z.literal(true),
    displayAllowed: z.literal(true),
    derivedProductsAllowed: z.boolean(),
    maximumCacheSeconds: z.number().int().min(0).max(86400),
    revoked: z.boolean().default(false),
  })
  .strict()
  .refine(
    (grant) => (grant.scope === "application" ? !grant.subjectId : !!grant.subjectId),
    "User grants require a subject; application grants cannot name a subject",
  );
export const providerPolicySchema = z
  .object({
    version: z.literal(1),
    disabledProviders: z.array(identifier).max(100).default([]),
    disabledFeatures: z.array(z.enum(WEATHER_FEATURES)).default([]),
    grants: z.array(grantSchema).max(200).default([]),
  })
  .strict();
export type ProviderPolicy = z.infer<typeof providerPolicySchema>;
export type ProviderLicenseGrant = z.infer<typeof grantSchema>;
export const emptyProviderPolicy: ProviderPolicy = {
  version: 1,
  disabledProviders: [],
  disabledFeatures: [],
  grants: [],
};

export function parseProviderPolicy(raw: unknown): { policy: ProviderPolicy; valid: boolean } {
  if (raw === undefined || raw === "") return { policy: emptyProviderPolicy, valid: true };
  try {
    if (typeof raw !== "string" || raw.length > 65536)
      return { policy: emptyProviderPolicy, valid: false };
    const parsed = providerPolicySchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? { policy: parsed.data, valid: true }
      : { policy: emptyProviderPolicy, valid: false };
  } catch {
    return { policy: emptyProviderPolicy, valid: false };
  }
}

export function activeLicenseGrant(
  policy: ProviderPolicy,
  input: {
    providerId: string;
    product: string;
    connectionType: ProviderLicenseGrant["connectionType"];
    userId?: string;
    now?: number;
  },
): ProviderLicenseGrant | undefined {
  if (policy.disabledProviders.includes(input.providerId)) return undefined;
  const now = input.now ?? Date.now();
  return policy.grants.find(
    (grant) =>
      grant.providerId === input.providerId &&
      grant.products.includes(input.product) &&
      grant.connectionType === input.connectionType &&
      !grant.revoked &&
      Date.parse(grant.reviewedAt) <= now &&
      Date.parse(grant.validUntil) > now &&
      (grant.scope === "application" || (!!input.userId && input.userId === grant.subjectId)),
  );
}

/** An environment flag cannot release an unreviewed safety algorithm. */
export function weatherFeatureEnabled(policy: ProviderPolicy, feature: WeatherFeature): boolean {
  return (
    [
      "weather_provider_registry",
      "unavailable_layer_catalog",
      "mrms",
      "goes_satellite",
      "storm_objects",
      "chaser_network",
    ].includes(feature) && !policy.disabledFeatures.includes(feature)
  );
}
