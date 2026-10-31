/**
 * Zone ambient effects (level builder spec 4, 15 Q12): steam vents, lava squirts and embers placed
 * on a street like decos, and a street-wide earthquake rumble. They are zone content, carried by
 * the street JSON of builder streets (`emitters[]`, `rumble`); they are not GSJS location events
 * (Q9 stays open) and no shipped street has them.
 *
 *   emitter  { id: 'fx_<n>', kind: 'steam' | 'lava' | 'embers', layer?, x, y, sprite?, rate, size,
 *              height, spread?, period?: [min, max], burst?, hidden? }
 *            x, y is the vent's mouth in its layer's space, as a deco's anchor is (the middleground
 *            in world px, other layers layer-local); rate is particles a second while it puffs;
 *            size the particle's size in px; height how high the plume rises or the squirt flies;
 *            spread degrees either side of straight up; period the seconds from one burst's start
 *            to the next (a random pick in the range each time) and burst the seconds a burst
 *            lasts. Without a period it never stops. sprite names the particle's art (library or
 *            the zone's own gz_ art); without one a soft built-in shape is drawn.
 *   rumble   { every: [min, max], duration, strength, sound? }  seconds between rumbles, seconds a
 *            rumble lasts, the shake's size in px; the camera shakes through the engine's per-frame
 *            camera offset (game.js nudgeCamera). sound (default true) plays ROCKS_DISAPPEAR, Tiny
 *            Speck's rocky rumble.
 *
 * Cheap by construction: each emitter's sprites are made once, as many as can be alive at once
 * (rate x the longest life), and reused; nothing is allocated per frame; an emitter off screen
 * stops (and keeps its sprites hidden). The validator caps a street's emitters, live particles
 * and overdraw (EFFECT_LIMITS, spec 12). Under prefers-reduced-motion nothing shakes and emitters
 * run calmer (calmEmitter).
 *
 * The pure half (no Pixi, no DOM) is shared by the validator, the CLI and the guide; the view half
 * (createStreetEffects) by the game (js/features/zone-effects-feature.js), the editor and the
 * render page (/builder-render/).
 */
import { worldToScreen } from './street-model.js?v=23b926e5';
import { textureFromUrl, isLoaded, isFailed, onLoaded } from './textures.js?v=db2ce452';

export const EFFECT_KINDS = Object.freeze(['steam', 'lava', 'embers']);
/** Plain words for each kind (inspector, CLI, guide). */
export const EFFECT_WORDS = Object.freeze({ steam: 'Steam vent', lava: 'Lava squirt', embers: 'Embers' });
/** A new emitter of each kind, as the editor and `cli.mjs effect` place it. */
export const EFFECT_DEFAULTS = Object.freeze({
  steam: Object.freeze({ rate: 6, size: 70, height: 260, spread: 12, period: Object.freeze([6, 10]), burst: 3.5 }),
  lava: Object.freeze({ rate: 8, size: 26, height: 220, spread: 18, period: Object.freeze([4, 9]), burst: 1.2 }),
  embers: Object.freeze({ rate: 3, size: 12, height: 320, spread: 30 }),
});
/** Each field's range (the schema's, $defs/emitter and $defs/rumble). */
export const EFFECT_RANGES = Object.freeze({
  rate: [0.2, 40], size: [4, 240], height: [10, 1200], spread: [0, 90], period: [0.5, 120], burst: [0.1, 60],
});
export const RUMBLE_RANGES = Object.freeze({ every: [4, 600], duration: [0.2, 6], strength: [1, 24] });
export const RUMBLE_DEFAULTS = Object.freeze({ every: Object.freeze([14, 30]), duration: 1.6, strength: 6 });
/** Spec 12: per street. Particles is the most alive at once; overdraw is their area in Wide views. */
export const EFFECT_LIMITS = Object.freeze({ emitters: 40, particles: 400, overdraw: 4, rumbleShare: 0.34, rumbleStrong: 16 });
export const RUMBLE_SOUND = 'ROCKS_DISAPPEAR';
const WIDE_AREA = 960 * 540;
/** Lava's gravity in px/s² (a squirt's flight is height-driven, so this sets only its pace). */
const LAVA_G = 1500;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** PURE: an emitter with every field filled in and kept in range. */
export function normaliseEmitter(e) {
  const kind = EFFECT_KINDS.includes(e?.kind) ? e.kind : 'steam';
  const d = EFFECT_DEFAULTS[kind];
  const R = EFFECT_RANGES;
  const period = Array.isArray(e?.period) && e.period.length === 2
    ? [clamp(num(e.period[0], 5), ...R.period), clamp(num(e.period[1], 5), ...R.period)].sort((a, b) => a - b)
    : null;
  return {
    id: String(e?.id || ''),
    kind,
    layer: typeof e?.layer === 'string' && e.layer ? e.layer : 'middleground',
    x: num(e?.x, 0),
    y: num(e?.y, 0),
    sprite: typeof e?.sprite === 'string' && e.sprite ? e.sprite : null,
    rate: clamp(num(e?.rate, d.rate), ...R.rate),
    size: clamp(num(e?.size, d.size), ...R.size),
    height: clamp(num(e?.height, d.height), ...R.height),
    spread: clamp(num(e?.spread, d.spread), ...R.spread),
    period,
    burst: period ? Math.min(clamp(num(e?.burst, d.burst ?? 2), ...R.burst), period[0]) : null,
    hidden: e?.hidden === true,
  };
}

/** PURE: the reduced-motion version: half as many particles, a lower plume, slower. */
export function calmEmitter(n) {
  return { ...n, rate: Math.max(EFFECT_RANGES.rate[0], n.rate * 0.5), height: n.height * 0.6, calm: true };
}

/** PURE: a particle's longest life in seconds for an emitter. */
export function particleLife(n) {
  if (n.kind === 'lava') return (2 * Math.sqrt(2 * LAVA_G * n.height)) / LAVA_G + 0.35;
  if (n.kind === 'embers') return 2.6;
  return 2.4;
}

/** PURE: the most particles an emitter has alive at once (its pool's size). */
export function emitterPool(n) {
  return Math.max(1, Math.ceil(n.rate * particleLife(n) * (n.kind === 'steam' ? 1.2 : 1)));
}

/** PURE: the largest size a particle reaches (steam grows as it rises). */
const grownSize = (n) => n.size * (n.kind === 'steam' ? 1.6 : 1);

/** PURE: what a street's effects cost: emitters, live particles, overdraw (in Wide views). */
export function effectsCost(street) {
  let particles = 0;
  let area = 0;
  let emitters = 0;
  for (const e of street?.emitters || []) {
    emitters += 1;
    if (e?.hidden) continue;
    const n = normaliseEmitter(e);
    const pool = emitterPool(n);
    particles += pool;
    area += pool * grownSize(n) ** 2 * (n.kind === 'steam' ? 0.5 : 1);
  }
  return { emitters, particles, overdraw: Math.round((area / WIDE_AREA) * 100) / 100 };
}

/** PURE: the share of the time a rumble shakes (its duration over the shortest gap). */
export function rumbleShare(r) {
  if (!r || !Array.isArray(r.every)) return 0;
  const lo = Math.min(Number(r.every[0]) || 0, Number(r.every[1]) || 0);
  return lo > 0 ? Math.round((Number(r.duration) / lo) * 100) / 100 : 1;
}

/** PURE: a rumble with its fields filled in and in range, or null. */
export function normaliseRumble(r) {
  if (!r || typeof r !== 'object') return null;
  const R = RUMBLE_RANGES;
  const every = Array.isArray(r.every) && r.every.length === 2
    ? [clamp(num(r.every[0], 20), ...R.every), clamp(num(r.every[1], 20), ...R.every)].sort((a, b) => a - b)
    : [...RUMBLE_DEFAULTS.every];
  return {
    every,
    duration: clamp(num(r.duration, RUMBLE_DEFAULTS.duration), ...R.duration),
    strength: clamp(num(r.strength, RUMBLE_DEFAULTS.strength), ...R.strength),
    sound: r.sound !== false,
  };
}

/** PURE: a small seeded random source (mulberry32) from a string; no allocation per call. */
export function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < String(text).length; i += 1) h = Math.imul(h ^ String(text).charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** PURE: the envelope of a shake at progress p (0..1): a quick rise, a long tail. */
export function rumbleEnvelope(p) {
  if (!(p > 0) || p >= 1) return 0;
  return p < 0.15 ? p / 0.15 : (1 - p) / 0.85;
}

/**
 * PURE: a rumble's clock. `step(dt)` moves it on by dt seconds and returns this frame's offset in
 * `out` ({ dx, dy, k, started }): k is the envelope (0 between rumbles), started is true on the
 * frame a rumble begins (the sound's cue). The first rumble comes after the shortest gap's half,
 * so a player arriving sees one soon. Under reduced motion dx and dy stay 0 (k still runs).
 */
export function createRumbleClock(rumble, seed, { reduced = false } = {}) {
  const r = normaliseRumble(rumble);
  const rnd = seededRandom(`rumble|${seed}`);
  const out = { dx: 0, dy: 0, k: 0, started: false, active: false };
  if (!r) return { rumble: null, out, step: () => out, reset() {} };
  let next = r.every[0] * 0.5;
  let until = -1;
  let t = 0;
  return {
    rumble: r,
    out,
    /** Start a rumble now (the editor's preview). */
    trigger() { next = t; },
    reset() { t = 0; next = r.every[0] * 0.5; until = -1; },
    step(dt) {
      t += Math.max(0, Math.min(0.25, dt));
      out.started = false;
      if (until < 0 && t >= next) {
        until = t + r.duration;
        out.started = true;
      }
      if (until >= 0) {
        const p = 1 - (until - t) / r.duration;
        out.k = rumbleEnvelope(p);
        out.active = true;
        if (t >= until) {
          until = -1;
          out.k = 0;
          out.active = false;
          next = t + r.every[0] + rnd() * (r.every[1] - r.every[0]);
        }
      } else {
        out.k = 0;
        out.active = false;
      }
      const s = reduced ? 0 : r.strength * out.k;
      out.dx = s * (rnd() * 2 - 1);
      out.dy = s * 0.6 * (rnd() * 2 - 1);
      return out;
    },
  };
}

/** PURE: an emitter's anchor in its layer's container (screen px for the middleground). */
export function emitterAnchor(street, n) {
  return n.layer === 'middleground' ? worldToScreen(street, n.x, n.y) : { x: n.x, y: n.y };
}

// —— The view (Pixi) ——

const builtIn = new Map();
/** A soft built-in particle texture for a kind, drawn once per page on a canvas. */
function builtInTexture(PIXI, kind) {
  if (builtIn.has(kind)) return builtIn.get(kind);
  if (typeof document === 'undefined') return PIXI.Texture.WHITE;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (kind === 'lava') {
    grad.addColorStop(0, 'rgba(255,246,170,1)');
    grad.addColorStop(0.35, 'rgba(255,170,40,1)');
    grad.addColorStop(0.7, 'rgba(214,64,20,0.95)');
    grad.addColorStop(1, 'rgba(120,20,10,0)');
  } else if (kind === 'embers') {
    grad.addColorStop(0, 'rgba(255,250,200,1)');
    grad.addColorStop(0.4, 'rgba(255,180,60,0.9)');
    grad.addColorStop(1, 'rgba(255,90,20,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.55, 'rgba(236,236,240,0.45)');
    grad.addColorStop(1, 'rgba(220,220,228,0)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = PIXI.Texture.from(c);
  builtIn.set(kind, tex);
  return tex;
}

/** Whether the page asks for less motion. */
export function prefersReducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * Builds a street's effects into a street view (street-render.js buildStreetView's root). Each
 * emitter gets a container beside its layer's container (same parent, drawn just above the layer's
 * decos, following the layer's parallax every render), with a pool of sprites made now.
 *
 * opts: { decoBase, available (Set of sprite names with art), reduced (default: the media query),
 *         seed (default the street's tsid), always (every emitter puffs without pause: a still) }
 * Returns { update(dtMs, cam), rumble (the clock or null), simulate(seconds), setVisible(on),
 *           stats(), destroy() }. cam is { x, y, w, h } in the view's screen px (the camera's
 *           top-left and size); emitters off it (with a margin) stop.
 */
export function createStreetEffects(street, PIXI, view, opts = {}) {
  const reduced = opts.reduced ?? prefersReducedMotion();
  const always = opts.always === true;
  const seed = opts.seed ?? street?.tsid ?? 'street';
  const decoBase = opts.decoBase || 'assets/decos/groddle/';
  const available = opts.available || null;
  const emitters = [];
  const containers = view?.layerContainers || [];
  for (const raw of street?.emitters || []) {
    if (raw?.hidden) continue;
    let n = normaliseEmitter(raw);
    if (reduced) n = calmEmitter(n);
    if (always) n = { ...n, period: null, burst: null };
    const lc = containers.find((c) => c.label === n.layer);
    if (!lc || !lc.parent) continue;
    const box = new PIXI.Container();
    box.label = `fx:${n.id}`;
    box.zIndex = lc.zIndex + 5;
    box.eventMode = 'none';
    box.onRender = () => {
      box.x = lc.x;
      box.y = lc.y;
      box.visible = lc.visible && box.on;
    };
    box.on = true;
    lc.parent.addChild(box);
    let tex = null;
    if (n.sprite && (!available || available.has(n.sprite))) tex = textureFromUrl(`${decoBase}${n.sprite}.png`);
    const fallback = builtInTexture(PIXI, n.kind);
    const pool = [];
    const count = emitterPool(n);
    for (let i = 0; i < count; i += 1) {
      const s = new PIXI.Sprite(tex && isLoaded(tex) ? tex : fallback);
      s.anchor.set(0.5);
      s.visible = false;
      s.fx = { live: false, age: 0, life: 1, vx: 0, vy: 0, x: 0, y: 0, spin: 0, s0: 1, s1: 1 };
      if (n.kind !== 'steam') s.blendMode = 'add';
      box.addChild(s);
      pool.push(s);
    }
    if (tex && !isLoaded(tex)) onLoaded(tex.source || tex, () => { for (const s of pool) if (!s.destroyed) s.texture = tex; });
    const anchor = emitterAnchor(street, n);
    const rnd = seededRandom(`${seed}|${n.id}`);
    const first = n.period ? rnd() * n.period[0] : 0;
    emitters.push({ n, box, lc, pool, anchor, rnd, tex, next: first, until: n.period ? -1 : Infinity, t: 0, owed: 0, cursor: 0, live: 0 });
  }
  const rumble = street?.rumble ? createRumbleClock(street.rumble, seed, { reduced }) : null;
  let shown = true;

  const spawn = (em) => {
    const { n, pool, anchor, rnd } = em;
    for (let k = 0; k < pool.length; k += 1) {
      const s = pool[(em.cursor + k) % pool.length];
      if (s.fx.live) continue;
      em.cursor = (em.cursor + k + 1) % pool.length;
      const f = s.fx;
      const ang = ((rnd() * 2 - 1) * n.spread * Math.PI) / 180;
      f.live = true;
      f.age = 0;
      f.x = anchor.x + (rnd() - 0.5) * n.size * 0.3;
      f.y = anchor.y;
      f.spin = (rnd() - 0.5) * 2;
      if (n.kind === 'lava') {
        const v = Math.sqrt(2 * LAVA_G * n.height * (0.55 + rnd() * 0.45));
        f.vx = Math.sin(ang) * v;
        f.vy = -Math.cos(ang) * v;
        f.life = (2 * v) / LAVA_G + 0.3;
        f.s0 = (0.7 + rnd() * 0.5) * n.size;
        f.s1 = f.s0 * 0.6;
      } else if (n.kind === 'embers') {
        f.life = 1.6 + rnd() * 1;
        f.vx = Math.sin(ang) * 30;
        f.vy = -(n.height / f.life) * (0.7 + rnd() * 0.5);
        f.s0 = (0.6 + rnd() * 0.6) * n.size;
        f.s1 = f.s0 * 0.4;
      } else {
        f.life = 1.8 + rnd() * 0.6;
        const v = (n.height / f.life) * (0.8 + rnd() * 0.4);
        f.vx = Math.sin(ang) * v * 0.5;
        f.vy = -v;
        f.s0 = (0.35 + rnd() * 0.25) * n.size;
        f.s1 = (1.2 + rnd() * 0.4) * n.size;
      }
      s.visible = true;
      s.rotation = rnd() * Math.PI * 2;
      em.live += 1;
      return true;
    }
    return false;
  };

  const step = (em, dt, boost) => {
    const { n, pool } = em;
    em.t += dt;
    // The burst clock.
    let on = true;
    if (n.period) {
      if (em.until < 0 && em.t >= em.next) em.until = em.t + n.burst;
      on = em.until >= 0 && em.t < em.until;
      if (em.until >= 0 && em.t >= em.until) {
        em.until = -1;
        em.next = em.t + (n.period[0] - n.burst) + em.rnd() * (n.period[1] - n.period[0]);
      }
    }
    if (on || boost > 1) {
      em.owed += dt * n.rate * (on ? boost : boost - 1);
      while (em.owed >= 1) {
        em.owed -= 1;
        if (!spawn(em)) {
          em.owed = 0;
          break;
        }
      }
    } else em.owed = 0;
    for (let i = 0; i < pool.length; i += 1) {
      const s = pool[i];
      const f = s.fx;
      if (!f.live) continue;
      f.age += dt;
      const p = f.age / f.life;
      if (p >= 1) {
        f.live = false;
        s.visible = false;
        em.live -= 1;
        continue;
      }
      if (n.kind === 'lava') {
        f.vy += LAVA_G * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.y > em.anchor.y + 4 && f.vy > 0) f.y = em.anchor.y + 4;
        s.alpha = p < 0.85 ? 1 : (1 - p) / 0.15;
        s.rotation += f.spin * dt * 3;
      } else if (n.kind === 'embers') {
        f.x += (f.vx + Math.sin((em.t + i) * 3) * 18) * dt;
        f.y += f.vy * dt;
        s.alpha = (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8) * (0.7 + 0.3 * Math.sin((em.t + i) * 20));
      } else {
        f.vy *= 1 - 0.55 * dt;
        f.x += (f.vx + Math.sin((em.t * 0.8 + i) * 1.3) * 10) * dt;
        f.y += f.vy * dt;
        s.alpha = (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85) * 0.75;
        s.rotation += f.spin * dt * 0.4;
      }
      const size = f.s0 + (f.s1 - f.s0) * p;
      const tw = s.texture?.width || 64;
      const th = s.texture?.height || 64;
      const k = size / Math.max(tw, th);
      s.scale.set(k, k);
      s.x = f.x;
      s.y = f.y;
    }
  };

  const onScreen = (em, cam) => {
    if (!cam) return true;
    const m = em.n.height + em.n.size * 2;
    const x = em.anchor.x + (em.lc.x || 0);
    const y = em.anchor.y + (em.lc.y || 0);
    return x + m > cam.x && x - m < cam.x + cam.w && y + em.n.size > cam.y && y - m < cam.y + cam.h;
  };

  return {
    rumble,
    emitters,
    /** Move everything on by dtMs; returns the rumble's frame ({ dx, dy, k, started }) or null. */
    update(dtMs, cam = null) {
      const dt = Math.max(0, Math.min(0.1, (Number(dtMs) || 0) / 1000));
      const r = rumble ? rumble.step(dt) : null;
      const boost = r?.active ? 1 + r.k : 1;
      for (let i = 0; i < emitters.length; i += 1) {
        const em = emitters[i];
        const on = shown && onScreen(em, cam);
        em.box.on = on;
        if (on) step(em, dt, boost);
      }
      return r;
    },
    /** Run the effects for `seconds` at 30 steps a second (a still for the render page). */
    simulate(seconds) {
      const steps = Math.round(Math.max(0, seconds) * 30);
      for (let i = 0; i < steps; i += 1) for (const em of emitters) step(em, 1 / 30, 1);
    },
    /** How many particle sprites' art is still loading (the render page waits for it). */
    pending() {
      return emitters.filter((em) => em.tex && !isLoaded(em.tex) && !isFailed(em.tex)).length;
    },
    setVisible(on) {
      shown = Boolean(on);
      for (const em of emitters) em.box.on = shown;
    },
    stats() {
      return { emitters: emitters.length, live: emitters.reduce((n, em) => n + em.live, 0), pooled: emitters.reduce((n, em) => n + em.pool.length, 0), running: emitters.filter((em) => em.box.on).length, rumble: Boolean(rumble), reduced };
    },
    destroy() {
      for (const em of emitters) if (!em.box.destroyed) em.box.destroy({ children: true });
      emitters.length = 0;
    },
  };
}
