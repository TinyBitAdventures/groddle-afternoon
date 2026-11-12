import { upgradeSource } from './sprite-hires.js?v=d4cce9f9';
import { frameTexture, loadTexture, whenLoaded } from './textures.js?v=f024bd6a';

/**
 * Packed animation sheets (js/packed-sheets-data.js, written by tools/packed-sheets/build.py): a
 * state of one of Tiny Speck's animations kept as its distinct cells, each cropped to one box.
 * A def is { path, fw, fh, cols, frames, plays, cell: [w, h], at: [x, y], fps, loop, seq? }:
 * `frames` cells are drawn in the file, and the state plays `plays` frames of them.
 * The textures cut here give every frame its original cell back (Pixi orig and trim), so a sprite
 * keeps the size, anchor and hit box it has with the uncropped sheets.
 */

/** PURE: the packed cell that frame k of the state shows (-1: the recording's frame is empty). */
export function packedCell(def, k) {
  const i = Math.min(def.plays - 1, Math.max(0, Math.floor(Number(k) || 0)));
  return def.seq ? def.seq[i] : i;
}

/** PURE: the pixel rect (1x) of packed cell `i` in the file. */
export function packedRect(def, i) {
  return { x: (i % def.cols) * def.fw, y: Math.floor(i / def.cols) * def.fh, w: def.fw, h: def.fh };
}

/**
 * PURE: the frame a state shows `ms` after it began. The client played a state at its own frame
 * rate, looping it if the SWF lists it in `loopers` and otherwise stopping on its last frame
 * (glitch-client spritesheet/SSCollection.as 116-131, SSViewSprite.as 60-95).
 */
export function packedFrameAt(def, ms) {
  const k = Math.floor((Math.max(0, Number(ms) || 0) * def.fps) / 1000);
  return def.loop ? k % def.plays : Math.min(def.plays - 1, k);
}

/** PURE: how long the state runs once through (ms). */
export function packedDurationMs(def) {
  return (def.plays * 1000) / def.fps;
}

/**
 * The state's textures in play order, cut from a loaded source: each frame keeps its original
 * cell (orig) with its box placed in it (trim); an empty frame is Pixi's Texture.EMPTY.
 */
export function cutPackedFrames(PIXI, base, def) {
  const orig = new PIXI.Rectangle(0, 0, def.cell[0], def.cell[1]);
  const cells = [];
  for (let i = 0; i < def.frames; i += 1) {
    const r = packedRect(def, i);
    cells.push(frameTexture(base, new PIXI.Rectangle(r.x, r.y, r.w, r.h), {
      orig,
      trim: new PIXI.Rectangle(def.at[0], def.at[1], r.w, r.h),
    }));
  }
  const out = [];
  for (let k = 0; k < def.plays; k += 1) out.push(cells[packedCell(def, k)] || PIXI.Texture.EMPTY);
  return out;
}

/**
 * A loader bound to one PIXI namespace. Nothing is fetched until load(def); frames(def) returns
 * the state's textures in play order (one array per def, the same array every call), or [] until
 * its file has loaded. A sheet with a 3x twin swaps to it the first time its frames are asked for.
 */
export function createPackedLoader(PIXI) {
  const bases = new Map();
  const loads = new Map();
  const lists = new Map();
  return {
    load(def) {
      if (bases.has(def.path)) return Promise.resolve(bases.get(def.path));
      if (!loads.has(def.path)) {
        loads.set(
          def.path,
          loadTexture(def.path, { raw: true })
            .then((texture) => {
              bases.set(def.path, texture.source);
              return texture.source;
            })
            .catch(() => null)
        );
      }
      return loads.get(def.path);
    },
    loadAll(defs) {
      return Promise.all(defs.map((def) => this.load(def)));
    },
    ready(def) {
      return bases.has(def.path);
    },
    frames(def) {
      const base = bases.get(def.path);
      if (!base) return [];
      const hit = lists.get(def.path);
      if (hit) return hit;
      upgradeSource(base, def.path, whenLoaded);
      const out = cutPackedFrames(PIXI, base, def);
      lists.set(def.path, out);
      return out;
    },
  };
}
