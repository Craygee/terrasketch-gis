import type { FeatureCollection, Geometry } from "geojson";

export const MAX_DIRECT_IMPORT_BYTES = 64 * 1024 * 1024;
export const MAX_EXPANDED_ZIP_BYTES = 192 * 1024 * 1024;
export const MAX_DIRECT_IMPORT_FEATURES = 100_000;
export const MAX_DIRECT_IMPORT_COORDINATES = 1_500_000;

export interface ImportComplexity {
  featureCount: number;
  coordinateCount: number;
}

const opportunityZoneHint = (fileName: string) =>
  /opportun(?:ity)?[\s_-]*zone/i.test(fileName)
    ? " Use Public data → Federal Qualified Opportunity Zones instead; it loads only the visible map area."
    : " Split the file by area, simplify it, or connect its FeatureServer/MapServer URL under Public data.";

export function assertImportFileBudget(fileName: string, size: number) {
  if (size <= MAX_DIRECT_IMPORT_BYTES) return;
  throw new Error(
    `The ${(size / 1024 / 1024).toFixed(1)} MB file exceeds LandDraft's browser-safe editable import limit.${opportunityZoneHint(fileName)}`,
  );
}

const countGeometryCoordinates = (geometry: Geometry): number => {
  if (geometry.type === "GeometryCollection")
    return geometry.geometries.reduce((total, item) => total + countGeometryCoordinates(item), 0);
  const stack: unknown[] = [geometry.coordinates];
  let count = 0;
  while (stack.length) {
    const value = stack.pop();
    if (!Array.isArray(value) || value.length === 0) continue;
    if (typeof value[0] === "number") {
      count += 1;
      continue;
    }
    for (const child of value) stack.push(child);
  }
  return count;
};

export function analyzeImportComplexity(
  fileName: string,
  data: FeatureCollection,
): ImportComplexity {
  const featureCount = data.features.length;
  if (featureCount > MAX_DIRECT_IMPORT_FEATURES)
    throw new Error(
      `The file contains ${featureCount.toLocaleString()} features, above LandDraft's browser-safe editable limit.${opportunityZoneHint(fileName)}`,
    );
  let coordinateCount = 0;
  for (const feature of data.features) {
    if (feature.geometry) coordinateCount += countGeometryCoordinates(feature.geometry);
    if (coordinateCount > MAX_DIRECT_IMPORT_COORDINATES)
      throw new Error(
        `The file contains more than ${MAX_DIRECT_IMPORT_COORDINATES.toLocaleString()} geometry vertices, above LandDraft's browser-safe editable limit.${opportunityZoneHint(fileName)}`,
      );
  }
  return { featureCount, coordinateCount };
}

/** Read ZIP central-directory sizes without inflating the archive. */
export function assertZipExpansionBudget(fileName: string, buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let endOffset = -1;
  const searchStart = Math.max(0, view.byteLength - 65_557);
  for (let candidate = view.byteLength - 22; candidate >= searchStart; candidate -= 1) {
    if (view.getUint32(candidate, true) === 0x06054b50) {
      endOffset = candidate;
      break;
    }
  }
  if (endOffset < 0) throw new Error("ZIP central directory could not be read");
  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  if (entryCount === 0xffff || offset === 0xffffffff)
    throw new Error(
      `The ZIP uses ZIP64 metadata that is unsafe to expand in the browser.${opportunityZoneHint(fileName)}`,
    );
  let expandedBytes = 0;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("ZIP central directory could not be read");
    const uncompressed = view.getUint32(offset + 24, true);
    if (uncompressed === 0xffffffff)
      throw new Error(
        `The ZIP uses a very large ZIP64 entry that is unsafe to expand in the browser.${opportunityZoneHint(fileName)}`,
      );
    expandedBytes += uncompressed;
    if (expandedBytes > MAX_EXPANDED_ZIP_BYTES)
      throw new Error(
        `The ZIP expands beyond ${(MAX_EXPANDED_ZIP_BYTES / 1024 / 1024).toFixed(0)} MB and was stopped before it could exhaust browser memory.${opportunityZoneHint(fileName)}`,
      );
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
}
