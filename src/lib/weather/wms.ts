import { validIso } from "./normalize.ts";
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function wmsTimes(xml: string, layerName: string, daily = false, now = Date.now()) {
  const nameMatch = new RegExp(`<Name>\\s*${escapeRegex(layerName)}\\s*</Name>`, "i").exec(xml);
  const scoped = nameMatch
    ? xml.slice(nameMatch.index, xml.indexOf("</Layer>", nameMatch.index))
    : xml;
  const dimension = /<Dimension[^>]*name=["']time["'][^>]*>([\s\S]*?)<\/Dimension>/i.exec(scoped);
  if (!dimension) return [];
  const raw = dimension[1]?.trim() ?? "";
  if (raw.includes("/")) {
    // Some NASA layers advertise multiple disjoint availability intervals.
    // Selecting the end of the first interval can make current imagery appear
    // decades stale, so retain the newest valid interval end instead.
    const ends = raw
      .split(",")
      .flatMap((interval) => {
        const [start, end, period] = interval.trim().split("/");
        if (daily && period === "P1D" && validIso(start) && validIso(end)) {
          const last = Math.min(Date.parse(end!), Math.floor(now / 86400000) * 86400000);
          return Array.from({ length: 5 }, (_, i) => last - (4 - i) * 86400000)
            .filter((time) => time >= Date.parse(start!))
            .map((time) => new Date(time).toISOString());
        }
        return [validIso(end)];
      })
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
    return ends.slice(daily ? -5 : -1);
  }
  return raw
    .split(",")
    .map((value) => validIso(value.trim()))
    .filter((value): value is string => Boolean(value));
}

export function wmsTimeParameter(timestamp: string, daily = false) {
  // GIBS rejects fractional seconds. Daily imagery uses the advertised date granularity.
  return daily ? timestamp.slice(0, 10) : timestamp.replace(/\.\d{3}Z$/, "Z");
}

export function selectWmsTimes(times: string[], kind: string, count: number, now = Date.now()) {
  if (!times.length) return [new Date(now).toISOString()];
  const sorted = [...new Set(times)].sort((a, b) => Date.parse(a) - Date.parse(b));
  if (kind === "observed") return sorted.filter((time) => Date.parse(time) <= now).slice(-count);
  // Start at the nearest valid forecast, rather than the remote end of the forecast horizon.
  const future = sorted.findIndex((time) => Date.parse(time) >= now);
  return sorted.slice(
    future < 0 ? -count : Math.max(0, future - 1),
    future < 0 ? undefined : Math.max(0, future - 1) + count,
  );
}
