import { addProtocol, type AddProtocolAction } from "maplibre-gl";

import { getCloudSession } from "@/lib/cloud";

export const XWEATHER_MAP_PROTOCOL = "landdraft-xweather";
export const XWEATHER_TILE_ERROR_EVENT = "landdraft:xweather-tile-error";
export const XWEATHER_TILE_SUCCESS_EVENT = "landdraft:xweather-tile-success";

export interface XweatherTileErrorDetail {
  message: string;
  status?: number | undefined;
}

let protocolInstalled = false;
let lastError = "";
let lastErrorAt = 0;

function proxyPath(protocolUrl: string) {
  const prefix = `${XWEATHER_MAP_PROTOCOL}://`;
  if (!protocolUrl.startsWith(prefix)) throw new Error("Invalid Xweather tile URL");
  const relative = protocolUrl.slice(prefix.length);
  if (!/^tiles\/[a-z0-9-]+\/\d{1,2}\/\d+\/\d+\/[a-z0-9+.-]+\.png$/i.test(relative))
    throw new Error("Invalid Xweather tile URL");
  return `/api/weather/xweather/${relative}`;
}

function reportError(detail: XweatherTileErrorDetail) {
  if (typeof window === "undefined") return;
  const key = `${detail.status ?? 0}:${detail.message}`;
  const now = Date.now();
  if (key === lastError && now - lastErrorAt < 15_000) return;
  lastError = key;
  lastErrorAt = now;
  window.dispatchEvent(
    new CustomEvent<XweatherTileErrorDetail>(XWEATHER_TILE_ERROR_EVENT, { detail }),
  );
}

function reportSuccess() {
  if (typeof window === "undefined" || !lastError) return;
  lastError = "";
  lastErrorAt = 0;
  window.dispatchEvent(new Event(XWEATHER_TILE_SUCCESS_EVENT));
}

const loadXweatherTile: AddProtocolAction = async (parameters, abortController) => {
  try {
    const session = await getCloudSession();
    const response = await fetch(proxyPath(parameters.url), {
      signal: abortController.signal,
      cache: "default",
      headers: {
        Accept: "image/png,image/*;q=0.8",
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!response.ok) {
      const message =
        (await response.text().catch(() => "")).trim() ||
        `Xweather tile request failed (${response.status})`;
      reportError({ message, status: response.status });
      throw new Error(message);
    }
    reportSuccess();
    return { data: await response.arrayBuffer() };
  } catch (error) {
    if (abortController.signal.aborted) throw error;
    const message = error instanceof Error ? error.message : "Xweather tile request failed";
    reportError({ message });
    throw error;
  }
};

export function installXweatherMapProtocol() {
  if (protocolInstalled || typeof window === "undefined") return;
  addProtocol(XWEATHER_MAP_PROTOCOL, loadXweatherTile);
  protocolInstalled = true;
}
