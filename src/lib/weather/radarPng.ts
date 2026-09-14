// PNG encoding without canvas APIs: tile generation also works in mobile workers
// that can decode NOAA scans but cannot create/encode an OffscreenCanvas.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function chunk(name: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(name), 4);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) crc = crcTable[(crc ^ bytes[i]!) & 255]! ^ (crc >>> 8);
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}
export function radarTilePng(pixels: Uint8ClampedArray): ArrayBuffer {
  if (pixels.length !== 256 * 256 * 4) throw new Error("Invalid radar image dimensions");
  const raw = new Uint8Array(256 * 1025);
  for (let row = 0; row < 256; row++)
    raw.set(pixels.subarray(row * 1024, (row + 1) * 1024), row * 1025 + 1);
  // Stored DEFLATE blocks avoid another compression dependency. These bytes
  // stay on-device between the radar worker and MapLibre's image decoder.
  const zlib = new Uint8Array(2 + raw.length + Math.ceil(raw.length / 65535) * 5 + 4);
  zlib.set([0x78, 0x01]);
  let offset = 2;
  for (let start = 0; start < raw.length; start += 65535) {
    const length = Math.min(65535, raw.length - start);
    zlib.set(
      [
        start + length === raw.length ? 1 : 0,
        length & 255,
        length >>> 8,
        ~length & 255,
        (~length >>> 8) & 255,
      ],
      offset,
    );
    zlib.set(raw.subarray(start, start + length), offset + 5);
    offset += length + 5;
  }
  let a = 1,
    b = 0;
  for (const value of raw) {
    a = (a + value) % 65521;
    b = (b + a) % 65521;
  }
  new DataView(zlib.buffer).setUint32(offset, ((b << 16) | a) >>> 0);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 256);
  view.setUint32(4, 256);
  header.set([8, 6], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib),
    chunk("IEND", new Uint8Array()),
  ];
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result.buffer;
}
