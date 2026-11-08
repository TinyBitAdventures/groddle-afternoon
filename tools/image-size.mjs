/**
 * A picture's pixel size from its header: PNG, lossless or lossy WebP (VP8L, VP8, VP8X) and JPEG.
 * The game's art is lossless WebP where that is smaller (2026-11-07), so anything that read a
 * PNG's IHDR reads it here instead.
 */
import { readFileSync } from 'node:fs';

/** { w, h, format } for a file path or Buffer, or null when the header is none of the four. */
export function imageSize(input) {
  const b = Buffer.isBuffer(input) ? input : readFileSync(input);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('ascii', 12, 16) === 'IHDR') {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), format: 'png' };
  }
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1, format: 'webp' };
    }
    if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1, format: 'webp' };
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, format: 'webp' };
    return null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), format: 'jpeg' };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** [w, h] or throws: for callers that expect a picture. */
export function imageDims(input) {
  const s = imageSize(input);
  if (!s) throw new Error(`not a PNG, WebP or JPEG: ${Buffer.isBuffer(input) ? '<buffer>' : input}`);
  return [s.w, s.h];
}
