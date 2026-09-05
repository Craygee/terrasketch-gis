const env = import.meta.env as Record<string, string | undefined>;

const cloudUrl = env["VITE_SUPABASE_URL"]?.trim().replace(/\/$/, "") ?? "";
const publishableKey =
  env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.trim() ?? env["VITE_SUPABASE_ANON_KEY"]?.trim() ?? "";

export const cloudConfigured = Boolean(cloudUrl && publishableKey);

export type CloudOAuthProvider = "google" | "apple";

export interface CloudUserRecord {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface CloudSessionPayload {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user: CloudUserRecord;
}

const SESSION_KEY = "landdraft.cloud-session.v1";
let memorySession: CloudSessionPayload | null = null;
let refreshPromise: Promise<CloudSessionPayload> | null = null;

export class CloudRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudRequestError";
    this.status = status;
  }
}

const assertConfigured = () => {
  if (!cloudConfigured)
    throw new Error("Cloud storage has not been configured for this deployment");
};

const normalizeSession = (session: CloudSessionPayload): CloudSessionPayload => ({
  ...session,
  expires_at:
    session.expires_at ?? Math.floor(Date.now() / 1000) + Math.max(session.expires_in ?? 3600, 60),
});

export const storeCloudSession = (session: CloudSessionPayload) => {
  const normalized = normalizeSession(session);
  memorySession = normalized;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
  return normalized;
};

export const clearCloudSession = () => {
  memorySession = null;
  window.localStorage.removeItem(SESSION_KEY);
};

export const readCloudSession = (): CloudSessionPayload | null => {
  if (memorySession) return memorySession;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudSessionPayload;
    if (!parsed.access_token || !parsed.refresh_token || !parsed.user?.id) return null;
    memorySession = normalizeSession(parsed);
    return memorySession;
  } catch {
    clearCloudSession();
    return null;
  }
};

const parseError = async (response: Response) => {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const message = body["message"] ?? body["msg"] ?? body["error_description"] ?? body["error"];
    if (typeof message === "string") return message;
  } catch {
    // The status text below remains useful when an upstream response is not JSON.
  }
  return response.statusText || "Cloud request failed";
};

const baseHeaders = () => ({
  apikey: publishableKey,
  "Content-Type": "application/json",
});

export async function cloudAuthRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertConfigured();
  const response = await fetch(`${cloudUrl}/auth/v1${path}`, {
    ...init,
    headers: { ...baseHeaders(), ...init.headers },
  });
  if (!response.ok) throw new CloudRequestError(await parseError(response), response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function createCloudOAuthUrl(provider: CloudOAuthProvider, redirectTo: string): string {
  assertConfigured();
  const authorizeUrl = new URL(`${cloudUrl}/auth/v1/authorize`);
  authorizeUrl.searchParams.set("provider", provider);
  authorizeUrl.searchParams.set("redirect_to", redirectTo);
  return authorizeUrl.toString();
}

export async function refreshCloudSession(): Promise<CloudSessionPayload> {
  if (refreshPromise) return refreshPromise;
  const session = readCloudSession();
  if (!session?.refresh_token) throw new Error("Your session has expired. Sign in again.");
  refreshPromise = cloudAuthRequest<CloudSessionPayload>("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  })
    .then(storeCloudSession)
    .catch((error) => {
      clearCloudSession();
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function getCloudSession(): Promise<CloudSessionPayload> {
  const session = readCloudSession();
  if (!session) throw new Error("Sign in to open your cloud workspace");
  if ((session.expires_at ?? 0) <= Math.floor(Date.now() / 1000) + 60) return refreshCloudSession();
  return session;
}

async function authorizedCloudFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  assertConfigured();
  const session = await getCloudSession();
  const response = await fetch(`${cloudUrl}${path}`, {
    ...init,
    headers: {
      ...baseHeaders(),
      Authorization: `Bearer ${session.access_token}`,
      ...init.headers,
    },
  });
  if (response.status === 401 && retry) {
    await refreshCloudSession();
    return authorizedCloudFetch(path, init, false);
  }
  if (!response.ok) throw new CloudRequestError(await parseError(response), response.status);
  return response;
}

export async function cloudDataRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const response = await authorizedCloudFetch(path, init, retry);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Calls an authenticated Supabase Edge Function without exposing server secrets. */
export async function cloudFunctionRequest<T>(name: string, body: unknown): Promise<T> {
  return cloudDataRequest<T>(`/functions/v1/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const storagePath = (path: string) =>
  path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

export async function uploadPrivateProjectFile(path: string, data: Blob): Promise<void> {
  await authorizedCloudFetch(`/storage/v1/object/project-assets/${storagePath(path)}`, {
    method: "POST",
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: data,
  });
}

export async function downloadPrivateProjectFile(path: string): Promise<ArrayBuffer> {
  const response = await authorizedCloudFetch(
    `/storage/v1/object/project-assets/${storagePath(path)}`,
  );
  return response.arrayBuffer();
}

export async function listPrivateProjectFiles(prefix: string): Promise<string[]> {
  const rows = await cloudDataRequest<{ name: string }[]>(
    "/storage/v1/object/list/project-assets",
    {
      method: "POST",
      body: JSON.stringify({
        prefix,
        limit: 1000,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      }),
    },
  );
  return rows.filter((row) => row.name).map((row) => `${prefix}/${row.name}`);
}

export async function deletePrivateProjectFiles(paths: string[]): Promise<void> {
  if (!paths.length) return;
  await cloudDataRequest("/storage/v1/object/project-assets", {
    method: "DELETE",
    body: JSON.stringify({ prefixes: paths }),
  });
}

export const cloudConfiguration = {
  url: cloudUrl,
  publishableKey,
};
