import { z } from "zod";
import type { SpcOutlook, WeatherTimelineState } from "./types.ts";
import { spcProduct } from "./spcCatalog.ts";

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ring = z
  .array(position)
  .min(4)
  .max(100_000)
  .refine((points) => points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1]);
const polygon = z.array(ring).min(1).max(1_000);
const geometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygon }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(polygon).min(1).max(1_000) }),
]);
const payloadSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z
    .array(
      z.object({
        type: z.literal("Feature"),
        geometry: z.union([
          geometry,
          z.object({
            type: z.literal("GeometryCollection"),
            geometries: z.array(z.never()).length(0),
          }),
        ]),
        properties: z.object({
          ISSUE_ISO: z.string().datetime({ offset: true }),
          VALID_ISO: z.string().datetime({ offset: true }),
          EXPIRE_ISO: z.string().datetime({ offset: true }),
          LABEL: z.string().min(1).max(80),
          LABEL2: z.string().max(160).optional(),
          DN: z.number().optional(),
          fill: z.string().regex(/^(#[0-9a-f]{6})?$/i),
          stroke: z.string().regex(/^(#[0-9a-f]{6})?$/i),
        }),
      }),
    )
    .min(1)
    .max(500),
});

export function spcUrl(day: number, kind = "categorical"): string {
  return spcProduct(day, kind).url;
}

/** Reject the entire product on partial/malformed data; absence is never all-clear. */
export function parseSpcOutlook(
  input: unknown,
  day: number,
  now = Date.now(),
  kind = "categorical",
): SpcOutlook {
  const product = spcProduct(day, kind);
  const url = product.url;
  const payload = payloadSchema.parse(input);
  const first = payload.features[0]!.properties;
  const issued = Date.parse(first.ISSUE_ISO);
  const valid = Date.parse(first.VALID_ISO);
  const expires = Date.parse(first.EXPIRE_ISO);
  if (
    issued > now + 60_000 ||
    now - issued > 36 * 3_600_000 ||
    expires <= now ||
    expires <= valid ||
    expires - valid > 48 * 3_600_000 ||
    valid - now > 9 * 86_400_000 ||
    payload.features.some(
      ({ properties: p }) =>
        Date.parse(p.ISSUE_ISO) !== issued ||
        Date.parse(p.VALID_ISO) !== valid ||
        Date.parse(p.EXPIRE_ISO) !== expires,
    )
  ) {
    throw new Error("SPC outlook has expired, inconsistent, or invalid times");
  }
  const sentinel = payload.features.filter(
    (feature) => feature.geometry.type === "GeometryCollection",
  );
  if (
    sentinel.length &&
    (payload.features.length !== 1 ||
      first.DN !== 0 ||
      first.fill !== "" ||
      first.stroke !== "" ||
      !/^(Less Than (2|5|15)% All Areas|Potential Too Low|Predictability Too Low)$/.test(
        first.LABEL,
      ))
  ) {
    throw new Error("Unrecognized SPC no-contour statement");
  }
  if (
    !sentinel.length &&
    payload.features.some((feature) => !feature.properties.fill || !feature.properties.stroke)
  )
    throw new Error("Missing official SPC contour colors");
  return {
    layerId: product.layerId,
    day,
    ...(sentinel.length ? { statement: first.LABEL } : {}),
    areas: payload.features.flatMap((feature) =>
      feature.geometry.type === "GeometryCollection"
        ? []
        : [
            {
              type: "Feature",
              geometry: feature.geometry,
              properties: {
                label: feature.properties.LABEL2 || feature.properties.LABEL,
                fill: feature.properties.fill,
                stroke: feature.properties.stroke,
              },
            },
          ],
    ),
    source: {
      providerId: "spc",
      providerName: "NOAA Storm Prediction Center",
      product: product.name,
      temporalKind: "forecast",
      sourceTimestamp: new Date(issued).toISOString(),
      validTime: new Date(valid).toISOString(),
      expirationTime: new Date(expires).toISOString(),
      receivedTimestamp: new Date(now).toISOString(),
      quality: "high",
      qualityFlags: ["LATEST_ISSUANCE_ONLY"],
      rawSourceReference: url,
      attribution: "NOAA / NWS Storm Prediction Center. No endorsement of LandDraft implied.",
    },
  };
}

export function spcCurrent(outlook: SpcOutlook, now = Date.now()): boolean {
  const retrieved = Date.parse(outlook.source.receivedTimestamp);
  return (
    Number.isFinite(retrieved) &&
    retrieved <= now + 60_000 &&
    now - retrieved <= 600_000 &&
    Date.parse(outlook.source.expirationTime ?? "") > now
  );
}

export function spcVisible(outlook: SpcOutlook, timeline: WeatherTimelineState, now = Date.now()) {
  if (!spcCurrent(outlook, now) || timeline.mode === "historical") return false;
  if (timeline.mode === "observed") return true; // Live view: explicitly labeled forecast.
  const selected = Date.parse(timeline.selectedTime);
  return (
    selected >= Date.parse(outlook.source.validTime ?? "") &&
    selected < Date.parse(outlook.source.expirationTime ?? "")
  );
}
