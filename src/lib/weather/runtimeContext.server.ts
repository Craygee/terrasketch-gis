import { AsyncLocalStorage } from "node:async_hooks";

// Cloudflare deployment already enables nodejs_compat. Request-local bindings
// avoid mutable process-global configuration crossing tenants or environments.
const weatherContext = new AsyncLocalStorage<{
  bindings: unknown;
  request: Request;
  authenticatedUserId?: string;
}>();
export function runWithWeatherContext<T>(bindings: unknown, request: Request, work: () => T): T {
  return weatherContext.run({ bindings, request }, work);
}
export const currentWeatherContext = () => weatherContext.getStore();
