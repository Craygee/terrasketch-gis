/** NWS QuantitativeValue: null means missing, never a measured zero. */
export function measurementValue(input: unknown): number | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = (input as Record<string, unknown>).value;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function nwsWindMetersPerSecond(input: unknown): number | undefined {
  const value = measurementValue(input);
  if (value === undefined || value < 0) return undefined;
  const unit = (input as Record<string, unknown>).unitCode;
  if (unit === "wmoUnit:m_s-1") return value;
  if (unit === "wmoUnit:km_h-1") return value / 3.6;
  if (unit === "wmoUnit:kn") return (value * 1852) / 3600;
  if (unit === "wmoUnit:mi_h-1") return value * 0.44704;
  return undefined; // An unknown unit must not become an exaggerated wind report.
}
