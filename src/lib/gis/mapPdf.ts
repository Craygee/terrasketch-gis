import type { Map as MlMap } from "maplibre-gl";
import type { GisLayer } from "./types";
import type { Feature } from "geojson";

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
    ctx.globalAlpha = layer.style.fillOpacity;
    ctx.fillRect(legendX, y - 10, 13, 13);
    ctx.globalAlpha = layer.style.strokeOpacity;
    ctx.strokeRect(legendX, y - 10, 13, 13);
    ctx.globalAlpha = 1;
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

export async function exportAnalysisReportPdf(
  map: MlMap,
  projectName: string,
  layers: GisLayer[],
  options: {
    title: string;
    summary: string;
    features?: Feature[];
    sourceLayerName?: string;
  },
) {
  const page = { width: 1191, height: 842 };
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Report canvas is not available");
  const features = options.features ?? [];

  ctx.fillStyle = "#fbfaf4";
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.fillStyle = "#1f7044";
  ctx.fillRect(0, 0, page.width, 12);
  ctx.fillStyle = "#17251b";
  ctx.font = "700 27px Arial, sans-serif";
  ctx.fillText(options.title || "LandDraft GIS report", 38, 55);
  ctx.fillStyle = "#617066";
  ctx.font = "12px Arial, sans-serif";
  ctx.fillText(`${projectName} · ${new Date().toLocaleString()} · WGS84`, 38, 78);

  const mapX = 38;
  const mapY = 104;
  const mapWidth = 720;
  const mapHeight = 520;
  ctx.drawImage(map.getCanvas(), mapX, mapY, mapWidth, mapHeight);
  ctx.strokeStyle = "#aeb7b0";
  ctx.strokeRect(mapX, mapY, mapWidth, mapHeight);

  const panelX = 786;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(panelX, mapY, 367, 650);
  ctx.strokeStyle = "#d7dcd7";
  ctx.strokeRect(panelX, mapY, 367, 650);
  ctx.fillStyle = "#17251b";
  ctx.font = "700 15px Arial, sans-serif";
  ctx.fillText("Analysis", panelX + 20, mapY + 30);
  ctx.font = "12px Arial, sans-serif";
  ctx.fillStyle = "#3f4d43";
  let y = mapY + 54;
  y = drawWrappedText(ctx, options.summary, panelX + 20, y, 327, 17) + 14;

  ctx.font = "700 13px Arial, sans-serif";
  ctx.fillStyle = "#17251b";
  ctx.fillText("Result", panelX + 20, y);
  y += 22;
  ctx.font = "12px Arial, sans-serif";
  ctx.fillStyle = "#3f4d43";
  ctx.fillText(
    `${features.length.toLocaleString()} matching feature${features.length === 1 ? "" : "s"}`,
    panelX + 20,
    y,
  );
  y += 18;
  if (options.sourceLayerName) {
    ctx.fillText(`Layer: ${ellipsize(options.sourceLayerName, 42)}`, panelX + 20, y);
    y += 18;
  }
  ctx.fillText(`Visible layers: ${layers.filter((layer) => layer.visible).length}`, panelX + 20, y);
  y += 28;

  const sampleProperties = features
    .slice(0, 8)
    .map((feature) => feature.properties ?? {})
    .flatMap((properties) => Object.entries(properties).filter(([key]) => !key.startsWith("__")))
    .slice(0, 18);
  if (sampleProperties.length) {
    ctx.font = "700 13px Arial, sans-serif";
    ctx.fillStyle = "#17251b";
    ctx.fillText("Selected attributes", panelX + 20, y);
    y += 20;
    ctx.font = "11px Arial, sans-serif";
    for (const [key, value] of sampleProperties) {
      if (y > mapY + 620) break;
      ctx.fillStyle = "#617066";
      ctx.fillText(ellipsize(key, 19), panelX + 20, y);
      ctx.fillStyle = "#27332b";
      ctx.fillText(ellipsize(String(value ?? ""), 31), panelX + 146, y);
      y += 17;
    }
  }

  ctx.fillStyle = "#17251b";
  ctx.font = "700 13px Arial, sans-serif";
  ctx.fillText("Visible layers", mapX, 660);
  let legendX = mapX;
  let legendY = 685;
  for (const layer of layers.filter((item) => item.visible).slice(0, 15)) {
    ctx.fillStyle = layer.style.fillColor;
    ctx.globalAlpha = Math.max(0.35, layer.style.fillOpacity);
    ctx.fillRect(legendX, legendY - 10, 12, 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#27332b";
    ctx.font = "11px Arial, sans-serif";
    ctx.fillText(ellipsize(layer.name, 25), legendX + 18, legendY);
    legendX += 235;
    if (legendX > 700) {
      legendX = mapX;
      legendY += 22;
    }
  }

  ctx.fillStyle = "#6a746d";
  ctx.font = "10px Arial, sans-serif";
  ctx.fillText(
    "Planning/reference report only. Verify legal boundaries, ownership and regulated conditions with the publishing authority.",
    38,
    813,
  );

  const jpeg = await canvasToJpeg(canvas);
  const blob = buildSingleImagePdf(jpeg, page.width, page.height);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(options.title || "LandDraft_report").replace(/[^a-z0-9_-]+/gi, "_")}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = candidate;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
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
