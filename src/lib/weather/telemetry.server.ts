import type { WeatherProviderUsageMetric } from "./types";

const weatherUsage = new Map<string, WeatherProviderUsageMetric>();

export function recordWeatherUsage(input: {
  providerId: string;
  product: string;
  success: boolean;
  cacheHit: boolean;
  dataVolumeBytes?: number;
  estimatedCostUsd?: number;
}) {
  const key = `${input.providerId}:${input.product}`;
  const current = weatherUsage.get(key);
  weatherUsage.set(key, {
    providerId: input.providerId,
    product: input.product,
    requests: (current?.requests ?? 0) + 1,
    successes: (current?.successes ?? 0) + (input.success ? 1 : 0),
    failures: (current?.failures ?? 0) + (input.success ? 0 : 1),
    cacheHits: (current?.cacheHits ?? 0) + (input.cacheHit ? 1 : 0),
    dataVolumeBytes:
      input.dataVolumeBytes === undefined && current?.dataVolumeBytes == null
        ? null
        : (current?.dataVolumeBytes ?? 0) + (input.dataVolumeBytes ?? 0),
    estimatedCostUsd:
      input.estimatedCostUsd === undefined && current?.estimatedCostUsd == null
        ? null
        : (current?.estimatedCostUsd ?? 0) + (input.estimatedCostUsd ?? 0),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Test-deployment telemetry snapshot. Durable user/organization attribution needs the coordinated
 * database/RLS increment and is intentionally not inferred here.
 */
export function weatherUsageSnapshot(): WeatherProviderUsageMetric[] {
  return Array.from(weatherUsage.values()).map((metric) => ({ ...metric }));
}

export function resetWeatherUsageForTests() {
  weatherUsage.clear();
}
