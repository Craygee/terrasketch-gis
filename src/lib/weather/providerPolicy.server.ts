import {
  activeLicenseGrant,
  parseProviderPolicy,
  weatherFeatureEnabled,
  type WeatherFeature,
} from "./providerPolicy.ts";
import { currentWeatherContext } from "./runtimeContext.server.ts";

export function weatherPolicyConfiguration(bindings?: unknown) {
  bindings ??= currentWeatherContext()?.bindings;
  const runtime =
    bindings && typeof bindings === "object" ? (bindings as Record<string, unknown>) : {};
  const environment = (
    globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const raw = runtime["WEATHER_PROVIDER_POLICY"] ?? environment?.["WEATHER_PROVIDER_POLICY"];
  return parseProviderPolicy(raw);
}
export function approvedXweatherProducts(bindings?: unknown, userId?: string): string[] {
  userId ??= currentWeatherContext()?.authenticatedUserId;
  const { policy } = weatherPolicyConfiguration(bindings);
  return [...new Set(policy.grants.flatMap((grant) => grant.products))].filter(
    (product) =>
      !!activeLicenseGrant(policy, {
        providerId: "xweather",
        product,
        connectionType: "USER_BYOK",
        ...(userId ? { userId } : {}),
      }),
  );
}
export function xweatherProductPermitted(
  product: string,
  bindings?: unknown,
  userId?: string,
): boolean {
  return approvedXweatherProducts(bindings, userId).includes(product);
}
export function weatherProviderEnabled(providerId: string, bindings?: unknown): boolean {
  return !weatherPolicyConfiguration(bindings).policy.disabledProviders.includes(providerId);
}
export function weatherFeatureAvailable(feature: WeatherFeature, bindings?: unknown): boolean {
  return weatherFeatureEnabled(weatherPolicyConfiguration(bindings).policy, feature);
}
