import {
  area as turfArea,
  bbox,
  booleanPointInPolygon,
  distance,
  featureCollection,
  intersect,
  point,
} from "@turf/turf";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";

import { defaultStyle, type LayerStyle } from "../gis/types.ts";
import type {
  AquiferStudySummary,
  HydrogeologyStudies,
  InterpolationStudySummary,
  WaterArea,
  WaterRecord,
  WellColorMode,
} from "./types";

export interface HydrologyLayerProduct {
  name: string;
  description: string;
  data: FeatureCollection;
  style: LayerStyle;
}

export interface HydrologyProducts {
  studies: HydrogeologyStudies;
  layers: HydrologyLayerProduct[];
}

const palettes = {
  depth: ["#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#172554"],
  aquifer: [
    "#0f766e",
    "#2563eb",
    "#7c3aed",
    "#c2410c",
    "#15803d",
    "#be123c",
    "#0369a1",
    "#a16207",
    "#6d28d9",
    "#0e7490",
    "#4d7c0f",
    "#b91c1c",
  ],
  surface: ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"],
  density: ["#ecfeff", "#67e8f9", "#06b6d4", "#0e7490"],
};

export const wellDepthBand = (depth: number | null) => {
  if (depth === null || !Number.isFinite(depth)) return "Unknown";
  if (depth < 100) return "0–99 ft";
  if (depth < 300) return "100–299 ft";
  if (depth < 600) return "300–599 ft";
  if (depth < 1_000) return "600–999 ft";
  return "1,000+ ft";
};

const numeric = (values: Array<number | null | undefined>) =>
  values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const depthStats = (records: WaterRecord[]) => {
  const values = numeric(records.map((record) => record.depth));
  return {
    count: values.length,
    minimum: values.length ? Math.min(...values) : null,
    median: median(values),
    maximum: values.length ? Math.max(...values) : null,
  };
};

const pointRecords = (records: WaterRecord[]) =>
  records.filter(
    (record) =>
      record.geometry.type === "Point" &&
      (record.sourceId === "usgs-sites" || record.sourceId === "twdb-wells"),
  );

const displayAquifer = (record: WaterRecord) => record.aquifer?.trim() || "Aquifer unknown";

const depthRules = ["0–99 ft", "100–299 ft", "300–599 ft", "600–999 ft", "1,000+ ft"].map(
  (value, index) => ({
    value,
    label: value,
    color: palettes.depth[index]!,
    visible: true,
  }),
);

const distinctRules = (values: string[], palette = palettes.aquifer) =>
  [...new Set(values)]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, palette.length)
    .map((value, index) => ({
      value,
      label: value,
      color: palette[index % palette.length]!,
      visible: true,
    }));

export function wellStyle(mode: WellColorMode, records: WaterRecord[]): LayerStyle {
  const base = {
    ...defaultStyle(2),
    fillColor: "#2563eb",
    fillOpacity: 0.9,
    strokeColor: "#ffffff",
    strokeWidth: 1,
    pointSize: 6,
  };
  const field = mode === "depth" ? "depthClass" : mode === "aquifer" ? "aquifer" : "wellType";
  const rules =
    mode === "depth"
      ? depthRules
      : distinctRules(
          records.map((record) =>
            mode === "aquifer" ? displayAquifer(record) : record.kind || "Type unknown",
          ),
        );
  return {
    ...base,
    categorized: {
      enabled: true,
      field,
      rules,
      fallbackColor: "#94a3b8",
      fallbackVisible: true,
    },
  };
}

const wellFeatures = (records: WaterRecord[]): Feature<Point>[] =>
  records.map((record) => ({
    type: "Feature",
    geometry: record.geometry as Point,
    properties: {
      waterRecordId: record.id,
      NAME: record.name,
      source: record.sourceId,
      sourceRecordId: record.sourceRecordId,
      sourceUrl: record.sourceUrl,
      aquifer: displayAquifer(record),
      wellType: record.kind || "Type unknown",
      depthFt: record.depth,
      depthClass: wellDepthBand(record.depth),
      classification: "OBSERVED",
      analysisMethod: "Source attributes grouped by LandDraft; values are not inferred",
    },
  }));

const square = (
  west: number,
  south: number,
  east: number,
  north: number,
  properties: Record<string, unknown>,
): Feature<Polygon> => ({
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  },
  properties,
});

interface GridCell {
  row: number;
  column: number;
  center: [number, number];
  bounds: [number, number, number, number];
  value?: number;
}

const studyGrid = (study: WaterArea, target = 14): GridCell[] => {
  const [west, south, east, north] = bbox(study);
  const width = Math.max(east! - west!, 0.0001);
  const height = Math.max(north! - south!, 0.0001);
  const columns = Math.max(4, Math.min(24, Math.round(target * Math.sqrt(width / height))));
  const rows = Math.max(4, Math.min(24, Math.round(target * Math.sqrt(height / width))));
  const dx = width / columns;
  const dy = height / rows;
  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = west! + column * dx;
      const y0 = south! + row * dy;
      const x1 = x0 + dx;
      const y1 = y0 + dy;
      const center: [number, number] = [(x0 + x1) / 2, (y0 + y1) / 2];
      if (booleanPointInPolygon(point(center), study))
        cells.push({ row, column, center, bounds: [x0, y0, x1, y1] });
    }
  }
  return cells;
};

const densityProduct = (study: WaterArea, wells: WaterRecord[]): HydrologyLayerProduct | null => {
  if (!wells.length) return null;
  const features = studyGrid(study, 11).flatMap((cell) => {
    const count = wells.filter((record) =>
      booleanPointInPolygon(record.geometry as Point, square(...cell.bounds, {})),
    ).length;
    if (!count) return [];
    const densityClass = count === 1 ? "1" : count <= 4 ? "2–4" : count <= 9 ? "5–9" : "10+";
    return [
      square(...cell.bounds, {
        NAME: `${count} mapped well${count === 1 ? "" : "s"}`,
        wellCount: count,
        densityClass,
        classification: "DERIVED",
        analysisMethod: "Count of retrieved source wells per analysis grid cell",
      }),
    ];
  });
  if (!features.length) return null;
  return {
    name: "Hydrology analysis · Mapped well density",
    description:
      "Retrieved source-well count by analysis grid cell; absence is not proof of no wells.",
    data: featureCollection(features),
    style: {
      ...defaultStyle(5),
      fillOpacity: 0.42,
      strokeWidth: 1,
      categorized: {
        enabled: true,
        field: "densityClass",
        rules: ["1", "2–4", "5–9", "10+"].map((value, index) => ({
          value,
          label: `${value} wells`,
          color: palettes.density[index]!,
          visible: true,
        })),
        fallbackColor: "#cbd5e1",
        fallbackVisible: true,
      },
    },
  };
};

interface MeasurementPoint {
  record: WaterRecord;
  coordinates: [number, number];
  value: number;
}

const comparableMeasurements = (records: WaterRecord[], parameterCode: string) => {
  const bySite = new Map<string, MeasurementPoint>();
  for (const record of records) {
    const measurement = record.measurement;
    if (
      record.geometry.type !== "Point" ||
      measurement?.parameterCode !== parameterCode ||
      measurement.value === null ||
      !Number.isFinite(measurement.value) ||
      !measurement.unit?.toLowerCase().includes("ft")
    )
      continue;
    const site = String(record.raw["monitoring_location_id"] ?? record.sourceRecordId);
    const existing = bySite.get(site);
    if (
      !existing ||
      Date.parse(record.observationTime ?? "") > Date.parse(existing.record.observationTime ?? "")
    )
      bySite.set(site, {
        record,
        coordinates: record.geometry.coordinates as [number, number],
        value: measurement.value,
      });
  }
  return [...bySite.values()];
};

const surfaceSummary = (
  id: InterpolationStudySummary["id"],
  label: string,
  samples: MeasurementPoint[],
): InterpolationStudySummary => {
  const values = samples.map((sample) => sample.value);
  const available = samples.length >= 3;
  return {
    id,
    label,
    status: available ? "AVAILABLE" : "INSUFFICIENT_DATA",
    sampleCount: samples.length,
    unit: samples[0]?.record.measurement?.unit ?? null,
    verticalDatum: id === "groundwater-elevation" ? "NGVD29 (USGS parameter 62610)" : null,
    minimum: values.length ? Math.min(...values) : null,
    median: median(values),
    maximum: values.length ? Math.max(...values) : null,
    method: available
      ? "Inverse-distance weighting (power 2) over a bounded LandDraft screening grid"
      : "Interpolation withheld until at least three comparable source measurements are available",
    limitation:
      id === "groundwater-elevation"
        ? "A screening potentiometric surface; sparse or clustered wells, pumping and aquifer mixing can distort gradients."
        : "Depth below land surface is not hydraulic head and does not establish groundwater-flow direction.",
  };
};

const valueBreaks = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => sorted[Math.round((sorted.length - 1) * ratio)]!);
};

const idwValue = (coordinate: [number, number], samples: MeasurementPoint[]) => {
  let weighted = 0;
  let weights = 0;
  for (const sample of samples) {
    const km = distance(point(coordinate), point(sample.coordinates), { units: "kilometers" });
    if (km < 0.001) return sample.value;
    const weight = 1 / km ** 2;
    weighted += sample.value * weight;
    weights += weight;
  }
  return weights ? weighted / weights : Number.NaN;
};

const surfaceProducts = (
  study: WaterArea,
  samples: MeasurementPoint[],
  id: InterpolationStudySummary["id"],
): HydrologyLayerProduct[] => {
  if (samples.length < 3) return [];
  const grid = studyGrid(study, 14).map((cell) => ({
    ...cell,
    value: idwValue(cell.center, samples),
  }));
  const values = grid.map((cell) => cell.value).filter(Number.isFinite) as number[];
  if (!values.length) return [];
  const breaks = valueBreaks(values);
  const bandFor = (value: number) => {
    const index = Math.max(
      0,
      Math.min(
        4,
        breaks.findIndex((limit) => value <= limit),
      ),
    );
    return `Q${index + 1}`;
  };
  const label = id === "groundwater-elevation" ? "Groundwater elevation" : "Depth to water";
  const cells = grid.map((cell) =>
    square(...cell.bounds, {
      NAME: `${label}: ${cell.value!.toFixed(1)} ft`,
      value: Number(cell.value!.toFixed(2)),
      unit: "ft",
      valueBand: bandFor(cell.value!),
      sampleCount: samples.length,
      classification: "INTERPOLATED",
      analysisMethod: "LandDraft IDW power 2 screening grid",
      sourceParameter: id === "groundwater-elevation" ? "USGS 62610" : "USGS 72019",
    }),
  );
  const products: HydrologyLayerProduct[] = [
    {
      name: `Hydrology analysis · ${label} screening surface`,
      description: `${label} interpolation from comparable USGS measurements; inspect source age and limitations.`,
      data: featureCollection(cells),
      style: {
        ...defaultStyle(2),
        fillOpacity: 0.48,
        strokeOpacity: 0.35,
        strokeWidth: 0.6,
        categorized: {
          enabled: true,
          field: "valueBand",
          rules: ["Q1", "Q2", "Q3", "Q4", "Q5"].map((value, index) => ({
            value,
            label: `${breaks[index]!.toFixed(1)} ft`,
            color: palettes.surface[index]!,
            visible: true,
          })),
          fallbackColor: "#94a3b8",
          fallbackVisible: true,
        },
      },
    },
  ];
  if (id === "groundwater-elevation") {
    const byPosition = new Map(grid.map((cell) => [`${cell.row}:${cell.column}`, cell]));
    const vectors: Feature<LineString>[] = [];
    for (const cell of grid.filter((item) => item.row % 2 === 0 && item.column % 2 === 0)) {
      const neighbors = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ]
        .map(([dr, dc]) => byPosition.get(`${cell.row + dr!}:${cell.column + dc!}`))
        .filter((item): item is GridCell & { value: number } => Boolean(item?.value !== undefined));
      const lower = neighbors.sort((left, right) => left.value - right.value)[0];
      if (!lower || cell.value! - lower.value < 0.1) continue;
      vectors.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [cell.center, lower.center] },
        properties: {
          NAME: `Potential gradient ${cell.value!.toFixed(1)} → ${lower.value.toFixed(1)} ft`,
          headDropFt: Number((cell.value! - lower.value).toFixed(2)),
          classification: "DERIVED",
          analysisMethod: "Down-gradient connection between adjacent IDW screening cells",
        },
      });
    }
    if (vectors.length)
      products.push({
        name: "Hydrology analysis · Potential groundwater gradient",
        description:
          "Down-gradient screening vectors from the interpolated groundwater-elevation surface; not surveyed flow paths.",
        data: featureCollection(vectors),
        style: {
          ...defaultStyle(4),
          fillColor: "#7c3aed",
          strokeColor: "#7c3aed",
          strokeWidth: 2,
          strokePattern: "dashed",
          fillOpacity: 0,
        },
      });
  }
  return products;
};

const aquiferSummaries = (
  records: WaterRecord[],
  wells: WaterRecord[],
  study: WaterArea,
): AquiferStudySummary[] => {
  const names = new Set([
    ...records.flatMap((record) => (record.aquifer ? [record.aquifer] : [])),
    ...records
      .filter(
        (record) =>
          record.sourceId === "twdb-aquifers" || record.sourceId === "twdb-minor-aquifers",
      )
      .map((record) => record.name),
  ]);
  return [...names]
    .map((name) => {
      const assigned = wells.filter((record) => record.aquifer === name);
      const stats = depthStats(assigned);
      const extent = records.find(
        (record) =>
          (record.sourceId === "twdb-aquifers" || record.sourceId === "twdb-minor-aquifers") &&
          (record.aquifer === name || record.name === name),
      );
      let mappedAreaAcres: number | null = null;
      if (extent && extent.geometry.type !== "Point") {
        try {
          const clipped = intersect(
            featureCollection([
              { type: "Feature", properties: {}, geometry: extent.geometry },
              study,
            ]),
          );
          if (clipped) mappedAreaAcres = turfArea(clipped) / 4046.8564224;
        } catch {
          mappedAreaAcres = null;
        }
      }
      return {
        name,
        extentType:
          extent?.sourceId === "twdb-aquifers"
            ? "major"
            : extent?.sourceId === "twdb-minor-aquifers"
              ? "minor"
              : "well-assignment-only",
        mappedAreaAcres,
        wellCount: assigned.length,
        depthSampleCount: stats.count,
        minimumDepthFt: stats.minimum,
        medianDepthFt: stats.median,
        maximumDepthFt: stats.maximum,
        storageVolumeStatus: "UNAVAILABLE",
        storageVolumeReason:
          "Mapped footprint and well depths do not provide saturated thickness, porosity/specific yield, confinement or recoverable storage.",
      } satisfies AquiferStudySummary;
    })
    .sort((left, right) => right.wellCount - left.wellCount || left.name.localeCompare(right.name));
};

export function buildHydrologyProducts(
  records: WaterRecord[],
  study: WaterArea,
  wellColorMode: WellColorMode = "depth",
): HydrologyProducts {
  const wells = pointRecords(records);
  const depth = depthStats(wells);
  const depthToWater = comparableMeasurements(records, "72019");
  const groundwaterElevation = comparableMeasurements(records, "62610");
  const layers: HydrologyLayerProduct[] = [];
  if (wells.length)
    layers.push({
      name: "Hydrology analysis · Wells by attributes",
      description: "Retrieved well records colored by the selected source attribute.",
      data: featureCollection(wellFeatures(wells)),
      style: wellStyle(wellColorMode, wells),
    });
  const density = densityProduct(study, wells);
  if (density) layers.push(density);
  layers.push(...surfaceProducts(study, depthToWater, "depth-to-water"));
  layers.push(...surfaceProducts(study, groundwaterElevation, "groundwater-elevation"));
  const depthBands = Object.fromEntries(
    ["0–99 ft", "100–299 ft", "300–599 ft", "600–999 ft", "1,000+ ft", "Unknown"].map((band) => [
      band,
      wells.filter((record) => wellDepthBand(record.depth) === band).length,
    ]),
  );
  return {
    layers,
    studies: {
      version: "hydro-screening-1",
      generatedAt: new Date().toISOString(),
      wellCount: wells.length,
      depthSampleCount: depth.count,
      depthBands,
      aquifers: aquiferSummaries(records, wells, study),
      interpolation: [
        surfaceSummary("depth-to-water", "Depth to water below land surface", depthToWater),
        surfaceSummary(
          "groundwater-elevation",
          "Groundwater elevation above NGVD29",
          groundwaterElevation,
        ),
      ],
      limitations: [
        "Well records show sampled locations and source attributes, not continuous aquifer conditions.",
        "Interpolated surfaces are withheld below three comparable measurements and remain screening products when available.",
        "Stale measurements remain historical evidence; they are not presented as current conditions.",
        "Aquifer storage volume is unavailable without validated saturated thickness and storage properties.",
      ],
    },
  };
}
