/**
 * Vicar's Peak, the Groddle Heights cliff street behind Thornfad Layers'
 * locked door, rebuilt (pure data and a builder: no Pixi, no DOM).
 *
 * What survives in source:
 * - GSJS inc_data_maps_prod.js 16370: hub 64 "Groddle Heights" lists
 *   LCR1516SFHM122V "Vicar's Peak", but no hub map draws it; location.js
 *   2786-2790 special-cases it (and Martleby Hare) as on the map anyway.
 *   No location XML for it is in the public dump.
 * - Thornfad Layers (streets/mnt/stos/location_data/GCR12NU45AM12BB.xml,
 *   2012-10-16) holds door_1, a groddle_wooden_door_lock locked with Door
 *   Key 1, whose connect lands at 708,-105 in Vicar's Peak (hub 64, swf
 *   groddle1). That is the way in.
 * - Mossystep (GCR15ST40FM1M1I.xml, 2012-05-22) lists LCR1516SFHM122V in its
 *   geometry `sources`, which GSJS keeps as the streets that link to it
 *   (locations/inc_geo_links.js geo_links_add_source). So Vicar's Peak had a
 *   way out to Mossystep. Thornfad Layers' own `sources` do not list it.
 *
 * Everything else is read off reference (no pixels or audio ship):
 * - Video WZqTdcjhPII (GlitchAddict, Apocalypse Party at Vicar's Peak,
 *   2011-06-24, beta): a brown rock cliff face in tiers of ledges climbed by
 *   many wooden ladders, piggies and chickens on the ledges, pines at the
 *   top. Its loading card (t0520) says "Home to: 11 Piggies, 7 Chickens, and
 *   1 Metal Rock for mining". The minimap (t1960, t2240) is taller than wide
 *   (~0.75, the 1500 x 2000 of the other Heights climbs, Jacob's Climb and
 *   Clamber Crag), with player rows on about seven tiers, a dark doorway at
 *   the top a little right of centre, another dark shape at the bottom right
 *   (where Thornfad's door lands, x 708) and a pine at the top left.
 * - Two late player Snaps (May 30 and Sep 13 2012, research/wayback/raw/
 *   snaps/vicars_peak/, reference only): unchanged after beta. A brown-grey
 *   rock face, tiers of flat ledges with grey pebbles and dripping faces,
 *   many wooden ladders twined with leafy vines, and a stone-arched wooden
 *   door on the top ledge. Tiers sit ~2 avatar heights apart (~280 px for
 *   the remake's 130 px avatar). The May Snap also shows a few small items on
 *   the ledges (two stands, a lamp, a hanging sign): not identified, not built.
 *
 * Art (all CC0, the groddle1 bundle already in assets/decos/groddle):
 * heights_face_1 and heights_hole_wall_piece for the rock face; the ledges are
 * heights_platform_4 / heights_platform_2 / heights_platform_lip_1 (flat
 * pebbly tops over dripping faces) and heights_platform_1 for the ground;
 * grey pebbles heights_ladder_1/2; olive moss heights_moss_2 (beta loading
 * card); ladders ladder_tile_*_tree (log rails with leafy vines, the Snaps'
 * ladders); the top door heights_door_static (the Snaps' stone-arched wooden
 * door, the Heights door without its lock); a heights_coniferous_3 pine.
 * tools/build-vicars-peak.mjs writes the street JSON, its index row and
 * Thornfad Layers' door target; features/vicars-peak-feature.js gives it the
 * loading card's population.
 */

export const VICARS_PEAK_TSID = 'GCR1516SFHM122V';
export const VICARS_PEAK_SOURCE_TSID = 'LCR1516SFHM122V';
export const VICARS_PEAK_LABEL = "Vicar's Peak";
export const VICARS_PEAK_HUB = Object.freeze({ hubId: '64', hubName: 'Groddle Heights' });
export const THORNFAD_TSID = 'GCR12NU45AM12BB';
export const THORNFAD_SOURCE_TSID = 'LCR12NU45AM12BB';
export const THORNFAD_DOOR = 'door_1';
/** Thornfad's door connect x/y: world, in Vicar's Peak. */
export const VICARS_PEAK_ARRIVE = Object.freeze({ x: 708, y: -105 });
export const MOSSYSTEP_TSID = 'GCR15ST40FM1M1I';
export const MOSSYSTEP_SOURCE_TSID = 'LCR15ST40FM1M1I';
/** Where the top door lands in Mossystep (world): the low left of the street, clear of its one signpost (x 766). No source x/y survives. */
export const MOSSYSTEP_ARRIVE = Object.freeze({ x: -560, y: -250 });
export const VICARS_PEAK_SOURCE =
  "reconstruction: Vicar's Peak (LCR1516SFHM122V, not in tinyspeck/glitch-locations); layout from video WZqTdcjhPII and two 2012 Snaps, art CC0 groddle1 Heights decos";

/** The loading card's population (video WZqTdcjhPII t0520). */
export const VICARS_PEAK_POPULATION = Object.freeze({ npc_piggy: 11, npc_chicken: 7, rock_metal_1: 1 });

/** True for the street under either TSID prefix (G as imported, L as GSJS names it). */
export const isVicarsPeakTsid = (tsid) => String(tsid || '').slice(1) === VICARS_PEAK_TSID.slice(1);

const L = -750;
const R = 750;
const T = -2000;
const B = 0;
export const VICARS_PEAK_BOUNDS = Object.freeze({ l: L, r: R, t: T, b: B });
const W = R - L;
const H = B - T;

/* ------------------------------------------------------------------ */
/* Tiers and ladders                                                   */
/* ------------------------------------------------------------------ */

/**
 * Ledge tiers, bottom to top: walk-line y and the ledge segments [x0, x1]
 * (world). Seven tiers ~280 px apart, as the minimap's player rows; the
 * gaps leave the rock face showing between ledges, as in the Snaps.
 */
export const TIERS = Object.freeze([
  { id: 't0', y: -105, segs: [[L, R]], why: "the ground: Thornfad's door lands at 708,-105" },
  { id: 't1', y: -385, segs: [[L, -120], [60, R]] },
  { id: 't2', y: -665, segs: [[L, 250], [420, R]] },
  { id: 't3', y: -945, segs: [[-600, R]] },
  { id: 't4', y: -1225, segs: [[L, -250], [-80, R]] },
  { id: 't5', y: -1505, segs: [[L, 150], [330, R]] },
  { id: 't6', y: -1785, segs: [[L, 520]], why: 'the top ledge with the arched door (Snaps) and a pine at its left end (minimap)' },
].map((t) => Object.freeze({ ...t, segs: Object.freeze(t.segs.map((s) => Object.freeze(s))) })));

/** Ladders: world x and the tier each stands on (it climbs to the next one up). Many, as in the Snaps. */
export const LADDER_SPOTS = Object.freeze([
  [-560, 0], [300, 0], [480, 0],
  [-650, 1], [-300, 1], [520, 1],
  [-420, 2], [120, 2], [600, 2],
  [-520, 3], [250, 3], [680, 3],
  [-640, 4], [60, 4], [560, 4],
  [-380, 5], [-540, 5], [420, 5],
].map(([x, from]) => Object.freeze({ x, from })));

/** Climb zone width (source Heights ladders are 50; a little wider for the remake's avatar). */
export const LADDER_W = 60;
/** The climb zone ends this far above the upper ledge's walk line (Symphonious Maximus' rule). */
const LADDER_OVER = 10;

const onSeg = (tier, x, margin = 30) => tier.segs.some(([a, b]) => x >= a + margin && x <= b - margin);

export function ladderGeometry() {
  return LADDER_SPOTS.map((spot, i) => {
    const lower = TIERS[spot.from];
    const upper = TIERS[spot.from + 1];
    if (!upper || !onSeg(lower, spot.x) || !onSeg(upper, spot.x)) {
      throw new Error(`ladder ${i} at ${spot.x} does not join tier ${spot.from} to the next`);
    }
    const top = upper.y - LADDER_OVER;
    return { id: `ladder_vp_${String(i + 1).padStart(2, '0')}`, x: spot.x, y: lower.y, w: LADDER_W, h: lower.y - top, top, from: lower.id, to: upper.id };
  });
}

/* ------------------------------------------------------------------ */
/* Doors                                                               */
/* ------------------------------------------------------------------ */

/** The top door (Snaps: stone-arched wooden door on the top ledge; minimap: a little right of centre). */
export const TOP_DOOR = Object.freeze({ id: 'door_vp_top', x: 135, tier: 6, w: 150, h: 161, sprite: 'heights_door_static' });
/** The bottom door by Thornfad's landing (minimap: a dark shape at the bottom right). */
export const BOTTOM_DOOR = Object.freeze({ id: 'door_vp_bottom', x: 640, tier: 0, w: 140, h: 150, sprite: 'heights_door_static' });

/* ------------------------------------------------------------------ */
/* Decos                                                               */
/* ------------------------------------------------------------------ */

const deco = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra });

/** A deterministic 0..1 from an integer (no Math.random: the builder's --check must be stable). */
const rnd = (n) => {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h % 10000) / 10000;
};

/** Ledge pieces: logical size; their tops are flat (first opaque row within 5% of the top). */
const LEDGES = Object.freeze({
  heights_platform_4: [1026, 434],
  heights_platform_2: [902, 416],
  heights_platform_lip_1: [1388, 608],
});
const LEDGE_ORDER = ['heights_platform_4', 'heights_platform_2', 'heights_platform_lip_1'];
/** Ledge scale: a ~30 px pebbly top and ~150 px of dripping face, as in the Snaps. */
const LEDGE_S = 0.42;
/** Feet stand this far into the ledge's top surface. */
const SINK = 12;

/** Rock face: heights_face_1 tiles over the whole street, flipped in turn, under everything. */
function wallDecos() {
  const out = [];
  const [lw, lh] = [1684, 1152];
  const s = 0.6;
  let k = 0;
  for (let y = T - 60; y < B + lh * s; y += 470) {
    const row = Math.round((y - T) / 470);
    for (let x = L - 200 + (row % 2) * 330; x < R + 400; x += 660) {
      out.push(deco('heights_face_1', x, y + lh * s, lw * s, lh * s, 1 + (k % 4), k % 2 ? { flip: true } : {}));
      k += 1;
    }
  }
  // Rock blobs over the joins, so the tiles' edges never line up.
  for (let i = 0; i < 14; i += 1) {
    const x = L + 60 + rnd(i + 11) * (W - 120);
    const y = T + 150 + rnd(i + 71) * (H - 200);
    out.push(deco('heights_hole_wall_piece', x, y, 282 * 0.8, 296 * 0.8, 6, i % 2 ? { flip: true } : {}));
  }
  // Grey rock patches on the face (Snap Sep 2012: a grey stone cluster on the right).
  for (const [x, y] of [[560, -1300], [-420, -520], [300, -1880], [-640, -1060]]) {
    out.push(deco('heights_face_rock_2', x, y, 288 * 0.6, 120 * 0.6, 8));
  }
  // Grey pebbles set in the face.
  for (let i = 0; i < 22; i += 1) {
    const x = L + 40 + rnd(i + 301) * (W - 80);
    const y = T + 80 + rnd(i + 401) * (H - 120);
    out.push(deco(i % 2 ? 'heights_ladder_1' : 'heights_ladder_2', x, y, 146 * 0.32, 158 * 0.32, 9, i % 3 ? {} : { flip: true }));
  }
  return out;
}

/** One ledge segment: pieces end to end, spread evenly so both ends overhang the walk line a little. */
function ledgeDecos(tier, [x0, x1], ti, si) {
  const out = [];
  const from = Math.max(L - 60, x0 - 14);
  const to = Math.min(R + 60, x1 + 14);
  const span = to - from;
  const pieceW = 980 * LEDGE_S;
  const n = Math.max(1, Math.ceil(span / (pieceW * 0.82)));
  for (let i = 0; i < n; i += 1) {
    const sprite = LEDGE_ORDER[(ti + si + i) % LEDGE_ORDER.length];
    const [lw, lh] = LEDGES[sprite];
    const w = Math.min(lw * LEDGE_S, span / n + 60);
    const h = lh * LEDGE_S;
    const cx = from + (i + 0.5) * (span / n);
    const top = tier.y - SINK;
    out.push(deco(sprite, cx, top + h, w, h, 20 + ti * 4 + (i % 3), { id: `ledge_${tier.id}_${si + 1}_${i + 1}`, ...((ti + i) % 2 ? { flip: true } : {}) }));
  }
  return out;
}

/** The ground tier: deep ledge blocks down past the street bottom. */
function groundDecos() {
  const out = [];
  const [lw, lh] = [444, 380];
  const s = 0.62;
  let k = 0;
  for (let x = L - 40; x < R + 160; x += lw * s * 0.8) {
    out.push(deco('heights_platform_1', x, TIERS[0].y - SINK + lh * s, lw * s, lh * s, 18 + (k % 2), { id: `ground_${k + 1}`, ...(k % 2 ? { flip: true } : {}) }));
    k += 1;
  }
  return out;
}

/** Pebbles lying on the ledge tops (Snaps: grey pebbles on every tier). */
function pebbleDecos() {
  const out = [];
  let k = 0;
  TIERS.forEach((tier, ti) => {
    for (const [a, b] of tier.segs) {
      const n = Math.max(1, Math.round((b - a) / 300));
      for (let i = 0; i < n; i += 1) {
        const x = a + 40 + rnd(k * 7 + 5) * (b - a - 80);
        out.push(deco(k % 2 ? 'heights_ladder_2' : 'heights_ladder_1', x, tier.y + 4, 146 * 0.26, 158 * 0.26, 60 + ti));
        k += 1;
      }
    }
  });
  return out;
}

/** Olive moss on a few ledges (beta loading card t0520 and t0120). */
const MOSS = Object.freeze([[-470, 1], [380, 2], [-200, 4], [610, 5], [-300, 0]]);
function mossDecos() {
  return MOSS.map(([x, ti], i) => deco('heights_moss_2', x, TIERS[ti].y + 10, 398 * 0.45, 88 * 0.45, 58, i % 2 ? { flip: true } : {}));
}

/**
 * Ladder art: ladder_tile_*_tree (220 x 100, rails centred) from the lower
 * ledge to just over the upper one; cap_1 at the foot, cap_0 at the head,
 * the three vined centres between. Each tile is stretched a little in y so
 * a whole number of tiles fills the climb.
 */
export const LADDER_TILE_S = 0.55;
function ladderDecos() {
  const out = [];
  const tileW = 220 * LADDER_TILE_S;
  ladderGeometry().forEach((lad, li) => {
    const foot = lad.y + 6;
    const head = lad.top - 6;
    const len = foot - head;
    const n = Math.max(2, Math.round(len / (100 * LADDER_TILE_S)));
    const step = len / n;
    for (let i = 0; i < n; i += 1) {
      const sprite = i === 0 ? 'ladder_tile_cap_1_tree' : i === n - 1 ? 'ladder_tile_cap_0_tree' : `ladder_tile_center_0${((i + li) % 3) + 1}_tree`;
      out.push(deco(sprite, lad.x, foot - i * step, tileW, step + 1, 100 + i, (li + i) % 2 ? { flip: true } : {}));
    }
  });
  return out;
}

/** A pine on the top ledge's left end (minimap t2240: a green tree at the top left; video t0040). */
const PINE = Object.freeze({ sprite: 'heights_coniferous_3', x: -680, w: 530 * 0.3, h: 1290 * 0.3 });

function middlegroundDecos() {
  const pine = deco(PINE.sprite, PINE.x, TIERS[6].y + 6, PINE.w, PINE.h, 12);
  return [
    ...wallDecos(),
    pine,
    ...groundDecos(),
    ...TIERS.slice(1).flatMap((tier, i) => tier.segs.flatMap((seg, si) => ledgeDecos(tier, seg, i + 1, si))),
    ...pebbleDecos(),
    ...mossDecos(),
    ...ladderDecos(),
  ];
}

/* ------------------------------------------------------------------ */
/* Street                                                              */
/* ------------------------------------------------------------------ */

function platforms() {
  const out = [];
  for (const tier of TIERS) {
    tier.segs.forEach(([x0, x1], si) => {
      out.push({ id: `plat_vp_${tier.id}_${si + 1}`, x1: x0, y1: tier.y, x2: x1, y2: tier.y, pc_perm: -1 });
    });
  }
  return out;
}

/** A door in screen space (bottom-centre), as build-street-navigation writes them. */
function doorRow(door, connect) {
  return {
    id: door.id,
    x: door.x - L,
    y: TIERS[door.tier].y - T,
    w: door.w,
    h: door.h,
    sprite: door.sprite,
    key_id: 0,
    requires_level: 0,
    is_locked: false,
    hidden: false,
    connect,
  };
}

/**
 * The street JSON. `thornfadArrive` / `mossystepArrive` are the doors'
 * landings (target screen space), filled in by the builder.
 */
export function vicarsPeakStreet({ thornfadArrive = null, thornfadXY = null, mossystepArrive = null } = {}) {
  const plats = platforms();
  const ladders = ladderGeometry();
  const layers = [{ id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: middlegroundDecos() }];
  const decoCount = layers.reduce((n, l) => n + l.decos.length, 0);
  const doors = [
    doorRow(TOP_DOOR, {
      tsid: MOSSYSTEP_SOURCE_TSID, label: 'Mossystep', street: MOSSYSTEP_TSID,
      x: MOSSYSTEP_ARRIVE.x, y: MOSSYSTEP_ARRIVE.y, hub_id: '56',
      ...(mossystepArrive ? { arrive: { ...mossystepArrive } } : {}),
    }),
    doorRow(BOTTOM_DOOR, {
      tsid: THORNFAD_SOURCE_TSID, label: 'Thornfad Layers', street: THORNFAD_TSID,
      ...(thornfadXY ? { x: thornfadXY.x, y: thornfadXY.y } : {}), hub_id: VICARS_PEAK_HUB.hubId,
      ...(thornfadArrive ? { arrive: { ...thornfadArrive } } : {}),
    }),
  ];
  return {
    source: VICARS_PEAK_SOURCE,
    reconstructed: true,
    tsid: VICARS_PEAK_TSID,
    label: VICARS_PEAK_LABEL,
    hubId: VICARS_PEAK_HUB.hubId,
    hubName: VICARS_PEAK_HUB.hubName,
    swf_file: 'groddle1.swf',
    bounds: { ...VICARS_PEAK_BOUNDS },
    platforms: plats,
    layers,
    signposts: [],
    doors,
    stats: {
      platformCount: plats.length,
      layerCount: layers.length,
      decoCount,
      signpostCount: 0,
      doorCount: doors.length,
      ladderCount: ladders.length,
      barrierCount: 0,
    },
    // Rock browns: the face covers the whole street, so this only shows through gaps.
    gradient: { top: '6B563F', bottom: '5A4836' },
    ladders: ladders.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
    why: {
      street: "inc_data_maps_prod.js 16370 (hub 64); location.js 2786-2790 counts it as on the map; no location XML.",
      bounds: 'Minimap (video WZqTdcjhPII t1960, t2240) ~0.75 wide for tall, like the 1500 x 2000 Heights climbs; Thornfad door lands at 708,-105.',
      tiers: 'Seven ledge tiers ~280 px apart: minimap player rows, ~2 avatar heights in the Snaps.',
      ladders: 'Wooden ladders twined with leafy vines between every tier (Snaps May 30 and Sep 13 2012).',
      topDoor: "Stone-arched wooden door on the top ledge (Snaps). Leads to Mossystep: Mossystep's geometry sources (2012-05-22) list Vicar's Peak, so it linked there; arrival x/y not archived.",
      bottomDoor: "Back to Thornfad Layers, in front of its door: a dark shape at the bottom right of the minimap where Thornfad's door lands. Remake choice: Thornfad's sources (2012-10-16) do not list Vicar's Peak.",
      population: 'Loading card t0520: 11 Piggies, 7 Chickens, and 1 Metal Rock for mining.',
      notBuilt: 'The May 2012 Snap shows small unidentified items on the ledges (two stands, a lamp, a hanging sign).',
    },
  };
}

/** The ecology row the feature returns (loading card t0520). */
export function vicarsPeakEcology() {
  return {
    label: VICARS_PEAK_LABEL,
    sourceTsid: VICARS_PEAK_SOURCE_TSID,
    counts: { ...VICARS_PEAK_POPULATION },
    // The source card's 11 Piggies and 7 Chickens, over the default rendering caps (6 / 3).
    caps: { piggies: VICARS_PEAK_POPULATION.npc_piggy, chickens: VICARS_PEAK_POPULATION.npc_chicken },
    reconstructed: true,
  };
}

/** The index.json row. */
export function vicarsPeakIndexEntry(street = vicarsPeakStreet()) {
  return {
    label: VICARS_PEAK_LABEL,
    file: `assets/streets/${VICARS_PEAK_TSID}.json`,
    hubId: VICARS_PEAK_HUB.hubId,
    hubName: VICARS_PEAK_HUB.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}
