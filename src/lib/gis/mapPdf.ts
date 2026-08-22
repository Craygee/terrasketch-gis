import type { Map as MlMap } from "maplibre-gl";
import type { GisLayer } from "./types";

export type MapPaper = "letter" | "a4";

export async function exportMapPdf(
  map: MlMap,
  projectName: string,
  layers: GisLayer[],
  paper: MapPaper = "letter",
) {
  const page = paper === "a4" ? { width: 1191, height: 842 } : { width: 1100, height: 850 };
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PDF canvas is not available");

  const margin = 34;
  const header = 66;
  const footer = 36;
  const legendWidth = 190;
  const mapWidth = page.width - margin * 2 - legendWidth;
  const mapHeight = page.height - margin * 2 - header - footer;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.fillStyle = "#17251b";
  ctx.font = "700 24px Arial, sans-serif";
  ctx.fillText(projectName || "Map", margin, margin + 25);
  ctx.fillStyle = "#617066";
  ctx.font = "12px Arial, sans-serif";
  ctx.fillText(
    `Created ${new Date().toLocaleString()} · WGS84 · zoom ${map.getZoom().toFixed(1)}`,
    margin,
    margin + 47,
  );

  ctx.drawImage(map.getCanvas(), margin, margin + header, mapWidth, mapHeight);
  ctx.strokeStyle = "#9ba59e";
  ctx.strokeRect(margin, margin + header, mapWidth, mapHeight);

  let y = margin + header + 14;
  const legendX = margin + mapWidth + 22;
  ctx.fillStyle = "#17251b";
  ctx.font = "700 15px Arial, sans-serif";
  ctx.fillText("Visible layers", legendX, y);
  y += 24;
  ctx.font = "12px Arial, sans-serif";
  for (const layer of layers.filter((item) => item.visible).slice(0, 22)) {
    ctx.fillStyle = layer.style.fillColor;
    ctx.strokeStyle = layer.style.strokeColor;
    ctx.fillRect(legendX, y - 10, 13, 13);
    ctx.strokeRect(legendX, y - 10, 13, 13);
    ctx.fillStyle = "#27332b";
    ctx.fillText(ellipsize(layer.name, 24), legendX + 21, y);
    y += 22;
  }

  ctx.fillStyle = "#6a746d";
  ctx.font = "10px Arial, sans-serif";
  ctx.fillText(
    "Planning/reference map only. Verify legal boundaries and ownership with county records and a licensed surveyor.",
    margin,
    page.height - margin + 5,
  );

  const jpeg = await canvasToJpeg(canvas);
  const blob = buildSingleImagePdf(jpeg, page.width, page.height);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(projectName || "map").replace(/[^a-z0-9_-]+/gi, "_")}_${paper}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const ellipsize = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value;

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Map image could not be created"))),
      "image/jpeg",
      0.92,
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

/** Minimal standards-compliant one-page PDF containing the composed JPEG map sheet. */
function buildSingleImagePdf(jpeg: Uint8Array, width: number, height: number): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const push = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string | Uint8Array, suffix = "") => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    push(body);
    push(`${suffix}\nendobj\n`);
  };

  push("%PDF-1.4\n%âãÏÓ\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Map 4 0 R >> >> /Contents 5 0 R >>`,
  );
  offsets[4] = length;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");
  const content = `q ${width} 0 0 ${height} 0 0 cm /Map Do Q`;
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  push("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1)
    push(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
