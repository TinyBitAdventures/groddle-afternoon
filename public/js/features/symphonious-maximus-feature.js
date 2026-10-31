/**
 * Symphonious Maximus (register row G90): the rebuilt street behind
 * Cebarkul's wooden door (data and layout in js/symphonious-maximus.js,
 * street JSON from tools/build-symphonious-maximus.mjs).
 *
 * - Ecology: the video shows no animals, trees, vendor or shrine, so the
 *   street gets an empty population (no fallback piggies).
 * - Star-Jinglers (items/toy_star_1.js): touching one plays BIG_STAR_3 for
 *   everyone on the street (announce_sound_to_all) and sets its state to
 *   "glow", which nothing resets, so a touched star keeps cycling its
 *   29-frame glow. Glowing stars are remembered in the street's slot. The
 *   three big stars in the island gaps are decoration.
 * - The craters' bounce is street event data (location-events feature).
 * - Glow orbs and soil notes (G104, from four player Snaps): the street's
 *   `glowOrbs` are clean vector discs (white disc, dark gap, pale ring; no
 *   CC0 art has them) drawn into the middleground behind the trees and
 *   islands, drifting slowly; `soilArt` places the music-note burrow
 *   (zutto1.swf ground_large_2's top) in the soil band. Data: symphoniousOrbs.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GUVR3SGQ6EF3400 (or through
 * Cebarkul's door: doordemo=GIF12PMQ5121D68&doorautoplay=1). Add
 * &symphoniousreset=1 to clear the glowing stars. Data: symphoniousStars,
 * symphoniousGlowing, symphoniousTouches, symphoniousLast.
 */

import { textureFromUrl } from '../textures.js?v=db2ce452';
import { STAR_JINGLER, SYMPHONIOUS_LABEL, SYMPHONIOUS_SOURCE_TSID, glowAlpha, isSymphoniousTsid, touchesStar } from '../symphonious-maximus.js?v=345ad437';

export const SYMPHONIOUS_FEATURE_ID = 'symphonious-maximus';
const STAR_Z = 12;
const DATA_MS = 250;

let views = []; // { star, base, glow, touching }
let orbs = []; // { g, x, y, phase }
let extras = []; // soil sprites
let orbDrift = { amp: 0, periodMs: 1 };
let slot = null;
let active = false;
let touches = 0;
let last = '';
let lastData = 0;

export const isSymphonious = isSymphoniousTsid;

function clear() {
  for (const v of views) {
    for (const s of [v.base, v.glow]) if (s && !s.destroyed) s.destroy();
  }
  views = [];
  for (const o of [...orbs.map((v) => v.g), ...extras]) if (o && !o.destroyed) o.destroy();
  orbs = [];
  extras = [];
  slot = null;
  active = false;
}

function publish(engine, now = Date.now(), force = false) {
  if (!force && now - lastData < DATA_MS) return;
  lastData = now;
  engine.setData('symphoniousStars', active ? views.filter((v) => !v.big).length : 0);
  engine.setData('symphoniousGlowing', active ? Object.keys(slot?.glowing || {}).length : 0);
  engine.setData('symphoniousTouches', touches);
  engine.setData('symphoniousLast', last);
  engine.setData('symphoniousOrbs', active ? orbs.length : 0);
}

function starSprite(engine, url, x, y, scale) {
  const sprite = new engine.PIXI.Sprite(textureFromUrl(url));
  sprite.anchor.set(0.5, 0.5);
  sprite.width = STAR_JINGLER.w * scale;
  sprite.height = STAR_JINGLER.h * scale;
  sprite.x = x;
  sprite.y = y;
  sprite.zIndex = STAR_Z;
  engine.entityLayer.addChild(sprite);
  return sprite;
}

/** A street layer's container, found through one of its decos (orbs: the middleground, behind its trees and islands). */
function layerOf(engine, decoId) {
  return engine.decoViews?.get?.(decoId)?.parent || null;
}

/** One orb: pale ring, dark gap, white disc (the Snaps' shape), centred on 0,0. */
function orbGraphic(PIXI, r, shape) {
  const g = new PIXI.Graphics();
  g.circle(0, 0, r).fill({ color: 0xffffff, alpha: shape.ringAlpha });
  g.circle(0, 0, r * shape.gap).fill({ color: shape.gapColor, alpha: shape.gapAlpha });
  g.circle(0, 0, r * shape.disc).fill({ color: 0xffffff, alpha: 1 });
  return g;
}

function drawExtras(street, engine) {
  const PIXI = engine.PIXI;
  const parent = layerOf(engine, 'island_teal');
  const host = parent || engine.entityLayer;
  const soil = layerOf(engine, 'sym_soil_1');
  const data = street.glowOrbs;
  if (data?.orbs?.length && data.shape) {
    orbDrift = data.drift || orbDrift;
    data.orbs.forEach((o, i) => {
      const g = orbGraphic(PIXI, o.r, data.shape);
      g.x = o.x;
      g.y = o.y;
      g.zIndex = parent ? 5 : 1;
      host.addChild(g);
      orbs.push({ g, x: o.x, y: o.y, phase: (i * 0.37) % 1 });
    });
  }
  for (const a of street.soilArt || []) {
    const spr = new PIXI.Sprite(textureFromUrl(a.file));
    spr.anchor.set(0.5, 0);
    spr.width = a.w;
    spr.height = a.h;
    spr.x = a.x;
    spr.y = a.y;
    spr.zIndex = soil ? 3 : 0;
    (soil || engine.entityLayer).addChild(spr);
    extras.push(spr);
  }
}

export const symphoniousMaximusFeature = {
  id: SYMPHONIOUS_FEATURE_ID,

  /** No animals, trees, rocks, vendor, shrine or quoins in the recording. */
  ecologyOverride(street) {
    if (!isSymphonious(street?.tsid)) return null;
    return { label: SYMPHONIOUS_LABEL, sourceTsid: SYMPHONIOUS_SOURCE_TSID, counts: {}, empty: true };
  },

  onStreetEnter(street, engine) {
    clear();
    const data = street?.starJinglers;
    if (!isSymphonious(street?.tsid) || !data || engine.transientInstance?.() || engine.homeContext?.().inHome) {
      publish(engine, Date.now(), true);
      return;
    }
    active = true;
    slot = engine.streetSlot(SYMPHONIOUS_FEATURE_ID);
    if (engine.param('symphoniousreset') === '1' || !slot.glowing || typeof slot.glowing !== 'object') slot.glowing = {};
    const p = engine.player;
    for (const star of data.stars || []) {
      const base = starSprite(engine, STAR_JINGLER.art, star.x, star.y, 1);
      const glow = starSprite(engine, STAR_JINGLER.glowArt, star.x, star.y, 1);
      glow.zIndex = STAR_Z + 1;
      glow.visible = Boolean(slot.glowing[star.id]);
      // Arriving inside a star is not a touch.
      views.push({ star, base, glow, touching: Boolean(p && touchesStar(star, p.x, p.y)) });
    }
    for (const big of data.bigStars || []) {
      views.push({ star: big, big: true, base: starSprite(engine, STAR_JINGLER.art, big.x, big.y, big.scale || 2), glow: null });
    }
    drawExtras(street, engine);
    publish(engine, Date.now(), true);
  },

  onStreetClear() {
    clear();
  },

  onTick(dtMs, now, engine) {
    if (!active || !slot) return;
    const p = engine.player;
    const t = Date.now();
    for (const o of orbs) {
      const a = ((t / orbDrift.periodMs + o.phase) % 1) * Math.PI * 2;
      o.g.y = o.y + Math.sin(a) * orbDrift.amp;
      o.g.x = o.x + Math.sin(a * 0.5) * orbDrift.amp * 0.6;
    }
    for (const v of views) {
      if (v.big) continue;
      const inside = Boolean(p && touchesStar(v.star, p.x, p.y));
      if (inside && !v.touching) {
        // onPlayerCollision: announce_sound_to_all(BIG_STAR_3), setAndBroadcastState('glow').
        engine.playSound(STAR_JINGLER.sound, { volume: 0.6, allowMultiple: true });
        // Setting the state again restarts the glow from its first frame.
        slot.glowing[v.star.id] = t;
        touches += 1;
        last = v.star.id;
      }
      v.touching = inside;
      const since = slot.glowing[v.star.id];
      if (v.glow && !v.glow.destroyed) {
        v.glow.visible = Boolean(since);
        if (since) v.glow.alpha = glowAlpha(t - since);
      }
    }
    publish(engine, t);
  },
};
