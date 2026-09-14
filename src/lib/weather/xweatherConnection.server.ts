import { approvedXweatherProducts } from "./providerPolicy.server.ts";
import {
  consumeProviderRequest,
  readConnectionBody,
  recordProviderAudit,
} from "./providerOperations.server.ts";
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

const processEnv = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;

const buildEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

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

export async function resolveUserXweatherCredentials(
  request: Request,
  bindings?: unknown,
): Promise<(XweatherUserCredentials & { userId: string }) | null> {
  const config = runtimeConfig(bindings);
  const token = authorizationToken(request);
  if (!config || !token) return null;
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
    return { ...credentials, userId: authenticated.user.id };
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

export function parseXweatherApiKey(value: unknown): XweatherUserCredentials | null {
  if (typeof value !== "string") return null;
  const apiKey = value.trim();
  const separator = apiKey.indexOf("_");
  if (separator <= 0 || separator === apiKey.length - 1) return null;
  const clientId = apiKey.slice(0, separator);
  const clientSecret = apiKey.slice(separator + 1);
  return validCredentialPart(clientId) && validCredentialPart(clientSecret)
    ? { clientId, clientSecret }
    : null;
}

function clientIdHint(clientId: string) {
  return clientId.length <= 6
    ? `${clientId.slice(0, 2)}••••`
    : `${clientId.slice(0, 4)}••••${clientId.slice(-4)}`;
}

async function testXweatherCredentials(
  credentials: XweatherUserCredentials,
  origin: string,
  product = "radar-global",
): Promise<{ valid: boolean; error?: string | undefined }> {
  const credentialPath = encodeURIComponent(`${credentials.clientId}_${credentials.clientSecret}`);
  if (!/^[a-z0-9-]+$/.test(product)) throw new Error("Unsupported product");
  const url = `https://maps.api.xweather.com/${credentialPath}/${product}/0/0/0/current.png`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      Accept: "image/png,image/*;q=0.8",
      Referer: `${origin}/`,
      "User-Agent": "LandDraftWeather/0.2 (https://landdraft.net)",
    },
  }).catch(() => {
    throw new Error("Xweather is temporarily unavailable; no credentials were saved");
  });
  if (response.ok && (response.headers.get("content-type") ?? "").startsWith("image/"))
    return { valid: true };
  if (response.status === 429)
    return {
      valid: false,
      error: "Xweather usage limit reached; product access could not be verified",
    };
  if (response.status === 401) return { valid: false, error: "Xweather rejected this API key" };
  if (response.status === 403)
    return {
      valid: false,
      error: "This Xweather API key is disabled or does not have Raster Maps access",
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
  const correlationId = crypto.randomUUID();
  const audit = (
    action: "connect" | "disconnect" | "test",
    outcome: "success" | "denied" | "failed",
  ) =>
    recordProviderAudit({
      correlationId,
      providerId: "xweather",
      subjectId: authenticated.user.id,
      action,
      outcome,
    });
  if (request.method !== "GET" && !consumeProviderRequest(authenticated.user.id, "connection"))
    return jsonResponse(
      { error: "Too many connection requests. Try again in one minute.", correlationId },
      429,
    );
  if (
    request.method !== "GET" &&
    request.headers.get("origin") &&
    request.headers.get("origin") !== url.origin
  )
    return jsonResponse({ error: "Forbidden", correlationId }, 403);

  try {
    if (request.method === "GET") {
      const row = await readConnection(config, authenticated.token, authenticated.user.id);
      if (!row) return jsonResponse({ state: "not-connected", connected: false });
      if (row.status === "connected") {
        try {
          await decryptXweatherCredentials(
            row.encrypted_credentials,
            authenticated.user.id,
            config.encryptionSecret,
          );
        } catch {
          return jsonResponse({
            state: "invalid",
            connected: false,
            clientIdHint: row.client_id_hint,
            lastTestedAt: row.last_tested_at ?? undefined,
            updatedAt: row.updated_at ?? undefined,
            error: "Reconnect Xweather so LandDraft can securely refresh this connection.",
          });
        }
      }
      return jsonResponse({
        state: row.status === "connected" ? "connected" : "invalid",
        connected: row.status === "connected",
        approvedProducts: approvedXweatherProducts(bindings, authenticated.user.id),
        clientIdHint: row.client_id_hint,
        lastTestedAt: row.last_tested_at ?? undefined,
        updatedAt: row.updated_at ?? undefined,
        error: row.last_error ?? undefined,
      });
    }

    if (request.method === "POST" || request.method === "PATCH") {
      const approvedProducts = approvedXweatherProducts(bindings, authenticated.user.id);
      if (!approvedProducts.length)
        return jsonResponse(
          {
            error:
              "LICENSE REVIEW REQUIRED: LandDraft must approve Xweather proxy/BYOK use before testing credentials",
          },
          403,
        );
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > 2_048)
        return jsonResponse({ error: "Connection request is too large" }, 413);
      const body = await readConnectionBody(request);
      const product =
        typeof body?.["product"] === "string" ? body["product"] : approvedProducts[0]!;
      if (!approvedProducts.includes(product))
        return jsonResponse(
          { error: "This product has no active license grant for your account" },
          403,
        );
      if (request.method === "PATCH") {
        const saved = await resolveUserXweatherCredentials(request, bindings);
        if (!saved) return jsonResponse({ error: "Reconnect Xweather before testing" }, 401);
        const result = await testXweatherCredentials(saved, url.origin, product);
        audit("test", result.valid ? "success" : "denied");
        return jsonResponse({
          state: "connected",
          connected: true,
          approvedProducts,
          verifiedProducts: result.valid ? [product] : [],
          lastTestedAt: new Date().toISOString(),
          ...(result.valid
            ? { lastSuccessfulRequest: new Date().toISOString() }
            : { error: result.error }),
        });
      }
      const clientId = body?.["clientId"];
      const clientSecret = body?.["clientSecret"];
      const credentials =
        parseXweatherApiKey(body?.["apiKey"]) ??
        (validCredentialPart(clientId) && validCredentialPart(clientSecret)
          ? { clientId: clientId as string, clientSecret: clientSecret as string }
          : null);
      if (!credentials)
        return jsonResponse({ error: "Paste a valid complete Xweather API key" }, 400);
      const test = await testXweatherCredentials(credentials, url.origin, product);
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
      audit("connect", "success");
      return jsonResponse({
        state: "connected",
        connected: true,
        approvedProducts: approvedXweatherProducts(bindings, authenticated.user.id),
        verifiedProducts: [product],
        lastSuccessfulRequest: new Date().toISOString(),
        clientIdHint: clientIdHint(credentials.clientId),
        lastTestedAt: new Date().toISOString(),
        error: test.error,
      });
    }

    if (request.method === "DELETE") {
      await deleteConnection(config, authenticated.token, authenticated.user.id);
      audit("disconnect", "success");
      return jsonResponse({ state: "not-connected", connected: false });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Xweather connection failed";
    return jsonResponse({ error: message }, message.includes("temporarily") ? 502 : 500);
  }
}
