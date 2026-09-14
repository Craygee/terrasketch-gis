const usage = new Map<string, { count: number; until: number }>();

export function consumeWaterRequest(userId: string, now = Date.now()) {
  for (const [id, row] of usage) if (row.until <= now) usage.delete(id);
  const row = usage.get(userId);
  if (row && row.count >= 12) return false;
  if (!row && usage.size >= 1000) return false;
  usage.set(userId, { count: (row?.count ?? 0) + 1, until: row?.until ?? now + 60_000 });
  return true;
}

export async function requireWaterAccess(token: string) {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  if (env?.["VITE_WATER_MODULE_DISABLED"] === "true")
    throw new Error("Water is disabled in this environment.");
  const url = env?.["VITE_SUPABASE_URL"]?.replace(/\/$/, "");
  const key = env?.["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env?.["VITE_SUPABASE_ANON_KEY"];
  if (!url || !key || !token || token.length > 8192 || /\s/.test(token))
    throw new Error("Sign in to analyze water.");
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Your session expired. Sign in again.");
  const user = (await response.json()) as { id?: string };
  if (!user.id || !consumeWaterRequest(user.id))
    throw new Error("Water request limit reached. Retry in one minute.");
  // Do not cache bearer tokens, log precise areas, or treat this as a paid-module grant.
}
