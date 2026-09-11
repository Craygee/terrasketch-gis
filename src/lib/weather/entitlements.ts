import type { WeatherCapability } from "./types";

export interface WeatherEntitlementContext {
  moduleEnabled?: boolean;
  organizationCapabilities?: Partial<Record<WeatherCapability, boolean>>;
  userCapabilities?: Partial<Record<WeatherCapability, boolean>>;
  roleCapabilities?: Partial<Record<WeatherCapability, boolean>>;
}

/**
 * Phase 1 capability hook. It centralizes future account/organization/subscription decisions but
 * deliberately creates no paywall and changes no core mapping permission.
 */
export function hasWeatherCapability(
  capability: WeatherCapability,
  context: WeatherEntitlementContext = {},
): boolean {
  if (context.moduleEnabled === false) return false;
  const decisions = [
    context.organizationCapabilities?.[capability],
    context.roleCapabilities?.[capability],
    context.userCapabilities?.[capability],
  ].filter((value): value is boolean => value !== undefined);
  return !decisions.includes(false);
}
