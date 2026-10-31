/**
 * Jethimadh Tower: Mid (hub 96): the Stairs and the Mezzanine, rebuilt (pure
 * data and a builder: no Pixi, no DOM). The Museum of the Rook itself is the
 * transient quest instance in game.js (js/rook-museum.js, production template
 * LA91BDTNHS82D36); these two streets are the walk to it.
 *
 * Neither street is in the public locations dump. What survives:
 *   inc_data_maps_prod.js hub 96 "Jethimadh Tower: Mid": LIFFUV4ATQ72I6D
 *     "Stairs", LIFGJ2246R72LJL "Mezzanine", LIFH35R0HR72BHV "Rook Museum",
 *     LIFPV9EMLT72DP4 "unnnn", LA9L33D5CNE3I0J "Hall of Rejected Concepts".
 *   Tower St West's archived door door_1313235999202 (the tower's back door,
 *     world -37,-197) -> Stairs, arriving at -2463,-191.
 *   unnnn (the Stoot Shrine, imported as GIFPV9EMLT72DP4) was cloned from the
 *     Mezzanine: its G XML has `sources { LIFGJ2246R72LJL: 1 }`. Its two
 *     archived deco layers (T_1311832165202 spotlights, T_1311832941302
 *     shadows) carry deco ids from 2011-07-28, the Mezzanine's build week
 *     (the museum opened in the 2011-08-11 test), and are street-sized, so they
 *     scroll with the middleground: the Mezzanine keeps them at the same world
 *     positions. Its bounds (-500..500, -700..0) and floor (y -12) are the
 *     clone's too.
 *   GSJS items/npc_quest_giver_widget.js: Greeterbot Sentry G-42, variant
 *     widgetWood, its no-quest line, the hall_repeat conversation and
 *     enterHall (instance LA91BDTNHS82D36, arrival -2270,-136).
 * Player record, each element carrying a `why`:
 *   B  Glitch Strategy beta recap 2011-08-19: "visit Tower St. West, climb the
 *      Stairs to reach the Mezzanine, and enter the door to the Rook museum";
 *      "the locked door to the Hall of Records (next door)".
 *   N  Glitch blog 2011-08-23 "Getting around": "Enter the Tower via the giant
 *      door on Tower St. West in Jethimadh, and ascend the stairway to the
 *      Mezzanine. If you have been chosen, you will be invited to enter the
 *      Rook Museum."
 *   H  Glitch Strategy "Guide to Hidden Locations" (2011-12): "in the lobby to
 *      the Rook Museum, you'll find (with a little investigation) an entrance
 *      to below the floorboards"; comment: "Left + Up + Space".
 *   F  Forum 13777 "Unnnn": "the hidden space under the floor in Jethimadh
 *      mezzanine"; "Head left (when you're in the floor space) and take
 *      spinach"; "just keep jumping, pressing left". Forum 29729 (2012-11):
 *      the Hall of Rejected Concepts "next to the Rook Museum".
 *   V  Two player recordings of the Hall (reference-videos/raw/-03T3bLY7a0,
 *      E6BIN3OfEkI): the Mezzanine's Hall door under a "Hall of Rejected
 *      Concepts" plaque; the Hall itself is js/hall-rejected-concepts.js.
 * Art is the tower's own CC0 set (firebog.swf jethimadh_int_*, frame, ladder,
 * lock door; the Rook Hall spotlights) and the Greeterbot's own SWF
 * (glitch-items inhabitants/widget_bot npc_widget.swf, symbol widgetWood,
 * frame 1 exported at 2x); no pixels from screenshots or video.
 *
 * tools/build-tower-rooms.mjs writes the three street JSON files (Stairs,
 * Mezzanine, Hall of Rejected Concepts) with the base tower rooms and links
 * Tower St West's door.
 */

import { towerRoomIndexEntry } from './tower-rooms.js?v=eeebce6f';
import { DOOR, anyTowerRoomStreet, barriersFor, collector, flat, ladder, plaque, shell } from './tower-challenge-rooms.js?v=8877b6a7';
import { HALL, HALL_TSID, buildHall } from './hall-rejected-concepts.js?v=4c553550';

export const STAIRS_TSID = 'GIFFUV4ATQ72I6D';
export const MEZZANINE_TSID = 'GIFGJ2246R72LJL';
export const STOOT_SHRINE_TSID = 'GIFPV9EMLT72DP4';
export const TOWER_ST_WEST_TSID = 'GIF5UU8FO3029OK';
export { HALL_TSID };
export const MID_TOWER_HUB = Object.freeze({ hubId: '96', hubName: 'Jethimadh Tower: Mid' });
export const MID_TOWER_SOURCE = 'reconstruction: Jethimadh Tower Mid (not in tinyspeck/glitch-locations); doors, names and the Mezzanine\'s clone data from the archive, the rest from player records; art from the tower\'s CC0 set';

/** Greeterbot Sentry G-42 (GSJS npc_quest_giver_widget). */
export const GREETERBOT = Object.freeze({
  classId: 'npc_quest_giver_widget',
  label: 'Greeterbot Sentry G-42',
  variant: 'widgetWood',
  art: 'assets/sprites/quests/rook-museum/greeterbot_widgetWood_idle@2x.png',
  // npc_quest_giver_widget classProps.no_quest_text (overrides npc_quest_widget's).
  noQuestText: 'I\'m afraid one cannot simply enter the Museum of the Rook on a whim, little Glitch. One must be called to do so.',
  // conversation_run_hall_repeat, offered once rook_hall is done.
  repeatQuestion: 'Would you like to return to the Museum of the Rook, in order to review its artifacts?',
  repeatYes: 'Yes.',
  repeatNo: 'No.',
  repeatDeclined: 'Very well then. Please speak with me again if you are ever so inclined.',
  repeatDeclinedResponse: 'Will do.',
});

export const MUSEUM_DOOR_ID = 'door_mezz_museum';
export const STOOT_TELEPORTER_ID = 'mezz_stoot_teleporter';

/* ------------------------------------------------------------------ */
/* Stairs (LIFFUV4ATQ72I6D)                                             */
/* ------------------------------------------------------------------ */

/**
 * Corridor Four (GTJ10K7P3812R8F), the archived corridor that climbs: its
 * floor and roof platforms [x1, y1, x2, y2, pc_perm] and its middleground and
 * FG decos [layer, sprite, x, y, w, h, z, r, flip] in world space. The C4
 * door plaques and the east/west divider (frame_wall_left, divider_middle)
 * are left out: they belong to C4's own doors and halves.
 */
const C4_PLATFORMS = Object.freeze([
  [-1675, -411, -1339, -409, -1], [-1339, -409, -1314, -427, -1], [-1314, -427, -1173, -430, -1], [-1173, -430, -1144, -451, -1],
  [-1144, -451, -866, -453, -1], [-866, -453, -839, -474, -1], [-839, -474, -658, -479, -1], [-658, -479, -617, -509, -1],
  [-617, -509, -534, -508, -1], [-534, -508, -385, -506, -1], [-385, -506, -354, -527, -1], [-354, -527, -72, -527, -1],
  [-72, -527, -49, -543, -1], [-49, -543, 26, -542, -1], [183, -561, 393, -569, -1], [393, -569, 425, -590, -1],
  [425, -590, 601, -597, -1], [601, -597, 636, -628, -1], [636, -628, 860, -627, -1], [860, -627, 892, -647, -1],
  [892, -647, 1174, -648, -1], [1174, -648, 1200, -665, -1], [1200, -665, 1344, -668, -1], [1344, -668, 1372, -684, -1],
  [1372, -684, 1599, -684, -1],
  [-1675, -702, -1537, -811, 1], [-1537, -811, -1217, -914, 1], [-1217, -914, -483, -995, 1], [-483, -995, 21, -1036, 1],
  [21, -1036, 760, -1084, 1], [760, -1084, 1084, -1093, 1], [1084, -1093, 1191, -1100, 1], [1191, -1100, 1367, -1083, 1],
  [1367, -1083, 1494, -1043, 1], [1494, -1043, 1599, -964, 1],
]);

const C4_DECOS = Object.freeze([
  ['mg', 'jethimadh_int_bg_right', 1043, -518, 1291, 625, 0, -5, false],
  ['mg', 'jethimadh_int_bg_left', -1026, -333, 1312, 615, 1, -5, false],
  ['mg', 'jethimadh_int_bg_center', 20, -425, 964, 629, 2, -5, false],
  ['mg', 'jethimadh_int_bg_shadow_50percent', -22, -445, 3346, 583, 3, -5, false],
  ['mg', 'jethimadh_int_steps_1', -929, -307, 1645, 230, 4, 0, true],
  ['mg', 'jethimadh_int_steps_1', 334, -427, 1645, 230, 5, 0, true],
  ['mg', 'jethimadh_int_steps_1', 1586, -542, 1645, 230, 8, 0, true],
  ['fg', 'jethimadh_int_lantern_1', 502, -535, 353, 533, 0, 0, false],
  ['fg', 'jethimadh_int_lantern_1', -207, -480, 353, 533, 1, 0, false],
  ['fg', 'jethimadh_int_lantern_1', -1013, -399, 353, 533, 3, 0, false],
  ['fg', 'jethimadh_int_lantern_1', 1318, -568, 353, 533, 4, 0, false],
  ['fg', 'jethimadh_int_pillar_1', 1056, -586, 185, 530, 5, 0, false],
  ['fg', 'jethimadh_int_pillar_1_mod', -1393, -355, 192, 550, 6, 0, true],
  ['fg', 'jethimadh_int_pillar_1_mod', -694, -422, 202, 579, 7, 0, true],
  ['fg', 'jethimadh_int_frame_50percent', -18, -412, 3419, 645, 8, -5, false],
]);

/** Corridor Four's floor start and end (its first and last floor points). */
const C4_LOW = Object.freeze({ x: -1675, y: -411 });
const C4_HIGH = Object.freeze({ x: 1599, y: -684 });

/**
 * One length of tube: Corridor Four moved by (dx, dy). Its platforms and its
 * steps, pillars and lanterns go in as they are; its wood backdrops too, but
 * not its frame or frame shadow (`skip`): the Stairs draw one frame round the
 * whole tube (see buildStairs).
 */
function flight(c, id, { dx, dy, why, skip = new Set() }) {
  C4_PLATFORMS.forEach(([x1, y1, x2, y2, pc], i) => {
    c.platforms.push({ id: `plat_${id}_${String(i).padStart(2, '0')}`, x1: x1 + dx, y1: y1 + dy, x2: x2 + dx, y2: y2 + dy, pc_perm: pc, why });
  });
  // C4 splits into halves with a wall slab between x 26 and 183 (walls
  // 1304666165704/5); the Stairs have no halves, so a step bridges the slot.
  c.platforms.push({ id: `plat_${id}_bridge`, x1: 26 + dx, y1: -542 + dy, x2: 183 + dx, y2: -561 + dy, pc_perm: -1, why: `${why} Corridor Four's east/west wall slot (x 26-183) is bridged.` });
  for (const [layer, sprite, x, y, w, h, z, r, flip] of C4_DECOS) {
    if (skip.has(sprite)) continue;
    const deco = { sprite, x: x + dx, y: y + dy, w, h, z, r, layer };
    if (flip) deco.flip = true;
    c.decos.push(deco);
  }
  return { low: { x: C4_LOW.x + dx, y: C4_LOW.y + dy }, high: { x: C4_HIGH.x + dx, y: C4_HIGH.y + dy } };
}

/**
 * Turn a room's platforms and decos about a pivot by `deg` (negative: the
 * right-hand end rises). Decos are anchored bottom-centre and turn about that
 * anchor, so the anchor moves and the turn adds to each deco's own r.
 */
function tilt(c, pivot, deg) {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const turn = (x, y) => {
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    return [Math.round(pivot.x + dx * cos - dy * sin), Math.round(pivot.y + dx * sin + dy * cos)];
  };
  for (const p of c.platforms) {
    [p.x1, p.y1] = turn(p.x1, p.y1);
    [p.x2, p.y2] = turn(p.x2, p.y2);
  }
  for (const d of c.decos) {
    [d.x, d.y] = turn(d.x, d.y);
    d.r = Math.round(((d.r || 0) + deg) * 10) / 10;
  }
  return (pt) => {
    const [x, y] = turn(pt.x, pt.y);
    return { x, y };
  };
}

/** The steepest riser the Stairs keep (degrees): see easeRisers. */
export const STAIRS_MAX_RISER = 25;

/**
 * Lay each steep riser back to STAIRS_MAX_RISER by starting it further
 * left, along the step below (its end moves with it). Corridor Four's risers
 * climb ~36-41 degrees (more once turned); a hop up the tube on a slow frame
 * (FRAME_DT_CAP) moves 11 px a frame and can fall through so steep a riser
 * past resolveGround's catch, out of the tube. `segs` run left to right, each
 * starting where the one before ends.
 */
function easeRisers(segs) {
  const tan = Math.tan((STAIRS_MAX_RISER * Math.PI) / 180);
  for (let i = 1; i < segs.length; i += 1) {
    const p = segs[i];
    const prev = segs[i - 1];
    const rise = p.y1 - p.y2;
    if (rise <= 0 || rise / (p.x2 - p.x1) <= tan || prev.x2 !== p.x1) continue;
    const x1 = Math.round(p.x2 - rise / tan);
    if (x1 <= prev.x1 + 20) continue;
    prev.y2 = Math.round(prev.y1 + ((x1 - prev.x1) / (prev.x2 - prev.x1)) * (prev.y2 - prev.y1));
    prev.x2 = x1;
    p.x1 = x1;
    p.y1 = prev.y2;
  }
}

/**
 * Stairs layout (R5, Tribute Blog post 57559495026, reference only): one
 * long straight tube climbing to the right, the EXIT door at its low left
 * end and the Mezzanine door at its high right end, with about eight
 * pillars and eight lanterns along it. Two Corridor Four lengths end to
 * end, the whole turned 3 degrees steeper about the archived arrival (the
 * picture's tube climbs about 8 degrees; the corridor's own 5).
 */
export const STAIRS = Object.freeze({
  bounds: Object.freeze({ l: -3100, r: 4800, t: -2000, b: 210 }),
  arrival: Object.freeze({ x: -2463, y: -191 }),
  flight1: Object.freeze({ dx: -885, dy: 220 }),
  flight2: Object.freeze({ dx: -885 + (C4_HIGH.x - C4_LOW.x), dy: 220 + (C4_HIGH.y - C4_LOW.y) }),
  tiltDeg: -3,
  mezzDoorX: 4180,
});

/** Frame and shadow are drawn once round the whole tube. */
const STAIRS_SKIP = new Set(['jethimadh_int_frame_50percent', 'jethimadh_int_bg_shadow_50percent']);
/** Extra pillars where the two lengths leave a long bare run (world x before the tilt). */
const STAIRS_PILLARS = Object.freeze([[-700, -278], [2550, -546]]);

function buildStairs() {
  const c = collector();
  const { bounds, arrival, mezzDoorX } = STAIRS;

  const f1Why = 'Corridor Four\'s floor and roof (the archived corridor that climbs, firebog.swf steps art), moved so its first flat carries the archived arrival -2463,-191; B/N "climb the Stairs", "ascend the stairway". R5 (post 57559495026): one straight tube.';
  const f1 = flight(c, 'st_f1', { ...STAIRS.flight1, why: f1Why, skip: STAIRS_SKIP });
  const f2Why = 'Corridor Four again, its low end on the first length\'s high end, so the tube runs on up in one straight climb (R5, post 57559495026).';
  const f2 = flight(c, 'st_f2', { ...STAIRS.flight2, why: f2Why, skip: STAIRS_SKIP });

  // One frame and one shadow round both lengths and on past both doors (R5:
  // each door stands inside the tube's rounded end): Corridor Four's own,
  // stretched, their anchors kept on the tube's line (its slope is the
  // corridor's: 273 up in 3274).
  const slope = (C4_HIGH.y - C4_LOW.y) / (C4_HIGH.x - C4_LOW.x);
  const midX = (bounds.l + bounds.r) / 2;
  const stretch = (sprite, layer, extra = 0) => {
    const [, , x, y, w, h, z, r] = C4_DECOS.find((d) => d[1] === sprite);
    // Corridor Four's own anchor in flight 1, slid along the line to the room's middle.
    const x1 = x + STAIRS.flight1.dx;
    const y1 = y + STAIRS.flight1.dy + (midX - x1) * slope;
    return { sprite, x: Math.round(midX), y: Math.round(y1), w: Math.round(bounds.r - bounds.l - 260 + extra), h, z, r, layer };
  };
  c.decos.push(stretch('jethimadh_int_bg_shadow_50percent', 'mg', -60), stretch('jethimadh_int_frame_50percent', 'fg'));
  // Wood behind the tube's ends past the corridor's own backdrops, and over the join between the two lengths.
  const along = (sprite, x, dyFromC4, w, h, z) => ({ sprite, x: Math.round(x), y: Math.round(dyFromC4 + (x - C4_DECOS.find((d) => d[1] === sprite)[2] - STAIRS.flight1.dx) * slope), w, h, z, r: -5, layer: 'mg' });
  c.decos.push(
    along('jethimadh_int_bg_left', -1026 + STAIRS.flight1.dx - 560, -333 + STAIRS.flight1.dy - 40, 1100, 520, 1),
    along('jethimadh_int_bg_right', 1043 + STAIRS.flight1.dx + (C4_HIGH.x - C4_LOW.x) + 630, -518 + STAIRS.flight1.dy + 10, 1100, 540, 0),
    along('jethimadh_int_bg_center', C4_HIGH.x + STAIRS.flight1.dx, -425 + STAIRS.flight1.dy, 1300, 629, 2),
  );
  for (const [x, y] of STAIRS_PILLARS) {
    c.decos.push({ sprite: 'jethimadh_int_pillar_1', x, y, w: 185, h: 530, z: 9, r: 0, layer: 'fg' });
  }

  // The whole tube 3 degrees steeper, about the arrival (which keeps its floor).
  const turn = tilt(c, arrival, STAIRS.tiltDeg);
  const low = turn(f1.low);
  const high = turn(f2.high);
  easeRisers(c.platforms.filter((p) => /^plat_st_f[12]_\d+$/.test(p.id) && p.pc_perm === -1));

  // Bottom lip from the end wall to the tube, where you arrive.
  const doorWhy = 'Archived: Tower St West door_1313235999202 (the tower\'s back door at world -37,-197) arrives at -2463,-191; the way back out stands there (R5: the EXIT door at the tube\'s low left end).';
  c.platforms.push(flat('st_bottom_lip', bounds.l + 32, low.x, low.y, doorWhy));
  // Top landing: from the tube's high end to the end wall, the Mezzanine door on it.
  const topWhy = 'B "climb the Stairs to reach the Mezzanine"; R5 (post 57559495026): the Mezzanine door at the high right end of the tube, its plaque to the left.';
  c.platforms.push(flat('st_top_lip', high.x, bounds.r - 32, high.y, topWhy));

  // End walls: the corridors' frame caps (the room's ends are black past the tube, R5).
  c.decos.push(
    { sprite: 'jethimadh_frame_cap', x: bounds.l + 50, y: bounds.b, w: 300, h: bounds.b - bounds.t, z: 9, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_cap', x: bounds.r - 50, y: bounds.b, w: 300, h: bounds.b - bounds.t, z: 9, r: 0, flip: true, layer: 'fg' },
  );
  // Plaques beside the doors at mid height, as the corridors hang theirs: EXIT
  // right of the low door (G72 Snap; R5), "Mezzanine" left of the top one (R5).
  // Both stand in front of the tube's backdrops (z 30+).
  plaque(c, arrival.x + 380, arrival.y - 70, 'EXIT');
  plaque(c, mezzDoorX - 240, high.y - 70, 'Mezzanine');
  for (const d of c.decos) if (d.sprite === 'jethimadh_int_door_sign' || d.sprite === 'firebog_sign_blank') d.z += 30;
  c.platforms.push(flat('st_ceiling', bounds.l + 40, bounds.r - 40, bounds.t + 35, 'Stairwell roof (solid from below).', 1));

  return {
    tsid: STAIRS_TSID,
    sourceTsid: 'LIFFUV4ATQ72I6D',
    label: 'Stairs',
    hub: MID_TOWER_HUB,
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'st'),
    decos: c.decos,
    ladders: [],
    doors: [
      {
        id: 'door_st_tower_st_west',
        x: arrival.x,
        y: arrival.y,
        ...DOOR,
        connect: { tsid: 'LIF5UU8FO3029OK', label: 'Tower St West', x: -37, y: -197, hub_id: '71' },
        why: doorWhy,
      },
      {
        id: 'door_st_mezzanine',
        x: mezzDoorX,
        y: high.y,
        ...DOOR,
        connect: { tsid: 'LIFGJ2246R72LJL', label: 'Mezzanine', x: MEZZ.stairsDoorX, y: MEZZ.floor, hub_id: '96' },
        why: topWhy,
      },
    ],
    spots: [],
    flight: { low, high },
    why: {
      room: 'Maps: LIFFUV4ATQ72I6D "Stairs" in hub 96 "Jethimadh Tower: Mid". B: "visit Tower St. West, climb the Stairs to reach the Mezzanine". N: "Enter the Tower via the giant door on Tower St. West ... and ascend the stairway to the Mezzanine."',
      size: 'R5 (Tribute Blog post 57559495026, a whole-room picture, reference only): one straight tube about 8 degrees up to the right, ~6 corridor lanterns apart end to end. Remake: two Corridor Four lengths (each 3274 wide) end to end from the archived arrival x -2463, turned 3 degrees steeper about it; 300+ px of world under the lowest floor (b 210) like the base rooms.',
      decor: 'G72: Tower St West\'s archived door into the Stairs carries swf_file_versioned .../locations/firebog/1316548751.swf (streets GIF5UU8FO3029OK.xml), the corridors\' bundle, and a player Snap (2012-12-09, jtower_stairs/, reference only) shows the corridor set itself: a tilted curved wooden tube (jethimadh_int_bg_*), stepped sliced-tree "pews" (jethimadh_int_steps_1), a spotted pillar (jethimadh_int_pillar_1), a hanging lantern (jethimadh_int_lantern_1), the arched door (door_asset_jethimadh_int) with an EXIT plaque. R5 (post 57559495026) shows the whole room: one tube, eight pillars and eight lanterns, EXIT plaque right of the low door, "Mezzanine" plaque left of the high one. Corridor Four\'s frame and shadow are stretched over both lengths so the tube reads as one; two pillars are added in its long bare runs.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mezzanine (LIFGJ2246R72LJL)                                          */
/* ------------------------------------------------------------------ */

/**
 * Mezzanine layout (world). R5 (Tribute Blog post 57550578382, a whole-lobby
 * picture, reference only) sets the width and the order of things; its scale
 * comes from two sizes the archive keeps: the Greeterbot's own art (72 x 84,
 * npc_widget.swf) and the corridors' arched door (196 x 214) both read about
 * 1.2 world px to a picture px, so the lobby is ~1,560 wide (the picture's
 * 1,280 px from the left end to the far pillar). Top t, the lobby floor y -12
 * and the Rook Hall spotlights are still unnnn's clone data (its sources list
 * this street); only its 1,000-px width gave way to the picture.
 */
export const MEZZ = Object.freeze({
  bounds: Object.freeze({ l: -780, r: 780, t: -700, b: 800 }),
  floor: -12,
  // The floorboards' bottom edge (solid from below), the crawlspace floor, the lobby roof.
  underside: 170,
  crawl: 440,
  ceiling: -470,
  lobbyTop: -520,
  // The lobby floor ends here; past it, behind the near pillar, is the drop to the crawlspace.
  floorEnd: 700,
  stairsDoorX: -720,
  // The Greeterbot stands in front of the museum door, a little left of its middle (G88, R5).
  greeterX: -78,
  museumDoorX: -60,
  hallDoorX: 390,
  ladderX: 676,
});

/** R5: one pillar between the EXIT arrow and the Rook Museum plaque, two at the far right (the nearer one in front). */
export const MEZZ_PILLARS = Object.freeze([
  Object.freeze({ x: -406, front: false }),
  Object.freeze({ x: 606, front: false }),
  Object.freeze({ x: 682, front: true }),
]);

/**
 * The Mezzanine's sign words (G88, footage i11hPtqFN8E t0000-t0004; R5 post
 * 57550578382 for their places): the EXIT arrow right of the Stairs door,
 * pointing back to it, the "Rook Museum" plaque left of the museum door and
 * the "Hall of Rejected Concepts" plaque left of the Hall door. x world;
 * lift = sign bottom over the floor.
 */
export const MEZZ_SIGNS = Object.freeze([
  Object.freeze({ id: 'exit', text: 'EXIT', arrow: true, x: -556, lift: 148 }),
  Object.freeze({ id: 'rook_museum', text: 'Rook\nMuseum', arrow: false, x: -242, lift: 108 }),
  Object.freeze({ id: 'hall', text: 'Hall of Rejected\nConcepts', arrow: false, x: 208, lift: 104 }),
]);

/**
 * R5 (post 57550578382): six currant quoins in a row in the dark under the
 * floorboards; F 13777 and the 2012 recording d4IOWnzw0Y0 (t0005-t0009: two
 * of them grabbed, "+100 currants" each, at a 4x quoin bonus) make them the
 * 25-currant class. x and the quoin's centre y (world), read off the picture.
 */
export const MEZZ_QUOINS = Object.freeze([
  [-386, 340], [-250, 356], [-104, 340], [74, 362], [241, 348], [430, 368],
].map(([x, y]) => Object.freeze({ x, y, type: 'currants', quoinClass: 'slow medium-large currants' })));

/** unnnn's two archived layers (layer-local, street-sized in the 1,000-px clone: world = local - (500, 700)). */
const UNNNN_SPOTLIGHTS = Object.freeze([
  [195, 294, 405, 337, 90, 8, false], [1088, -44, 176, 630, -117, 6, false], [-55, 295, 176, 630, -271, 1, false],
  [495, -335, 176, 630, -181, 3, false], [1015, 540, 176, 630, -61, 5, false], [49, 618, 176, 630, -308, 4, false],
  [1115, 260, 176, 630, -91, 0, false], [521, 560, 557, 398, 0, 7, false], [-52, -74, 176, 630, -238, 2, false],
  [820, 294, 405, 337, -90, 9, true], [506, -81, 557, 451, -180, 10, false],
]);
const UNNNN_SHADOWS = Object.freeze([
  [84, 703, 331, 1114, 0, 2, false], [924, 703, 331, 1114, 0, 1, true],
]);
const UNNNN_W = 1000;

/**
 * A deco whose opaque band (art rows top..bottom of rows) lands on world
 * y0..y1: the art is drawn whole, bottom-centre anchored.
 */
function band(sprite, x, w, y0, y1, [top, bottom, rows], z, layer = 'mg', extra = {}) {
  const h = Math.round(((y1 - y0) * rows) / (bottom - top));
  return { sprite, x, y: Math.round(y1 + ((rows - bottom) / rows) * h), w, h, z, r: 0, layer, ...extra };
}
/** room_background3a_floor.webp (firebog.swf): its slab fills rows 363..877 of 1,240. */
const FLOOR_ART = [363, 877, 1240];

function buildMezzanine() {
  const c = collector();
  const { bounds, floor, underside, crawl, ceiling, lobbyTop, floorEnd, stairsDoorX, museumDoorX, hallDoorX, ladderX } = MEZZ;
  const W = bounds.r - bounds.l;
  const lobby = { l: bounds.l, r: bounds.r, t: lobbyTop, b: 0 };
  const r5 = 'R5 (Tribute Blog post 57550578382, reference only)';

  // Lobby: the corridors' wooden tube (the shell's wood backdrops, shadow and
  // frame walls) over the picture's width, without the shell's end caps (R5:
  // the Stairs door stands at the very left end, the far pillar at the right).
  // Plain wood behind both ends first, so the tube's curved backdrops never
  // leave the lobby's ends bare; the floor is drawn below, so the shell's
  // frame walls go too.
  const wall = shell(lobby).find((d) => d.sprite === 'jethimadh_int_bg_center');
  for (const x of [bounds.l + 200, bounds.r - 200]) c.decos.push({ ...wall, x, w: 640, z: 0 });
  c.decos.push(...shell(lobby).filter((d) => d.sprite !== 'jethimadh_frame_cap' && d.sprite !== 'jethimadh_frame_wall'));
  c.decos.push({ sprite: 'jethimadh_frame_wall', x: 0, y: ceiling + 20, w: W + 40, h: 44, z: 9, r: 0, layer: 'mg' });
  // unnnn's archived Rook Hall spotlights at their positions (why.decor); its
  // two upright shadows darken the lobby's two ends (R5: the ends are darker
  // wood), set back so their black half lies past the walls and the Stairs
  // door stays lit.
  for (const [x, y, w, h, r, z, flip] of UNNNN_SPOTLIGHTS) {
    const deco = { sprite: 'rookhall_spotlight', x: x - UNNNN_W / 2, y: y + bounds.t, w, h, z: 4 + z, r, layer: 'mg' };
    if (flip) deco.flip = true;
    c.decos.push(deco);
  }
  for (const [x, y, w, h, r, z, flip] of UNNNN_SHADOWS) {
    const wx = x < UNNNN_W / 2 ? bounds.l - 60 : bounds.r + 60;
    const deco = { sprite: 'firebog_linear_gradient_shadow', x: wx, y: y + bounds.t, w, h, z: 20 + z, r, layer: 'fg' };
    if (flip) deco.flip = true;
    c.decos.push(deco);
  }

  // The floor (R5): a dark slab, its walk surface ~40 px deep behind the
  // feet and its face ~100 px down (the firebog set's room floor), then the
  // warm floorboards under it fading into the dark.
  c.decos.push(band('room_background3a_floor', 0, Math.round((W + 60) * (3464 / 3366)), floor - 40, floor + 104, FLOOR_ART, 16));
  c.decos.push(
    { sprite: 'jethimadh_frame_wall', x: 0, y: floor + 112, w: W + 40, h: 30, z: 15, r: 0, layer: 'mg' },
    // Wider than the lobby: the panel's curved ends fall past the walls.
    { sprite: 'jethimadh_int_bg_center', x: 0, y: underside + 6, w: W + 420, h: 96, z: 14, r: 0, layer: 'mg' },
  );

  // Pillars (R5): between the EXIT arrow and the Rook Museum plaque, and two
  // at the far right, the nearer one in front of the floor's edge (the
  // corridors' spotted pillar, jethimadh_int_pillar_1).
  for (const p of MEZZ_PILLARS) {
    if (p.front) c.decos.push({ sprite: 'jethimadh_int_pillar_1', x: p.x, y: floor + 74, w: 180, h: 560, z: 6, r: 0, layer: 'fg' });
    else c.decos.push({ sprite: 'jethimadh_int_pillar_1', x: p.x, y: floor - 10, w: 150, h: 460, z: 18, r: 0, layer: 'mg' });
  }

  // G88 (Austin approved shipping this sign text, 2026-10-23): read off player
  // footage, Lily Linguistic's "Rook Museum" (YouTube i11hPtqFN8E, t0000-t0004)
  // and "Hall of Rejected Concepts" (-03T3bLY7a0, t0000); notes in
  // research/video/README.md section 3c. R5 places them: left to right the
  // Stairs door, a carved arrow sign pointing left reading "EXIT", a pillar,
  // a "Rook Museum" plaque, the museum door with the Greeterbot in front, a
  // "Hall of Rejected Concepts" plaque, the Hall door, two more pillars.
  // Remake text on the set's CC0 art (sign_arrow_1 mirrored, the corridors'
  // plaque at the picture's size).
  for (const sign of MEZZ_SIGNS) {
    if (sign.arrow) {
      c.decos.push({ sprite: 'sign_arrow_1', x: sign.x, y: floor - sign.lift, w: 120, h: 80, z: 30, r: 0, flip: true, layer: 'mg', signText: sign.text });
    } else {
      c.decos.push({ sprite: 'jethimadh_int_door_sign', x: sign.x, y: floor - sign.lift, w: 156, h: 88, z: 31, r: 0, layer: 'mg' });
      c.decos.push({ sprite: 'firebog_sign_blank', x: sign.x, y: floor - sign.lift - 14, w: 116, h: 64, z: 36, r: 0, layer: 'mg', signText: sign.text });
    }
  }

  // Floors: the lobby floor (the clone's platform height) to the drop at its
  // right end, the floorboards' underside (solid from below) clear of the
  // ladder, and the roof.
  const floorWhy = `unnnn's only platform is y -12 (the clone's floor); the lobby keeps it. ${r5} and recording d4IOWnzw0Y0 t0003-t0005: past the far pillar the floor ends and you drop under it.`;
  c.platforms.push(flat('mz_floor', bounds.l + 32, floorEnd, floor, floorWhy));
  c.platforms.push(flat('mz_floor_underside', bounds.l + 32, ladderX - 36, underside, 'The floorboards, solid from below: the crawlspace is left by its ladder (or the teleporter).', 1));
  c.platforms.push(flat('mz_ceiling', bounds.l + 40, bounds.r - 40, ceiling, 'Lobby roof (solid from below).', 1));

  // Below the floorboards: a dark crawlspace the width of the lobby (R5: black under the floorboards).
  const crawlWhy = `F 13777: "the hidden space under the floor in Jethimadh mezzanine"; H: "below the floorboards". ${r5}: black under the floorboards, six quoins in a row ~360 px under the lobby floor; d4IOWnzw0Y0 t0003-t0009: a drop at the far right end, then a walk along under the floor. Remake: the crawlspace floor ~70 px under the quoins, a ladder back up in the drop by the far pillar.`;
  c.decos.push(
    { sprite: 'jethimadh_frame_wall', x: 0, y: crawl + 30, w: W - 40, h: 40, z: 12, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_steps_1c', x: bounds.l + 160, y: crawl + 30, w: 260, h: 60, z: 3, r: 0, layer: 'mg' },
  );
  c.platforms.push(flat('mz_crawl', bounds.l + 32, bounds.r - 32, crawl, crawlWhy));
  const ladders = [ladder(c, 'mz', ladderX, crawl, floor, crawlWhy)];

  const greeterWhy = 'Maps / quests: rook_hall_start sends you to "the Mezzanine in Jethimadh Tower" to "speak to Greeterbot Sentry G-42" (end_npcs npc_quest_giver_widget). V (G88, i11hPtqFN8E t0000-t0004, -03T3bLY7a0 t0000) and R5: it stands in front of the museum door, a little left of its middle.';
  const museumWhy = 'B "enter the door to the Rook museum"; N "If you have been chosen, you will be invited to enter the Rook Museum". The door goes the Greeterbot\'s way: npc_quest_giver_widget.enterHall (LA91BDTNHS82D36, arrive -2270,-136), the remake\'s transient museum.';
  const hallWhy = 'B "the locked door to the Hall of Records (next door)" (2011); forum 29729: the Hall of Rejected Concepts (LA9L33D5CNE3I0J) opened behind it "next to the Rook Museum" in 2012-11. V and R5: the door has a "Hall of Rejected Concepts" plaque to its left and leads to the Hall\'s left end (js/hall-rejected-concepts.js).';
  const stootWhy = 'unnnn\'s objrefs include two Collision-triggered Teleporters (positions lost); H "Left + Up + Space", F 13777 "Head left (when you\'re in the floor space)", "just keep jumping, pressing left"; d4IOWnzw0Y0 t0012-t0031: under the floor, a Spinach jump at the left, then "Entering unnnn". A jump at the crawlspace\'s left end (box 60 px over its floor: a plain jump, spinach not needed) takes you to the Stoot Shrine.';
  const quoinWhy = `${r5}: six currant quoins in a row under the floorboards; d4IOWnzw0Y0 t0005-t0009: grabbed for "+100 currants" each (a 25-currant quoin at a 4x bonus).`;

  return {
    tsid: MEZZANINE_TSID,
    sourceTsid: 'LIFGJ2246R72LJL',
    label: 'Mezzanine',
    hub: MID_TOWER_HUB,
    bounds,
    platforms: c.platforms,
    barriers: barriersFor(bounds, 'mz'),
    decos: c.decos,
    ladders,
    doors: [
      {
        id: 'door_mz_stairs',
        x: stairsDoorX,
        y: floor,
        ...DOOR,
        connect: { tsid: 'LIFFUV4ATQ72I6D', label: 'Stairs', x: STAIRS.mezzDoorX, y: STAIRS_TOP_Y, hub_id: '96' },
        why: `Back down the Stairs (remake: the door the top landing leads to). ${r5}: the arched door at the lobby's left end.`,
      },
      {
        id: MUSEUM_DOOR_ID,
        x: museumDoorX,
        y: floor,
        ...DOOR,
        connect: { tsid: 'LA91BDTNHS82D36', label: 'Museum of the Rook', x: -2270, y: -136, hub_id: '96' },
        why: museumWhy,
      },
      {
        id: 'door_mz_hall',
        x: hallDoorX,
        y: floor,
        ...DOOR,
        connect: { tsid: 'LA9L33D5CNE3I0J', label: 'Hall of Rejected Concepts', x: HALL.doorX, y: HALL.floor, hub_id: '96' },
        why: hallWhy,
      },
    ],
    spots: [],
    teleports: [
      {
        id: STOOT_TELEPORTER_ID,
        x: bounds.l + 60,
        y: crawl - 60,
        w: 120,
        h: 240,
        to: { tsid: STOOT_SHRINE_TSID, label: 'unnnn', x: -380, y: -12 },
        why: stootWhy,
      },
    ],
    quoins: MEZZ_QUOINS.map((q) => ({ ...q, why: quoinWhy })),
    greeterbot: { x: MEZZ.greeterX, y: floor, why: greeterWhy },
    why: {
      room: 'Maps: LIFGJ2246R72LJL "Mezzanine" in hub 96. B/N: the lobby of the Rook Museum, reached up the Stairs, with the museum door, the Greeterbot and the locked Hall of Records next door; H/F: a hidden space under its floorboards that leads on to unnnn.',
      size: `${r5} shows the whole lobby, its left end at the picture's left edge and the far pillar at its right; the Greeterbot's art (72 x 84) and the arched door (196 x 214) put it at ~1.2 world px a picture px, so 1,560 wide (unnnn's clone was 1,000). unnnn's t -700 and floor y -12 are kept. The crawlspace runs below (to y ${crawl}) with ${bounds.b - crawl} px of world under it, so the view never shows past the bottom.`,
      decor: 'Source-exact positions: unnnn layer T_1311832165202 (11 rookhall_spotlight), deco ids of 2011-07-28, at the world positions they had in the clone (street-sized, world = local - (500, 700)); its layer T_1311832941302\'s two upright firebog_linear_gradient_shadow darken the two ends, set back so their black half lies past the walls (R5: the ends are darker wood, the Stairs door still shows) (a third lies along the floor and a fourth duplicates the first, left out so the lobby floor stays lit). Left out: rook_hall_placeholder_painting (no art recovered) and unnnn\'s middleground flash_crasher_demon / water_ripple (the shrine room\'s scene, replaced in 2012). R5: the floor is the firebog set\'s room floor slab (room_background3a_floor) over warm floorboards (jethimadh_int_bg_center) fading to black, three spotted pillars (jethimadh_int_pillar_1), no lanterns. The shell, crawlspace and ladder are the corridors\' art (remake). G88: the EXIT arrow and the two plaques are footage text on the set\'s CC0 sign art (MEZZ_SIGNS).',
    },
  };
}

/** The Stairs' top landing height (the tube's high end, after the tilt), for the Mezzanine's door back down. */
const STAIRS_TOP_Y = (() => {
  const t = (STAIRS.tiltDeg * Math.PI) / 180;
  const dx = C4_HIGH.x + STAIRS.flight2.dx - STAIRS.arrival.x;
  const dy = C4_HIGH.y + STAIRS.flight2.dy - STAIRS.arrival.y;
  return Math.round(STAIRS.arrival.y + dx * Math.sin(t) + dy * Math.cos(t));
})();

/**
 * unnnn's way back up (remake): walking into its left end returns you to the
 * Mezzanine's crawlspace, right of the teleporter. World coordinates in each street.
 */
export const STOOT_RETURN = Object.freeze({
  tsid: STOOT_SHRINE_TSID,
  bounds: Object.freeze({ l: -500, r: 500, t: -700, b: 0 }),
  box: Object.freeze({ x: -470, y: 0, w: 60, h: 300 }),
  to: Object.freeze({ tsid: MEZZANINE_TSID, x: MEZZ.bounds.l + 220, y: MEZZ.crawl }),
  why: 'unnnn\'s second Collision-triggered Teleporter (position lost): the remake puts it at the room\'s left end, the side you came in from, and lands you in the crawlspace beside the teleporter that brought you.',
});

const MEZZANINE_ROOM = buildMezzanine();
const HALL_ROOM = buildHall({ hub: MID_TOWER_HUB, mezzanine: { sourceTsid: MEZZANINE_ROOM.sourceTsid, hallDoorX: MEZZ.hallDoorX, floor: MEZZ.floor } });

export const MID_TOWER_ROOMS = Object.freeze([buildStairs(), MEZZANINE_ROOM, HALL_ROOM]);

/** The archived door that leads into the rebuilt rooms. */
export const MID_TOWER_DOOR_LINKS = Object.freeze([
  { street: TOWER_ST_WEST_TSID, door: 'door_1313235999202', room: STAIRS_TSID },
]);

export const midTowerRoomByTsid = (tsid) => MID_TOWER_ROOMS.find((room) => room.tsid === tsid || room.sourceTsid === tsid) || null;

const toScreen = (bounds, x, y) => ({ x: x - bounds.l, y: y - bounds.t });

/** A world-space bottom-centre box in a street's screen space. */
export function boxToScreen(bounds, box) {
  return { ...box, ...toScreen(bounds, box.x, box.y) };
}

/**
 * The street JSON for a Mid tower room: the base rooms' format (with
 * ladders) and teleporter boxes (screen space, `teleport` = the target and
 * its arrival in the target's screen space, resolved by the builder).
 */
export function midTowerRoomStreet(room) {
  const street = { ...anyTowerRoomStreet(room), source: MID_TOWER_SOURCE };
  for (const t of room.teleports || []) {
    const { why, to, ...box } = t;
    street.boxes.push({ ...boxToScreen(room.bounds, box), teleport: { tsid: to.tsid, label: to.label, x: to.x, y: to.y } });
  }
  return street;
}

/** The index.json row: hub 96 instead of the base rooms' hub 77. */
export function midTowerIndexEntry(room) {
  return { ...towerRoomIndexEntry(room), hubId: MID_TOWER_HUB.hubId, hubName: MID_TOWER_HUB.hubName };
}
