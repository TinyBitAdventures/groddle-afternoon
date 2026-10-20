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

/** Frames per Pixi tick (60 Hz) for a clip authored at `fps`. */
export function pixiSpeed(fps = 30) {
  return fps / 60;
}

/**
 * A small loader bound to one PIXI namespace. Sheets load once; textures are
 * cached per (path, frame).
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
          PIXI.Assets.load(def.path)
            .then((texture) => {
              bases.set(def.path, texture.baseTexture);
              return texture.baseTexture;
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
      const out = [];
      for (let i = 0; i < def.frames; i += 1) {
        const key = `${def.path}#${i}`;
        if (!textures.has(key)) {
          const r = cellRect(def, i);
          textures.set(key, new PIXI.Texture(base, new PIXI.Rectangle(r.x, r.y, r.w, r.h)));
        }
        out.push(textures.get(key));
      }
      return out;
    },
  };
}
