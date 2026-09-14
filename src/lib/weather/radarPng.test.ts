import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { radarTilePng } from "./radarPng.ts";
test("radar PNG tiles encode exact RGBA without worker canvas APIs", () => {
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37) % 256;
  const png = new Uint8Array(radarTilePng(pixels));
  assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer);
  let pos = 8;
  let raw;
  const names = [];
  while (pos < png.length) {
    const length = view.getUint32(pos);
    const name = new TextDecoder().decode(png.slice(pos + 4, pos + 8));
    names.push(name);
    if (name === "IDAT") raw = inflateSync(png.slice(pos + 8, pos + 8 + length));
    pos += length + 12;
  }
  assert.deepEqual(names, ["IHDR", "IDAT", "IEND"]);
  assert.equal(raw!.length, 256 * 1025);
  for (let row = 0; row < 256; row++) {
    assert.equal(raw![row * 1025], 0);
    assert.deepEqual(
      [...raw!.subarray(row * 1025 + 1, (row + 1) * 1025)],
      [...pixels.subarray(row * 1024, (row + 1) * 1024)],
    );
  }
  assert.throws(() => radarTilePng(new Uint8ClampedArray(4)), /dimensions/);
});
