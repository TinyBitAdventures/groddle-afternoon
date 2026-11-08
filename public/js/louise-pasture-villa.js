/**
 * Louise Pasture Villa (register row G371), rebuilt from its one archived
 * render. Pure data and a street builder (no Pixi, no DOM);
 * tools/build-rebuilt-rooms.mjs writes the street JSON, the index row, the
 * door into it on Louise Pasture and the sign beside that door, and
 * features/rebuilt-rooms-feature.js keeps it an empty room.
 *
 * Sources
 * - GSJS: only the map list, hub 58 Groddle Meadow
 *   (inc_data_maps_prod.js:16263), beside Gregarious Towers and its basement.
 *   No location XML in tinyspeck/glitch-locations.
 * - Its render, 2011-04-29 (research/wayback/raw/street-images/groddle-meadow/
 *   LCRDGMREPJ02ORK_main_1304124353.jpg, 720 x 308, reference only, never
 *   shipped): a clean apartment hall. Plastered walls between wood frames, a
 *   plank floor, the stone lift tower at the centre with its L plate, call
 *   button and pale double doors, wires from the ceiling to a light switch,
 *   the Discover iX poster in the left bay, and at the right the white steps
 *   up to a side door marked EXIT.
 * - That is the hall of the apartment lobby template, picture for picture:
 *   Gregarious Towers (GA5134UPLRU29OH, "Abandoned Gregarious Grange Towers",
 *   the same hub) is 1500 x 642, the render's shape (720 / 308 = 1500 / 642),
 *   and draws the same Tiny Speck piece, apartment_lobby (the whole hall: walls,
 *   frames, lift tower, plate, wires, switch, steps), with the lift at x 57 and
 *   its street door at 744, where the render puts them. The towers dressed
 *   that hall as abandoned (bricks, cracks, crates, barrels, a dim orange
 *   light); the villa is the hall before that. So the geometry is Gregarious
 *   Towers' own (its floor, ceiling and walls, VILLA_PLATFORMS), without the
 *   tops of its crates, barrel and vase.
 * - The pieces the render adds to apartment_lobby are Tiny Speck's CC0 decos
 *   from bldg_int_apt.swf: apartment_poster_discover_ix, door_asset_elevator_door
 *   over the lift's arch, door_asset_apartment_hall_right (the EXIT door, its
 *   sign painted on), apartment_lobby_door_separated (the doorway behind it) and
 *   apartment_lobby_stairs_separated. Positions are read off the render
 *   (layer x = render x * 1500 / 720, y = render y * 642 / 308).
 *
 * The way out and the way in
 * - Louise Pasture's location XML (GLIFIG7BP8G1MU9.xml:2972-2981) lists the
 *   villa in its `sources`, the streets with a connect into it (every other
 *   entry there is a street whose signpost leads to Louise Pasture). So the
 *   villa's door led out to Louise Pasture: the EXIT door does.
 * - Nothing archived leads in: Louise Pasture's 2012 geometry has no doors.
 *   Its swf list still names bldg_ext_apt.swf (:2982), the apartment exterior
 *   art the five tower streets load for the way into their lobby, which is a
 *   free-standing door_asset_abandoned_apt_1 (120 x 179) with a
 *   sign_apartment_groddle beside it (Gregarious Grange door_1336671188731,
 *   Hauki Seeks, Sabudana Drama, Egret Taun, Hakusan Heaps). The way in here
 *   is that door and sign on Louise Pasture's flat stretch east of the dirt
 *   mounds (remake choice: no position survives), and it lands where those
 *   five doors land in their lobby (connect 606,-98).
 * - The lift is art: in the towers it is a signpost to the upper floors, and
 *   the villa's floors (if it had any) left no trace.
 */

export const LOUISE_VILLA_TSID = 'GCRDGMREPJ02ORK';
export const LOUISE_VILLA_SOURCE_TSID = 'LCRDGMREPJ02ORK';
export const LOUISE_VILLA_LABEL = 'Louise Pasture Villa';
export const LOUISE_VILLA_HUB = Object.freeze({ hubId: '58', hubName: 'Groddle Meadow' });
export const LOUISE_VILLA_TEMPLATE_TSID = 'GA5134UPLRU29OH';
export const LOUISE_VILLA_BOUNDS = Object.freeze({ l: -750, r: 750, t: -642, b: 0 });
export const LOUISE_VILLA_RENDER = Object.freeze({ file: 'research/wayback/raw/street-images/groddle-meadow/LCRDGMREPJ02ORK_main_1304124353.jpg', w: 720, h: 308 });
export const LOUISE_VILLA_EXIT_DOOR = 'door_louise_villa_exit';
/** Where the five tower doors land in their lobby (Gregarious Grange door_1336671188731 connect). */
export const LOUISE_VILLA_ARRIVE = Object.freeze({ x: 606, y: -98 });

export const LOUISE_PASTURE_TSID = 'GLIFIG7BP8G1MU9';
export const LOUISE_PASTURE_SOURCE_TSID = 'LLIFIG7BP8G1MU9';
export const LOUISE_PASTURE_DOOR = 'door_louise_pasture_villa';
export const LOUISE_PASTURE_SIGN_ID = 'deco_louise_pasture_villa_sign';
/** The way in on Louise Pasture: world x, and the floor it stands on (platform _pl1286403109760, 642..913). */
export const LOUISE_PASTURE_ENTRY = Object.freeze({ x: 880, door: { w: 120, h: 179, sprite: 'door_asset_abandoned_apt_1' }, sign: { dx: -165, w: 279, h: 144, sink: 8 } });

export const LOUISE_VILLA_SOURCE_LINE =
  'reconstruction: Louise Pasture Villa (LCRDGMREPJ02ORK, not in tinyspeck/glitch-locations); layout from its 2011-04-29 render (Wayback street image, 720 x 308, reference only) on the apartment lobby template (Gregarious Towers GA5134UPLRU29OH geometry), CC0 bldg_int_apt decos';

/** Gregarious Towers' platforms that are the tops of its abandoned props (crates, barrel, vase), not the hall. */
export const LOUISE_VILLA_PROP_TOPS = Object.freeze(['plat_1336429009354', 'plat_1336418407239', 'plat_1336429009349', 'plat_1336429009350']);

/** Render px to the hall layer (1500 x 642). */
export const villaLayerX = (rx) => Math.round((rx * 1500) / LOUISE_VILLA_RENDER.w);
export const villaLayerY = (ry) => Math.round((ry * 642) / LOUISE_VILLA_RENDER.h);

const deco = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra });
const clone = (value) => JSON.parse(JSON.stringify(value));
const countDecos = (layers) => layers.reduce((n, l) => n + (l.decos?.length || 0), 0);
const sameTsid = (a, b) => String(a || '').length > 1 && String(a || '').slice(1) === String(b || '').slice(1);

/**
 * What the render shows beyond apartment_lobby, in the hall layer (bottom-centre).
 * - poster: render x 128..273, y 98..180.
 * - lift doors: render x 352..420, base y 243 (the arch of apartment_lobby's tower).
 */
export const LOUISE_VILLA_POSTER = Object.freeze({ x: villaLayerX(200), base: villaLayerY(180), w: 300, h: 173 });
export const LOUISE_VILLA_LIFT_DOORS = Object.freeze({ x: villaLayerX(386), base: villaLayerY(243), w: 140, h: 195 });
/** The EXIT door: Gregarious Towers' street door row (screen 1494, 548), the arch in apartment_lobby's right wall. */
export const LOUISE_VILLA_EXIT = Object.freeze({ x: 1494, y: 548, w: 90, h: 250, sprite: 'door_asset_apartment_hall_right' });

function hallDecos() {
  return [
    // The hall itself, as Gregarious Towers places it.
    deco('apartment_lobby', 782, 642, 1563, 643, 1),
    deco('apartment_poster_discover_ix', LOUISE_VILLA_POSTER.x, LOUISE_VILLA_POSTER.base, LOUISE_VILLA_POSTER.w, LOUISE_VILLA_POSTER.h, 2),
    deco('door_asset_elevator_door', LOUISE_VILLA_LIFT_DOORS.x, LOUISE_VILLA_LIFT_DOORS.base, LOUISE_VILLA_LIFT_DOORS.w, LOUISE_VILLA_LIFT_DOORS.h, 3),
  ];
}

function middlegroundDecos() {
  // World space (the middleground). The doorway, steps and top band are Gregarious Towers' own.
  return [
    deco('apartment_lobby_door_separated', 735, -94, 95, 252, 1),
    deco('apartment_lobby_stairs_separated', 688, -55, 200, 98, 2),
    deco('apartment_xsection_top_1', 417, -612, 2328, 31, 3, { flip: true }),
  ];
}

/**
 * The villa's street JSON. `template` is Gregarious Towers' street JSON (its
 * floor, ceiling and walls); `pastureXY` / `pastureArrive` are the EXIT door's
 * connect (world) and arrival (screen) on Louise Pasture.
 */
export function louiseVillaStreet(template, { pastureXY = null, pastureArrive = null } = {}) {
  if (!template || !sameTsid(template.tsid, LOUISE_VILLA_TEMPLATE_TSID)) throw new Error('louiseVillaStreet needs Gregarious Towers as its template');
  const B = LOUISE_VILLA_BOUNDS;
  const tb = template.bounds;
  if (tb.l !== B.l || tb.r !== B.r || tb.t !== B.t || tb.b !== B.b) throw new Error('Gregarious Towers is no longer 1500 x 642');
  const W = B.r - B.l;
  const H = B.b - B.t;
  const platforms = clone(template.platforms.filter((p) => !LOUISE_VILLA_PROP_TOPS.includes(p.id)));
  const barriers = clone(template.barriers || []);
  const layers = [
    { id: 'T_louise_villa_hall', name: 'hall', z: -4, w: W, h: H, decos: hallDecos() },
    { id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: middlegroundDecos() },
  ];
  const e = LOUISE_VILLA_EXIT;
  const doors = [{
    id: LOUISE_VILLA_EXIT_DOOR,
    x: e.x,
    y: e.y,
    w: e.w,
    h: e.h,
    sprite: e.sprite,
    key_id: 0,
    requires_level: 0,
    is_locked: false,
    hidden: false,
    connect: {
      tsid: LOUISE_PASTURE_SOURCE_TSID,
      label: 'Louise Pasture',
      street: LOUISE_PASTURE_TSID,
      ...(pastureXY ? { x: pastureXY.x, y: pastureXY.y } : {}),
      hub_id: LOUISE_VILLA_HUB.hubId,
      ...(pastureArrive ? { arrive: { ...pastureArrive } } : {}),
    },
  }];
  return {
    source: LOUISE_VILLA_SOURCE_LINE,
    reconstructed: true,
    tsid: LOUISE_VILLA_TSID,
    label: LOUISE_VILLA_LABEL,
    hubId: LOUISE_VILLA_HUB.hubId,
    hubName: LOUISE_VILLA_HUB.hubName,
    swf_file: 'groddle_apt.swf,groddle1.swf,bldg_int_apt.swf',
    bounds: { ...B },
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
      ladderCount: 0,
      barrierCount: barriers.length,
    },
    // Ours: the hall art covers the whole view; a sky in the hall's own plaster and floor tones
    // instead of the painted meadow sky a street without a gradient draws (street-render.js).
    gradient: { top: 'CFC7B6', bottom: '6B5A3E' },
    ladders: [],
    why: {
      street: 'inc_data_maps_prod.js:16263 (hub 58 Groddle Meadow); no location XML, no GSJS code.',
      bounds: 'The render is 720 x 308, the shape of the 1500 x 642 apartment lobby template (Gregarious Towers, the same hub), whose hall piece apartment_lobby it shows.',
      geometry: `Gregarious Towers' floor, ceiling and walls, without its prop tops (${LOUISE_VILLA_PROP_TOPS.join(', ')}).`,
      layout: 'Render: the Discover iX poster in the left bay, the lift with pale double doors at the centre, wires to a light switch in the right bay, the white steps and the EXIT door at the right.',
      wayOut: "The EXIT door, to Louise Pasture: Louise Pasture's sources (GLIFIG7BP8G1MU9.xml:2972-2981) list the villa.",
      wayIn: 'Remake choice: a door and apartment sign on Louise Pasture, as the five tower streets enter their lobby (bldg_ext_apt.swf is still in its swf list); lands at the towers\' lobby arrival 606,-98.',
      notBuilt: 'The lift goes nowhere (no floors survive); no music_file survives.',
    },
  };
}

/**
 * The door row and sign deco the builder puts on Louise Pasture. `ground` is the world floor y under
 * the door; `z` puts the sign over the street's grass strips (the towers' signs stand in front of theirs).
 */
export function louisePastureEntry(pasture, ground, { villaArrive = null, z = 0 } = {}) {
  const E = LOUISE_PASTURE_ENTRY;
  const { l, t } = pasture.bounds;
  const door = {
    id: LOUISE_PASTURE_DOOR,
    x: Math.round(E.x - l),
    y: Math.round(ground - t),
    w: E.door.w,
    h: E.door.h,
    sprite: E.door.sprite,
    key_id: 0,
    requires_level: 0,
    is_locked: false,
    hidden: false,
    connect: {
      tsid: LOUISE_VILLA_SOURCE_TSID,
      label: LOUISE_VILLA_LABEL,
      street: LOUISE_VILLA_TSID,
      x: LOUISE_VILLA_ARRIVE.x,
      y: LOUISE_VILLA_ARRIVE.y,
      hub_id: LOUISE_VILLA_HUB.hubId,
      ...(villaArrive ? { arrive: { ...villaArrive } } : {}),
    },
  };
  const sign = deco('sign_apartment_groddle', E.x + E.sign.dx, ground + E.sign.sink, E.sign.w, E.sign.h, z, { id: LOUISE_PASTURE_SIGN_ID });
  return { door, sign };
}

export const louiseVillaIndexEntry = (street) => ({
  label: street.label,
  file: `assets/streets/${street.tsid}.json`,
  hubId: street.hubId,
  hubName: street.hubName,
  platforms: street.platforms.length,
  decos: street.stats.decoCount,
  reconstructed: true,
});

export const isLouiseVillaTsid = (tsid) => sameTsid(tsid, LOUISE_VILLA_TSID);

/** No location XML, so no ecology row: an empty hall indoors. */
export function louiseVillaEcology(tsid) {
  if (!isLouiseVillaTsid(tsid)) return null;
  return { label: LOUISE_VILLA_LABEL, sourceTsid: LOUISE_VILLA_SOURCE_TSID, counts: {}, interior: true, interiorWhy: 'an apartment hall indoors (its 2011 render)', quoins: 0, reconstructed: true };
}
