/**
 * Jethimadh Tower Base: Room 15 and the Ventilation Room, rebuilt (pure data
 * and a builder: no Pixi, no DOM).
 *
 * Neither location is in the public locations dump (no G*.xml, L*.xml or
 * street JSON). inc_data_maps_prod.js hub 77 still names them
 * (LIF1G7Q75312T8B "Room 15", LIF102JCHL027DO "Ventilation Room") and the
 * archived corridor doors still point at them with their arrival points:
 *   Corridor Four door_1304677515854 (key 4) -> Room 15          at -790, -423
 *   Corridor Four door_1304677515850         -> Ventilation Room at  360,  240
 *   Corridor Six  door_1304678594671         -> Ventilation Room at  400, -2540
 * Everything else is reconstructed from the player record, each element
 * carrying a `why`:
 *   W  Glitch Forever wiki "Jethimadh Tower: Base" (hidden locations and room
 *      tables; maps by Columbina and Terror Terror).
 *   G  Glitch Strategy "How to get the 11 Secrets of Jethimadh Tower Base
 *      Achievement" (2011-07).
 *   F  Glitch forum threads 8885 and 9061 (players who found 9-11).
 * Art is the corridors' own CC0 set (firebog.swf: jethimadh_int_*,
 * jethimadh_frame_*, door_asset_jethimadh_int); no pixels from screenshots.
 * G110: the Ventilation Room's one Snap (research/wayback/raw/snaps/
 * jtower_ventilation_room/, PUVFMPJUESM2R57, 2012-12-09, reference only) adds
 * more firebog.swf street decos round each door: the rope-hung "Way Out" plank
 * (firebog_sign_blank_plank on vine_ropes), a lantern over the door, glowing
 * bushes (underground_bogwillow*) and beaded roots (hanging_braches*) under the
 * ledges, and dark plank walls (the backdrops in a dimmed BG layer).
 *
 * tools/build-tower-rooms.mjs writes the two street JSON files from
 * TOWER_ROOMS, adds them to assets/streets/index.json and links the corridor
 * doors (connect.street + arrive), so the ordinary street, door, ladder and
 * TowerSpot code handles them like any imported street.
 */

export const ROOM_15_TSID = 'GIF1G7Q75312T8B';
export const VENT_ROOM_TSID = 'GIF102JCHL027DO';
export const TOWER_ROOM_HUB = Object.freeze({ hubId: '77', hubName: 'Jethimadh Tower: Base' });
export const TOWER_ROOM_SOURCE = 'reconstruction: Jethimadh Tower Base (not in tinyspeck/glitch-locations); geometry from player guides, art from the corridors\' CC0 set';

/** The source's TowerSpot box: bottom-centre, 200 x 200 (the archived seven). */
const SPOT = { w: 200, h: 200 };
const DOOR = { w: 196, h: 214, sprite: 'door_asset_jethimadh_int' };

/* ------------------------------------------------------------------ */
/* Art helpers                                                          */
/* ------------------------------------------------------------------ */

/**
 * The walkable top edge of jethimadh_int_steps_1 (3290 x 460 PNG), measured
 * from its alpha: [x fraction, y fraction from the art's top]. The corridors'
 * floor platforms follow this edge; so do ours.
 */
export const STEPS_PROFILE = Object.freeze([
  [0.05, 0.06], [0.067, 0.02], [0.334, 0.02], [0.368, 0.154], [0.435, 0.152],
  [0.468, 0.263], [0.635, 0.265], [0.669, 0.352], [0.736, 0.352], [0.769, 0.43], [0.903, 0.422],
]);

/**
 * A jethimadh_int_steps_1 piece ("looks like a sliced up tree", F 9061) with
 * platforms along its top edge. `top` is the art's top (the highest step);
 * world coordinates. flip mirrors it (the high block on the right).
 */
export function stepsPiece(id, cx, top, w, h, { flip = false, z = 6, why = '' } = {}) {
  const x0 = cx - w / 2;
  const pts = STEPS_PROFILE.map(([fx, fy]) => [Math.round(x0 + (flip ? 1 - fx : fx) * w), Math.round(top + fy * h)]);
  if (flip) pts.reverse();
  const platforms = [];
  for (let i = 1; i < pts.length; i += 1) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    if (x2 - x1 < 1) continue;
    platforms.push({ id: `plat_${id}_${i}`, x1, y1, x2, y2, pc_perm: -1, why });
  }
  const deco = { sprite: 'jethimadh_int_steps_1', x: Math.round(cx), y: Math.round(top + h), w: Math.round(w), h: Math.round(h), z, r: 0, layer: 'mg' };
  if (flip) deco.flip = true;
  // low: the lowest step (its low end faces the next piece in a flip-alternating chain).
  return { platforms, decos: [deco], top, low: Math.max(...pts.map((p) => p[1])), left: pts[0][0], right: pts[pts.length - 1][0] };
}

/**
 * A deco centred on (cx, cy) and turned 90 degrees (r 90: its left end at the
 * top; r -90: its left end at the bottom). The renderer anchors decos
 * bottom-centre and rotates about that point, so the anchor sits half a
 * thickness to the side of the centre. `length` runs vertically.
 */
export function turned(sprite, cx, cy, length, thickness, r = 90, extra = {}) {
  const half = thickness / 2;
  return { sprite, x: Math.round(r === 90 ? cx - half : cx + half), y: Math.round(cy), w: Math.round(length), h: Math.round(thickness), r, ...extra };
}

const flat = (id, x1, x2, y, why, pc = -1) => ({ id: `plat_${id}`, x1, y1: y, x2, y2: y, pc_perm: pc, why });

/**
 * A deco's point at art fractions (fx, fy from its top-left, before any flip)
 * in world space: decos are anchored bottom-centre, mirrored by flip, then
 * turned r degrees (clockwise) about that anchor.
 */
export function decoPoint(d, fx, fy) {
  const lx = ((d.flip ? 1 - fx : fx) - 0.5) * d.w;
  const ly = -(1 - fy) * d.h;
  const t = ((d.r || 0) * Math.PI) / 180;
  return [d.x + lx * Math.cos(t) - ly * Math.sin(t), d.y + lx * Math.sin(t) + ly * Math.cos(t)];
}

/**
 * The rope-hung "Way Out" plank of the Room 8 and Ventilation Room Snaps
 * (research/wayback/raw/snaps/jtower_room_8/ PUVTECCNR7S22RU,
 * jtower_ventilation_room/ PUVFMPJUESM2R57; the sign words are read off them):
 * firebog.swf's firebog_sign_blank_plank, turned 7 degrees level (the art
 * slants), on two thorny vine_ropes running up out of sight. (x, y) is the
 * plank's bottom-centre; the text is painted by features/tower-rooms-feature.js.
 */
export function hangingSign(x, y, text, { w = 190, rope = 520, z = 16 } = {}) {
  const h = Math.round((w * 176) / 480);
  const plank = { sprite: 'firebog_sign_blank_plank', x: Math.round(x), y: Math.round(y), w, h, z, r: 7, layer: 'mg', signText: text };
  const ropes = [0.14, 0.86].map((fx) => {
    const [rx, ry] = decoPoint(plank, fx, 0.45);
    return { sprite: 'vine_rope', x: Math.round(rx), y: Math.round(ry), w: 30, h: rope, z: z - 1, r: 0, layer: 'mg' };
  });
  return [...ropes, plank];
}

/**
 * World kept under each room's lowest floor (as tower-challenge-rooms.js
 * BELOW_FLOOR): the camera holds the feet ~100 px over the view's bottom and
 * the pack covers another 132 px, so a room that ends near its floor shows
 * the page under it. Room 15 runs to y 300 (400 under its floor), the
 * Ventilation Room 420 under its bottom floor; arrivals and doors keep their
 * world coordinates (screen space counts from the top-left).
 */
const BELOW_FLOOR = 300;

/* ------------------------------------------------------------------ */
/* Room 15 (LIF1G7Q75312T8B)                                            */
/* ------------------------------------------------------------------ */

function buildRoom15() {
  const platforms = [];
  const decos = [];
  const add = (piece) => {
    platforms.push(...piece.platforms);
    decos.push(...piece.decos);
    return piece;
  };
  const bounds = { l: -1000, r: 1000, t: -1000, b: BELOW_FLOOR };

  // Chamber shell: a corridor section stood taller (frame caps and walls, the
  // three wood backdrops and their shadow), like a numbered room off C4E. The
  // roof stays put; everything that ended at y 0 runs on to the new bottom.
  const down = BELOW_FLOOR;
  decos.push(
    { sprite: 'jethimadh_int_bg_left', x: -560, y: -30 + down, w: 900, h: 930 + down, z: 1, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_center', x: 0, y: -24 + down, w: 640, h: 940 + down, z: 2, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_right', x: 560, y: -30 + down, w: 900, h: 930 + down, z: 0, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_int_bg_shadow_50percent', x: 0, y: -40 + down, w: 1960, h: 900 + down, z: 3, r: 0, layer: 'mg' },
    { sprite: 'jethimadh_frame_cap', x: -760, y: -10 + down, w: 480, h: 980 + down, z: 8, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_cap', x: 760, y: -10 + down, w: 480, h: 980 + down, z: 8, r: 0, flip: true, layer: 'fg' },
    { sprite: 'jethimadh_frame_wall', x: 0, y: -958, w: 1060, h: 42, z: 8, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_frame_wall', x: 0, y: -10 + down, w: 1060, h: 42, z: 8, r: 0, layer: 'fg' },
  );

  // Floor: two steps pieces meeting in a dip (the corridors' floor art), joined in the middle.
  const why = 'Corridor floor art (jethimadh_int_steps_1) mirrored into a dip; platforms follow its top edge.';
  const left = add(stepsPiece('r15_floor_l', -460, -160, 900, 140, { why }));
  const right = add(stepsPiece('r15_floor_r', 460, -160, 900, 140, { flip: true, why }));
  platforms.push(flat('r15_floor_mid', left.right, right.left, -101, why));

  // Way out: the door back to C4 on a high ledge at the source arrival point.
  const doorWhy = 'Arrival -790,-423 from Corridor Four door_1304677515854 (archived); the way out stands where you arrive.';
  // The piece's high block (0.067-0.334 of its width) sits under the door.
  add(stepsPiece('r15_wayout', -658, -423, 440, 70, { why: doorWhy, z: 7 }));
  platforms.push(flat('r15_wayout_lip', -980, -855, -423, doorWhy));

  // Climb back up to the way out (rises of 75 px: a plain jump).
  const climb = 'Remake route: ledges from the floor back up to the way out, 75 px apart (one plain jump each).';
  add(stepsPiece('r15_climb_a', -470, -235, 200, 44, { why: climb }));
  add(stepsPiece('r15_climb_b', -290, -310, 180, 42, { flip: true, why: climb }));

  // The key course: the room "Contains a Purple-Orange Circle Key" (W rooms table).
  const keyWhy = 'W rooms table: Room 15 contains a Purple-Orange Circle Key (door_key_6, opens Room 16 in C6W); remake shelf at the top of a short climb.';
  add(stepsPiece('r15_key_d', 500, -235, 200, 44, { flip: true, why: keyWhy }));
  add(stepsPiece('r15_key_e', 730, -310, 180, 42, { why: keyWhy }));
  add(stepsPiece('r15_key_f', 490, -385, 180, 42, { flip: true, why: keyWhy }));
  add(stepsPiece('r15_key_g', 710, -460, 180, 42, { why: keyWhy }));
  add(stepsPiece('r15_key_shelf', 830, -535, 260, 50, { flip: true, why: keyWhy }));

  // Secret spot 5: "A quoin at the top of the screen, near the way out" (W),
  // "spinach-jumping to the quoin at the top of the room" (G).
  const spotWhy = 'W [5] "a quoin at the top of the screen, near the way out"; G "spinach-jumping to the quoin at the top of the room": a high shelf 257 px over the way-out ledge (spinach apex 296 px, plain jump 110).';
  add(stepsPiece('r15_secret', -590, -680, 220, 46, { why: spotWhy, z: 7 }));

  // Ceiling and end walls.
  platforms.push(flat('r15_ceiling', -960, 960, -965, 'Chamber roof (solid from below).', 1));
  const barriers = [
    { id: 'wall_r15_left', x: -968, y: bounds.t, h: bounds.b - bounds.t, pc_perm: null, why: 'Chamber end.' },
    { id: 'wall_r15_right', x: 968, y: bounds.t, h: bounds.b - bounds.t, pc_perm: null, why: 'Chamber end.' },
  ];

  // Lanterns, two columns and the door plaque (the corridors' furniture).
  decos.push(
    { sprite: 'jethimadh_int_lantern_1', x: -300, y: -330, w: 353, h: 533, z: 3, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_int_lantern_1', x: 300, y: -330, w: 353, h: 533, z: 3, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_int_lantern_1', x: -720, y: -500, w: 300, h: 450, z: 3, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_int_pillar_1_mod', x: -150, y: -96, w: 230, h: 860, z: 5, r: 0, flip: true, layer: 'fg' },
    { sprite: 'jethimadh_int_pillar_1', x: 150, y: -96, w: 230, h: 860, z: 6, r: 0, layer: 'fg' },
    { sprite: 'jethimadh_int_door_sign', x: -600, y: -455, w: 188, h: 110, z: 11, r: 0, layer: 'mg' },
    { sprite: 'firebog_sign_blank', x: -600, y: -472, w: 138, h: 80, z: 16, r: 0, layer: 'mg', signText: 'Way Out' },
  );

  return {
    tsid: ROOM_15_TSID,
    sourceTsid: 'LIF1G7Q75312T8B',
    label: 'Room 15',
    bounds,
    platforms,
    barriers,
    decos,
    doors: [
      {
        id: 'door_r15_wayout',
        x: -790,
        y: -423,
        ...DOOR,
        connect: { tsid: 'LTJ10K7P3812R8F', label: 'Corridor Four', x: 1484, y: -701, hub_id: '77' },
        why: 'Back through C4E\'s Room 15 door (world 1484,-701), the way you came in.',
      },
    ],
    // Box bottom 30 px under the shelf top: standing anywhere on it counts, the way-out ledge does not.
    spots: [{ id: 'TowerSpot_05', x: -590, y: -650, why: spotWhy }],
    keyDrop: { id: 'r15_key', key: 6, x: 905, y: -505, w: 120, h: 120, why: keyWhy },
    why: {
      room: 'W: "Room 15 || Teal-Red Hexagon Key || Located in C4E. Contains a Purple-Orange Circle Key." and "[5] A quoin at the top of the screen, near the way out. Bring Spinach." G: "the secret spot is accesible by spinach-jumping to the quoin at the top of the room."',
      size: 'Remake: a 2000 x 1000 chamber (no source bounds survive); the arrival x -790 sits inside a -1000..1000 room.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Ventilation Room (LIF102JCHL027DO)                                   */
/* ------------------------------------------------------------------ */

/** The vertical span: C6's door near the top, C4's at mid height, Tower St South at the bottom. */
export const VENT = Object.freeze({
  bounds: Object.freeze({ l: -750, r: 750, t: -2900, b: 3000 }),
  inner: 620,
  c6Floor: -2540,
  c4Floor: 240,
  floor: 2600,
  ceiling: -2860,
});

function buildVent() {
  const platforms = [];
  const decos = [];
  const add = (piece) => {
    platforms.push(...piece.platforms);
    decos.push(...piece.decos);
    return piece;
  };
  const { bounds, inner, c6Floor, c4Floor, floor, ceiling } = VENT;

  // Shaft shell: a corridor turned on end. The frame cap's curve closes the
  // top and bottom; frame walls run down both sides; the wood backdrops are
  // turned 90 degrees so the grain runs up the shaft.
  // The bottom cap sits under the view (bounds.b, 420 px below the floor), so
  // the backdrop runs on under the floor like Rooms 4, 8 and 16.
  const sink = bounds.b - 2700;
  decos.push(
    turned('jethimadh_frame_cap', 0, -2540, 720, 1300, 90, { z: 8, layer: 'fg' }),
    turned('jethimadh_frame_cap', 0, 2310 + sink, 720, 1300, -90, { z: 8, layer: 'fg' }),
  );
  for (let y = -1900; y <= 1900 + sink; y += 760) {
    decos.push(turned('jethimadh_frame_wall', -630, y, 1000, 42, 90, { z: 8, layer: 'fg' }));
    decos.push(turned('jethimadh_frame_wall', 630, y, 1000, 42, 90, { z: 8, layer: 'fg' }));
  }
  decos.push(turned('jethimadh_int_bg_left', 0, -2380, 1000, 1250, 90, { z: 1, layer: 'bg' }));
  let n = 0;
  // The backdrop's ends are slanted, so the tiles overlap by a third.
  for (let y = -1760; y <= 1800; y += 560) {
    decos.push(turned('jethimadh_int_bg_center', 0, y, 900, 1300, n % 2 ? -90 : 90, { z: 2 + (n % 2), layer: 'bg' }));
    n += 1;
  }
  decos.push(turned('jethimadh_int_bg_right', 0, 2200 + sink, 1000 + sink, 1250, 90, { z: 1, layer: 'bg' }));
  decos.push(turned('jethimadh_int_bg_shadow_50percent', 0, sink / 2, 5500 + sink, 1240, 90, { z: 5, layer: 'bg' }));

  // Doors: two "Way Out" doors on right-hand ledges and Tower St South at the bottom.
  const c6Why = 'Arrival 400,-2540 from Corridor Six door_1304678594671 (archived). W: "Exits to C6W (labeled \'Way Out\')"; F 8885 "nothing in the dark space above the uppermost exit door".';
  const c4Why = 'Arrival 360,240 from Corridor Four door_1304677515850 (archived). F 9061 Timski: "the mid-height Way Out"; W "the middle door".';
  const ssWhy = 'G: "a high vertical shaft leading down to exits to corridors as well as Tower Street South at the bottom"; W "Exits to ... Tower St South". Arrives beside Tower St South\'s tower door.';
  // Flipped pieces put their high block (x0 + 0.666..0.933 of the width) under each door.
  const c6Ledge = add(stepsPiece('vent_c6_ledge', 245, c6Floor, 520, 80, { flip: true, why: c6Why, z: 7 }));
  platforms.push(flat('vent_c6_lip', c6Ledge.right, inner, c6Floor, c6Why));
  const c4Ledge = add(stepsPiece('vent_c4_ledge', 205, c4Floor, 520, 80, { flip: true, why: c4Why, z: 7 }));
  platforms.push(flat('vent_c4_lip', c4Ledge.right, inner, c4Floor, c4Why));
  add(stepsPiece('vent_floor_l', -310, floor - 60, 640, 90, { why: ssWhy }));
  add(stepsPiece('vent_floor_r', 310, floor - 60, 640, 90, { flip: true, why: ssWhy }));
  platforms.push(flat('vent_floor_mid', -60, 60, floor - 60 + Math.round(0.422 * 90), ssWhy));
  platforms.push(flat('vent_ceiling', -inner, inner, ceiling, 'Shaft roof (solid from below).', 1));

  // The climb: alternating sliced-tree ledges 80 px apart from just above the
  // spot-11 ledge to just under the C6 ledge, so the doors work both ways with
  // a plain jump. F 8885: "all i did in the ventilation room was to jump on
  // every platform, you hardly need spinach".
  const climbWhy = 'F 8885/9061: platforms all the way down the shaft; remake spacing 80 px up, 90-140 px across (plain jumps).';
  const route = [];
  const step = (y, side, i) => {
    const cx = (side ? 100 : -150) + (((i * 37) % 3) - 1) * 14;
    route.push(add(stepsPiece(`vent_climb_${String(i).padStart(2, '0')}`, cx, y, side ? 220 : 200, 44, { flip: Boolean(side), why: climbWhy })));
  };
  // Below the C4 ledge: up from the spot-11 ledge to the ledge's low end.
  step(420, 0, 0);
  step(340, 1, 1);
  route.push(c4Ledge);
  // Above it: 34 steps to the top ledge under the C6 door (the last on the right).
  for (let y = c4Floor - 60, i = 2; y > c6Floor + 40; y -= 80, i += 1) step(y, i % 2, i);
  const top = route[route.length - 1];
  route.push(c6Ledge);

  // Under the mid door the shaft only goes down: a few wide ledges break the
  // fall to the bottom exit (Tower St South had no door back in).
  const dropWhy = 'G: the shaft "leading down" to Tower St South; ledges that break the fall (one-way, like the street exit).';
  const drops = [[820, 160, 300], [1220, -220, 300], [1620, 180, 300], [2020, -200, 300]];
  drops.forEach(([y, cx, w], i) => add(stepsPiece(`vent_drop_${i}`, cx, y, w, 50, { flip: i % 2 === 1, why: dropWhy })));

  // Secret spots 9-11.
  const s9 = 'F 9061 Timski: "Very close to the door from corridor 6 (marked Way Out)... actually the top point"; Serilyn: "the one just below the top exit that looks like a sliced up tree"; W [9] "The area just below the C6W platform": the top climb ledge under the C6 ledge.';
  const s10 = 'F 9061 Timski: "On the left, only slightly down in height from the top"; W [10] "A platform to the left - 3/4 of the way up"; G "2/3rds up ... on a platform to the left. You may need to spinach-jump to the ledge".';
  const s11 = 'F 9061 Timski: "On the left, but much further down. Slightly lower level than the mid-height Way Out"; W [11] "A platform to the left, just under the middle door"; F 8885 "It is much further down than the guides claim".';
  // Box bottom 170 px under the top ledge: the ledge itself stays outside it
  // (y < box.y - 200), stepping off it or standing on the ledge below is inside.
  const spot9 = { id: 'TowerSpot_09', x: Math.round((top.left + top.right) / 2), y: top.top + 170, why: s9 };
  const spot10Y = -1780;
  const spot11Y = c4Floor + 90;
  add(stepsPiece('vent_secret_10', -400, spot10Y, 220, 46, { why: s10, z: 7 }));
  add(stepsPiece('vent_secret_11', -400, spot11Y, 220, 46, { why: s11, z: 7 }));

  const barriers = [
    { id: 'wall_vent_left', x: -inner, y: bounds.t, h: bounds.b - bounds.t, pc_perm: null, why: 'Shaft side.' },
    { id: 'wall_vent_right', x: inner, y: bounds.t, h: bounds.b - bounds.t, pc_perm: null, why: 'Shaft side.' },
  ];

  // Lanterns down the shaft.
  for (const [x, y] of [[-420, -2300], [430, -1900], [-420, -1150], [430, -500], [-420, 120], [430, 900], [-420, 1700]]) {
    decos.push({ sprite: 'jethimadh_int_lantern_1', x, y, w: 300, h: 450, z: 3, r: 0, layer: 'fg' });
  }

  // G110: the Ventilation Room Snap (research/wayback/raw/snaps/jtower_ventilation_room/,
  // PUVFMPJUESM2R57, 2012-12-09 "Way out~", reference only) at the mid door: dark horizontal plank
  // walls (the BG layer's tint), a lantern hanging over the door, the "Way Out" plank on two thorny
  // ropes to its left, glowing yellow bushes on the ring steps, root tendrils with beads under them,
  // a thorny vine across the wall. Every piece is a firebog.swf street deco.
  const ledgeOf = { [c6Floor]: c6Ledge, [c4Floor]: c4Ledge };
  const groundAt = (x, near) => {
    let best = null;
    for (const p of platforms) {
      if (p.pc_perm !== -1 || x < Math.min(p.x1, p.x2) || x > Math.max(p.x1, p.x2)) continue;
      const y = p.x2 === p.x1 ? p.y1 : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
      if (y >= near - 30 && (best == null || y < best)) best = y;
    }
    return Math.round(best ?? near);
  };
  const doorDressing = (doorX, doorY, text) => {
    // Snap scale ~1.2 world px a Snap px (the avatar ~120 px there): the lantern ~220 over the door,
    // the plank ~180 left of the door and clear over your head, the big bush ~330 left on the lower step.
    decos.push({ sprite: 'jethimadh_int_lantern_1', x: doorX, y: doorY + 61, w: 300, h: 450, z: 4, r: 0, layer: 'fg' });
    decos.push(...hangingSign(doorX - 178, doorY - 150, text, { rope: 460 }));
    const big = doorX - 330;
    decos.push({ sprite: 'underground_bogwillow', x: big, y: groundAt(big, doorY) + 6, w: 170, h: 171, z: 9, r: 0, layer: 'mg' });
    const small = doorX - 115;
    decos.push({ sprite: 'underground_bogwillow_1', x: small, y: groundAt(small, doorY) + 4, w: 58, h: 100, z: 9, r: 0, layer: 'mg' });
    decos.push({ sprite: 'vine_rope', x: doorX - 620, y: doorY - 230, w: 36, h: 360, z: 2, r: 52, layer: 'mg' });
    const ledge = ledgeOf[doorY];
    if (ledge) {
      // Roots hang from under the ledge art (its top + 80); behind the steps (z 6-7).
      const cx = (ledge.left + ledge.right) / 2;
      decos.push({ sprite: 'hanging_braches1', x: Math.round(cx - 70), y: doorY + 60 + 254, w: 300, h: 254, z: 5, r: 0, layer: 'mg' });
      decos.push({ sprite: 'hanging_braches2', x: Math.round(cx + 120), y: doorY + 60 + 230, w: 226, h: 230, z: 5, r: 0, layer: 'mg' });
    }
  };
  doorDressing(400, c6Floor, 'Way Out');
  doorDressing(360, c4Floor, 'Way Out');
  // The street exit's sign hangs the same way (remake: no Snap of the bottom door).
  doorDressing(500, floor - 58, 'Tower St South');
  // Bushes and roots on the secret-spot ledges.
  for (const y of [spot10Y, spot11Y]) {
    decos.push({ sprite: 'underground_bogwillow_1', x: -470, y: groundAt(-470, y) + 4, w: 58, h: 100, z: 9, r: 0, layer: 'mg' });
    decos.push({ sprite: 'hanging_braches2', x: -400, y: y + 40 + 200, w: 196, h: 200, z: 5, r: 0, layer: 'mg' });
  }

  return {
    tsid: VENT_ROOM_TSID,
    sourceTsid: 'LIF102JCHL027DO',
    label: 'Ventilation Room',
    bounds,
    platforms,
    barriers,
    decos,
    doors: [
      { id: 'door_vent_c6', x: 400, y: c6Floor, ...DOOR, connect: { tsid: 'LTJ110817812KO4', label: 'Corridor Six', x: -867, y: -649, hub_id: '77' }, why: c6Why },
      { id: 'door_vent_c4', x: 360, y: c4Floor, ...DOOR, connect: { tsid: 'LTJ10K7P3812R8F', label: 'Corridor Four', x: -202, y: -551, hub_id: '77' }, why: c4Why },
      { id: 'door_vent_street', x: 500, y: floor - 58, ...DOOR, connect: { tsid: 'LIF15OTSM102353', label: 'Tower St South', x: -600, y: -379, hub_id: '71' }, why: ssWhy },
    ],
    spots: [
      spot9,
      // Boxes end over the ledge's right end, so the locking overlay (it stops
      // the avatar's run) never fires mid-jump with nothing underneath.
      { id: 'TowerSpot_10', x: -415, y: spot10Y + 30, why: s10 },
      { id: 'TowerSpot_11', x: -415, y: spot11Y + 30, why: s11 },
    ],
    route: route.map((p) => ({ left: p.left, right: p.right, top: p.top, low: p.low })),
    // The walls' wood darkened to the Snap's (~#26190c against the backdrop art's ~#69431c).
    bgFilters: { tintColor: 0, tintAmount: 62 },
    why: {
      room: 'W: three hidden locations ([9]-[11]), "Exits to C6W (labeled \'Way Out\'), C4 (also labeled \'Way Out\'), and Tower St South. BRING SPINACH." G: "a high vertical shaft".',
      size: 'The archived arrivals put C6\'s door at y -2540 and C4\'s at +240 (2780 px apart); F calls C4 "the mid-height Way Out", so the shaft runs as far again below it to the street exit (t -2900, floor 2600; the world runs to b 3000 so the view never shows past the bottom). 1500 wide like the archived vertical streets (l -750, r 750).',
    },
  };
}

export const TOWER_ROOMS = Object.freeze([buildRoom15(), buildVent()]);

/** The corridor doors that lead into the rebuilt rooms (archived ids). */
export const TOWER_ROOM_DOOR_LINKS = Object.freeze([
  { street: 'GTJ10K7P3812R8F', door: 'door_1304677515854', room: ROOM_15_TSID },
  { street: 'GTJ10K7P3812R8F', door: 'door_1304677515850', room: VENT_ROOM_TSID },
  { street: 'GTJ110817812KO4', door: 'door_1304678594671', room: VENT_ROOM_TSID },
]);

/** TowerSpot_05, 09, 10, 11 in world coordinates (bottom-centre, 200 x 200). */
export const TOWER_ROOM_SPOTS = Object.freeze(
  TOWER_ROOMS.flatMap((room) => room.spots.map((s) => Object.freeze({ id: s.id, tsid: room.tsid, wx: s.x, wy: s.y, w: SPOT.w, h: SPOT.h })))
);

/* ------------------------------------------------------------------ */
/* Street JSON                                                          */
/* ------------------------------------------------------------------ */

const strip = ({ why, ...rest }) => rest;

/**
 * The street JSON for one rebuilt room, in the imported format: platforms,
 * barriers and middleground decos in world space; doors, boxes and the FG
 * layer in screen space (x - bounds.l, y - bounds.t).
 */
export function towerRoomStreet(room) {
  const { l, r, t, b } = room.bounds;
  const W = r - l;
  const H = b - t;
  const toScreen = (x, y) => ({ x: x - l, y: y - t });
  const mg = [];
  const fg = [];
  const bg = [];
  for (const d of room.decos) {
    const { layer, ...deco } = d;
    if (layer === 'fg') fg.push({ ...deco, ...toScreen(deco.x, deco.y) });
    else if (layer === 'bg') bg.push({ ...deco, ...toScreen(deco.x, deco.y) });
    else mg.push(deco);
  }
  const doors = room.doors.map((d) => {
    const p = toScreen(d.x, d.y);
    return {
      id: d.id,
      x: p.x,
      y: p.y,
      w: d.w,
      h: d.h,
      sprite: d.sprite,
      key_id: 0,
      requires_level: 0,
      is_locked: false,
      hidden: false,
      connect: { ...d.connect, street: null },
    };
  });
  const boxes = room.spots.map((s) => ({ id: s.id, ...toScreen(s.x, s.y), w: SPOT.w, h: SPOT.h, reconstructed: true }));
  if (room.keyDrop) {
    const k = room.keyDrop;
    boxes.push({ id: k.id, ...toScreen(k.x, k.y), w: k.w, h: k.h, key: k.key });
  }
  const platforms = room.platforms.map(strip);
  const barriers = room.barriers.map(strip);
  const layers = [
    { id: 'middleground', name: 'middleground', z: 0, decos: mg, w: W, h: H },
    { id: `T_${room.sourceTsid}_fg`, name: 'FG', z: 2, decos: fg, w: W, h: H },
  ];
  // A dimmed backdrop behind the middleground (the Ventilation Room's dark plank walls, Room 8's
  // void): layer filters the way the archived corridors darken theirs (C4's T_ layer, brightness -100).
  if (bg.length) layers.push({ id: `T_${room.sourceTsid}_bg`, name: 'BG', z: -1, decos: bg, w: W, h: H, filters: { ...room.bgFilters } });
  return {
    source: TOWER_ROOM_SOURCE,
    reconstructed: true,
    tsid: room.tsid,
    label: room.label,
    swf_file: 'firebog.swf',
    bounds: { ...room.bounds },
    platforms,
    layers,
    signposts: [],
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount: mg.length + fg.length + bg.length,
      signpostCount: 0,
      doorCount: doors.length,
      ladderCount: 0,
      barrierCount: barriers.length,
    },
    gradient: { top: '000000', bottom: '000000' },
    doors,
    barriers,
    boxes,
  };
}

/** The index.json row for a rebuilt room. */
export function towerRoomIndexEntry(room) {
  const street = towerRoomStreet(room);
  return {
    label: room.label,
    file: `assets/streets/${room.tsid}.json`,
    hubId: TOWER_ROOM_HUB.hubId,
    hubName: TOWER_ROOM_HUB.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}

export const towerRoomByTsid = (tsid) => TOWER_ROOMS.find((room) => room.tsid === tsid || room.sourceTsid === tsid) || null;
