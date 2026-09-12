import { getCloudSession } from "@/lib/cloud";

export type XweatherConnectionState =
  "loading" | "not-connected" | "connected" | "invalid" | "server-not-configured";

export interface XweatherConnectionStatus {
  state: XweatherConnectionState;
  connected: boolean;
  clientIdHint?: string | undefined;
  lastTestedAt?: string | undefined;
  updatedAt?: string | undefined;
  error?: string | undefined;
}

type ConnectionResponse = XweatherConnectionStatus & { message?: string | undefined };

async function connectionRequest(init: RequestInit = {}): Promise<XweatherConnectionStatus> {
  const session = await getCloudSession();
  const response = await fetch("/api/weather/xweather/connection", {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<ConnectionResponse>;
  if (!response.ok)
    throw new Error(payload.error || payload.message || "Xweather connection request failed");
  return {
    state: payload.state ?? "not-connected",
    connected: payload.connected === true,
    ...(payload.clientIdHint ? { clientIdHint: payload.clientIdHint } : {}),
    ...(payload.lastTestedAt ? { lastTestedAt: payload.lastTestedAt } : {}),
    ...(payload.updatedAt ? { updatedAt: payload.updatedAt } : {}),
    ...(payload.error ? { error: payload.error } : {}),
  };
}

export const loadingXweatherConnection = (): XweatherConnectionStatus => ({
  state: "loading",
  connected: false,
});

export const getXweatherConnection = () => connectionRequest();

export const connectXweather = (apiKey: string) =>
  connectionRequest({
    method: "POST",
    body: JSON.stringify({ apiKey: apiKey.trim() }),
  });

export const disconnectXweather = () => connectionRequest({ method: "DELETE" });
