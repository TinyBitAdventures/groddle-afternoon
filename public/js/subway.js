/**
 * The Ur subway (register row G115): rules, source copy, the solo ride
 * schedule and the station and train street builders. Pure data and
 * functions (no Pixi, no DOM); features/subway-feature.js runs it.
 *
 * Source (glitch-GameServerJS, CC0):
 * - config_prod.js transit_instances.subway_1 (js/subway-line.js, generated
 *   by tools/build-subway.mjs): fare 50, Red Line forwards (next_stop) and
 *   Blue Line backwards (previous_stop), train template LTJ101M7R9O1HTT,
 *   min_capacity 3, initial_departure_timeout 60 s, departure_timeout 10 s,
 *   arrival_timeout 30 s, 12 stations with their surface street
 *   (connects_to) and map_pos.
 * - items/subway_gate.js "A Red Button": push plays SUBWAY_BUTTON; without
 *   the you_have_papers badge, or under the dont_get_caught buff, a refusal;
 *   otherwise "Train tickets 50C." with the two lines' next stops. Paying
 *   puts you straight into the train (transit_enter_instance), "Whoops!
 *   Looks like you can't afford that." when you can't.
 * - locations/inc_transit.js: the ride. Boarding counts transit
 *   subways_entered (once per boarding, however many stops you stay on).
 *   Doors close with "This train will depart for X in a few seconds." and
 *   TRAIN_DEPARTS, it departs 3 s later ("This train is departing.",
 *   window overlays, TRAVELLING_TRAIN), 10 s before arrival "The next stop
 *   is X, arriving in 10 seconds.", brakes 7 s later (TRAIN_ARRIVES), then
 *   "The train has arrived at X." and the prompt "This stop is X. Get off
 *   train?" (yes / no, 10 s). Yes puts you on that station at x 0, y -136
 *   (players/player.js transit_disembark_callback); no, or no answer, rides
 *   on: the doors close 7 s after arrival and it departs at 10 s.
 * - achievements subwayfarer 23, ground_hogger 103, commuter_mug 251,
 *   chute_jockey 503 (group transit, counter subways_entered).
 * - items/subway_map.js "Subway Map": verb view, "Direct your peepers at
 *   this here map", opens the Subway System map.
 *
 * Solo adaptations: the source waited up to 60 s for 3 riders; with no one
 * else coming the train leaves 10 s after you board (the source's own
 * departure_timeout between stops), and a hop between stations takes 20 s
 * instead of 30 (the "arriving in 10 seconds" call and the brakes keep their
 * source offsets). Stops keep the source's 10 s dwell and prompt.
 *
 * The stations and the train were never archived (not in the public
 * locations dump), so they are rebuilt from footage (Lily Linguistic's
 * VVyjuuRxDUw and bvOH7rsQ6qo, reference only) with the subway1.swf pieces
 * (js/subway-art.js): one station layout shared by all 12 (the source used
 * one subway template per station), each with its own name sign.
 */

import { SUBWAY_LINE } from './subway-line.js?v=g115-1';
import { SUBWAY_ART } from './subway-art.js?v=g115-1';

export { SUBWAY_LINE, SUBWAY_ART };

export const SUBWAY_ART_BASE = 'assets/sprites/subway/';
export const FARE = SUBWAY_LINE.fare;
export const PAPERS_BADGE = 'you_have_papers';
export const CARD_BADGE = 'card_carrying_qualification';
export const DUBIOUS_BUFF = 'dont_get_caught';
export const RIDE_COUNTER = 'transit:subways_entered';
export const DIRECTIONS = Object.freeze(['forwards', 'backwards']);

/** The four transit badges (achievements/*.js conditions 553-556). */
export const SUBWAY_BADGES = Object.freeze([
  Object.freeze({ id: 'subwayfarer', rides: 23 }),
  Object.freeze({ id: 'ground_hogger', rides: 103 }),
  Object.freeze({ id: 'commuter_mug', rides: 251 }),
  Object.freeze({ id: 'chute_jockey', rides: 503 }),
]);

/** Line colours read off the Subway System map in the footage (bvOH7rsQ6qo t0016). */
export const LINE_COLOURS = Object.freeze({ forwards: '#e8553c', backwards: '#5aaee6' });

export const lineName = (direction) => (direction === 'backwards' ? SUBWAY_LINE.backwards_name : SUBWAY_LINE.forwards_name);

/* ------------------------------------------------------------------ */
/* Stations                                                            */
/* ------------------------------------------------------------------ */

export const STATIONS = SUBWAY_LINE.stations;
const BY_ID = new Map(STATIONS.map((s) => [s.id, s]));
const BY_TSID = new Map();
for (const s of STATIONS) {
  BY_TSID.set(s.tsid, s);
  BY_TSID.set(s.streetTsid, s);
}

export const CAR_TSID = SUBWAY_LINE.car.streetTsid;
export const CAR_LABEL = SUBWAY_LINE.car.label;

export const stationById = (id) => BY_ID.get(Number(id)) || null;
/** A station by its L or G tsid. */
export const stationByTsid = (tsid) => BY_TSID.get(String(tsid || '')) || null;
export const isCarTsid = (tsid) => !!tsid && (tsid === CAR_TSID || tsid === SUBWAY_LINE.template_tsid);
export const surfaceStation = (surfaceTsid) => STATIONS.find((s) => s.surfaceStreetTsid === surfaceTsid || s.connects_to === surfaceTsid) || null;

/** The station a direction's train reaches next (transit_get_next_stop / transit_get_previous_stop). */
export function nextStation(id, direction = 'forwards') {
  const here = stationById(id);
  if (!here) return null;
  return stationById(direction === 'backwards' ? here.previous_stop : here.next_stop);
}

/** "Groddle Forest Junction" -> sub_sign_groddle_forest_junction, the station's own sign. */
export const signPiece = (station) => `sub_sign_${String(station?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

/** A station by id, name, slug or tsid (QA routes). */
export function findStation(key) {
  const raw = String(key ?? '').trim();
  if (!raw) return null;
  const byId = /^\d+$/.test(raw) ? stationById(raw) : null;
  if (byId) return byId;
  const tsid = stationByTsid(raw.toUpperCase());
  if (tsid) return tsid;
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return STATIONS.find((s) => s.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === slug
    || s.label.toLowerCase().replace(/[^a-z0-9]+/g, '') === slug
    || s.surfaceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '') === slug) || null;
}

/* ------------------------------------------------------------------ */
/* Source copy                                                         */
/* ------------------------------------------------------------------ */

export const TEXT = Object.freeze({
  gateLabel: 'A Red Button',
  gateTooltip: 'Buy a ticket',
  gateDesc: 'A button on an old ruin, but still operative! A subway gate.',
  refusePapers: "I'm sorry: without Your Papers, you may not use public transportation.",
  refuseDubious: "I'm sorry: public transportation is not available to those engaging in journeys of dubious purpose.",
  cantAfford: "Whoops! Looks like you can't afford that.",
  noThanks: 'No thanks',
  ok: 'OK',
  papersIncomplete: 'You have acquired and activated your Card-Carrying Qualification, and you have Your Papers but you need to complete them. Try clicking on Your Papers in your pack.',
  // The source goes on "or you can avoid the red tape by getting them from another player. Hint: Try Auctions": there are no other players here.
  papersAtHall: 'You can get Your Papers at the Bureaucratic Hall on Gregarious Grange.',
  cardNotActive: 'You have acquired your Card-Carrying Qualification, but you need to activate it. Try clicking on the Card-Carrying Qualification in your pack. After that, return to the Bureaucratic Hall on Gregarious Grange and purchase and complete Your Papers.',
  mapLabel: 'Subway Map',
  mapTooltip: 'Direct your peepers at this here map',
  mapViewed: 'You viewed a Subway Map.',
  mapTitle: 'Subway System',
  yes: 'yes',
  no: 'no',
});

/** subway_gate.js push: the ticket conversation for a station. */
export function ticketOffer(stationId) {
  const fwd = nextStation(stationId, 'forwards');
  const back = nextStation(stationId, 'backwards');
  if (!fwd || !back) return null;
  return {
    title: `Train tickets ${FARE}C.`,
    text: 'Which line would you like to ride?',
    lines: [
      { direction: 'forwards', name: SUBWAY_LINE.forwards_name, next: fwd.name },
      { direction: 'backwards', name: SUBWAY_LINE.backwards_name, next: back.name },
    ],
    choices: [
      { value: 'pay-forwards', label: `${SUBWAY_LINE.forwards_name} (${FARE}C)` },
      { value: 'pay-backwards', label: `${SUBWAY_LINE.backwards_name} (${FARE}C)` },
      { value: 'no-pay', label: TEXT.noThanks },
    ],
  };
}

/** The gate's refusal, or null when the player may buy a ticket (papers first, then the buff, as in push). */
export function gateRefusal({ hasPapers = false, dubious = false } = {}) {
  if (!hasPapers) return { code: 'papers', text: TEXT.refusePapers };
  if (dubious) return { code: 'dubious', text: TEXT.refuseDubious };
  return null;
}

/** subway_gate.js onConversation 'ok' after the papers refusal: where the player stands with the Bureaucratic Hall. */
export function papersHint({ hasCardBadge = false, hasPapersItem = false, hasCardItem = false } = {}) {
  if (hasCardBadge) return hasPapersItem ? TEXT.papersIncomplete : TEXT.papersAtHall;
  if (hasCardItem) return TEXT.cardNotActive;
  return null;
}

/** Pay the fare from a pc ({ currants }); false when it can't be afforded (stats_try_remove_currants). */
export function payFare(pc) {
  if (!pc || (Number(pc.currants) || 0) < FARE) return false;
  pc.currants -= FARE;
  return true;
}

export const announce = Object.freeze({
  // Solo: the source's "when N more players board, or in S seconds" has no players to wait for.
  boarding: (seconds) => `This train will be departing in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`,
  doorsClose: (next) => ({ text: 'This train will depart for {name} in a few seconds.', name: next }),
  departing: () => ({ text: 'This train is departing.' }),
  nextStop: (next) => ({ text: 'The next stop is {name}, arriving in 10 seconds.', name: next }),
  arrived: (here) => ({ text: 'The train has arrived at {name}.', name: here }),
  getOff: (here) => `This stop is ${here}. Get off train?`,
});

/** Badges a ride count has reached (for tests and QA). */
export const badgesReached = (rides) => SUBWAY_BADGES.filter((b) => rides >= b.rides).map((b) => b.id);

/* ------------------------------------------------------------------ */
/* The ride                                                            */
/* ------------------------------------------------------------------ */

const S = 1000;
/** Source timings (seconds), for the record and the tests. */
export const SOURCE_TIMING = Object.freeze({
  initialDeparture: SUBWAY_LINE.initial_departure_timeout,
  departure: SUBWAY_LINE.departure_timeout,
  arrival: SUBWAY_LINE.arrival_timeout,
  doorsToDepart: 3,
  preArrival: 10,
  brakesAfterPreArrival: 7,
  prompt: 10,
});

/** Solo timings in ms; `scale` < 1 speeds a QA run up. */
export function rideTiming(scale = 1) {
  const k = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Object.freeze({
    board: 10 * S * k, // boarding to departure (source departure_timeout; the source waited 60 s for riders)
    doors: 3 * S * k, // doors close this long before departure
    travel: 20 * S * k, // departure to arrival (source 30 s)
    preArrival: 10 * S * k, // "arriving in 10 seconds", before arrival
    brakes: 3 * S * k, // TRAIN_ARRIVES this long before arrival (source: 7 s after the call)
    dwell: SUBWAY_LINE.departure_timeout * S * k, // arrival to departure
    prompt: SOURCE_TIMING.prompt * S * k,
  });
}

/**
 * A ride from boarding. The train is at `stop` (a station id) heading
 * `direction`; times are wall-clock ms.
 */
export function createRide({ stop, direction = 'forwards', now = 0, timing = rideTiming() } = {}) {
  const next = nextStation(stop, direction);
  if (!next) return null;
  return {
    stop: Number(stop),
    direction: direction === 'backwards' ? 'backwards' : 'forwards',
    phase: 'boarding', // boarding | moving | stopped
    boardedAt: now,
    departAt: now + timing.board,
    doorsAt: now + timing.board - timing.doors,
    arriveAt: 0,
    preAt: 0,
    brakesAt: 0,
    doorsClosed: false,
    called: false,
    braked: false,
    stops: 0,
    timing,
  };
}

/** The station the ride is heading for (or standing at, once it arrives). */
export const rideNext = (ride) => (ride ? nextStation(ride.stop, ride.direction) : null);

/**
 * Advance a ride to `now`; returns the events that fired, in order:
 * { type: 'doors', next } | { type: 'depart', next } | { type: 'call', next } |
 * { type: 'brakes' } | { type: 'arrive', station }.
 */
export function stepRide(ride, now) {
  const out = [];
  if (!ride) return out;
  const t = ride.timing;
  for (let guard = 0; guard < 8; guard += 1) {
    if (ride.phase !== 'moving') {
      if (!ride.doorsClosed && now >= ride.doorsAt) {
        ride.doorsClosed = true;
        out.push({ type: 'doors', next: rideNext(ride) });
        continue;
      }
      if (now >= ride.departAt) {
        ride.phase = 'moving';
        ride.arriveAt = ride.departAt + t.travel;
        ride.preAt = ride.arriveAt - t.preArrival;
        ride.brakesAt = ride.arriveAt - t.brakes;
        ride.called = false;
        ride.braked = false;
        out.push({ type: 'depart', next: rideNext(ride) });
        continue;
      }
      break;
    }
    if (!ride.called && now >= ride.preAt) {
      ride.called = true;
      out.push({ type: 'call', next: rideNext(ride) });
      continue;
    }
    if (!ride.braked && now >= ride.brakesAt) {
      ride.braked = true;
      out.push({ type: 'brakes' });
      continue;
    }
    if (now >= ride.arriveAt) {
      const here = rideNext(ride);
      ride.stop = here.id;
      ride.phase = 'stopped';
      ride.stops += 1;
      ride.doorsClosed = false;
      ride.departAt = ride.arriveAt + t.dwell;
      ride.doorsAt = ride.departAt - t.doors;
      out.push({ type: 'arrive', station: here });
      continue;
    }
    break;
  }
  return out;
}

/** Whether "Get off train?" may still be answered yes (transit_disembark_callback: not once departed). */
export const canDisembark = (ride) => !!ride && ride.phase === 'stopped';

/* ------------------------------------------------------------------ */
/* Streets                                                             */
/* ------------------------------------------------------------------ */

/*
 * The station, world space (x right, y up negative), floor at the source's
 * arrival y -136. Left to right as in the footage (VVyjuuRxDUw t0000-t0012,
 * bvOH7rsQ6qo t0000-t0016, ~1.45 world px per video px): the stairs up to
 * the street, a crack with a pipe in the stone wall, the station's sign, a
 * column, the Subway Map post, the spot where riders step off (x 0), a crack
 * running down the wall, then the train's nose standing at the platform
 * with the ticket post and the gate block (A Red Button) in front of it.
 * The remake's camera shows ~330 px over the feet (the client ~480), so the
 * sign and cracks hang a little lower than in the footage.
 */
export const STATION_FLOOR = -136;
export const STATION_BOUNDS = Object.freeze({ l: -960, r: 850, t: -640, b: -50 });
export const STATION_X = Object.freeze({ stairs: -860, crack: -690, sign: -500, column: -330, map: -150, arrive: 0, crack2: 130, train: 210, post: 420, gate: 560 });

const art = (piece, x, y, z, extra = {}) => {
  const [, w, h] = SUBWAY_ART[piece] || [null, 0, 0];
  return Object.freeze({ piece, x, y, w: extra.w ?? w, h: extra.h ?? h, z, ...(extra.flip ? { flip: true } : {}), ...(extra.alpha ? { alpha: extra.alpha } : {}) });
};

/** Art rows: x centre, y bottom (world), z under the avatar (negative) or over it. */
export function stationArt(station) {
  const F = STATION_FLOOR;
  const { l, r } = STATION_BOUNDS;
  const X = STATION_X;
  const rows = [];
  const tiles = (piece, bottom, z, w = SUBWAY_ART[piece][1]) => {
    for (let x = l - 20; x < r + 20; x += w - 2) rows.push(art(piece, x + w / 2, bottom, z));
  };
  tiles('wall_1', F - 160, -70);
  tiles('wall_1', F - 160 - 220, -71);
  tiles('ceiling_1', F - 410, -66);
  tiles('back_platform_1', F - 120, -64);
  rows.push(art('wall_crack_1', X.crack, F - 150, -62));
  rows.push(art('wallpipe_1', X.crack + 10, F - 265, -61));
  rows.push(art(signPiece(station), X.sign, F - 170, -60));
  rows.push(art('wall_crack_2', X.crack2, F - 130, -62));
  // The train stands in the trench: nose at the left, body running off the right end.
  rows.push(art('train_1', X.train + SUBWAY_ART.train_1[1] / 2, F - 120, -56));
  rows.push(art('platform_crack_1', -40, F + 30, -48));
  rows.push(art('column_1', X.column, F + 44, -30, { w: 70, h: 600 }));
  rows.push(art('ticket_post_back', X.post, F + 10, -24));
  rows.push(art('subway_gate_static', X.gate, F + 14, -22));
  rows.push(art('door_asset_stairs', X.stairs, F + 12, -40));
  return rows;
}

/**
 * The platform floor: the street's own middleground decos (subway_platform_1
 * is already a street deco), so the street renderer draws it under the
 * feature's art; nothing behind it reaches below its top edge (F - 120).
 */
export function stationDecos() {
  const { l, r } = STATION_BOUNDS;
  const out = [];
  let i = 0;
  for (let x = l - 20; x < r + 20; x += 954, i += 1) {
    out.push({ id: `subway_platform_${i}`, sprite: 'subway_platform_1', x: Math.round(x + 957 / 2), y: STATION_FLOOR + 127, w: 957, h: 247, z: i, r: 0 });
  }
  return out;
}

/*
 * The train car, world space, floor at the source's y -59. The car wall
 * (subway_interior_1, 1200 x 700) is placed so its windows fall where the
 * source's window overlays do (inc_transit.js transit_start_subway_windows:
 * left edges x -528, -52, 441, 275 x 161), feet 542 px below its top (the
 * benches and window sills against the avatar in VVyjuuRxDUw t0016-t0040).
 * Ads run along the light band over the windows, the SOLD poster sits on the
 * wall by the first window, poles stand at the wall seams.
 */
export const CAR_FLOOR = SUBWAY_LINE.car.y;
export const CAR_BOUNDS = Object.freeze({ l: -800, r: 1000, t: -640, b: -20 });
export const CAR_TILE_TOP = CAR_FLOOR - 542;
export const CAR_TILE_X = Object.freeze([-1665, -465, 735]);
export const CAR_WINDOWS = Object.freeze([-528, -52, 441].map((left) => left + 275 / 2 - 2.5));
export const CAR_WINDOW_BOTTOM = CAR_TILE_TOP + 458;
/** inc_transit.js floor overlays (left edges -713, -216, 369; 642 x 89). */
export const CAR_FLOOR_LIGHTS = Object.freeze([-713, -216, 369].map((left) => left + 642 / 2));
const AD_CYCLE = [1, 2, 3, 4, 5];

export function carArt() {
  const rows = [];
  const [, tw, th] = SUBWAY_ART.subway_interior_1;
  for (const x of CAR_TILE_X) rows.push(art('subway_interior_1', x + tw / 2, CAR_TILE_TOP + th, -70));
  // Ads: 290-wide panels with small gaps along the band (tile y 210-300).
  const adBottom = CAR_TILE_TOP + 296;
  let i = 0;
  for (let x = CAR_BOUNDS.l - 120; x < CAR_BOUNDS.r + 150; x += 298, i += 1) {
    rows.push(art(`subway_ad_${AD_CYCLE[i % AD_CYCLE.length]}`, x, adBottom, -64));
  }
  rows.push(art('subway_ad_6', CAR_WINDOWS[0] - 225, CAR_TILE_TOP + 456, -63));
  return rows;
}

/** Poles at the wall seams, a street layer in front of the riders (screen space, like any T_ layer). */
export function carFrontDecos() {
  const { l, t } = CAR_BOUNDS;
  return [CAR_TILE_X[1] + 310, CAR_TILE_X[2] + 310].map((x, i) => ({
    id: `subway_pole_${i}`, sprite: 'subway_interior_pole_1', x: x - l, y: CAR_FLOOR + 40 - t, w: 25, h: 550, z: i, r: 0,
  }));
}

/** Bench seats as one-way ledges (an avatar can stand on the benches in VVyjuuRxDUw t0040). */
export function carBenches() {
  const spans = [[0, 265], [333, 738], [817, 1200]];
  const out = [];
  for (const x0 of CAR_TILE_X) {
    for (const [a, b] of spans) {
      const x1 = Math.max(CAR_BOUNDS.l, x0 + a + 12);
      const x2 = Math.min(CAR_BOUNDS.r, x0 + b - 12);
      if (x2 - x1 > 40) out.push({ id: `plat_bench_${x0 + a}`, x1, y1: CAR_FLOOR - 36, x2, y2: CAR_FLOOR - 36, pc_perm: -1 });
    }
  }
  return out;
}

const why = Object.freeze({
  street: 'config_prod.js transit_instances.subway_1 and inc_data_maps_prod.js; no location XML (the stations and the train are not in tinyspeck/glitch-locations).',
  look: 'Footage VVyjuuRxDUw and bvOH7rsQ6qo (Lily Linguistic, reference only) at ~1.45 world px per video px; art from subway1.swf (js/subway-art.js).',
});

export const STATION_MUSIC = 'SUBWAY_STATION_HUM';
export const CAR_MUSIC = 'SUBWAY_CAR_HUM';

/**
 * A station's street JSON. Its one door is the stairs up to the surface
 * street, arriving in front of that street's subway entrance.
 */
export function stationStreet(station, { surfaceDoor = null } = {}) {
  const { l, r, t, b } = STATION_BOUNDS;
  const platforms = [{ id: 'plat_subway_platform', x1: l, y1: STATION_FLOOR, x2: r, y2: STATION_FLOOR, pc_perm: -1 }];
  const [, sw, sh] = SUBWAY_ART.door_asset_stairs;
  const door = {
    id: 'door_subway_stairs',
    x: STATION_X.stairs - l,
    y: STATION_FLOOR + 12 - t,
    w: sw,
    h: sh,
    sprite: 'door_asset_stairs',
    src: `${SUBWAY_ART_BASE}${SUBWAY_ART.door_asset_stairs[0]}`,
    key_id: 0,
    requires_level: 0,
    is_locked: false,
    hidden: false,
    connect: {
      tsid: station.connects_to,
      label: station.surfaceLabel,
      street: station.surfaceStreetTsid,
      hub_id: station.surfaceHubId,
      ...(surfaceDoor ? { arrive: { x: surfaceDoor.x, y: surfaceDoor.y } } : {}),
    },
  };
  return {
    source: `reconstruction: ${station.label} (${station.tsid}, not in tinyspeck/glitch-locations); one station layout from footage with subway1.swf art`,
    reconstructed: true,
    tsid: station.streetTsid,
    label: station.label,
    hubId: station.hubId,
    hubName: station.hubName,
    swf_file: 'subway1.swf',
    musicFile: STATION_MUSIC,
    ownLight: true,
    bounds: { ...STATION_BOUNDS },
    platforms,
    layers: [{ id: 'middleground', name: 'middleground', z: 0, w: r - l, h: b - t, decos: stationDecos() }],
    signposts: [],
    doors: [door],
    stats: { platformCount: platforms.length, layerCount: 1, decoCount: stationDecos().length, signpostCount: 0, doorCount: 1, ladderCount: 0, barrierCount: 0 },
    gradient: { top: '3A3B36', bottom: '55564F' },
    ladders: [],
    subway: { station: station.id },
    why: { ...why, layout: 'Stairs, wall crack and pipe, the station sign, a column, the Subway Map post, the step-off spot (x 0, y -136 as in transit_disembark_callback), the train nose with the ticket post and gate block.' },
  };
}

/** The train car's street JSON (no doors: you leave at a stop, as in the source prompt). */
export function carStreet() {
  const { l, r, t, b } = CAR_BOUNDS;
  const platforms = [
    { id: 'plat_subway_car', x1: l, y1: CAR_FLOOR, x2: r, y2: CAR_FLOOR, pc_perm: -1 },
    ...carBenches(),
  ];
  return {
    source: `reconstruction: ${CAR_LABEL} (${SUBWAY_LINE.template_tsid}, not in tinyspeck/glitch-locations); from footage with subway1.swf art`,
    reconstructed: true,
    tsid: CAR_TSID,
    label: CAR_LABEL,
    hubId: SUBWAY_LINE.car.hubId,
    hubName: SUBWAY_LINE.car.hubName,
    swf_file: 'subway1.swf',
    musicFile: CAR_MUSIC,
    ownLight: true,
    bounds: { ...CAR_BOUNDS },
    platforms,
    layers: [
      { id: 'middleground', name: 'middleground', z: 0, w: r - l, h: b - t, decos: [] },
      { id: 'T_subway_car_front', name: 'middleplus', z: 1, w: r - l, h: b - t, decos: carFrontDecos() },
    ],
    signposts: [],
    doors: [],
    stats: { platformCount: platforms.length, layerCount: 2, decoCount: carFrontDecos().length, signpostCount: 0, doorCount: 0, ladderCount: 0, barrierCount: 0 },
    gradient: { top: '2E2F2A', bottom: '45463F' },
    ladders: [],
    subway: { car: true },
    why: { ...why, layout: 'The car wall with three benches per 1200 px, windows where the source overlays sit, ads over them, poles at the seams; riders arrive at x 0 + rand(-300, 400), y -59 (transit_enter_instance).' },
  };
}

export function subwayIndexEntry(street) {
  return {
    label: street.label,
    file: `assets/streets/${street.tsid}.json`,
    hubId: street.hubId,
    hubName: street.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}

/** Screen-space arrival on a station from its surface door (the door's connect x, on the floor). */
export function stationArrival(connectX) {
  const { l, r, t } = STATION_BOUNDS;
  const x = Math.max(l + 120, Math.min(r - 120, Number(connectX) || STATION_X.stairs + 90));
  return { x: Math.round(x - l), y: STATION_FLOOR - t };
}

/** Screen-space spots inside the station and the car. */
export const stationScreen = (x, y = STATION_FLOOR) => ({ x: x - STATION_BOUNDS.l, y: y - STATION_BOUNDS.t });
export const carScreen = (x, y = CAR_FLOOR) => ({ x: x - CAR_BOUNDS.l, y: y - CAR_BOUNDS.t });

/** transit_enter_instance: x 0 + randInt(-300, 400), y -59. */
export function boardingSpot(rng = Math.random) {
  const x = SUBWAY_LINE.car.x + Math.floor(-300 + rng() * 701);
  return carScreen(x, CAR_FLOOR);
}

/** transit_disembark_callback: the station's x, y (0, -136). */
export const disembarkSpot = (station) => stationScreen(station.x, station.y);
