import type { FeatureCollection } from "geojson";

export interface ImportResult {
  name: string;
  data: FeatureCollection;
  featureCount: number;
}

export const SUPPORTED_EXTENSIONS = [".geojson", ".json", ".kml", ".kmz", ".zip", ".gpx", ".csv"];

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");

function toCollection(input: unknown): FeatureCollection {
  const value = input as {
    type?: string;
    features?: unknown[];
    geometry?: unknown;
    geometries?: unknown[];
  };
  if (value?.type === "FeatureCollection")
    return {
      type: "FeatureCollection",
      features: ((value.features ?? []) as FeatureCollection["features"]).filter(
        (f) => f && f.geometry,
      ),
    };
  if (value?.type === "Feature") return { type: "FeatureCollection", features: [value as never] };
  if (value?.type && typeof value.type === "string")
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: value as never }],
    };
  throw new Error("File did not contain recognizable GeoJSON");
}

async function parseXmlBased(text: string, kind: "kml" | "gpx"): Promise<FeatureCollection> {
  const { kml, gpx } = await import("@tmcw/togeojson");
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0)
    throw new Error("Could not read that XML file");
  return toCollection(kind === "kml" ? kml(doc) : gpx(doc));
}

async function parseKmz(file: File): Promise<FeatureCollection> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = Object.values(zip.files).find((f) => /\.kml$/i.test(f.name) && !f.dir);
  if (!entry) throw new Error("No .kml found inside the KMZ");
  return parseXmlBased(await entry.async("string"), "kml");
}

async function parseShapefileZip(file: File): Promise<FeatureCollection> {
  const shp = (await import("shpjs")).default as unknown as (
    buf: ArrayBuffer,
  ) => Promise<FeatureCollection | FeatureCollection[]>;
  const parsed = await shp(await file.arrayBuffer());
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const features = list.flatMap((fc) => fc.features ?? []);
  if (features.length === 0) throw new Error("Shapefile contained no features");
  return { type: "FeatureCollection", features };
}

const LAT_KEYS = ["lat", "latitude", "y", "lat_dd", "ycoord", "y_coord"];
const LON_KEYS = ["lon", "lng", "long", "longitude", "x", "lon_dd", "xcoord", "x_coord"];

async function parseCsv(file: File): Promise<FeatureCollection> {
  const Papa = (await import("papaparse")).default;
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const rows = parsed.data.filter(Boolean);
  const first = rows[0];
  if (!first) throw new Error("CSV had no data rows");
  const headers = Object.keys(first);
  const latKey = headers.find((h) => LAT_KEYS.includes(h.trim().toLowerCase()));
  const lonKey = headers.find((h) => LON_KEYS.includes(h.trim().toLowerCase()));
  if (!latKey || !lonKey)
    throw new Error("CSV needs latitude and longitude columns (lat/lon, latitude/longitude, x/y)");

  const features = rows
    .map((row) => {
      const lat = Number(row[latKey]);
      const lon = Number(row[lonKey]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        type: "Feature" as const,
        properties: { ...row },
        geometry: { type: "Point" as const, coordinates: [lon, lat] },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  if (features.length === 0) throw new Error("No valid coordinates found in CSV");
  return { type: "FeatureCollection", features };
}

export async function importFile(file: File): Promise<ImportResult> {
  const lower = file.name.toLowerCase();
  let data: FeatureCollection;

  if (lower.endsWith(".geojson") || lower.endsWith(".json")) {
    data = toCollection(JSON.parse(await file.text()));
  } else if (lower.endsWith(".kml")) {
    data = await parseXmlBased(await file.text(), "kml");
  } else if (lower.endsWith(".kmz")) {
    data = await parseKmz(file);
  } else if (lower.endsWith(".gpx")) {
    data = await parseXmlBased(await file.text(), "gpx");
  } else if (lower.endsWith(".zip")) {
    data = await parseShapefileZip(file);
  } else if (lower.endsWith(".csv")) {
    data = await parseCsv(file);
  } else {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  if (data.features.length === 0) throw new Error(`${file.name} had no features`);
  return { name: stripExt(file.name), data, featureCount: data.features.length };
}

export async function importFiles(files: File[]): Promise<{
  results: ImportResult[];
  errors: string[];
}> {
  const results: ImportResult[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      results.push(await importFile(file));
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : "import failed"}`);
    }
  }
  return { results, errors };
}
