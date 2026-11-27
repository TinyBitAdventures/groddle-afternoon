/**
 * DAY/NIGHT SKIES (#749, ours): an outdoor street's own sky follows Ur's clock.
 *
 * Glitch never changed a street's sky with the time: every location drew its one top/bottom
 * gradient (DrawUtil.drawVerticalGradientBG) at any hour, and the 2012 client had no world tint.
 * The remake tints the whole street by Dametime (js/game-day.js daylightState, NIGHT TINT). Ours,
 * on top of that: the street's own gradient shifts by the hour, to sunset tones at dawn and dusk
 * and dark blue at night with stars, and the far parallax layers take a tint by depth (the
 * furthest the most), so a forest street whose sky is mostly hidden still reads as night. Daytime
 * is the street's own sky, untouched. Each look is derived from the street's own two colours, so
 * Baqala's yellow plains and Groddle's pale cyan keep their character at every hour.
 *
 * Only outdoor streets of the world's regions (skyFollowsClock): never a place with its own light,
 * an indoor street (the ecology catalog's `interior` rows: apartments, basements, machine rooms),
 * a scene or home (no region hub), the cave, underworld, quest, party and Vortex hubs
 * (NO_SKY_HUBS), or a street whose own sky is already dark (caves, deep water and the streets
 * Tiny Speck painted at night, DARK_SKY_LUMA). NIGHT TINT off turns it off with the tint.
 *
 * Pure: colours and numbers only. street-render.js setSkyLook draws a look; game.js asks for one
 * at most once a game minute (applySkyClock).
 */

/** Hubs that are not open sky, whatever their streets' gradients say (hub ids, inc_data_maps_prod.js). */
export const NO_SKY_HUBS = Object.freeze({
  40: 'Naraka (the underworld)',
  50: 'Ilmenskie Caverns',
  51: 'Uralia (underground)',
  61: 'Simple Level Quests (quest rooms)',
  66: 'The Seams',
  67: 'Multiplayer Quests (quest rooms)',
  77: 'Jethimadh Tower: Base (indoors)',
  78: 'Ilmenskie Deeps',
  108: 'Party Locations',
  132: 'Skill Quests (quest rooms)',
  142: 'Moshi Moshi Oshilatis (inside a Giant)',
  143: 'Vortex of Random',
});

/** A sky whose two colours average under this luma (0..255) is already dark: it keeps its own colours. */
export const DARK_SKY_LUMA = 80;

const hexInt = (v) => {
  const s = String(v ?? '').replace(/^(#|0x)/i, '');
  return /^[0-9a-f]{6}$/i.test(s) ? parseInt(s, 16) : null;
};

/** PURE: the luma (0..255) of a 0xrrggbb colour. */
export function skyLuma(c) {
  return 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
}

/** PURE: a and b mixed, k of the way to b (0..1), as 0xrrggbb. */
export function mixColour(a, b, k) {
  let out = 0;
  for (const s of [16, 8, 0]) {
    const ca = (a >> s) & 255;
    const cb = (b >> s) & 255;
    out |= Math.round(ca + (cb - ca) * k) << s;
  }
  return out;
}

/**
 * PURE: why a street keeps its own sky at every hour, or null when its sky follows the clock.
 * `interior`: the street's ecology row says it is indoors (street-ecology.js interiorReason).
 */
export function ownSkyReason(street, { interior = false } = {}) {
  if (!street) return 'no street';
  if (street.ownLight) return 'its own light';
  if (interior) return 'indoors';
  const hub = String(street.hubId ?? '');
  if (!/^\d+$/.test(hub)) return 'not a street of a region';
  if (Object.prototype.hasOwnProperty.call(NO_SKY_HUBS, hub)) return NO_SKY_HUBS[hub];
  const top = hexInt(street.gradient?.top);
  const bottom = hexInt(street.gradient?.bottom);
  if (top === null || bottom === null) return 'no sky gradient';
  if ((skyLuma(top) + skyLuma(bottom)) / 2 < DARK_SKY_LUMA) return 'a dark sky of its own';
  return null;
}

/** PURE: whether the street's sky follows the clock (ownSkyReason is null) with the tint `on`. */
export function skyFollowsClock(street, { interior = false, on = true } = {}) {
  return Boolean(on) && ownSkyReason(street, { interior }) === null;
}

/**
 * The hours each look is whole at, in game hours (0..24): night till 4:45, dawn 6 to 7, day 8:15
 * to 17:15, dusk 19 to 20, night again from 21:15; between two keys the looks blend. The world
 * tint's own keys (game-day.js LIGHT_KEYFRAMES) peak at 6:30 and 19:30, inside these.
 */
export const SKY_KEYS = Object.freeze([
  [0, 'night'], [4.75, 'night'], [6, 'dawn'], [7, 'dawn'], [8.25, 'day'],
  [17.25, 'day'], [19, 'dusk'], [20, 'dusk'], [21.25, 'night'], [24, 'night'],
]);

/** PURE: how much of each look the hour holds, { day, dawn, dusk, night } summing to 1. */
export function skyPhaseWeights(hour) {
  const h = ((Number(hour) % 24) + 24) % 24 || 0;
  const w = { day: 0, dawn: 0, dusk: 0, night: 0 };
  for (let i = 1; i < SKY_KEYS.length; i++) {
    const [h1, p1] = SKY_KEYS[i];
    if (h > h1) continue;
    const [h0, p0] = SKY_KEYS[i - 1];
    const k = h1 > h0 ? (h - h0) / (h1 - h0) : 1;
    w[p0] += 1 - k;
    w[p1] += k;
    return w;
  }
  w.night = 1;
  return w;
}

/**
 * Each look from the street's own top T and bottom B (the dawn, dusk and night ones as Austin
 * picked them from the decision mockups, 2026-11-27): the gradient's three stops (top, the middle
 * one at `at`, bottom), the far layers' tint at full depth (`art`), the stars' strength and how
 * much of the world tint stays (`worldTint`: the shifted sky does half the dawn and dusk work).
 */
function lookOf(phase, T, B) {
  const M = mixColour(T, B, 0.5);
  switch (phase) {
    case 'dawn':
      return { stops: [mixColour(T, 0xa99ad0, 0.5), mixColour(M, 0xf7b0a0, 0.6), mixColour(B, 0xffd49a, 0.6)], at: 0.4, art: 0xf2dcd6, stars: 0.12, worldTint: 0.5 };
    case 'dusk':
      return { stops: [mixColour(T, 0x7a4a9a, 0.6), mixColour(M, 0xf2665a, 0.65), mixColour(B, 0xffb347, 0.7)], at: 0.35, art: 0xe9b9a8, stars: 0.2, worldTint: 0.5 };
    case 'night':
      return { stops: [mixColour(T, 0x070c2c, 0.88), mixColour(M, 0x18224e, 0.8), mixColour(B, 0x2c3a6c, 0.72)], at: 0.55, art: 0x7d88b8, stars: 1, worldTint: 1 };
    default:
      // The street's own straight gradient: its middle stop halfway draws the same line.
      return { stops: [T, M, B], at: 0.5, art: 0xffffff, stars: 0, worldTint: 1 };
  }
}

/** PURE: colours weighted together channel by channel ([[colour, weight], ...], weights summing to 1). */
function blendColours(pairs) {
  let out = 0;
  for (const s of [16, 8, 0]) {
    let v = 0;
    for (const [c, k] of pairs) v += ((c >> s) & 255) * k;
    out |= Math.min(255, Math.max(0, Math.round(v))) << s;
  }
  return out;
}

/**
 * PURE: the sky for a street with sky colours `top`/`bottom` (hex strings) at game hour `hour`,
 * taken at the whole game minute so it changes at most once a game minute:
 * { day, key, stops: [top, middle, bottom], at, art, stars, worldTint }. `day` is true when the
 * hour is wholly day (draw the street's own sky); `key` changes only when the look does.
 * Null when either colour is not a hex colour.
 */
export function skyLook(top, bottom, hour) {
  const T = hexInt(top);
  const B = hexInt(bottom);
  if (T === null || B === null) return null;
  const minute = Math.floor((Number(hour) || 0) * 60) / 60;
  const w = skyPhaseWeights(minute);
  const looks = Object.entries(w).filter(([, k]) => k > 0).map(([p, k]) => [lookOf(p, T, B), k]);
  const sum = (f) => looks.reduce((n, [l, k]) => n + f(l) * k, 0);
  const stops = [0, 1, 2].map((i) => blendColours(looks.map(([l, k]) => [l.stops[i], k])));
  const look = {
    day: w.day >= 1,
    stops,
    at: Math.round(sum((l) => l.at) * 1000) / 1000,
    art: blendColours(looks.map(([l, k]) => [l.art, k])),
    stars: Math.round(sum((l) => l.stars) * 1000) / 1000,
    worldTint: Math.round(sum((l) => l.worldTint) * 1000) / 1000,
  };
  look.key = look.day ? 'day' : `${stops.join(',')}|${look.at}|${look.art}|${look.stars}`;
  return look;
}

/**
 * PURE: the tint for a far layer at `depth` (0 the nearest layer behind the middleground, 1 the
 * furthest): the look's `art` colour, from 55% of it on the nearest to all of it on the furthest.
 */
export function farLayerTint(art, depth) {
  const d = Math.min(1, Math.max(0, Number(depth) || 0));
  return mixColour(0xffffff, art, 0.55 + 0.45 * d);
}

/** PURE: the colour of a three-stop gradient (stops at 0, `at` and 1) at t (0..1, clamped). */
export function gradientColourAt(stops, at, t) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  const a = Math.min(0.999, Math.max(0.001, Number(at) || 0.5));
  return x <= a ? mixColour(stops[0], stops[1], x / a) : mixColour(stops[1], stops[2], (x - a) / (1 - a));
}

/** PURE: a small seeded random (Park-Miller), so a street's stars sit in the same places every night. */
export function starRandom(seed = 7) {
  let s = Math.max(1, Math.floor(Math.abs(Number(seed) || 7)) % 2147483647);
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** One star per this many square px of the star field. */
export const STAR_AREA_PX = 9000;

/** PURE: the stars for a w x h field: [{ x, y, r, alpha }], the same for the same seed. */
export function starField(w, h, seed = 7) {
  const rnd = starRandom(seed);
  const out = [];
  const n = Math.round((Math.max(0, w) * Math.max(0, h)) / STAR_AREA_PX);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const big = rnd();
    const r = big < 0.08 ? 1.6 : big < 0.4 ? 1.1 : 0.7;
    out.push({ x, y, r, alpha: 0.35 + rnd() * 0.6 });
  }
  return out;
}
