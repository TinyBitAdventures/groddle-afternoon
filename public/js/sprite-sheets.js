import { upgradeSource } from './sprite-hires.js?v=g464-1';
import { frameTexture, loadTexture, whenLoaded } from './textures.js';

/**
 * Grid sprite-sheet slicing for feature modules (foxes, Heli Kitties).
 * A sheet def is { path, fw, fh, cols, frames, first? }: fixed fw×fh cells read
 * left to right, top to bottom, `frames` populated cells starting at `first`.
 * Cells are sliced exactly; atlases are never alpha-trimmed.
 */

/** Pixel rect of cell `index` (0-based within the populated run). */
export function cellRect(def, index) {
  const i = (def.first || 0) + index;
  const col = i % def.cols;
  const row = Math.floor(i / def.cols);
  return { x: col * def.fw, y: row * def.fh, w: def.fw, h: def.fh };
}

/** The texture cache key of one cell: its file and pixel rect (1x units). */
export function textureKey(path, rect) {
  return `${path}#${rect.x},${rect.y},${rect.w},${rect.h}`;
}

/** Frames per Pixi tick (60 Hz) for a clip authored at `fps`. */
export function pixiSpeed(fps = 30) {
  return fps / 60;
}

/**
 * A small loader bound to one PIXI namespace. Sheets load once; textures are
 * cached per (path, cell rectangle), so two clips cutting one file from
 * different start cells (`first`) or grids never share frames (G281).
 */
export function createSheetLoader(PIXI) {
  const bases = new Map();
  const loads = new Map();
  const textures = new Map();
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
      // Features load every sheet on each street; only drawn ones swap to 3x.
      upgradeSource(base, def.path, whenLoaded);
      const out = [];
      for (let i = 0; i < def.frames; i += 1) {
        const r = cellRect(def, i);
        const key = textureKey(def.path, r);
        if (!textures.has(key)) {
          textures.set(key, frameTexture(base, new PIXI.Rectangle(r.x, r.y, r.w, r.h)));
        }
        out.push(textures.get(key));
      }
      return out;
    },
  };
}
