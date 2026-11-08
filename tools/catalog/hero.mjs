/**
 * The picture at the top of an item page (Austin 2026-11-05: "a larger item
 * picture"), chosen from the CC0 art already in the build, nothing new:
 *
 *  - the pack icon's 3x render, assets/sprites/icons/<id>@3x.png (tinyspeck's
 *    glitch-items SWF `iconic` frame at zoom 3, js/icon-hires.js), else the 1x
 *    OGA icon;
 *  - or, when it is bigger, the art the game draws the thing with where it
 *    stands: the 3x render of a single-picture sprite named for the item
 *    (js/sprite-hires.js HIRES_SPRITES) in the folders below, e.g. a
 *    furniture piece in a home (homes-catalog.js paths), a cultivation
 *    prototype in the yard, a Piggy Feeder or a Party ATM.
 *
 * It is drawn at most HERO_BOX css px on its long side (the frame in
 * catalog.css), up to 1.4 times the art's own 3x size so a small icon grows a
 * little, never more. The standing art wins when it puts clearly more real
 * pixels on the page (a 216 x 279 chair over a 111 x 144 icon); a picture
 * heavier than MAX_BYTES stays the icon.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HERO_BOX = 208;
export const MAX_UPSCALE = 1.4;
export const MAX_BYTES = 100 * 1024;
/** Sprite folders whose single pictures are an item as it stands (not sheets, not effects). */
export const STANDING_ART = ['furniture', 'cultivation', 'cultivation/proto', 'animals', 'butler', 'parties', 'races'];

/** Width and height of a PNG or WebP file, or null. */
export function imageSize(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 12, 16) === 'IHDR') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  }
  return null;
}

/** css size for art whose 3x render is w x h. */
export function fitHero(w, h, upscale = MAX_UPSCALE) {
  const scale = Math.min(HERO_BOX / w, HERO_BOX / h, upscale);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Loads the build's sprite list and returns heroFor(id, icon) -> { src, w, h, from } or null. */
export async function loadHero(root) {
  const pub = join(root, 'public');
  const { HIRES_SPRITES } = await import(pathToFileURL(join(pub, 'js', 'sprite-hires.js')).href);
  const standing = new Map();
  for (const [one, three] of HIRES_SPRITES) {
    const m = /^assets\/sprites\/(.+)\/([a-z0-9_]+)\.(?:png|webp)$/.exec(one);
    if (m && STANDING_ART.includes(m[1])) standing.set(m[2], three);
  }
  /**
   * icon: build.mjs iconOf ({ w, h, hi } of the pack icon, or null).
   */
  return function heroFor(id, icon) {
    const options = [];
    if (icon) {
      options.push(icon.hi
        ? { src: `assets/sprites/icons/${id}@3x.webp`, w: icon.hi.w, h: icon.hi.h, from: 'icon' }
        : { src: `assets/sprites/icons/${id}.webp`, w: icon.w * 3, h: icon.h * 3, from: 'icon1x' });
    }
    const art = standing.get(id);
    if (art && statSync(join(pub, art)).size <= MAX_BYTES) {
      const size = imageSize(join(pub, art));
      if (size) options.push({ src: art, ...size, from: 'standing' });
    }
    if (!options.length) return null;
    // A 1x icon is already drawn at three times its size: it grows no further.
    const fit = (o) => fitHero(o.w, o.h, o.from === 'icon1x' ? 1 : MAX_UPSCALE);
    // Sharp pixels on the page: the drawn area, counting only what the art really has (an upscale adds none).
    const sharp = (o) => { const f = fit(o); return Math.min(f.w * f.h, o.from === 'icon1x' ? (o.w * o.h) / 9 : o.w * o.h); };
    // The icon unless the standing art is clearly sharper there (a fifth more).
    const best = options.reduce((a, b) => (sharp(b) > sharp(a) * 1.2 ? b : a));
    return { ...best, ...fit(best), natural: { w: best.w, h: best.h } };
  };
}
