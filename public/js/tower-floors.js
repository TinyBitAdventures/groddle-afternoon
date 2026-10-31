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
 *   wall bays (HAUKI_PILASTERS), the lift at the centre. Every other floor is
 *   a default layout on that plan, marked so in its JSON (why.layout starts
 *   'default layout, awaiting a panorama'), awaiting a panorama.
 * - The size: the towers' archived basements are 3110 x 642 (-1555..1555),
 *   and the three pictures have the same shape, so every floor is that size.
 *
 * Art: Tiny Speck's CC0 apartment hall kit already in assets/decos/groddle
 * (apartment_hall_wall_piece_2 / _window / _wall_side / _elevator /
 * _floor_piece_1, apartment_filler,
 * apartment_xsection_top_1, signpost_asset_elevator, door_asset_abandoned_apt_1,
 * nailed_board_single, apartment_rug_red), and each tower's own accents from its
 * archived lobby and basement (drips at Hauki Seeks, tree moss at Egret Taun,
 * crates and barrels at Sabudana Drama, lianas at Hakusan Heaps, cracked walls
 * at Gregarious). Each floor's layer takes its lobby's colour filter.
 *
 * Re-laying a floor from a panorama (the how-to)
 * 1. Save the picture under research (reference only) with a source note.
 * 2. Scale: world x = picture x * 3110 / picture width - 1555 (a 1280 px
 *    Tumblr copy: x * 2.4297 - 1555); world y = picture y * 642 / picture
 *    height - 642. The lift's door should land near x 0 and the arrival
 *    point (the lobby XML's connect x) just right of it.
 * 3. Write a layout like HAUKI_FLOOR_3: `bays` are the wall bays between the
 *    wood pilasters, left to right, as [left x, right x, kind, options]
 *    (kind 'door', 'window', 'wall' or 'hole'; a door's `boards` is 'cross',
 *    'three', 'two', 'one' or 'none' and `hole: true` breaks the wall over
 *    it; a 'wall' may carry `art` drawn on it); `props`
 *    are free decos [sprite, x, base y, w, h, options]; `rug` is [centre x,
 *    width]; `closed` walls off a part of the hall players never walked in.
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

/** Floors laid out from a picture, by GSJS tsid. */
export const PANORAMA_LAYOUTS = Object.freeze({ LDOBRJIEU2V2Q2G: HAUKI_FLOOR_1, LDOBRKREU2V2F9B: HAUKI_FLOOR_2, LHF9DOUO7K03OUA: HAUKI_FLOOR_3 });

/** The layout a floor is built from (its picture's), or null: a floor without one is not built yet. */
export const towerFloorLayout = (floor) => PANORAMA_LAYOUTS[floor.source] || null;

/* ------------------------------------------------------------------ */
/* Decos                                                               */
/* ------------------------------------------------------------------ */

function shellDecos() {
  const out = [];
  // The ceiling is dark (the street's gradient); a beam runs along the top of the wall.
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

function bayDecos(layout) {
  const out = [];
  let z = 10;
  const h = WALL_BASE - WALL_TOP;
  for (const [i, [a, b, kind, opts = {}]] of layout.bays.entries()) {
    const x = Math.round((a + b) / 2);
    const w = b - a + 14;
    const flip = i % 2 === 1;
    if (kind === 'window') {
      // Boarded from behind: the door planks show through the arch.
      out.push(deco('door_asset_abandoned_apt_1', x + 7, WALL_BASE - 94, 96, 176, 8, { id: `shutter_${i + 1}` }));
      out.push(deco('apartment_hall_wall_piece_window', x, WALL_BASE, w, h, z++, { id: `window_${i + 1}` }));
      continue;
    }
    out.push(deco('apartment_hall_wall_piece_2', x, WALL_BASE, w, h, z++, flip ? { flip: true } : {}));
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
      } else if (tower.style === 'cracks' && u < 0.6) {
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

function propDecos(layout, front) {
  const { l, t } = TOWER_FLOOR_BOUNDS;
  const out = [];
  let z = front ? 200 : 120;
  for (const [sprite, x, base, w, h, opts = {}] of layout.props) {
    if (Boolean(opts.front) !== front) continue;
    const extra = {};
    if (opts.flip) extra.flip = true;
    const d = deco(sprite, x, base, w, h, opts.z ?? z++, extra);
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
      decos: [...shellDecos(), ...rug, ...bayDecos(layout), ...liftDecos(floor), ...accentDecos(tw, floor, layout), ...propDecos(layout, false)],
      ...(lobbyFilter ? { filters: { ...lobbyFilter } } : {}),
    },
    { id: 'T_tower_front', name: 'middleplus', z: 1, w: W, h: H, decos: propDecos(layout, true), ...(lobbyFilter ? { filters: { ...lobbyFilter } } : {}) },
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
    // Dark above the hall and through any gap, as in the panorama.
    gradient: { top: '0A0705', bottom: '2B2018' },
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
