/**
 * R12: things stand on the ground. One place that decides where a sprite's art meets its point.
 *
 * The original put an item's (or an NPC's) registration point on its x, y: the SWF stage's bottom
 * centre (glitch-client LocationItemstackView.as _positionViewDO 853-854), where the artist drew the
 * feet. The OGA sheets we ship are cut to each animation's bounds instead, with blank rows under the
 * feet (a Chicken's cell keeps 14, a young Spice Tree's 36) and the art off the cell's middle (the
 * Chicken 27 px right), so a sprite anchored on its cell's bottom centre floated, sank, or hopped
 * when it turned (G515, G583, G490, G510, G516). tools/sprite-feet/build.mjs measures every sheet
 * and image under assets/sprites (js/sprite-feet-data.js); standOnFeet puts that foot on the point.
 *
 * - standOnFeet(sprite): anchor on the measured foot of the sprite's own art (its texture's file,
 *   at that cut's cell size). An AnimatedSprite keeps standing when its clip changes
 *   (`sprite.textures = ...`), a Sprite when its texture changes: each sheet's own foot (y per
 *   state, x shared by the animal's states, so a change of animation never slides it).
 * - anchorBottomCentre(obj, why): the plain bottom centre, for things that are not measured art,
 *   with the reason (BOTTOM_CENTRE). tests/sprite-feet.test.js fails on a hand-written
 *   `anchor.set(0.5, 1)` (or a hand-guessed 0.9x foot) anywhere in the game.
 */
import { SPRITE_FEET } from './sprite-feet-data.js?v=60c52fd6';
import { askedUrl } from './textures.js?v=b8e38103';

/** Why a thing keeps its plain bottom centre (anchorBottomCentre's `why`). */
export const BOTTOM_CENTRE = Object.freeze({
  text: 'a label or caption: text, not art',
  shape: 'a drawn shape, an empty hit box or a canvas the game paints itself',
  deco: "a deco, or a room piece drawn into its w x h box: the client drew a deco from its bottom centre (the street XML's x, y), Glitch's own registration",
  stage: "art that keeps Glitch's registration: its SWF overlay's, or its own feet (the vector avatar sheets)",
  held: 'art hung on another sprite or a hand, or following one, not standing on a line',
  snap: "a spot measured against the cell's bottom centre in a reference snap: the foot is already in the number",
});

const DEFAULT = Object.freeze({ x: 0.5, y: 1 });
/** Texture -> its foot ({ x, y } anchor), so a frame moved to a 3x part keeps the 1x answer. */
const feetOf = new WeakMap();

/** The data key a URL names: from `assets/`, no query; a routed `@Nx` name falls back to its 1x file. */
export function feetKey(url) {
  let s = String(url || '');
  const q = s.search(/[?#]/);
  if (q >= 0) s = s.slice(0, q);
  const at = s.indexOf('assets/');
  return at < 0 ? s.replace(/^\.?\//, '') : s.slice(at);
}

function rowFor(url) {
  const key = feetKey(url);
  if (Object.prototype.hasOwnProperty.call(SPRITE_FEET, key)) return SPRITE_FEET[key];
  const one = key.replace(/@\d+(?:\.\d+)?x(\.[a-z0-9]+)$/i, '$1');
  return one !== key && Object.prototype.hasOwnProperty.call(SPRITE_FEET, one) ? SPRITE_FEET[one] : null;
}

/**
 * PURE: the anchor (0..1 of the cell) that puts the art's foot on the point, for the art at `url`
 * cut at `cell` { width, height } (1x; null: the file's one cut). The cell's bottom centre for art
 * that stands there already or was never measured.
 */
export function footOf(url, cell = null) {
  const row = rowFor(url);
  if (!row) return DEFAULT;
  const cuts = Array.isArray(row[0]) ? row : [row];
  const w = Number(cell?.width);
  const h = Number(cell?.height);
  // A cut of another size (a frame the builder never saw cut) is not this measurement.
  const cut = w > 1 && h > 1 ? cuts.find((c) => Math.abs(c[0] - w) < 0.6 && Math.abs(c[1] - h) < 0.6) : cuts.length === 1 ? cuts[0] : null;
  if (!cut) return DEFAULT;
  const [cw, ch, fx, fy] = cut;
  return { x: fx / cw, y: fy / ch };
}

/** The foot of one Texture (its source's file at its cell size), remembered per Texture. */
export function textureFoot(texture) {
  if (!texture) return DEFAULT;
  let foot = feetOf.get(texture);
  if (!foot) {
    const url = askedUrl(texture);
    const orig = texture.orig;
    // A whole image is 1 x 1 until it loads; a frame cut from a sheet knows its cell at once.
    foot = url ? footOf(url, orig && orig.width > 1 ? orig : null) : DEFAULT;
    if (url) feetOf.set(texture, foot);
  }
  return foot;
}

/**
 * #735: a picture the game draws itself stands on the foot of the art it is drawn on (a trant
 * holding some of its fruit is its bare still with fruit pasted on: js/trant-looks.js).
 */
export function setTextureFoot(texture, url) {
  if (texture) feetOf.set(texture, footOf(url, texture.orig?.width > 1 ? texture.orig : null));
}

const SPRITE_TEXTURE = Symbol('groddleFeetTexture');
const ANIMATED_TEXTURES = Symbol('groddleFeetTextures');

function protoAccessor(obj, name) {
  for (let p = Object.getPrototypeOf(obj); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d?.set) return d;
  }
  return null;
}

/**
 * Anchor `sprite` on its art's measured foot, and keep it there when its art changes. `url` names
 * the art when the texture was not loaded through js/textures.js (else it is read off the texture).
 * Returns the sprite.
 */
export function standOnFeet(sprite, url = null) {
  if (!sprite?.anchor) return sprite;
  const apply = () => {
    const tex = Array.isArray(sprite.textures) && sprite.textures.length ? sprite.textures[0] : sprite.texture;
    const foot = url ? footOf(url, tex?.orig?.width > 1 ? tex.orig : null) : textureFoot(tex);
    sprite.anchor.set(foot.x, foot.y);
  };
  apply();
  if (url) return sprite;
  // An AnimatedSprite whose clip is swapped (walk -> peck -> stand) re-reads the new sheet's foot.
  if (Array.isArray(sprite.textures) && !sprite[ANIMATED_TEXTURES]) {
    const d = protoAccessor(sprite, 'textures');
    if (d) {
      sprite[ANIMATED_TEXTURES] = true;
      Object.defineProperty(sprite, 'textures', {
        configurable: true,
        get() { return d.get.call(this); },
        set(v) { d.set.call(this, v); apply(); },
      });
    }
  } else if (!Array.isArray(sprite.textures) && !sprite[SPRITE_TEXTURE]) {
    // A Sprite whose picture is swapped (a mailbox with mail, a rock's next state).
    const d = protoAccessor(sprite, 'texture');
    if (d) {
      sprite[SPRITE_TEXTURE] = true;
      Object.defineProperty(sprite, 'texture', {
        configurable: true,
        get() { return d.get.call(this); },
        set(v) { d.set.call(this, v); apply(); },
      });
    }
  }
  return sprite;
}

/** The plain bottom centre for something that is not measured art; `why` is a BOTTOM_CENTRE key. */
export function anchorBottomCentre(obj, why) {
  if (!Object.prototype.hasOwnProperty.call(BOTTOM_CENTRE, why)) throw new Error(`anchorBottomCentre: say why (${Object.keys(BOTTOM_CENTRE).join(', ')}), not ${why}`);
  obj?.anchor?.set(0.5, 1);
  return obj;
}
