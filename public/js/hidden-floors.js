/**
 * The hidden floors (register row G92): the lost floor rebuilt, the way into
 * the forgotten floor, and what is known of the missing floor. Pure data and
 * a street builder (no Pixi, no DOM); features/hidden-floors-feature.js runs
 * the teleporters and paints the EXIT words.
 *
 * What survives in source:
 * - GSJS inc_data_maps_prod.js names three floors: hub 92 Tamila
 *   LA9QUBPI49J2MOB "The lost floor" (16876), hub 97 Muufo LDOOSA8V29J24I3
 *   "The forgotten floor" (17016) and hub 51 Uralia LUV1CSSE49J2P2C "The
 *   missing floor" (16033), plus their LDO templates (18459-18461).
 *   config_prod.js 1331 teleportation_ok_streets lists exactly these three
 *   ("Streets where teleportation targets/scripts are ok, even if locked").
 *   Only the forgotten floor's location XML is in the public dump.
 * - Each floor has one entry street holding exactly one Collision-triggered
 *   Teleporter (items/teleporter.js: onPlayerCollision ->
 *   pc.teleportToLocation(target_tsid, target_x, target_y); its instance
 *   props, the target and the hit box, were never archived), and the
 *   teleporter's server prefix matches its floor's: Goorsh Gam
 *   (LIF16GDJ89724E3.xml 1772) IA99KIA44BJ2MGL -> LA9..., Odena Odes
 *   (LA9KL9UE1D82RFO.xml 1215) IDOQH5AH4BJ2SMR -> LDO..., Ilmenskie
 *   (LIF102FDNU11314.xml 4093) IUVKH29S4BJ2IS6 -> LUV.... The forgotten
 *   floor holds a fourth, IDO5LAE259J2H12, its way out.
 * - All three entry streets were edited in one pass on 2011-12-15 (geometry
 *   ids 1323982673162-212): Goorsh Gam's treetop route (plat_...164-206, from
 *   the middle canopy to the top-left treetop at y -875), Odena Odes' pocket
 *   in the right of the cave chamber's ceiling (plat_...163 and
 *   wall_...162) and Ilmenskie's top-right corner (plat_...207-210,
 *   wall_...211-212). The forgotten floor's decos date from the same day
 *   (1323965752xxx) and its "EXIT" sign (blank_1324050033524, sign_txt EXIT,
 *   default_deco_sign_med) from the next.
 * - The 2011-12 glitch-strategy guide to hidden locations: the lost floor is
 *   reached from "one of the central streets in Tamila" by "treetop climbing
 *   and jumping"; the forgotten floor by "going to Odena Odes, and jumping
 *   madly around (spinach/triple jumping required)"; the missing floor by "a
 *   running jump so powerful" into "a wormhole" "somewhere in the overground
 *   area of Uralia".
 *
 * Read off player footage (reference only, no pixels or audio):
 * - r1CBeOmnaFg (Lily Linguistic, 2012-12-10): the HUD reads "Current
 *   location: Goorsh Gam" while she walks left along the treetops (minimap
 *   t0000-t0015) and leaves through the top-left (t0018), then the loading
 *   card "Entering The lost floor in Tamila" (t0021) and the hall itself
 *   (t0027-t0057). Measured at ~1.55 world px per video px (the avatar is
 *   ~84 video px against the remake's 130).
 * - twOBlmVrRyI (same day): Odena Odes' cave chamber, a walk to its right
 *   end, levitation straight up (t0036-t0042), the forgotten floor's card
 *   (t0045), arrival by the Game of Crowns teleporter (t0051), and the way
 *   back: walking right past the EXIT sign into the corner (t0093) brings up
 *   Odena Odes' card (t0096).
 * Inferred, not in source: every teleporter's box and landing point (the
 * instance props are lost), and the lost floor's layout. The remake's plain
 * jump peaks at ~105 px against the client's ~134, so the Odena Odes box
 * starts 160 px above the floor instead of the pocket's 384 (2.9 plain
 * jumps in the client, 1.5 here): out of reach of a plain jump (105 px) and
 * of slow triple jumps, in reach of a Big 'Un triple jump whose third hop
 * comes inside 200 ms of landing (179-347 px peak), a quicker Medium or
 * Baby one, spinach (240 px) or levitation.
 */

export const LOST_FLOOR_TSID = 'GA9QUBPI49J2MOB';
export const LOST_FLOOR_SOURCE_TSID = 'LA9QUBPI49J2MOB';
export const LOST_FLOOR_LABEL = 'The lost floor';
export const LOST_FLOOR_HUB = Object.freeze({ hubId: '92', hubName: 'Tamila' });
export const FORGOTTEN_FLOOR_TSID = 'GDOOSA8V29J24I3';
export const GOORSH_GAM_TSID = 'GIF16GDJ89724E3';
export const ODENA_ODES_TSID = 'GA9KL9UE1D82RFO';
export const LOST_FLOOR_SOURCE =
  'reconstruction: The lost floor (LA9QUBPI49J2MOB, not in tinyspeck/glitch-locations); layout from video r1CBeOmnaFg, CC0 apartment hall decos as on the forgotten floor';

/** The missing floor: guide text and source only; not rebuilt (no footage). */
export const MISSING_FLOOR = Object.freeze({
  tsid: 'LUV1CSSE49J2P2C',
  label: 'The missing floor',
  hub: '51 Uralia',
  entryStreet: 'Ilmenskie (GIF102FDNU11314)',
  teleporter: 'IUVKH29S4BJ2IS6',
  entryGeometry: 'plat_1323982673207-210, wall_1323982673211-212: ceiling steps rising to a ledge at x 2668, y -890 in the top-right corner (bounds -3000..3000, -1000..0)',
  guide: '"Somewhere in the overground area of Uralia... with a running jump so powerful... a wormhole exists which might just woosh you into The Missing Floor. Creepy place, this, with climbable vines, ripped posters and dripping faucets a plenty." Also the Sandbox Group\'s secret lair.',
});

const isTsid = (tsid, g) => String(tsid || '').slice(1) === g.slice(1);
export const isLostFloorTsid = (tsid) => isTsid(tsid, LOST_FLOOR_TSID);

/* ------------------------------------------------------------------ */
/* The lost floor: geometry                                            */
/* ------------------------------------------------------------------ */

const L = -1150;
const R = 1150;
const T = -750;
const B = 0;
export const LOST_FLOOR_BOUNDS = Object.freeze({ l: L, r: R, t: T, b: B });
const W = R - L;
const H = B - T;
const screen = (x, y) => ({ x: Math.round(x - L), y: Math.round(y - T) });

/** Walk line and ceiling (the forgotten floor's are -150..-130 and -611..-598). */
export const LOST_FLOOR_Y = -150;
export const LOST_CEILING_Y = -610;

/**
 * The four stone pillars, world x. Spacing from the video: A-B 325, B-C
 * 285, C-D 315 video px, D to the right end 330 (t0030-t0057).
 */
export const PILLARS = Object.freeze({ A: -792, B: -288, C: 154, D: 642 });

/** Arched windows in the back wall (world centre x). */
export const WINDOWS = Object.freeze([
  Object.freeze({ id: 'boarded', x: -567, why: 'two planks nailed across in a ">" (t0030, t0042)' }),
  Object.freeze({ id: 'open', x: 247, why: 'open, pale sky behind (t0027, t0036)' }),
  Object.freeze({ id: 'crossed', x: 1056, why: 'crossed planks, right of EXIT (t0057)' }),
]);

/** The painted EXIT (footage word, Austin OK 2026-10-23; video r1CBeOmnaFg t0036, t0057). */
export const LOST_EXIT_SIGN = Object.freeze({ text: 'EXIT', x: 800, y: -398, footage: 'r1CBeOmnaFg t0036, t0057' });

const WALL_BASE = -198;
const WALL_H = 392;
const PLAIN_W = 290;
const WINDOW_W = 176;

const deco = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra });

/** Back wall: the window pieces where the video has them, plain pieces spread over the gaps. */
function wallDecos() {
  const out = [];
  let z = 10;
  const edges = [L - 20];
  for (const w of WINDOWS) edges.push(w.x - WINDOW_W / 2, w.x + WINDOW_W / 2);
  edges.push(R + 20);
  for (let i = 0; i < edges.length; i += 2) {
    const x0 = edges[i];
    const x1 = edges[i + 1];
    const n = Math.max(1, Math.ceil((x1 - x0) / PLAIN_W));
    const step = (x1 - x0 - PLAIN_W) / Math.max(1, n - 1);
    for (let k = 0; k < n; k += 1) {
      const cx = n === 1 ? (x0 + x1) / 2 : x0 + PLAIN_W / 2 + k * step;
      out.push(deco('apartment_hall_wall_piece_2', cx, WALL_BASE, PLAIN_W, WALL_H, z++, k % 2 ? { flip: true } : {}));
    }
  }
  for (const w of WINDOWS) out.push(deco('apartment_hall_wall_piece_window', w.x, WALL_BASE, WINDOW_W, WALL_H, z++, { id: `window_${w.id}` }));
  return out;
}

/** Ceiling band, floor boards, end walls (the forgotten floor's shell pieces). */
function shellDecos() {
  const out = [];
  for (const x of [-575, 725]) out.push(deco('apartment_filler', x, -655, 1450, 120, 2));
  for (const x of [-580, 720]) out.push(deco('ceiling_tan_ghtest', x, -585, 1320, 80, 40));
  for (const [i, x] of [-880, 0, 880].entries()) out.push(deco('apartment_hall_floor_piece_1', x, -60, 1100, 146, 30 + i, i === 1 ? { flip: true } : {}));
  for (const x of [-500, 700]) out.push(deco('apartment_filler', x, -1, 1260, 64, 34));
  out.push(deco('apartment_xsection_top_1', 0, -23, 2400, 39, 35));
  out.push(deco('apartment_hall_wall_side', L + 70, -55, 190, 600, 36));
  out.push(deco('apartment_hall_wall_side', R - 70, -55, 190, 600, 36, { flip: true }));
  return out;
}

/**
 * Ceiling pipes: a coupled pipe (ladder_pipe_2 turned on its side) run along
 * the ceiling, broken where the video shows torn stubs, with the dripping
 * elbow (wallpipe_1) over the shelf between pillars B and C (t0027-t0054).
 */
function pipeDecos() {
  const out = [];
  const PIPE_Y = -606;
  const runs = [[-1010, -330], [-250, 160], [300, 1100]];
  let z = 44;
  for (const [x0, x1] of runs) {
    for (let x = x0; x < x1; x += 180) {
      // A turned deco rotates about its bottom centre: the 75 px wide pipe lies along y = PIPE_Y.
      out.push(deco('ladder_pipe_2', x + 95, PIPE_Y + 37, 75, 190, z++, { r: 90 }));
    }
  }
  // Torn ends hanging down (t0030 top left, t0027 right of pillar C, t0036).
  out.push(deco('platform_pipe_1', -1060, -560, 150, 66, z++, { r: -30 }));
  out.push(deco('platform_pipe_2', 230, -572, 150, 54, z++, { r: 28 }));
  out.push(deco('platform_pipe_1', 1110, -566, 140, 62, z++, { r: 25, flip: true }));
  // The dripping elbow and its drips (t0027, t0033: over the shelf).
  out.push(deco('wallpipe_1', -63, -470, 92, 186, z++));
  out.push(deco('cave_drip_03', -55, -330, 20, 90, z++));
  return out;
}

/** Wall clutter: shelf and vase, torn plaster, cracks, trellis and vines, the boarded windows. */
function wallPropDecos() {
  const out = [];
  let z = 60;
  // Shelf with a vase between pillars B and C (t0027-t0054).
  out.push(deco('wall_shelf1', -25, -430, 250, 30, z++));
  out.push(deco('vase_1', 38, -437, 40, 70, z++));
  // Torn plaster showing the pipe behind, low on the wall under the shelf (t0033).
  out.push(deco('wall_crack_1', 22, -236, 150, 70, z++));
  out.push(deco('abandoned_apt_rubble_05', -40, -168, 66, 46, z++));
  out.push(deco('abandoned_apt_rubble_09', 70, -172, 44, 28, z++));
  // Cracked plaster: the dark torn wall at the far left (t0030), cracks elsewhere.
  out.push(deco('crack_building_2', -1040, -470, 150, 200, z++, { flip: true }));
  out.push(deco('apartment_crack', -965, -300, 40, 250, z++));
  out.push(deco('roots_ug_4', -1005, -470, 46, 160, z++));
  out.push(deco('crack_building_3', -405, -500, 120, 50, z++));
  out.push(deco('crack_building_1', 520, -470, 90, 90, z++));
  out.push(deco('crack_building_3', 960, -300, 110, 46, z++, { flip: true }));
  out.push(deco('wall_crack_2', 1005, -230, 60, 120, z++));
  // Trellis with a climbing vine against the wall left of pillar B (t0030, t0042).
  out.push(deco('ladder_trellis_1', -366, -196, 150, 400, z++));
  out.push(deco('ladder_vine_1', -360, -205, 60, 400, z++));
  out.push(deco('pipe_vines_01', -1105, -420, 50, 110, z++, { flip: true }));
  // Boarded window: two planks in a ">" (t0030).
  out.push(deco('abandoned_apt_windowboard_1', -575, -395, 150, 46, z++, { r: 26 }));
  out.push(deco('abandoned_apt_windowboard_3', -578, -326, 150, 44, z++, { r: -20 }));
  // Crossed planks over the right-hand window (t0057).
  out.push(deco('door_barricade_wood_1', WINDOWS[2].x, -400, 150, 100, z++));
  // The painted EXIT arrow, pointing right (the forgotten floor's arrow deco; t0057).
  out.push(deco('crown_game_play_line_arrow1', LOST_EXIT_SIGN.x + 6, LOST_EXIT_SIGN.y + 2, 74, 170, z++, { r: -90, id: 'exit_arrow' }));
  return out;
}

/** Floor things behind the avatar: back planters, the crate, pots, rugs, debris. */
function floorBackDecos() {
  const out = [];
  let z = 80;
  // Rugs (t0036, t0057): one under bays C-D, one past pillar D.
  out.push(deco('apartment_rug_red', 360, -128, 620, 54, z++));
  out.push(deco('apartment_rug_red', 905, -128, 470, 50, z++, { flip: true }));
  out.push(deco('platform_crack_1', -120, -150, 150, 34, z++));
  out.push(deco('patch_dirt_1', -650, -170, 300, 36, z++));
  // Back-row planters with seedlings (t0030 left of pillar A, t0036 bay C-D).
  for (const [x, w] of [[-753, 330], [444, 333]]) {
    out.push(deco('abbasid_planter_box_1x3', x, -168, w, 54, z++));
    for (let k = -2; k <= 2; k += 1) out.push(deco('underground_plant_green_1', x + k * (w / 6), -186, 20, 28, z++));
  }
  out.push(deco('crate_1', -985, -182, 92, 78, z++));
  // Potted plants: the dark seed-head pot under the boarded window (t0030).
  out.push(deco('decor_plants1', -490, -178, 100, 102, z++));
  // A pipe fallen against the wall in bay C-D (t0036, t0057).
  out.push(deco('ladder_pipe_1', 402, -180, 52, 120, z++, { r: -22 }));
  // Fallen plaster and rubble at the right end (t0057).
  out.push(deco('abandoned_apt_rubble_01', 880, -168, 130, 70, z++));
  out.push(deco('abandoned_apt_rubble_03', 1065, -164, 120, 66, z++));
  out.push(deco('abandoned_apt_rubble_07', 1010, -150, 70, 48, z++));
  out.push(deco('groddle_plant_2', 860, -196, 30, 70, z++));
  return out;
}

/** Things in front of the avatar (world; foregroundDecos moves them to the near plane): front planters and their plants, a pot, a fallen vase. */
function floorFrontDecos() {
  const out = [];
  let z = 200;
  const planter = (x, w, plants) => {
    out.push(deco('abbasid_planter_box_1x3', x, -72, w, 62, z++));
    for (const [sprite, dx, pw, ph] of plants) out.push(deco(sprite, x + dx, -98, pw, ph, z++));
  };
  // Far left, past pillar A (t0030): brown sprouts and a teal fiddlehead.
  planter(-958, 240, [['underground_plant_1', -70, 30, 40], ['underground_plant_4', -30, 26, 52], ['underground_plant_1', 15, 30, 40], ['zutto_plant_1', 70, 40, 52]]);
  out.push(deco('plant_fern_1', -1110, -86, 34, 78, z++));
  // Bay A-B (t0030): teal leafy plant, teal fiddlehead, a green sprout.
  planter(-478, 300, [['zutto_plant_3', -80, 62, 58], ['plant_fern_3', -10, 38, 80], ['underground_plant_green_3', 70, 34, 72]]);
  out.push(deco('vase_broken_1', -746, -66, 62, 56, z++));
  // Bay C-D (t0036): seedlings, a fiddlehead and a red shoot.
  planter(398, 410, [['underground_plant_green_1', -150, 24, 34], ['underground_plant_green_1', -80, 24, 34], ['underground_plant_4', -10, 22, 46], ['underground_plant_green_1', 60, 24, 34], ['plant_fern_1', 140, 34, 80]]);
  // The yellow pot of green beads in front of pillar D (t0036, t0057).
  out.push(deco('decor_plants2', 712, -64, 70, 94, z++));
  return out;
}

/**
 * The near plane (screen space, like the forgotten floor's middleplus layer,
 * which draws over the avatar): front planters and pots, stone pillars, and
 * the dark bands and edge shadows that frame the hall.
 */
function foregroundDecos() {
  const out = floorFrontDecos().map((d) => ({ ...d, ...screen(d.x, d.y) }));
  let z = 300;
  for (const [i, x] of Object.values(PILLARS).entries()) {
    const p = screen(x, -40);
    out.push(deco('column_1', p.x, p.y, 104, 640, z++, i % 2 ? { flip: true } : {}));
  }
  // The forgotten floor's framing (T_1323900120521): dark blur bands top and
  // bottom, vertical shadows down both ends.
  out.push(deco('box_blur_1', W / 2, 71, W + 1200, 192, z++));
  out.push(deco('box_blur_1', W / 2, 886, W + 1200, 187, z++));
  out.push(deco('tree_int_vertical_shadow', 248, 435, 988, 254, z++, { r: -90 }));
  out.push(deco('tree_int_vertical_shadow', W - 248, 443, 988, 254, z++, { r: 90 }));
  return out;
}

function layers() {
  const shade = { contrast: -10, brightness: -24 };
  return [
    { id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: [...shellDecos(), ...wallDecos(), ...pipeDecos(), ...wallPropDecos(), ...floorBackDecos()], filters: shade },
    { id: 'T_lostfloor_front', name: 'middleplus', z: 1, w: W, h: H, decos: foregroundDecos(), filters: { contrast: -12, brightness: -30 } },
  ];
}

/**
 * The lost floor's street JSON. No signposts or doors: the only ways in and
 * out are the teleporters (hidden-floors feature).
 */
export function lostFloorStreet() {
  const platforms = [
    { id: 'plat_lost_floor', x1: L, y1: LOST_FLOOR_Y, x2: R, y2: LOST_FLOOR_Y, pc_perm: -1 },
    { id: 'plat_lost_ceiling', x1: L, y1: LOST_CEILING_Y, x2: R, y2: LOST_CEILING_Y, pc_perm: 1 },
  ];
  const ls = layers();
  const decoCount = ls.reduce((n, l) => n + l.decos.length, 0);
  return {
    source: LOST_FLOOR_SOURCE,
    reconstructed: true,
    tsid: LOST_FLOOR_TSID,
    label: LOST_FLOOR_LABEL,
    hubId: LOST_FLOOR_HUB.hubId,
    hubName: LOST_FLOOR_HUB.hubName,
    swf_file: 'bldg_int_apt.swf',
    bounds: { ...LOST_FLOOR_BOUNDS },
    platforms,
    layers: ls,
    signposts: [],
    stats: { platformCount: platforms.length, layerCount: ls.length, decoCount, signpostCount: 0, doorCount: 0, ladderCount: 0, barrierCount: 0 },
    // Pale sky through the arched windows (t0027-t0057).
    gradient: { top: 'C9C2D9', bottom: 'EDE9F1' },
    ladders: [],
    why: {
      street: 'inc_data_maps_prod.js 16876 (hub 92 Tamila); no location XML. config_prod.js 1331 teleportation_ok_streets.',
      layout: 'Video r1CBeOmnaFg t0021-t0057 at ~1.55 world px per video px: four stone pillars, three arched windows (boarded, open, crossed), ceiling pipes with a dripping elbow, shelf and vase, torn plaster, trellis and vine, planters of seedlings, two potted plants, rugs, the painted EXIT arrow at the right end.',
      shell: 'The forgotten floor\'s apartment hall pieces and sizes (GDOOSA8V29J24I3.xml): the guide says the lost floor "shares the same creepy, run down feel".',
      ways: 'In from Goorsh Gam\'s top-left treetop; out past EXIT at the right end (as the forgotten floor\'s footage shows). Teleporter boxes and landings are inferred.',
    },
  };
}

/** The index.json row. */
export function lostFloorIndexEntry(street = lostFloorStreet()) {
  return {
    label: LOST_FLOOR_LABEL,
    file: `assets/streets/${LOST_FLOOR_TSID}.json`,
    hubId: LOST_FLOOR_HUB.hubId,
    hubName: LOST_FLOOR_HUB.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}

/* ------------------------------------------------------------------ */
/* Goorsh Gam's canopy                                                 */
/* ------------------------------------------------------------------ */

/**
 * The client's walk and jump against the remake's (the puzzle streets'
 * SOURCE_PHYSICS, js/puzzle-triggers.js: vx_max 335 vs 264 px/s, gravity
 * 1190 vs 1512 px/s^2). Goorsh Gam's treetop route was laid for the
 * client's jump: its one hop from plat_1323982673191 (-2169, -595) up to
 * plat_1323982673206 (-2354, -708) needs 113 px of rise over 185 px, which
 * the client's running jump clears (~230 px) and the remake's plain jump
 * (~105 px peak) cannot. Up in the canopy the street moves as the client did.
 */
export const CANOPY_PHYSICS = Object.freeze({ speed: 335 / 264, jump: 1, gravity: 1190 / 1512 });
/** Feet above this world y (the forest floor is -20..-85, the lowest canopy -466) count as in the canopy. */
export const CANOPY_Y = -300;
export const isGoorshGamTsid = (tsid) => isTsid(tsid, GOORSH_GAM_TSID);

/* ------------------------------------------------------------------ */
/* Teleporters (items/teleporter.js)                                   */
/* ------------------------------------------------------------------ */

/**
 * Peak of a jump at `multiplier` times the plain jump speed, stepped frame
 * by frame as game.js physics() does at 60 fps (vy += 0.42 * gravity, then
 * y += vy; the jump starts at vy -9.6). A plain jump peaks at ~105 px.
 */
export function jumpApex(multiplier = 1, gravity = 1) {
  let vy = -9.6 * multiplier;
  let y = 0;
  let top = 0;
  for (let i = 0; i < 1000 && vy < 0; i += 1) {
    vy += 0.42 * gravity;
    y += vy;
    top = Math.min(top, y);
  }
  return -top;
}
export const PLAIN_JUMP_APEX = jumpApex(1);

/** Odena Odes' floor under the ceiling pocket (plat_1311895253649, world y at x 1316). */
export const ODENA_POCKET_FLOOR_Y = -157;
/** How far above that floor the feet must rise to reach the teleporter. */
export const ODENA_RISE = 160;

/**
 * Collision-triggered Teleporters. `box` is the hit box in the street's
 * screen space (bottom-centre x, y, w, h; the avatar's feet must be inside),
 * `arrive` the landing point in the target's screen space.
 */
export const TELEPORTERS = Object.freeze([
  Object.freeze({
    id: 'goorsh_to_lost',
    objref: 'IA99KIA44BJ2MGL',
    from: GOORSH_GAM_TSID,
    to: LOST_FLOOR_TSID,
    label: LOST_FLOOR_LABEL,
    // World x -2850, feet 50 px over the top-left treetop (plat_1323982673201-204, y -875).
    box: Object.freeze({ x: 150, y: 75, w: 180, h: 140 }),
    // World (-98, -150): where she stands as the hall appears (t0027).
    arrive: Object.freeze({ x: 1052, y: 600 }),
    why: 'Goorsh Gam\'s one teleporter (LIF16GDJ89724E3.xml 1772); she walks left along the 2011-12-15 treetop route and leaves through the top left (r1CBeOmnaFg t0000-t0018). A jump from the top-left treetop reaches it.',
  }),
  Object.freeze({
    id: 'lost_to_goorsh',
    objref: null,
    from: LOST_FLOOR_TSID,
    to: GOORSH_GAM_TSID,
    label: 'Goorsh Gam',
    // World x 1070..1150: the corner past EXIT and the crossed window.
    box: Object.freeze({ x: 2260, y: 650, w: 80, h: 160 }),
    // World (-2650, -22): the forest floor under the top-left trees.
    arrive: Object.freeze({ x: 350, y: 978 }),
    why: 'Inferred: the painted EXIT arrow points right and the forgotten floor\'s footage leaves the same way (twOBlmVrRyI t0093-t0096); the landing is not on record.',
  }),
  Object.freeze({
    id: 'odena_to_forgotten',
    objref: 'IDOQH5AH4BJ2SMR',
    from: ODENA_ODES_TSID,
    to: FORGOTTEN_FLOOR_TSID,
    label: 'The forgotten floor',
    // World x 1233..1399 (the pocket between wall_1323982673162 and the street's end), feet 160 px over the floor, up to the pocket's roof (plat_1323982673163, y -673).
    box: Object.freeze({ x: 2716, y: 1600 + ODENA_POCKET_FLOOR_Y - ODENA_RISE, w: 166, h: 1600 + ODENA_POCKET_FLOOR_Y - ODENA_RISE - 927 }),
    // World (-80, -146): beside the Game of Crowns teleporter (t0051).
    arrive: Object.freeze({ x: 920, y: 606 }),
    why: 'Odena Odes\' one teleporter (LA9KL9UE1D82RFO.xml 1215) in the ceiling pocket added 2011-12-15; she walks to the right end of the cave chamber and levitates straight up (twOBlmVrRyI t0009-t0042). The guide: spinach or triple jumping.',
  }),
  Object.freeze({
    id: 'forgotten_to_odena',
    objref: 'IDO5LAE259J2H12',
    from: FORGOTTEN_FLOOR_TSID,
    to: ODENA_ODES_TSID,
    label: 'Odena Odes',
    // World x 930..1000: the corner right of the EXIT sign and the crossed window.
    box: Object.freeze({ x: 1965, y: 640, w: 70, h: 160 }),
    // World (1160, -162): the cave floor just left of the pocket.
    arrive: Object.freeze({ x: 2560, y: 1438 }),
    why: 'The forgotten floor\'s own teleporter (LDOOSA8V29J24I3.xml 136); she walks right past EXIT into the corner and Odena Odes loads (twOBlmVrRyI t0093-t0096). Landing inferred.',
  }),
]);

/** Teleporters on a street (either TSID prefix). */
export function teleportersOn(tsid) {
  return TELEPORTERS.filter((t) => isTsid(tsid, t.from));
}

/** Feet (x, y, screen space) inside a teleporter's box. */
export function inTeleporter(row, x, y) {
  const b = row?.box;
  if (!b) return false;
  return x >= b.x - b.w / 2 && x <= b.x + b.w / 2 && y <= b.y && y >= b.y - b.h;
}

/**
 * Painted sign words per street, in screen space (centre). The forgotten
 * floor's is its archived sign_txt (blank_1324050033524 at 708, -301, 168x77,
 * bottom-centre); the lost floor's is read off the footage.
 */
export const EXIT_SIGNS = Object.freeze({
  // Faint grey on the plaster (twOBlmVrRyI t0093).
  [FORGOTTEN_FLOOR_TSID]: Object.freeze({ text: 'EXIT', x: 708 + 1000, y: -301 - 77 / 2 + 750, alpha: 0.5, source: 'GDOOSA8V29J24I3.xml blank_1324050033524 sign_txt' }),
  // White over the pale arrow (r1CBeOmnaFg t0057).
  [LOST_FLOOR_TSID]: Object.freeze({ text: LOST_EXIT_SIGN.text, ...screen(LOST_EXIT_SIGN.x, LOST_EXIT_SIGN.y), alpha: 0.8, source: `footage ${LOST_EXIT_SIGN.footage}` }),
});

export function exitSignOn(tsid) {
  const key = Object.keys(EXIT_SIGNS).find((k) => isTsid(tsid, k));
  return key ? EXIT_SIGNS[key] : null;
}
