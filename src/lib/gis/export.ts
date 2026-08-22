import type { Feature, FeatureCollection, Position } from "geojson";

export type ExportFormat = "geojson" | "kml" | "kmz" | "shp";

const safeName = (name: string) => name.replace(/[^\w.-]+/g, "_").slice(0, 60) || "layer";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const coord = (p: Position) => `${p[0]},${p[1]}${p[2] !== undefined ? `,${p[2]}` : ""}`;
const ring = (r: Position[]) => r.map(coord).join(" ");

function geometryToKml(geom: Feature["geometry"]): string {
  if (!geom) return "";
  switch (geom.type) {
    case "Point":
      return `<Point><coordinates>${coord(geom.coordinates)}</coordinates></Point>`;
    case "MultiPoint":
      return `<MultiGeometry>${geom.coordinates.map((c) => `<Point><coordinates>${coord(c)}</coordinates></Point>`).join("")}</MultiGeometry>`;
    case "LineString":
      return `<LineString><tessellate>1</tessellate><coordinates>${ring(geom.coordinates)}</coordinates></LineString>`;
    case "MultiLineString":
      return `<MultiGeometry>${geom.coordinates.map((l) => `<LineString><coordinates>${ring(l)}</coordinates></LineString>`).join("")}</MultiGeometry>`;
    case "Polygon": {
      const [outer, ...holes] = geom.coordinates;
      return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring(outer ?? [])}</coordinates></LinearRing></outerBoundaryIs>${holes
        .map(
          (h) =>
            `<innerBoundaryIs><LinearRing><coordinates>${ring(h)}</coordinates></LinearRing></innerBoundaryIs>`,
        )
        .join("")}</Polygon>`;
    }
    case "MultiPolygon":
      return `<MultiGeometry>${geom.coordinates
        .map((poly) => geometryToKml({ type: "Polygon", coordinates: poly } as Feature["geometry"]))
        .join("")}</MultiGeometry>`;
    case "GeometryCollection":
      return `<MultiGeometry>${geom.geometries.map(geometryToKml).join("")}</MultiGeometry>`;
    default:
      return "";
  }
}

export function toKml(fc: FeatureCollection, layerName: string): string {
  const placemarks = fc.features
    .map((f) => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const nameKey = Object.keys(props).find((k) => /^(name|title|owner|label)$/i.test(k));
      const data = Object.entries(props)
        .map(
          ([k, v]) =>
            `<Data name="${esc(k)}"><value>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</value></Data>`,
        )
        .join("");
      return `<Placemark><name>${esc(nameKey ? props[nameKey] : layerName)}</name><ExtendedData>${data}</ExtendedData>${geometryToKml(f.geometry)}</Placemark>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(layerName)}</name>
${placemarks}
</Document></kml>`;
}

export async function exportLayer(
  fc: FeatureCollection,
  layerName: string,
  format: ExportFormat,
): Promise<void> {
  const base = safeName(layerName);
  if (format === "geojson") {
    download(
      new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" }),
      `${base}.geojson`,
    );
    return;
  }
  if (format === "kml") {
    download(
      new Blob([toKml(fc, layerName)], { type: "application/vnd.google-earth.kml+xml" }),
      `${base}.kml`,
    );
    return;
  }
  if (format === "kmz") {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("doc.kml", toKml(fc, layerName));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    download(blob, `${base}.kmz`);
    return;
  }
  await exportShapefileZip(fc, base);
}

/** Zipped Shapefile: geometry types are split into separate .shp members. */
async function exportShapefileZip(fc: FeatureCollection, base: string): Promise<void> {
  const mod = (await import("@mapbox/shp-write")) as unknown as {
    zip?: (fc: FeatureCollection, opts?: unknown) => Promise<Blob | ArrayBuffer | string>;
    default?: { zip?: (fc: FeatureCollection, opts?: unknown) => Promise<unknown> };
  };
  const zipFn = mod.zip ?? mod.default?.zip;
  if (!zipFn) throw new Error("Shapefile writer unavailable");
  const out = await zipFn(fc, { outputType: "blob", compression: "DEFLATE" });
  const blob =
    out instanceof Blob
      ? out
      : typeof out === "string"
        ? new Blob([Uint8Array.from(atob(out), (c) => c.charCodeAt(0))], {
            type: "application/zip",
          })
        : new Blob([out as ArrayBuffer], { type: "application/zip" });
  download(blob, `${base}_shapefile.zip`);
}
