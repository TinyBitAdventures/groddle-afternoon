/**
 * The Forest Community Machine Room (LIF16EM56A12FSB), rebuilt from the
 * community machine room template (register row G156). Pure data and the
 * street builder (no Pixi, no DOM).
 *
 * What survives in source (CC0 unless noted):
 * - glitch-GameServerJS config_prod.js:1296 public_machine_rooms and :1332
 *   machine_rooms list it with the Meadow (LCR101Q98A12EHH) and Besara
 *   (LA9MU59GB792T80) rooms; inc_data_maps_prod.js:16120 files it in hub 56
 *   (:16069, Groddle Forest) as "Forest Community Machine Room".
 * - Middle Valley Clearing (streets/mnt/stos/location_data/GLI23FELDHD1O3C.xml
 *   door_1304704230037, x 1502 y -112): the unlocked, no-level
 *   door_asset_community_machine_room_ext door, whose connect lands at 522,-150
 *   in the room and names its art, bldg_int_machine (1322700879.swf), the same
 *   SWF both imported rooms draw from. The Clearing's geometry `sources` list
 *   LIF16EM56A12FSB (line 3130), the link back. No location XML for the room
 *   itself is in the public dump, so its geometry is lost.
 *
 * The template. Meadow (GCR101Q98A12EHH) and Besara (GA9MU59GB792T80) are the
 * same room: bldg_int_machine.swf, bounds -700..700 x -700..0, three decos
 * (community_machine_room_int, sign_community_machine_room and the
 * door_asset_community_machine_room way out on the right wall), a floor, a
 * ceiling line and two walls. They differ only in small edits:
 *   Meadow: sign at -24,-305, flat floor -121..-129, door x 629, grey gradient;
 *   Besara: sign at -115,-339, a floor that rises from x 350 to the door
 *   (-137..-163), door x 636, black gradient, a 6000 x 1000 "Sky" layer.
 * The Forest room copies Meadow's: its one picture (Tiny Speck's 2012-05-21
 * street render, research/wayback/raw/street-images/groddle-forest/
 * LIF16EM56A12FSB_main_1337622698.jpg, reference only) puts the sign where
 * Meadow's is (centre ~348 of 720 px, x -24; Besara's would sit at ~301 px).
 *
 * What the room held is not built here (see FOREST_MACHINE_ROOM_HELD): the
 * remake places no machines in any machine room yet, and its Notice Boards come
 * from the ecology catalog, which only archived rooms have.
 *
 * tools/build-forest-machine-room.mjs writes the street JSON, its index row and
 * the Clearing door's target; features/machine-rooms-feature.js keeps the room
 * indoors (no fallback population).
 */

export const FOREST_MACHINE_ROOM_TSID = 'GIF16EM56A12FSB';
export const FOREST_MACHINE_ROOM_SOURCE_TSID = 'LIF16EM56A12FSB';
export const FOREST_MACHINE_ROOM_LABEL = 'Forest Community Machine Room';
/** inc_data_maps_prod.js:16069/16120. */
export const FOREST_MACHINE_ROOM_HUB = Object.freeze({ hubId: '56', hubName: 'Groddle Forest' });
/** The Meadow Community Machine Room, whose geometry the Forest room copies. */
export const TEMPLATE_TSID = 'GCR101Q98A12EHH';
export const CLEARING_TSID = 'GLI23FELDHD1O3C';
export const CLEARING_SOURCE_TSID = 'LLI23FELDHD1O3C';
export const CLEARING_LABEL = 'Middle Valley Clearing';
export const CLEARING_DOOR = 'door_1304704230037';
/** The Clearing door's connect x/y: world, in the room. */
export const FOREST_MACHINE_ROOM_ARRIVE = Object.freeze({ x: 522, y: -150 });
export const EXIT_DOOR_ID = 'door_fmr_exit';
export const FOREST_MACHINE_ROOM_SOURCE =
  'reconstruction: Forest Community Machine Room (LIF16EM56A12FSB, not in tinyspeck/glitch-locations); geometry copied from the Meadow Community Machine Room (GCR101Q98A12EHH, tinyspeck/glitch-locations locations-xml.zip, CC0), the template every community machine room shares';

/**
 * What the room held, for the follow-up that places machine-room machines
 * (none of the three rooms has them in the remake). Read off the 2012-05-21
 * street render (reference only): a Fuelmaker on the first floor cross, the
 * Blockmaker on the third, a Fuelmaker by the way out, and a Notice Board with
 * one note pinned on the right wall. The archived rooms, for comparison
 * (L*.xml objrefs, 2013-03): Meadow a Woodworker, two Blockmakers, a
 * Fuelmaker, a Metal Machine, a Note and a Notice Board; Besara a Blockmaker,
 * a Metal Machine, a Fuelmaker, a Woodworker and a Notice Board.
 */
export const FOREST_MACHINE_ROOM_HELD = Object.freeze({
  machines: Object.freeze([
    Object.freeze({ classTsid: 'fuelmaker', x: -486, why: 'street render 2012-05-21 (~110 of 720 px): on the first floor cross' }),
    Object.freeze({ classTsid: 'blockmaker', x: -29, why: 'street render 2012-05-21 (~345 px): on the third floor cross' }),
    Object.freeze({ classTsid: 'fuelmaker', x: 496, why: 'street render 2012-05-21 (~615 px): right of the fourth cross, by the way out' }),
  ]),
  furniture: Object.freeze({ bag_notice_board: 1 }),
});

/** True for the room under either TSID prefix (G as built, L as GSJS names it). */
export const isForestMachineRoomTsid = (tsid) => String(tsid || '').slice(1) === FOREST_MACHINE_ROOM_TSID.slice(1);

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * The street JSON, from the Meadow room's JSON. `clearingArrive` (Clearing
 * screen space) and `clearingXY` (Clearing world) are the way out's landing in
 * front of the Clearing's door, filled in by the builder.
 */
export function forestMachineRoomStreet(template, { clearingArrive = null, clearingXY = null } = {}) {
  if (!template || String(template.tsid) !== TEMPLATE_TSID) throw new Error(`template must be ${TEMPLATE_TSID}`);
  const way = (template.doors || [])[0];
  if (!way || (template.doors || []).length !== 1) throw new Error('the template room has one door');
  const doors = [{
    ...clone(way),
    id: EXIT_DOOR_ID,
    connect: {
      tsid: CLEARING_SOURCE_TSID,
      label: CLEARING_LABEL,
      street: CLEARING_TSID,
      ...(clearingXY ? { x: clearingXY.x, y: clearingXY.y } : {}),
      hub_id: FOREST_MACHINE_ROOM_HUB.hubId,
      ...(clearingArrive ? { arrive: { ...clearingArrive } } : {}),
    },
  }];
  const platforms = clone(template.platforms);
  const barriers = clone(template.barriers || []);
  const layers = clone(template.layers);
  const decoCount = layers.reduce((n, layer) => n + (layer.decos?.length || 0), 0);
  return {
    source: FOREST_MACHINE_ROOM_SOURCE,
    reconstructed: true,
    template: TEMPLATE_TSID,
    tsid: FOREST_MACHINE_ROOM_TSID,
    label: FOREST_MACHINE_ROOM_LABEL,
    hubId: FOREST_MACHINE_ROOM_HUB.hubId,
    hubName: FOREST_MACHINE_ROOM_HUB.hubName,
    swf_file: template.swf_file,
    bounds: { ...template.bounds },
    platforms,
    layers,
    signposts: [],
    doors,
    barriers,
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount,
      signpostCount: 0,
      doorCount: doors.length,
      ladderCount: 0,
      barrierCount: barriers.length,
    },
    gradient: { ...template.gradient },
    why: {
      street: 'config_prod.js:1296 public_machine_rooms, :1332 machine_rooms; inc_data_maps_prod.js:16120 hub 56 "Forest Community Machine Room"; no location XML.',
      arrival: 'Middle Valley Clearing (GLI23FELDHD1O3C.xml) door_1304704230037 connect 522,-150 (hub 56, swf bldg_int_machine 1322700879), as Meadow (587,-144) and Besara (525,-145) land in front of their way out.',
      geometry: 'Copied from the Meadow Community Machine Room: the same bldg_int_machine.swf room as Besara; the 2012-05-21 street render shows the sign at Meadow\'s place, not Besara\'s.',
      wayOut: 'The template\'s door on the right wall, back to Middle Valley Clearing in front of its door (the Clearing\'s geometry sources list LIF16EM56A12FSB).',
      notBuilt: 'Machines and the Notice Board (FOREST_MACHINE_ROOM_HELD): the remake places no machine-room machines yet. Music: the room\'s music_file is lost (Meadow\'s is empty); it plays Groddle Forest\'s.',
    },
  };
}

/** The index.json row. */
export function forestMachineRoomIndexEntry(street) {
  return {
    label: FOREST_MACHINE_ROOM_LABEL,
    file: `assets/streets/${FOREST_MACHINE_ROOM_TSID}.json`,
    hubId: FOREST_MACHINE_ROOM_HUB.hubId,
    hubName: FOREST_MACHINE_ROOM_HUB.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}

/**
 * The ecology row the archived machine rooms carry (street-ecology.json:
 * interior, nothing spawned, no quoins), which build-street-ecology.mjs cannot
 * write for a room without location XML.
 */
export function forestMachineRoomEcology() {
  return {
    label: FOREST_MACHINE_ROOM_LABEL,
    sourceTsid: FOREST_MACHINE_ROOM_SOURCE_TSID,
    counts: {},
    interior: true,
    interiorWhy: 'config_prod.js machine_rooms',
    quoins: 0,
  };
}
