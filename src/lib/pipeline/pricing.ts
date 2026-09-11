import type { PriceEvidenceClass, PriceSnapshot } from "./types";

export interface PricingSearchRequest {
  productDescription: string;
  specification?: string;
  quantity: number;
  unit: string;
  deliveryLocation?: string;
  requiredBy?: string;
}

export interface PricingProviderDescriptor {
  id: string;
  name: string;
  sourceType: "public-api" | "vendor-api" | "uploaded-quote" | "company-history";
  termsUrl?: string;
  potentialCost: "free" | "usage-based" | "licensed" | "unknown";
}

export interface PricingProvider {
  descriptor: PricingProviderDescriptor;
  search(request: PricingSearchRequest, signal: AbortSignal): Promise<PriceSnapshot[]>;
}

export function validatePriceEvidence(price: Omit<PriceSnapshot, "id" | "retrievedAt">): string[] {
  const errors: string[] = [];
  if (!price.source.trim()) errors.push("A source URL, attachment, or methodology is required.");
  if (!Number.isFinite(price.unitPrice) || price.unitPrice < 0)
    errors.push("Unit price must be a non-negative number.");
  if (!price.unit.trim()) errors.push("A price unit is required.");
  if (!price.currency.trim()) errors.push("A currency is required.");
  if (price.evidenceClass === "vendor-quote" && !price.vendorId)
    errors.push("Vendor Quote evidence requires an identified vendor.");
  if (price.evidenceClass === "vendor-quote" && !price.quoteDate)
    errors.push("Vendor Quote evidence requires a quote date.");
  return errors;
}

export const priceEvidenceLabels: Record<PriceEvidenceClass, string> = {
  "vendor-quote": "Vendor Quote",
  "published-current-price": "Published Current Price",
  "recent-historical-price": "Recent Historical Price",
  "market-estimate": "Market Estimate",
  "budget-allowance": "Budget Allowance",
};
