/**
 * The Hall of Rejected Concepts (Jethimadh Tower: Mid), rebuilt: pure data
 * and a builder (no Pixi, no DOM). features/mid-tower-feature.js draws the
 * exhibits and runs their buttons; tools/build-tower-rooms.mjs writes the
 * street JSON (through js/tower-mid-rooms.js, which lists the room).
 *
 * Source facts:
 *   inc_data_maps_prod.js: LA9L33D5CNE3I0J "Hall of Rejected Concepts" in hub
 *     96 "Jethimadh Tower: Mid" (line 16979; an earlier copy LA938MQUKHE3522
 *     sits in hub 77, line 16614). Neither is in the public locations dump,
 *     so the template's geometry and objects are lost.
 *   items/wall_button.js (+ wall_switch): the exhibit buttons. Label "Wall
 *     Button", one-click verb "press" (tooltip "Press", key E,
 *     disable_proximity), switch_mode "resetting": press sets the button in
 *     (state "in", then "lockIn" after 500 ms), fires the instance's
 *     on_press_down location events, and after reset_timer (1000 ms) pops it
 *     back out ("out", then "lockOut") and fires on_reset; a press farther
 *     than `distance` (1000 px) does nothing. The Hall's own on_press_down
 *     events were in the lost template.
 *   glitch-client Announcement.as / InWindowAnnouncementOverlay.as: the
 *     in-window announcement with click_to_advance_bottom ("Click
 *     anywhere..."), the overlay the buttons raised.
 *   tinyspeck/glitch-locations source/quests/museum_*.swf (CC0): every
 *     exhibit, and museum_stand_1 the plinth (js/hall-concepts-art.js).
 *     museum_abbasidss_1, museum_flyingkitties_1 and museum_woodtree_1 are in
 *     the same set but in no Snap or recording, so they are left out.
 * Reference only (player content, never shipped as pixels, audio or text):
 *   S  ten player Snaps, research/wayback/raw/snaps/jtower_hall_rejected_concepts/
 *      (2012-11-19 .. 2012-12-09): the warm wooden hall, pointed windows, low
 *      plinths with a red button each, the exhibits in order.
 *   V  two player recordings, reference-videos/raw/-03T3bLY7a0.mp4 (Lily
 *      Linguistic, 3:21) and E6BIN3OfEkI.mp4 (ehrlenmeyerflask, 2:09): the
 *      Mezzanine door and its plaque, the arrival door (a "Mezzanine" plaque
 *      and an arrow sign), the whole walk left to right, each button raising
 *      a big white caption with "Click anywhere...", and the loading-screen
 *      panorama (spotlight per exhibit, window spacing).
 *   F  forum general/29729 (2012-11-21, Kukubee): opened "next to the Rook
 *      Museum in Jethimadh tower"; replies: "accessible from Tower St West".
 * The captions the buttons raised survive only in V (and fragments in S/F
 * captions), so they are not shipped: each button raises the exhibit's name
 * (its SWF's name). Recovered text: research/wayback/README.md section 6, G73.
 *
 * Layout (world px, floor y 0): exhibit order from V; spacing from V and S
 * measured against the CC0 art's own size (a Snap is ~0.7 world scale, a
 * recording frame ~0.55); plinth widths and heights from S; exhibits at
 * their SWF stage size. Remake: the room's height, the wall and floor art
 * (the tower's own jethimadh_int set) and the spotlight sizes.
 */

import { DOOR, barriersFor, flat, plaque } from './tower-challenge-rooms.js?v=challenge-rooms-2';
import { HALL_ART, HALL_ART_ROOT } from './hall-concepts-art.js';

export const HALL_TSID = 'GA9L33D5CNE3I0J';
export const HALL_SOURCE_TSID = 'LA9L33D5CNE3I0J';
export const HALL_BUTTON_CLASS = 'wall_button';
export { HALL_ART, HALL_ART_ROOT };

/** items/wall_button.js + wall_switch (instance defaults). */
export const WALL_BUTTON = Object.freeze({
  label: 'Wall Button',
  verb: 'press',
  verbLabel: 'Press',
  tooltip: 'Press',
  resetMs: 1000, // reset_timer
  lockMs: 500, // setState: "in" -> "lockIn" after 500 ms
  distance: 1000, // instance prop distance
  // The art the remake already ships for wall_button (lockOut / lockIn, 36 x 35 in getAssetInfo).
  artOut: 'assets/sprites/quest-rooms/clubhouse/wall_button_lockOut.png',
  artIn: 'assets/sprites/quest-rooms/clubhouse/wall_button_lockIn.png',
  w: 36,
  h: 35,
});

/** The client's in-window announcement advance label (InWindowAnnouncementOverlay.as). */
export const CLICK_ANYWHERE = 'Click anywhere...';

/**
 * museum_stand_1 measured on its trimmed render (122 x 58): the box is the
 * middle 0.672 of the width (the rest is its drop shadow) and 51 px tall,
 * ending 7 px over the shadow's foot; the top face is its upper 20 px and
 * exhibits rest 9 px down it. A plinth's `w` is the box width.
 */
export const STAND = Object.freeze({ rest: 9, foot: 7, h: 51, box: 0.672 });

export const HALL = Object.freeze({
  bounds: Object.freeze({ l: 0, r: 5300, t: -780, b: 300 }),
  floor: 0,
  // S: plinths stand at the back of the floor, the avatar walks in front of them.
  back: -28,
  doorX: 230,
  arrowX: 450,
  windows: Object.freeze([650, 1490, 2390, 3330, 3690, 4505]),
  windowSize: Object.freeze({ w: 80, h: 178, bottom: -140 }),
});

/**
 * The exhibits, left to right (V). `pieces`: museum art and its centre x
 * offset; `plinth`: museum_stand_1 width (null: on the floor, or `float` px
 * over it with no plinth); `button`: { dx, y } when the button is not on the
 * plinth front (floor exhibits: it hangs on the wall).
 */
export const HALL_EXHIBITS = Object.freeze([
  { id: 'rube', label: 'The Rube', x: 1060, pieces: [['museum_rube_1', 0]], plinth: 120 },
  { id: 'fox', label: 'The Fox', x: 1310, pieces: [['museum_fox_1', 0]], plinth: 110 },
  { id: 'craftybot', label: 'The Craftybot', x: 1560, pieces: [['museum_craftybot_1', 0]], plinth: 130 },
  { id: 'butler', label: 'The Butler', x: 1815, pieces: [['museum_butler_1', 0]], plinth: 100 },
  { id: 'deimaginators', label: 'The Deimaginators', x: 2085, pieces: [['museum_deimaginator_1', 0]], plinth: 230 },
  {
    id: 'street_spirits',
    label: 'The Street Spirits',
    x: 2470,
    pieces: [['museum_ssgroddle_1', -90], ['museum_ssgroddle_2', 95]],
    plinth: null,
    float: 46,
    button: { dx: -175, y: -24 },
  },
  { id: 'bunny', label: 'A Bunny', x: 2790, pieces: [['museum_bunny_1', 0]], plinth: 110 },
  { id: 'dragons', label: 'The Dragons', x: 3060, pieces: [['museum_dragon_1', 0]], plinth: 160 },
  { id: 'vendors', label: 'The Food and Gardening Vendors', x: 3420, pieces: [['museum_foodvendor_1', -58], ['museum_gardeningvendor_1', 62]], plinth: 270 },
  { id: 'wish_dolly', label: 'The Wish Dolly', x: 3715, pieces: [['museum_wishdolly_1', 0]], plinth: 100 },
  { id: 'playerator', label: 'The Playerator', x: 3900, pieces: [['museum_playerator_1', 0]], plinth: 96 },
  { id: 'tools', label: 'The Tools', x: 4205, pieces: [['museum_tools_1', 0]], plinth: null, button: { dx: -30, y: -80 } },
  { id: 'stactus', label: 'The Stactus', x: 4560, pieces: [['museum_stactus_1', 0]], plinth: 130 },
  { id: 'avatars', label: 'The Avatars', x: 4950, pieces: [['museum_avatars_1', 0]], plinth: null, button: { dx: -200, y: -72 } },
]);

/** World placement of every exhibit sprite, plinth and button (bottom-centre anchors, floor y 0). */
export function hallLayout() {
  const floor = HALL.back;
  return HALL_EXHIBITS.map((ex) => {
    const plinth = ex.plinth ? { x: ex.x, y: floor + STAND.foot, w: Math.round(ex.plinth / STAND.box), h: HALL_ART.museum_stand_1.h, box: ex.plinth } : null;
    const base = plinth ? floor - STAND.h + STAND.rest : floor - (ex.float || 0);
    const pieces = ex.pieces.map(([art, dx]) => ({ art, x: ex.x + dx, y: base, w: HALL_ART[art].w, h: HALL_ART[art].h }));
    const button = ex.button
      ? { x: ex.x + ex.button.dx, y: floor + ex.button.y }
      : { x: ex.x, y: floor - 8 };
    return { id: ex.id, label: ex.label, x: ex.x, plinth, pieces, button };
  });
}

/** The room as a tower-room record (js/tower-mid-rooms.js lists it with the Stairs and the Mezzanine). */
export function buildHall({ hub, mezzanine }) {
  const { bounds, floor, doorX, arrowX, windows, windowSize } = HALL;
  const platforms = [];
  const decos = [];
  const c = { platforms, decos };
  const W = bounds.r - bounds.l;

  // Wall: the corridors' wood backdrop tiled along the hall and on under the floor, the corridors'
  // (remake; S: a warm wooden hall, darker overhead).
  const tile = 760;
  for (let x = bounds.l + tile / 2 - 60, i = 0; x < bounds.r + tile / 2; x += tile, i += 1) {
    decos.push({ sprite: 'jethimadh_int_bg_center', x, y: bounds.b + 60, w: tile + 120, h: bounds.b - bounds.t + 120, z: i % 2, r: 0, layer: 'mg' });
  }
  // firebog_linear_gradient_shadow is black, opaque over its left 55 % and fading out to the right;
  // turned 90 degrees it darkens the ceiling (opaque side up), turned -90 the floor (opaque side down).
  const run = 700;
  for (let x = bounds.l - 100; x < bounds.r + 100; x += run) {
    decos.push({ sprite: 'firebog_linear_gradient_shadow', x, y: bounds.t + 260, w: 520, h: run + 2, z: 3, r: 90, layer: 'mg' });
    decos.push({ sprite: 'firebog_linear_gradient_shadow', x: x + run, y: HALL.back + 150, w: 300, h: run + 2, z: 3, r: -90, layer: 'mg' });
  }
  // Pointed windows (S, V: jethimadh_tower_window_1, the tower's own window).
  windows.forEach((x, i) => {
    decos.push({ sprite: 'jethimadh_tower_window_1', x, y: floor + windowSize.bottom, w: windowSize.w, h: windowSize.h, z: 5 + i, r: 0, layer: 'mg' });
  });
  // A spotlight over every exhibit (V: the loading-screen panorama), doubled: the Rook Hall's cone is faint.
  HALL_EXHIBITS.forEach((ex, i) => {
    for (const k of [0, 1]) decos.push({ sprite: 'rookhall_spotlight', x: ex.x, y: HALL.back - 30, w: 210 - k * 40, h: 680, z: 20 + i * 2 + k, r: 0, layer: 'mg' });
  });
  // Both ends: the corridors' frame caps.
  decos.push(
    { sprite: 'jethimadh_frame_cap', x: bounds.l + 40, y: bounds.b, w: 300, h: bounds.b - bounds.t, z: 9, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_cap', x: bounds.r - 40, y: bounds.b, w: 300, h: bounds.b - bounds.t, z: 9, r: 0, flip: true, layer: 'fg' },
  );
  // V: the arrival door wears a "Mezzanine" plaque; an arrow sign points on to the exhibits.
  plaque(c, doorX, floor - DOOR.h + 4, 'Mezzanine');
  decos.push({ sprite: 'sign_arrow_1', x: arrowX, y: floor - 110, w: 140, h: 93, z: 30, r: 0, layer: 'mg', signText: 'Exhibits' });

  const floorWhy = 'S/V: one level floor the length of the hall, every exhibit on it or on a low plinth.';
  platforms.push(flat('hall_floor', bounds.l + 32, bounds.r - 32, floor, floorWhy));
  platforms.push(flat('hall_ceiling', bounds.l + 40, bounds.r - 40, bounds.t + 35, 'Hall roof (solid from below).', 1));

  const doorWhy = 'V: the Mezzanine door (between the lobby\'s two doors, under a "Hall of Rejected Concepts" plaque) loads the Hall; you arrive at its left end by a door marked "Mezzanine". F 29729: "next to the Rook Museum".';
  return {
    tsid: HALL_TSID,
    sourceTsid: HALL_SOURCE_TSID,
    label: 'Hall of Rejected Concepts',
    hub,
    bounds,
    platforms,
    barriers: barriersFor(bounds, 'hall'),
    decos,
    ladders: [],
    doors: [
      {
        id: 'door_hall_mezzanine',
        x: doorX,
        y: floor,
        ...DOOR,
        connect: { tsid: mezzanine.sourceTsid, label: 'Mezzanine', x: mezzanine.hallDoorX, y: mezzanine.floor, hub_id: hub.hubId },
        why: doorWhy,
      },
    ],
    spots: [],
    exhibits: hallLayout(),
    why: {
      room: 'Maps: LA9L33D5CNE3I0J "Hall of Rejected Concepts" in hub 96. F 29729 (Kukubee, 2012-11-21): "old art, original concepts and lame ideas that never made it into the game", "next to the Rook Museum". S/V: the exhibits on low plinths, a red wall_button each.',
      size: 'V/S: about six screens long (fourteen exhibits at 250-400 px, the arrival door and sign before them, a short run of wall after the Avatars); one screen tall.',
      art: 'Exhibits: tinyspeck/glitch-locations source/quests/museum_*.swf (CC0) at stage size. Wall, windows, spotlights, frame and door: the tower\'s own decos (jethimadh_int_bg_center, jethimadh_tower_window_1, rookhall_spotlight, jethimadh_frame_*, door_asset_jethimadh_int, sign_arrow_1).',
    },
  };
}
