/**
 * The Interrogation room (register row G352), rebuilt from its one archived
 * render as a moderators' room (Austin 2026-11-08: "build it as a moderators'
 * room opened from the console"). Pure data and a street builder (no Pixi, no
 * DOM); tools/build-rebuilt-rooms.mjs writes the street JSON and its index
 * row, and features/interrogation-room-feature.js draws the chair and the
 * light, keeps the way back and runs the door out.
 *
 * Sources
 * - GSJS: only the map list, hub 67 Multiplayer Quests, the developers' hub of
 *   templates and test streets (inc_data_maps_prod.js:17992, "Interrogation";
 *   hub name 301). No location XML in tinyspeck/glitch-locations, no quest,
 *   item, door or signpost leads in: nothing in the released game reached it.
 * - Its render, 2011-03-26 (research/streets-hunt/raw/round45-2026-10-28/
 *   LIFLFPPBUUT11SP_main_1301106549.jpg, 720 x 864, a rehost of the street
 *   image; reference only, never shipped): a dark room, one bulb hanging over a
 *   booth. The booth is a gap in a row of speckled grey office partitions, with
 *   a red-brown chair in it, the waiting-room pictogram over it, and the light
 *   falling off to black on every side.
 * - Street images are drawn 720 px wide (Louise Pasture Villa's 720 x 308 is its
 *   1500 x 642 street), so this street is 720 x 864 times the render's scale.
 *   The scale is 1.5: the partitions are Tiny Speck's cubicle walls
 *   (bldg_int_bhall.swf cubicle_wall_left, _right and _double; 191 px
 *   tall, the render's 128 px), whose 56 px panels are the render's 40 px panels,
 *   and the pictogram bureaucratic_hall_waitingroom_1 (90 px) is its 57 px sign.
 *   So the street is 1080 x 1296 and render (x, y) is street (x * 1.5 - 540,
 *   y * 1.5 - 1296).
 * - The pieces are all from the Bureaucratic Hall's own bundle, bldg_int_bhall.swf
 *   (CC0): the four cubicle walls (they were the "dark speckled panels" the
 *   content lane could not place), the pictogram, the hall's light glow
 *   bureaucratic_hall_light_ray_1 and its interior door. The bulb is groddle1.swf's
 *   hanging_lightbulb. The chair is the hall's waiting chair (drawn into the hall
 *   picture bureaucratic_hall_bg, not a deco of its own), cut out and coloured the
 *   render's red-brown: tools/interrogation/build-chair.mjs. The glitch-items
 *   furniture_bench_theater_chair_red.swf named as a candidate before is a row of
 *   three theatre seats, not this chair.
 *
 * Ours
 * - The way in: the console's "Go to the Interrogation room" for an online
 *   administrator (groddle-afternoon-site src/AdminConsole.php admin/interrogation):
 *   the realtime server's teleport lands them in the booth (INTERROGATION_ARRIVE).
 *   No door leads in for anyone else.
 * - The way out: the hall's interior door at the left, in the dark past the
 *   partitions; it goes back to the street and spot the visitor came from.
 * - The back wall's plaster tone (the street gradient) under the darkness,
 *   the darkness itself (a fixed pool of light round the bulb, drawn by the
 *   feature), and the quiet (no music_file survives).
 * - Not built: the dark beam and the two plastered frames over the partitions
 *   in the render (no CC0 piece found for them).
 */

export const INTERROGATION_TSID = 'GIFLFPPBUUT11SP';
export const INTERROGATION_SOURCE_TSID = 'LIFLFPPBUUT11SP';
export const INTERROGATION_LABEL = 'Interrogation';
/** What players read (toasts, the console, the restoration page). */
export const INTERROGATION_NAME = 'the Interrogation room';
export const INTERROGATION_HUB = Object.freeze({ hubId: '67', hubName: 'Multiplayer Quests' });
export const INTERROGATION_RENDER = Object.freeze({ file: 'research/streets-hunt/raw/round45-2026-10-28/LIFLFPPBUUT11SP_main_1301106549.jpg', w: 720, h: 864 });
/** Street px per render px (see the header). */
export const INTERROGATION_SCALE = 1.5;
export const INTERROGATION_BOUNDS = Object.freeze({ l: -540, r: 540, t: -1296, b: 0 });

/** Render px to world px. */
export const roomX = (rx) => Math.round(rx * INTERROGATION_SCALE + INTERROGATION_BOUNDS.l);
export const roomY = (ry) => Math.round(ry * INTERROGATION_SCALE + INTERROGATION_BOUNDS.t);

/** The floor: the partitions stand on render y 652. */
export const INTERROGATION_FLOOR_Y = roomY(652);
/** The booth (render x 362..419, the gap between the partitions) and its middle. */
export const INTERROGATION_BOOTH = Object.freeze({ l: roomX(362), r: roomX(419), x: roomX(390) });
/** Where a visitor lands, in the booth (world). The console sends it in screen space (INTERROGATION_ARRIVE_SCREEN). */
export const INTERROGATION_ARRIVE = Object.freeze({ x: roomX(390), y: INTERROGATION_FLOOR_Y });
export const INTERROGATION_ARRIVE_SCREEN = Object.freeze({ x: INTERROGATION_ARRIVE.x - INTERROGATION_BOUNDS.l, y: INTERROGATION_ARRIVE.y - INTERROGATION_BOUNDS.t });
/** Where the pool of light is centred (world): under the bulb, between the sign and the seat. */
export const INTERROGATION_LIGHT = Object.freeze({ x: roomX(390), y: roomY(560), rx: 300, ry: 300 });
/** The walkable stretch: walls at both ends, inside the dark (world x). */
export const INTERROGATION_WALLS = Object.freeze({ l: -430, r: 470 });
/** The door out (ours): the hall's interior door, at the left past the partitions (world, bottom-centre). */
export const INTERROGATION_DOOR = Object.freeze({ x: -340, y: INTERROGATION_FLOOR_Y, w: 100, h: 238, sprite: 'door_asset_bureaucratic_hall_int' });
/** The chair (tools/interrogation/build-chair.mjs): drawn by the feature, 1.1 x its 92 x 101 box. */
export const INTERROGATION_CHAIR = Object.freeze({
  url: 'assets/sprites/interrogation/waiting-chair-red.svg',
  x: INTERROGATION_BOOTH.x,
  y: INTERROGATION_FLOOR_Y + 2,
  w: 101,
  h: 111,
});
/** Where the door out goes when no way back was kept (a QA look, a save from before): the fresh start. */
export const INTERROGATION_FALLBACK = Object.freeze({ tsid: 'GA5101HF7F429V5', label: 'Hechey Track' });

export const INTERROGATION_TEXT = Object.freeze({
  door: 'Door',
  doorSub: 'The way back',
  leave: 'Leave',
  leaveTip: 'Back to where you came from',
  arrived: 'You are in the Interrogation room. The door on the left takes you back.',
  busy: 'Not now.',
});

export const INTERROGATION_SOURCE_LINE =
  'reconstruction: Interrogation (LIFLFPPBUUT11SP, hub 67, not in tinyspeck/glitch-locations); layout from its 2011-03-26 render (720 x 864, reference only) at 1.5 street px per render px, CC0 bldg_int_bhall.swf decos (cubicle walls, waiting-room pictogram, light glow, door) and groddle1.swf hanging_lightbulb';

const deco = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra });
const countDecos = (layers) => layers.reduce((n, l) => n + (l.decos?.length || 0), 0);
const sameTsid = (a, b) => String(a || '').length > 1 && String(a || '').slice(1) === String(b || '').slice(1);

/** Layer-local (a full-size layer: world minus the street's top-left). */
const local = (x, y) => ({ x: x - INTERROGATION_BOUNDS.l, y: y - INTERROGATION_BOUNDS.t });

/**
 * The partitions, world x of each piece's bottom centre, in drawing order (render: panels 40 px
 * apart). Left of the booth: the gap's left edge at render x 352 is cubicle_wall_left's panel edge
 * (its side face runs on to 362), with two cubicle_wall_double sections beyond it, each drawn
 * before the piece to its right so that piece covers its cast shadow. Right of the booth: the
 * panels start at render x 428 with cubicle_wall_right, then two doubles. A panel is 56 px, a
 * double's two panels 113 px; the rest of each picture is its shadow.
 */
const LEFT_EDGE = roomX(352) - 56;
const RIGHT_EDGE = roomX(428);
export const INTERROGATION_PARTITIONS = Object.freeze([
  { sprite: 'cubicle_wall_double', x: LEFT_EDGE - 226 + 74.5, w: 149, h: 192 },
  { sprite: 'cubicle_wall_double', x: LEFT_EDGE - 113 + 74.5, w: 149, h: 192 },
  { sprite: 'cubicle_wall_left', x: LEFT_EDGE + 73.5, w: 147, h: 191 },
  { sprite: 'cubicle_wall_right', x: RIGHT_EDGE + 46, w: 92, h: 191 },
  { sprite: 'cubicle_wall_double', x: RIGHT_EDGE + 56 + 74.5, w: 149, h: 192 },
  { sprite: 'cubicle_wall_double', x: RIGHT_EDGE + 169 + 74.5, w: 149, h: 192 },
]);

function boothDecos() {
  return INTERROGATION_PARTITIONS.map((p, i) => {
    const at = local(p.x, INTERROGATION_FLOOR_Y);
    return deco(p.sprite, at.x, at.y, p.w, p.h, i + 1);
  });
}

function lightDecos() {
  // The hall's soft glow, round the bulb and down over the booth.
  const glow = local(INTERROGATION_LIGHT.x, INTERROGATION_LIGHT.y + 353);
  return [deco('bureaucratic_hall_light_ray_1', glow.x, glow.y, 760, 706, 1)];
}

function middlegroundDecos() {
  const D = INTERROGATION_DOOR;
  return [
    // The pictogram over the booth: render x 362..419, bottom at render y 523.
    deco('bureaucratic_hall_waitingroom_1', roomX(390.5), roomY(523), 90, 88, 1),
    // The bulb: its glass at render (390, 428..440); the cord runs up into the dark.
    deco('hanging_lightbulb', roomX(390), roomY(440), 20, 152, 2),
    deco(D.sprite, D.x, D.y, D.w, D.h, 3, { id: 'deco_interrogation_door' }),
  ];
}

/** The room's street JSON. */
export function interrogationStreet() {
  const B = INTERROGATION_BOUNDS;
  const W = B.r - B.l;
  const H = B.b - B.t;
  const y = INTERROGATION_FLOOR_Y;
  const platforms = [
    { id: 'plat_interrogation_floor', x1: B.l, y1: y, x2: B.r, y2: y, pc_perm: -1 },
  ];
  const barriers = [
    { id: 'wall_interrogation_left', x: INTERROGATION_WALLS.l, y: B.t, h: y - B.t, pc_perm: null },
    { id: 'wall_interrogation_right', x: INTERROGATION_WALLS.r, y: B.t, h: y - B.t, pc_perm: null },
  ];
  const layers = [
    { id: 'T_interrogation_light', name: 'light', z: -3, w: W, h: H, decos: lightDecos() },
    // The partitions in the bulb's shade: the render's panels are a dark grey (rgb 52..80) by the booth.
    { id: 'T_interrogation_booth', name: 'booth', z: -2, w: W, h: H, decos: boothDecos(), filters: { brightness: -45, contrast: 10 } },
    { id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: middlegroundDecos() },
  ];
  return {
    source: INTERROGATION_SOURCE_LINE,
    reconstructed: true,
    tsid: INTERROGATION_TSID,
    label: INTERROGATION_LABEL,
    hubId: INTERROGATION_HUB.hubId,
    hubName: INTERROGATION_HUB.hubName,
    swf_file: 'bldg_int_bhall.swf,groddle1.swf',
    bounds: { ...B },
    platforms,
    layers,
    signposts: [],
    doors: [],
    barriers,
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount: countDecos(layers),
      signpostCount: 0,
      doorCount: 0,
      ladderCount: 0,
      barrierCount: barriers.length,
    },
    // Ours: the hall's plaster (bureaucratic_hall_bg's wall and floor tones) under the darkness.
    gradient: { top: 'C8BC98', bottom: 'D6CBAE' },
    musicFile: 'NO_MUSIC',
    ownLight: true,
    ladders: [],
    why: {
      street: 'inc_data_maps_prod.js:17992 (hub 67 Multiplayer Quests, the developers\' hub); no location XML, no GSJS code; nothing in the game led in.',
      bounds: 'Street images are drawn 720 px wide; the render is 720 x 864 and its partitions and sign are Tiny Speck\'s cubicle walls and waiting-room pictogram at 1.5 x their render size, so the street is 1080 x 1296.',
      layout: 'Render: the bulb over a booth in a row of speckled partitions, the waiting-room pictogram over the gap, a red-brown chair in it, the floor at render y 652; black all round.',
      art: 'bldg_int_bhall.swf: cubicle_wall_left/_right/_double, bureaucratic_hall_waitingroom_1, bureaucratic_hall_light_ray_1, door_asset_bureaucratic_hall_int; groddle1.swf hanging_lightbulb; the hall\'s waiting chair recoloured (tools/interrogation/build-chair.mjs).',
      wayIn: 'Ours: the console\'s Go to the Interrogation room, for an online administrator (realtime teleport into the booth). No door for anyone else.',
      wayOut: 'Ours: the hall\'s interior door at the left goes back to where the visitor came from (features/interrogation-room-feature.js).',
      light: 'Ours: a fixed pool of light round the bulb over the hall\'s plaster tone; the room keeps its own light (ownLight) and is quiet (no music_file survives).',
      notBuilt: 'The dark beam and the two plastered frames over the partitions in the render: no CC0 piece found.',
    },
  };
}

export const interrogationIndexEntry = (street) => ({
  label: street.label,
  file: `assets/streets/${street.tsid}.json`,
  hubId: street.hubId,
  hubName: street.hubName,
  platforms: street.platforms.length,
  decos: street.stats.decoCount,
  reconstructed: true,
});

export const isInterrogationTsid = (tsid) => sameTsid(tsid, INTERROGATION_TSID);

/** No location XML, so no ecology row: an empty room indoors. */
export function interrogationEcology(tsid) {
  if (!isInterrogationTsid(tsid)) return null;
  return { label: INTERROGATION_LABEL, sourceTsid: INTERROGATION_SOURCE_TSID, counts: {}, interior: true, interiorWhy: 'a closed room indoors (its 2011 render)', quoins: 0, reconstructed: true };
}

/**
 * The way back to keep when someone enters the room from `here` ({ tsid, x, y, label }: the street
 * they are leaving and where they stood on it, in that street's screen space as engine.player keeps
 * it, which is what engine.enter's spawnX/spawnY take). Nothing when they come from the room itself.
 */
export function wayBackFrom(here) {
  const tsid = String(here?.tsid || '');
  if (!tsid || isInterrogationTsid(tsid)) return null;
  const x = Number(here.x);
  const y = Number(here.y);
  return {
    tsid,
    label: String(here.label || '').slice(0, 80),
    ...(Number.isFinite(x) && Number.isFinite(y) ? { x: Math.round(x), y: Math.round(y) } : {}),
  };
}

/** A saved way back, cleaned (a bad slice gives null). */
export function normalizeWayBack(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const tsid = String(saved.tsid || '');
  if (!/^[A-Z0-9_]{3,40}$/.test(tsid) || isInterrogationTsid(tsid)) return null;
  return wayBackFrom(saved);
}

/** Where the door out goes: the kept way back, else the fresh start. */
export function doorDestinationFor(wayBack) {
  const back = normalizeWayBack(wayBack);
  return back || { ...INTERROGATION_FALLBACK };
}
