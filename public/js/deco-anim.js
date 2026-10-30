/**
 * Street decos that play (G435). The client shows a placed deco stopped on its first frame unless
 * the placement is flagged animated (DecoRenderer.as 301-305: MCUtil.recursiveGotoAndStop, else
 * MCUtil.recursivePlay), and then the deco's whole timeline runs at the stage's frame rate
 * (TSEngineConstants.TARGET_FRAMERATE 30). build-street-layers.mjs carries the flag into the street
 * JSON (`animated: true`); tools/deco-pipeline/animate.py renders each such deco's loop into a frame
 * strip (assets/decos/animated/<name>.json + .webp, js/deco-anim-list.js).
 *
 * js/street-render.js makes every flagged placement of a listed deco a PIXI.AnimatedSprite showing
 * the deco's still (frame 1, the same file as before) until its strip has loaded, then the loop:
 * - which strip: the 3x one where js/deco-hires.js would load the still's 3x file (not behind the
 *   middleground, not on a blurred layer, the renderer above HIRES_DECO_SCALE), else the 2x one;
 * - all placements on a street share one clock started with the street (Flash started every
 *   placed deco on frame 1 when the location loaded), so a deco that comes back on screen resumes
 *   where the clock is; while culled off screen it is stopped (setAnimCulled from cullDecos);
 * - colour layers recolour the strip once like any deco texture (street-render bakeLayerColour);
 *   blurred layers keep these decos out of their baked tiles and draw them live through the
 *   layer's colour and box blur at the bake's density (bakeBlurredLayer), between the baked bands
 *   of the decos under and over them.
 *
 * Rebuilt rooms play a few decos with no placement at all through sceneAnim (below).
 */
import { ANIM_DECOS } from './deco-anim-list.js?v=ecfee655';
import { wantsHiresDecos } from './deco-hires.js?v=a65f2d79';
import { isLoaded, onFailed, onLoaded, textureFromUrl } from './textures.js?v=01a295a1';

export const ANIM_BASE = 'assets/decos/animated/';
/** TSEngineConstants.TARGET_FRAMERATE: Flash played deco timelines at the stage's rate. */
export const ANIM_FPS = 30;

/** Does this placement play (flagged animated, and its deco has a strip)? `art` is the drawn name. */
export function isAnimatedDeco(deco, art = deco?.sprite) {
  return Boolean(deco?.animated && ANIM_DECOS.has(art));
}

/** [timeline frames, loop start, has a 3x strip] for a deco name, or null. */
export function animInfo(name) {
  return ANIM_DECOS.get(name) || null;
}

const data = new Map();
/** The deco's strip JSON (cached promise; null when it fails). */
export function loadAnimData(name, base = ANIM_BASE) {
  const url = `${base}${name}.json`;
  if (!data.has(url)) {
    data.set(url, fetch(url).then((res) => (res.ok ? res.json() : null)).catch(() => null));
  }
  return data.get(url);
}

/**
 * The timeline frame a clock started at `t0` shows at `now`: frames 0..n-1 once, then the loop
 * from `loopFrom` (hell_yelling_head_v2's frame script jumps back to "half blink").
 */
export function clockFrame(now, t0, frames, loopFrom = 0, fps = ANIM_FPS) {
  const n = Math.max(1, frames | 0);
  const f = Math.max(0, Math.floor(((now - t0) * fps) / 1000));
  if (f < n) return f;
  const from = Math.min(Math.max(0, loopFrom | 0), n - 1);
  return from + ((f - n) % (n - from));
}

/**
 * Which strip to draw: 3x where the still would be 3x (js/deco-hires.js decoUrl), else 2x.
 * @param {{ strips: { density: number }[] }} json
 * @param {{ resolution?: number, far?: boolean, blur?: number }} opts
 */
export function pickStrip(json, { resolution = 1, far = false, blur = 0 } = {}) {
  const strips = json?.strips || [];
  const three = strips.find((s) => s.density > 1);
  if (three && !far && !(blur > 0) && wantsHiresDecos(resolution)) return three;
  return strips.find((s) => s.density === 1) || strips[0] || null;
}

/**
 * One Texture per stored frame of a strip over `source` (the strip's image, or a recoloured copy
 * of it of the same logical size): frame rects are atlas pixels at `strip.res` texels per logical
 * px, trimmed, so each texture carries the deco's full logical size as `orig`.
 */
export function stripFrames(PIXI, source, strip, size) {
  const res = strip.res || 1;
  const orig = () => new PIXI.Rectangle(0, 0, size[0], size[1]);
  return strip.rects.map(([x, y, w, h, ox, oy]) => {
    const fw = Math.max(1, w);
    const fh = Math.max(1, h);
    return new PIXI.Texture({
      source,
      frame: new PIXI.Rectangle(x / res, y / res, fw / res, fh / res),
      orig: orig(),
      trim: new PIXI.Rectangle(ox / res, oy / res, fw / res, fh / res),
      dynamic: !isLoaded(source),
    });
  });
}

/** The textures of the whole timeline: each frame's stored texture, in sequence. */
export function timelineTextures(frames, seq) {
  return seq.map((i) => frames[i] || frames[0]);
}

/**
 * Make `spr` (a PIXI.AnimatedSprite showing the still) play deco `name` once its strip is in.
 * `opts.onReady(spr)` runs when the strip has loaded and returns true when it set the look itself
 * (street-render recolours the strip there); `size()` re-applies the placement's size. Returns the
 * sprite's anim state (spr.decoAnim).
 */
export function attachAnim(PIXI, spr, name, { clock, resolution = 1, far = false, blur = 0, size = () => {}, onReady = null, base = ANIM_BASE } = {}) {
  const info = animInfo(name) || [1, 0, 0];
  const anim = {
    name,
    clock,
    frames: info[0],
    loopFrom: info[1],
    ready: false,
    strip: null,
    url: null,
    seq: null,
    sets: new Map(),
    source: null,
    size,
  };
  spr.decoAnim = anim;
  spr.animationSpeed = ANIM_FPS / 60;
  spr.loop = true;
  spr.updateAnchor = false;
  spr.onLoop = () => {
    if (anim.loopFrom > 0 && !spr.destroyed) spr.gotoAndPlay(anim.loopFrom);
  };
  loadAnimData(name, base).then((json) => {
    if (!json || spr.destroyed) return;
    const strip = pickStrip(json, { resolution, far, blur });
    if (!strip) return;
    const url = `${base}${strip.file}`;
    const tex = textureFromUrl(url, { raw: true, resolution: strip.res });
    const go = () => {
      if (spr.destroyed) return;
      anim.strip = strip;
      anim.url = url;
      anim.size2 = json.size;
      anim.seq = json.seq;
      anim.frames = json.frames;
      anim.loopFrom = json.loopFrom || 0;
      anim.original = tex;
      anim.ready = true;
      // onReady (a recoloured layer) puts the loop on the layer's colour itself.
      if (!onReady?.(spr)) setAnimSource(PIXI, spr, tex.source);
    };
    onLoaded(tex, go);
    onFailed(tex, () => {});
  });
  return anim;
}

/** Show the loop drawn from `source` (the strip, or a recoloured copy), in step with the clock. */
export function setAnimSource(PIXI, spr, source) {
  const anim = spr.decoAnim;
  if (!anim?.ready || spr.destroyed) return;
  let set = anim.sets.get(source.uid);
  if (!set) {
    // Frames cut from a copy that has since been freed go with it.
    for (const [uid, old] of anim.sets) if (old.source.destroyed) anim.sets.delete(uid);
    set = { source, textures: timelineTextures(stripFrames(PIXI, source, anim.strip, anim.size2), anim.seq) };
    anim.sets.set(source.uid, set);
  }
  anim.source = source;
  spr.textures = set.textures;
  anim.size();
  syncAnim(spr);
}

/** Set a deco's look from a whole texture: a playing deco takes its frames over that texture's source. */
export function setDecoTexture(PIXI, spr, texture) {
  if (spr.decoAnim?.ready) setAnimSource(PIXI, spr, texture.source);
  else spr.texture = texture;
}

/**
 * A deco a rebuilt room plays though no archived street places it (tools/deco-pipeline/animate.py
 * SCENE_ANIMATED: An Autumn Day's falling leaves and girl, Being Watched's TVs): a
 * PIXI.AnimatedSprite anchored at the stage's bottom centre, sized like js/quest-rooms/kit.js deco
 * (scale 1 is the still's 2x pixel size, so 0.5 is the stage's own size), empty until its strip is
 * in. `clock` sets where in the loop it starts; `hold` (a timeline frame) stops it there instead of
 * playing.
 */
export function sceneAnim(PIXI, name, x, y, { scale = 1, flip = false, clock = performance.now(), hold = null, resolution = globalThis.devicePixelRatio || 1, ax = 0.5, ay = 1 } = {}) {
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(ax, ay);
  spr.scale.set(flip ? -scale : scale, scale);
  spr.x = x;
  spr.y = y;
  const onReady = hold == null ? null : (s) => {
    setAnimSource(PIXI, s, s.decoAnim.original.source);
    s.gotoAndStop(Math.max(0, Math.floor(hold)) % s.totalFrames);
    return true;
  };
  attachAnim(PIXI, spr, name, { clock, resolution, onReady });
  return spr;
}

/** Play from the clock when on screen, stop when culled. */
export function syncAnim(spr, now = performance.now()) {
  const anim = spr.decoAnim;
  if (!anim?.ready || spr.destroyed) return;
  if (spr.culled || !spr.visible) {
    if (spr.playing) spr.stop();
    return;
  }
  if (!spr.playing) spr.gotoAndPlay(clockFrame(now, anim.clock, anim.frames, anim.loopFrom));
}

/** cullDecos: a deco going off screen stops, one coming back resumes in step with the street. */
export function setAnimCulled(spr, culled, now) {
  if (spr.culled === culled && spr.playing === !culled) return;
  spr.culled = culled;
  syncAnim(spr, now);
}
