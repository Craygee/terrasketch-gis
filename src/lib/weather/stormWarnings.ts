import { booleanIntersects } from "@turf/turf";
import type { StormObject, WeatherAlert } from "./types.ts";

/** Official polygons retain their own geometry and authority; this only links intersecting objects. */
export function linkStormWarnings(storms: StormObject[], alerts: WeatherAlert[], now = Date.now()) {
  return storms.map((storm) => ({
    ...storm,
    officialAlertIds: alerts
      .filter((alert) => {
        if (!alert.geometry || !storm.geometry || alert.status !== "actual") return false;
        if (alert.source.expirationTime && Date.parse(alert.source.expirationTime) < now)
          return false;
        try {
          return booleanIntersects(storm.geometry, alert.geometry);
        } catch {
          return false;
        }
      })
      .map((alert) => alert.id),
  }));
}
