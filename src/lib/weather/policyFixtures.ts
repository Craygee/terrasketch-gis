import type { ProviderLicenseGrant } from "./providerPolicy.ts";
/** Synthetic rights evidence for local tests only; never used by runtime policy. */
export function syntheticLicenseGrant(
  overrides: Partial<ProviderLicenseGrant> = {},
): ProviderLicenseGrant {
  return {
    id: "synthetic-test-only",
    providerId: "xweather",
    products: ["radar-global"],
    connectionType: "USER_BYOK",
    scope: "application",
    reviewedAt: "2020-01-01T00:00:00Z",
    validUntil: "2099-01-01T00:00:00Z",
    reviewedBy: "synthetic-test",
    evidenceReference: "fixture-only",
    proxyAllowed: true,
    displayAllowed: true,
    derivedProductsAllowed: false,
    maximumCacheSeconds: 0,
    revoked: false,
    ...overrides,
  };
}
export function syntheticPolicyBindings(grant = syntheticLicenseGrant()) {
  return { WEATHER_PROVIDER_POLICY: JSON.stringify({ version: 1, grants: [grant] }) };
}
