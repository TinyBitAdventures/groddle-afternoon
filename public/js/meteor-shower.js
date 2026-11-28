/**
 * METEOR SHOWERS AND SHOOTING STARS (ours, Austin 2026-11-27; inventions register meteor-shower).
 *
 * Glitch had neither: no code, art or snaps of a meteor or a shooting star in the client, GSJS or
 * the archived snaps. A rare show for the night sky we built for #749 (js/sky-clock.js), in two
 * looks that read differently at a glance (Austin 2026-11-27: "I don't really see much differences"):
 *
 * - A meteor shower (3 to 4 real minutes): many quick streaks, one every 2.5 to 5 s with now and then
 *   a burst of two or three close together, all radiating from one radiant point near the top of the
 *   sky (picked from the seed, as the Perseids radiate from Perseus); each 1.5 to 2 s with a short
 *   trail, mostly faint with a few bright ones. 50 to 90 streaks in all: plenty of chances to snap one.
 * - A lone shooting star: one big, rare moment. Slower (4 s), a long trail across a good part of the
 *   sky, a brighter, bigger head that flickers with a little four-point sparkle, and a faint glowing
 *   train left along its path that lingers about 2.5 s after the head has gone.
 *
 * Not in any rotation: an administrator starts one from the console (the site's AdminSky, the
 * realtime server's meteor.go), now or in two minutes with a hint in the activity feed first.
 *
 * Everyone sees the same streaks at the same moment: the server sends one event, { id, kind, seed,
 * start, dur }, to every game online and to each that connects while it runs, and every streak
 * (when, where, which way, how long, how bright) is drawn from the seed here (meteorSchedule), so
 * two pages on the server's clock draw the same sky. A late joiner simply finds the streaks still
 * to come.
 *
 * Seen only where the sky is the clock's (#749 applySkyClock: outdoor streets, the home street and
 * back yard), as strongly as its stars are out (meteorStrength: whole at night, faint at dusk and
 * dawn, none by day); indoors, own-sky streets and NIGHT TINT off show none. prefers-reduced-motion
 * slows the streaks and dims them (METEOR.reducedSlow, reducedDim), never hides them.
 *
 * Drawn in code like the stars (drawMeteorStreaks): a tapered trail from pale blue to white, a
 * soft glowing head, added to the sky's light; the lone star adds its sparkle and its train. Pure apart from drawMeteorStreaks, which draws into a Pixi Graphics it is given.
 */

import { starRandom } from './sky-clock.js?v=dbd21266';

export const METEOR = Object.freeze({
  /** A shower's length (the server picks it in this range: meteor.go meteorShowerMin, meteorShowerMax). */
  showerMinMs: 180000,
  showerMaxMs: 240000,
  /** A shower: from one streak (or burst) to the next. */
  gapMinMs: 2500,
  gapMaxMs: 5000,
  /** The chance a streak brings one or two more close behind it (a burst), and how close. */
  burstChance: 0.18,
  burstGapMinMs: 250,
  burstGapMaxMs: 700,
  /** The first streak this long after the shower starts. */
  firstMs: 1000,
  /** A shower streak, start to fade. */
  streakMinMs: 1500,
  streakMaxMs: 2000,
  /** A lone shooting star: its head this long after the event's start, crossing for starMs; its train lingers trainMs after. */
  starAtMs: 600,
  starMs: 4000,
  trainMs: 2500,
  /** The lone star's event length (meteor.go meteorStarDur); its train may glow past it (meteorPhase). */
  starDurMs: 6000,
  /** A lone star's head brightness, and its size against a shower streak's. */
  starBright: 1.3,
  starSize: 1.7,
  /** An event stays drawn this long past its length: a slowed last streak, the star's train. */
  tailMs: 6000,
  /** How far ahead the console's "in 2 minutes" starts a shower (the hint goes out at once). */
  hintLeadMs: 120000,
  /** prefers-reduced-motion: each streak this much slower, and dimmed to this share. */
  reducedSlow: 1.6,
  reducedDim: 0.6,
  /** Below this strength (the sky's stars) nothing is drawn, and a Snap does not count it. */
  minStrength: 0.05,
  /** A streak counts as on screen for a Snap from this brightness (after the sky's strength). */
  snapAlpha: 0.15,
  /** The star preview (?meteordemo=star): this long between one lone star and the next. */
  demoStarGapMs: 20000,
});

export const METEOR_KINDS = Object.freeze(['shower', 'star']);

/** Our words (plain, no dashes). */
export const METEOR_TEXT = Object.freeze({
  hint: 'The sky feels restless tonight. Look up in a couple of minutes.',
  tag: 'Shooting star',
});

const ID_RE = /^mt-[0-9a-f]{16}$/;
const SEED_MAX = 2147483646;

/**
 * PURE: the server's meteor frame as an event, or null when it is not a good one.
 * { t:'meteor', id:'mt-<16 hex>', kind:'shower'|'star', seed:1..2^31-2, start:ms, dur:ms, hint? }.
 * A shower runs METEOR.showerMinMs..showerMaxMs, a lone star METEOR.starDurMs.
 */
export function meteorEventOf(frame) {
  if (!frame || typeof frame !== 'object') return null;
  const { id, kind, seed, start, dur } = frame;
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (!METEOR_KINDS.includes(kind)) return null;
  if (!Number.isInteger(seed) || seed < 1 || seed > SEED_MAX) return null;
  if (!Number.isFinite(start) || start <= 0) return null;
  if (!Number.isInteger(dur)) return null;
  if (kind === 'shower' && (dur < METEOR.showerMinMs || dur > METEOR.showerMaxMs)) return null;
  if (kind === 'star' && dur !== METEOR.starDurMs) return null;
  return { id, kind, seed, start, dur, hint: frame.hint === true };
}

const round4 = (v) => Math.round(v * 10000) / 10000;
const between = (rnd, lo, hi) => lo + rnd() * (hi - lo);

/**
 * A shower streak from the radiant (rx, ry, shares of the view): it heads out from it at an angle
 * below level (12 to 168 degrees: away from the radiant, downward), starting `from` units out.
 * Mostly faint: brightness 0.35 to 1 weighted toward the faint end (rnd ** 2.5).
 */
function showerStreak(rnd, at, rx, ry) {
  const angle = between(rnd, 12, 168) * (Math.PI / 180);
  return {
    kind: 'shower',
    at,
    dur: Math.round(between(rnd, METEOR.streakMinMs, METEOR.streakMaxMs)),
    x: round4(rx),
    y: round4(ry),
    from: round4(between(rnd, 0.04, 0.22)),
    dx: round4(Math.cos(angle)),
    dy: round4(Math.sin(angle)),
    travel: round4(between(rnd, 0.1, 0.2)),
    tail: round4(between(rnd, 0.04, 0.08)),
    bright: round4(0.35 + 0.65 * Math.pow(rnd(), 2.5)),
    size: 1,
    train: 0,
  };
}

/** The lone star: high across the top of the sky toward the middle, a long way, a long trail. */
function loneStar(rnd) {
  const x = between(rnd, 0.08, 0.92);
  const y = between(rnd, 0.03, 0.12);
  const left = x > 0.5 ? rnd() < 0.9 : rnd() < 0.1;
  const slope = between(rnd, 8, 22) * (Math.PI / 180);
  return {
    kind: 'star',
    at: METEOR.starAtMs,
    dur: METEOR.starMs,
    x: round4(x),
    y: round4(y),
    from: 0,
    dx: round4((left ? -1 : 1) * Math.cos(slope)),
    dy: round4(Math.sin(slope)),
    travel: round4(between(rnd, 0.55, 0.7)),
    tail: round4(between(rnd, 0.28, 0.38)),
    bright: METEOR.starBright,
    size: METEOR.starSize,
    train: METEOR.trainMs,
  };
}

/**
 * PURE: an event's radiant (a shower's): { x, y } shares of the view, near the top of the sky
 * (x 0.2 to 0.8, y -0.12 to 0.08), from the seed. Null for a lone star.
 */
export function meteorRadiant(ev) {
  if (ev?.kind !== 'shower') return null;
  const rnd = starRandom(ev.seed);
  return { x: round4(between(rnd, 0.2, 0.8)), y: round4(between(rnd, -0.12, 0.08)) };
}

/**
 * PURE: every streak of an event, from its seed: [{ kind, at (ms after start), dur, x, y (shares
 * of the view: a shower's radiant, a star's start), from (units out from the radiant), dx, dy
 * (direction), travel, tail (view units, meteorUnit), bright, size, train (ms the star's train
 * lingers) }]. The same event gives the same streaks on every page. A shower: the first at
 * METEOR.firstMs, then one every gapMinMs to gapMaxMs, a burst of one or two more now and then,
 * each ending inside the shower; a lone star: one, at starAtMs.
 */
export function meteorSchedule(ev) {
  if (!ev || !METEOR_KINDS.includes(ev.kind)) return [];
  if (ev.kind === 'star') return [loneStar(starRandom(ev.seed))];
  const radiant = meteorRadiant(ev);
  const rnd = starRandom(ev.seed);
  rnd();
  rnd(); // the radiant's two draws
  const out = [];
  const fits = (t) => t + METEOR.streakMaxMs <= ev.dur;
  for (let t = METEOR.firstMs; fits(t); t += Math.round(between(rnd, METEOR.gapMinMs, METEOR.gapMaxMs))) {
    out.push(showerStreak(rnd, t, radiant.x, radiant.y));
    if (rnd() < METEOR.burstChance) {
      const more = rnd() < 0.5 ? 1 : 2;
      let bt = t;
      for (let i = 0; i < more; i++) {
        bt += Math.round(between(rnd, METEOR.burstGapMinMs, METEOR.burstGapMaxMs));
        if (fits(bt)) out.push(showerStreak(rnd, bt, radiant.x, radiant.y));
      }
    }
  }
  return out;
}

/** PURE: 'none' (no event), 'soon' (before its start: the hint's time), 'on', or 'over'. */
export function meteorPhase(ev, now) {
  if (!ev) return 'none';
  if (now < ev.start) return 'soon';
  return now < ev.start + ev.dur + METEOR.tailMs ? 'on' : 'over';
}

/**
 * PURE: the streaks in the sky at `now` (the server's clock): [{ streak, p }] with p 0..1 through
 * each head's flight, and past 1 while a lone star's train still glows. `reduced`
 * (prefers-reduced-motion): each takes METEOR.reducedSlow as long, the train too.
 */
export function meteorStreaksAt(ev, now, { reduced = false, schedule = null } = {}) {
  if (!ev) return [];
  const t = now - ev.start;
  if (t < 0) return [];
  const slow = reduced ? METEOR.reducedSlow : 1;
  const out = [];
  for (const streak of schedule || meteorSchedule(ev)) {
    const dur = streak.dur * slow;
    const p = (t - streak.at) / dur;
    if (p >= 0 && p < 1 + (streak.train || 0) / streak.dur) out.push({ streak, p });
  }
  return out;
}

/**
 * PURE: how strongly the sky shows a streak: the clock's sky look's stars (js/sky-clock.js skyLook:
 * 1 at night, about 0.2 at dusk and 0.12 at dawn, 0 by day) where the sky follows the clock (`on`:
 * #749 applySkyClock with NIGHT TINT on), else 0.
 */
export function meteorStrength(look, { on = true } = {}) {
  if (!on || !look || look.day) return 0;
  const s = Number(look.stars) || 0;
  return s < METEOR.minStrength ? 0 : Math.min(1, s);
}

/** PURE: the length a view's streaks are measured in (px): its width, but no wider than 1.8 of its height, and at least 320. */
export function meteorUnit(w, h) {
  return Math.max(320, Math.min(Number(w) || 0, (Number(h) || 0) * 1.8));
}

/**
 * PURE: a streak at p in a w x h view: its head (hx, hy) and the trail's end (tx, ty) in px, the
 * head's radius, its brightness (before the sky's strength; 0 once p passes 1), and for a lone star
 * where it began (sx, sy), its train's brightness (glowing faintly behind it, then fading over its
 * linger) and its sparkle (0..1, a flicker; steady under reduced motion). The head eases in and
 * slows a little; the trail grows over the first third and shortens as it fades; it fades in over
 * the first 12% and out over the last 30% (a lone star's last 20%).
 */
export function streakShape(streak, p, w, h, { reduced = false } = {}) {
  const k = Math.min(1, Math.max(0, p));
  const unit = meteorUnit(w, h);
  const ease = 1 - Math.pow(1 - k, 1.4);
  const sx = streak.x * w + streak.dx * (streak.from || 0) * unit;
  const sy = streak.y * h + streak.dy * (streak.from || 0) * unit;
  const go = streak.travel * unit * ease;
  const hx = sx + streak.dx * go;
  const hy = sy + streak.dy * go;
  const grow = Math.min(1, k / 0.35) * (k > 0.8 ? 1 - ((k - 0.8) / 0.2) * 0.5 : 1);
  const len = Math.min(go, streak.tail * unit * grow);
  const out = streak.kind === 'star' ? 0.2 : 0.3;
  const fade = p >= 1 ? 0 : Math.min(1, k / 0.12) * (k > 1 - out ? (1 - k) / out : 1);
  const dim = reduced ? METEOR.reducedDim : 1;
  const alpha = Math.max(0, streak.bright * fade * dim);
  const size = streak.size || 1;
  const shape = { hx, hy, tx: hx - streak.dx * len, ty: hy - streak.dy * len, r: (0.9 + Math.min(1, streak.bright) * 1.0) * size, alpha, sx, sy, train: 0, sparkle: 0 };
  if (streak.train) {
    // The train: building faintly behind the head, then fading after it over its linger.
    const linger = streak.train / streak.dur;
    const after = p > 1 ? Math.max(0, 1 - (p - 1) / linger) : Math.min(1, k / 0.5);
    shape.train = 0.22 * after * dim;
    const t = p * streak.dur;
    shape.sparkle = reduced ? 0.6 : 0.55 + 0.45 * Math.abs(Math.sin(t / 70) * Math.sin(t / 190 + 1.3));
  }
  return shape;
}

/**
 * PURE: whether a streak shows on screen now, bright enough for a Snap to count it (the snap's
 * "Shooting star" tag): an event on, the sky strong enough, a streak past METEOR.snapAlpha whose
 * head is inside the w x h view.
 */
export function meteorOnScreen(ev, now, { strength = 0, reduced = false, w = 1280, h = 800 } = {}) {
  if (!ev || strength < METEOR.minStrength) return false;
  for (const { streak, p } of meteorStreaksAt(ev, now, { reduced })) {
    const s = streakShape(streak, p, w, h, { reduced });
    if (Math.min(1, s.alpha) * strength >= METEOR.snapAlpha && s.hx >= 0 && s.hx <= w && s.hy >= 0 && s.hy <= h) return true;
  }
  return false;
}

/**
 * PURE: the solo preview's event (QA: ?meteordemo=shower|star): a shower of METEOR.showerMinMs,
 * or a lone star, starting `leadMs` from now on the page's own clock. `n` moves the seed (the star
 * preview runs one lone star, then METEOR.demoStarGapMs of nothing, then the next).
 */
export function demoMeteorEvent(kind, now, { leadMs = 800, n = 0 } = {}) {
  if (!METEOR_KINDS.includes(kind)) return null;
  return { id: 'mt-' + (0xdeed0000 + n).toString(16).padStart(16, '0'), kind, seed: 20261127 + n * 7919, start: now + leadMs, dur: kind === 'star' ? METEOR.starDurMs : METEOR.showerMinMs, hint: false, demo: true };
}

/** The trail's colours: pale blue at its end to white at the head. */
const TAIL_COLOUR = 0xa9c4ff;
const HEAD_COLOUR = 0xffffff;
const GLOW_COLOUR = 0xd6e4ff;
const TRAIL_STEPS = 12;
/** The head's glow: [radius in head radii, alpha] from the outside in; added together they fall off smoothly. */
const GLOW_RINGS = Object.freeze([[6, 0.04], [4.5, 0.05], [3.2, 0.08], [2.2, 0.14], [1.5, 0.22]]);

function mix(a, b, k) {
  let out = 0;
  for (const s of [16, 8, 0]) out |= Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k) << s;
  return out;
}

/**
 * Draws `list` (meteorStreaksAt) into Pixi Graphics `g`, a w x h view at the sky's depth, at
 * `strength` (meteorStrength). Cleared first; nothing drawn (and false) when nothing shows.
 */
export function drawMeteorStreaks(g, list, w, h, { strength = 1, reduced = false } = {}) {
  if (!g) return false;
  g.clear();
  // Light adds to the night sky under it, as a streak's glow does.
  if (g.blendMode !== 'add') g.blendMode = 'add';
  if (strength < METEOR.minStrength || !list?.length) return false;
  let drew = false;
  for (const { streak, p } of list) {
    const s = streakShape(streak, p, w, h, { reduced });
    const a = Math.min(1, s.alpha) * strength;
    const ta = s.train * strength;
    // A lone star's train: a faint wide glow along the path it took, fainter toward where it began.
    if (ta >= 0.005) {
      drew = true;
      band(g, s.hx, s.hy, s.sx, s.sy, (k) => s.r * 1.4 * (1 - k * 0.5), () => GLOW_COLOUR, (k) => ta * (1 - k * 0.7));
    }
    if (a < 0.01) continue;
    drew = true;
    // The trail: a tapered band from the head back, narrower, bluer and fainter toward its end.
    band(g, s.hx, s.hy, s.tx, s.ty, (k) => Math.max(0.3, s.r * (1 - k * 0.85)), (k) => mix(HEAD_COLOUR, TAIL_COLOUR, k), (k) => a * Math.pow(1 - k, 1.1));
    // The head: a soft glow (rings fading outward, so it has no edge) and a bright core; a lone
    // star's flickers, with a little four-point sparkle.
    const flick = s.sparkle ? 0.8 + 0.2 * s.sparkle : 1;
    for (const [k, ga] of GLOW_RINGS) g.circle(s.hx, s.hy, s.r * k).fill({ color: GLOW_COLOUR, alpha: a * ga * flick });
    if (s.sparkle) {
      const arm = s.r * (3.5 + 3.5 * s.sparkle);
      const thin = Math.max(0.5, s.r * 0.22);
      band(g, s.hx - arm, s.hy, s.hx + arm, s.hy, (k) => thin * (1 - Math.abs(k - 0.5) * 1.8), () => HEAD_COLOUR, (k) => a * 0.7 * s.sparkle * (1 - Math.abs(k - 0.5) * 1.6), 2);
      band(g, s.hx, s.hy - arm, s.hx, s.hy + arm, (k) => thin * (1 - Math.abs(k - 0.5) * 1.8), () => HEAD_COLOUR, (k) => a * 0.7 * s.sparkle * (1 - Math.abs(k - 0.5) * 1.6), 2);
    }
    g.circle(s.hx, s.hy, s.r).fill({ color: HEAD_COLOUR, alpha: Math.min(1, a * 1.1 * flick) });
  }
  return drew;
}

/**
 * A band from (ax, ay) to (bx, by) in `steps` quads (no overlaps, so the added light has no beads):
 * half-width, colour and alpha each a function of k, 0 at a to 1 at b.
 */
function band(g, ax, ay, bx, by, half, colour, alpha, steps = TRAIL_STEPS) {
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 0.5) return;
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  for (let i = 0; i < steps; i++) {
    const k0 = i / steps;
    const k1 = (i + 1) / steps;
    const x0 = ax + (bx - ax) * k0;
    const y0 = ay + (by - ay) * k0;
    const x1 = ax + (bx - ax) * k1;
    const y1 = ay + (by - ay) * k1;
    const w0 = Math.max(0, half(k0));
    const w1 = Math.max(0, half(k1));
    g.poly([x0 + nx * w0, y0 + ny * w0, x1 + nx * w1, y1 + ny * w1, x1 - nx * w1, y1 - ny * w1, x0 - nx * w0, y0 - ny * w0])
      .fill({ color: colour(k0), alpha: Math.max(0, alpha(k0)) });
  }
}
