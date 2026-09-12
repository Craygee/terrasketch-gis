type RuntimeBindings = Record<string, unknown>;

export interface XweatherUserCredentials {
  clientId: string;
  clientSecret: string;
}

interface WeatherConnectionRow {
  encrypted_credentials: string;
  client_id_hint: string;
  status: "connected" | "invalid" | "error";
  last_tested_at?: string | null;
  last_error?: string | null;
  updated_at?: string | null;
}

interface SupabaseUser {
  id: string;
}

interface RuntimeConfig {
  supabaseUrl: string;
  publishableKey: string;
  encryptionSecret: string;
}

interface CredentialCacheEntry {
  credentials: XweatherUserCredentials;
  expiresAt: number;
}

const processEnv = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;

const buildEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const credentialCache = new Map<string, CredentialCacheEntry>();
const CACHE_TTL_MS = 30_000;
const MAX_CACHED_USERS = 100;

function value(bindings: unknown, names: string[]) {
  for (const name of names) {
    const bound =
      bindings && typeof bindings === "object" ? (bindings as RuntimeBindings)[name] : undefined;
    if (typeof bound === "string" && bound.trim()) return bound.trim();
    const built = buildEnv?.[name];
    if (typeof built === "string" && built.trim()) return built.trim();
    const processed = processEnv?.[name];
    if (typeof processed === "string" && processed.trim()) return processed.trim();
  }
  return "";
}

function runtimeConfig(bindings?: unknown): RuntimeConfig | null {
  const supabaseUrl = value(bindings, ["SUPABASE_URL", "VITE_SUPABASE_URL"]).replace(/\/$/, "");
  const publishableKey = value(bindings, [
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
  ]);
  const encryptionSecret = value(bindings, ["XWEATHER_CREDENTIAL_ENCRYPTION_KEY"]);
  return supabaseUrl && publishableKey && encryptionSecret
    ? { supabaseUrl, publishableKey, encryptionSecret }
    : null;
}

function authorizationToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 8_192) return null;
  const token = authorization.slice(7).trim();
  return token && !/\s/.test(token) ? token : null;
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

async function authenticate(
  request: Request,
  config: RuntimeConfig,
): Promise<{ token: string; user: SupabaseUser } | null> {
  const token = authorizationToken(request);
  if (!token) return null;
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as Partial<SupabaseUser>;
  return typeof user.id === "string" && user.id ? { token, user: { id: user.id } } : null;
}

const restHeaders = (config: RuntimeConfig, token: string, extra: HeadersInit = {}) => ({
  apikey: config.publishableKey,
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  ...extra,
});

async function readConnection(
  config: RuntimeConfig,
  token: string,
  userId: string,
): Promise<WeatherConnectionRow | null> {
  const params = new URLSearchParams({
    select: "encrypted_credentials,client_id_hint,status,last_tested_at,last_error,updated_at",
    user_id: `eq.${userId}`,
    provider_id: "eq.xweather",
    limit: "1",
  });
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/weather_provider_connections?${params}`,
    { headers: restHeaders(config, token) },
  );
  if (!response.ok) {
    if (response.status === 404)
      throw new Error("The Xweather connection migration has not been applied yet");
    throw new Error("LandDraft could not read the Xweather connection");
  }
  const rows = (await response.json()) as WeatherConnectionRow[];
  return rows[0] ?? null;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey(secret: string) {
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptXweatherCredentials(
  credentials: XweatherUserCredentials,
  userId: string,
  secret: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(`landdraft:xweather:${userId}:v1`),
    },
    await encryptionKey(secret),
    plaintext,
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptXweatherCredentials(
  encrypted: string,
  userId: string,
  secret: string,
): Promise<XweatherUserCredentials> {
  const [version, ivText, ciphertextText] = encrypted.split(".");
  if (version !== "v1" || !ivText || !ciphertextText)
    throw new Error("Unsupported credential data");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(ivText),
      additionalData: new TextEncoder().encode(`landdraft:xweather:${userId}:v1`),
    },
    await encryptionKey(secret),
    base64UrlToBytes(ciphertextText),
  );
  const parsed = JSON.parse(
    new TextDecoder().decode(plaintext),
  ) as Partial<XweatherUserCredentials>;
  if (typeof parsed.clientId !== "string" || typeof parsed.clientSecret !== "string")
    throw new Error("Invalid credential data");
  return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
}

async function tokenCacheKey(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

function putCachedCredentials(key: string, credentials: XweatherUserCredentials) {
  if (credentialCache.size >= MAX_CACHED_USERS) {
    const oldest = credentialCache.keys().next().value as string | undefined;
    if (oldest) credentialCache.delete(oldest);
  }
  credentialCache.set(key, { credentials, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function resolveUserXweatherCredentials(
  request: Request,
  bindings?: unknown,
): Promise<XweatherUserCredentials | null> {
  const config = runtimeConfig(bindings);
  const token = authorizationToken(request);
  if (!config || !token) return null;
  const cacheKey = await tokenCacheKey(token);
  const cached = credentialCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.credentials;
  credentialCache.delete(cacheKey);
  const authenticated = await authenticate(request, config);
  if (!authenticated) return null;
  const row = await readConnection(config, authenticated.token, authenticated.user.id);
  if (!row || row.status !== "connected") return null;
  try {
    const credentials = await decryptXweatherCredentials(
      row.encrypted_credentials,
      authenticated.user.id,
      config.encryptionSecret,
    );
    putCachedCredentials(cacheKey, credentials);
    return credentials;
  } catch {
    return null;
  }
}

function validCredentialPart(value: unknown) {
  return (
    typeof value === "string" &&
    value.length >= 6 &&
    value.length <= 300 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function clientIdHint(clientId: string) {
  return clientId.length <= 6
    ? `${clientId.slice(0, 2)}••••`
    : `${clientId.slice(0, 4)}••••${clientId.slice(-4)}`;
}

async function testXweatherCredentials(
  credentials: XweatherUserCredentials,
  origin: string,
): Promise<{ valid: boolean; error?: string | undefined }> {
  const credentialPath = encodeURIComponent(`${credentials.clientId}_${credentials.clientSecret}`);
  const url = `https://maps.api.xweather.com/${credentialPath}/radar-global/0/0/0/current.png`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      Accept: "image/png,image/*;q=0.8",
      Referer: `${origin}/`,
      "User-Agent": "LandDraftWeather/0.2 (https://landdraft.net)",
    },
  });
  if (response.ok && (response.headers.get("content-type") ?? "").startsWith("image/"))
    return { valid: true };
  if (response.status === 429)
    return { valid: true, error: "Connected, but this Xweather account has reached a usage limit" };
  if (response.status === 401)
    return { valid: false, error: "Xweather rejected the client ID or secret" };
  if (response.status === 403)
    return {
      valid: false,
      error: `Xweather rejected this application. Add ${new URL(origin).hostname} to the application's namespace and confirm Raster Maps access.`,
    };
  if (response.status >= 500)
    throw new Error("Xweather is temporarily unavailable; no credentials were saved");
  return { valid: false, error: `Xweather connection test returned HTTP ${response.status}` };
}

async function saveConnection(
  config: RuntimeConfig,
  token: string,
  userId: string,
  encryptedCredentials: string,
  hint: string,
  warning?: string,
) {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/weather_provider_connections?on_conflict=user_id,provider_id`,
    {
      method: "POST",
      headers: restHeaders(config, token, {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify({
        user_id: userId,
        provider_id: "xweather",
        encrypted_credentials: encryptedCredentials,
        client_id_hint: hint,
        status: "connected",
        last_tested_at: new Date().toISOString(),
        last_error: warning ?? null,
      }),
    },
  );
  if (!response.ok) {
    if (response.status === 404)
      throw new Error("The Xweather connection migration has not been applied yet");
    throw new Error("LandDraft could not save the encrypted Xweather connection");
  }
}

async function deleteConnection(config: RuntimeConfig, token: string, userId: string) {
  const params = new URLSearchParams({ user_id: `eq.${userId}`, provider_id: "eq.xweather" });
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/weather_provider_connections?${params}`,
    { method: "DELETE", headers: restHeaders(config, token) },
  );
  if (!response.ok) throw new Error("LandDraft could not disconnect Xweather");
}

export async function handleXweatherConnection(request: Request, bindings?: unknown) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/weather/xweather/connection") return null;
  if (!runtimeConfig(bindings)) {
    return request.method === "GET"
      ? jsonResponse({
          state: "server-not-configured",
          connected: false,
          error: "Secure Xweather connections are not configured for this deployment",
        })
      : jsonResponse({ error: "Secure Xweather connections are not configured" }, 503);
  }
  const config = runtimeConfig(bindings)!;
  const authenticated = await authenticate(request, config);
  if (!authenticated) return jsonResponse({ error: "Sign in to connect Xweather" }, 401);

  try {
    if (request.method === "GET") {
      const row = await readConnection(config, authenticated.token, authenticated.user.id);
      if (!row) return jsonResponse({ state: "not-connected", connected: false });
      return jsonResponse({
        state: row.status === "connected" ? "connected" : "invalid",
        connected: row.status === "connected",
        clientIdHint: row.client_id_hint,
        lastTestedAt: row.last_tested_at ?? undefined,
        updatedAt: row.updated_at ?? undefined,
        error: row.last_error ?? undefined,
      });
    }

    if (request.method === "POST") {
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > 2_048)
        return jsonResponse({ error: "Connection request is too large" }, 413);
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const clientId = body?.["clientId"];
      const clientSecret = body?.["clientSecret"];
      if (!validCredentialPart(clientId) || !validCredentialPart(clientSecret))
        return jsonResponse({ error: "Enter a valid Xweather client ID and secret" }, 400);
      const credentials = { clientId: clientId as string, clientSecret: clientSecret as string };
      const test = await testXweatherCredentials(credentials, url.origin);
      if (!test.valid) return jsonResponse({ error: test.error }, 400);
      const encrypted = await encryptXweatherCredentials(
        credentials,
        authenticated.user.id,
        config.encryptionSecret,
      );
      await saveConnection(
        config,
        authenticated.token,
        authenticated.user.id,
        encrypted,
        clientIdHint(credentials.clientId),
        test.error,
      );
      credentialCache.clear();
      const cacheKey = await tokenCacheKey(authenticated.token);
      putCachedCredentials(cacheKey, credentials);
      return jsonResponse({
        state: "connected",
        connected: true,
        clientIdHint: clientIdHint(credentials.clientId),
        lastTestedAt: new Date().toISOString(),
        error: test.error,
      });
    }

    if (request.method === "DELETE") {
      await deleteConnection(config, authenticated.token, authenticated.user.id);
      credentialCache.clear();
      return jsonResponse({ state: "not-connected", connected: false });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Xweather connection failed";
    return jsonResponse({ error: message }, message.includes("temporarily") ? 502 : 500);
  }
}
