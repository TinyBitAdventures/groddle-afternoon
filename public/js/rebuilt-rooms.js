/**
 * Three places rebuilt from players' pictures (register rows G157, G158,
 * G159): Snowed In, Ethereal Endeavour and Martleby Hare. Pure data and
 * street builders (no Pixi, no DOM); tools/build-rebuilt-rooms.mjs writes the
 * street JSON, the index rows and the doors that lead in, and
 * features/rebuilt-rooms-feature.js gives each its population.
 *
 * None of the three has location XML in tinyspeck/glitch-locations, so the
 * geometry is new. Every deco is Tiny Speck's CC0 street art already in
 * assets/decos/groddle. The pictures (research/flickr-2026-10-27/raw/, all
 * rights reserved, reference only) guided placement; none of their pixels
 * ship.
 *
 * Snowed In (LA9RLGSQ05F3Q69, hub 143 Vortex of Random)
 * - GSJS: only the map list (inc_data_maps_prod.js:17874). The way in is
 *   Abbasid River's door_1353965313720 (GA9R6BM705F3L3N.xml:1879-1906): an
 *   unlocked door_asset_gray, no key, no level, connect 89,-115, whose swf
 *   list starts with groddle_apt (the apartment art). Abbasid River's
 *   geometry `sources` (:2011) list Snowed In, so the room linked back.
 * - Picture: slivered (Angela S), Flickr 8283569651, 2012-12-18, a full
 *   3110 x 642 render of the room, the size of the 2012 tower basements
 *   (-1555..1555 x -642..0), so it reads at one world px per picture px. A
 *   snowed-up apartment hall: wood-framed bays, eight arched wooden doors
 *   with snow on their lintels, four arched windows onto snowy firs, the
 *   central lift tower with pale double doors, five big drifts and floor
 *   patches, a teleporter beam at the left, and at the right a camp (a
 *   clothesline with three garments, a chair, a stool, a campfire, a green
 *   mat and papers).
 * - Art: the apartment hall pieces (apartment_hall_wall_piece_2 / _window,
 *   _elevator, _wall_side, _floor_piece_1, apartment_filler,
 *   ceiling_tan_ghtest), door_asset_abandoned_apt_1 for the hall doors,
 *   door_asset_elevator_door for the lift (the way out), Teleporter_Base and
 *   Teleporter_Beam, the Alakol snow set (snow_skirt_01b_al1, snow_rubble_*,
 *   snow_cap_01b_al1, snow_pinecluster_01a_al1), snow patches,
 *   hanging_clothes_line and hanging_clothes_1/3/4, deco_chair_wooden_ghtest,
 *   deco_stool_wooden_ghtest, juju_grandma_campfire_01a_al1 and
 *   juju_grandma_papers. The green mat is left out (rug_green, the only green
 *   rug, reads as a hole from the side). The hall doors are art (no apartments behind them
 *   survive); the teleporter is art (its Collision-triggered Teleporter item
 *   and target were never archived). The picture's flagstone floor is the
 *   hall's plank floor here (no CC0 flagstone hall floor), cooled by the
 *   layer's colour.
 *
 * Ethereal Endeavour (LA9EKMN138D3QK2, hub 129 Gentle Island)
 * - GSJS: only the map list (inc_data_maps_prod.js:17711); the older copy
 *   "Old Ethereal Endeavour" (LIF41440AC53N1R, :17702) has no file either.
 *   The way in is Doonboggle Trail's door_1343415170600
 *   (GA94GCF7H3D30IM.xml:1972-1999): door_asset_heights_door_lock, locked
 *   with Door Key 1 (key_id 1, is_locked true), connect -264,-159, swf
 *   newxp.swf then groddle1. Cleops' Old Doonboggle Trail snap (Flickr
 *   8404991657) shows that chained door with its keyhole sign.
 * - Picture: Cleops, Flickr 8406081612, "Old Ethereal Endeavour": a dark teal
 *   cellular room, cells with pink nuclei, neuron threads with red sparks,
 *   floating quoins, and at the left a membrane wall with an oval opening
 *   and the word EXIT. Plexus (GHVDIELDQQ7228K) draws the same cell and
 *   neuron decos, but the door names newxp.swf, and the newxp street "And so
 *   it begins..." (GA614AEMKBD2UCC) holds that art with the membrane and its
 *   oval at the brain's edge. So the room is that street's brain end
 *   (world -2500..-1000, every layer cropped at the same parallax), mirrored
 *   so the membrane stands at the left as in the picture.
 * - The way out is the oval (the picture's EXIT), back to Doonboggle Trail in
 *   front of its door. Remake choice: Doonboggle Trail's 2012-11-05 geometry
 *   `sources` list only High Jumper's Gully, so the archived room did not
 *   link back. The EXIT word is sign_exit_starter_01a, Tiny Speck's EXIT
 *   sign, the nearest CC0 piece to the picture's grey letters.
 *
 * Martleby Hare (LCR14T7ECHM18G8, hub 64 Groddle Heights)
 * - GSJS: inc_data_maps_prod.js:16369; locations/location.js:540 counts it
 *   for explore_the_seams (visit_seam_street, 3 needed); :2789 counts it as on
 *   the map though no hub map draws it. The way in is Rookthills Lay's door_1
 *   (GCR169OSLQL13JR.xml:282-300): groddle_wooden_door_lock, locked with Door
 *   Key 2, connect -613,-1833 (so the street is a tall climb, like the 1500 x
 *   2000 Heights streets). Footlands Heath's geometry `sources`
 *   (GCR14K7RQBK119B.xml:960-966) list Martleby Hare, so it linked to
 *   Footlands Heath; Zog's Glitchy Tools (2012) shows it linked only there.
 *   Rookthills Lay's own sources do not list it: no way back that way.
 * - Pictures: Cleops, Flickr 8411933944 (2013-01): a brown rock cliff face
 *   set with grey pebbles, ledges with moss, a grey slate overhang, and a
 *   stone-arched wooden door at floor level; "not as cool and Donkey
 *   Kong-ish as Vicars Peak", so no ladders. Footlands Heath, cloned from it,
 *   keeps the same door on a walled balcony (heights_door_static at 823,-770;
 *   wall_1293151484079 at x 742 has pc_perm -1, so the pen only opens to the
 *   left), which is where the door lands.
 * - Art: Footlands Heath's own Heights pieces (heights_face_1,
 *   heights_platform_2/_4, heights_topper_2, heights_moss_1/2,
 *   heights_face_rock_3, heights_hole_wall_piece, heights_mound_3,
 *   heights_door_static) and its sky gradient. Zog lists nothing on it (no
 *   trees, animals or rocks).
 */

export const REBUILT_ROOMS_SOURCE = 'research/flickr-2026-10-27 (reference only)';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const deco = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra });
const clone = (value) => JSON.parse(JSON.stringify(value));
const countDecos = (layers) => layers.reduce((n, l) => n + (l.decos?.length || 0), 0);

/** A deterministic 0..1 from an integer (the builder's --check must be stable). */
const rnd = (n) => {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h % 10000) / 10000;
};

/** True for a room under either TSID prefix (G as built, L as GSJS names it). */
const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1) && String(a || '').length > 1;

/** A door row in screen space (bottom-centre), as build-street-navigation writes them. */
function doorRow(bounds, { id, x, y, w, h, sprite, flip }, connect) {
  return {
    id,
    x: Math.round(x - bounds.l),
    y: Math.round(y - bounds.t),
    w,
    h,
    sprite,
    ...(flip ? { flip: true } : {}),
    key_id: 0,
    requires_level: 0,
    is_locked: false,
    hidden: false,
    connect,
  };
}

function streetShell({ source, tsid, label, hub, swf, bounds, platforms, layers, doors, barriers = [], ladders = [], gradient, why }) {
  return {
    source,
    reconstructed: true,
    tsid,
    label,
    hubId: hub.hubId,
    hubName: hub.hubName,
    swf_file: swf,
    bounds: { ...bounds },
    platforms,
    layers,
    signposts: [],
    doors,
    barriers,
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount: countDecos(layers),
      signpostCount: 0,
      doorCount: doors.length,
      ladderCount: ladders.length,
      barrierCount: barriers.length,
    },
    gradient,
    ladders,
    why,
  };
}

function indexRow(street, file = `assets/streets/${street.tsid}.json`) {
  return {
    label: street.label,
    file,
    hubId: street.hubId,
    hubName: street.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}

/* ------------------------------------------------------------------ */
/* Snowed In                                                           */
/* ------------------------------------------------------------------ */

export const SNOWED_IN_TSID = 'GA9RLGSQ05F3Q69';
export const SNOWED_IN_SOURCE_TSID = 'LA9RLGSQ05F3Q69';
export const SNOWED_IN_LABEL = 'Snowed In';
export const SNOWED_IN_HUB = Object.freeze({ hubId: '143', hubName: 'Vortex of Random' });
export const ABBASID_RIVER_TSID = 'GA9R6BM705F3L3N';
export const ABBASID_RIVER_SOURCE_TSID = 'LA9R6BM705F3L3N';
export const ABBASID_RIVER_DOOR = 'door_1353965313720';
/** Abbasid River's door connect x/y: world, in Snowed In. */
export const SNOWED_IN_ARRIVE = Object.freeze({ x: 89, y: -115 });
export const SNOWED_IN_BOUNDS = Object.freeze({ l: -1555, r: 1555, t: -642, b: 0 });
export const SNOWED_IN_FLOOR_Y = -115;
export const SNOWED_IN_CEILING_Y = -560;
export const SNOWED_IN_EXIT_DOOR = 'door_snowed_in_lift';
export const SNOWED_IN_SOURCE_LINE =
  'reconstruction: Snowed In (LA9RLGSQ05F3Q69, not in tinyspeck/glitch-locations); layout from slivered\'s 2012-12-18 render (Flickr 8283569651, reference only), CC0 apartment hall and Alakol snow decos';

/** Back wall base and top (the picture's bays: -176 and -525). */
const SI_WALL_BASE = -176;
const SI_WALL_TOP = -526;

/**
 * The bays between the wood pilasters, world x (picture px - 1555), left to
 * right, with what each holds. The lift tower fills -148..140.
 */
export const SNOWED_IN_BAYS = Object.freeze([
  [-1361, -1143, 'door'], [-1143, -933, 'door'], [-933, -746, 'window'], [-746, -529, 'door'],
  [-529, -311, 'door'], [-311, -148, 'window'], [140, 311, 'window'], [311, 536, 'door'],
  [536, 762, 'door'], [762, 925, 'window'], [925, 1151, 'door'], [1151, 1376, 'door'],
].map(([a, b, kind]) => Object.freeze({ a, b, kind, x: Math.round((a + b) / 2) })));

/** The lift tower (picture: 288 wide, top -549) and its pale double doors, the way out. */
export const SNOWED_IN_LIFT = Object.freeze({ x: -4, w: 330, h: 400, base: -128, door: { x: -12, w: 124, h: 178 } });
/** The teleporter at the left (picture x ~583: emitter -556, pad -121). */
export const SNOWED_IN_TELEPORTER = Object.freeze({ x: -972, w: 196, h: 440, base: -116 });

/** Big drifts against the back wall (picture: centre x, width, height, base). */
const SI_DRIFTS = Object.freeze([
  ['snow_rubble_01b_al1', -1330, 270, 140, -126],
  ['snow_skirt_01b_al1', -760, 330, 300, -140],
  ['snow_rubble_01d_al1', -640, 300, 120, -128],
  ['snow_skirt_01b_al1', -300, 340, 320, -136, true],
  ['snow_rubble_01c_al1', -180, 220, 110, -130],
  ['snow_skirt_01b_al1', 320, 380, 270, -140],
  ['snow_rubble_01a_al1', 430, 300, 100, -130],
  ['snow_skirt_01b_al1', 830, 360, 320, -136, true],
  ['snow_skirt_01a_al1', 780, 120, 290, -150],
  ['snow_rubble_01b_al1', 1290, 230, 170, -122],
]);

function snowedInWallDecos() {
  const out = [];
  let z = 10;
  const h = SI_WALL_BASE - SI_WALL_TOP;
  // End walls in perspective.
  out.push(deco('apartment_hall_wall_side', -1462, -40, 200, 610, z++));
  out.push(deco('apartment_hall_wall_side', 1468, -40, 200, 610, z++, { flip: true }));
  for (const [i, bay] of SNOWED_IN_BAYS.entries()) {
    const w = bay.b - bay.a + 14;
    // Window bays: snowy firs behind the glass, under the wall piece.
    if (bay.kind === 'window') {
      out.push(deco('snow_pinecluster_01a_al1', bay.x, -290, 230, 124, 8, { id: `firs_${i + 1}` }));
      out.push(deco('apartment_hall_wall_piece_window', bay.x, SI_WALL_BASE, w, h, z++, { id: `window_${i + 1}` }));
    } else {
      out.push(deco('apartment_hall_wall_piece_2', bay.x, SI_WALL_BASE, w, h, z++, i % 2 ? { flip: true } : {}));
    }
  }
  // A plain bay behind the lift tower (its art has clear margins).
  out.push(deco('apartment_hall_wall_piece_2', -4, SI_WALL_BASE, 330, h, 9));
  return out;
}

function snowedInShellDecos() {
  const out = [];
  // Ceiling band and beam (picture: a dark band over -642..-561).
  for (const x of [-1000, 300, 1250]) out.push(deco('apartment_filler', x, -548, 1400, 110, 2));
  for (const x of [-1000, -100, 800, 1400]) out.push(deco('ceiling_tan_ghtest', x, -516, 1500, 64, 40));
  for (const x of [-1100, 0, 1100]) out.push(deco('apartment_filler', x, -522, 1200, 40, 39));
  // A stone backing under the floor boards (their angled ends leave gaps).
  for (const x of [-780, 780]) out.push(deco('apartment_filler', x, 4, 1620, 200, 1));
  // Floor boards from the back wall to the front.
  for (const [i, x] of [-1160, -390, 390, 1160].entries()) out.push(deco('apartment_hall_floor_piece_1', x, -30, 1130, 150, 3 + i, i % 2 ? { flip: true } : {}));
  for (const x of [-800, 760]) out.push(deco('apartment_filler', x, 4, 1620, 60, 6));
  out.push(deco('apartment_xsection_top_1', 0, -14, 3200, 36, 7));
  return out;
}

function snowedInDoorDecos() {
  const out = [];
  let z = 50;
  for (const [i, bay] of SNOWED_IN_BAYS.entries()) {
    if (bay.kind !== 'door') continue;
    out.push(deco('door_asset_abandoned_apt_1', bay.x, SI_WALL_BASE + 2, 104, 190, z++, { id: `hall_door_${i + 1}`, ...(i % 2 ? { flip: true } : {}) }));
    out.push(deco('snow_cap_01b_al1', bay.x + (rnd(i + 3) - 0.5) * 16, SI_WALL_BASE - 168, 118, 34, z++));
  }
  // Snow heaped on the window sills.
  for (const [i, bay] of SNOWED_IN_BAYS.entries()) {
    if (bay.kind === 'window') out.push(deco('snow_cap_01b_al1', bay.x, -262, 92, 24, z++, { id: `sill_${i + 1}` }));
  }
  return out;
}

function snowedInLiftDecos() {
  const L = SNOWED_IN_LIFT;
  return [deco('apartment_hall_elevator', L.x, L.base, L.w, L.h, 70, { id: 'lift_tower' })];
}

function snowedInTeleporterDecos() {
  const T = SNOWED_IN_TELEPORTER;
  return [
    deco('Teleporter_Base', T.x, T.base, T.w, T.h, 74, { id: 'teleporter_base' }),
    deco('Teleporter_Beam', T.x, T.base, T.w, T.h, 75, { id: 'teleporter_beam' }),
  ];
}

function snowedInSnowDecos() {
  const out = [];
  let z = 80;
  for (const [sprite, x, w, h, base, flip] of SI_DRIFTS) out.push(deco(sprite, x, base, w, h, z++, flip ? { flip: true } : {}));
  // Scattered snow along the foot of the back wall.
  for (let i = 0; i < 16; i += 1) {
    const x = -1480 + i * 196 + (rnd(i + 41) - 0.5) * 80;
    out.push(deco(i % 2 ? 'whitesnow_splotch_1a_g1' : 'snow_patch_3', x, -150 + rnd(i + 7) * 14, 150 + rnd(i + 9) * 90, 18, z++));
  }
  return out;
}

/** The camp at the right end (picture x 941..1368). */
function snowedInCampDecos() {
  let z = 110;
  return [
    deco('hanging_clothes_line', 1155, -405, 430, 18, z++, { id: 'clothesline' }),
    deco('hanging_clothes_3', 1066, -300, 62, 110, z++),
    deco('hanging_clothes_1', 1150, -322, 52, 78, z++),
    deco('hanging_clothes_4', 1214, -350, 52, 40, z++),
    deco('deco_chair_wooden_ghtest', 1128, -122, 62, 76, z++),
    deco('juju_grandma_papers_01c_al1', 1172, -112, 54, 18, z++),
  ];
}

/** In front of the walk line: floor patches, the front drift, stool, mat, fire, papers. */
function snowedInFrontDecos() {
  const { l, t } = SNOWED_IN_BOUNDS;
  let z = 200;
  const s = (d) => ({ ...d, x: d.x - l, y: d.y - t });
  return [
    deco('snow_rubble_01c_al1', -1430, -36, 230, 110, z++),
    deco('whitesnow_patch_1c_g1', -600, -68, 300, 30, z++),
    deco('whitesnow_patch_1c_g1', 450, -64, 500, 40, z++, { flip: true }),
    deco('whitesnow_splotch_1a_g1', -60, -60, 260, 26, z++),
    deco('deco_stool_wooden_ghtest', 942, -74, 52, 38, z++),
    deco('juju_grandma_campfire_01a_al1', 1074, -60, 96, 96, z++, { id: 'campfire' }),
    deco('juju_grandma_papers_01b_al1', 1290, -46, 44, 26, z++),
  ].map(s);
}

export function snowedInStreet({ abbasidArrive = null, abbasidXY = null } = {}) {
  const B = SNOWED_IN_BOUNDS;
  const W = B.r - B.l;
  const H = B.b - B.t;
  const platforms = [
    { id: 'plat_snowed_in_floor', x1: B.l, y1: SNOWED_IN_FLOOR_Y, x2: B.r, y2: SNOWED_IN_FLOOR_Y, pc_perm: -1 },
    { id: 'plat_snowed_in_ceiling', x1: B.l, y1: SNOWED_IN_CEILING_Y, x2: B.r, y2: SNOWED_IN_CEILING_Y, pc_perm: 1 },
  ];
  const layers = [
    {
      id: 'middleground', name: 'middleground', z: 0, w: W, h: H,
      decos: [...snowedInShellDecos(), ...snowedInWallDecos(), ...snowedInDoorDecos(), ...snowedInLiftDecos(), ...snowedInTeleporterDecos(), ...snowedInSnowDecos(), ...snowedInCampDecos()],
      // A cold hall: the warm apartment pieces greyed towards the picture's stone.
      filters: { saturation: -45, brightness: 4 },
    },
    { id: 'T_snowed_in_front', name: 'middleplus', z: 1, w: W, h: H, decos: snowedInFrontDecos(), filters: { saturation: -10 } },
  ];
  const lift = SNOWED_IN_LIFT.door;
  const doors = [
    doorRow(B, { id: SNOWED_IN_EXIT_DOOR, x: lift.x, y: SNOWED_IN_LIFT.base, w: lift.w, h: lift.h, sprite: 'door_asset_elevator_door' }, {
      tsid: ABBASID_RIVER_SOURCE_TSID,
      label: 'Abbasid River',
      street: ABBASID_RIVER_TSID,
      ...(abbasidXY ? { x: abbasidXY.x, y: abbasidXY.y } : {}),
      hub_id: SNOWED_IN_HUB.hubId,
      ...(abbasidArrive ? { arrive: { ...abbasidArrive } } : {}),
    }),
  ];
  return streetShell({
    source: SNOWED_IN_SOURCE_LINE,
    tsid: SNOWED_IN_TSID,
    label: SNOWED_IN_LABEL,
    hub: SNOWED_IN_HUB,
    swf: 'groddle_apt.swf,groddle1.swf,subway1.swf,abbasid1.swf,zutto1.swf,firebog.swf,alpine_landscape.swf',
    bounds: B,
    platforms,
    layers,
    doors,
    // Pale winter sky through the windows.
    gradient: { top: '9CC8EC', bottom: 'EAF3FB' },
    why: {
      street: 'inc_data_maps_prod.js:17874 (hub 143 Vortex of Random); no location XML, no GSJS code.',
      bounds: 'slivered\'s render is 3110 x 642, the 2012 tower basements\' -1555..1555 x -642..0, so it reads at one world px per picture px.',
      arrival: 'Abbasid River (GA9R6BM705F3L3N.xml:1879) door_1353965313720 connect 89,-115: just right of the lift, on the floor line.',
      layout: 'Twelve bays (eight arched doors, four windows onto snowy firs), the lift tower at the centre, a teleporter beam at the left, five big drifts, floor patches, and the camp at the right end, all at the picture\'s x.',
      wayOut: 'The lift\'s double doors, back to Abbasid River in front of its door (Abbasid River\'s sources list Snowed In).',
      notBuilt: 'The hall doors lead nowhere (no apartments survive) and the teleporter is art (its item and target were never archived). Flagstones are the hall\'s planks. The green mat (no flat green rug in the art) and the owner by the fire are not placed.',
    },
  });
}

/* ------------------------------------------------------------------ */
/* Ethereal Endeavour                                                  */
/* ------------------------------------------------------------------ */

export const ETHEREAL_TSID = 'GA9EKMN138D3QK2';
export const ETHEREAL_SOURCE_TSID = 'LA9EKMN138D3QK2';
export const ETHEREAL_LABEL = 'Ethereal Endeavour';
export const ETHEREAL_HUB = Object.freeze({ hubId: '129', hubName: 'Gentle Island' });
export const DOONBOGGLE_TSID = 'GA94GCF7H3D30IM';
export const DOONBOGGLE_SOURCE_TSID = 'LA94GCF7H3D30IM';
export const DOONBOGGLE_DOOR = 'door_1343415170600';
export const DOONBOGGLE_KEY = 1;
/** Doonboggle Trail's door connect x/y: world, in Ethereal Endeavour. */
export const ETHEREAL_ARRIVE = Object.freeze({ x: -264, y: -159 });
/** "And so it begins..." (newxp.swf), whose brain end the room mirrors. */
export const ETHEREAL_TEMPLATE_TSID = 'GA614AEMKBD2UCC';
/** The template's brain end, world x (its membrane and oval sit at -1235 / -1119). */
export const ETHEREAL_REGION = Object.freeze({ x0: -2500, x1: -1000 });
export const ETHEREAL_BOUNDS = Object.freeze({ l: -750, r: 750, t: -800, b: 0 });
/** The quoins the picture shows floating in one view. */
export const ETHEREAL_QUOINS = 10;
export const ETHEREAL_EXIT_DOOR = 'door_ethereal_exit';
/** The client's view width the parallax rule uses (street-render parallaxLayerOffset). */
const VIEW_W = 960;
/** Brain art only: the template's forest end is not part of the room. */
export const BRAIN_SPRITE = /^(cell|Cellular|neuron|Brain|glowing_orb|newStart_background)/;
export const ETHEREAL_SOURCE_LINE =
  'reconstruction: Ethereal Endeavour (LA9EKMN138D3QK2, not in tinyspeck/glitch-locations); the brain end of "And so it begins..." (GA614AEMKBD2UCC, newxp.swf, tinyspeck/glitch-locations CC0) mirrored, after Cleops\' Old Ethereal Endeavour snap (Flickr 8406081612, reference only)';

/** Template world x -> room world x (mirrored: the template's right edge becomes the room's left). */
export const etherealX = (x) => Math.round(ETHEREAL_REGION.x0 + ETHEREAL_BOUNDS.r - x);

/** Clip a platform to the region and mirror it. */
function mirrorPlatform(p) {
  const { x0, x1 } = ETHEREAL_REGION;
  const lo = Math.min(p.x1, p.x2);
  const hi = Math.max(p.x1, p.x2);
  if (hi <= x0 || lo >= x1) return null;
  const yAt = (x) => p.y1 + ((x - p.x1) / (p.x2 - p.x1 || 1)) * (p.y2 - p.y1);
  const a = Math.max(lo, x0);
  const b = Math.min(hi, x1);
  return { id: `${p.id}_ee`, x1: etherealX(b), y1: Math.round(yAt(b)), x2: etherealX(a), y2: Math.round(yAt(a)), pc_perm: p.pc_perm ?? -1 };
}

/**
 * The template's layers, cropped to the brain end and mirrored. A parallax
 * layer of width lw shows local x in p * (lw - 960) + [0, 960] when the
 * camera is p of the way along; the region is p in 0..pMax, so the room's
 * copy is pMax * (lw - 960) + 960 wide and scrolls exactly as before.
 */
function etherealLayers(template) {
  const srcW = template.bounds.r - template.bounds.l;
  const regionW = ETHEREAL_REGION.x1 - ETHEREAL_REGION.x0;
  const pMax = (regionW - VIEW_W) / (srcW - VIEW_W);
  const out = [];
  for (const layer of template.layers || []) {
    const mid = layer.id === 'middleground';
    const lw = mid ? regionW : Math.round(pMax * (layer.w - VIEW_W) + VIEW_W);
    const decos = [];
    for (const d of layer.decos || []) {
      if (!BRAIN_SPRITE.test(d.sprite)) continue;
      if (mid ? d.x < ETHEREAL_REGION.x0 - 200 || d.x > ETHEREAL_REGION.x1 + 200 : d.x < -400 || d.x > lw + 400) continue;
      const x = mid ? etherealX(d.x) : lw - d.x;
      const copy = { ...clone(d), x };
      if (copy.r) copy.r = -copy.r;
      if (d.flip) delete copy.flip;
      else copy.flip = true;
      decos.push(copy);
    }
    if (!decos.length) continue;
    out.push({ ...clone({ ...layer, decos: [] }), w: mid ? regionW : lw, decos });
  }
  return out;
}

/** The oval in the mirrored membrane (template oval centre x -1119, its floor -174). */
export const ETHEREAL_OVAL = Object.freeze({ x: etherealX(-1119), floor: -174 });

export function etherealStreet(template, { doonboggleArrive = null, doonboggleXY = null } = {}) {
  if (!template || String(template.tsid) !== ETHEREAL_TEMPLATE_TSID) throw new Error(`template must be ${ETHEREAL_TEMPLATE_TSID}`);
  const B = ETHEREAL_BOUNDS;
  const layers = etherealLayers(template);
  const mid = layers.find((l) => l.id === 'middleground');
  // The picture's EXIT word, over the oval's right side.
  mid.decos.push(deco('sign_exit_starter_01a', ETHEREAL_OVAL.x + 70, -470, 92, 54, 30, { id: 'ethereal_exit_sign' }));
  // The template's step down beyond the oval (outside the brain) is not part of
  // the room: the oval's floor runs on to the left bound instead.
  const platforms = (template.platforms || []).map(mirrorPlatform).filter((p) => p && p.x2 > ETHEREAL_OVAL.x + 20);
  const oval = platforms.find((p) => p.x1 <= ETHEREAL_OVAL.x + 20);
  if (!oval) throw new Error('no floor at the oval');
  oval.x1 = B.l;
  oval.y1 = ETHEREAL_OVAL.floor;
  // The template's floor starts 3 px in from its edge: run it to the right bound.
  const last = platforms.reduce((m, p) => (p.x2 > m.x2 ? p : m));
  last.x2 = B.r;
  // Only the template's upper wall (over the oval's arch) stays: the lower one fenced the step.
  const barriers = (template.barriers || [])
    .filter((w) => w.x > ETHEREAL_REGION.x0 && w.x < ETHEREAL_REGION.x1 && w.y < ETHEREAL_OVAL.floor - 100)
    .map((w) => ({ ...clone(w), id: `${w.id}_ee`, x: etherealX(w.x) }));
  const doors = [
    doorRow(B, { id: ETHEREAL_EXIT_DOOR, x: ETHEREAL_OVAL.x + 8, y: ETHEREAL_OVAL.floor, w: 120, h: 150, sprite: 'glowing_orb_dull' }, {
      tsid: DOONBOGGLE_SOURCE_TSID,
      label: 'Doonboggle Trail',
      street: DOONBOGGLE_TSID,
      ...(doonboggleXY ? { x: doonboggleXY.x, y: doonboggleXY.y } : {}),
      hub_id: ETHEREAL_HUB.hubId,
      ...(doonboggleArrive ? { arrive: { ...doonboggleArrive } } : {}),
    }),
  ];
  return streetShell({
    source: ETHEREAL_SOURCE_LINE,
    tsid: ETHEREAL_TSID,
    label: ETHEREAL_LABEL,
    hub: ETHEREAL_HUB,
    swf: 'newxp.swf,groddle1.swf',
    bounds: B,
    platforms,
    layers,
    doors,
    barriers,
    // newStart_background's teal, the brain's own backdrop.
    gradient: { top: '4A7270', bottom: '283A3C' },
    why: {
      street: 'inc_data_maps_prod.js:17711 (hub 129 Gentle Island); Old Ethereal Endeavour LIF41440AC53N1R :17702; no location XML.',
      arrival: 'Doonboggle Trail (GA94GCF7H3D30IM.xml:1972) door_1343415170600 connect -264,-159, locked with Door Key 1; swf newxp.swf.',
      art: 'The snap\'s cells, neurons and membrane are the newxp brain decos Plexus also draws; the door names newxp.swf, whose street "And so it begins..." keeps them at its brain end with the membrane and oval. Cropped at the same parallax and mirrored so the membrane is at the left, as in the snap.',
      wayOut: 'The oval in the membrane (the snap\'s EXIT), back to Doonboggle Trail in front of its door. Remake choice: Doonboggle Trail\'s 2012-11-05 sources do not list the room.',
      quoins: `The snap shows ${ETHEREAL_QUOINS} quoins (info, energy, currants, mood) floating in one view.`,
      notBuilt: 'The template\'s forest end, and Plexus\'s blue tint (the snap is teal like the newxp brain).',
    },
  });
}

/* ------------------------------------------------------------------ */
/* Martleby Hare                                                       */
/* ------------------------------------------------------------------ */

export const MARTLEBY_TSID = 'GCR14T7ECHM18G8';
export const MARTLEBY_SOURCE_TSID = 'LCR14T7ECHM18G8';
export const MARTLEBY_LABEL = 'Martleby Hare';
export const MARTLEBY_HUB = Object.freeze({ hubId: '64', hubName: 'Groddle Heights' });
export const ROOKTHILLS_TSID = 'GCR169OSLQL13JR';
export const ROOKTHILLS_SOURCE_TSID = 'LCR169OSLQL13JR';
export const ROOKTHILLS_DOOR = 'door_1';
export const ROOKTHILLS_KEY = 2;
/** Rookthills Lay's door connect x/y: world, in Martleby Hare. */
export const MARTLEBY_ARRIVE = Object.freeze({ x: -613, y: -1833 });
export const FOOTLANDS_TSID = 'GCR14K7RQBK119B';
export const FOOTLANDS_SOURCE_TSID = 'LCR14K7RQBK119B';
/** Footlands Heath's balcony, in front of its door deco (world; _pl1290625625207 742..999 at -764). */
export const FOOTLANDS_BALCONY = Object.freeze({ x: 800, y: -764 });
export const MARTLEBY_BOUNDS = Object.freeze({ l: -750, r: 750, t: -2000, b: 0 });
export const MARTLEBY_EXIT_DOOR = 'door_martleby_footlands';
export const MARTLEBY_SOURCE_LINE =
  'reconstruction: Martleby Hare (LCR14T7ECHM18G8, not in tinyspeck/glitch-locations); layout after Cleops\' 2013-01 snap (Flickr 8411933944, reference only) and Footlands Heath, cloned from it; art CC0 groddle1 Heights decos as on Footlands Heath';

/**
 * Ledge tiers, top to bottom: walk line y and ledge segments [x0, x1]
 * (world). The top ledge takes Rookthills Lay's door (-613,-1833); each
 * ledge ends where the next one starts, so a walk off its open end drops to
 * the next (no ladders: "not as Donkey Kong-ish as Vicars Peak").
 */
export const MARTLEBY_TIERS = Object.freeze([
  { id: 'm0', y: -1833, segs: [[-750, -250]], why: "Rookthills Lay's door lands at -613,-1833" },
  { id: 'm1', y: -1515, segs: [[-450, 750]] },
  { id: 'm2', y: -1200, segs: [[-750, 300]] },
  { id: 'm3', y: -885, segs: [[-300, 750]] },
  { id: 'm4', y: -570, segs: [[-750, 350]], why: 'the mossy ledge with the grey slate under its right end (snap)' },
  { id: 'm5', y: -255, segs: [[-750, 750]], why: 'the door ledge: a stone-arched door right of centre (snap)' },
].map((t) => Object.freeze({ ...t, segs: Object.freeze(t.segs.map((s) => Object.freeze(s))) })));

/** The stone-arched door (snap: floor level, right of centre; Footlands' balcony door is the same art). */
export const MARTLEBY_DOOR = Object.freeze({ x: 230, tier: 5, w: 164, h: 176, sprite: 'heights_door_static' });

const ML = MARTLEBY_BOUNDS.l;
const MR = MARTLEBY_BOUNDS.r;
const MT = MARTLEBY_BOUNDS.t;
const MB = MARTLEBY_BOUNDS.b;

function martlebyFaceDecos() {
  const out = [];
  const s = 0.6;
  const [lw, lh] = [1684 * s, 1152 * s];
  let k = 0;
  for (let y = MT - 60; y < MB + lh; y += 470) {
    const row = Math.round((y - MT) / 470);
    for (let x = ML - 200 + (row % 2) * 330; x < MR + 400; x += 660) {
      out.push(deco('heights_face_1', x, y + lh, lw, lh, 1 + (k % 4), k % 2 ? { flip: true } : {}));
      k += 1;
    }
  }
  for (let i = 0; i < 12; i += 1) {
    out.push(deco('heights_hole_wall_piece', ML + 80 + rnd(i + 21) * 1340, MT + 160 + rnd(i + 81) * 1760, 141 * 1.2, 148 * 1.2, 6, i % 2 ? { flip: true } : {}));
  }
  // Grey pebbles set in the face (snap: everywhere).
  for (let i = 0; i < 30; i += 1) {
    out.push(deco(i % 2 ? 'heights_ladder_1' : 'heights_ladder_2', ML + 40 + rnd(i + 311) * 1420, MT + 60 + rnd(i + 411) * 1900, 146 * 0.26, 158 * 0.26, 9, i % 3 ? {} : { flip: true }));
  }
  return out;
}

const M_LEDGES = Object.freeze({ heights_platform_2: [902, 416], heights_platform_4: [1026, 434] });
const M_LEDGE_ORDER = ['heights_platform_2', 'heights_platform_4'];
const M_LEDGE_S = 0.5;
const M_SINK = 12;

function martlebyLedgeDecos() {
  const out = [];
  MARTLEBY_TIERS.forEach((tier, ti) => {
    tier.segs.forEach(([x0, x1], si) => {
      const from = Math.max(ML - 60, x0 - 16);
      const to = Math.min(MR + 60, x1 + 16);
      const span = to - from;
      const n = Math.max(1, Math.ceil(span / (900 * M_LEDGE_S * 0.8)));
      for (let i = 0; i < n; i += 1) {
        const sprite = M_LEDGE_ORDER[(ti + i) % 2];
        const [lw, lh] = M_LEDGES[sprite];
        const w = Math.min(lw * M_LEDGE_S, span / n + 70);
        const h = lh * M_LEDGE_S;
        out.push(deco(sprite, from + (i + 0.5) * (span / n), tier.y - M_SINK + h, w, h, 20 + ti * 4 + (i % 3), { id: `ledge_${tier.id}_${si + 1}_${i + 1}`, ...((ti + i) % 2 ? { flip: true } : {}) }));
      }
      // Rounded toppers along the lip (Footlands' heights_topper_2).
      for (let x = from + 60; x < to - 40; x += 150) out.push(deco('heights_topper_2', x + (rnd(ti * 50 + x) - 0.5) * 30, tier.y + 18, 145, 61, 44 + ti));
    });
  });
  // Below the door ledge: the cliff's foot to the street bottom.
  let k = 0;
  for (let x = ML - 40; x < MR + 160; x += 444 * 0.62 * 0.8) {
    out.push(deco('heights_platform_1', x, MB + 40, 444 * 0.62, 380 * 0.62, 18 + (k % 2), k % 2 ? { flip: true } : {}));
    k += 1;
  }
  return out;
}

function martlebyDetailDecos() {
  const out = [];
  let z = 60;
  // Moss on the ledges (snap: olive patches on the ledges and the floor in front of the door).
  for (const [x, ti, w] of [[-560, 4, 300], [-120, 4, 220], [-520, 5, 330], [560, 5, 300], [120, 2, 200], [500, 1, 240], [-640, 0, 180], [420, 3, 220]]) {
    out.push(deco('heights_moss_2', x, MARTLEBY_TIERS[ti].y + 12, w, w * 0.22, z++, ti % 2 ? { flip: true } : {}));
  }
  out.push(deco('heights_moss_1', -380, MARTLEBY_TIERS[4].y + 70, 160, 87, z++));
  out.push(deco('heights_moss_1', 600, MARTLEBY_TIERS[1].y + 70, 160, 87, z++, { flip: true }));
  // The grey slate overhang under the mossy ledge's right end (snap, top right).
  out.push(deco('heights_face_rock_3', 250, MARTLEBY_TIERS[4].y + 150, 375, 139, z++));
  out.push(deco('heights_face_rock_3', -420, MARTLEBY_TIERS[2].y + 140, 300, 111, z++, { flip: true }));
  // Mounds at the foot of the face on the door ledge.
  out.push(deco('heights_mound_3', -380, MARTLEBY_TIERS[5].y + 8, 420, 160, 14));
  out.push(deco('heights_mound_3', 600, MARTLEBY_TIERS[5].y + 8, 380, 144, 14, { flip: true }));
  return out;
}

export function martlebyStreet({ footlandsArrive = null } = {}) {
  const B = MARTLEBY_BOUNDS;
  const W = B.r - B.l;
  const H = B.b - B.t;
  const platforms = [];
  for (const tier of MARTLEBY_TIERS) {
    tier.segs.forEach(([x0, x1], si) => platforms.push({ id: `plat_mh_${tier.id}_${si + 1}`, x1: x0, y1: tier.y, x2: x1, y2: tier.y, pc_perm: -1 }));
  }
  const layers = [{ id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: [...martlebyFaceDecos(), ...martlebyLedgeDecos(), ...martlebyDetailDecos()] }];
  const door = MARTLEBY_DOOR;
  const doors = [
    doorRow(B, { id: MARTLEBY_EXIT_DOOR, x: door.x, y: MARTLEBY_TIERS[door.tier].y, w: door.w, h: door.h, sprite: door.sprite }, {
      tsid: FOOTLANDS_SOURCE_TSID,
      label: 'Footlands Heath',
      street: FOOTLANDS_TSID,
      x: FOOTLANDS_BALCONY.x,
      y: FOOTLANDS_BALCONY.y,
      hub_id: '58',
      ...(footlandsArrive ? { arrive: { ...footlandsArrive } } : {}),
    }),
  ];
  return streetShell({
    source: MARTLEBY_SOURCE_LINE,
    tsid: MARTLEBY_TSID,
    label: MARTLEBY_LABEL,
    hub: MARTLEBY_HUB,
    swf: 'groddle1.swf',
    bounds: B,
    platforms,
    layers,
    doors,
    // Footlands Heath's gradient (GCR14K7RQBK119B.xml:956-959).
    gradient: { top: '5EE0FF', bottom: 'E8FEFD' },
    why: {
      street: 'inc_data_maps_prod.js:16369 (hub 64); location.js:540 explore_the_seams, :2789 on the map; no location XML.',
      bounds: "Rookthills Lay's door lands at -613,-1833, so the street is a tall climb: the 1500 x 2000 of the Heights climbs (Vicar's Peak, Jacob's Climb).",
      tiers: 'Six ledges ~315 px apart, each ending over the next: you arrive at the top left and drop down to the door.',
      door: 'Snap 8411933944: a stone-arched wooden door at floor level right of centre, ledges with moss above, a grey slate overhang (heights_door_static, as on Footlands Heath\'s balcony).',
      wayOut: "Footlands Heath's sources list Martleby Hare; the door lands on Footlands' walled balcony in front of the same door art (its pen opens only to the left, so it is an arrival spot). Rookthills Lay's sources do not list it, so there is no way back that way.",
      population: "Zog's Glitchy Tools (2012) lists nothing on it.",
      notBuilt: 'No ladders (the snap\'s title: not as Donkey Kong-ish as Vicar\'s Peak).',
    },
  });
}

/* ------------------------------------------------------------------ */
/* Index rows and ecology                                              */
/* ------------------------------------------------------------------ */

export const snowedInIndexEntry = (street) => indexRow(street);
export const etherealIndexEntry = (street) => indexRow(street);
export const martlebyIndexEntry = (street) => indexRow(street);

export const isSnowedInTsid = (tsid) => sameTsid(tsid, SNOWED_IN_TSID);
export const isEtherealTsid = (tsid) => sameTsid(tsid, ETHEREAL_TSID);
export const isMartlebyTsid = (tsid) => sameTsid(tsid, MARTLEBY_TSID);

/**
 * The ecology rows (build-street-ecology.mjs cannot write them: no location
 * XML). Indoors for the two rooms: nothing spawned; Ethereal Endeavour keeps
 * the snap's quoins. Martleby Hare is outdoors with Zog's empty count.
 */
export function rebuiltRoomEcology(tsid) {
  if (isSnowedInTsid(tsid)) return { label: SNOWED_IN_LABEL, sourceTsid: SNOWED_IN_SOURCE_TSID, counts: {}, interior: true, interiorWhy: 'a hall indoors (slivered\'s render)', quoins: 0, reconstructed: true };
  if (isEtherealTsid(tsid)) return { label: ETHEREAL_LABEL, sourceTsid: ETHEREAL_SOURCE_TSID, counts: {}, interior: true, interiorWhy: 'a cellular room (Cleops\' snap)', quoins: ETHEREAL_QUOINS, companions: false, reconstructed: true };
  if (isMartlebyTsid(tsid)) return { label: MARTLEBY_LABEL, sourceTsid: MARTLEBY_SOURCE_TSID, counts: {}, reconstructed: true };
  return null;
}

/** The three rooms, for the builder and the tests. */
export const REBUILT_ROOMS = Object.freeze([
  Object.freeze({ tsid: SNOWED_IN_TSID, sourceTsid: SNOWED_IN_SOURCE_TSID, label: SNOWED_IN_LABEL, register: 'G157', from: ABBASID_RIVER_TSID, door: ABBASID_RIVER_DOOR, key: 0, arrive: SNOWED_IN_ARRIVE }),
  Object.freeze({ tsid: ETHEREAL_TSID, sourceTsid: ETHEREAL_SOURCE_TSID, label: ETHEREAL_LABEL, register: 'G159', from: DOONBOGGLE_TSID, door: DOONBOGGLE_DOOR, key: DOONBOGGLE_KEY, arrive: ETHEREAL_ARRIVE }),
  Object.freeze({ tsid: MARTLEBY_TSID, sourceTsid: MARTLEBY_SOURCE_TSID, label: MARTLEBY_LABEL, register: 'G158', from: ROOKTHILLS_TSID, door: ROOKTHILLS_DOOR, key: ROOKTHILLS_KEY, arrive: MARTLEBY_ARRIVE }),
]);

