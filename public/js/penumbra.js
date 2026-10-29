/**
 * Penumbra, the Puzzles-hub level behind Umbra, rebuilt (pure data and a
 * builder: no Pixi, no DOM).
 *
 * What survives in source:
 * - GSJS inc_data_maps_prod.js 18087: hub 135 "Puzzles" lists
 *   LIFM2QAIQ1C31JV "Penumbra" (and 18091 a "Penumbra Backup"). No location
 *   XML for it is in the public dump, and nothing in GSJS scripts it.
 * - Umbra's location XML (streets/mnt/stos/location_data/LDOSHD9J6NT2HUJ.xml
 *   519-544) holds 19 Coins and 4 Collision-triggered Teleporters
 *   (items/teleporter.js 55-77: touching the hitbox calls
 *   pc.teleportToLocation(target_tsid, target_x, target_y)); their x/y and
 *   targets were not archived. Three teleporter TSIDs end in T2, the era of
 *   Umbra itself (LDOSHD9J6NT2HUJ); one, IDOVRL72HUC3HFG, ends in C3 like
 *   LIFM2QAIQ1C31JV, and Umbra's edit_history (line 16) shows gyoza adding
 *   plat_1351549922585 on 2012-10-29, the date of both Penumbra player Snaps
 *   (research/wayback/raw/snaps/penumbra/). So the C3 teleporter is the way in
 *   and that new top-left platform is where Penumbra drops you back.
 * - Quoins (items/quoin.js 156-184): a touched xp quoin pays its benefit as
 *   iMG. The benefit was an instance prop and is lost; the video shows
 *   +120 iMG on every Penumbra orb (and +100 mood on Umbra's).
 *
 * Everything else is read off Lily Linguistic's run (video jBz24r82wPw,
 * t0057-t0126; reference only, no pixels): frames registered into a
 * panorama and measured at 1.6 world px per video px (the avatar is ~80
 * video px against the remake's 130). The level is Umbra's trick again:
 * flat scaled blocks recoloured by layer filters, Umbra's middleground
 * filter turning the avatar and quoins into black silhouettes, and
 * object_floor_fade for the grey wash in the exit corridor (see Art below
 * for why the blocks are not k02_sky_2000x500 like Umbra's). All art is CC0
 * Tiny Speck decos already in assets/decos.
 *
 * Mechanics seen in the video and rebuilt here (no source for any of them):
 * - blue-framed squares turn from black to green when touched, once, and five
 *   of the six visibly do something: open a wall (three), uncover two window
 *   grids of orbs, or reveal the barcode room and its orbs. The sixth (on the
 *   upper right floor) turns green with no visible effect in the run.
 * - red striped ladders between floors (the avatar climbs straight up them).
 * - 22 black orbs at +120 iMG: 10,438,475 -> 10,441,115 iMG on screen
 *   = 2,640 = 22 x 120.
 * - the ceiling barcode over the first gallery flickers bar by bar.
 * - the red ">>" corridor fades to grey; walking into it returns to Umbra
 *   ("Penning back to Umbra..." is a Snap caption at that spot).
 *
 * tools/build-penumbra.mjs writes the street JSON, its index row and the
 * Penumbra and Umbra entries of assets/content/puzzle-triggers.json (run by
 * features/puzzles-feature.js).
 */

export const PENUMBRA_TSID = 'GIFM2QAIQ1C31JV';
export const PENUMBRA_SOURCE_TSID = 'LIFM2QAIQ1C31JV';
export const UMBRA_TSID = 'GDOSHD9J6NT2HUJ';
export const UMBRA_SOURCE_TSID = 'LDOSHD9J6NT2HUJ';
export const PENUMBRA_HUB = Object.freeze({ hubId: '135', hubName: 'Puzzles' });
export const PENUMBRA_SOURCE = 'reconstruction: Penumbra (LIFM2QAIQ1C31JV, not in tinyspeck/glitch-locations); layout from video jBz24r82wPw, art CC0 decos (newxpblack_blackcover_01a, mask_white, object_floor_fade) with Umbra\'s middleground filter';
export const PENUMBRA_ORB_IMG = 120;
/** World px per video px (avatar ~80 video px, 130 in the remake). */
export const VIDEO_SCALE = 1.6;

const W = 2560;
const H = 1700;
export const PENUMBRA_BOUNDS = Object.freeze({ l: -W / 2, r: W / 2, t: -H, b: 0 });

/*
 * Art. Umbra draws its blocks with k02_sky_2000x500 under black, white and
 * red layer filters, but the remake's k02 render carries semi-transparent
 * seam rows at 1/4, 1/2 and 3/4 of its height that show as pale lines
 * through every scaled block. Penumbra uses two flat CC0 decos instead:
 * newxpblack_blackcover_01a (opaque black) and mask_white (opaque white),
 * the coloured layers tinted with Umbra's tint filter in the video's colours.
 * The middleground keeps Umbra's black matrix: the avatar and orbs are
 * silhouettes.
 */
const BLACK_ART = 'newxpblack_blackcover_01a';
const WHITE_ART = 'mask_white';
const MIDDLEGROUND = { brightness: -100, contrast: -100 }; // Umbra's middleground
const tint = (rgb) => ({ tintColor: rgb, tintAmount: 100 });

const LAYERS = [
  { key: 'fade', name: 'fade', z: -7, filters: { brightness: -40 }, art: 'object_floor_fade' }, // a white alpha ramp: greyed so it reads on white
  { key: 'barcode', name: 'black', z: -6, filters: null, art: BLACK_ART },
  { key: 'black', name: 'black', z: -4, filters: null, art: BLACK_ART },
  { key: 'white', name: 'white', z: -3, filters: null, art: WHITE_ART },
  { key: 'cover', name: 'black', z: -2, filters: null, art: BLACK_ART },
  { key: 'red', name: 'red', z: -1, filters: tint(0xa00000), art: WHITE_ART }, // stripes and >> (#a00 in the video)
  { key: 'blue', name: 'blue', z: 1, filters: tint(0x1030ff), art: WHITE_ART }, // square frames and <
  { key: 'squareblack', name: 'black', z: 2, filters: null, art: BLACK_ART },
  { key: 'green', name: 'green', z: 3, filters: tint(0x18a018), art: WHITE_ART }, // touched squares
];
const ART_BY_LAYER = Object.fromEntries(LAYERS.map((l) => [l.key, l.art]));

/* ------------------------------------------------------------------ */
/* Layout (screen space: 0..2560 x 0..1700, y down, feet on floors)    */
/* ------------------------------------------------------------------ */

const T = 36; // floor bar thickness (video ~22 px)

/** Floors: platform top y, x range. */
export const FLOORS = Object.freeze([
  { id: 'f0', y: 1626, x0: 0, x1: W, why: 'bottom gallery, the arrival floor (panorama y 1050)' },
  { id: 'f1', y: 1282, x0: 0, x1: W, why: 'first gallery (panorama y 835)' },
  { id: 'f2l', y: 1014, x0: 0, x1: 1440, why: 'window room floor (panorama y 668)' },
  { id: 'f2r', y: 917, x0: 1440, x1: W, why: 'upper right gallery, one step up (panorama y 607)' },
  { id: 'f3', y: 618, x0: 0, x1: 1560, why: 'segmented barcode floor: the exit corridor (panorama y 420)' },
  { id: 'f3r', y: 525, x0: 1600, x1: W, why: 'floor of the top right room (panorama y 362)' },
  { id: 'f4', y: 430, x0: 0, x1: 1600, why: 'top floor: the "<" room and the barcode room (panorama y 318)' },
  { id: 'shelf', y: 272, x0: 762, x1: 1002, why: 'shelf off the pillar: the jump over into the barcode room' },
  { id: 'block', y: 370, x0: 1002, x1: 1170, why: 'black step under the shelf' },
]);

/** Solid black structure (rects x0, y0, x1, y1) beyond the floor bars. */
const SOLIDS = [
  [1240, 1050, 1300, 1282, 'f1 divider: the first gallery is two rooms'],
  [1440, 917, 1480, 1050, 'step between the window room and the upper right gallery'],
  [1400, 466, 1560, 618, 'end of the exit corridor'],
  [1560, 430, 1600, 561, 'step from the top right room up to the top floor'],
  [666, 200, 762, 430, 'pillar between the barcode room and the "<" room (top low enough to clear from the shelf)'],
  [1002, 370, 1170, 430, 'step block in the "<" room'],
  [1800, 0, 1840, 300, 'top of the top right room wall'],
];

/** Walls the squares open: deco + barrier. */
export const SWITCH_WALLS = Object.freeze([
  { id: 'w0', rect: [1600, 1318, 1640, 1626], why: 'bottom gallery wall: she turns back at it (frames f0089-f0097) and walks past it after the first square' },
  { id: 'w3', rect: [1800, 300, 1840, 525], why: 'top right room wall: its lower part greys out when the floating square is touched (t0107)' },
  { id: 'w5', rect: [590, 466, 630, 618], why: 'corridor pillar between the ladder and ">>": greys out when the corridor square is touched (t0121)' },
]);

/** Permanent walls (barrier lines): x, top y, h. */
const FIXED_WALLS = [
  { id: 'wall_f1_divider', x: 1270, y: 1050, h: 232 },
  { id: 'wall_f2_step', x: 1440, y: 917, h: 97 },
  { id: 'wall_corridor_end', x: 1400, y: 466, h: 152 },
  { id: 'wall_f4_step', x: 1600, y: 430, h: 95 },
  { id: 'wall_pillar', x: 714, y: 200, h: 230 },
  { id: 'wall_block', x: 1170, y: 370, h: 60 },
  { id: 'wall_block_left', x: 1002, y: 370, h: 60 },
  { id: 'wall_w3_top', x: 1820, y: 0, h: 300 },
];

/** Red ladders: centre x, bottom y, top y, rung width. */
export const LADDERS = Object.freeze([
  { id: 'l1', x: 2300, y: 1626, top: 1272, w: 230, why: 'right ladder up from the arrival floor (f0105-f0137)' },
  { id: 'l2', x: 130, y: 1626, top: 1272, w: 200, why: 'far left ladder (f0257-f0265: the camera climbs 216 video px, one floor)' },
  { id: 'l3', x: 560, y: 1282, top: 1004, w: 200, why: 'between the window grids, up into the window room (t0090)' },
  { id: 'l4', x: 2350, y: 917, top: 515, w: 200, why: 'upper right ladder into the top right room (f0353-f0377)' },
  { id: 'l5', x: 378, y: 618, top: 420, w: 230, why: 'from the corridor up into the barcode room: she drops down it (t0119)' },
]);

/** Blue-framed switch squares: bottom-centre x, y. */
export const SQUARES = Object.freeze([
  { id: 'sq1', x: 1480, y: 1282, opens: 'w0', why: 'first gallery square (panorama 920-960, 780-815), touched at f0158; then she walks the bottom gallery past its wall' },
  { id: 'sq2', x: 80, y: 1014, uncovers: ['cover_a', 'cover_b'], flag: 'windows', why: 'window room square, left end: touching it turns the two black blocks into window grids of orbs (t0099-t0100)' },
  { id: 'sq6', x: 1760, y: 917, why: 'upper right gallery square (panorama 1100-1130, 370-400), touched at t0098: green, no visible effect in the run' },
  { id: 'sq3', x: 2040, y: 347, opens: 'w3', body: true, why: 'floating square in the top right room (panorama 1278, 232); she jumps into it (t0106-t0107)' },
  { id: 'sq4', x: 830, y: 430, reveals: 'barcode', flag: 'barcode', why: '"<" room square on the floor; touching it fills the room behind the pillar with barcode and orbs (f0441-f0449)' },
  { id: 'sq5', x: 70, y: 618, opens: 'w5', why: 'corridor square at the far left, under the ladder (t0120-t0121)' },
]);

/** Window grids hung under the corridor floor (sq2 uncovers them). */
const GRIDS = [
  { id: 'cover_a', x0: 160, x1: 440, y0: 740, y1: 920, orbs: [0, 2] },
  { id: 'cover_b', x0: 660, x1: 940, y0: 740, y1: 920, orbs: [0, 1, 2] },
];
const CELL = { w: 70, h: 55, gap: 18 };

/** The exit: red ">>" and the grey wash, then the teleporter back to Umbra. */
export const EXIT = Object.freeze({ chevrons: { x: 800, y: 542 }, fade: { x0: 880, x1: 1400, y0: 466, y1: 618 }, box: { x: 1330, y: 618, w: 120, h: 152 } });

/**
 * Umbra side (Umbra screen space). The way in sits on the long bar of the
 * -1066 row (plat_1335376529741), where she stands still while Penumbra
 * loads (t0049-t0053; the bar pattern matches the remake's Umbra there).
 * The way back drops onto plat_1351549922585 (-999..-561, -1294), added the
 * night Penumbra opened and reachable from nowhere else in Umbra.
 */
export const UMBRA_ENTRY = Object.freeze({ x: 640, y: 434, w: 60, h: 100 });
export const UMBRA_RETURN = Object.freeze({ x: 300, y: 120 });
/** Penumbra arrival: the right end of the bottom gallery (t0057). */
export const PENUMBRA_START = Object.freeze({ x: 2450, y: 1626 });

/* Orbs: 22 x +120 iMG. */
export const ORBS = Object.freeze([
  // bottom gallery, behind the first wall: a pair and a diamond (panorama y 860-930)
  { x: 1390, y: 1500 },
  { x: 1470, y: 1500 },
  { x: 460, y: 1470 },
  { x: 400, y: 1520 },
  { x: 520, y: 1520 },
  { x: 460, y: 1570 },
  // first gallery, at the foot of the hanging bars
  { x: 1700, y: 1150 },
  { x: 1850, y: 1150 },
  { x: 2000, y: 1150 },
  // upper right gallery, by the ladder
  { x: 2050, y: 800 },
  { x: 2150, y: 800 },
  // barcode room, revealed by sq4
  ...[140, 240, 340, 440, 540, 610].map((x, i) => ({ x, y: i % 2 ? 300 : 350, flag: 'barcode' })),
]);

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */


/** Deterministic PRNG for the barcode (mulberry32). */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bars across [x0, x1], hanging from y0, each to a height in [hMin, hMax]. */
function barcode(seed, x0, x1, y0, hMin, hMax) {
  const rnd = prng(seed);
  const bars = [];
  let x = x0 + Math.round(rnd() * 20);
  while (x < x1 - 8) {
    const w = Math.min(x1 - x, [6, 8, 12, 16, 24, 40, 60][Math.floor(rnd() * 7)]);
    const h = Math.round(hMin + rnd() * (hMax - hMin));
    bars.push([x, y0, x + w, y0 + h]);
    x += w + 8 + Math.round(rnd() * 34);
  }
  return bars;
}

/** A floor bar broken into barcode segments (walkable; the gaps are paint). */
function segmented(seed, x0, x1, y0, y1) {
  const rnd = prng(seed);
  const out = [];
  let x = x0;
  while (x < x1) {
    const w = Math.min(x1 - x, 14 + Math.round(rnd() * 70));
    out.push([x, y0, x + w, y1]);
    x += w + 6 + Math.round(rnd() * 8);
  }
  return out;
}

/**
 * Every deco, by layer key: { key, id, rect | {x, y, w, h, r}, hidden }.
 * Rects become bottom-centre k02 blocks.
 */
export function penumbraDecos() {
  const out = [];
  let n = 0;
  const add = (key, rect, extra = {}) => out.push({ key, id: extra.id || `pen_${key}_${(n += 1)}`, rect, ...extra });

  // Floors (the corridor and window-room floors are barcode-segmented).
  for (const f of FLOORS) {
    if (f.id === 'shelf' || f.id === 'block') continue;
    const y1 = f.id === 'f0' ? H : f.y + T;
    if (f.id === 'f3' || f.id === 'f2l') for (const r of segmented(f.id === 'f3' ? 31 : 32, f.x0, f.x1, f.y, y1)) add('black', r);
    else add('black', [f.x0, f.y, f.x1, y1]);
  }
  add('black', [762, 272, 1002, 296]); // shelf
  for (const [x0, y0, x1, y1] of SOLIDS) add('black', [x0, y0, x1, y1]);
  for (const w of SWITCH_WALLS) add('black', w.rect, { id: `${w.id}_deco` });

  // Barcode decor (behind the avatar; never solid).
  for (const r of barcode(11, 180, 1130, 1318, 90, 180)) add('barcode', r);
  for (const r of barcode(13, 960, 1440, 654, 120, 230)) add('barcode', r);
  for (const r of barcode(17, 1500, 2300, 561, 120, 260)) add('barcode', r);
  for (const r of barcode(19, 1300, 2560, 953, 120, 190)) add('barcode', r);
  // The first gallery's ceiling bars flicker: every third one is in set A,
  // the next in set B (B starts hidden).
  const flickerA = [];
  const flickerB = [];
  for (const [i, r] of barcode(23, 1320, 2540, 953, 60, 150).entries()) {
    if (i % 3 === 0) {
      const id = `pen_flick_a_${i}`;
      flickerA.push(id);
      add('barcode', r, { id });
    } else if (i % 3 === 1) {
      const id = `pen_flick_b_${i}`;
      flickerB.push(id);
      add('barcode', r, { id, hidden: true });
    }
  }
  // Barcode room: dense full-height bars, hidden until sq4.
  for (const [i, r] of barcode(29, 20, 650, 0, 400, 400).entries()) add('barcode', r, { id: `pen_barcode_${i}`, hidden: true });

  // Window grids: black frame, white cells, black cover over all.
  for (const g of GRIDS) {
    add('black', [g.x0, g.y0, g.x1, g.y1]);
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const cx0 = g.x0 + CELL.gap + col * (CELL.w + CELL.gap + 4);
        const cy0 = g.y0 + CELL.gap + row * (CELL.h + CELL.gap + 14);
        add('white', [cx0, cy0, cx0 + CELL.w, cy0 + CELL.h]);
      }
    }
    add('cover', [g.x0, g.y0, g.x1, g.y1], { id: g.id });
  }

  // Ladders: red rungs, 18 px, every 48 px from the top down.
  for (const l of LADDERS) {
    for (let y = l.top; y <= l.y - 18; y += 48) add('red', [l.x - l.w / 2, y, l.x + l.w / 2, y + 18]);
  }

  // Squares: blue frame, black face, green face (hidden).
  for (const s of SQUARES) {
    add('blue', [s.x - 30, s.y - 60, s.x + 30, s.y]);
    add('squareblack', [s.x - 21, s.y - 51, s.x + 21, s.y - 9], { id: `${s.id}_black` });
    add('green', [s.x - 21, s.y - 51, s.x + 21, s.y - 9], { id: `${s.id}_green`, hidden: true });
  }

  // Chevrons from rotated bars (anchor bottom-centre at the tip).
  const chevron = (key, tipX, tipY, dir) => {
    const len = 42;
    const w = 13;
    // ">" (dir 1): strokes run up-left (-45) and down-left (-135) from the tip.
    const angles = dir > 0 ? [-45, -135] : [45, 135];
    for (const r of angles) add(key, null, { at: { x: tipX, y: tipY, w, h: len, r } });
  };
  chevron('red', EXIT.chevrons.x, EXIT.chevrons.y, 1);
  chevron('red', EXIT.chevrons.x + 38, EXIT.chevrons.y, 1);
  chevron('blue', 800, 190, -1);

  // Exit wash: object_floor_fade is a white ramp, clear at its top and
  // solid at its bottom. Turned -90 degrees about its bottom-centre anchor at
  // the corridor's end, it runs clear at the ">>" to solid at the far wall.
  const f = EXIT.fade;
  add('fade', null, { at: { x: f.x1, y: (f.y0 + f.y1) / 2, w: f.y1 - f.y0, h: f.x1 - f.x0, r: -90 } });

  return { decos: out, flickerA, flickerB };
}

const rectDeco = (d) => {
  const sprite = ART_BY_LAYER[d.key];
  if (d.at) return { id: d.id, sprite, x: Math.round(d.at.x), y: Math.round(d.at.y), w: Math.round(d.at.w), h: Math.round(d.at.h), z: 0, r: d.at.r || 0, ...(d.hidden ? { hidden: true } : {}) };
  const [x0, y0, x1, y1] = d.rect;
  return { id: d.id, sprite, x: Math.round((x0 + x1) / 2), y: Math.round(y1), w: Math.round(x1 - x0), h: Math.round(y1 - y0), z: 0, r: 0, ...(d.hidden ? { hidden: true } : {}) };
};

const world = (x, y) => ({ x: x + PENUMBRA_BOUNDS.l, y: y + PENUMBRA_BOUNDS.t });

/** The way back to Umbra (the teleporter at the end of the >> corridor). */
export const TO_UMBRA = Object.freeze([
  {
    type: 'code_player',
    all: false,
    code: {
      type: 'teleport',
      tsid: UMBRA_SOURCE_TSID,
      x: UMBRA_RETURN.x - 1000,
      y: UMBRA_RETURN.y - 1500,
      street: UMBRA_TSID,
      arrive: { ...UMBRA_RETURN },
    },
  },
]);

/**
 * Location events in the street JSON: square switches and the ceiling
 * flicker. The teleport back (TO_UMBRA) rides in the puzzle entry's
 * `events`, like Umbra's way in, so the street JSON's events hold no
 * teleport the archive did not record.
 */
export function penumbraEvents() {
  const { flickerA, flickerB } = penumbraDecos();
  const events = {
    player_enter: [{ type: 'event', event: 'flicker_a' }],
    flicker_a: [
      ...flickerA.map((deco) => ({ type: 'deco_hide', deco, fade: 0 })),
      ...flickerB.map((deco) => ({ type: 'deco_show', deco, fade: 0 })),
      { type: 'event', event: 'flicker_b', delay: 650 },
    ],
    flicker_b: [
      ...flickerA.map((deco) => ({ type: 'deco_show', deco, fade: 0 })),
      ...flickerB.map((deco) => ({ type: 'deco_hide', deco, fade: 0 })),
      { type: 'event', event: 'flicker_a', delay: 900 },
    ],
  };
  for (const s of SQUARES) {
    const acts = [
      { type: 'deco_hide', deco: `${s.id}_black`, fade: 150 },
      { type: 'deco_show', deco: `${s.id}_green`, fade: 150 },
      { type: 'flag_set', flag: `${s.id}_on` },
    ];
    if (s.opens) acts.push({ type: 'deco_hide', deco: `${s.opens}_deco`, fade: 700 }, { type: 'wall', wall: `wall_${s.opens}`, pc_perm: 0 });
    for (const cover of s.uncovers || []) acts.push({ type: 'deco_hide', deco: cover, fade: 700 });
    if (s.reveals === 'barcode') {
      const { decos } = penumbraDecos();
      for (const d of decos) if (d.id.startsWith('pen_barcode_')) acts.push({ type: 'deco_show', deco: d.id, fade: 400 });
    }
    if (s.flag) acts.push({ type: 'flag_set', flag: s.flag });
    events[s.id] = acts;
  }
  return events;
}

/** The street JSON (assets/streets/GIFM2QAIQ1C31JV.json). */
export function penumbraStreet() {
  const { decos } = penumbraDecos();
  const layers = [];
  for (const L of LAYERS) {
    const mine = decos.filter((d) => d.key === L.key).map(rectDeco);
    layers.push({ id: `T_penumbra_${L.key}`, name: L.name, z: L.z, decos: mine, w: W, h: H, ...(L.filters ? { filters: { ...L.filters } } : {}) });
  }
  layers.push({ id: 'middleground', name: 'middleground', z: 0, decos: [], w: W, h: H, filters: { ...MIDDLEGROUND } });
  layers.sort((a, b) => a.z - b.z);

  const platforms = FLOORS.map((f) => {
    const a = world(f.x0, f.y);
    const b = world(f.x1, f.y);
    // -1: a floor you can jump up through; the room is rebuilt from video, so its floors are the plain kind (null would be hard both ways).
    return { id: `plat_${f.id}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, pc_perm: -1 };
  });
  const barriers = [
    ...SWITCH_WALLS.map((w) => {
      const [x0, y0, x1, y1] = w.rect;
      const p = world((x0 + x1) / 2, y0);
      return { id: `wall_${w.id}`, x: p.x, y: p.y, h: y1 - y0, pc_perm: null };
    }),
    ...FIXED_WALLS.map((w) => {
      const p = world(w.x, w.y);
      return { id: w.id, x: p.x, y: p.y, h: w.h, pc_perm: null };
    }),
  ];
  const ladders = LADDERS.map((l) => {
    const p = world(l.x, l.y);
    return { id: `ladder_${l.id}`, x: p.x, y: p.y, w: l.w, h: l.y - l.top };
  });
  const decoCount = layers.reduce((n, l) => n + l.decos.length, 0);
  return {
    source: PENUMBRA_SOURCE,
    reconstructed: true,
    tsid: PENUMBRA_TSID,
    label: 'Penumbra',
    swf_file: 'kukubee.swf',
    bounds: { ...PENUMBRA_BOUNDS },
    platforms,
    layers,
    signposts: [],
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount,
      signpostCount: 0,
      doorCount: 0,
      ladderCount: ladders.length,
      barrierCount: barriers.length,
    },
    gradient: { top: 'FFFFFF', bottom: 'FFFFFF' },
    ladders,
    barriers,
    events: penumbraEvents(),
  };
}

/** The index.json row. */
export function penumbraIndexEntry() {
  const street = penumbraStreet();
  return {
    label: 'Penumbra',
    file: `assets/streets/${PENUMBRA_TSID}.json`,
    hubId: PENUMBRA_HUB.hubId,
    hubName: PENUMBRA_HUB.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}

/** puzzle-triggers.json entry for Penumbra (features/puzzles-feature.js). */
export function penumbraPuzzleEntry() {
  const triggers = SQUARES.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.body ? s.y + 4 : s.y,
    w: 76,
    h: s.body ? 72 : 90,
    ...(s.body ? { body: true, standY: s.y + 60 } : {}),
    once: true,
    onEnter: [s.id],
    why: s.why,
  }));
  triggers.push({
    id: 'exit',
    x: EXIT.box.x,
    y: EXIT.box.y,
    w: EXIT.box.w,
    h: EXIT.box.h,
    once: true,
    onEnter: ['to_umbra'],
    why: 'End of the ">>" corridor, inside the grey wash: she walks in and the Umbra loading card follows (t0125-t0126); Snap caption "Penning back to Umbra..." (2012-10-29). Lands on plat_1351549922585, the top left platform added to Umbra that night.',
  });
  return {
    name: 'Penumbra',
    blurb: 'The monochrome level behind Umbra: touch the blue squares, take the black orbs, follow the arrows out.',
    sourceTsid: PENUMBRA_SOURCE_TSID,
    strict: true,
    emptyEcology: true,
    start: { ...PENUMBRA_START },
    triggers,
    quoins: [...ORBS.map((o) => ({ x: o.x, y: o.y, type: 'xp', amount: PENUMBRA_ORB_IMG, ...(o.flag ? { flag: o.flag } : {}) })), ...windowOrbs()],
    quoinsWhy: '22 orbs at +120 iMG each: the video counter goes 10,438,475 -> 10,441,115 (= 22 x 120) and every pickup reads +120 iMG. Barcode-room orbs appear with sq4; window orbs (inside the grids) with sq2.',
    autoplay: ['sq1', 'sq2', 'sq6', 'sq3', 'sq4', 'sq5', '*quoins', 'exit'],
    events: { to_umbra: TO_UMBRA.map((a) => ({ ...a, code: { ...a.code, arrive: { ...a.code.arrive } } })) },
    eventsWhy: 'The Collision-triggered Teleporter back to Umbra (items/teleporter.js 55-77); its target_x/y are lost, so it lands on plat_1351549922585.',
  };
}

/** Window orbs (inside the grids' bottom cells), flagged by sq2. */
export function windowOrbs() {
  const out = [];
  for (const g of GRIDS) {
    for (const col of g.orbs) {
      const cx = g.x0 + CELL.gap + col * (CELL.w + CELL.gap + 4) + CELL.w / 2;
      const cy = g.y0 + CELL.gap + (CELL.h + CELL.gap + 14) + CELL.h / 2;
      out.push({ x: Math.round(cx), y: Math.round(cy), type: 'xp', amount: PENUMBRA_ORB_IMG, flag: 'windows' });
    }
  }
  return out;
}

/** puzzle-triggers.json entry for Umbra: the C3 teleporter into Penumbra. */
export function umbraPuzzleEntry() {
  return {
    name: 'Umbra',
    sourceTsid: UMBRA_SOURCE_TSID,
    mapCard: false,
    emptyEcology: false,
    start: { x: UMBRA_ENTRY.x - 90, y: UMBRA_ENTRY.y },
    triggers: [
      {
        id: 'to_penumbra',
        x: UMBRA_ENTRY.x,
        y: UMBRA_ENTRY.y,
        w: UMBRA_ENTRY.w,
        h: UMBRA_ENTRY.h,
        onEnter: ['to_penumbra'],
        why: 'Collision-triggered Teleporter IDOVRL72HUC3HFG (C3 era, like LIFM2QAIQ1C31JV; the other three are T2). Placed on the long bar of the -1066 row (plat_1335376529741) where she stands while Penumbra loads (video jBz24r82wPw t0049-t0053); the remake draws the same bar pattern there.',
      },
    ],
    quoins: [],
    // plat_1351549922585 (screen 1..439, 206) has no deco in the archive
    // (Umbra's locodeco-replace edits that night did not survive), so the
    // remake drew no ledge where Penumbra drops you; the video shows a plain
    // black bar (t0127-t0129). Drawn here from the CC0 black cover deco.
    art: [{ sprite: 'umbra_ledge', x: 220, y: 236, w: 438, h: 30, alpha: 1, steady: true, z: 5 }],
    artWhy: 'Return ledge: plat_1351549922585 is invisible in the archived art; the video shows a solid black bar where she lands back from Penumbra.',
    events: {
      to_penumbra: [
        {
          type: 'code_player',
          all: false,
          code: {
            type: 'teleport',
            tsid: PENUMBRA_SOURCE_TSID,
            x: PENUMBRA_START.x + PENUMBRA_BOUNDS.l,
            y: PENUMBRA_START.y + PENUMBRA_BOUNDS.t,
            street: PENUMBRA_TSID,
            arrive: { ...PENUMBRA_START },
          },
        },
      ],
    },
    eventsWhy: 'The teleporter\'s target was an instance prop and is lost (items/teleporter.js 55-77). Penumbra opens at the right end of its bottom gallery (t0057).',
  };
}
