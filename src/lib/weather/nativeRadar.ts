import type { WeatherRadarSite } from "./radar.ts";
export const nativeMapLayerId = (layerId: string) =>
  `landdraft-native-${layerId.replaceAll(".", "-")}`;

export const NATIVE_RADAR_PRODUCTS = {
  "weather.radar.pro.reflectivity": {
    suffix: "B",
    code: 153,
    name: "Reflectivity",
    units: "dBZ",
    rangeKm: 460,
  },
  "weather.radar.pro.velocity": {
    suffix: "G",
    code: 154,
    name: "Radial velocity",
    units: "m/s",
    rangeKm: 300,
  },
  "weather.radar.pro.correlation": {
    suffix: "C",
    code: 161,
    name: "Correlation coefficient",
    units: "ratio",
    rangeKm: 300,
  },
  "weather.radar.pro.differential-reflectivity": {
    suffix: "X",
    code: 159,
    name: "Differential reflectivity",
    units: "dB",
    rangeKm: 300,
  },
  "weather.radar.pro.specific-phase": {
    suffix: "K",
    code: 163,
    name: "Specific differential phase",
    units: "°/km",
    rangeKm: 300,
  },
  "weather.radar.pro.hydrometeor": {
    suffix: "H",
    code: 165,
    name: "Hydrometeor classification",
    units: "class",
    rangeKm: 300,
  },
} as const;
export type NativeRadarLayer = keyof typeof NATIVE_RADAR_PRODUCTS;
export interface NativeRadarFrame {
  id: string;
  layerId: NativeRadarLayer;
  timestamp: string;
  binaryUrl: string;
  site: WeatherRadarSite;
  product: string;
}
export interface NativeRadarScan {
  layerId: NativeRadarLayer;
  latitude: number;
  longitude: number;
  altitudeM: number;
  elevationDeg: number;
  timestamp: string;
  generatedAt: string;
  rangeKm: number;
  gateWidthKm: number;
  firstGate: number;
  bins: number;
  rays: number;
  angles: Float32Array;
  widths: Float32Array;
  data: Uint8Array;
  values: Float32Array;
  azimuthIndex: Int16Array;
}
export interface NativeRadarReading {
  layerId: string;
  state: "loading" | "ready" | "error";
  message?: string;
  site?: string;
  timestamp?: string;
  elevationDeg?: number;
  rangeKm?: number;
  beamHeightM?: number;
  value?: number | null;
  units?: string;
  category?: string;
  sampleState?: "valid" | "missing" | "range-folded" | "outside";
  decodeMs?: number;
}
export const HYDROMETEORS = [
  "No data",
  "Biological",
  "Ground clutter",
  "Ice crystals",
  "Dry snow",
  "Wet snow",
  "Rain",
  "Heavy rain",
  "Big drops",
  "Graupel",
  "Hail / rain",
  "Large hail",
  "Giant hail",
  "Unknown",
  "Range folded",
];

export function nativeProduct(layerId: string, tilt = 0) {
  const spec = NATIVE_RADAR_PRODUCTS[layerId as NativeRadarLayer];
  if (!spec || !Number.isInteger(tilt) || tilt < 0 || tilt > 3) return undefined;
  return `N${tilt}${spec.suffix}`;
}
export function nativeRadarKey(key: string) {
  return /^([A-Z0-9]{3})_(N[0-3][BGCXKH])_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/.exec(
    key,
  );
}
export function nativeKeyTime(key: string) {
  const m = nativeRadarKey(key);
  if (!m) return undefined;
  const iso = `${m[3]}-${m[4]}-${m[5]}T${m[6]}:${m[7]}:${m[8]}Z`;
  return Number.isFinite(Date.parse(iso)) ? iso : undefined;
}

export function nativeFrameAt(frames: NativeRadarFrame[], selected: string, now = Date.now()) {
  const time = Date.parse(selected);
  return frames
    .filter(
      (f) =>
        Date.parse(f.timestamp) <= time &&
        Date.parse(f.timestamp) <= now + 60000 &&
        now - Date.parse(f.timestamp) <= 3600000,
    )
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
}

export function radarSample(scan: NativeRadarScan, longitude: number, latitude: number) {
  const rad = Math.PI / 180,
    a = scan.latitude * rad,
    b = latitude * rad;
  const dl = (longitude - scan.longitude) * rad;
  const hav = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(dl / 2) ** 2;
  const groundKm = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, hav))));
  const bearing =
    (Math.atan2(
      Math.sin(dl) * Math.cos(b),
      Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(dl),
    ) /
      rad +
      360) %
    360;
  const effectiveEarth = (6371 * 4) / 3,
    elevation = scan.elevationDeg * rad;
  const slantKm =
    (effectiveEarth * Math.sin(groundKm / effectiveEarth)) /
    Math.cos(elevation + groundKm / effectiveEarth);
  const gate = Math.floor(slantKm / scan.gateWidthKm) - scan.firstGate;
  const ray = scan.azimuthIndex[Math.min(3599, Math.floor(bearing * 10))] ?? -1;
  const beamHeightM =
    (Math.sqrt(
      slantKm ** 2 + effectiveEarth ** 2 + 2 * slantKm * effectiveEarth * Math.sin(elevation),
    ) -
      effectiveEarth) *
      1000 +
    scan.altitudeM;
  if (gate < 0 || gate >= scan.bins || ray < 0)
    return { state: "outside" as const, value: null, rangeKm: groundKm, beamHeightM, raw: 0 };
  const raw = scan.data[ray * scan.bins + gate]!;
  const value = scan.values[raw]!;
  return {
    state:
      raw === 1
        ? ("range-folded" as const)
        : Number.isFinite(value)
          ? ("valid" as const)
          : ("missing" as const),
    value: Number.isFinite(value) ? value : null,
    rangeKm: groundKm,
    beamHeightM,
    raw,
  };
}

// Original LandDraft color scales; values retain NOAA physical units.
export const RADAR_SCALES: Record<NativeRadarLayer, Array<[number, string]>> = {
  "weather.radar.pro.reflectivity": [
    [-32, "#627a98"],
    [5, "#65b9c4"],
    [20, "#329951"],
    [35, "#ded85b"],
    [45, "#ee953c"],
    [55, "#dd454e"],
    [65, "#ae438f"],
    [75, "#f5caee"],
  ],
  "weather.radar.pro.velocity": [
    [-64, "#623fc2"],
    [-30, "#287bc7"],
    [-10, "#4cc7b0"],
    [-2, "#9fc3bd"],
    [2, "#c6b4ac"],
    [10, "#eab062"],
    [30, "#dd5948"],
    [60, "#b3377e"],
  ],
  "weather.radar.pro.correlation": [
    [0, "#665a9f"],
    [0.6, "#4c8aa8"],
    [0.8, "#5abcad"],
    [0.9, "#e1c763"],
    [0.95, "#e98951"],
    [0.98, "#ce4a62"],
    [1.01, "#edb3d0"],
  ],
  "weather.radar.pro.differential-reflectivity": [
    [-8, "#5f57b7"],
    [-2, "#3f8db3"],
    [0, "#9ac8c5"],
    [1, "#7dc86d"],
    [2, "#e4d267"],
    [4, "#e58d51"],
    [6, "#bd4e87"],
  ],
  "weather.radar.pro.specific-phase": [
    [-2, "#6b5daf"],
    [0, "#76c1c4"],
    [0.5, "#69b775"],
    [1, "#d4cf65"],
    [2, "#e39c58"],
    [4, "#d05b69"],
    [8, "#a849aa"],
  ],
  "weather.radar.pro.hydrometeor": [
    [0, "#637082"],
    [1, "#8893ad"],
    [2, "#817463"],
    [3, "#b4e3e6"],
    [4, "#799bcd"],
    [5, "#8a70bd"],
    [6, "#4cba92"],
    [7, "#268464"],
    [8, "#d5d766"],
    [9, "#e4a654"],
    [10, "#d35862"],
    [11, "#af459a"],
    [12, "#ebc2ee"],
    [13, "#979ba3"],
  ],
};
export function radarColor(layerId: NativeRadarLayer, value: number) {
  const scale = RADAR_SCALES[layerId];
  let color = scale[0]![1];
  for (const [minimum, next] of scale) {
    if (value < minimum) break;
    color = next;
  }
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
    210,
  ];
}
