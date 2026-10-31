/**
 * The abandoned towers' upper floors (register row G144): the 15 floors the
 * lifts in the five abandoned tower lobbies name, none of which was ever
 * archived. Pure data and street builders (no Pixi, no DOM);
 * tools/build-tower-floors.mjs writes the street JSON, the index rows and the
 * lift arrivals in the lobbies, and features/tower-floors-feature.js draws the
 * number on each lift's plate and keeps the floors empty rooms.
 *
 * Sources
 * - The lobbies' location XML (tinyspeck/glitch-locations, CC0): each lobby's
 *   lift is one signpost (signpost_asset_elevator, 392 x 422) whose connects
 *   name every floor of its quarter group with an arrival point in that floor
 *   (Hauki Seeks Manor GA9H1V6OGRU2FSB.xml signpost_1336672542651: floor 1 at
 *   125,-108, floor 2 at 122,-106, floor 3 at 131,-107). Those points are the
 *   floors' own world coordinates, so they set where you step out of the lift
 *   and the height of each floor line.
 * - GSJS: inc_data_pols_prod.js quarter_templates "apartment_8units" (the hub
 *   55 "Apt Hallway - 8 Unit" template): an apartment hall had eight
 *   apartment doors, the default here. locations/tower.js gives every floor's
 *   lift the same connects (utils.copy_hash(connects)), so each floor's lift
 *   lists what the lobby's lists, in the lobby's order. The hall templates
 *   themselves (hub 124 "Abandoned Apartments": Boards, Bricks, Gloomy,
 *   Grow-Op, Sludgy and Tree floors) were never archived.
 * - Hauki Seeks Manor, floors 1, 2 and 3: the Glitch Tribute Blog's
 *   panoramas, posts 48476742859, 48484112182 and 48540615574, each tagged
 *   Hauki Seeks Manor with the lift plate reading its floor (Tumblr's 1280 x
 *   264 copies, 0.4116 of 3110 x 642; research/coverage/
 *   round4-people-2026-10-31/towers/, reference only, never shipped). See
 *   HAUKI_FLOOR_1 / _2 / _3 for what each gave. All three share one plan of
 *   wall bays (HAUKI_PILASTERS), the lift at the centre.
 * - The other twelve floors: the Tribute Blog's panoramas found in round 5
 *   (research/coverage/round5-tribute-blog/manifest.tsv, rows B4-B15, each
 *   confirmed by its lift plate; reference only, never shipped), on the same
 *   plan: EGRET_FLOOR_1-3, SABUDANA_FLOOR_1-4, HAKUSAN_FLOOR_1-2 and
 *   GREGARIOUS_FLOOR_1-3, each citing its post. A floor with no picture would
 *   fall back to defaultTowerLayout, marked in its JSON (why.layout starts
 *   'default layout, awaiting a panorama'); none does now.
 * - The size: the towers' archived basements are 3110 x 642 (-1555..1555),
 *   and all fifteen pictures have the same shape, so every floor is that size.
 *
 * Art: Tiny Speck's CC0 apartment hall kit already in assets/decos/groddle
 * (apartment_hall_wall_piece_2 / _window / _wall_side / _elevator /
 * _floor_piece_1, apartment_filler,
 * apartment_xsection_top_1, signpost_asset_elevator, door_asset_abandoned_apt_1,
 * nailed_board_single, apartment_rug_red), and each tower's own accents from its
 * archived lobby and basement (drips at Hauki Seeks, tree moss at Egret Taun,
 * crates and barrels at Sabudana Drama, lianas at Hakusan Heaps, cracked walls
 * at Gregarious), plus what the pictures show: ivy (draping_plant_01b_al1),
 * stone columns and a white beam (column_1, beam_white_1), planter beds
 * (firebog_planter_box_3x4), braced wooden posts (wood_cover_middleplus),
 * bricks under peeling plaster (apartment_brick_wall,
 * apartment_hall_wood_border, partment_brick_wall_crack_*), barrels, filing
 * cabinets (cubicle_cabinet_stack). Each floor's layer takes its lobby's
 * colour filter; a lit floor (`light`) shows its ceiling and the sky through
 * its open windows, Hauki Seeks Manor's dark ones do not.
 *
 * Re-laying a floor from a panorama (the how-to)
 * 1. Save the picture under research (reference only) with a source note.
 * 2. Scale: world x = picture x * 3110 / picture width - 1555 (a 1280 px
 *    Tumblr copy: x * 2.4297 - 1555); world y = picture y * 642 / picture
 *    height - 642. The lift's door should land near x 0 and the arrival
 *    point (the lobby XML's connect x) just right of it.
 * 3. Write a layout like EGRET_FLOOR_1 (or HAUKI_FLOOR_3 for one off the
 *    shared plan): `bays` are the twelve wall bays between the wood
 *    pilasters, left to right; towerBays() takes words ('door:two',
 *    'window:open:cross', 'torn:room', ...: see its comment), or write
 *    [left x, right x, kind, options] by hand. `props` are free decos
 *    [sprite, x, base, w, h, options] (the helpers at(), crate(), barrel(),
 *    post(), column(), ivy(), lean() and plank() take picture x; with
 *    `relative: true` a base is measured from the floor line, + nearer;
 *    `front: true` draws in front of the avatar, `abs: true` keeps a base
 *    absolute). `rug` is [centre x, width]; `closed` walls off a part of the
 *    hall players never walked in; `light` and `bricks` as above. Keep each
 *    deco no larger than tools/deco-pipeline/sharp.py --check allows.
 *    Set status 'panorama' and a one-line `source`, then add it to
 *    PANORAMA_LAYOUTS under the floor's GSJS tsid.
 * 4. node tools/build-tower-floors.mjs, then the key builders (see the
 *    builder's header), and tests/g144-tower-floors.test.js.
 */

/** Every floor: the basements' size (-1555..1555 x -642..0). */
export const TOWER_FLOOR_BOUNDS = Object.freeze({ l: -1555, r: 1555, t: -642, b: 0 });
/** Back wall base and top, and the ceiling line (the hall kit at one world px per picture px). */
const WALL_BASE = -176;
const WALL_TOP = -526;
const CEILING_Y = -560;
/** The widest a window piece is drawn (its sharp copy, tools/deco-pipeline/plan-sharp.json). */
const WINDOW_MAX_W = 200;
/** The lift: signpost_asset_elevator's size in every lobby; its door is the hall's centre. */
export const TOWER_LIFT = Object.freeze({ x: 0, w: 392, h: 422, art: 30, tower: { w: 392, h: 422 } });
/** The plate left of the lift door (signpost_asset_elevator's own plate), from the lift's base. */
export const TOWER_LIFT_PLATE = Object.freeze({ dx: -114, dy: 138 });
export const TOWER_FLOOR_SIGNPOST = 'signpost_lift';
export const TOWER_DEFAULT_DOORS = 8;
export const TOWER_DEFAULT_NOTE = 'default layout, awaiting a panorama';
const SOURCE_PREFIX = 'reconstruction';

const deco = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra });
const countDecos = (layers) => layers.reduce((n, l) => n + (l.decos?.length || 0), 0);

/** A deterministic 0..1 from an integer (the builder's --check must be stable). */
const rnd = (n) => {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h % 10000) / 10000;
};
/** A small integer seed from a tsid. */
const seedOf = (tsid) => [...String(tsid)].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7) % 100000;

/* ------------------------------------------------------------------ */
/* The five towers                                                     */
/* ------------------------------------------------------------------ */

const tower = ({ id, label, lobby, basement, hub, quarter, style, floors }) => Object.freeze({
  id,
  label,
  lobby,
  basement,
  hub: Object.freeze({ hubId: hub[0], hubName: hub[1] }),
  quarter,
  style,
  floors: Object.freeze(floors.map(([n, source, x, y]) => Object.freeze({
    n,
    source,
    tsid: `G${source.slice(1)}`,
    label: `${label}, floor ${n}`,
    /** The lobby XML's connect point for this floor: world x, y in the floor. */
    arrive: Object.freeze({ x, y }),
  }))),
});

/**
 * Lobby, basement, hub, the lift's quarter group, the accent style, and per
 * floor [n, GSJS tsid, connect x, connect y] from the lobby XML's lift.
 */
export const TOWERS = Object.freeze([
  tower({ id: 'hauki', label: 'Hauki Seeks Manor', lobby: 'GA9H1V6OGRU2FSB', basement: 'GA9EBPF8M2031HB', hub: ['75', 'Bortola'], quarter: 'RHVMQ7S8TA32UQK', style: 'drips',
    floors: [[1, 'LDOBRJIEU2V2Q2G', 125, -108], [2, 'LDOBRKREU2V2F9B', 122, -106], [3, 'LHF9DOUO7K03OUA', 131, -107]] }),
  tower({ id: 'egret', label: 'Egret Taun Towers', lobby: 'GHVUR3UKGRU2SD2', basement: 'GHVEI9NVJ203LRO', hub: ['98', 'Besara'], quarter: 'RA9M20EOK3H2AAO', style: 'moss',
    floors: [[1, 'LUVMHFM3U2V2T72', 119, -111], [2, 'LUVMHGV3U2V2J7M', 124, -111], [3, 'LUVMHH74U2V245O', 119, -111]] }),
  tower({ id: 'sabudana', label: 'Sabudana Drama Towers', lobby: 'GIFI4FP9GRU2CC8', basement: 'GIF84CCRN203N7P', hub: ['101', 'Aranna'], quarter: 'RA5ENLT7GMB2R2H', style: 'crates',
    floors: [[1, 'LNV6EBBIS2V2JB8', 120, -118], [2, 'LNV6ECKIS2V26JU', 124, -112], [3, 'LNV6EDVIS2V2SFD', 124, -112], [4, 'LNV6EEAJS2V26B2', 120, -118]] }),
  tower({ id: 'hakusan', label: 'Hakusan Heaps Towers', lobby: 'GHVUFJ6HGRU2V0E', basement: 'GHV6HOCAH203RMF', hub: ['97', 'Muufo'], quarter: 'RA9K2TTVD5D2S26', style: 'vines',
    floors: [[1, 'LA9TBQS1V2V2G34', 119, -100], [2, 'LA9TBR62V2V23E2', 117, -120]] }),
  tower({ id: 'gregarious', label: 'Gregarious Towers', lobby: 'GA5134UPLRU29OH', basement: 'GDONEDVHC4030KF', hub: ['58', 'Groddle Meadow'], quarter: 'RIF12A8IEUK1V1B', style: 'cracks',
    floors: [[1, 'LDOBRLULU2V24DS', 124, -107], [2, 'LDOBRNDMU2V2Q34', 115, -105], [3, 'LDOBROOMU2V2GCK', 105, -103]] }),
]);

/** Every floor, with its tower. */
export const TOWER_FLOORS = Object.freeze(TOWERS.flatMap((t) => t.floors.map((f) => Object.freeze({ ...f, tower: t }))));

const byTsid = new Map(TOWER_FLOORS.map((f) => [f.tsid.slice(1), f]));
/** The floor for a tsid under either prefix (G as built, L as GSJS names it), or null. */
export const towerFloorFor = (tsid) => (tsid && String(tsid).length > 1 ? byTsid.get(String(tsid).slice(1)) || null : null);
export const isTowerFloorTsid = (tsid) => Boolean(towerFloorFor(tsid));
/** The tower whose lobby this is (either prefix), or null. */
export const towerForLobby = (tsid) => TOWERS.find((t) => t.lobby.slice(1) === String(tsid || '').slice(1)) || null;

/* ------------------------------------------------------------------ */
/* Layouts                                                             */
/* ------------------------------------------------------------------ */

/**
 * The wood pilasters of Hauki Seeks Manor's floors (floors 1 and 2: picture x
 * 77, 170, 260, 327, 420, 510 | lift 580-700 | 765, 857, 950, 1020, 1110,
 * 1205), world x. The lobbies share one plan, so the default floors use it
 * too; it is also the plan of the hall kit's other full render (Snowed In,
 * js/rebuilt-rooms.js SNOWED_IN_BAYS, within 20 px).
 */
export const HAUKI_PILASTERS = Object.freeze([-1368, -1142, -923, -760, -534, -316, -146, 146, 304, 527, 753, 923, 1142, 1373]);
const P = HAUKI_PILASTERS;

/**
 * Hauki Seeks Manor, floor 1, from post 48476742859 (the plate reads 1; the
 * avatar stands at picture x 692, world 127, where the lobby XML's arrival
 * 125,-108 puts you). Left of the lift: a door with one plank (picture x
 * 123), a door with crossed planks (215), a window (297), a door with one
 * plank (375), a bare bay (465), a window (547). Right: a window (735), a door
 * with a crate before it (812), a door with two planks (905), a window with a
 * chair before it (985), a door with one plank (1062), a bay split by a dark
 * crack (1180). Crates at 93, 158, 440, 487 and front right at 1215 with a
 * stool, a round table front left (70), paper stacks (295), a plank on the
 * floor (790), the rug from 285 to 712. Left out: the light glowing in two
 * windows and a moss patch on the floor.
 */
export const HAUKI_FLOOR_1 = Object.freeze({
  status: 'panorama',
  source: 'Glitch Tribute Blog post 48476742859 (tagged Hauki Seeks Manor, plate 1), Tumblr 1280 x 264 copy of a 3110 x 642 render, reference only',
  bays: [
    [P[0], P[1], 'door', { boards: 'one' }],
    [P[1], P[2], 'door', { boards: 'cross' }],
    [P[2], P[3], 'window'],
    [P[3], P[4], 'door', { boards: 'one' }],
    [P[4], P[5], 'wall'],
    [P[5], P[6], 'window'],
    [P[7], P[8], 'window'],
    [P[8], P[9], 'door'],
    [P[9], P[10], 'door', { boards: 'two' }],
    [P[10], P[11], 'window'],
    [P[11], P[12], 'door', { boards: 'one' }],
    [P[12], P[13], 'wall', { art: 'wall_crack_2', w: 96, h: 190, base: -200 }],
  ],
  props: [
    ['crate_1', -1329, -110, 130, 110, {}],
    ['crate_1', -1171, -104, 140, 124, { flip: true }],
    ['deco_table_wooden_ghtest', -1385, -40, 180, 70, {}],
    ['juju_grandma_papers_01a_al1', -838, -112, 120, 92, {}],
    ['juju_grandma_papers_01c_al1', -1250, -70, 46, 16, {}],
    ['juju_grandma_papers_01c_al1', -1000, -66, 44, 16, { flip: true }],
    ['crate_1', -486, -110, 150, 130, {}],
    ['crate_1', -372, -108, 130, 112, { flip: true }],
    ['juju_grandma_papers_01b_al1', -330, -100, 70, 40, {}],
    ['crate_1', 418, -100, 160, 150, {}],
    ['platform_wood_board_1', 365, -50, 230, 30, {}],
    ['deco_chair_wooden_ghtest', 838, -112, 64, 90, {}],
    ['crate_1', 1397, -30, 180, 160, { front: true }],
    ['deco_stool_wooden_ghtest', 1482, -36, 66, 56, { front: true }],
  ],
  rug: [-344, 1037],
  closed: null,
});

/**
 * Hauki Seeks Manor, floor 2, from post 48484112182 (the plate reads 2).
 * Left of the lift: a door with two planks (picture x 123), a door with
 * crossed planks (215), a window (297), a door with one plank and a hole in
 * the wall above it (375), a door with one diagonal plank (465), a window
 * (547). Right: a window (735), a door with one plank (812), a door with
 * three planks (902), a window (985), a door with crossed planks (1065), a
 * door with a hole above it (1157). The planks are torn up left of the lift
 * over grey stone (330-560) with a hole (365); crates front left (50, 100); a
 * round table (960), a chair (1012), a paper stack (1055), two crates with
 * papers on them (1125, 1187); the rug from 692 to 1122 (as on floor 3).
 * Left out: the moss on the lift and the light in a window.
 */
export const HAUKI_FLOOR_2 = Object.freeze({
  status: 'panorama',
  source: 'Glitch Tribute Blog post 48484112182 (tagged Hauki Seeks Manor, plate 2), Tumblr 1280 x 264 copy of a 3110 x 642 render, reference only',
  bays: [
    [P[0], P[1], 'door', { boards: 'two' }],
    [P[1], P[2], 'door', { boards: 'cross' }],
    [P[2], P[3], 'window'],
    [P[3], P[4], 'door', { boards: 'one', hole: true }],
    [P[4], P[5], 'door', { boards: 'one' }],
    [P[5], P[6], 'window'],
    [P[7], P[8], 'window'],
    [P[8], P[9], 'door', { boards: 'one' }],
    [P[9], P[10], 'door', { boards: 'three' }],
    [P[10], P[11], 'window'],
    [P[11], P[12], 'door', { boards: 'cross' }],
    [P[12], P[13], 'door', { hole: true }],
  ],
  props: [
    ['crate_1', -1434, -20, 200, 170, { front: true }],
    ['crate_1', -1312, -110, 110, 96, {}],
    ['platform_crack_1', -668, -66, 240, 56, {}],
    ['abandoned_apt_rubble_06', -450, -70, 220, 28, {}],
    ['abandoned_apt_rubble_06', -900, -60, 200, 26, { flip: true }],
    ['deco_table_wooden_ghtest', 777, -100, 190, 70, {}],
    ['deco_chair_wooden_ghtest', 904, -104, 62, 86, {}],
    ['juju_grandma_papers_01a_al1', 1008, -98, 110, 84, {}],
    ['crate_1', 1178, -104, 170, 150, {}],
    ['crate_1', 1329, -106, 160, 140, { flip: true }],
    ['juju_grandma_papers_01b_al1', 1190, -250, 80, 40, {}],
    ['juju_grandma_papers_01c_al1', 520, -60, 46, 16, {}],
    ['juju_grandma_papers_01c_al1', 1060, -40, 44, 16, { flip: true }],
  ],
  rug: [650, 1042],
  closed: null,
});

/**
 * Hauki Seeks Manor, floor 3, from the Tribute Blog panorama (post
 * 48540615574, 1280 x 264; world x = picture x * 2.4297 - 1555). What it gave:
 * - The lift tower at picture x 578-698 (world -151..141), its door centred
 *   on x 0 and its plate reading 3 left of the door; the avatar stands at
 *   picture x 695 (world 134), where the lobby XML's arrival (131,-107) puts you.
 * - Ten pilasters, so nine bays: a hole in the wall (picture x 377), a door
 *   boarded with two crossed planks (465), a window (548), the lift, a window
 *   (735), a plain bay with a torn red poster (815), a door boarded with three
 *   planks (903), a window (987), a door with one diagonal plank (1063), a
 *   hole in the wall (1150) with a crate and a chair on it before it (1183).
 *   So three hall doors, not the default eight; the windows are boarded from
 *   behind.
 * - At the left end, past a wood-framed partition (picture x 265-343), a room
 *   behind bars (25-265): a crate, stacks of papers, a round table and two
 *   planks nailed across its top. You never walk in (a wall at its bars).
 * - The red rug from picture x 693 to 1122 (world 129..1171), a broken patch of
 *   planks with a hole left of the lift (420-500), loose papers, and dark drips
 *   down every wall from the ceiling.
 * - Left out: the quoins floating inside the barred room and the red wall
 *   button under the first window (items with no archived spot or purpose),
 *   and the picture's fog.
 */
export const HAUKI_FLOOR_3 = Object.freeze({
  status: 'panorama',
  source: 'Glitch Tribute Blog post 48540615574 (tagged Hauki Seeks Manor), Tumblr 1280 x 264 copy of a 3110 x 642 render, reference only',
  bays: [
    [-911, -722, 'wall', { art: 'bars' }],
    [-722, -522, 'hole'],
    [-522, -316, 'door', { boards: 'cross' }],
    [-316, -151, 'window'],
    [141, 309, 'window'],
    [309, 530, 'wall', { art: 'shredded_poster_1' }],
    [530, 753, 'door', { boards: 'three' }],
    [753, 928, 'window'],
    [928, 1147, 'door', { boards: 'one' }],
    [1147, 1368, 'hole'],
  ],
  props: [
    // The barred room at the left end (picture x 25-265).
    ['apartment_hall_wall_piece_2', -1350, WALL_BASE, 290, 350, { z: 11 }],
    ['apartment_hall_wall_piece_2', -1055, WALL_BASE, 300, 350, { z: 11, flip: true }],
    ['crate_1', -1340, -112, 146, 124, {}],
    ['juju_grandma_papers_01a_al1', -1190, -110, 120, 92, {}],
    ['juju_grandma_papers_01b_al1', -1440, -64, 90, 52, { front: true }],
    ['deco_table_wooden_ghtest', -1060, -116, 170, 66, {}],
    ...[-1458, -1372, -1286, -1200, -1114, -1028, -942].map((x, i) => ['penaltybox_bar_2', x + (i % 3) * 4, -36, 18, 470, {}]),
    ['beam_wood_diagonal_1', -1470, -380, 100, 148, { front: true }],
    ['nailed_board_single', -1000, -470, 260, 36, { front: true, r: 14 }],
    // The partition between the barred room and the hall.
    ['beam_wood_vertical_1', -905, -40, 26, 520, { front: true }],
    // Before the last hole: a crate with a chair on it.
    ['crate_1', 1320, -104, 170, 146, {}],
    ['deco_chair_wooden_ghtest', 1328, -244, 70, 92, {}],
    // The broken planks and the hole in the floor left of the lift, loose papers.
    ['platform_crack_1', -450, -62, 210, 52, {}],
    ['abandoned_apt_rubble_06', -560, -70, 180, 26, {}],
    ['juju_grandma_papers_01c_al1', -520, -98, 46, 16, {}],
    ['juju_grandma_papers_01c_al1', -800, -60, 40, 14, { flip: true }],
  ],
  rug: [650, 1042],
  closed: [-1555, -905],
});

/* ------------------------------------------------------------------ */
/* The other four towers, from round 5's Tribute Blog panoramas        */
/* ------------------------------------------------------------------ */

/** Picture x (a 1280 px copy of a 3110 px floor) to world x. */
export const towerPictureX = (px) => Math.round(px * 3110 / 1280 - 1555);
const wx = towerPictureX;

/**
 * Twelve bays on the shared plan from a list of words, left to right:
 * 'door', 'door:<planks>' ('cross', 'three', 'two', 'one'), 'door:<planks>:hole',
 * 'window' (boarded from behind), 'window:open', 'window:open:<planks>',
 * 'wall', 'hole', 'torn' (the plaster gone, planks nailed across the opening)
 * and 'torn:room' (a room seen through it).
 */
export function towerBays(words) {
  if (words.length !== 12) throw new Error('twelve bays');
  return Object.freeze(words.map((w, i) => {
    const [kind, ...rest] = w.split(':');
    const opts = {};
    if (kind === 'door') {
      if (rest[0] && rest[0] !== 'none') opts.boards = rest[0];
      if (rest.includes('hole')) opts.hole = true;
    } else if (kind === 'window') {
      if (rest[0] === 'open') opts.open = true;
      if (rest[1]) opts.boards = rest[1];
    } else if (kind === 'torn' && rest[0] === 'room') opts.room = true;
    return Object.freeze([P[i < 6 ? i : i + 1], P[i < 6 ? i + 1 : i + 2], kind, opts]);
  }));
}

/** Props on the floor line: [sprite, picture x, base offset from the floor line (+ is nearer), w, h, options]. */
const at = (sprite, px, base, w, h, opts = {}) => [sprite, wx(px), base, w, h, opts];
/** Ivy hanging from the top of the wall at picture x. */
const ivy = (px, tall = 170, flip = false) => {
  // No larger than the game's sharp copy of the art allows (tools/deco-pipeline/sharp.py).
  const h = Math.min(tall, 184);
  return ['draping_plant_01b_al1', wx(px), WALL_TOP + h + 4, Math.min(Math.round(h * 1.2), 230), h, { abs: true, ...(flip ? { flip: true } : {}) }];
};
/** A plank leaning on the wall (or a post) at picture x. */
const lean = (px, h, r) => ['beam_wood_vertical_1', wx(px), 6, 30, h, { r }];
/** A plank lying on the floor. */
const plank = (px, base, w, r = 0) => ['walking_plank_straight', wx(px), base, w, 18, { r }];
/** A wooden post with its braces, in front of the walk line (Sabudana Drama, Hakusan Heaps). */
const post = (px) => ['wood_cover_middleplus', wx(px), 30, 120, 540, { front: true }];
/** A grey stone column in front (Egret Taun). */
const column = (px, front = true) => ['column_1', wx(px), front ? 34 : 0, front ? 70 : 54, front ? 520 : 400, front ? { front: true } : {}];
const crate = (px, base = 2, s = 1, opts = {}) => at('crate_1', px, base, Math.round(130 * s), Math.round(112 * s), opts);
const barrel = (px, base = 2, opts = {}) => at('barrel_1', px, base, 74, 94, opts);
const flora = (px) => at('mountain_flora_01c_al1', px, -2, 170, 52);

const PANORAMA = (post, tower, floor) => `Glitch Tribute Blog post ${post} (tagged ${tower}, plate ${floor}), Tumblr 1280 x 264 copy of a 3110 x 642 render, reference only`;

/**
 * Egret Taun Towers, floor 1 (post 41722396690): a bright hall overgrown with
 * ivy, its windows open to the sky. Left: doors with crossed (122) and two
 * planks (215, 365, 463), an open window (297), a window with two planks
 * across (547); right: windows with planks (735, 985), doors with three (812),
 * two (905), one plank (1062) and crossed planks (1155). Ivy curtains at every
 * pilaster, bushes at the wall's foot, moss on the flagstones, a dug patch
 * (330-470). Left out: the chicken and the crops in the patch (creatures and
 * a garden plot, not decos).
 */
export const EGRET_FLOOR_1 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(41722396690, 'Egret Taun Tower', 1),
  light: true,
  relative: true,
  bays: towerBays(['door:cross', 'door:two', 'window:open', 'door:two', 'door:two', 'window:open:two', 'window:open:two', 'door:three', 'door:two', 'window:open:two', 'door:one', 'door:cross']),
  props: [
    ...[25, 80, 170, 330, 405, 510, 690, 800, 940, 1100, 1180].map((px, i) => ivy(px, 150 + (i % 3) * 20, i % 2 === 1)),
    ...[165, 310, 360, 585, 690, 800, 1040, 1110].map(flora),
    at('patch_dirt_2a', 395, 40, 300, 50),
    at('bush_patch_1', 520, 70, 330, 40),
  ],
  rug: null,
  closed: null,
});

/**
 * Egret Taun Towers, floor 2 (post 41805000800): the walls either side of the
 * lift broken through into two garden rooms. Each has stone columns at its
 * front (picture x 178 and 478; 728 and 1027), a white beam across them, three
 * tall windows open to the sky and two raised planter beds (212-462,
 * 768-1015). The only doors: two planks at the far left (122), one at the
 * far right (1155). A pot of brushes (197) and a stack of sticks and hay
 * (560) are left out (no CC0 match).
 */
export const EGRET_FLOOR_2 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(41805000800, 'Egret Taun Tower', 2),
  light: true,
  relative: true,
  bays: towerBays(['door:two', 'wall', 'window:open', 'window:open', 'window:open', 'wall', 'wall', 'window:open', 'window:open', 'window:open', 'wall', 'door:one']),
  props: [
    column(178), column(478), column(728), column(1027),
    column(212, false), column(512, false), column(762, false), column(1060, false),
    ['beam_white_1', wx(328), WALL_TOP + 100, 760, 28, { abs: true }],
    ['beam_white_1', wx(878), WALL_TOP + 100, 760, 28, { abs: true }],
    at('firebog_planter_box_3x4', 285, 36, 330, 70),
    at('firebog_planter_box_3x4', 400, 40, 300, 66),
    at('firebog_planter_box_3x4', 838, 40, 330, 70),
    at('firebog_planter_box_3x4', 952, 36, 310, 68),
    ...[25, 70, 400, 590, 1100, 1180, 1240].map((px, i) => ivy(px, 160 + (i % 2) * 20, i % 2 === 0)),
    ...[300, 420, 950, 1080].map(flora),
  ],
  rug: null,
  closed: null,
});

/**
 * Egret Taun Towers, floor 3 (post 41813899873): stone columns in front at
 * picture x 262, 432, 848 and 1015, with ivy hanging thick between each pair
 * over a door and a window (375, 297; 870, 940). Doors with two planks (122,
 * 215, 1062), one plank (1155); a window with two planks (547) and open ones
 * (735). Two dug patches with a sign (145, 905).
 */
export const EGRET_FLOOR_3 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(41813899873, 'Egret Taun Tower', 3),
  light: true,
  relative: true,
  bays: towerBays(['door:two', 'door:two', 'window:open', 'door:cross', 'window:open', 'window:open:two', 'window:open', 'door', 'window:open', 'wall', 'door:two', 'door:one']),
  props: [
    column(262), column(432), column(848), column(1015),
    ...[290, 320, 350, 380, 405, 865, 895, 925, 960, 990].map((px, i) => ivy(px, 210 + (i % 3) * 25, i % 2 === 0)),
    ...[25, 75, 165, 520, 700, 1110, 1180].map((px, i) => ivy(px, 160, i % 2 === 1)),
    at('patch_dirt_2a', 145, 30, 240, 44),
    at('groddle_sign_blank_plank', 160, -4, 40, 50),
    at('patch_dirt_2a', 905, 30, 200, 40),
    at('groddle_sign_blank_plank', 925, -4, 40, 50),
    ...[210, 410, 750, 1050, 1150].map(flora),
  ],
  rug: null,
  closed: null,
});

/**
 * Sabudana Drama Towers, floor 1 (post 40948529639): braced wooden posts in
 * front (picture x 248, 418, 510; 768, 860, 1025) under a beam with ivy on
 * it; a shelf on the left wall (100); a stack of crates (165-215) before a
 * door; a window with planks in an X (297); a vase on a stool (345); a door
 * with two planks (465); a hole in the floor (300); planks leaning on the
 * posts (255, 395, 405, 575); the rug from 445 to 812. Right: a window with
 * planks (735), doors with crossed planks (812, 905), a boarded window (985),
 * and at the end a frame with planks in an X over a room with a table and a
 * chair (1155); a barrel (848) and broken flagstones (1110-1230).
 */
export const SABUDANA_FLOOR_1 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(40948529639, 'Sabudana Drama Towers', 1),
  light: true,
  relative: true,
  bays: towerBays(['wall', 'door', 'window:open:cross', 'wall', 'door:two', 'window', 'window:open:three', 'door:cross', 'door:cross', 'window', 'wall', 'torn:room']),
  props: [
    ...[248, 418, 510, 768, 860, 1025].map(post),
    ['beam_wood_1', wx(380), WALL_TOP + 90, 1100, 24, { abs: true }],
    ['beam_wood_1', wx(900), WALL_TOP + 90, 1100, 24, { abs: true }],
    ...[330, 385, 1030].map((px, i) => ivy(px, 90, i % 2 === 1)),
    ['wall_shelf1', wx(100), WALL_BASE - 160, 220, 30, { abs: true }],
    crate(165, -2, 1.1), crate(160, -112, 1), crate(222, 8, 0.95),
    at('vase_1', 345, -40, 50, 92), at('deco_stool_wooden_ghtest', 345, 0, 60, 50),
    at('platform_crack_1', 300, 56, 190, 44),
    lean(255, 300, 12), lean(395, 320, -16), lean(405, 280, -8), lean(575, 260, 14),
    barrel(848, 30),
    at('abandoned_apt_rubble_01', 1150, 40, 128, 40), at('abandoned_apt_rubble_04', 1210, 66, 86, 30),
  ],
  rug: [wx(628), 892],
  closed: null,
});

/**
 * Sabudana Drama Towers, floor 2 (post 40956964858): the plaster torn off the
 * wall in two long runs (picture x 80-325 and 770-1015), the wood behind it
 * broken open to the sky and nailed across with planks. Doors: one hidden by
 * crates (375), crossed planks (465), two planks (1062, 1155). Windows with
 * planks (547, 735); a vase on a crate (550); crates (340-390, 1045); planks
 * leaning at both ends and lying on the floor.
 */
export const SABUDANA_FLOOR_2 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(40956964858, 'Sabudana Drama Towers', 2),
  light: true,
  relative: true,
  bays: towerBays(['torn', 'torn', 'torn', 'door', 'door:cross', 'window:open:two', 'window:open:two', 'torn', 'torn', 'torn', 'door:two', 'door:two']),
  props: [
    crate(340, -2), crate(392, 2), crate(352, -108, 0.9),
    crate(550, 0, 0.75), at('vase_1', 552, -84, 40, 74),
    crate(1045, 4, 1.15),
    lean(30, 380, 14), lean(60, 340, 6), lean(1230, 380, -14), lean(1215, 300, -4),
    plank(190, 40, 520, -2), plank(260, 70, 480, 1), plank(850, 70, 520, -1), plank(900, 40, 380, 2),
  ],
  rug: null,
  closed: null,
});

/**
 * Sabudana Drama Towers, floor 3 (post 40965287278): the plaster torn off
 * from picture x 80 to 440, the wood behind broken open with X frames, and
 * again from 840 to 1015. A stack of three crates (470-525), crates and a
 * barrel at the right end (1040-1160); a window with planks (547), a boarded
 * window (735); doors with crossed planks (812) and two planks (1062, 1155).
 */
export const SABUDANA_FLOOR_3 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(40965287278, 'Sabudana Drama Tower', 3),
  light: true,
  relative: true,
  bays: towerBays(['torn', 'torn', 'torn', 'torn', 'wall', 'window:open:two', 'window', 'door:cross', 'torn', 'torn', 'door:two', 'door:two']),
  props: [
    crate(30, 30), crate(470, -2), crate(470, -112, 0.95), crate(472, -218, 0.9), crate(525, 8, 1.05),
    crate(1040, 4), crate(1095, 0, 0.9), crate(1160, 10, 1.1), barrel(1118, 30),
    lean(50, 340, 8), lean(1220, 380, -12), lean(1240, 300, -4),
    plank(180, 40, 500, 1), plank(250, 66, 520, -1), plank(850, 70, 560, 1), plank(930, 44, 400, -2),
  ],
  rug: null,
  closed: null,
});

/**
 * Sabudana Drama Towers, floor 4 (post 40973309005): braced posts in front
 * (picture x 245, 510, 765), ivy along the beam; seven doors (122 behind
 * crates, 215 two planks, 465 one, 812 three, 905 two, 1062 crossed, 1155 two
 * planks), windows with a lattice of planks (297), open (547) and with planks
 * (735); the wall torn open at 950-1020; barrels (340-400), crates (105, 190,
 * 1235), the rug from 445 to 830 and planks leaning (410, 575, 820).
 */
export const SABUDANA_FLOOR_4 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(40973309005, 'Sabudana Drama Tower', 4),
  light: true,
  relative: true,
  bays: towerBays(['door', 'door:two', 'window:open:three', 'wall', 'door:one', 'window:open', 'window:open:two', 'door:three', 'door:two', 'torn', 'door:cross', 'door:two']),
  props: [
    ...[245, 510, 765].map(post),
    ['beam_wood_1', wx(380), WALL_TOP + 90, 1100, 24, { abs: true }],
    ['beam_wood_1', wx(760), WALL_TOP + 90, 700, 24, { abs: true }],
    ...[270, 460, 650].map((px, i) => ivy(px, 90, i % 2 === 1)),
    crate(100, -2), crate(102, -110, 0.95), crate(190, 60), crate(1235, 2), crate(1236, -108, 0.9),
    barrel(345, 6), barrel(372, 0), barrel(395, 8), barrel(372, -90),
    lean(410, 330, -14), lean(575, 260, 12), ['beam_wood_vertical_1', wx(820), 30, 34, 470, { r: -28, front: true }],
    plank(980, 50, 380, -4),
  ],
  rug: [wx(637), 930],
  closed: null,
});

/**
 * Hakusan Heaps Towers, floor 1 (post 43506277838): grey flagstones showing
 * through the planks on the left; seven boarded doors (122 three planks, 215
 * two, 375 one with a crate and a leaning plank, 465 two, 812 and 905
 * crossed, 1062 one with crates), windows boarded from behind (297, 547) and
 * with planks (735, 985), the last bay a lattice of planks (1155); planks
 * leaning at the left end and against the lift (410, 555); planks on the
 * floor (850-1200). Left out: the chicken and butterflies, and a hole in the
 * ceiling.
 */
export const HAKUSAN_FLOOR_1 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(43506277838, 'Hakusan Heaps Tower', 1),
  light: true,
  relative: true,
  bays: towerBays(['door:three', 'door:two', 'window', 'door:one', 'door:two', 'window', 'window:open:two', 'door:cross', 'door:cross', 'window:open:two', 'door:one', 'torn']),
  props: [
    at('abandoned_apt_rubble_06', 160, 50, 220, 28), at('abandoned_apt_rubble_06', 330, 60, 220, 28, { flip: true }), at('abandoned_apt_rubble_06', 750, 46, 200, 26),
    crate(390, 2, 0.8), crate(1070, 0), crate(1075, -110, 0.9), crate(1160, 60, 0.7),
    lean(25, 360, 10), lean(60, 320, 4), lean(410, 300, -18), lean(555, 330, 16),
    plank(900, 70, 520, -6), plank(1080, 50, 560, -10), plank(1120, 80, 380, 3),
  ],
  rug: null,
  closed: null,
});

/**
 * Hakusan Heaps Towers, floor 2 (post 43514874358): braced posts in front
 * (picture x 460, 765, 820, 1160); at the left end the wall torn open onto a
 * room with a table and chairs (80-260); doors with one plank (375), crossed
 * planks (465, 812, 1062, 1155); a window with planks (297) and two boarded
 * from behind (547, 735); the wall torn open again at 860-1000 around a
 * boarded window; crates (528, 1000-1100, 1220) and a barrel (1133); planks
 * leaning (30-100, 700) and lying on the floor; a patch of grey stone (900).
 */
export const HAKUSAN_FLOOR_2 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(43514874358, 'Hakusan Heaps Tower', 2),
  light: true,
  relative: true,
  bays: towerBays(['torn:room', 'torn:room', 'window:open:two', 'door:one', 'door:cross', 'window', 'window', 'door:cross', 'torn', 'torn', 'door:cross', 'door:cross']),
  props: [
    ...[460, 765, 820, 1160].map(post),
    crate(528, 6), crate(1000, 2), crate(1045, 40, 0.8), crate(1095, 20, 1.1), crate(1220, 30), barrel(1133, 30),
    lean(30, 380, 12), lean(60, 340, 4), lean(100, 300, 18), lean(700, 320, -14),
    plank(200, 50, 520, -2), plank(300, 74, 460, 1), plank(660, 70, 400, -1),
    at('abandoned_apt_rubble_06', 900, 50, 220, 28),
  ],
  rug: null,
  closed: null,
});

/**
 * Gregarious Towers, floor 1 (post 53465948360): the plaster peeling off
 * every bay down to the bricks; windows open to the sky (297, 547, 735, 985);
 * doors with crossed planks (122), one plank (215, 465, 812, 905), two
 * (375, 1062) and none (1155); barrels and crates along the walls (30-140,
 * 520-570, 700-810, 950-1010, 1120-1240).
 */
export const GREGARIOUS_FLOOR_1 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(53465948360, 'Gregarious Towers', 1),
  light: true,
  relative: true,
  bricks: true,
  bays: towerBays(['door:cross', 'door:one', 'window:open', 'door:two', 'door:one', 'window:open', 'window:open', 'door:one', 'door:one', 'window:open', 'door:two', 'door']),
  props: [
    barrel(30, 50), barrel(62, 46), crate(95, 2), crate(142, 4),
    barrel(535, 0), barrel(567, 2),
    barrel(722, 0), crate(740, 6), crate(765, -96, 0.9), crate(770, 8), barrel(808, 4),
    crate(970, 6), barrel(1010, 4),
    barrel(1135, 0), barrel(1165, 2), crate(1150, 56, 1.15), crate(1210, 60, 1.1), crate(1212, -64, 0.9),
  ],
  rug: null,
  closed: null,
});

/**
 * Gregarious Towers, floor 2 (post 53473055375): bricks under peeling plaster
 * again; windows open to the sky (297 with a plank, 547, 735, 985); doors with
 * one plank (215, 465, 812), crossed planks (1062) and none (122, 375, 905,
 * 1155); crates and barrels (50-115, 360-430, 515-555, 750, 935, 1125-1225).
 */
export const GREGARIOUS_FLOOR_2 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(53473055375, 'Gregarious Towers', 2),
  light: true,
  relative: true,
  bricks: true,
  bays: towerBays(['door', 'door:one', 'window:open:one', 'door', 'door:one', 'window:open', 'window:open', 'door:one', 'door', 'window:open', 'door:cross', 'door']),
  props: [
    crate(50, 50, 1.2), crate(48, -78, 1.05), barrel(85, 2), barrel(115, 4),
    crate(372, 2), crate(380, -108, 0.95), crate(425, 6, 0.9),
    barrel(515, 4), barrel(550, -2), crate(555, 6),
    barrel(750, 2), crate(935, 4),
    crate(1125, 6), crate(1165, 2), crate(1165, -108, 0.95), crate(1225, 60, 1.15),
  ],
  rug: null,
  closed: null,
});

/**
 * Gregarious Towers, floor 3 (post 53480119891): bricks under peeling
 * plaster; at the left end a row of filing cabinets (picture x 80-140), one
 * lying on its side (245), a blue rug and loose papers; windows open (547,
 * 735, 985) and one with planks (297); doors with one plank (375, 465, 812,
 * 1155), crossed planks (905) and none (122, 215, 1062); barrels along the
 * walls (395-420, 565, 765-830, 890, 1025-1120) and crates (50, 495, 1165).
 */
export const GREGARIOUS_FLOOR_3 = Object.freeze({
  status: 'panorama',
  source: PANORAMA(53480119891, 'Gregarious Towers', 3),
  light: true,
  relative: true,
  bricks: true,
  bays: towerBays(['door', 'door', 'window:open:two', 'door:one', 'door:one', 'window:open', 'window:open', 'door:one', 'door:cross', 'window:open', 'door', 'door:one']),
  props: [
    at('cubicle_cabinet_stack', 82, -2, 66, 116), at('cubicle_cabinet_stack', 112, -2, 66, 116), at('cubicle_cabinet_stack', 142, -2, 66, 116),
    at('cubicle_cabinet_stack', 245, -2, 104, 56, { r: 90 }),
    at('rug_blue', 140, 60, 220, 44),
    at('juju_grandma_papers_01c_al1', 290, 40, 44, 16), at('juju_grandma_papers_01c_al1', 230, 70, 40, 14, { flip: true }),
    crate(50, 60, 1.15),
    barrel(395, 2), barrel(420, 6), crate(495, 50, 1.1), crate(495, -62, 0.9), barrel(565, 2),
    barrel(765, 2), barrel(795, 6), barrel(830, 0), barrel(890, 4),
    barrel(1025, 2), barrel(1085, 4), barrel(1120, 0), crate(1165, 6, 1.1),
  ],
  rug: null,
  closed: null,
});

/** Floors laid out from a picture, by GSJS tsid: all fifteen. */
export const PANORAMA_LAYOUTS = Object.freeze({
  LDOBRJIEU2V2Q2G: HAUKI_FLOOR_1, LDOBRKREU2V2F9B: HAUKI_FLOOR_2, LHF9DOUO7K03OUA: HAUKI_FLOOR_3,
  LUVMHFM3U2V2T72: EGRET_FLOOR_1, LUVMHGV3U2V2J7M: EGRET_FLOOR_2, LUVMHH74U2V245O: EGRET_FLOOR_3,
  LNV6EBBIS2V2JB8: SABUDANA_FLOOR_1, LNV6ECKIS2V26JU: SABUDANA_FLOOR_2, LNV6EDVIS2V2SFD: SABUDANA_FLOOR_3, LNV6EEAJS2V26B2: SABUDANA_FLOOR_4,
  LA9TBQS1V2V2G34: HAKUSAN_FLOOR_1, LA9TBR62V2V23E2: HAKUSAN_FLOOR_2,
  LDOBRLULU2V24DS: GREGARIOUS_FLOOR_1, LDOBRNDMU2V2Q34: GREGARIOUS_FLOOR_2, LDOBROOMU2V2GCK: GREGARIOUS_FLOOR_3,
});

/**
 * The default hall, for a floor without a picture (since round 5 every floor
 * has one; this stays as the fallback a new floor starts from): Hauki Seeks
 * Manor's twelve bays, six each side of the lift, with eight doors
 * (apartment_8units) and the windows where Hauki Seeks Manor's floors have
 * theirs (Snowed In's hall too).
 */
const DEFAULT_KINDS = ['door', 'door', 'window', 'door', 'door', 'window', 'window', 'door', 'door', 'window', 'door', 'door'];
const DEFAULT_BAYS = Object.freeze(DEFAULT_KINDS.map((kind, i) => [P[i < 6 ? i : i + 1], P[i < 6 ? i + 1 : i + 2], kind]));
const BOARDS = ['cross', 'three', 'two', 'one', 'none'];

/** A floor's default layout: the hall above, its doors boarded and its leftovers placed per floor. */
export function defaultTowerLayout(floor) {
  const seed = seedOf(floor.source);
  let k = 0;
  const r = () => rnd(seed + 17 * (k += 1));
  const bays = DEFAULT_BAYS.map(([a, b, kind]) => (kind === 'door' ? [a, b, kind, { boards: BOARDS[Math.floor(r() * BOARDS.length)] }] : [a, b, kind]));
  // One window per side gives way to a hole in the wall on about half the floors.
  for (const side of [[2, 5], [6, 9]]) {
    if (r() < 0.5) {
      const i = side[Math.floor(r() * 2)];
      bays[i] = [bays[i][0], bays[i][1], 'hole'];
    }
  }
  const props = [];
  // A crate (and on some floors a chair on it) at one end, papers and rubble along the walls.
  const end = r() < 0.5 ? -1 : 1;
  const crateX = end * Math.round(1250 + r() * 60);
  props.push(['crate_1', crateX, floor.arrive.y + 4, 160, 136, {}]);
  if (r() < 0.6) props.push(['deco_chair_wooden_ghtest', crateX + end * 10, floor.arrive.y + 4 - 132, 66, 88, {}]);
  for (let i = 0; i < 4; i += 1) {
    const x = -1400 + (i + 0.3 + r() * 0.4) * 700;
    if (Math.abs(x) < 260) continue;
    props.push([i % 2 ? 'juju_grandma_papers_01c_al1' : 'abandoned_apt_rubble_06', x, floor.arrive.y + 46, i % 2 ? 44 : 170, i % 2 ? 16 : 24, { flip: r() < 0.5 }]);
  }
  const rug = r() < 0.6 ? [Math.round((r() < 0.5 ? -1 : 1) * (600 + r() * 200)), 1000] : null;
  return Object.freeze({
    status: 'default',
    source: TOWER_DEFAULT_NOTE,
    bays,
    props,
    rug,
    closed: null,
  });
}

/** The layout a floor is built from: its picture's, or the default. */
export const towerFloorLayout = (floor) => PANORAMA_LAYOUTS[floor.source] || defaultTowerLayout(floor);

/* ------------------------------------------------------------------ */
/* Decos                                                               */
/* ------------------------------------------------------------------ */

function shellDecos(layout) {
  const out = [];
  // A lit floor has its ceiling (the hall kit's band); a dark one shows the street's dark gradient.
  if (layout.light) {
    for (const x of [-1000, 300, 1250]) out.push(deco('apartment_filler', x, -548, 1400, 110, 2));
    for (const x of [-1000, -100, 800, 1400]) out.push(deco('ceiling_tan_ghtest', x, -516, 1500, 64, 40));
  }
  // A beam runs along the top of the wall.
  for (const x of [-1100, 0, 1100]) out.push(deco('apartment_filler', x, -522, 1200, 40, 39));
  for (const x of [-780, 780]) out.push(deco('apartment_filler', x, 4, 1620, 200, 1));
  for (const [i, x] of [-1160, -390, 390, 1160].entries()) out.push(deco('apartment_hall_floor_piece_1', x, -30, 1130, 150, 3 + i, i % 2 ? { flip: true } : {}));
  for (const x of [-800, 760]) out.push(deco('apartment_filler', x, 4, 1620, 60, 6));
  out.push(deco('apartment_xsection_top_1', 0, -14, 3200, 36, 7));
  // End walls in perspective, and a plain bay behind the lift.
  out.push(deco('apartment_hall_wall_side', -1462, -40, 200, 610, 9));
  out.push(deco('apartment_hall_wall_side', 1468, -40, 200, 610, 9, { flip: true }));
  out.push(deco('apartment_hall_wall_piece_2', TOWER_LIFT.x, WALL_BASE, 330, WALL_BASE - WALL_TOP, 9));
  return out;
}

/** Planks nailed over a door, centred on (x, the door's middle). */
function boardDecos(x, kind, z, flip) {
  const y = WALL_BASE - 70;
  const s = flip ? -1 : 1;
  if (kind === 'cross') {
    return [
      deco('nailed_board_single', x, y - 4, 150, 26, z, { r: s * 18 }),
      deco('nailed_board_single', x + s * 6, y + 26, 150, 26, z + 1, { r: s * -9 }),
    ];
  }
  if (kind === 'three') return [0, 1, 2].map((i) => deco('nailed_board_single', x + (i - 1) * 4, y - 40 + i * 44, 140, 26, z + i, { r: (i - 1) * 2 }));
  if (kind === 'two') return [0, 1].map((i) => deco('nailed_board_single', x + (i ? -3 : 3), y - 30 + i * 76, 146, 26, z + i, { r: i ? 2 : -3 }));
  if (kind === 'one') return [deco('nailed_board_single', x + s * 8, y + 4, 150, 28, z, { r: s * -24 })];
  return [];
}

/** Planks nailed across an open window's arch (seen through it, behind the wall piece). */
function windowBoardDecos(x, kind, z) {
  const y = WALL_BASE - 170;
  if (kind === 'one') return [deco('nailed_board_single', x, y - 10, 92, 18, z, { r: -12 })];
  if (kind === 'two') return [deco('nailed_board_single', x, y - 40, 92, 18, z, { r: 6 }), deco('nailed_board_single', x, y + 14, 92, 18, z, { r: -4 })];
  if (kind === 'three') return [-60, -14, 32].map((dy, k) => deco('nailed_board_single', x, y + dy, 92, 18, z, { r: (k - 1) * 5 }));
  if (kind === 'cross') return [deco('nailed_board_single', x, y - 20, 110, 18, z, { r: 30 }), deco('nailed_board_single', x, y - 20, 110, 18, z, { r: -30 })];
  return [];
}

/** A bay whose plaster is gone: its wood frame, the opening behind it, planks nailed across, a room seen through it. */
function tornDecos(x, w, h, i, opts, layout) {
  const out = [];
  const seed = 400 + i * 31 + (layout.bays.length || 0);
  if (opts.room) {
    // A room behind: its back wall further off, a table and a chair.
    out.push(deco('apartment_hall_wall_piece_2', x, WALL_BASE - 30, w * 0.8, h * 0.72, 4));
    out.push(deco('deco_table_wooden_ghtest', x - 20, WALL_BASE - 26, 110, 44, 5));
    out.push(deco('deco_chair_wooden_ghtest', x + 50, WALL_BASE - 24, 44, 60, 5));
  }
  out.push(deco('apartment_hall_wood_border', x, WALL_BASE, w, h, 10, { id: `torn_${i + 1}` }));
  for (let k = 0; k < 3; k += 1) {
    const y = WALL_BASE - 60 - k * 95 - rnd(seed + k) * 30;
    out.push(deco('nailed_board_single', x + (rnd(seed + 7 + k) - 0.5) * 20, y, Math.min(150, w - 10), 24, 46 + i, { r: (rnd(seed + 13 + k) - 0.5) * 30 }));
  }
  if (opts.room) out.push(deco('beam_wood_diagonal_1', x, WALL_BASE - 10, Math.min(130, w - 30), 148, 47 + i));
  // Plaster left at the foot of the opening.
  out.push(deco('partment_brick_wall_crack_6', x + (i % 2 ? -1 : 1) * (w / 2 - 50), WALL_BASE - 4, 90, 36, 11, i % 2 ? {} : { flip: true }));
  return out;
}

/** A bay whose plaster has peeled to the bricks: two strips of brick, the bay's wood frame, plaster left in patches. */
function brickDecos(x, w, h, i, z) {
  const seed = 900 + i * 17;
  const out = [];
  const half = (w - 20) / 2;
  for (const dx of [-half / 2, half / 2]) out.push(deco('apartment_brick_wall', x + dx, WALL_BASE, half + 4, h, z));
  out.push(deco('apartment_hall_wood_border', x, WALL_BASE, w, h, z));
  for (let k = 0; k < 2; k += 1) {
    const big = rnd(seed + k) < 0.5;
    out.push(deco(big ? 'partment_brick_wall_crack_2' : 'partment_brick_wall_crack_6', x + (rnd(seed + 3 + k) - 0.5) * (w - 90), WALL_TOP + 120 + k * 120 + rnd(seed + 5 + k) * 40, big ? 110 : 120, big ? 120 : 48, z, rnd(seed + 9 + k) < 0.5 ? { flip: true } : {}));
  }
  return out;
}

function bayDecos(layout) {
  const out = [];
  let z = 10;
  const h = WALL_BASE - WALL_TOP;
  for (const [i, [a, b, kind, opts = {}]] of layout.bays.entries()) {
    const x = Math.round((a + b) / 2);
    const w = b - a + 14;
    const flip = i % 2 === 1;
    if (kind === 'window') {
      // Boarded from behind (the door planks show through the arch), or open to the sky, maybe with planks nailed across.
      if (!opts.open) out.push(deco('door_asset_abandoned_apt_1', x + 7, WALL_BASE - 94, 96, 176, 8, { id: `shutter_${i + 1}` }));
      else out.push(...windowBoardDecos(x + 7, opts.boards, 9));
      // A wide bay: a plain piece behind a window piece no wider than its sharp copy allows.
      if (w > WINDOW_MAX_W) out.push(deco('apartment_hall_wall_piece_2', x, WALL_BASE, w, h, z++));
      out.push(deco('apartment_hall_wall_piece_window', x, WALL_BASE, Math.min(w, WINDOW_MAX_W), h, z++, { id: `window_${i + 1}` }));
      continue;
    }
    if (kind === 'torn') {
      out.push(...tornDecos(x, w, h, i, opts, layout));
      z += 1;
      continue;
    }
    if (layout.bricks) out.push(...brickDecos(x, w, h, i, z++));
    else out.push(deco('apartment_hall_wall_piece_2', x, WALL_BASE, w, h, z++, flip ? { flip: true } : {}));
    if (kind === 'door') {
      out.push(deco('door_asset_abandoned_apt_1', x, WALL_BASE + 2, 104, 190, 50 + i, { id: `hall_door_${i + 1}`, ...(flip ? { flip: true } : {}) }));
      out.push(...boardDecos(x, opts.boards || 'none', 70 + i * 3, flip));
      if (opts.hole) out.push(deco('wall_crack_1', x + (flip ? -18 : 18), WALL_BASE - 210, Math.min(170, w - 40), 80, 45 + i, { id: `hole_${i + 1}`, ...(flip ? { flip: true } : {}) }));
    } else if (kind === 'hole') {
      out.push(deco('wall_crack_1', x + (flip ? 10 : -10), WALL_BASE - 60, Math.min(190, w - 30), 96, 45 + i, { id: `hole_${i + 1}`, ...(flip ? { flip: true } : {}) }));
    } else if (kind === 'wall' && opts.art === 'bars') {
      for (const dx of [-60, -20, 30, 70]) out.push(deco('penaltybox_bar_2', x + dx, WALL_BASE + 120, 18, 440, 45 + i));
    } else if (kind === 'wall' && opts.art) {
      out.push(deco(opts.art, x, opts.base ?? WALL_BASE - 40, opts.w ?? 96, opts.h ?? 136, 45 + i, { id: `wall_art_${i + 1}` }));
    }
  }
  return out;
}

function liftDecos(floor) {
  const L = TOWER_LIFT;
  const base = floor.arrive.y - L.art;
  return [
    deco('apartment_hall_elevator', L.x, base, L.tower.w, L.tower.h, 60, { id: 'lift_tower' }),
    deco('signpost_asset_elevator', L.x, base, L.w, L.h, 61, { id: 'lift_door' }),
  ];
}

/** The tower's own leftovers along the walls (each from its lobby and basement art). */
function accentDecos(tower, floor, layout) {
  const out = [];
  const seed = seedOf(floor.source) + 101;
  let z = 90;
  // Every bay, the lift, and the hall's ends (a closed-off end too).
  const first = Math.min(...layout.bays.map(([a]) => a));
  const last = Math.max(...layout.bays.map(([, b]) => b));
  const spans = [...layout.bays.map(([a, b]) => [a, b]), [-151, 141], [Math.max(TOWER_FLOOR_BOUNDS.l + 90, layout.closed ? layout.closed[0] + 90 : first - 200), first], [last, TOWER_FLOOR_BOUNDS.r - 90]].filter(([a, b]) => b - a > 60);
  for (const [i, [a, b]] of spans.entries()) {
    const n = tower.style === 'drips' ? 3 : 1;
    for (let j = 0; j < n; j += 1) {
      const t = rnd(seed + i * 7 + j);
      const x = a + (b - a) * ((j + 0.2 + 0.6 * t) / n);
      const u = rnd(seed + i * 13 + j * 3);
      if (tower.style === 'drips') {
        const dh = 50 + u * 170;
        out.push(deco(u < 0.5 ? 'cave_icicle_1b_z1' : 'cave_icicle_1c_z1', x, WALL_TOP + 6 + dh, 50 + t * 70, dh, z++, u > 0.7 ? { flip: true } : {}));
      } else if (tower.style === 'moss' && u < 0.75) {
        const tall = u < 0.35;
        out.push(deco('treemoss_01a_et1', x, WALL_TOP + (tall ? 300 : 200), tall ? 80 : 60, tall ? 300 : 190, z++, t > 0.5 ? { flip: true } : {}));
      } else if (tower.style === 'vines' && u < 0.7) {
        out.push(deco(u < 0.3 ? 'liana_1' : 'liana_2', x, WALL_TOP + 210, u < 0.3 ? 150 : 60, 200, z++, t > 0.5 ? { flip: true } : {}));
      } else if (tower.style === 'cracks' && u < 0.6 && !layout.bricks) {
        out.push(deco(u < 0.3 ? 'wall_crack_2' : 'crack_building_4', x, WALL_TOP + 150 + t * 120, u < 0.3 ? 74 : 62, u < 0.3 ? 148 : 82, z++, t > 0.5 ? { flip: true } : {}));
      } else if (tower.style === 'crates' && u < 0.3 && Math.abs(x) > 260) {
        out.push(deco(t < 0.5 ? 'crate_2' : 'barrel_1', x, floor.arrive.y - 2, t < 0.5 ? 120 : 76, t < 0.5 ? 102 : 96, z++));
      }
    }
  }
  if (tower.style === 'moss') {
    for (let i = 0; i < 5; i += 1) out.push(deco('heights_moss_2', -1300 + i * 650 + rnd(seed + i) * 120, floor.arrive.y + 2, 200, 40, z++));
  }
  if (tower.style === 'vines') {
    for (let i = 0; i < 4; i += 1) out.push(deco('jar4_empty', -1250 + i * 820 + rnd(seed + 40 + i) * 100, floor.arrive.y - 4, 34, 42, z++));
  }
  if (tower.style === 'crates' || tower.style === 'cracks') {
    // Bare bulbs on long cords from the ceiling (the Sabudana Drama and Gregarious basements' hanging_lightbulb).
    for (const x of [-1000, 520]) out.push(deco('hanging_lightbulb', x + rnd(seed + x) * 80, -350, 20, 176, z++));
  }
  return out;
}

function propDecos(layout, front, floorY) {
  const { l, t } = TOWER_FLOOR_BOUNDS;
  const out = [];
  let z = front ? 200 : 120;
  for (const [sprite, x, base, w, h, opts = {}] of layout.props) {
    if (Boolean(opts.front) !== front) continue;
    const extra = {};
    if (opts.flip) extra.flip = true;
    const y = layout.relative && !opts.abs ? floorY + base : base;
    const d = deco(sprite, x, y, w, h, opts.z ?? z++, extra);
    if (opts.r) d.r = opts.r;
    out.push(front ? { ...d, x: d.x - l, y: d.y - t } : d);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Street                                                              */
/* ------------------------------------------------------------------ */

/** Screen-space arrival in a floor (in front of the lift, on the floor line). */
export function towerFloorArrive(floor) {
  const { l, t } = TOWER_FLOOR_BOUNDS;
  return { x: floor.arrive.x - l, y: floor.arrive.y - t };
}

/**
 * Each floor's lift lists what its lobby's lift lists, in the same order
 * (tower.js gives every floor the same connects), with each floor's arrival.
 * The lobby's own row keeps its arrival from build-street-navigation.
 */
export function towerLiftConnects(lobbyConnects) {
  return (lobbyConnects || []).map((c) => {
    const f = towerFloorFor(c.tsid);
    const out = { tsid: c.tsid, label: c.label };
    if (c.hub_id) out.hub_id = c.hub_id;
    if (c.hidden) out.hidden = true;
    if (f) out.arrive = towerFloorArrive(f);
    else if (c.arrive) out.arrive = { ...c.arrive };
    return out;
  });
}

/**
 * A floor's street JSON. `lobby` is the lobby's street JSON (its lift's connects,
 * its music, art list and colour filter).
 */
export function towerFloorStreet(floor, lobby) {
  const tw = floor.tower;
  const B = TOWER_FLOOR_BOUNDS;
  const W = B.r - B.l;
  const H = B.b - B.t;
  const layout = towerFloorLayout(floor);
  const lobbyLift = (lobby.signposts || []).find((s) => (s.connects || []).some((c) => towerFloorFor(c.tsid)));
  if (!lobbyLift) throw new Error(`${lobby.label} has no lift`);
  const y = floor.arrive.y;
  const platforms = [
    // A closed-off end has no floor: you never stand in it.
    { id: 'plat_tower_floor', x1: layout.closed ? layout.closed[1] : B.l, y1: y, x2: B.r, y2: y, pc_perm: -1 },
    { id: 'plat_tower_ceiling', x1: B.l, y1: CEILING_Y, x2: B.r, y2: CEILING_Y, pc_perm: 1 },
  ];
  const barriers = layout.closed ? [{ id: 'wall_tower_closed', x: layout.closed[1], y: -640, h: 640, pc_perm: null }] : [];
  const lobbyFilter = (lobby.layers || []).find((l) => l.name === 'middleground')?.filters || null;
  const rug = layout.rug ? [deco('apartment_rug_red', layout.rug[0], y + 49, layout.rug[1], 76, 7, { id: 'rug' })] : [];
  const layers = [
    {
      id: 'middleground', name: 'middleground', z: 0, w: W, h: H,
      decos: [...shellDecos(layout), ...rug, ...bayDecos(layout), ...liftDecos(floor), ...accentDecos(tw, floor, layout), ...propDecos(layout, false, y)],
      ...(lobbyFilter ? { filters: { ...lobbyFilter } } : {}),
    },
    { id: 'T_tower_front', name: 'middleplus', z: 1, w: W, h: H, decos: propDecos(layout, true, y), ...(lobbyFilter ? { filters: { ...lobbyFilter } } : {}) },
  ];
  const signposts = [{
    id: TOWER_FLOOR_SIGNPOST,
    x: TOWER_LIFT.x,
    y,
    w: TOWER_LIFT.w,
    h: TOWER_LIFT.h,
    connects: towerLiftConnects(lobbyLift.connects),
  }];
  const doors = layout.bays.filter(([, , kind]) => kind === 'door').length;
  return {
    source: `${SOURCE_PREFIX}: ${floor.label} (${floor.source}, not in tinyspeck/glitch-locations); ${layout.status === 'panorama' ? `layout from ${layout.source}` : TOWER_DEFAULT_NOTE}; CC0 apartment hall decos`,
    reconstructed: true,
    tsid: floor.tsid,
    label: floor.label,
    hubId: tw.hub.hubId,
    hubName: tw.hub.hubName,
    swf_file: lobby.swf_file,
    bounds: { ...B },
    platforms,
    layers,
    signposts,
    doors: [],
    barriers,
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount: countDecos(layers),
      signpostCount: signposts.length,
      doorCount: 0,
      ladderCount: 0,
      barrierCount: barriers.length,
    },
    internalLabel: `Abandoned ${floor.label}`,
    musicFile: lobby.musicFile,
    noMap: true,
    // A lit floor's sky through its open windows; a dark one's dark above the hall, as in Hauki Seeks Manor's panoramas.
    gradient: layout.light ? { top: '8FB9E6', bottom: 'EEF4F6' } : { top: '0A0705', bottom: '2B2018' },
    ladders: [],
    why: {
      street: `${tw.label}'s lift (${tw.lobby}.xml, quarter ${tw.quarter}) names ${floor.label} (${floor.source}); no location XML survives.`,
      bounds: 'the tower basements\' 3110 x 642 (-1555..1555 x -642..0).',
      arrival: `the lobby lift's connect point ${floor.arrive.x},${floor.arrive.y}: just right of the lift door, on the floor line.`,
      lift: 'one signpost listing the lobby lift\'s connects in its order (locations/tower.js copies one connects list to every floor).',
      // The layout's status first: 'panorama: <its picture>' or 'default layout, awaiting a panorama: ...'.
      layout: layout.status === 'panorama' ? `panorama: ${layout.source}` : `${TOWER_DEFAULT_NOTE}: Hauki Seeks Manor's twelve bays with ${TOWER_DEFAULT_DOORS} boarded doors (inc_data_pols_prod.js apartment_8units) and four windows.`,
      hallDoors: `${doors} (${layout.status === 'panorama' ? 'as the picture shows' : 'apartment_8units'}).`,
      notBuilt: 'The hall doors lead nowhere (no apartment behind them survives).',
    },
  };
}

/** The floor's row in assets/streets/index.json. */
export function towerFloorIndexEntry(street) {
  return {
    label: street.label,
    file: `assets/streets/${street.tsid}.json`,
    hubId: street.hubId,
    hubName: street.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
    internalLabel: street.internalLabel,
  };
}

/** The ecology row: an empty room indoors, like the lobbies. */
export function towerFloorEcology(tsid) {
  const f = towerFloorFor(tsid);
  if (!f) return null;
  return { label: f.label, sourceTsid: f.source, counts: {}, interior: true, interiorWhy: 'an apartment hall indoors (its lobby is one)', quoins: 0, reconstructed: true };
}
