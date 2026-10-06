import type { FeatureCollection } from "geojson";
import Papa from "papaparse";
import shp from "shpjs";

type ImportTask = { file: File; kind: "geojson" | "shapefile" | "csv" };

const LAT_KEYS = ["lat", "latitude", "y", "lat_dd", "ycoord", "y_coord"];
const LON_KEYS = ["lon", "lng", "long", "longitude", "x", "lon_dd", "xcoord", "x_coord"];

function collection(input: unknown): FeatureCollection {
  const value = input as { type?: string; features?: FeatureCollection["features"] };
  if (value?.type === "FeatureCollection")
    return {
      type: "FeatureCollection",
      features: (value.features ?? []).filter((feature) => feature && feature.geometry),
    };
  if (value?.type === "Feature") return { type: "FeatureCollection", features: [value as never] };
  if (value?.type && typeof value.type === "string")
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: value as never }],
    };
  throw new Error("File did not contain recognizable GeoJSON");
}

async function parseShapefile(file: File): Promise<FeatureCollection> {
  const parsed = await shp(await file.arrayBuffer());
  const lists = Array.isArray(parsed) ? parsed : [parsed];
  const features = lists.flatMap((item) => item.features ?? []);
  if (!features.length) throw new Error("Shapefile contained no features");
  return { type: "FeatureCollection", features };
}

async function parseCsv(file: File): Promise<FeatureCollection> {
  const parsed = Papa.parse<Record<string, string>>(await file.text(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const rows = parsed.data.filter(Boolean);
  const first = rows[0];
  if (!first) throw new Error("CSV had no data rows");
  const headers = Object.keys(first);
  const latKey = headers.find((header) => LAT_KEYS.includes(header.trim().toLowerCase()));
  const lonKey = headers.find((header) => LON_KEYS.includes(header.trim().toLowerCase()));
  if (!latKey || !lonKey)
    throw new Error("CSV needs latitude and longitude columns (lat/lon, latitude/longitude, x/y)");
  const features = rows.flatMap((row) => {
    const lat = Number(row[latKey]);
    const lon = Number(row[lonKey]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [
      {
        type: "Feature" as const,
        properties: { ...row },
        geometry: { type: "Point" as const, coordinates: [lon, lat] },
      },
    ];
  });
  if (!features.length) throw new Error("No valid coordinates found in CSV");
  return { type: "FeatureCollection", features };
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ImportTask>) => void) | null;
  postMessage(value: unknown): void;
};

scope.onmessage = async ({ data: task }) => {
  try {
    const data =
      task.kind === "geojson"
        ? collection(JSON.parse(await task.file.text()))
        : task.kind === "shapefile"
          ? await parseShapefile(task.file)
          : await parseCsv(task.file);
    if (!data.features.length) throw new Error(`${task.file.name} had no features`);
    scope.postMessage({ ok: true, data });
  } catch (error) {
    scope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Import processing failed",
    });
  }
};
