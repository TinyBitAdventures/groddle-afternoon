/**
 * Lossless WebP for the game's raster art (Austin 2026-11-07: "Convert everything to lossless
 * WebP and only keep it if the size is smaller"). Every generator that writes a picture the
 * game ships writes it through here, so a rebuild never brings the PNGs back.
 *
 * The encoder is `cwebp -lossless -z 9 -exact -metadata none`: -exact keeps the colour under
 * fully transparent pixels, so the WebP decodes to exactly the PNG's pixels (alpha included).
 * The same encoder and input give the same bytes, so a generator's --check can compare files.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CWEBP_ARGS = Object.freeze(['-quiet', '-lossless', '-z', '9', '-exact', '-metadata', 'none']);

/** Encode the picture file `input` (PNG, or anything cwebp reads) to the lossless WebP `output`. */
export function encodeLosslessWebp(input, output) {
  const tmp = `${output}.tmp-${process.pid}.webp`;
  execFileSync('cwebp', [...CWEBP_ARGS, input, '-o', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
  renameSync(tmp, output);
  return output;
}

/** PNG bytes in, lossless WebP bytes out. */
export function pngBufferToWebp(png) {
  const dir = mkdtempSync(join(tmpdir(), 'webp-'));
  try {
    writeFileSync(join(dir, 'in.png'), png);
    execFileSync('cwebp', [...CWEBP_ARGS, join(dir, 'in.png'), '-o', join(dir, 'out.webp')], { stdio: ['ignore', 'ignore', 'pipe'] });
    return readFileSync(join(dir, 'out.webp'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Write PNG bytes to `output` (a .webp path) as lossless WebP. */
export function writeLosslessWebp(output, png) {
  writeFileSync(output, pngBufferToWebp(png));
  return output;
}

/**
 * Turn the PNG at `pngPath` into `<same stem>.webp` beside it and delete the PNG. Returns the
 * WebP path. For generators that still draw a PNG with ImageMagick or a browser screenshot.
 */
export function replacePngWithWebp(pngPath, webpPath = pngPath.replace(/\.png$/i, '.webp')) {
  encodeLosslessWebp(pngPath, webpPath);
  if (existsSync(pngPath) && pngPath !== webpPath) rmSync(pngPath);
  return webpPath;
}

/** The path with its .png/.jpg ending swapped for .webp. */
export const webpName = (p) => String(p).replace(/\.(png|jpe?g)$/i, '.webp');

