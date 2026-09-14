// Opt-in public network contract check. No accounts, secrets, or persisted fixtures.
import { SPC_PRODUCTS } from "../src/lib/weather/spcCatalog.ts";
import { parseSpcOutlook } from "../src/lib/weather/spc.ts";
let failures = 0;
for (const product of SPC_PRODUCTS) {
  try {
    const response = await fetch(product.url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const outlook = parseSpcOutlook(await response.json(), product.day, Date.now(), product.kind);
    console.log(
      `${product.productId}: OK; ${outlook.areas.length} contours; ${outlook.statement ?? "source colors retained"}`,
    );
  } catch (error) {
    failures++;
    console.error(
      `${product.productId}: FAIL; ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
}
process.exitCode = failures ? 1 : 0;
