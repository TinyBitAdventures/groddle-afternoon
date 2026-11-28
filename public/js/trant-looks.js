/**
 * #735: which picture a trant shows. The one chooser street trees (game.js) and patch trees
 * (features/patches-feature.js) share, and the drawing of the fruit counts between bare and full.
 *
 * Glitch drew a trant from one clip per maturity 1-10 (trees[maturity - 1] in each glitch-items
 * trant_*.as) holding fruit_amt (f_num / f_cap) of the fruit slots its health allows
 * (updateTrantDisplay: fruitPosArray / getFruitingPos [maturity][health]; the fruit tree floors,
 * the others round up and count only the clips there are). The art
 * (tools/vector-sprites/trant-fruit-levels.mjs, under assets/sprites/trants/frames/):
 *  - trant_<species>_m<1-10>.webp: the tree holding all the fruit a health-10 tree shows;
 *  - trant_<species>_m<stage>_f0.webp: bare, for the stages that bear fruit (4-10);
 *  - every count between: the bare still with pieces pasted on in Glitch's order
 *    (trant_<species>_m<stage>_fruit.webp, js/trant-fruit-pieces.js), drawn here once per look.
 * Not yet drawn: health on the leaves (Glitch's fol_N at health +/- jitter); every look is the
 * health-10 tree, holding the fruit its health allows.
 */
import { fetchRetry } from './load-retry.js?v=24823577';
import { fruitCapacityAt } from './trants.js?v=cf0fe1a3';
import { TRANT_FRUIT_PIECES } from './trant-fruit-pieces.js?v=b1fbc950';
import { hiresSpriteUrl } from './sprite-hires.js?v=6a4569c4';
import { setTextureFoot } from './sprite-feet.js?v=18e517a6';
import { isLoaded, onFailed, onLoaded, textureFromUrl } from './textures.js?v=29f80b6a';

export const TRANT_FRAMES = 'assets/sprites/trants/frames';
export const TRANT_FRAME_VERSION = 'all-species-cell-3';
/** Every maturity has its own picture, as every maturity had its own clip. */
export const TRANT_STAGES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The maturity clip a tree draws: trees[maturity - 1], 1-10 (0 draws the sprout; an unknown maturity the tall tree, 7). */
export function trantStage(maturity) {
  const n = Number(maturity ?? 7);
  return Number.isFinite(n) ? clamp(Math.floor(n), 1, 10) : 7;
}

/** The art file of a frame key (trant_fruit_m4, trant_fruit_m4_f0, trant_fruit_m4_fruit). */
export function trantFrameUrl(key) {
  return `${TRANT_FRAMES}/${key}.webp?v=${TRANT_FRAME_VERSION}`;
}

/**
 * How many of its fruit a tree shows (updateTrantDisplay): fruit_amt = fruitCount / fruitCapacity
 * of the slots its maturity and health allow; the fruit tree shows the cherries numbered up to
 * floor(fruit_amt * slots), the others the first ceil(fruit_amt * slots) of their fruit clips.
 * @param {string} classTsid
 * @param {{ maturity?: number, health?: number, fruitCount?: number, fruitCapacity?: number }} state
 */
export function trantFruitShown(classTsid, state) {
  const sp = TRANT_FRUIT_PIECES[classTsid];
  const stage = trantStage(state?.maturity);
  const st = sp?.stages?.[stage];
  if (!st) return 0;
  const h = Number.isFinite(Number(state?.health)) ? clamp(Math.floor(Number(state.health)), 1, 10) : 10;
  const slots = sp.slots[stage - 1]?.[h - 1] || 0;
  const cap = Number(state?.fruitCapacity ?? fruitCapacityAt(classTsid, stage, h)) || 0;
  const count = Math.max(0, Number(state?.fruitCount) || 0);
  // f_num never passes f_cap in Glitch; a stale count here does not grow fruit the health forbids.
  const amt = cap > 0 ? Math.min(1, count / cap) : 0;
  if (sp.rounding === 'floor') {
    const top = Math.floor(amt * slots);
    return st.ids.filter((id) => id <= top).length;
  }
  return Math.min(Math.ceil(amt * slots), st.ids.filter((id) => id <= slots).length);
}

/**
 * The look of a trant at `maturity`: with its state, holding the fruit it holds; without, holding
 * all a health-10 tree shows. `key` names the look (one per maturity and fruit count); `url` is its
 * file (full or bare), or null for a count drawn from `base` + `pieces` (loadTrantLook).
 * @param {string} classTsid
 * @param {number} maturity
 * @param {object|null} [state]
 */
export function trantLook(classTsid, maturity, state = null) {
  const stage = trantStage(maturity);
  const st = TRANT_FRUIT_PIECES[classTsid]?.stages?.[stage];
  const of = st ? st.ids.length : 0;
  const shown = state && st ? trantFruitShown(classTsid, { ...state, maturity: stage }) : of;
  const name = `${classTsid}_m${stage}`;
  const key = shown >= of ? name : shown <= 0 ? `${name}_f0` : `${name}_n${shown}`;
  return {
    classTsid,
    stage,
    shown,
    of,
    key,
    url: shown >= of ? trantFrameUrl(name) : shown <= 0 ? trantFrameUrl(`${name}_f0`) : null,
    base: of ? trantFrameUrl(`${name}_f0`) : null,
    atlas: of ? trantFrameUrl(`${name}_fruit`) : null,
    pieces: st && shown < of ? st.pieces.slice(0, shown) : [],
  };
}

/** Every file a look draws from (tests; a count between bare and full takes its bare still and pieces). */
export function trantLookFiles(look) {
  return look.url ? [look.url] : [look.base, look.atlas];
}

/** Drawn counts by key: { texture, promise }. */
const drawn = new Map();
const bitmaps = new Map();

function bitmap(url) {
  if (!bitmaps.has(url)) {
    const p = fetchRetry(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return res.blob();
      })
      .then((blob) => createImageBitmap(blob));
    p.catch(() => bitmaps.delete(url));
    bitmaps.set(url, p);
  }
  return bitmaps.get(url);
}

/** A url at 3x: `name.webp?v=..` -> `name@3x.webp?v=..`. */
const at3x = (url) => url.replace(/\.webp(?=\?|$)/, '@3x.webp');

/**
 * The bare still with the first `shown` pieces pasted on, each replacing its box, at 3x when the
 * game draws sprites sharp (js/sprite-hires.js), else 1x. Its foot is the bare still's.
 */
async function draw(look) {
  const PIXI = globalThis.PIXI;
  const hi = hiresSpriteUrl(look.base);
  const res = hi ? 3 : 1;
  const [base, atlas] = await Promise.all([bitmap(hi || look.base), bitmap(hi ? at3x(look.atlas) : look.atlas)]);
  const canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0);
  for (const piece of look.pieces) {
    if (!piece) continue;
    const [ax, ay, w, h, x, y] = piece.map((n) => n * res);
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(atlas, ax, ay, w, h, x, y, w, h);
  }
  const source = new PIXI.CanvasSource({ resource: canvas, resolution: res, scaleMode: 'linear' });
  const texture = new PIXI.Texture({ source, label: look.key });
  setTextureFoot(texture, look.base);
  return texture;
}

/**
 * The look's Texture once it is ready, else null (and it starts loading or drawing it: ask again,
 * as the game's ticker does, to swap it in).
 */
export function trantLookTexture(look) {
  if (look.url) {
    const tex = textureFromUrl(look.url);
    return isLoaded(tex.source) ? tex : null;
  }
  let entry = drawn.get(look.key);
  if (!entry) {
    entry = { texture: null, promise: null };
    entry.promise = draw(look).then(
      (texture) => (entry.texture = texture),
      () => {
        drawn.delete(look.key);
        return null;
      }
    );
    drawn.set(look.key, entry);
  }
  return entry.texture;
}

/** The look's Texture when it is ready (null when it cannot load). */
export function loadTrantLook(look) {
  if (look.url) {
    const tex = textureFromUrl(look.url);
    if (isLoaded(tex.source)) return Promise.resolve(tex);
    return new Promise((resolve) => {
      onLoaded(tex.source, () => resolve(tex));
      onFailed(tex.source, () => resolve(null));
    });
  }
  trantLookTexture(look);
  return drawn.get(look.key)?.promise ?? Promise.resolve(null);
}

/**
 * #735 review: start loading what any fruit count of this look's maturity is drawn from (its full
 * and bare stills, the bare still and pieces at the density draw() takes), so the next harvest's
 * look is a canvas draw away instead of a download. Street trees warm theirs when they are drawn.
 */
export function warmTrantLook(look) {
  const full = `${TRANT_FRAMES}/${look.classTsid}_m${look.stage}.webp?v=${TRANT_FRAME_VERSION}`;
  try {
    textureFromUrl(full);
    if (!look.base) return;
    textureFromUrl(look.base);
    const hi = hiresSpriteUrl(look.base);
    bitmap(hi || look.base).catch(() => {});
    bitmap(hi ? at3x(look.atlas) : look.atlas).catch(() => {});
  } catch {
    // No Pixi or no fetch (Node): nothing to warm.
  }
}

/**
 * #735 review: what a tree whose look changed shows now: its new look once that is ready, else the
 * picture it already shows (never the picture of another maturity or fruit count, which flashed a
 * full tree for half a second after every harvest), and only a tree with no picture yet takes
 * `standIn()`. Patch trees already wait for their look (features/patches-feature.js).
 * @param {ReturnType<typeof trantLook>} look
 * @param {any} current the Texture the tree shows, or null
 * @param {() => any} [standIn]
 */
export function trantShownTexture(look, current, standIn = () => null) {
  return trantLookTexture(look) || current || standIn();
}
