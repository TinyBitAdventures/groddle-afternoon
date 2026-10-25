/**
 * The Hell Bar (LA5FPUNAI7P2NVF), Naraka's one room, rebuilt: pure data, the
 * street builder and Hell's Bartender's rules (no Pixi, no DOM).
 *
 * What survives in source (tinyspeck/glitch-GameServerJS, CC0):
 * - quests/hell_quest.js ("Beelzebooze") names it as location `hell_bar`
 *   (prod LA5FPUNAI7P2NVF) and sends the player there: "Enter the Hell Bar in
 *   Panka Surazu, Naraka, exchange your Diabolical Drink Ticket for Wine of the
 *   Dead and drink to your good hellth". inc_data_maps_prod.js lists it in hub
 *   40 (Naraka). No location XML for it is in the public dump.
 * - Panka Surazu (streets/mnt/stos/location_data/GA5RPAFK9OE28GN.xml,
 *   door_1330398275523): the door_asset_hell_bar_entrance_01a door, unlocked,
 *   no level, whose connect lands at 240,-77 in the Hell Bar (hub 40) and
 *   names the bar's location SWFs: kukubee, groddle1, firebog. Panka Surazu's
 *   geometry `sources` list LA5FPUNAI7P2NVF, the link back.
 * - items/hell_bartender.js: Hell's Bartender, the bar's NPC. Verbs talk_to
 *   ("Chat up the Hell Bartender") and buy_wine ("Exchange a Diabolical Drink
 *   Ticket for Wine of the Dead"); a 300 x 200 hit box whose first collision per
 *   visit runs a conversation (onPlayerCollision); chit-chat every 30 s while you
 *   are in the bar (chitChat); idle1/idle2 and talk_left/talk_right/
 *   talk_right_out states (speakTo, stopTalking, switchIdle).
 * - items/drink_ticket.js: the ticket's own "buy wine" pack verb proxies to a
 *   bartender within 200 px. items/wine_of_the_dead.js: "Wine of the Dead can be
 *   obtained in Hell Bar, for a Diabolical Drink Ticket"; its drink verb is in
 *   js/hell.js (drinkWineOfTheDead) and features/hell-feature.js.
 *
 * Read off reference (nothing ships from them): video shQ_KY3Pwxo (Maud Gonne,
 * "Glitch Hell Bar", 2012-12-06; frames in research/video/frames-shQ_KY3Pwxo/)
 * and the Hell Bar Snaps (research/wayback/raw/snaps/hell_quest/, Kaepora
 * 2012-06-27, BubblegumEpitaph 2012-10-10, WarmAndFuzzy 2012-11-18). The bar
 * is one room a screen and a half wide: a dark arched way out at the left end,
 * a wall of rounded stones, the "L'enfer, c'est les autres" sign, a hanging
 * lantern, a long plank counter with a skull-and-bones decal on its front,
 * stools before it, two long shelves of Wine of the Dead bottles with curled
 * bones at their ends, the Bartender behind the counter in his flames, and the
 * right end lost in the dark with a white splash on the wall. The video shows
 * "Entering Hell Bar" on the loading card, the Buy wine / Talk to menu, the
 * first-purchase conversation and "You bought wine from Hell's Bartender."
 * Scale: the video's game view is ~710 px for the 960 px view (1.35 world px per
 * video px); the avatar arrives at x 240 near the left end, so the room runs
 * from x 0 to ~1460 (the camera stops with the dark right wall in view).
 *
 * Art: tools/room-art set `hell_bar` (HELL_BAR_FILES, CC0 kukubee/groddle1/
 * firebog decos, colours sampled off the video baked in by luminance ramps), the
 * hanging lantern and the way-out arch from the street deco set, the Bartender
 * from the OGA hell_bartender sheets (js/hell.js HELL_SPRITES).
 * tools/build-hell-bar.mjs writes the street JSON, its index row and Panka
 * Surazu's door target; features/hell-bar-feature.js draws and runs it.
 */

import { HELL_BAR, HELL_BARTENDER } from './hell.js';
import { HELL_BAR_FILES } from './hell-bar-art.js';

export const HELL_BAR_TSID = 'GA5FPUNAI7P2NVF';
export const HELL_BAR_SOURCE_TSID = HELL_BAR.sourceTsid;
export const HELL_BAR_LABEL = 'Hell Bar';
export const HELL_BAR_HUB = Object.freeze({ hubId: '40', hubName: 'Naraka' });
export const PANKA_TSID = HELL_BAR.entranceStreetTsid;
export const PANKA_SOURCE_TSID = HELL_BAR.entranceStreetSourceTsid;
export const PANKA_DOOR = 'door_1330398275523';
/** Panka Surazu's door connect x/y: world, in the Hell Bar. */
export const HELL_BAR_ARRIVE = Object.freeze({ x: 240, y: -77 });
export const HELL_BAR_SOURCE =
  'reconstruction: Hell Bar (LA5FPUNAI7P2NVF, not in tinyspeck/glitch-locations); layout from video shQ_KY3Pwxo and three 2012 Snaps, art CC0 kukubee/groddle1/firebog decos';
export const HELL_BAR_ART_ROOT = 'assets/sprites/hell/bar/';
const DECO_ROOT = 'assets/decos/groddle/';

/** True for the bar under either TSID prefix (G as built, L as GSJS names it). */
export const isHellBarTsid = (tsid) => String(tsid || '').slice(1) === HELL_BAR_TSID.slice(1);

/** The floor's walk line: Panka's door lands at 240,-77. */
export const FLOOR_Y = HELL_BAR_ARRIVE.y;
const L = 0;
const R = 1460;
/**
 * The room's top is lost in the dark; its bottom is 77 px under the floor, as Panka's door arrival
 * (240,-77) suggests for a b = 0 location like the Naraka streets (movement.js keeps the feet clear of
 * the pack). The remake's camera shows less over the feet than the Flash client did, so the lantern
 * hangs a little lower than in the video to stay in view.
 */
const T = -560;
const B = 0;
export const HELL_BAR_BOUNDS = Object.freeze({ l: L, r: R, t: T, b: B });

/** Hell's Bartender: behind the counter's middle (video t115-t135: x ~980), drawn at the sheets' x1 size. */
export const BARTENDER = Object.freeze({
  x: 975,
  /** Feet of the 244 x 197 frame: his arms rest on the counter top. */
  y: FLOOR_Y - 70,
  w: 244,
  h: 197,
  /** items/hell_bartender.js onCreate: apiSetHitBox(300, -200). */
  hitW: 300,
  hitH: 200,
  /** items/drink_ticket.js buy_wine: findCloseStack('hell_bartender', 200). */
  ticketRange: 200,
  /** chitChat: apiSetTimerX('chitChat', 30*1000). */
  chitChatMs: HELL_BARTENDER.chitChatMs,
  fps: 30,
});

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const COUNTER = Object.freeze({ x: 975, w: 900, h: 112, bottom: FLOOR_Y + 4 });
/** The counter piece's top surface sits 18 px under its top edge (render rows 25-45 of 224). */
export const COUNTER_TOP_Y = COUNTER.bottom - COUNTER.h + 18;
/** Two shelves, plank tops ~290 and ~190 world px over the floor (video t115 rows 100 and 175). */
export const SHELF_TOPS = Object.freeze([FLOOR_Y - 292, FLOOR_Y - 192]);
const SHELF_XS = Object.freeze([800, 1110]);
/** The plank's top face is the piece's top 4 px; its bracket knobs hang under it. */
const SHELF_TOP_INSET = 4;
/** Stools (video t115-t135: x ~635, ~797, ~1175): legs past the walk line, as the counter's perspective draws them. */
export const STOOLS = Object.freeze([635, 797, 1175]);
const STOOL_BOTTOM = FLOOR_Y + 40;
/** The stool seat (Snap PUVT5APCRO73HA2, video t140: the avatar stands on one). */
export const STOOL_SEAT_Y = STOOL_BOTTOM - 74;

/** The hanging lantern (firebog jethimadh_int_lantern_1, its glow drawn in): between the sign and the shelves. */
const LANTERN = Object.freeze({ sprite: 'jethimadh_int_lantern_1', x: 594, y: FLOOR_Y + 50, w: 318, h: 480 });

/** A deterministic 0..1 from an integer (the builder's --check must be stable). */
const rnd = (n) => {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h % 10000) / 10000;
};

const piece = (name, x, y, z, extra = {}) => {
  const [file, w, h] = HELL_BAR_FILES[name];
  return { name, src: `${HELL_BAR_ART_ROOT}${file}`, x: Math.round(x), y: Math.round(y), w: Math.round(extra.w ?? w), h: Math.round(extra.h ?? h), z, r: extra.r || 0, ...(extra.flip ? { flip: true } : {}), ...(extra.why ? { why: extra.why } : {}) };
};
const deco = (sprite, x, y, w, h, z, why) => ({ name: sprite, src: `${DECO_ROOT}${sprite}.png`, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, why });
const fill = (fillColour, x1, x2, y1, y2, z, alpha = 1) => ({ name: 'fill', fill: fillColour, x1: Math.round(x1), x2: Math.round(x2), y1: Math.round(y1), y2: Math.round(y2), z, ...(alpha < 1 ? { alpha } : {}) });

/** The stone wall: the dark mortar behind, then groddle1 heights_face_rock clusters packed over it. */
function wallArt() {
  const out = [fill(0x1a0a03, L - 40, R + 40, T - 40, B + 40, -100)];
  const names = ['wall_rock_2', 'wall_rock_3', 'wall_rock_1'];
  let k = 0;
  for (let y = T + 60; y < FLOOR_Y + 20; y += 78) {
    const row = Math.round((y - T) / 78);
    for (let x = L - 160 + (row % 2) * 170 + Math.round(rnd(row + 3) * 80); x < R + 200; x += 300) {
      const name = names[k % 3];
      out.push(piece(name, x + Math.round((rnd(k + 17) - 0.5) * 60), y + Math.round(rnd(k + 41) * 24), -96 + (k % 4), { flip: k % 2 === 1 }));
      k += 1;
    }
  }
  return out;
}

/** The left and right ends fall into the dark (Snaps and video: black past the way out and the shelves). */
function shadowArt() {
  const out = [];
  for (const [x1, x2, a] of [[L - 40, 50, 0.9], [50, 110, 0.6], [110, 170, 0.3]]) out.push(fill(0x050100, x1, x2, T - 40, B + 40, -62, a));
  for (const [x1, x2, a] of [[1290, 1340, 0.35], [1340, 1385, 0.65], [1385, R + 40, 0.92]]) out.push(fill(0x020000, x1, x2, T - 40, B + 40, -62, a));
  // The ceiling: the top of the room is lost in the dark, as above the shelves and sign in the Snaps.
  out.push(fill(0x050100, L - 40, R + 40, T - 40, FLOOR_Y - 430, -61, 0.7));
  return out;
}

/** Two shelves, each two shelf_long planks end to end, curled bones at the ends, bottles on the tops. */
const BOTTLES = Object.freeze([
  // [shelf, x, piece] read off video t115 / t135: clusters at both ends, the middle bare behind the flames.
  [0, 690, 'wine_of_the_dead_01c_k1'], [0, 728, 'wine_of_the_dead_01a_k1'], [0, 775, 'wine_of_the_dead_01b_k1'],
  [0, 1095, 'wine_of_the_dead_01a_k1'], [0, 1150, 'wine_of_the_dead_01b_k1'], [0, 1192, 'wine_of_the_dead_01a_k1'],
  [1, 700, 'wine_of_the_dead_01a_k1'], [1, 735, 'wine_of_the_dead_01b_k1'], [1, 1080, 'wine_of_the_dead_01c_k1'],
  [1, 1125, 'wine_of_the_dead_01a_k1'], [1, 1168, 'wine_of_the_dead_01b_k1'], [1, 1200, 'wine_of_the_dead_01a_k1'],
]);
function shelfArt() {
  const out = [];
  const [, , shelfH] = HELL_BAR_FILES.shelf_long;
  SHELF_TOPS.forEach((top, si) => {
    SHELF_XS.forEach((x, i) => out.push(piece('shelf_long', x, top - SHELF_TOP_INSET + shelfH, -80, { flip: i === 1 })));
    const left = SHELF_XS[0] - HELL_BAR_FILES.shelf_long[1] / 2;
    const right = SHELF_XS[1] + HELL_BAR_FILES.shelf_long[1] / 2;
    // The bone lies along the plank (rotated a quarter turn), its curl over the end.
    const bw = HELL_BAR_FILES.shelf_bone[1];
    // A quarter turn about the bottom-centre anchor lays the bone beside the anchor, centred on its y.
    out.push(piece('shelf_bone', left + 2, top - bw / 2 + 3, -78, { r: 90 }));
    out.push(piece('shelf_bone', right - 2, top - bw / 2 + 3, -78, { r: -90, flip: true }));
  });
  for (const [si, x, name] of BOTTLES) out.push(piece(name, x, SHELF_TOPS[si] + 2, -77));
  return out;
}

/** Every art row, back to front (world space, bottom-centre anchors, z below the avatar's 0). */
export function hellBarArt() {
  const counterWhy = 'groddle1 bureaucratic_hall_counter_1: a long plank counter with a raised block at its left end, as in every Snap.';
  const art = [
    ...wallArt(),
    piece('hell_bar_sign_01a', 392, FLOOR_Y - 130, -70, { why: "kukubee hell_bar_sign_01a: \"L'enfer, c'est les autres\" left of the counter (video t35, Snap PUVT5APCRO73HA2)." }),
    deco(LANTERN.sprite, LANTERN.x, LANTERN.y, LANTERN.w, LANTERN.h, -69, 'The lantern hanging between the sign and the shelves (video t35, t145).'),
    piece('splash_white', 1412, FLOOR_Y - 60, -60, { w: 66, h: 78, why: 'The white splash low on the dark right wall, past the counter (video t115, t135).' }),
    ...shelfArt(),
    piece('hell_bar_bartender_flames_01a', BARTENDER.x - 4, FLOOR_Y - 64, -58, { why: "kukubee hell_bar_bartender_flames_01a: the fire behind the Bartender (Snap PUVPMQJQBD73BMJ)." }),
    ...shadowArt(),
    // The floor in front of the counter: dark boards fading to black (video t35 rows 330-370).
    fill(0x140b05, L - 40, R + 40, FLOOR_Y - 6, B + 40, -57.5),
    deco('room_background3a_floor', (L + R) / 2, FLOOR_Y + 236, R - L + 120, 240, -57, 'firebog room_background3a_floor: the dark plank floor.'),
    fill(0x070300, L - 40, R + 40, FLOOR_Y + 70, B + 40, -56, 0.75),
    piece('counter', COUNTER.x, COUNTER.bottom, -52, { w: COUNTER.w, h: COUNTER.h, why: counterWhy }),
    piece('skull_decal', 940, FLOOR_Y - 8, -51, { why: "kukubee k01_fossil_01 (a skull and its bones on felt) in the decal's orange: the counter front's emblem (Snaps, video t115)." }),
    ...STOOLS.map((x) => piece('stool', x, STOOL_BOTTOM, -50, { why: 'firebog chair, the round three-legged stool before the counter (Snaps, video).' })),
  ];
  return art;
}

/* ------------------------------------------------------------------ */
/* Street                                                              */
/* ------------------------------------------------------------------ */

/** The way out: the dark arch at the left end (video t145: the hover glow outlines it). */
export const EXIT_DOOR = Object.freeze({ id: 'door_hb_exit', x: 125, w: 180, h: 225, sprite: 'cave_hole_back' });

function platforms() {
  return [
    { id: 'plat_hb_floor', x1: L + 20, y1: FLOOR_Y, x2: R - 20, y2: FLOOR_Y, pc_perm: -1 },
    ...STOOLS.map((x, i) => ({ id: `plat_hb_stool_${i + 1}`, x1: x - 38, y1: STOOL_SEAT_Y, x2: x + 38, y2: STOOL_SEAT_Y, pc_perm: -1 })),
  ];
}

/**
 * The street JSON. `pankaArrive` (Panka screen space) and `pankaXY` (Panka
 * world) are the way out's landing in front of Panka's door, filled in by the builder.
 */
export function hellBarStreet({ pankaArrive = null, pankaXY = null } = {}) {
  const plats = platforms();
  const doors = [{
    id: EXIT_DOOR.id,
    x: EXIT_DOOR.x - L,
    y: FLOOR_Y - T,
    w: EXIT_DOOR.w,
    h: EXIT_DOOR.h,
    sprite: EXIT_DOOR.sprite,
    key_id: 0,
    requires_level: 0,
    is_locked: false,
    hidden: false,
    connect: {
      tsid: PANKA_SOURCE_TSID,
      label: HELL_BAR.entranceStreetLabel,
      street: PANKA_TSID,
      ...(pankaXY ? { x: pankaXY.x, y: pankaXY.y } : {}),
      hub_id: HELL_BAR_HUB.hubId,
      ...(pankaArrive ? { arrive: { ...pankaArrive } } : {}),
    },
  }];
  const barriers = [
    { id: 'wall_hb_left', x: L + 20, y: T, h: B - T, pc_perm: null },
    { id: 'wall_hb_right', x: R - 20, y: T, h: B - T, pc_perm: null },
  ];
  // The street renderer wants a deco: the lantern (street deco set). features/hell-bar-feature.js draws
  // the whole room over it on the entity layer, the lantern included (hellBarArt), as Room 4 does.
  const lantern = { sprite: LANTERN.sprite, x: LANTERN.x, y: LANTERN.y, w: LANTERN.w, h: LANTERN.h, z: 1, r: 0 };
  const layers = [{ id: 'middleground', name: 'middleground', z: 0, w: R - L, h: B - T, decos: [lantern] }];
  return {
    source: HELL_BAR_SOURCE,
    reconstructed: true,
    tsid: HELL_BAR_TSID,
    label: HELL_BAR_LABEL,
    hubId: HELL_BAR_HUB.hubId,
    hubName: HELL_BAR_HUB.hubName,
    swf_file: 'kukubee.swf,groddle1.swf,firebog.swf',
    bounds: { ...HELL_BAR_BOUNDS },
    platforms: plats,
    layers,
    signposts: [],
    doors,
    barriers,
    stats: { platformCount: plats.length, layerCount: 1, decoCount: 1, signpostCount: 0, doorCount: doors.length, ladderCount: 0, barrierCount: barriers.length },
    // The room is drawn by features/hell-bar-feature.js (hellBarArt); the sky only shows if it fails.
    gradient: { top: '1A0A03', bottom: '070300' },
    // A room indoors: no world tint over the bar's own dark light.
    ownLight: true,
    why: {
      street: 'quests/hell_quest.js locations.hell_bar (prod LA5FPUNAI7P2NVF); inc_data_maps_prod.js hub 40 "Hell Bar"; no location XML.',
      arrival: "Panka Surazu door_1330398275523 connect 240,-77 (hub 40; swf kukubee, groddle1, firebog).",
      bounds: 'Video shQ_KY3Pwxo: one room ~1.5 views wide; the avatar arrives near the left end; the camera stops with the dark right wall in view.',
      wayOut: "The dark arch at the left end (video t145). Leads to Panka Surazu in front of its door: Panka's geometry sources list the bar.",
      platforms: 'The floor; the stool seats (the avatar stands on one in Snap PUVT5APCRO73HA2 and video t140).',
      notBuilt: 'Music: the bar\'s music_file is in its lost location XML (Panka\'s is empty); the room plays Naraka\'s. The small dark figure on the counter\'s left block in the Snaps is not identified.',
    },
  };
}

/** The index.json row. */
export function hellBarIndexEntry(street = hellBarStreet()) {
  return {
    label: HELL_BAR_LABEL,
    file: `assets/streets/${HELL_BAR_TSID}.json`,
    hubId: HELL_BAR_HUB.hubId,
    hubName: HELL_BAR_HUB.hubName,
    platforms: street.platforms.length,
    decos: 1,
    reconstructed: true,
  };
}

/* ------------------------------------------------------------------ */
/* Hell's Bartender (items/hell_bartender.js)                          */
/* ------------------------------------------------------------------ */

export const BARTENDER_TEXT = Object.freeze({
  label: HELL_BARTENDER.label,
  /** The Info card under the name (video t45: "Exchange a Diabolical Drink Ticket for Wine of the Dead"). */
  subtitle: 'Exchange a Diabolical Drink Ticket for Wine of the Dead',
  talkTooltip: 'Chat up the Hell Bartender',
  buyTooltip: 'Exchange a Diabolical Drink Ticket for Wine of the Dead',
  /** buy_wine conditions(). */
  needTicketReason: 'You need a Diabolical Drink Ticket to buy Wine of the Dead.',
  /** buy_wine handler / grantWine: no ticket. */
  needTicket: HELL_BARTENDER.needTicket,
  bought: "You bought wine from Hell's Bartender.",
  tried: "You tried to buy wine from Hell's Bartender.",
  /** items/drink_ticket.js buy_wine: no bartender within 200 px. */
  noOne: 'There is no one here to buy wine from!',
  ticketTooltip: 'Buy Wine of the Dead',
  firstWine: HELL_BARTENDER.firstWine,
  packFull: HELL_BARTENDER.packFull,
});

/** talk_to lines added by hell_quest status and pack (items/hell_bartender.js 178-258). */
export const TALK_EXTRA = Object.freeze({
  todoWine: Object.freeze(['Your wine of the dead is getting cold, roughneck.']),
  todoTicket: Object.freeze(['If ya got a Diabolical Drink Ticket I can get you a drink.']),
  done: Object.freeze([
    'Good to see you again, rabble rouser.',
    'You look buffer than last time, captain. Musta been that Wine of the Dead!',
    'Last time you were here we were just as busy as now.',
    "You don't look too bad for someone who drank Wine of the Dead.",
    "Down here again? You're forming a dangerous habit, kid.",
    'You here for another bottle of Wine of the Dead? Incorrigible!',
  ]),
  doneTicket: Object.freeze(['You here to exchange that Diabolical Drink Ticket for another Wine of the Dead?']),
  doneNoTicket: Object.freeze(["Another Wine of the Dead? You'll need another Diabolical Drink Ticket, buster."]),
  doneWine: Object.freeze(["You still haven't drank that Wine of the Dead. Too stiff for ya? Heh heh heh.", 'Your Wine of the Dead is getting cold.']),
});

/**
 * talk_to's line pool, exactly as the source builds it: each branch replaces
 * the pool (general + its extra), so the last matching branch wins
 * (todo: ticket over wine; done: wine over ticket/no ticket over the done set).
 */
export function bartenderTalkOptions({ questStatus = 'none', hasWine = false, hasTicket = false } = {}) {
  const general = [...HELL_BARTENDER.talkGeneral];
  let options = null;
  if (questStatus === 'todo') {
    if (hasWine) options = general.concat(TALK_EXTRA.todoWine);
    if (hasTicket) options = general.concat(TALK_EXTRA.todoTicket);
  } else if (questStatus === 'done') {
    options = general.concat(TALK_EXTRA.done);
    options = general.concat(hasTicket ? TALK_EXTRA.doneTicket : TALK_EXTRA.doneNoTicket);
    if (hasWine) options = general.concat(TALK_EXTRA.doneWine);
  }
  return options || general;
}

/** choose_one, never the same line twice running when there is a choice (talk_to's last_talk retry). */
export function pickBartenderLine(options, last = '', rng = Math.random) {
  const pool = options.length > 1 ? options.filter((t) => t !== last) : options;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** buy_wine conditions(). */
export function buyWineConditions({ hasTicket = false } = {}) {
  return hasTicket ? { state: 'enabled', reason: '' } : { state: 'disabled', reason: BARTENDER_TEXT.needTicketReason };
}

/**
 * buy_wine handler: with a ticket, the first-purchase conversation runs unless
 * hell_quest is in progress with its buy_wotd flag set (quests_get_flag is 0 for
 * a quest not in the todo list, so outside the quest it runs every time), then grantWine.
 */
export function buyWinePlan({ hasTicket = false, questStatus = 'none', buyFlag = false } = {}) {
  if (!hasTicket) return { ok: false, conversation: null, activity: [BARTENDER_TEXT.needTicket, BARTENDER_TEXT.tried] };
  const flagged = questStatus === 'todo' && buyFlag;
  return { ok: true, conversation: flagged ? null : 'quest_buy_wine', activity: [] };
}

/**
 * grantWine: one ticket for one Wine of the Dead. A full pack gives the ticket
 * back. The first wine bought while hell_quest is in progress sets buy_wotd
 * with the "Not this time!" line; any other purchase gets a wineResponse line.
 */
export function grantWine({ hasTicket = false, packFull = false, questStatus = 'none', buyFlag = false, rng = Math.random } = {}) {
  if (!hasTicket) return { ok: false, effects: [], bubble: null, activity: [BARTENDER_TEXT.needTicket, BARTENDER_TEXT.tried] };
  if (packFull) return { ok: false, effects: [], bubble: BARTENDER_TEXT.packFull, activity: [BARTENDER_TEXT.tried] };
  const effects = [
    { type: 'consume_item', classTsid: 'drink_ticket', count: 1 },
    { type: 'grant_item', classTsid: 'wine_of_the_dead', count: 1 },
  ];
  let bubble;
  if (questStatus === 'todo' && !buyFlag) {
    effects.push({ type: 'quest_flag', flag: 'buy_wotd' });
    bubble = BARTENDER_TEXT.firstWine;
  } else {
    bubble = pickBartenderLine(HELL_BARTENDER.wineResponses, '', rng);
  }
  return { ok: true, effects, bubble, activity: [BARTENDER_TEXT.bought] };
}

/**
 * onPlayerCollision: the first touch of the hit box per visit (the bar is an
 * instance, so it always runs). Never done the quest: the "before your time"
 * conversation (with or without a ticket); on the quest without buy_wotd: buy
 * (with a ticket) or the "missing something" conversation. Otherwise nothing.
 */
export function collisionConversation({ questStatus = 'none', hasTicket = false, buyFlag = false } = {}) {
  if (questStatus === 'none') return hasTicket ? 'no_quest_yes_ticket' : 'no_quest_no_ticket';
  if (questStatus === 'todo' && !buyFlag) return hasTicket ? 'buy' : 'yes_quest_no_ticket';
  return null;
}

/** speakTo: talk_left when the player stands left of him, else talk_right. */
export const talkStateFor = (playerX, bartenderX) => (playerX < bartenderX ? 'talkLeft' : 'talkRight');

/** Inside the 300 x 200 hit box (centred on his x, rising from his feet). */
export function inBartenderHitBox(px, py, b = BARTENDER) {
  return Math.abs(px - b.x) <= b.hitW / 2 && py <= FLOOR_Y + 20 && py >= b.y - b.hitH;
}
