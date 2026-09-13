import type { WeatherLayerDefinition, WeatherRasterFrame, WeatherTimelineState } from "./types.ts";

export const RAINFALL_SERVICE =
  "https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer";
export const RAINFALL_HOURS = [1, 3, 6, 12, 24, 48, 72] as const;
// Original LandDraft scale in inches; the unrendered MRMS pixels are millimetres.
// Verified against NOAA rft_48hr: raw 18.300001144 maps to its 0.50–0.75 inch band.
export const RAINFALL_SCALE = [
  { min: 0.01, max: 0.1, color: "#b7e4e0" },
  { min: 0.1, max: 0.25, color: "#62c4be" },
  { min: 0.25, max: 0.5, color: "#239b91" },
  { min: 0.5, max: 1, color: "#2479a8" },
  { min: 1, max: 2, color: "#5453b6" },
  { min: 2, max: 4, color: "#a345a3" },
  { min: 4, max: 8, color: "#d45576" },
  { min: 8, max: 1000, color: "#f4ac65" },
];
export const rainfallLayerId = (hours: number) => `weather.rainfall.${hours}h`;
export const rainfallLayers: WeatherLayerDefinition[] = RAINFALL_HOURS.map((hours) => ({
  id: rainfallLayerId(hours),
  name: `${hours}-hour rainfall`,
  group: "Radar",
  description: `LandDraft rendering of NOAA MRMS ${hours}-hour radar-estimated rainfall. Approximately 1 km grid; not a rain gauge measurement or a flood-depth prediction. Latest accumulation only.`,
  capability: "weather.radar",
  dataType: "raster",
  providerProducts: [`mrms-qpe-${hours}h`],
  units: "in",
  defaultOpacity: 0.7,
  minZoom: 0,
  maxZoom: 20,
  animationSupport: false,
  timeSupport: true,
  inspectSupport: true,
  mobileVisibility: "drawer",
  audience: "basic",
  attribution: "NOAA/NWS MRMS data · LandDraft visualization",
  providerName: "NOAA/NWS MRMS",
  coverage: "CONUS, Alaska, Hawaii and Puerto Rico",
  legend: RAINFALL_SCALE.map((entry) => ({
    color: entry.color,
    label: entry.max === 1000 ? "8+ in" : `${entry.min}–${entry.max} in`,
  })),
}));

export function rainfallRenderingRule() {
  return {
    rasterFunction: "Colormap",
    rasterFunctionArguments: {
      Raster: {
        rasterFunction: "Remap",
        rasterFunctionArguments: {
          Raster: "$$",
          InputRanges: RAINFALL_SCALE.flatMap(({ min, max }) => [min * 25.4, max * 25.4]),
          OutputValues: RAINFALL_SCALE.map((_, index) => index + 1),
          NoDataRanges: [-1e10, 0.01 * 25.4],
          AllowUnmatched: false,
        },
        outputPixelType: "U8",
      },
      Colormap: RAINFALL_SCALE.map(({ color }, index) => [
        index + 1,
        ...[1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)),
      ]),
    },
  };
}

export interface RainfallCatalogItem {
  attributes: { objectid: number; idp_subset: string; idp_validendtime: number };
}

export function rainfallFrames(
  items: RainfallCatalogItem[],
  requested: string[],
  now = Date.now(),
): WeatherRasterFrame[] {
  return RAINFALL_HOURS.filter((hours) => requested.includes(rainfallLayerId(hours))).flatMap(
    (hours) => {
      const matching = items.filter(
        ({ attributes: a }) =>
          Number.isSafeInteger(a.objectid) &&
          a.objectid > 0 &&
          /^(conus|alaska|hawaii|carib)_QPE_\d{2}H$/.test(a.idp_subset) &&
          a.idp_subset.endsWith(`_QPE_${String(hours).padStart(2, "0")}H`) &&
          Number.isFinite(a.idp_validendtime) &&
          a.idp_validendtime > 0 &&
          a.idp_validendtime <= now + 60000,
      );
      const latest = Math.max(...matching.map(({ attributes: a }) => a.idp_validendtime));
      if (!Number.isFinite(latest) || now - latest > 2 * 3600000) return [];
      // Do not mix accumulation windows from different updates.
      const ids = matching
        .filter(({ attributes: a }) => a.idp_validendtime === latest)
        .map(({ attributes: a }) => a.objectid);
      const timestamp = new Date(latest).toISOString();
      const params = new URLSearchParams({
        f: "image",
        bboxSR: "3857",
        imageSR: "3857",
        size: "256,256",
        format: "png32",
        transparent: "true",
        interpolation: "RSP_NearestNeighbor",
        mosaicRule: JSON.stringify({
          mosaicMethod: "esriMosaicLockRaster",
          lockRasterIds: ids,
          mosaicOperation: "MT_FIRST",
        }),
        renderingRule: JSON.stringify(rainfallRenderingRule()),
      });
      return [
        {
          id: `landdraft-qpe-${hours}-${latest}`,
          layerId: rainfallLayerId(hours),
          timestamp,
          tileUrlTemplate: `${RAINFALL_SERVICE}/exportImage?${params}&bbox={bbox-epsg-3857}`,
          coverage: "CONUS, Alaska, Hawaii and Puerto Rico; radar gaps possible",
          source: {
            providerId: "mrms",
            providerName: "NOAA/NWS MRMS",
            product: `${hours}-hour radar-estimated rainfall · LandDraft colors`,
            temporalKind: "observed" as const,
            quality: "estimated" as const,
            qualityFlags: ["RADAR_ESTIMATE", "LATEST_ACCUMULATION_ONLY"],
            sourceTimestamp: timestamp,
            validTime: timestamp,
            receivedTimestamp: new Date(now).toISOString(),
            resolution: "1 km",
            rawSourceReference: RAINFALL_SERVICE,
            attribution: "NOAA/NWS MRMS data · LandDraft visualization; no NOAA endorsement",
          },
        },
      ];
    },
  );
}

/** Zero is valid; missing/no-data must never become zero rainfall. */
export function rainfallSample(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric < 25400 ? numeric / 25.4 : undefined;
}

export function rainfallVisible(
  frame: WeatherRasterFrame,
  timeline: WeatherTimelineState,
  now = Date.now(),
) {
  const end = Date.parse(frame.timestamp);
  const selected = Date.parse(timeline.selectedTime);
  return (
    timeline.mode === "observed" &&
    Number.isFinite(end) &&
    end <= now + 60000 &&
    now - end <= 7200000 &&
    selected >= end &&
    selected <= now + 60000
  );
}
