/** Source-authored Ticket to Paradise economy and reusable flight-course state. */

import { EXTRA_PARADISE_COURSES, paradiseReward } from './paradise-courses.js?v=eb5c7fd9';
import { qrazyRewardForLevel, quoinPay, quoinTouches } from './quoins.js?v=5abad2c7';
import { getGameDayKey } from './game-day.js?v=57fecfcb';
import { RADIAL_ARRIVAL_EVENTS, applyGeometryEffects, createRadialSession, radialFire } from './radial-heights.js?v=90fcc768';
import { avatarHeadReach, barriersScreen, blockBarrierCrossing, headCeiling, isStandable, platformYAt, platformsScreen } from './street-model.js?v=a9a05f9d';

export const PARADISE_DURATION_MS = 4 * 60 * 1000;
export const PARADISE_DAILY_LIMIT = 11;

/**
 * G1160 (Austin 2026-11-23; G893): Cloud Rings' rings are tall upright cloud hoops, one picture each
 * (gz_ai_cr_ring, made for Groddle from the players' full-street snaps of the course, provenance in
 * tools/provenance/made-decos.json), at the snaps' size (about 170 x 330 units: drawn 165 x 330 by
 * its height). Every ring is lavender until you fly through it and gold after, as the snaps show
 * (snap 266979, the "Completed" full-street snap). The opening is a recessed oval on the hoop's left
 * (27% across, 54% down, about 44 x 165 units in the picture); flying into it passes the ring, with a
 * little slack round it so a pilot who threads the hole is never refused.
 */
export const CLOUD_RING_ART = Object.freeze({
  sprite: 'gz_ai_cr_ring',
  width: 165,
  height: 330,
  tint: 0xc9b9f6,
  passedTint: 0xffc634,
  opening: Object.freeze({ x: -38, y: 13, rx: 30, ry: 92 }),
});

/**
 * G1160 (Austin 2026-11-23): Cloud Rings' scenery as the players' full-street snaps show it
 * (research/eleven-snaps/Upgrade Cards, reference only), from Tiny Speck's CC0 decos: a sunset sky
 * (PARADISE_SKIES), the sun's glow low on the horizon at the start, dark purple mountains along the
 * horizon, a row of tan-gold cloud behind lavender cloud sea, and mauve wisps in the orange sky.
 * Each entry is [deco, x, y (its bottom), width, tint, alpha, z, flipX].
 */
export const CLOUD_RINGS_SCENERY = Object.freeze({
  sun: Object.freeze({ deco: 'sun_01a_newxp', x: 380, y: 640, width: 1150, tint: 0xffd25a, alpha: 0.95 }),
  decos: Object.freeze([
    // Mauve wisps across the orange part of the sky.
    ...[[520, 300, 640], [1320, 250, 760], [2100, 320, 600], [2820, 270, 720], [3420, 330, 560]].map(([x, y, w], i) =>
      Object.freeze(['cloud_fluffy_2', x, y, w, 0x7a3c62, 0.32, -80, i % 2 === 1])),
    // Far mountains, a lighter purple, then the dark near range.
    ...[[300, 1500], [1500, 1700], [2700, 1600], [3700, 1500]].map(([x, w], i) =>
      Object.freeze(['groddle_mountains_cutout', x, 790, w, 0x9a6ab8, 1, -70, i % 2 === 0])),
    ...[[700, 820], [1900, 900], [3050, 840]].map(([x, w], i) =>
      Object.freeze(['groddle_mountain_cut1', x, 830, w, 0x5c2a84, 1, -66, i % 2 === 1])),
    // Tan-gold cloud behind, lavender cloud sea in front, running on under the course.
    ...Array.from({ length: 7 }, (_, i) => Object.freeze(['clouds_bg_middleplus_01a_newxp', 120 + i * 580, 880, 900, 0xc19a5e, 1, -60, i % 2 === 1])),
    ...Array.from({ length: 9 }, (_, i) => Object.freeze(['clouds_bg_middleplus_01a_newxp', i * 450 + (i % 2) * 60, 965 - (i % 3) * 18, 860, 0xc2b4f0, 1, -40, i % 2 === 0])),
    ...Array.from({ length: 9 }, (_, i) => Object.freeze(['clouds_bg_middleplus_01a_newxp', 200 + i * 450, 1080 - (i % 2) * 20, 900, 0xb6a8ea, 1, -38, i % 2 === 1])),
  ]),
});

/** PURE: where a ring drawn centred at (x, y) passes the pilot: its opening's centre and half sizes. */
export function cloudRingOpening(x, y, art = CLOUD_RING_ART) {
  return { x: x + art.opening.x, y: y + art.opening.y, rx: art.opening.rx, ry: art.opening.ry };
}

/** PURE: whether a point (the pilot's middle) is in a ring's opening. */
export function cloudRingPasses(opening, px, py) {
  const dx = px - opening.x;
  const dy = py - opening.y;
  return (dx * dx) / (opening.rx * opening.rx) + (dy * dy) / (opening.ry * opening.ry) <= 1;
}

/**
 * G1160 (Austin 2026-11-23, reversing G978's one shared sky for these): each Ticket to Paradise
 * course paints its own sky. A course whose location file survives names its gradient, and that
 * wins (Starlit Night, GHFCVOD2GN631RJ.xml gradient top 050012, bottom 160042; Radial Heights keeps
 * GHFQOLEIHN63P27's 222E, PARADISE_SKY_GRADIENT in game.js). The rest were sampled from the Eleven
 * Giants players' full-street snaps of each course (research/eleven-snaps/Upgrade Cards, 1 px a unit,
 * the whole height in one picture) and the players' Snaps (research/wayback/raw/snaps/paradise_*),
 * reference only. Stops are [where down the course, 0 top to 1 bottom; colour]. A course with no
 * snap at all (Aerial Boost, Updraft, Drafty Uplift) keeps Radial Heights' gradient.
 * stars: the course's own night stars where its snaps show them ({ count, alpha, color, bottom }:
 * bottom is how far down they reach); none where they show none.
 */
export const PARADISE_SKIES = Object.freeze({
  // A sunset: deep violet over the top with stars, through mauve and burnt orange to a gold horizon.
  cloud_rings: Object.freeze({
    stops: Object.freeze([[0, 0x28006e], [0.2, 0x4a1a5a], [0.42, 0x7e3d41], [0.55, 0x944d36], [0.68, 0xb77634], [0.8, 0xd59f37], [0.92, 0xf8b01c], [1, 0xfcbb20]]),
    stars: Object.freeze({ count: 70, alpha: 0.8, color: 0xffffff, bottom: 0.36 }),
  }),
  // Day: a clear blue sky paling to haze over a sea of white cloud.
  mountain_scaling: Object.freeze({
    stops: Object.freeze([[0, 0x5cb0cb], [0.2, 0x7dbdc9], [0.42, 0xa9cdcd], [0.62, 0xcfdedd], [1, 0xe6eded]]),
    stars: null,
  }),
  // Inside the cloud: lavender under the cloud ceiling fading to peach over the cloud floor.
  bippity_bop: Object.freeze({
    stops: Object.freeze([[0, 0xcfc4f2], [0.16, 0xb79ad3], [0.32, 0xa98bba], [0.52, 0xbc9fb9], [0.7, 0xcfa8a7], [0.84, 0xdcb09e], [1, 0xf3e6da]]),
    stars: null,
  }),
  // Bright blue sky over the canopy (the nest is up there), the forest dark below it.
  arbor_hollow: Object.freeze({
    stops: Object.freeze([[0, 0x7ed1ed], [0.1, 0x4fb3dc], [0.2, 0x2f86a8], [0.3, 0x1d2a18], [0.6, 0x18200f], [1, 0x12180a]]),
    stars: null,
  }),
  // A clear blue sky, white low down where the firs stand in the cloud, faint stars up high.
  cloud_flight: Object.freeze({
    stops: Object.freeze([[0, 0x0199cc], [0.3, 0x4eb3d7], [0.5, 0x8cc9dd], [0.7, 0xc9e0e2], [0.86, 0xf4f8f6], [1, 0xfdfdfb]]),
    stars: Object.freeze({ count: 40, alpha: 0.7, color: 0xffffff, bottom: 0.3 }),
  }),
  // Blue up top, through teal and sage to the cream-gold landing sky (#eee0b6).
  sky_plunge: Object.freeze({
    stops: Object.freeze([[0, 0x4aabca], [0.2, 0x67b4c6], [0.4, 0x8dbfc0], [0.6, 0xb3cabb], [0.8, 0xd6d6ac], [0.9, 0xece0b9], [1, 0xefe0b6]]),
    stars: null,
  }),
  // GHFCVOD2GN631RJ.xml: gradient top 050012, bottom 160042 (its own stars_2 fields are the stars).
  starlit_night: Object.freeze({
    stops: Object.freeze([[0, 0x050012], [1, 0x160042]]),
    stars: null,
  }),
  // A deep blue-teal night with soft stars over the snow hills (the hills run to the bottom).
  slip_n_slide: Object.freeze({
    stops: Object.freeze([[0, 0x0c2c3d], [0.15, 0x153545], [0.35, 0x1e3d4d], [0.55, 0x2a4958], [0.75, 0x33525f], [1, 0x3a5864]]),
    stars: Object.freeze({ count: 110, alpha: 0.55, color: 0xf3edc8, bottom: 0.62 }),
  }),
});

/** PURE: a course's sky stops: its own, else its sampled palette (evenly), else top and bottom. */
export function paradiseSkyStops(course, fallback = { top: 0x00222e, bottom: 0x00222e }) {
  const own = PARADISE_SKIES[course?.id]?.stops;
  if (own) return own;
  const palette = course?.palette;
  if (Array.isArray(palette) && palette.length > 1) return palette.map((color, index) => [index / (palette.length - 1), color]);
  return [[0, fallback.top], [1, fallback.bottom]];
}

/** PURE: the sky's colour at t (0 top, 1 bottom), mixed between the stops either side. */
export function paradiseSkyColorAt(stops, t) {
  const at = Math.max(0, Math.min(1, Number(t) || 0));
  const right = stops.findIndex(([where]) => where >= at);
  if (right < 0) return stops[stops.length - 1][1];
  if (right === 0) return stops[0][1];
  const [a, from] = stops[right - 1];
  const [b, to] = stops[right];
  const local = b > a ? (at - a) / (b - a) : 0;
  const mix = (shift) => Math.round(((from >> shift) & 0xff) + (((to >> shift) & 0xff) - ((from >> shift) & 0xff)) * local);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/**
 * The defining Radial Heights landmark, recovered from the source street
 * GHFQOLEIHN63P27. Coordinates and display size are the original screen-space
 * values; the texture is clean CC0 game art, not a frame from the recording.
 */
export const RADIAL_HEIGHTS_MOON = Object.freeze({
  asset: 'moon_asset_smile.svg',
  x: 885,
  y: 1094,
  width: 322,
  height: 322,
});

export const STARLIT_NIGHT_MOON = Object.freeze({
  plain: Object.freeze({
    asset: 'moon_asset_plain.svg',
    x: 1309,
    y: 257,
    width: 149,
    height: 149,
  }),
  smile: Object.freeze({
    asset: 'moon_asset_smile.svg',
    x: 1308,
    y: 258,
    width: 150,
    height: 150,
  }),
});

/**
 * G892 (stand-ins audit A6): the star pickups are Tiny Speck's own star decos, star_asset_01 for the
 * big stars and star_asset_02 for the small ones (Radial Heights' 'yellow stars' layer places 14 and
 * 39 of them, GHFQOLEIHN63P27), not vector stars. A pickup's radius is 0.42 of its deco's side
 * (game.js loadParadiseSourcePoints), so the deco is drawn PARADISE_STAR_SIDE x its radius across,
 * the source's own size (57 and 27); the source's rotation (r, degrees) comes with it. Slip 'N Slide
 * has no source street; its stars use the same decos. Collisions keep the radius.
 */
export const PARADISE_STAR_SIDE = 2.38;
/** PURE: { asset, side, rotation } for one star pickup. */
export function paradiseStarArt(point = {}) {
  const radius = Number(point.radius) || 13;
  return {
    asset: point.major ? 'star_asset_01' : 'star_asset_02',
    side: Math.round(radius * PARADISE_STAR_SIDE * 10) / 10,
    rotation: ((Number(point.r) || 0) * Math.PI) / 180,
  };
}

/**
 * G892 (stand-ins audit A7): each recovered course's way out as its source street has it, in place of
 * the drawn arch, dimmed until the goal is met (report 131; G978: the planks over it are gone).
 * - Radial Heights: the street's signpost (signpost_1339609697365 at -499, -371, so 501, 1629 here;
 *   the exit stands at 500, 1645) drawn as a street signpost (street-render oneArmSignpost), and over
 *   it the deco sign groddle_sign_blank_1340666150608 whose sign_txt the client printed
 *   (DecoRenderer.as 287-322, default_deco_sign_lg): "Exit's down here!", 425 x 248 at 502, 1416 in
 *   its layer, centred half its height up. The template (LHFR8BRSVT33AE0) that filled the signpost's
 *   connects was not archived, so the arm says where it takes you: home to Ur.
 * - Starlit Night: door_1340398529213 (instance_exit), its deco door_asset_apartment_hall_right
 *   50 x 138 (GHFCVOD2GN631RJ.xml), standing on the exit. The source door is at 728, -156 (1478,
 *   744 here) on its own cloud; the exit's touch stays at 1380, 700.
 */
export const PARADISE_EXIT_ART = Object.freeze({
  radial_heights: Object.freeze({
    kind: 'signpost',
    arm: 'Back to Ur',
    sign: Object.freeze({ text: "Exit's down here!", x: 502, y: 1416, w: 425, h: 248 }),
  }),
  starlit_night: Object.freeze({
    kind: 'door',
    sprite: 'door_asset_apartment_hall_right',
    w: 50,
    h: 138,
  }),
});

/**
 * G892 (stand-ins audit A8): Starlit Night's cloud floor is the six cloud_blueShade3 decos its
 * middleground places (GHFCVOD2GN631RJ, x + 750 and y + 900 here; w, h, r in degrees, flip), not
 * drawn ellipses. Its middleplus layer's 16 cloud_vpuff2 in front are not in any CC0 set
 * (tinyspeck/glitch-locations has no such deco), so they are left out.
 */
export const STARLIT_NIGHT_CLOUDS = Object.freeze([
  Object.freeze({ x: 310, y: 897, w: 803, h: 103, r: 0, z: 5 }),
  Object.freeze({ x: 1569, y: 587, w: 434, h: 77, r: -49, z: 2 }),
  Object.freeze({ x: 1516, y: 743, w: 256, h: 61, r: 0, z: 3 }),
  Object.freeze({ x: 1305, y: 892, w: 803, h: 103, r: 0, z: 1 }),
  Object.freeze({ x: -49, y: 751, w: 475, h: 55, r: 0, z: 4, flip: true }),
  Object.freeze({ x: 769, y: 899, w: 803, h: 103, r: -1, z: 0 }),
]);
export const STARLIT_NIGHT_CLOUD_SPRITE = 'cloud_blueShade3';

export const STARLIT_NIGHT_MOON_FADE_MS = 1500;
export const STARLIT_NIGHT_STAR_FADE_MS = 1000;

/**
 * The two source-authored `stars_2` layers from GHFCVOD2GN631RJ. These are
 * already screen-space coordinates in the recovered T_ layers.
 */
export const STARLIT_NIGHT_STAR_FIELDS = Object.freeze([
  Object.freeze({ x: 409, y: 260, width: 838, height: 234, depth: 'sky' }),
  Object.freeze({ x: 1095, y: 396, width: 838, height: 234, depth: 'sky' }),
  Object.freeze({ x: 424, y: 680, width: 838, height: 234, depth: 'sky' }),
  Object.freeze({ x: 1072, y: 864, width: 838, height: 234, depth: 'sky' }),
  Object.freeze({ x: 404, y: 473, width: 969, height: 271, depth: 'bg' }),
  Object.freeze({ x: 1018, y: 709, width: 969, height: 271, depth: 'bg' }),
  Object.freeze({ x: 78, y: 863, width: 969, height: 271, depth: 'bg' }),
  Object.freeze({ x: 1244, y: 241, width: 838, height: 234, depth: 'bg' }),
]);

export function starlitRevealAlpha(startedAt, now, duration = STARLIT_NIGHT_STAR_FADE_MS) {
  const start = Number(startedAt);
  if (!Number.isFinite(start) || start <= 0) return 0;
  const elapsed = Math.max(0, Number(now) - start);
  return Math.max(0, Math.min(1, elapsed / Math.max(1, Number(duration) || 1)));
}

export function starlitMoonPlainAlpha(startedAt, now) {
  const start = Number(startedAt);
  if (!Number.isFinite(start) || start <= 0) return 1;
  return 1 - starlitRevealAlpha(start, now, STARLIT_NIGHT_MOON_FADE_MS);
}

/**
 * Clean, source-video-derived Slip 'N Slide terrain. The recording establishes
 * the repeating snowy hills, but these authored points keep compression and
 * capture scaling out of the game itself.
 */
export const SLIP_N_SLIDE_TERRAIN = Object.freeze([
  Object.freeze({ x: 0, y: 716 }),
  Object.freeze({ x: 260, y: 654 }),
  Object.freeze({ x: 560, y: 754 }),
  Object.freeze({ x: 870, y: 584 }),
  Object.freeze({ x: 1190, y: 754 }),
  Object.freeze({ x: 1500, y: 622 }),
  Object.freeze({ x: 1810, y: 760 }),
  Object.freeze({ x: 2140, y: 604 }),
  Object.freeze({ x: 2470, y: 758 }),
  Object.freeze({ x: 2790, y: 610 }),
  Object.freeze({ x: 3090, y: 760 }),
  Object.freeze({ x: 3400, y: 660 }),
  Object.freeze({ x: 3600, y: 690 }),
]);

/**
 * Clean recovered K03 landmarks visible throughout the supplied course video.
 * Positions are authored for the reconstructed hill profile; dimensions come
 * from the original transparent CC0 PNGs, never the recording.
 */
export const SLIP_N_SLIDE_LANDMARKS = Object.freeze([
  Object.freeze({ id: 'welcome-snowman', sprite: 'k03_snowman_01', x: 325, width: 118, z: -7 }),
  Object.freeze({ id: 'first-cabin', sprite: 'k03_logcabin_01', x: 790, width: 142, z: -7 }),
  Object.freeze({ id: 'first-ice-spire', sprite: 'k03_icehill_01', x: 1040, width: 275, z: -42, groundOffset: 66, alpha: 0.88 }),
  Object.freeze({ id: 'first-pine-copse', sprite: 'k03_treegroup_01', x: 1420, width: 168, z: -22, groundOffset: 8 }),
  Object.freeze({ id: 'second-cabin', sprite: 'k03_logcabin_01', x: 1930, width: 136, z: -7 }),
  Object.freeze({ id: 'second-ice-spire', sprite: 'k03_icehill_02', x: 2240, width: 250, z: -42, groundOffset: 62, alpha: 0.84 }),
  Object.freeze({ id: 'second-pine-copse', sprite: 'k03_treegroup_01', x: 2660, width: 178, z: -22, groundOffset: 8 }),
  Object.freeze({ id: 'way-home-castle', sprite: 'k03_snowcastle_01', x: 3260, width: 345, z: -7, groundOffset: 18 }),
]);

/**
 * G1160 (Austin 2026-11-23): Slip 'N Slide's crescent moon, Tiny Speck's moon deco (CC0) tinted the
 * pale gold of the players' full-street snaps (research/eleven-snaps/Upgrade Cards, reference only:
 * about 2530, 130 and 155 wide on the 3600 x 600 street, some 240 over the hilltops, as it is here). The frozen wave curling over the ice castle
 * in those snaps has no CC0 picture (wave1-3 are Groddle's water ripples), so the castle stands alone.
 */
export const SLIP_N_SLIDE_MOON = Object.freeze({ id: 'moon', sprite: 'moon', x: 2540, y: 360, width: 165, z: -78, tint: 0xfff0b4 });

export const SLIP_N_SLIDE_TREE_SPRITES = Object.freeze([
  'k03_tree01_snow_01',
  'k03_tree01_snow_02',
  'k03_tree02_snow_01',
  'k03_tree02_snow_02',
]);

function smoothStep(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

export function slipTerrainY(x, points = SLIP_N_SLIDE_TERRAIN) {
  const safe = Array.isArray(points) && points.length >= 2 ? points : SLIP_N_SLIDE_TERRAIN;
  const px = Math.max(safe[0].x, Math.min(safe[safe.length - 1].x, Number(x) || 0));
  let right = 1;
  while (right < safe.length - 1 && px > safe[right].x) right += 1;
  const a = safe[right - 1];
  const b = safe[right];
  const span = Math.max(1, b.x - a.x);
  return a.y + (b.y - a.y) * smoothStep((px - a.x) / span);
}

export function slipTerrainSlope(x, sample = 4) {
  const distance = Math.max(1, Number(sample) || 4);
  return (slipTerrainY(Number(x) + distance) - slipTerrainY(Number(x) - distance)) /
    (distance * 2);
}

// Each pickup keeps the amount recorded at x100 and the benefit it pays (paradise-courses.js recordedBenefit, #560).
const reward = paradiseReward;

export const PARADISE_COURSES = Object.freeze({
  cloud_rings: Object.freeze({
    id: 'cloud_rings',
    name: 'Cloud Rings',
    ticketId: 'paradise_ticket_cloud_rings',
    templateTsid: 'LHFVPPKQSR53T1L',
    width: 3600,
    height: 960,
    spawn: Object.freeze({ x: 180, y: 690 }),
    exit: Object.freeze({ x: 3420, y: 690 }),
    pickupCount: 18,
    ringCount: 5,
    objective: 'Fly through all 5 cloud rings, then find the exit',
    completion: 'Every cloud ring is singing. The way home is open!',
    ringRewards: Object.freeze([720, 120, 954, 720, 1200]),
    rewards: Object.freeze([
      reward('xp', 120),
      reward('currants', 100),
      reward('energy', 100),
      reward('xp', 120),
      reward('mood', 100),
      reward('favor', 100, 'cosma'),
    ]),
    completionReward: reward('xp', 500),
  }),
  radial_heights: Object.freeze({
    id: 'radial_heights',
    name: 'Radial Heights',
    ticketId: 'paradise_ticket_radial_heights',
    templateTsid: 'LHFR8BRSVT33AE0',
    sourceStreetTsid: 'GHFQOLEIHN63P27',
    width: 2000,
    height: 2000,
    // #599: on the start cloud plat_1339609697362 (835..1193 at y 1083 here), under "Spacebar to fly!".
    spawn: Object.freeze({ x: 1000, y: 1083 }),
    exit: Object.freeze({ x: 500, y: 1645 }),
    pickupCount: 53,
    ringCount: 0,
    objective: 'Follow the spiral and find all 53 stars',
    // source: the street's completion sign (GHFQOLEIHN63P27.xml groddle_sign_blank sign_txt)
    completion: "Good work, you've got all the stars!",
    // G1119: a star pays nothing itself (show_star_NN lights it and plays its note); the course pays
    // through the 14 quoins its hide_cover chain sets down and the Qurazies at the end
    // (js/radial-heights.js, eventQuoinReward).
    rewards: Object.freeze([]),
    eventQuoins: true,
    completionReward: reward('xp', 600),
  }),
  starlit_night: Object.freeze({
    id: 'starlit_night',
    name: 'Starlit Night',
    ticketId: 'paradise_ticket_starlit_night',
    templateTsid: 'LHFD3EU3SH2307J',
    sourceStreetTsid: 'GHFCVOD2GN631RJ',
    width: 1500,
    height: 900,
    spawn: Object.freeze({ x: 110, y: 700 }),
    exit: Object.freeze({ x: 1380, y: 700 }),
    pickupCount: 22,
    ringCount: 0,
    objective: 'Collect 22 quoins to light up the night sky',
    completion: 'Congratulations! You helped light up the night sky!',
    rewards: Object.freeze([
      reward('energy', 100),
      reward('xp', 120),
      reward('favor', 100, 'friendly'),
      reward('xp', 600),
      reward('currants', 100),
      reward('mood', 100),
    ]),
    completionReward: reward('xp', 300),
  }),
  slip_n_slide: Object.freeze({
    id: 'slip_n_slide',
    name: "Slip 'N Slide",
    ticketId: 'paradise_ticket_slip_n_slide',
    templateTsid: 'LHFQVU11DR53IKB',
    movement: 'slide',
    width: 3600,
    height: 900,
    spawn: Object.freeze({ x: 260, y: 654 }),
    exit: Object.freeze({ x: 3480, y: 682 }),
    pickupCount: 18,
    ringCount: 0,
    objective: 'Jump and slide through all 18 snowy stars',
    completion: 'You played the whole hill like a tune. The way home is open!',
    rewards: Object.freeze([
      reward('currants', 100),
      reward('xp', 120),
      reward('mood', 100),
      reward('xp', 120),
      reward('favor', 100, 'friendly'),
      reward('currants', 100),
      reward('xp', 360),
      reward('energy', 100),
      reward('currants', 100),
      reward('xp', 120),
      reward('energy', 100),
      reward('currants', 100),
      reward('xp', 360),
      reward('xp', 120),
      reward('energy', 100),
      reward('currants', 100),
      reward('xp', 360),
      reward('xp', 3000),
    ]),
    completionReward: reward('xp', 1098),
  }),
  // The nine reconstructed courses (Aerial Boost, Mountain Scaling, ...).
  ...EXTRA_PARADISE_COURSES,
});

export const PARADISE_TICKET_IDS = Object.freeze(
  Object.values(PARADISE_COURSES).map((course) => course.ticketId)
);

/**
 * Paradise tickets whose place is a feature scene, not a flight course here (Beam Me Down:
 * features/puzzle-scenes-feature.js). In Glitch paradise_ticket_beam_me_down.js is a
 * paradise_ticket like the rest: the same calc_img_cost price and the same 11-a-day count
 * (verbs.activate 154, modal_callback 330-331), so it is quoted and spent here too.
 */
export const PARADISE_SCENE_TICKETS = Object.freeze({
  beam_me_down: Object.freeze({ id: 'beam_me_down', name: 'Beam Me Down', ticketId: 'paradise_ticket_beam_me_down' }),
});

/** Where a ticket goes: a flight course or a scene ticket, by id. */
export function paradiseTicketPlace(id) {
  return PARADISE_COURSES[id] || PARADISE_SCENE_TICKETS[id] || null;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanCount(value, max = 999999) {
  return Math.max(0, Math.min(max, Math.floor(finite(value, 0))));
}

function cleanIndexes(value, max) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((entry) => Math.floor(finite(entry, -1)))
    .filter((entry) => entry >= 0 && entry < max))]
    .sort((a, b) => a - b);
}

/**
 * The day the 11-a-day ticket limit counts in. Glitch's paradise_ticket.js 154 reads
 * stats_get_daily_counter, whose counters reset when current_day_key() changes
 * (players/inc_achievements.js 14-19, common.js 22): the game day, four real hours.
 * The "game-" prefix keeps an older save's calendar key ("2026-11-12") from ever
 * matching, so its count cannot hold the new day's tickets back.
 */
export function paradiseDayKey(now = Date.now()) {
  const time = Number(now);
  return `game-${getGameDayKey(Number.isFinite(time) ? time : 0)}`;
}

export function normalizeParadiseState(seed = {}, now = Date.now()) {
  const today = paradiseDayKey(now);
  const sameDay = String(seed?.dayKey || '') === today;
  const visits = {};
  const completions = {};
  for (const courseId of Object.keys(PARADISE_COURSES)) {
    visits[courseId] = cleanCount(seed?.visits?.[courseId]);
    completions[courseId] = cleanCount(seed?.completions?.[courseId]);
  }
  return {
    dayKey: today,
    ticketsToday: sameDay ? cleanCount(seed?.ticketsToday, PARADISE_DAILY_LIMIT) : 0,
    visits,
    completions,
  };
}

export function createParadiseState(seed = {}, now = Date.now()) {
  return normalizeParadiseState(seed, now);
}

export function resetParadiseDay(state, now = Date.now()) {
  Object.assign(state, normalizeParadiseState(state, now));
  return state;
}

/** Courses whose pickups are drawn as vector stars (game.js spawnParadisePickup), not quoin-sheet coins. */
export const PARADISE_STAR_COURSES = Object.freeze(['radial_heights', 'slip_n_slide']);
/** game.js spawnParadisePickup: quoins at SCALE (1.35) x 0.82, Cloud Rings x 0.9. */
export function paradiseQuoinScale(courseId) {
  return 1.35 * (courseId === 'cloud_rings' ? 0.9 : 0.82);
}

/**
 * Ticket 37 follow-up (mr granberry, 2026-11-02): a quoin at head height was taken walking on a
 * street but not in Radial Heights or the other Paradise courses, which kept their own 34-47 px
 * circle 30 px over the feet. Glitch had one rule: items/quoin.js onPlayerCollision 156-159 runs
 * for streets, games, races, Rainbow Run and isParadiseLocation() alike (only the daily limit
 * differs), against the 59 x 112 player box (players/player.js 62-64). So a Paradise pickup is
 * taken by the same box as a street quoin (js/quoins.js quoinTouches): the drawn coin, or the drawn
 * star (its radius each way) on the star courses.
 * @param {{ id: string }} course
 * @param {{ x: number, y: number, radius?: number }} pick the pickup's centre as drawn
 * @param {{ x: number, y: number }} feet the avatar's feet
 */
export function paradisePickupTouches(course, pick, feet, { scale = 1, typeId = '', drawnScale = 0 } = {}) {
  if (!pick || !feet) return false;
  const q = { x: pick.x, y: pick.y, typeId };
  if (PARADISE_STAR_COURSES.includes(course?.id)) {
    const side = 2 * (Number(pick.radius) || 13) * (drawnScale > 0 ? drawnScale : 1);
    return quoinTouches(q, feet.x, feet.y, { scale, coinW: side, coinH: side });
  }
  return quoinTouches(q, feet.x, feet.y, { scale, quoinScale: drawnScale > 0 ? drawnScale : paradiseQuoinScale(course?.id) });
}

/** Exact paradise_ticket.js price curve. */
export function paradiseTicketCost(quoinMultiplier = 1) {
  const original = Math.max(1, finite(quoinMultiplier, 1));
  const capped = Math.min(original, 100);
  const base = capped <= 40 ? 20 : 20 + Math.floor((capped - 40) / 4);
  return Math.round(base * original);
}

/** paradise_ticket.js verbs.activate conditions: the dead are refused first. */
export const PARADISE_HELL_BLOCK = "You can't just magically ascend from Hell!";

/**
 * paradise_ticket.js verbs.eat (every course ticket inherits it): 20 iMG
 * (stats_add_imagination, so spendable iMG only, never level XP) and 1 energy
 * per ticket eaten, plus one quip ("Yum!" listed twice so it is more common).
 */
export const PARADISE_TICKET_EAT = Object.freeze({
  imagination: 20,
  energy: 1,
  tooltip: 'Eat this to gain 20 iMG and 1 energy',
  quips: Object.freeze([
    'Yum!',
    'Hmm, slightly stale.',
    'Tastes like chicken!',
    'The paper got stuck in your teeth.',
    'Yum!',
    'You got a papercut on your tongue. Ouch!',
    'Mmm, not bad.',
    'Mmm, tasty.',
  ]),
});

/**
 * Eating has no conditions in the source (always enabled, Hell included).
 * metabolics_add_energy gives nothing to the dead or super pooped, so the
 * caller passes `energyAllowed: false` then; the iMG still lands.
 */
export function eatParadiseTicket({ count = 1, rng = Math.random, energyAllowed = true } = {}) {
  const n = Math.max(1, Math.floor(finite(count, 1)));
  const quips = PARADISE_TICKET_EAT.quips;
  const roll = Math.min(0.999999, Math.max(0, finite(rng(), 0)));
  return {
    count: n,
    imagination: PARADISE_TICKET_EAT.imagination * n,
    energy: energyAllowed ? PARADISE_TICKET_EAT.energy * n : 0,
    quip: quips[Math.floor(roll * quips.length)],
  };
}

export function quoteParadiseTicket(
  state,
  courseId,
  { imagination = 0, quoinMultiplier = 1, now = Date.now(), dead = false } = {}
) {
  const course = paradiseTicketPlace(courseId);
  if (!course) return { ok: false, reason: 'unknown_course', cost: 0, course: null };
  resetParadiseDay(state, now);
  const cost = paradiseTicketCost(quoinMultiplier);
  if (dead) return { ok: false, reason: 'dead', cost, course };
  if (state.ticketsToday >= PARADISE_DAILY_LIMIT) {
    return { ok: false, reason: 'daily_limit', cost, course };
  }
  if (finite(imagination, 0) < cost) {
    return { ok: false, reason: 'not_enough_imagination', cost, course };
  }
  return { ok: true, reason: 'ready', cost, course };
}

export function activateParadiseTicket(state, courseId, opts = {}) {
  const quote = quoteParadiseTicket(state, courseId, opts);
  if (!quote.ok) return quote;
  state.ticketsToday += 1;
  // A scene ticket counts toward the day's limit; visits keep the flight courses only.
  if (PARADISE_COURSES[courseId]) state.visits[courseId] = (state.visits[courseId] || 0) + 1;
  return {
    ...quote,
    ticketsToday: state.ticketsToday,
    visits: state.visits[courseId] || 0,
  };
}

export function createParadiseRun(courseId, {
  now = Date.now(),
  sourceLocation = null,
} = {}) {
  const course = PARADISE_COURSES[courseId];
  if (!course) return null;
  return {
    courseId,
    status: 'running',
    startedAt: now,
    expiresAt: now + PARADISE_DURATION_MS,
    sourceLocation: sourceLocation?.tsid
      ? {
          tsid: String(sourceLocation.tsid),
          x: finite(sourceLocation.x, 0),
          y: finite(sourceLocation.y, 0),
        }
      : null,
    collected: [],
    rings: [],
    rewardTotals: {},
    completionRewarded: false,
  };
}

export function paradiseRemainingMs(run, now = Date.now()) {
  if (!run || run.status !== 'running') return 0;
  return Math.max(0, finite(run.expiresAt, 0) - now);
}

export function expireParadiseRun(run, now = Date.now()) {
  if (!run || run.status !== 'running') {
    return { ok: false, reason: run?.status || 'missing', run };
  }
  if (paradiseRemainingMs(run, now) > 0) {
    return { ok: false, reason: 'time_remaining', run };
  }
  run.status = 'expired';
  return { ok: true, reason: 'expired', run };
}

function noteReward(run, rewardDef) {
  const key = rewardDef.type === 'favor' && rewardDef.giantId
    ? `favor:${rewardDef.giantId}`
    : rewardDef.type;
  run.rewardTotals[key] = (run.rewardTotals[key] || 0) + rewardDef.amount;
}

/**
 * A course reward as paid out: `amount` is what lands before the mood bonus. A
 * quoin pays its benefit times the player's own quoin multiplier (items/quoin.js
 * 171-174, Paradise included; #560: the recorded x100 amounts were paid to everyone
 * as they were). A Qurazy quoin pays the level-indexed iMG of GSJS items/quoin.js:
 * 207-209 (config.qurazy_rewards[level - 1], no quoin multiplier); it is paid as
 * iMG and keeps `quoin: 'qurazy'` for its art.
 */
export function resolveParadiseReward(rewardDef, { level = 1, multiplier = 1 } = {}) {
  if (!rewardDef) return rewardDef;
  if (rewardDef.type === 'qurazy') {
    return Object.freeze({ type: 'xp', amount: qrazyRewardForLevel(level), giantId: null, quoin: 'qurazy' });
  }
  return Object.freeze({ ...rewardDef, amount: quoinPay(rewardDef.benefit, multiplier) });
}

export function collectParadisePickup(run, index, now = Date.now(), { level = 1, multiplier = 1 } = {}) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) return { ok: false, reason: 'missing', run };
  if (paradiseRemainingMs(run, now) <= 0) {
    expireParadiseRun(run, now);
    return { ok: false, reason: 'expired', run };
  }
  const pickupIndex = Math.floor(finite(index, -1));
  if (pickupIndex < 0 || pickupIndex >= course.pickupCount) {
    return { ok: false, reason: 'invalid_pickup', run };
  }
  if (run.collected.includes(pickupIndex)) {
    return { ok: false, reason: 'already_collected', run };
  }
  // A course whose pickups pay nothing themselves (Radial Heights' stars) counts the touch only.
  const rewardDef = course.rewards.length
    ? resolveParadiseReward(course.rewards[pickupIndex % course.rewards.length], { level, multiplier })
    : null;
  run.collected.push(pickupIndex);
  run.collected.sort((a, b) => a - b);
  if (rewardDef) noteReward(run, rewardDef);
  return { ok: true, reason: 'collected', reward: rewardDef ? { ...rewardDef } : null, run };
}

export function passParadiseRing(run, index, now = Date.now(), { multiplier = 1 } = {}) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) return { ok: false, reason: 'missing', run };
  if (paradiseRemainingMs(run, now) <= 0) {
    expireParadiseRun(run, now);
    return { ok: false, reason: 'expired', run };
  }
  const ringIndex = Math.floor(finite(index, -1));
  if (ringIndex < 0 || ringIndex >= course.ringCount) {
    return { ok: false, reason: 'invalid_ring', run };
  }
  if (run.rings.includes(ringIndex)) {
    return { ok: false, reason: 'already_passed', run };
  }
  const rewardDef = resolveParadiseReward(reward('xp', course.ringRewards[ringIndex] || 120), { multiplier });
  run.rings.push(ringIndex);
  run.rings.sort((a, b) => a - b);
  noteReward(run, rewardDef);
  return { ok: true, reason: 'passed', reward: { ...rewardDef }, run };
}

export function paradiseObjectiveComplete(run) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) return false;
  return course.ringCount > 0
    ? run.rings.length >= course.ringCount
    : run.collected.length >= course.pickupCount;
}

export function paradiseRunProgress(run) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) {
    return { collected: 0, total: 0, rings: 0, ringTotal: 0, complete: false };
  }
  return {
    collected: cleanIndexes(run.collected, course.pickupCount).length,
    total: course.pickupCount,
    rings: cleanIndexes(run.rings, course.ringCount).length,
    ringTotal: course.ringCount,
    complete: paradiseObjectiveComplete(run),
  };
}

export function paradiseObjective(run) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!course) return 'Activate a Ticket to Paradise';
  if (run.status === 'expired') return 'This Paradise has faded';
  if (run.status === 'complete') return course.completion;
  const progress = paradiseRunProgress(run);
  if (progress.complete) return 'The way home is open';
  if (course.ringCount) {
    return `${course.objective} · ${progress.rings}/${progress.ringTotal} rings`;
  }
  return `${course.objective} · ${progress.collected}/${progress.total}`;
}

/**
 * Report 131: what the shut way home says when you touch it, naming how many are left; '' when the
 * goal is met (or there is no run). The rule itself stays paradiseObjectiveComplete's.
 */
export function paradiseExitClosedLine(run) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!course) return '';
  const progress = paradiseRunProgress(run);
  if (progress.complete) return '';
  if (course.ringCount) {
    return `The way home is shut until you fly through all ${progress.ringTotal} rings: ${progress.ringTotal - progress.rings} more to go.`;
  }
  const things = PARADISE_STAR_COURSES.includes(course.id) ? 'stars' : 'quoins';
  return `The way home is shut until you collect all ${progress.total} ${things}: ${progress.total - progress.collected} more to go.`;
}

export function finishParadiseRun(run, now = Date.now(), { multiplier = 1 } = {}) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) return { ok: false, reason: 'missing', run };
  if (run.status === 'complete') return { ok: false, reason: 'complete', run };
  if (run.status === 'expired') return { ok: false, reason: 'expired', run };
  if (paradiseRemainingMs(run, now) <= 0) {
    expireParadiseRun(run, now);
    return { ok: false, reason: 'expired', run };
  }
  if (!paradiseObjectiveComplete(run)) {
    return { ok: false, reason: 'objective_incomplete', run };
  }
  run.status = 'complete';
  const completionReward = run.completionRewarded ? null : { ...resolveParadiseReward(course.completionReward, { multiplier }) };
  if (completionReward) {
    noteReward(run, completionReward);
    run.completionRewarded = true;
  }
  return { ok: true, reason: 'complete', completionReward, run };
}

/**
 * G1119 / R44 (#599): a recovered course keeps its source street's lines and walls, as the client
 * built the instance from its template (pc.instances_create, paradise_ticket.js 285), not an empty
 * sky. Screen space here is the street's own (bounds l and t taken off), the same as the stars.
 *
 * Radial Heights starts you penned on a cloud in the middle. Its source lines are soft (pc_perm 0,
 * GHFQOLEIHN63P27.xml); the location's instance_created event (LHFQOLEIHN63P27.xml, run here on the
 * shared event runtime, js/radial-heights.js) makes the pen: the start cloud plat_1339609697362 a
 * floor (-1), its roof plat_1339609697364 solid from below (1), and the side walls
 * wall_1339609697367 (1) and wall_1339609697366 (-1) solid from inside. hide_start_clouds opens it
 * again (the start clouds fade over 500 ms, every pen line back to 0, the flitterbug fades). The
 * collision box that ran it was an item the archive lost, and the flitterbug's hide_cover_01 plays
 * FLITTERBUG_COLLISION, so the pen opens when you fly up into the flitterbug
 * (flitterbug_limbo1_1339609697352, 68 x 82 at 9, -1056: 1009, 944 here), as the 2012 run
 * kxnjN86TqNY shows: on the cloud, up past the sign, and the clouds are gone.
 */
export const RADIAL_HEIGHTS_START_PEN = Object.freeze({
  floorId: 'plat_1339609697362',
  flitterbug: Object.freeze({ id: 'flitterbug_limbo1_1339609697352', sprite: 'flitterbug_limbo1' }),
  trigger: Object.freeze({ x: 1009, y: 944, w: 68, h: 82 }),
  /** The three cloud_fluffy_1 decos over the start cloud (middleground, bottom centre, x + 1000, y + 2000). */
  clouds: Object.freeze([
    Object.freeze({ id: 'cloud_fluffy_1_1339609697361', x: 1003, y: 1152, w: 324, h: 130, z: 0 }),
    Object.freeze({ id: 'cloud_fluffy_1_1339609697360', x: 1049, y: 1128, w: 324, h: 126, z: 1, flip: true }),
    Object.freeze({ id: 'cloud_fluffy_1_1339609697359', x: 966, y: 1129, w: 319, h: 124, z: 2 }),
  ]),
});

/** G1119: "You're a star" (your_a_star_01a in layer T_1339635044318), shown by verify_53. */
export const RADIAL_HEIGHTS_STAR_ART = Object.freeze({ id: 'your_a_star_01a_1340664945756', sprite: 'your_a_star_01a', x: 947, y: 1244, w: 691, h: 655 });

/**
 * G1119: Radial Heights' other deco signs, their sign_txt printed in their boxes: the start sign over
 * the pen (middleground, x + 1000, y + 2000) and the one master_check shows (T_1339635044318).
 */
export const RADIAL_HEIGHTS_SIGNS = Object.freeze([
  Object.freeze({ id: 'groddle_sign_blank_1339609697347', text: 'Spacebar to fly!', x: 1015, y: 1092, w: 425, h: 248 }),
  Object.freeze({ id: 'groddle_sign_blank_1340666150612', text: "Good work, you've\ngot all the stars!", x: 325, y: 1146, w: 425, h: 248 }),
]);

/** PURE: the course's star pickups from its source street ('yellow stars' for Radial Heights). */
export function paradiseSourcePoints(course, data) {
  if (!course?.sourceStreetTsid || !data) return [];
  const layer = (data.layers || []).find((entry) =>
    course.id === 'radial_heights' ? entry.name === 'yellow stars' : entry.name === 'middleground'
  );
  if (!layer) return [];
  const screenSpace = /^T_/.test(String(layer.id || ''));
  const l = Number(data.bounds?.l) || 0;
  const t = Number(data.bounds?.t) || 0;
  return (layer.decos || [])
    .filter((deco) => /^star_asset_0[12]$/.test(String(deco.sprite || '')))
    .map((deco) => ({
      x: screenSpace ? deco.x : deco.x - l,
      y: screenSpace ? deco.y : deco.y - t,
      radius: Math.max(10, Math.min(28, Number(deco.w || 30) * 0.42)),
      major: String(deco.sprite) === 'star_asset_01',
      r: Number(deco.r) || 0,
      id: String(deco.id || ''),
    }));
}

/**
 * PURE: the course's lines and walls from its source street, in course space, with the perms its
 * arrival events set (instance_created, player_enter on the shared event runtime): `{ platforms,
 * barriers }` in the street's own shape (x1, y1, x2, y2, pc_perm; x, y, h, pc_perm), ready for
 * platformsScreen / barriersScreen of a street whose bounds start at 0.
 */
export function paradiseSourceGeometry(course, data) {
  if (!course?.sourceStreetTsid || !data) return { platforms: [], barriers: [] };
  const l = Number(data.bounds?.l) || 0;
  const t = Number(data.bounds?.t) || 0;
  const perm = (row) => row.pc_perm;
  const platforms = (data.platforms || []).map((p) => ({
    id: p.id,
    x1: p.x1 - l,
    y1: p.y1 - t,
    x2: p.x2 - l,
    y2: p.y2 - t,
    pc_perm: perm(p),
    item_perm: p.item_perm,
  }));
  const barriers = (data.barriers || []).map((w) => ({ id: w.id, x: w.x - l, y: w.y - t, h: w.h, pc_perm: perm(w) }));
  const geometry = { platforms, barriers };
  if (data.events) applyGeometryEffects(geometry, radialFire(createRadialSession(data.events), RADIAL_ARRIVAL_EVENTS, 0));
  return geometry;
}

/** PURE: a geometry's lines as the avatar meets them (street-model platformsScreen; bounds start at 0). */
export function paradiseGeometryLines(geometry) {
  return platformsScreen({ bounds: { l: 0, t: 0 }, platforms: geometry?.platforms || [] });
}

/** PURE: the spawn's feet: on the first floor line at or under the course spawn, else the spawn. */
export function paradiseSpawnFeet(course, lines = []) {
  const x = Number(course?.spawn?.x) || 0;
  const y = Number(course?.spawn?.y) || 0;
  let best = null;
  for (const p of lines) {
    if (!isStandable(p)) continue;
    const lineY = platformYAt(p, x, 0);
    if (lineY == null || lineY < y - 1) continue;
    if (best == null || lineY < best) best = lineY;
  }
  return { x, y: best ?? y };
}

/** PURE: the lowest floor line, so the flight's bottom bound never holds the feet over it. */
export function paradiseLowestFloor(lines = []) {
  let low = -Infinity;
  for (const p of lines) if (isStandable(p)) low = Math.max(low, p.y1, p.y2);
  return low;
}

/** PURE: Radial Heights' pen opens: the avatar's body (feet to head) overlaps the flitterbug. */
export function radialStartPenOpens(feet, scale = 1) {
  if (!feet) return false;
  const box = RADIAL_HEIGHTS_START_PEN.trigger;
  const head = feet.y - avatarHeadReach(scale).reach;
  const halfW = 20 * (scale > 0 ? scale : 1);
  return (
    feet.x + halfW >= box.x - box.w / 2 &&
    feet.x - halfW <= box.x + box.w / 2 &&
    head <= box.y &&
    feet.y >= box.y - box.h
  );
}

/**
 * PURE-ish (mutates `body`): one flight frame's meeting with the course's lines and walls, after the
 * move from prevX, prevY. Walls stop the body sideways, a line solid from below stops the head, and a
 * floor line crossed going down puts the feet on it (onGround). `lines` are paradiseGeometryLines,
 * `barriers` barriersScreen rows.
 */
export function paradiseFlightCollide(body, prevX, prevY, { lines = [], barriers = [], scale = 1 } = {}) {
  if (!body) return body;
  const bodyH = 80 * (scale > 0 ? scale : 1);
  const walledX = blockBarrierCrossing(barriers, prevX, body.x, body.y, bodyH);
  if (walledX !== body.x) {
    body.x = walledX;
    body.vx = 0;
  }
  const head = avatarHeadReach(scale);
  const roof = lines.length ? headCeiling(lines, prevX, prevY, body.x, body.y, head, 2, barriers) : null;
  if (roof != null) {
    body.y = roof;
    if (body.vy < 0) body.vy = 0;
  }
  body.onGround = false;
  if (body.vy >= 0) {
    let floor = null;
    for (const p of lines) {
      if (!isStandable(p)) continue;
      const y = platformYAt(p, body.x, 0);
      if (y == null) continue;
      const before = platformYAt(p, prevX, 4) ?? y;
      // Crossed it going down this frame, or standing on it.
      if (prevY <= before + 1 && body.y >= y - 0.5 && (floor == null || y < floor)) floor = y;
    }
    if (floor != null) {
      body.y = floor;
      body.vy = 0;
      body.onGround = true;
    }
  }
  return body;
}

/** PURE: a street-shaped view of a geometry for barriersScreen (bounds start at 0). */
export function paradiseGeometryBarriers(geometry) {
  return barriersScreen({ bounds: { l: 0, t: 0 }, barriers: geometry?.barriers || [] });
}

/**
 * G1119: a quoin a course's script set down (Radial Heights' hide_cover chain and Qurazies), collected
 * once: its reward def (js/radial-heights.js eventQuoinReward) paid as a Paradise quoin and noted in
 * the run's totals. `id` keys it in the run (run.eventQuoins).
 */
export function collectParadiseEventQuoin(run, id, rewardDef, now = Date.now(), { level = 1, multiplier = 1 } = {}) {
  const course = PARADISE_COURSES[run?.courseId];
  if (!run || !course) return { ok: false, reason: 'missing', run };
  if (paradiseRemainingMs(run, now) <= 0) {
    expireParadiseRun(run, now);
    return { ok: false, reason: 'expired', run };
  }
  if (!Array.isArray(run.eventQuoins)) run.eventQuoins = [];
  const key = String(id || '');
  if (!key || run.eventQuoins.includes(key)) return { ok: false, reason: 'already_collected', run };
  const reward = resolveParadiseReward(rewardDef, { level, multiplier });
  run.eventQuoins.push(key);
  noteReward(run, reward);
  return { ok: true, reason: 'collected', reward: { ...reward }, run };
}
