/**
 * METEOR SHOWERS AND SHOOTING STARS (ours, Austin 2026-11-27; inventions register meteor-shower).
 *
 * Glitch had neither: no code, art or snaps of a meteor or a shooting star in the client, GSJS or
 * the archived snaps. A rare show for the night sky we built for #749 (js/sky-clock.js): a shower
 * of 3 to 4 real minutes, a streak every 6 to 12 s, each about 2.5 s, slow enough to see and snap,
 * crossing the top of the sky at varied angles, lengths and brightness; or one lone shooting star, a
 * little brighter. Not in any rotation: an administrator starts one from the console (the site's
 * AdminSky, the realtime server's meteor.go), now or in two minutes with a hint in the activity
 * feed first.
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
 * soft glowing head, added to the sky's light. Pure apart from drawMeteorStreaks, which draws into a Pixi Graphics it is given.
 */

import { starRandom } from './sky-clock.js?v=dbd21266';

export const METEOR = Object.freeze({
  /** A shower's length (the server picks it in this range: meteor.go meteorShowerMin, meteorShowerMax). */
  showerMinMs: 180000,
  showerMaxMs: 240000,
  /** From one streak's start to the next. */
  gapMinMs: 6000,
  gapMaxMs: 12000,
  /** The first streak this long after the shower starts. */
  firstMs: 1500,
  /** One streak, start to fade. */
  streakMs: 2500,
  /** A lone shooting star: its streak this long after the event's start; the event's own length. */
  starAtMs: 600,
  starDurMs: 6000,
  /** A lone star is this much brighter than a shower's brightest. */
  starBright: 1.15,
  /** How far ahead the console's "in 2 minutes" starts a shower (the hint goes out at once). */
  hintLeadMs: 120000,
  /** prefers-reduced-motion: each streak this much slower, and dimmed to this share. */
  reducedSlow: 1.6,
  reducedDim: 0.6,
  /** Below this strength (the sky's stars) nothing is drawn, and a Snap does not count it. */
  minStrength: 0.05,
  /** A streak counts as on screen for a Snap from this brightness (after the sky's strength). */
  snapAlpha: 0.15,
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

/** One streak's look from the seeded random: always seven draws, so the schedule never shifts. */
function streakOf(rnd, at, bright = 1) {
  const x = 0.1 + rnd() * 0.8; // where the head starts, a share of the view's width
  // and of its height: the top band of the view, where a street's sky shows over its far art (as
  // the stars do; a streak that dips behind a mountain or a tree is hidden by it, as a real one)
  const y = 0.02 + rnd() * 0.14;
  // Mostly toward the middle of the view, so it stays in sight.
  const left = rnd() < (x > 0.5 ? 0.75 : 0.25);
  const slope = (6 + rnd() * 18) * (Math.PI / 180); // 6 to 24 degrees below level
  const travel = 0.2 + rnd() * 0.14; // how far the head goes, in view units (meteorUnit)
  const tail = 0.07 + rnd() * 0.07; // the trail at its longest
  const b = Math.min(1.15, (0.62 + rnd() * 0.38) * bright);
  return {
    at,
    dur: METEOR.streakMs,
    x: round4(x),
    y: round4(y),
    dx: round4((left ? -1 : 1) * Math.cos(slope)),
    dy: round4(Math.sin(slope)),
    travel: round4(travel),
    tail: round4(tail),
    bright: round4(b),
  };
}

const round4 = (v) => Math.round(v * 10000) / 10000;

/**
 * PURE: every streak of an event, from its seed: [{ at (ms after start), dur, x, y (start, shares
 * of the view), dx, dy (direction), travel, tail (view units), bright }]. The same event gives the
 * same streaks on every page. A shower: the first at METEOR.firstMs, then one every gapMinMs to
 * gapMaxMs, each ending inside the shower; a lone star: one streak at starAtMs.
 */
export function meteorSchedule(ev) {
  if (!ev || !METEOR_KINDS.includes(ev.kind)) return [];
  const rnd = starRandom(ev.seed);
  if (ev.kind === 'star') return [streakOf(rnd, METEOR.starAtMs, METEOR.starBright)];
  const out = [];
  for (let t = METEOR.firstMs; t + METEOR.streakMs <= ev.dur; t += METEOR.gapMinMs + Math.floor(rnd() * (METEOR.gapMaxMs - METEOR.gapMinMs + 1))) {
    out.push(streakOf(rnd, t));
  }
  return out;
}

/** PURE: 'none' (no event), 'soon' (before its start: the hint's time), 'on', or 'over'. */
export function meteorPhase(ev, now) {
  if (!ev) return 'none';
  if (now < ev.start) return 'soon';
  return now < ev.start + ev.dur + METEOR.streakMs * METEOR.reducedSlow ? 'on' : 'over';
}

/**
 * PURE: the streaks in the sky at `now` (the server's clock): [{ streak, p }] with p 0..1 through
 * each. `reduced` (prefers-reduced-motion): each takes METEOR.reducedSlow as long.
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
    if (p >= 0 && p < 1) out.push({ streak, p });
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
 * PURE: a streak at p in a w x h view: its head (hx, hy) and the trail's end (tx, ty) in px, its
 * head's radius and its brightness (0..1.15, before the sky's strength). The head eases in and
 * slows a little; the trail grows over the first third and shortens as it fades; it fades in over
 * the first 12% and out over the last 30%.
 */
export function streakShape(streak, p, w, h, { reduced = false } = {}) {
  const k = Math.min(1, Math.max(0, p));
  const unit = meteorUnit(w, h);
  const ease = 1 - Math.pow(1 - k, 1.4);
  const go = streak.travel * unit * ease;
  const hx = streak.x * w + streak.dx * go;
  const hy = streak.y * h + streak.dy * go;
  const grow = Math.min(1, k / 0.35) * (k > 0.8 ? 1 - ((k - 0.8) / 0.2) * 0.5 : 1);
  const len = Math.min(go, streak.tail * unit * grow);
  const fade = Math.min(1, k / 0.12) * (k > 0.7 ? (1 - k) / 0.3 : 1);
  const alpha = Math.max(0, streak.bright * fade * (reduced ? METEOR.reducedDim : 1));
  return { hx, hy, tx: hx - streak.dx * len, ty: hy - streak.dy * len, r: 1.3 + streak.bright * 1.1, alpha };
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
 * preview runs one after another).
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
    if (a < 0.01) continue;
    drew = true;
    // The trail: a tapered band from the head back, in short quads (no overlaps, so the added light
    // has no beads), narrower, bluer and fainter toward its end.
    const len = Math.hypot(s.hx - s.tx, s.hy - s.ty) || 1;
    const nx = -(s.hy - s.ty) / len;
    const ny = (s.hx - s.tx) / len;
    const half = (k) => Math.max(0.3, s.r * (1 - k * 0.85));
    for (let i = 0; i < TRAIL_STEPS; i++) {
      const k0 = i / TRAIL_STEPS;
      const k1 = (i + 1) / TRAIL_STEPS;
      const ax = s.hx + (s.tx - s.hx) * k0;
      const ay = s.hy + (s.ty - s.hy) * k0;
      const bx = s.hx + (s.tx - s.hx) * k1;
      const by = s.hy + (s.ty - s.hy) * k1;
      const w0 = half(k0);
      const w1 = half(k1);
      g.poly([ax + nx * w0, ay + ny * w0, bx + nx * w1, by + ny * w1, bx - nx * w1, by - ny * w1, ax - nx * w0, ay - ny * w0])
        .fill({ color: mix(HEAD_COLOUR, TAIL_COLOUR, k0), alpha: a * Math.pow(1 - k0, 1.1) });
    }
    // The head: a soft glow (rings fading outward, so it has no edge) and a bright core.
    for (const [k, ga] of GLOW_RINGS) g.circle(s.hx, s.hy, s.r * k).fill({ color: GLOW_COLOUR, alpha: a * ga });
    g.circle(s.hx, s.hy, s.r).fill({ color: HEAD_COLOUR, alpha: Math.min(1, a * 1.1) });
  }
  return drew;
}
