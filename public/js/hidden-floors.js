/**
 * The hidden floors (register rows G92, G105): the lost floor rebuilt from
 * footage, the way into the forgotten floor, and the missing floor laid out
 * from its 2012 full-street template with its way in from Ilmenskie. Pure data and street
 * builders (no Pixi, no DOM); features/hidden-floors-feature.js runs the
 * teleporters, Ilmenskie's ceilings and paints the EXIT words.
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
 * instance props are lost), and the lost floor's layout. The Odena Odes box
 * starts at the ceiling pocket, 384 px above the floor (2.7 plain jumps of
 * 142 px, the client's own numbers in js/avatar-step.js): out of reach of a
 * plain jump, High Jumper III (158 px), a Baby triple jump (367 px at best)
 * and a standing one; in reach of a quick running Big 'Un or Medium triple
 * jump (up to 500 / 417 px), spinach (720 px) or levitation.
 */

import { NORMAL_BUFF, jumpApex as stepperJumpApex } from './avatar-step.js?v=8415ee96';

export const LOST_FLOOR_TSID = 'GA9QUBPI49J2MOB';
export const LOST_FLOOR_SOURCE_TSID = 'LA9QUBPI49J2MOB';
export const LOST_FLOOR_LABEL = 'The lost floor';
export const LOST_FLOOR_HUB = Object.freeze({ hubId: '92', hubName: 'Tamila' });
export const FORGOTTEN_FLOOR_TSID = 'GDOOSA8V29J24I3';
export const GOORSH_GAM_TSID = 'GIF16GDJ89724E3';
export const ODENA_ODES_TSID = 'GA9KL9UE1D82RFO';
export const LOST_FLOOR_SOURCE =
  'reconstruction: The lost floor (LA9QUBPI49J2MOB, not in tinyspeck/glitch-locations); layout from video r1CBeOmnaFg, CC0 apartment hall decos as on the forgotten floor';

/** The missing floor (register row G105): what the source and the guide say; the room is built below. */
export const MISSING_FLOOR = Object.freeze({
  tsid: 'LUV1CSSE49J2P2C',
  label: 'The missing floor',
  hub: '51 Uralia',
  entryStreet: 'Ilmenskie (GIF102FDNU11314)',
  teleporter: 'IUVKH29S4BJ2IS6',
  entryGeometry: 'plat_1323982673207-210, wall_1323982673211-212: ceiling steps rising to a ledge at x 2668, y -890 in the top-right corner (bounds -3000..3000, -1000..0)',
  guide: '"Somewhere in the overground area of Uralia... with a running jump so powerful... a wormhole exists which might just woosh you into The Missing Floor. Creepy place, this, with climbable vines, ripped posters and dripping faucets a plenty." Also the Sandbox Group\'s secret lair.',
});
export const MISSING_FLOOR_TSID = 'GUV1CSSE49J2P2C';
export const MISSING_FLOOR_SOURCE_TSID = MISSING_FLOOR.tsid;
export const MISSING_FLOOR_LABEL = MISSING_FLOOR.label;
export const MISSING_FLOOR_HUB = Object.freeze({ hubId: '51', hubName: 'Uralia' });
export const ILMENSKIE_TSID = 'GIF102FDNU11314';
export const MISSING_FLOOR_SOURCE =
  'reconstruction: The missing floor (LUV1CSSE49J2P2C, not in tinyspeck/glitch-locations); laid out from the 2012 full-street template (FullStreetTemplates/Uralia) with CC0 apartment hall and office decos, shell as the forgotten floor';

const isTsid = (tsid, g) => String(tsid || '').slice(1) === g.slice(1);
export const isLostFloorTsid = (tsid) => isTsid(tsid, LOST_FLOOR_TSID);
/** The three hidden floors: secret rooms reached only through their teleporters. */
export const HIDDEN_FLOOR_TSIDS = Object.freeze([LOST_FLOOR_TSID, FORGOTTEN_FLOOR_TSID, MISSING_FLOOR_TSID]);
export const isHiddenFloorTsid = (tsid) => HIDDEN_FLOOR_TSIDS.some((g) => isTsid(tsid, g));
export const isMissingFloorTsid = (tsid) => isTsid(tsid, MISSING_FLOOR_TSID);
export const isIlmenskieTsid = (tsid) => isTsid(tsid, ILMENSKIE_TSID);

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
/* The missing floor                                                   */
/* ------------------------------------------------------------------ */

/*
 * Laid out from the stitched 2012 full-street template (reference only, no
 * pixels): research/goodnight-groddle-archive/glitch-art/FullStreetTemplates/
 * Uralia/The missing floor.png, 2000x750, the street's own bounds at 1:1, so
 * world x = template x - 1000 and world y = template y - 750. Every deco
 * below is a CC0 Tiny Speck one, placed where the template shows it, at the
 * size it shows (most at half their native size: the filing cabinet, the
 * ducts, the windows' wall pieces).
 * Left to right: a duct elbow and a pipe stub on the end wall; a cracked TV
 * over a segmented drain pipe; the "Discover Ix" poster, ripped across, over
 * a filing cabinet laid on its side with a vase on it, a round table and two
 * stools; a steaming broken pipe end at the front; an arched window with a
 * lattice behind two crossed planks; a broken duct dripping black out of a
 * hole in the ceiling over a ripped poster and a crack; four stone columns
 * between three arched windows on the night sky (the moon in the middle
 * one), a fern and a broken vase on the long red rug; a crate in front;
 * a crate, a standing filing cabinet and another on its side, mossy, under
 * a painted EXIT arrow; a broken vase; the climbable vine; a last window,
 * a crack, a sapling; the floor broken up into stone at the right end.
 * Overhead: two ropes from the top meet like a tent, each with bulbs on
 * short cords (28 in all, read off the template one by one).
 * Earlier this room was dressed from two player Snaps of one stretch of it
 * (research/wayback/raw/snaps/missing_floor/ PHVSGKDV7SA2FK8_97961 and
 * PA92KIPN12E27D0_179173): their TV, pipe, poster, table and stools, lattice
 * window, dripping duct, rug and crate are all on the template too.
 * Inferred, not on the template: the ledge at the vine's top (the vine is
 * climbable in the guide; the wall's top trim is the only place it reaches)
 * and the way out at the right end, past the arrow (as on both siblings).
 */

const ML = -1000;
const MR = 1000;
const MT = -750;
const MB = 0;
export const MISSING_FLOOR_BOUNDS = Object.freeze({ l: ML, r: MR, t: MT, b: MB });
const MW = MR - ML;
const MH = MB - MT;
const mScreen = (x, y) => ({ x: Math.round(x - ML), y: Math.round(y - MT) });
/** Template px to world (the template is the street at 1:1). */
const tx = (x) => x + ML;
const ty = (y) => y + MT;

/** Walk line and ceiling (the forgotten floor's, its template sibling: LDOKP2FHL8J25AQ beside LDO49MOHI8J221M). */
export const MISSING_FLOOR_Y = -150;
export const MISSING_CEILING_Y = -610;
/** Wall panels: foot and height (template y 545 and 185). */
const M_WALL_BASE = ty(547);
const M_WALL_H = 364;
/** The window pieces' arch is 35% of their width: 196 wide gives the template's 68 px of glass. */
const M_WINDOW_W = 196;

/**
 * Wall bays, world centre x and width, as the template's panels run
 * (template x in `why`).
 */
export const MISSING_BAYS = Object.freeze([
  Object.freeze({ id: 'A', x: tx(245), w: 300, kind: 'plain', why: 'TV, drain pipe, Discover Ix, cabinet, table and stools (template x 105-385)' }),
  Object.freeze({ id: 'B', x: tx(470), w: M_WINDOW_W, kind: 'window', why: 'lattice behind crossed planks (template x 385-555)' }),
  Object.freeze({ id: 'C', x: tx(732), w: 400, kind: 'plain', why: 'broken duct, ripped poster, crack (template x 555-910)' }),
  Object.freeze({ id: 'D', x: tx(1027), w: M_WINDOW_W, kind: 'window', night: true, why: 'night window (template x 960-1095)' }),
  Object.freeze({ id: 'E', x: tx(1196), w: M_WINDOW_W, kind: 'window', night: true, moon: true, why: 'night window with the moon (template x 1140-1250)' }),
  Object.freeze({ id: 'F', x: tx(1364), w: M_WINDOW_W, kind: 'window', night: true, why: 'night window (template x 1290-1425)' }),
  Object.freeze({ id: 'G', x: tx(1646), w: 384, kind: 'plain', why: 'filing cabinets, crate, painted EXIT arrow, the vine (template x 1465-1828)' }),
  Object.freeze({ id: 'H', x: tx(1914), w: M_WINDOW_W, kind: 'window', night: true, why: 'night window, crack, sapling (template x 1828-2000)' }),
]);
const bay = (id) => MISSING_BAYS.find((b) => b.id === id);

/** The stone columns standing in the wall between the night windows (template x 935, 1117, 1270, 1445). */
export const MISSING_COLUMNS = Object.freeze([tx(935), tx(1117), tx(1270), tx(1445)]);
/** The climbable vine (template x 1786, y 190-532), a ladder from the floor to a ledge on the wall's top trim. */
export const MISSING_VINE = Object.freeze({ x: tx(1786), bottom: MISSING_FLOOR_Y, top: ty(185), shelf: Object.freeze({ x1: tx(1752), x2: tx(1822), y: ty(185) }) });
/** The painted arrow's tip (template x 1737, y 383); EXIT is painted on it. */
export const MISSING_EXIT_ARROW = Object.freeze({ x: tx(1737), y: ty(383) });
/** The painted word on the arrow (template x 1612-1668, y 377-398). */
export const MISSING_EXIT_SIGN = Object.freeze({ text: 'EXIT', x: 1640, y: 387 });

/** The two ropes: template end points (the left one tied off at the end wall, both meeting off the top). */
const ROPES = Object.freeze([
  Object.freeze({ id: 'rope_left', a: [25, 227], b: [1060, -6] }),
  Object.freeze({ id: 'rope_right', a: [1060, -6], b: [2040, 232], flip: true }),
]);
/** Bulbs: template x and the bottom of each bulb. */
const BULBS = Object.freeze([
  [72, 315], [230, 278], [287, 265], [352, 249], [474, 218], [528, 204], [586, 187], [645, 169], [711, 150], [818, 114], [888, 83], [983, 55],
  [1044, 70], [1118, 47], [1196, 92], [1270, 122], [1319, 138], [1363, 152], [1411, 166], [1461, 181], [1510, 196], [1561, 210], [1653, 234],
  [1706, 248], [1759, 260], [1808, 274], [1864, 287], [1981, 311],
]);
const ropeY = (x) => {
  const r = x < ROPES[1].a[0] ? ROPES[0] : ROPES[1];
  return r.a[1] + ((x - r.a[0]) * (r.b[1] - r.a[1])) / (r.b[0] - r.a[0]);
};

/** A deco whose middle line runs from template point a to b, at height h (bottom-centre registration, turned about it). */
function along(sprite, a, b, h, z, extra = {}) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const bx = cx - (h / 2) * Math.sin(ang);
  const by = cy + (h / 2) * Math.cos(ang);
  return deco(sprite, tx(bx), ty(by), len, h, z, { r: Math.round((ang * 180) / Math.PI * 10) / 10, ...extra });
}

/** Through the arches: the night's stars and the moon (their own sky layer, screen space, behind everything; the wall pieces frame them). */
function missingNightDecos() {
  const out = [];
  let z = 1;
  for (const [i, b] of MISSING_BAYS.filter((r) => r.night).entries()) {
    const at = mScreen(b.x, ty(470));
    out.push(deco(i % 2 ? 'sky_stars_2' : 'sky_stars_1', at.x, at.y, 230, 230, z++, { id: `stars_${b.id}`, ...(i > 1 ? { flip: true } : {}) }));
    if (b.moon) {
      const m = mScreen(b.x - 2, ty(377));
      out.push(deco('moon', m.x, m.y, 64, 68, z++, { flip: true, id: 'moon' }));
    }
  }
  return out;
}

/** Behind the wall pieces: the light through the night windows, and the lattice. */
function missingSkyDecos() {
  const out = [];
  let z = 4;
  for (const b of MISSING_BAYS.filter((r) => r.night)) out.push(deco('light_shafts_blue', b.x + 6, ty(450), 110, 190, z++, { id: `shaft_${b.id}` }));
  out.push(deco('ladder_trellis_1', bay('B').x, ty(452), 104, 200, z++, { id: 'lattice' }));
  return out;
}

/** Back wall: the bays' wall pieces, the columns in front of their joins. */
function missingWallDecos() {
  const out = [];
  let z = 20;
  for (const [i, b] of MISSING_BAYS.entries()) {
    if (b.kind === 'window') out.push(deco('apartment_hall_wall_piece_window', b.x, M_WALL_BASE, b.w, M_WALL_H, z++, { id: `bay_${b.id}` }));
    else out.push(deco('apartment_hall_wall_piece_2', b.x, M_WALL_BASE, b.w, M_WALL_H, z++, { id: `bay_${b.id}`, ...(i % 2 ? { flip: true } : {}) }));
  }
  for (const [i, x] of MISSING_COLUMNS.entries()) out.push(deco('column_1', x, ty(553), 54, 384, 40 + i, { id: `column_${i + 1}` }));
  return out;
}

/** The dark band over the beam, the fillers behind the wall feet (so no gap between the bays shows the sky), the end wall. */
function missingShellDecos() {
  const out = [];
  // The dark band over the beam (the ceiling layer would crush it to black).
  for (const x of [-480, 520]) out.push(deco('apartment_filler', x, ty(112), 1100, 140, 2));
  for (const x of [-500, 500]) out.push(deco('apartment_filler', x, -170, 1060, 90, 3));
  out.push(deco('apartment_hall_wall_side', ML + 52, -55, 150, 600, 36));
  return out;
}

/** The beam over the walls with its trim (its own darker layer, screen space). */
function missingCeilingShellDecos() {
  const out = [];
  for (const x of [-561, 484]) out.push(deco('apartment_hall_ceiling_piece_2', mScreen(x, 0).x, 188, 1304, 76, 3));
  out.push(deco('apartment_xsection_top_1', MW / 2, 120, MW + 80, 20, 4));
  return out;
}

/** Floor boards and the front edge (their own lighter layer, screen space). */
function missingFloorShellDecos() {
  const out = [];
  for (const [i, x] of [-760, 0, 760].entries()) out.push(deco('apartment_hall_floor_piece_1', mScreen(x, 0).x, mScreen(0, -60).y, 1100, 146, 1 + i, i === 1 ? { flip: true } : {}));
  for (const x of [-500, 500]) out.push(deco('apartment_filler', mScreen(x, 0).x, mScreen(0, -1).y, 1060, 64, 4));
  out.push(deco('apartment_xsection_top_1', MW / 2, mScreen(0, -23).y, MW + 80, 39, 5));
  return out;
}

/** Overhead: the two ropes and their bulbs, the broken ducts, the vines hanging out of the dark. */
function missingCeilingDecos() {
  const out = [];
  let z = 50;
  // Vines curling down out of the dark ceiling (template x 40-130 and 1570-1622).
  out.push(deco('vine_12', tx(88), ty(0), 50, 120, z++, { r: 150 }));
  out.push(deco('vine_12', tx(1598), ty(0), 52, 162, z++, { r: 180, flip: true }));
  // The ducts: one elbow on the end wall (x 0-55), one broken through the ceiling dripping black (x 685-760).
  out.push(deco('wallpipe_1', tx(28), ty(278), 75, 151, z++, { id: 'duct_end' }));
  out.push(deco('crack_building_3', tx(700), ty(215), 150, 60, z++, { id: 'ceiling_hole' }));
  out.push(deco('wallpipe_1', tx(722), ty(302), 76, 152, z++, { flip: true, id: 'drip_duct' }));
  for (const r of ROPES) out.push(along('hanging_clothes_line', r.a, r.b, 26, z++, { id: r.id, ...(r.flip ? { flip: true } : {}) }));
  for (const [i, [x, bottom]] of BULBS.entries()) {
    const h = Math.max(36, Math.round(bottom + 3 - ropeY(x)));
    out.push(deco('hanging_lightbulb', tx(x), ty(bottom + 3), 20, h, z++, { id: `bulb_${i + 1}` }));
  }
  return out;
}

/** Wall things, left to right. */
function missingWallPropDecos() {
  const out = [];
  let z = 80;
  // End wall and bay A: the pipe stub, the drain pipe with the cracked TV on it, the poster ripped across.
  out.push(deco('platform_pipe_2', tx(100), ty(436), 52, 22, z++, { r: 8 }));
  out.push(deco('ladder_pipe_2', tx(155), ty(552), 34, 150, z++));
  out.push(deco('ladder_pipe_2', tx(155), ty(404), 34, 150, z++, { flip: true }));
  out.push(deco('bureaucratic_hall_tv_1', tx(133), ty(278), 108, 104, z++, { id: 'tv' }));
  out.push(deco('apartment_poster_discover_ix', tx(248), ty(432), 236, 140, z++, { r: -8, id: 'poster_discover_ix' }));
  out.push(deco('shredded_poster_1', tx(250), ty(442), 100, 128, z++, { r: -6, id: 'poster_ripped_A' }));
  // Bay B: the crossed planks over the lattice window.
  out.push(deco('door_barricade_wood_1', bay('B').x, ty(412), 148, 92, z++, { id: 'window_planks' }));
  // Bay C: the ripped poster under the duct, the crack.
  out.push(deco('torn_poster_1', tx(740), ty(466), 104, 150, z++, { id: 'poster_ripped_C' }));
  out.push(deco('wall_crack_2', tx(866), ty(534), 50, 98, z++, { id: 'crack_C' }));
  // Bays D-F: the hole by the first column.
  out.push(deco('wall_crack_1', tx(1022), ty(528), 64, 82, z++, { r: 90 }));
  // Bay G: the painted arrow pointing right (its tip registered, turned from pointing down).
  // The arrow art is half see-through; the template's is solid paint, so it is laid twice.
  out.push(deco('crown_game_play_line_arrow1', MISSING_EXIT_ARROW.x, MISSING_EXIT_ARROW.y, 78, 162, z++, { r: -90, id: 'exit_arrow' }));
  out.push(deco('crown_game_play_line_arrow1', MISSING_EXIT_ARROW.x, MISSING_EXIT_ARROW.y, 78, 162, z++, { r: -90 }));
  out.push(deco('ladder_vine_1', MISSING_VINE.x, ty(533), 52, 346, z++, { id: 'vine' }));
  // Bay H: the crack.
  out.push(deco('wall_crack_2', tx(1860), ty(530), 44, 70, z++, { id: 'crack_H' }));
  return out;
}

/** On the floor behind the avatar, left to right. */
function missingFloorBackDecos() {
  const out = [];
  let z = 120;
  // The long red rug (x 655-1710) and the stone the floor breaks into at the right end (x 1640-2000).
  out.push(deco('apartment_rug_red', tx(1182), ty(607), 1060, 70, z++, { id: 'rug' }));
  out.push(deco('debris_wall_2', tx(1830), ty(700), 390, 160, z++, { id: 'broken_floor' }));
  // Bay A: the filing cabinet on its side with the vase, the table between two stools, moss.
  out.push(deco('cubicle_cabinet_stack', tx(170), ty(510), 90, 158, z++, { r: 90, id: 'cabinet_lying_A' }));
  out.push(deco('vase_1', tx(276), ty(530), 32, 64, z++, { id: 'vase' }));
  out.push(deco('plant_fern_3', tx(278), ty(492), 24, 50, z++));
  out.push(deco('deco_stool_wooden_ghtest', tx(122), ty(602), 58, 52, z++, { id: 'stool_1' }));
  out.push(deco('deco_table_wooden_ghtest', tx(288), ty(616), 188, 88, z++, { id: 'table' }));
  out.push(deco('deco_stool_wooden_ghtest', tx(428), ty(600), 58, 52, z++, { id: 'stool_2' }));
  out.push(deco('patch_mossy_1', tx(215), ty(616), 150, 30, z++));
  out.push(deco('abandoned_apt_rubble_10', tx(120), ty(560), 50, 26, z++));
  // Bay B-C: the fallen stones.
  out.push(deco('abandoned_apt_rubble_07', tx(600), ty(558), 110, 62, z++));
  // Bays D-F: the fern, the broken vase, the twig.
  out.push(deco('groddle_fern_1', tx(1094), ty(549), 66, 40, z++));
  out.push(deco('vase_broken_1', tx(1302), ty(578), 60, 58, z++, { id: 'vase_broken_F' }));
  out.push(deco('forest_ground_twigs_03', tx(1034), ty(684), 64, 28, z++));
  // Moss over the floor's front edge at both ends (under the walk line, so nothing stands in front of them).
  out.push(deco('patch_mossy_1', tx(95), ty(700), 230, 64, z++));
  out.push(deco('moss_3', tx(110), ty(730), 250, 58, z++));
  out.push(deco('patch_mossy_1', tx(1830), ty(704), 360, 70, z++, { flip: true }));
  out.push(deco('moss_3', tx(1830), ty(728), 360, 60, z++, { flip: true }));
  // Bay G: the crate before the standing cabinet, the cabinet on its side (mossy), the broken vase.
  out.push(deco('cubicle_cabinet_stack', tx(1503), ty(562), 96, 168, z++, { id: 'cabinet_standing' }));
  out.push(deco('cubicle_cabinet_stack', tx(1546), ty(516), 92, 166, z++, { r: 90, id: 'cabinet_lying_G' }));
  out.push(deco('patch_mossy_1', tx(1612), ty(492), 70, 22, z++));
  out.push(deco('crate_1', tx(1494), ty(598), 118, 100, z++, { id: 'crate_G' }));
  out.push(deco('vase_broken_2', tx(1730), ty(574), 64, 54, z++));
  // Bay H: the sapling.
  out.push(deco('groddle_plant_1', tx(1962), ty(549), 36, 62, z++));
  // The steaming broken pipe end at the front, under the walk line (so nothing stands in front of it).
  out.push(deco('steam_stream', tx(213), ty(690), 44, 150, z++, { id: 'steam' }));
  out.push(deco('ladder_pipe_1', tx(215), ty(806), 60, 136, z++, { id: 'pipe_end' }));
  return out;
}

/** In front of the avatar (screen space, the near plane): the crate and the framing shadows. */
function missingForegroundDecos() {
  const out = [];
  let z = 300;
  out.push(deco('crate_1', 933, 684, 136, 114, z++, { id: 'crate_front' }));
  out.push(deco('box_blur_1', MW / 2, 886, MW + 1200, 187, z++));
  // The template's left end and its corner of the floor sit in shadow.
  out.push(deco('tree_int_vertical_shadow', 200, 435, 988, 254, z++, { r: -90 }));
  return out;
}

function missingLayers() {
  // The template's room is a cold green-grey under the night (walls ~0x616D68, floor ~0x595E46, the beam ~0x303633).
  const tint = { tintColor: 0x3a7068, tintAmount: 48 };
  return [
    { id: 'T_missingfloor_sky', name: 'sky', z: -3, w: MW, h: MH, decos: missingNightDecos(), filters: { ...tint, contrast: -4, brightness: -46, saturation: -36 } },
    { id: 'T_missingfloor_ceiling', name: 'ceiling', z: -2, w: MW, h: MH, decos: missingCeilingShellDecos(), filters: { ...tint, contrast: -4, brightness: -80, saturation: -40 } },
    { id: 'T_missingfloor_floor', name: 'floor', z: -1, w: MW, h: MH, decos: missingFloorShellDecos(), filters: { ...tint, contrast: -4, brightness: -10, saturation: -30 } },
    { id: 'middleground', name: 'middleground', z: 0, w: MW, h: MH, decos: [...missingShellDecos(), ...missingSkyDecos(), ...missingWallDecos(), ...missingCeilingDecos(), ...missingWallPropDecos(), ...missingFloorBackDecos()], filters: { ...tint, contrast: -4, brightness: -46, saturation: -36 } },
    { id: 'T_missingfloor_front', name: 'middleplus', z: 1, w: MW, h: MH, decos: missingForegroundDecos(), filters: { ...tint, contrast: -8, brightness: -50, saturation: -36 } },
  ];
}

/**
 * The missing floor's street JSON. No signposts or doors: the teleporters
 * are the only ways in and out. The vine is a ladder up to the wall's top trim.
 */
export function missingFloorStreet() {
  const platforms = [
    { id: 'plat_missing_floor', x1: ML, y1: MISSING_FLOOR_Y, x2: MR, y2: MISSING_FLOOR_Y, pc_perm: -1 },
    { id: 'plat_missing_shelf', x1: MISSING_VINE.shelf.x1, y1: MISSING_VINE.shelf.y, x2: MISSING_VINE.shelf.x2, y2: MISSING_VINE.shelf.y, pc_perm: -1 },
    { id: 'plat_missing_ceiling', x1: ML, y1: MISSING_CEILING_Y, x2: MR, y2: MISSING_CEILING_Y, pc_perm: 1 },
  ];
  const ladders = [{ id: 'ladder_missing_vine', x: MISSING_VINE.x, y: MISSING_VINE.bottom, w: 50, h: MISSING_VINE.bottom - MISSING_VINE.top }];
  const ls = missingLayers();
  const decoCount = ls.reduce((n, l) => n + l.decos.length, 0);
  return {
    source: MISSING_FLOOR_SOURCE,
    reconstructed: true,
    tsid: MISSING_FLOOR_TSID,
    label: MISSING_FLOOR_LABEL,
    hubId: MISSING_FLOOR_HUB.hubId,
    hubName: MISSING_FLOOR_HUB.hubName,
    swf_file: 'bldg_int_apt.swf',
    bounds: { ...MISSING_FLOOR_BOUNDS },
    platforms,
    layers: ls,
    signposts: [],
    stats: { platformCount: platforms.length, layerCount: ls.length, decoCount, signpostCount: 0, doorCount: 0, ladderCount: ladders.length, barrierCount: 0 },
    // The night through the arches (template glass ~0x0E3845 at the top to ~0x082430 at the sill).
    gradient: { top: '10404E', bottom: '08262E' },
    ladders,
    why: {
      street: 'inc_data_maps_prod.js 16033 (hub 51 Uralia), template LDOKP2FHL8J25AQ (18461) beside the lost and forgotten floors\' (18459-18460); no location XML. config_prod.js 1331 teleportation_ok_streets.',
      look: 'The stitched 2012 full-street template (FullStreetTemplates/Uralia/The missing floor.png, 2000x750 at 1:1): every deco, its order, position and size; the night windows, the bulbs on two ropes, the filing cabinets and the painted EXIT arrow.',
      guide: 'glitch-strategy 2011-12 guide to hidden locations: "climbable vines, ripped posters and dripping faucets a plenty" (the vine is a ladder).',
      shell: 'The forgotten floor\'s apartment hall pieces (GDOOSA8V29J24I3.xml), sized to the template\'s panels.',
      ways: 'In from the 2011-12-15 ledge in Ilmenskie\'s top-right corner; out at the right end, past the arrow, as on both sibling floors. Teleporter boxes and landings are inferred.',
    },
  };
}

/** The index.json row. */
export function missingFloorIndexEntry(street = missingFloorStreet()) {
  return {
    label: MISSING_FLOOR_LABEL,
    file: `assets/streets/${MISSING_FLOOR_TSID}.json`,
    hubId: MISSING_FLOOR_HUB.hubId,
    hubName: MISSING_FLOOR_HUB.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}

/* ------------------------------------------------------------------ */
/* Goorsh Gam's canopy                                                 */
/* ------------------------------------------------------------------ */

/**
 * The client's walk against the remake's (the puzzle streets'
 * SOURCE_PHYSICS, js/puzzle-triggers.js: vx_max 335 vs 264 px/s; the jump
 * and gravity are the client's everywhere now, js/avatar-step.js). Goorsh
 * Gam's treetop route was laid for the client's run: its one hop from
 * plat_1323982673191 (-2169, -595) up to plat_1323982673206 (-2354, -708)
 * needs 113 px of rise over 185 px. Up in the canopy the street moves as
 * the client did.
 */
export const CANOPY_PHYSICS = Object.freeze({ speed: 335 / 264, jump: 1, gravity: 1 });
/** Feet above this world y (the forest floor is -20..-85, the lowest canopy -466) count as in the canopy. */
export const CANOPY_Y = -300;
export const isGoorshGamTsid = (tsid) => isTsid(tsid, GOORSH_GAM_TSID);

/* ------------------------------------------------------------------ */
/* Ilmenskie's top-right corner                                        */
/* ------------------------------------------------------------------ */

/**
 * The 2011-12-15 pass in Ilmenskie (GIF102FDNU11314.xml): a ledge
 * (plat_1323982673210, x 2668..2739, y -890, solid from the top) closed on
 * its right by wall_1323982673212 (x 2739, y -999..-891) and under its left
 * end by wall_1323982673211 (x 2688, y -887..-823), both solid only to an
 * avatar moving right (pc_perm -1, Wall.as pc_solid_from_left), over three
 * ceilings (plat_1323982673207-209, platform_pc_perm 1: PlatformLine.as
 * pc_solid_from_bottom only) stepping down from the wall's foot to the
 * street's right edge at y -688. The ceilings shut the corner off from the
 * cave mouth under it (the Entrance ledge, pl1271412363973 at y -438), so the
 * only way up is from the left: a running jump off the mushroom caps
 * (pl1271412334381, x 2434..2541, y -469) that carries the avatar 300+ px up
 * into the corner. In the client that is a quick Triple Jump at full speed
 * (calcTripleJumpMultiplier 1.5 + 0.3 x vx_perc: up to 1.8 x vy_jump, ~430
 * px with the client's gravity); a standing one tops out near 300 px.
 */
export const ILMENSKIE_CEILINGS = Object.freeze(['plat_1323982673207', 'plat_1323982673208', 'plat_1323982673209']);
/** The mushroom cap the running jump leaves from (pl1271412334381, world y). */
export const ILMENSKIE_LAUNCH_Y = -469;
/** Feet this many px over the cap reach the teleporter (head level with the ledge, as the item's hit box would be). */
export const ILMENSKIE_RISE = 310;
/**
 * World x from which Ilmenskie's right end moves as the client did: the
 * ground under the cave mouth, the slope up to the mushroom caps
 * (pl1271412282623 starts 130 px over the ground: a client jump, 133 px,
 * not the remake's 105), the caps and the Entrance ledge.
 */
export const ILMENSKIE_ZONE = Object.freeze({ x: 1900, y: 0 });
/**
 * The avatar's head reach for ceiling bumps: the client's head circle top, 111 px over
 * the feet at scale 1 (street-model.js avatarHeadReach), and the circle's centre, 95 px.
 */
export const AVATAR_BODY_H = 111;
export const AVATAR_HEAD_CENTRE = 95;

/** Ceilings as screen-space segments for a street whose platforms list them (the source's pc_perm 1 lines). */
export function ceilingsScreen(street, ids = ILMENSKIE_CEILINGS) {
  if (!street?.bounds) return [];
  const { l, t } = street.bounds;
  return (street.platforms || []).concat(street._hiddenFloorCeilings || [])
    .filter((p) => ids.includes(p.id) && Number(p.pc_perm) === 1)
    .filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i)
    .map((p) => {
      const a = { x: p.x1 - l, y: p.y1 - t };
      const b = { x: p.x2 - l, y: p.y2 - t };
      return a.x <= b.x ? { id: p.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y } : { id: p.id, x1: b.x, y1: b.y, x2: a.x, y2: a.y };
    });
}

/** Ceiling y over screen x, or null. */
export function ceilingAt(ceilings, x) {
  let best = null;
  for (const c of ceilings) {
    if (x < c.x1 || x > c.x2) continue;
    const y = c.x2 === c.x1 ? Math.max(c.y1, c.y2) : c.y1 + ((x - c.x1) / (c.x2 - c.x1)) * (c.y2 - c.y1);
    if (best === null || y > best) best = y;
  }
  return best;
}

/**
 * A head moving from (px, py - body) to (x, y - body) that crosses a ceiling
 * from below stops under it: returns the clamped feet y, or null when clear.
 */
export function bumpCeiling(ceilings, px, py, x, y, body = AVATAR_BODY_H, centre = AVATAR_HEAD_CENTRE) {
  if (!(y < py)) return null;
  const c = ceilingAt(ceilings, x);
  if (c === null) return null;
  const head = y - body;
  if (head >= c) return null;
  const before = ceilingAt(ceilings, px);
  if (py - centre < (before ?? c) - 1) return null; // already over it
  return Math.min(c + body, py);
}

/* ------------------------------------------------------------------ */
/* Teleporters (items/teleporter.js)                                   */
/* ------------------------------------------------------------------ */

/**
 * Peak of a jump at `multiplier` times the plain jump speed under `gravity`
 * (or a whole buff, as buffPhysics gives it), stepped with the game's own
 * frame (js/avatar-step.js jumpApex: the client's gravity, vy_jump, vy_max
 * and friction_air). `triple` lets it rise at twice vy_max, as a triple jump
 * does. A plain jump peaks at ~142 px.
 */
export function jumpApex(multiplier = 1, gravity = 1, { triple = false } = {}) {
  const buff = typeof gravity === 'object' && gravity ? { ...NORMAL_BUFF, ...gravity } : { ...NORMAL_BUFF, gravity };
  return stepperJumpApex(multiplier, buff, { triple });
}
export const PLAIN_JUMP_APEX = jumpApex(1);

/** Odena Odes' floor under the ceiling pocket (plat_1311895253649, world y at x 1316). */
export const ODENA_POCKET_FLOOR_Y = -157;
/** How far above that floor the feet must rise to reach the teleporter. */
export const ODENA_RISE = 384;

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
  Object.freeze({
    id: 'ilmenskie_to_missing',
    objref: 'IUVKH29S4BJ2IS6',
    from: ILMENSKIE_TSID,
    to: MISSING_FLOOR_TSID,
    label: MISSING_FLOOR_LABEL,
    // World x 2600..2740: the ledge (2668..2739) and the air left of it, up from feet 310 px over the mushroom cap (y -779) to the street's top.
    box: Object.freeze({ x: 5670, y: 1000 + ILMENSKIE_LAUNCH_Y - ILMENSKIE_RISE, w: 140, h: 1000 + ILMENSKIE_LAUNCH_Y - ILMENSKIE_RISE }),
    // World (-800, -150): the left of the hall, the Snaps' stretch ahead.
    arrive: Object.freeze({ x: 200, y: 600 }),
    why: 'Ilmenskie\'s one teleporter (LIF102FDNU11314.xml 4093), UV like the floor\'s LUV1CSSE49J2P2C, over the ledge of the 2011-12-15 corner. The guide: "a running jump so powerful... a wormhole". Box and landing inferred.',
  }),
  Object.freeze({
    id: 'missing_to_ilmenskie',
    objref: null,
    from: MISSING_FLOOR_TSID,
    to: ILMENSKIE_TSID,
    label: 'Ilmenskie',
    // World x 930..1000: the corner past the painted arrow.
    box: Object.freeze({ x: 1965, y: 650, w: 70, h: 160 }),
    // World (2600, -100): the ground under the corner, by the mushroom caps.
    arrive: Object.freeze({ x: 5600, y: 900 }),
    why: 'Inferred: both sibling floors let you out at their right end (twOBlmVrRyI t0093-t0096; r1CBeOmnaFg t0057). No Snap shows this end.',
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
 * bottom-centre); the lost floor's is read off the footage, the missing floor's off
 * its full-street template.
 */
export const EXIT_SIGNS = Object.freeze({
  // Faint grey on the plaster (twOBlmVrRyI t0093).
  [FORGOTTEN_FLOOR_TSID]: Object.freeze({ text: 'EXIT', x: 708 + 1000, y: -301 - 77 / 2 + 750, alpha: 0.5, source: 'GDOOSA8V29J24I3.xml blank_1324050033524 sign_txt' }),
  // White over the pale arrow (r1CBeOmnaFg t0057).
  [LOST_FLOOR_TSID]: Object.freeze({ text: LOST_EXIT_SIGN.text, ...screen(LOST_EXIT_SIGN.x, LOST_EXIT_SIGN.y), alpha: 0.8, source: `footage ${LOST_EXIT_SIGN.footage}` }),
  // Pale grey on the painted arrow, smaller than its siblings' (the 2012 full-street template, x 1612-1668).
  [MISSING_FLOOR_TSID]: Object.freeze({ ...MISSING_EXIT_SIGN, alpha: 0.75, fontSize: 24, source: 'FullStreetTemplates/Uralia/The missing floor.png' }),
});

/** Streets whose avatar moves as the client did in part of the street (CANOPY_PHYSICS), as screen-space zones. */
export function clientPhysicsZone(street) {
  if (!street?.bounds) return null;
  const { l, t } = street.bounds;
  if (isGoorshGamTsid(street.tsid)) return { minX: -Infinity, maxY: CANOPY_Y - t };
  if (isIlmenskieTsid(street.tsid)) return { minX: ILMENSKIE_ZONE.x - l, maxY: ILMENSKIE_ZONE.y - t };
  return null;
}

export function exitSignOn(tsid) {
  const key = Object.keys(EXIT_SIGNS).find((k) => isTsid(tsid, k));
  return key ? EXIT_SIGNS[key] : null;
}
