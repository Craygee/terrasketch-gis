import { cloudConfigured, cloudDataRequest } from "@/lib/cloud";
import type { WeatherChaserPosition } from "./types";

interface ActiveChaserPresenceRow {
  presence_id: string;
  display_name: string;
  latitude: number;
  longitude: number;
  heading_deg: number | null;
  speed_mps: number | null;
  accuracy_m: number | null;
  observed_at: string;
}

export interface ChaserPresenceInput {
  displayName: string;
  latitude: number;
  longitude: number;
  headingDeg?: number | undefined;
  speedMS?: number | undefined;
  accuracyM?: number | undefined;
}

export interface ChaserPresenceSearch {
  latitude: number;
  longitude: number;
  radiusKm?: number | undefined;
}

function presenceSource(observedAt: string) {
  const now = new Date().toISOString();
  return {
    providerId: "landdraft-chaser-presence",
    providerName: "LandDraft opt-in chaser presence",
    product: "Ephemeral user-shared chaser locations",
    temporalKind: "observed" as const,
    sourceTimestamp: observedAt,
    receivedTimestamp: now,
    validTime: observedAt,
    expirationTime: new Date(new Date(observedAt).getTime() + 10 * 60_000).toISOString(),
    confidence: 1,
    quality: "high" as const,
    qualityFlags: ["explicit-user-opt-in", "ephemeral", "not-provider-verified"],
    attribution: "LandDraft users sharing location by explicit consent",
  };
}

export async function listActiveChaserPresences(
  search: ChaserPresenceSearch,
): Promise<WeatherChaserPosition[]> {
  if (!cloudConfigured) return [];
  const rows = await cloudDataRequest<ActiveChaserPresenceRow[]>(
    "/rest/v1/rpc/list_active_weather_chasers",
    {
      method: "POST",
      body: JSON.stringify({
        p_latitude: search.latitude,
        p_longitude: search.longitude,
        p_radius_km: search.radiusKm ?? 800,
      }),
    },
  );
  return rows.map((row) => ({
    id: `landdraft-chaser-${row.presence_id}`,
    location: {
      type: "Feature",
      geometry: { type: "Point", coordinates: [row.longitude, row.latitude] },
      properties: {},
    },
    observedAt: row.observed_at,
    motionStatus: (row.speed_mps ?? 0) > 0.8 ? "moving" : "stationary",
    featured: false,
    memberClass: "unknown",
    displayName: row.display_name,
    ...(row.heading_deg === null ? {} : { headingDeg: row.heading_deg }),
    ...(row.speed_mps === null ? {} : { speedMS: row.speed_mps }),
    source: presenceSource(row.observed_at),
  }));
}

export async function publishChaserPresence(input: ChaserPresenceInput): Promise<void> {
  if (!cloudConfigured) throw new Error("Cloud sign-in is required to share a chaser location");
  await cloudDataRequest("/rest/v1/rpc/upsert_weather_chaser_presence", {
    method: "POST",
    body: JSON.stringify({
      p_display_name: input.displayName,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_heading_deg: input.headingDeg ?? null,
      p_speed_mps: input.speedMS ?? null,
      p_accuracy_m: input.accuracyM ?? null,
    }),
  });
}

export async function stopChaserPresence(): Promise<void> {
  if (!cloudConfigured) return;
  await cloudDataRequest("/rest/v1/rpc/stop_weather_chaser_presence", {
    method: "POST",
    body: "{}",
  });
}
