/** Official SPC GIS catalog, reviewed 2026-09-13; NOAA/NWS public product terms. */
export const SPC_PRODUCTS = [
  ...[1, 2, 3].map((day) => ({
    day,
    kind: "categorical",
    suffix: "cat",
    label: "categorical outlook",
  })),
  ...[1, 2].flatMap((day) => [
    { day, kind: "tornado", suffix: "torn", label: "tornado probability" },
    { day, kind: "wind", suffix: "wind", label: "wind probability" },
    { day, kind: "hail", suffix: "hail", label: "hail probability" },
  ]),
  { day: 3, kind: "severe", suffix: "prob", label: "severe-weather probability" },
  ...[4, 5, 6, 7, 8].map((day) => ({
    day,
    kind: "severe",
    suffix: "prob",
    label: "severe-weather probability",
  })),
].map((product) => ({
  ...product,
  layerId: `weather.spc.day${product.day}.${product.kind}`,
  productId: `day${product.day}-${product.kind}`,
  name: `OFFICIAL SPC · Day ${product.day} ${product.label}`,
  url:
    product.day >= 4
      ? `https://www.spc.noaa.gov/products/exper/day4-8/day${product.day}prob.lyr.geojson`
      : `https://www.spc.noaa.gov/products/outlook/day${product.day}otlk_${product.suffix}.lyr.geojson`,
}));
export type SpcProduct = (typeof SPC_PRODUCTS)[number];
export function spcProduct(day: number, kind = "categorical"): SpcProduct {
  const product = SPC_PRODUCTS.find((item) => item.day === day && item.kind === kind);
  if (!product) throw new Error("Unsupported SPC outlook product");
  return product;
}
