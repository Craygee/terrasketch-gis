import type { Feature, Point } from "geojson";
import { distance, point } from "@turf/turf";
import { sourceMetadata } from "./normalize.ts";
import type { WeatherChaserPosition, WeatherPointRequest, WeatherQuality } from "./types.ts";

export const SPOTTER_NETWORK_FEED_PAGE = "https://www.spotternetwork.org/pages/feeds/gibson-ridge";
export const SPOTTER_NETWORK_NO_NAME_FEED = "https://www.spotternetwork.org/feeds/gr-no.txt";
export const SPOTTER_NETWORK_MAX_POSITION_AGE_MINUTES = 30;

const validFeedUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "www.spotternetwork.org")
    throw new Error("Spotter Network feed URL must use the official HTTPS host");
  return url.toString();
};

function statusFromBlock(block: string): WeatherChaserPosition["motionStatus"] {
  if (/\\n(?:MOVING|MOBILE)(?:\\n|")/i.test(block)) return "moving";
  if (/\\nSTATIONARY(?:\\n|")/i.test(block)) return "stationary";
  return "unknown";
}

function positionQuality(ageMinutes: number): WeatherQuality {
  if (ageMinutes <= 3) return "high";
  if (ageMinutes <= 10) return "moderate";
  if (ageMinutes <= SPOTTER_NETWORK_MAX_POSITION_AGE_MINUTES) return "low";
  return "stale";
}

function anonymousPositionId(latitude: number, longitude: number, observedAt: string) {
  const time = observedAt.replace(/\D/g, "");
  const latitudeCell = Math.round((latitude + 90) * 10_000);
  const longitudeCell = Math.round((longitude + 180) * 10_000);
  return `community-spotter-${time}-${latitudeCell}-${longitudeCell}`;
}

/**
 * Parses only coordinate, time and movement status. The upstream feed can
 * contain voluntary identity/contact text even in its no-name variant; that
 * text is never copied into the normalized object.
 */
export function parseSpotterNetworkPositionFeed(
  raw: string,
  receivedAt = new Date().toISOString(),
): WeatherChaserPosition[] {
  const receivedTime = new Date(receivedAt).getTime();
  const positions: WeatherChaserPosition[] = [];
  const blocks = raw.matchAll(
    /^Object:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*$([\s\S]*?)^End:\s*$/gm,
  );

  for (const match of blocks) {
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    const block = match[3] ?? "";
    const timestamp = block.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s+UTC/i);
    if (
      !timestamp ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    )
      continue;

    const observedAt = new Date(`${timestamp[1]}T${timestamp[2]}Z`).toISOString();
    const observedTime = new Date(observedAt).getTime();
    const ageMinutes = Math.max(0, (receivedTime - observedTime) / 60_000);
    if (!Number.isFinite(observedTime) || ageMinutes > SPOTTER_NETWORK_MAX_POSITION_AGE_MINUTES)
      continue;

    const location: Feature<Point> = point([longitude, latitude]);
    const expirationTime = new Date(
      observedTime + SPOTTER_NETWORK_MAX_POSITION_AGE_MINUTES * 60_000,
    ).toISOString();
    positions.push({
      id: anonymousPositionId(latitude, longitude, observedAt),
      location,
      observedAt,
      motionStatus: statusFromBlock(block),
      source: sourceMetadata({
        providerId: "spotter-network-evaluation",
        providerName: "Spotter Network",
        product: "privacy-minimized trained spotter position",
        temporalKind: "observed",
        sourceTimestamp: observedAt,
        validTime: observedAt,
        expirationTime,
        quality: positionQuality(ageMinutes),
        qualityFlags: [
          "COMMUNITY_POSITION",
          "IDENTITY_REMOVED",
          "NON_COMMERCIAL_PERMISSION_REQUIRED",
        ],
        rawSourceReference: SPOTTER_NETWORK_FEED_PAGE,
        attribution: "Spotter Network; identities and contact details removed by LandDraft",
      }),
    });
  }

  return [...new Map(positions.map((position) => [position.id, position])).values()];
}

export function nearbySpotterNetworkPositions(
  positions: WeatherChaserPosition[],
  request: WeatherPointRequest,
  radiusKm = 800,
  limit = 500,
) {
  const center = point([request.longitude, request.latitude]);
  return positions
    .map((position) => ({
      position,
      distanceKm: distance(center, position.location, { units: "kilometers" }),
    }))
    .filter(({ distanceKm }) => distanceKm <= radiusKm)
    .sort(
      (left, right) =>
        new Date(right.position.observedAt).getTime() -
          new Date(left.position.observedAt).getTime() || left.distanceKm - right.distanceKm,
    )
    .slice(0, limit)
    .map(({ position }) => position);
}

export async function loadSpotterNetworkPositionFeed(
  signal: AbortSignal,
  feedUrl = SPOTTER_NETWORK_NO_NAME_FEED,
) {
  const response = await fetch(validFeedUrl(feedUrl), {
    signal,
    headers: {
      Accept: "text/plain",
      "User-Agent": "LandDraftWeather/0.1 (https://landdraft.net)",
    },
  });
  if (!response.ok) throw new Error(`Spotter Network returned HTTP ${response.status}`);
  return parseSpotterNetworkPositionFeed(await response.text());
}
