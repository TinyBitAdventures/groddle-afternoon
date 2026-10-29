/**
 * We're Off to See the Lizard (quests/fuelmaking_refuel_robot.js): The Back
 * Alley, then any Subway Station.
 *
 * Source:
 *  - The Fuelmaking skill offers it (inc_data_skills.js fuelmaking_1
 *    quest_id). onStarted sets pc.back_alley_business = 'fuelmaking' and,
 *    0.1 s later, instances_create_delayed copies The Back Alley
 *    (LIF177DTS6T1KFG, the Legalize It forest) at 715, -73 with
 *    exit_delay 3 * 60.
 *  - locations/location.js: walking into the `back_alley_entered` box makes
 *    the closest npc_bureaucrat run propositionPlayer: four "sss" beats and
 *    an OK. npc_bureaucrat.js on OK (or cancel): quests_set_flag
 *    talk_to_bureaucrat, buildPath to the closest subway station
 *    ("I'll mark the closest station on your map"), instances_exit.
 *    onExitLocation fails the quest when the flag was never set.
 *  - fuelmaker.js onMakingComplete: made_fuel_cell.
 *  - locations/inc_transit.js transit_enter_station: while the quest is
 *    started, every station entry creates a private npc_maintenance_bot at
 *    198, -140. items/npc_maintenance_bot.js: a 200 x 100 hit box runs the
 *    "collide" conversation once ("Fmmrm shrmmrm…") and the familiar's
 *    "fuel cell" hint; "dance with" plays hit1/hit2 five times then a
 *    familiar line (once); "refuel" takes one Fuel Cell, puffs smoke 140 px
 *    above the bot, runs "revive_done", then leave(0) sets refuel_bot and the
 *    bot rolls off at 300 px/s via 46,-349 and -850,-349.
 *  - Rewards (familiar turn-in): 1000 xp, 600 currants, 100 mood, 100 Alph
 *    favor.
 *
 * The alley is this room, drawn from the one Back Alley set
 * (back-alley-set.js, shared with Legalize It). The stations are the real
 * ones: the twelve surface subway doors open the subway feature's stations
 * (js/subway.js, Tiny Speck's subway1.swf art), and on any of them the world
 * hooks below put the private bot at the source's x 198 once the Bureaucrat
 * has spoken and until it is refuelled. The bot's climb to y -349 has no
 * stairs on the rebuilt platform, so it rolls the same 300 px/s along it and
 * out of sight. The closest station's street is named in the activity feed,
 * and the Map gets the route to it (map-routes feature, G177).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&questdemo=fuelmaking_refuel_robot
 *   (&questautoplay=1 walks into the box and answers the Bureaucrat).
 *   &backalleyautoplay=1 then takes the subway door to the closest station
 *   and refuels the bot through to the turn-in (=collide stops after the
 *   bump, =refuel after the revive); &backalleycell=1 puts a Fuel Cell in the
 *   pack and &backalleymade=1 stands in for a Fuelmaker run.
 */

import { onLoaded, textureFromUrl } from '../textures.js';
import { displayTopOf, itemstackOverlayPoint, playSheetOverlay } from '../overlay-art.js?v=g448-2';
import { STATION_FLOOR, stationArrival, stationByTsid, stationScreen, surfaceStation } from '../subway.js?v=play-1';
import { ALLEY, ALLEY_ART, ALLEY_SET, SHADY, alleyPlatforms, drawAlley, inEnteredBox } from './back-alley-set.js?v=g450-1';

export { ALLEY, ALLEY_ART, ALLEY_SET, alleyPlatforms };

export const QUEST = 'fuelmaking_refuel_robot';
export const ROOM_ID = 'back_alley';
const ART = 'assets/sprites/quest-rooms/back_alley/';
const BOT_ART = 'assets/sprites/quest-rooms/le_miserable/';
const LEGALIZE = 'assets/sprites/quests/legalize/';

/** source: onStarted exit_delay 3*60. */
export const ALLEY_MS = 3 * 60 * 1000;
/** source: instances_create_delayed x/y (template coordinates, geometry lost). */
export const ALLEY_SPAWN_SOURCE = Object.freeze({ x: 715, y: -73 });
/** source: inc_transit.js createAndReturnItem('npc_maintenance_bot', 1, 198, -140). */
export const BOT_SOURCE = Object.freeze({ x: 198, y: -140 });
/** source: npc_maintenance_bot onCreate apiSetHitBox(200, 100). */
export const BOT_HITBOX = Object.freeze({ w: 200, h: 100 });
/** source: leave() apiMoveToXY(46,-349, 300) then (-850,-349, 300). */
export const BOT_SPEED = 300;
export const BOT_EXIT_PATH = Object.freeze([{ x: 46, y: -349 }, { x: -850, y: -349 }]);
/** source: revive() smoke_puff overlay delta_y 140. */
export const PUFF_DY = 140;
/** source: playerDance timers: hit1/hit2 1 s each, 500 ms apart, familiar after 1 s more. */
export const DANCE_STEPS = Object.freeze([
  { hit: 'hit1', at: 0 }, { hit: 'hit2', at: 500 }, { hit: 'hit1', at: 1000 },
  { hit: 'hit2', at: 1500 }, { hit: 'hit1', at: 2000 },
]);
export const DANCE_FAMILIAR_AT = 3000;

const SSS = 'Shady Bureaucrat';
/** npc_bureaucrat.js propositionPlayer, back_alley_business 'fuelmaking'. */
export const PROPOSITION = Object.freeze([
  { text: 'Here’sss the deal. We try to run an orderly operation, but sometimes it takes sssomething a little extra to keep the wheels of the Bureaucracy turning, if you catch my drift.', response: 'I’m listening.' },
  { text: 'Sssee, I need a little extra work done, but just the requisition for the requisition must be filled out in hendecuplicate, and even then there’s little guarantee as to when it will be processsed. It’s mostly a matter of tradition, you understand.', response: 'What is it you need, exactly?' },
  { text: 'I need a little assistance keeping the trainsss running smoothly. But as my predecessor on this project, Yusuf Cay, wandered into a ssstorm of paperwork and was never seen or heard from again, we’ll be handling this in an unofficial manner.', response: 'What do I do?' },
  { text: 'Sssimply make a Fuel Cell with a Fuelmaker and then go to a Subway Station and all will become clear. I\'ll mark the closest station on your map. I promise you’ll be well rewarded for your effortsss.', response: 'Gotcha.' },
]);
/** npc_maintenance_bot.js conversation "collide". */
export const COLLIDE = Object.freeze([
  { text: 'Fmmrm shrmmrm…', response: 'What?' },
  { text: 'FMMRM SHRMMRM!', response: 'I don’t understand.' },
]);
export const FUEL_HINT = 'I think he\'s saying "fuel cell!" Either that or "formal swing," which I believe is a kind of dance.';
/** npc_maintenance_bot.js conversation "revive_done". */
export const REVIVE = Object.freeze([
  { text: 'Oh!', response: 'Did that hurt?' },
  { text: 'No, it feels wonderful. I’ve been stuck like that for ages.', response: 'What happened?' },
  { text: 'I was in the middle of a routine subway maintenance—refilling air defresheners with our seasonal scent (Old Wino™), replacing the wads of chewed gum and moistening key surfaces with mysterious fluids—when I tragically ran out of fuel.', response: 'All better now?' },
  { text: 'Much, and the next time a commuter accidentally puts their hand into something damp and sticky, they’ll have you to thank.', response: 'Erm… good?' },
]);
export const DANCE_FAMILIAR = Object.freeze([
  { text: 'That was… what was that, anyway?', response: 'Sorry, I panicked.' },
  { text: "Well, it didn't seem to work. I hope you have some other ideas!", response: 'OK' },
]);
export const BOT_TEXT = Object.freeze({
  needCell: "You'll need a Fuel Cell for this!",
  noCells: "You don't have any fuel cells!",
  revived: "This robot doesn't need anymore help.",
  danced: "You can't solve all your problems with dancing. You're going to need to try another approach.",
});

/**
 * Streets whose imported doors lead to a subway station (build-street-
 * navigation doors with a "… Subway Station" connect label).
 */
export const SUBWAY_STREETS = Object.freeze([
  { street: 'GLI32G3NUTD100I', label: 'Gregarious Grange', hubId: '58', hub: 'Groddle Meadow', station: 'Gregarious Grange Subway Station', door: 'door_1300233269757' },
  { street: 'GLI3272LOTD1B1F', label: 'Groddle Forest Junction', hubId: '56', hub: 'Groddle Forest', station: 'GFJ Subway Station', door: 'door_1' },
  { street: 'GCR103T98QJ1SC9', label: 'Tallish Crest', hubId: '64', hub: 'Groddle Heights', station: 'Tallish Crest Subway Station', door: 'door_1305827233559' },
  { street: 'GCR241CP4Q129I1', label: 'Torpan Cleft', hubId: '76', hub: 'Alakol', station: 'Torpan Cleft Subway Station', door: 'door_1306226958802' },
  { street: 'GHV1L41MCD32O4A', label: 'Mallos Means', hubId: '75', hub: 'Bortola', station: 'Mallos Means Subway Station', door: 'door_1308288711866' },
  { street: 'GA51CGIGKK62NV8', label: 'Kongu Hop', hubId: '89', hub: 'Andra', station: 'Kongu Hop Subway Station', door: 'door_1313450653802' },
  { street: 'GHVE9CULH652BV2', label: 'Pitika Parse', hubId: '85', hub: 'Kajuu', station: 'Pitika Parse Subway Station', door: 'door_1309226286485' },
  { street: 'GIF10HE4JTU1S7P', label: 'Onto Parada', hubId: '71', hub: 'Jethimadh', station: 'Onto Parada Subway Station', door: 'door_1303607498850' },
  { street: 'GIF2IUQJQ571TFL', label: 'Eastern Approach', hubId: '51', hub: 'Uralia', station: 'Eastern Approach Subway Station', door: 'door_1306221529369' },
  { street: 'GIFI9G70SV72H3C', label: 'Thiruvan Thrive', hubId: '93', hub: 'Salatu', station: 'Thiruvan Thrive Subway Station', door: 'door_1313452707196' },
  { street: 'GLI57DI72HI153U', label: 'Somewhat Sump', hubId: '63', hub: 'Shimla Mirch', station: 'Somewhat Sump Subway Station', door: 'door_1' },
  { street: 'GTJ8GSQV1IV1FBE', label: 'Jutuan Central', hubId: '72', hub: 'Chakra Phool', station: 'Jutuan Central Subway Station', door: 'door_1303608131851' },
]);

/** The station a street door opens onto, or null. */
export function stationForDoor(door) {
  const label = String(door?.connect?.label || '');
  if (!/Subway Station$/.test(label)) return null;
  return { station: label, stationTsid: door.connect.tsid || '' };
}

/** "Closest" station: one in the same hub, else Gregarious Grange (the Legalize It line). */
export function nearestStation(hubId) {
  return SUBWAY_STREETS.find((s) => s.hubId === String(hubId || '')) || SUBWAY_STREETS[0];
}

/** Where the private bot stands on a station (screen space): the source x 198 on the platform floor. */
export function botSpot() {
  return stationScreen(BOT_SOURCE.x, STATION_FLOOR);
}

/** transit_enter_station: a bot waits on every station while the job is open (after the meeting, until it is refuelled). */
export function botWaits({ active = false, talked = false, refueled = false, station = false } = {}) {
  return Boolean(active && talked && !refueled && station);
}

/** npc_maintenance_bot verbs: refuel + dance with (conditions as in the source). */
export function botVerbs({ revived = false, danced = false, cells = 0 } = {}) {
  const refuel = revived
    ? { enabled: false, reason: BOT_TEXT.revived }
    : cells < 1
      ? { enabled: false, reason: BOT_TEXT.needCell }
      : { enabled: true, reason: '' };
  const out = [{ id: 'refuel', label: 'Refuel', ...refuel, tooltip: 'Refuel the Maintenance Bot' }];
  if (!revived) {
    out.push({
      id: 'dance',
      label: 'Dance with',
      enabled: !danced,
      reason: danced ? BOT_TEXT.danced : '',
      tooltip: 'Get down and/or funky',
    });
  }
  return out;
}

/** Inside the bot's 200 x 100 hit box (bottom-centre at the bot's feet). */
export function inBotBox(bot, x, y) {
  return Math.abs(x - bot.x) <= BOT_HITBOX.w / 2 && y <= bot.y + 20 && y >= bot.y - BOT_HITBOX.h;
}

function useSheet(spr, sheet, speed) {
  const set = () => {
    if (!spr || spr.destroyed || !sheet.frames.length) return;
    spr.textures = sheet.frames;
    spr.animationSpeed = speed;
    spr.play();
  };
  if (sheet.frames.length) set();
  else onLoaded(sheet.base, () => setTimeout(set, 0));
}

/* ------------------------------------------------------------------ */
/* Alley (the room)                                                     */
/* ------------------------------------------------------------------ */

// The sheets are the SWF's 30 fps frames: half a frame per 60 Hz tick.
const SHEET_SPEED = 0.5;

async function proposition(ctx) {
  if (ctx.data.talking || ctx.data.talked) return;
  ctx.data.talking = true;
  const spr = ctx.data.bureaucrat;
  useSheet(spr, ctx.data.bTalk, SHEET_SPEED);
  await ctx.converse({ title: SSS, kicker: 'The Back Alley', beats: PROPOSITION });
  useSheet(spr, ctx.data.bIdle, SHEET_SPEED);
  ctx.data.talking = false;
  ctx.data.talked = true;
  ctx.progress('talk_to_bureaucrat');
  const back = ctx.run?.returnTo?.tsid;
  // npc_bureaucrat.js 768-792: buildPath(dst, prev.tsid), the closest station from the street you came from (G177).
  const routed = ctx.engine.query?.('mapRoute', 'set', { from: back, to: SUBWAY_STREETS.map((r) => r.street), source: QUEST, quest: QUEST }, ctx.engine);
  const dest = String(routed?.route?.destination || '');
  const near = SUBWAY_STREETS.find((r) => r.street === back) || SUBWAY_STREETS.find((r) => dest && r.street.slice(1) === dest.slice(1)) || nearestStation(ctx.data.returnHub);
  ctx.data.nearest = near;
  ctx.activity(`The closest Subway Station: ${near.station}, on ${near.label} (${near.hub}).`);
  ctx.solve();
  await ctx.wait(500);
  // instances_exit: back where you came from.
  ctx.leave({ transition: ctx.fx() });
}

function enterAlley(ctx) {
  const { PIXI, kit } = ctx;
  ctx.data.bIdle = kit.sheetFrames(PIXI, `${LEGALIZE}npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_idle1_png_1354832995.png`, 10, 6, 57);
  ctx.data.bTalk = kit.sheetFrames(PIXI, `${LEGALIZE}npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_talk_png_1354832993.png`, 9, 3, 26);
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 1);
  spr.scale.set(SHADY.scale);
  spr.x = SHADY.x;
  spr.y = SHADY.y;
  ctx.add(spr, 30);
  useSheet(spr, ctx.data.bIdle, SHEET_SPEED);
  ctx.data.bureaucrat = spr;
  ctx.data.bureaucratTarget = ctx.register({
    classId: 'npc_bureaucrat',
    label: SSS,
    subtitle: 'Pssst. Over here.',
    sprite: spr,
  });
}

/* ------------------------------------------------------------------ */
/* Stations (world hooks)                                               */
/* ------------------------------------------------------------------ */

let worldEngine = null; // set by the world hooks while the quest is active
/** The private bot on the station you are on: { spr, target, station, collided, danced, revived, talking, dancing, rollFrom, gone }. */
let bot = null;
let auto = null; // &backalleyautoplay runner

const talkedTo = (wctx) => wctx.questProgress(QUEST, 'talk_to_bureaucrat') > 0;
const refueled = (wctx) => wctx.questProgress(QUEST, 'refuel_bot') > 0;

function dropBot(wctx) {
  if (bot?.target) wctx.unregister?.(bot.target);
  if (bot?.spr && !bot.spr.destroyed) {
    bot.spr.parent?.removeChild(bot.spr);
    bot.spr.destroy();
  }
  bot = null;
}

function spawnBot(wctx, station) {
  const { PIXI, kit } = wctx;
  // QA: &backalleycell=1 puts a Fuel Cell in the pack; &backalleymade=1 stands in for a Fuelmaker run.
  if (wctx.param('backalleycell') === '1' && wctx.count('fuel_cell') < 1) wctx.give('fuel_cell', 1);
  if (wctx.param('backalleymade') === '1') wctx.progressQuest(QUEST, 'made_fuel_cell');
  const spot = botSpot();
  const b = { station, collided: false, danced: false, revived: false, talking: false, dancing: false, rollFrom: null, gone: false };
  b.talk = kit.sheetFrames(PIXI, `${BOT_ART}bot_talk.png`, 12, 6, 69);
  b.happy = kit.sheetFrames(PIXI, `${ART}bot_attract.png`, 12, 5, 57);
  b.moveTex = textureFromUrl(`${ART}bot_move.png`);
  const spr = new PIXI.AnimatedSprite([b.moveTex]);
  spr.anchor.set(0.5, 1);
  spr.x = spot.x;
  spr.y = spot.y + 2;
  // Out of fuel: slumped and dull.
  spr.rotation = -0.22;
  spr.tint = 0xa3a39c;
  spr.zIndex = 30;
  b.spr = spr;
  b.target = wctx.register({ classId: 'npc_maintenance_bot', label: 'MaintenanceBot M-64', subtitle: 'Out of fuel', sprite: spr, qiRoom: ROOM_ID });
  bot = b;
}

async function botCollide(wctx) {
  const b = bot;
  b.collided = true;
  b.talking = true;
  await wctx.converse({ title: 'MaintenanceBot M-64', kicker: b.station.label, beats: COLLIDE });
  await wctx.converse({ title: 'Magic Rock', kicker: 'Magic Rock', text: FUEL_HINT });
  b.talking = false;
}

async function dance(wctx) {
  const b = bot;
  b.danced = true;
  b.dancing = true;
  for (const step of DANCE_STEPS) {
    setTimeout(() => wctx.engine.playHit(step.hit, 1000), step.at);
  }
  await wctx.wait(DANCE_FAMILIAR_AT);
  b.dancing = false;
  await wctx.converse({ title: 'Magic Rock', kicker: 'Magic Rock', beats: DANCE_FAMILIAR });
}

async function refuel(wctx) {
  const b = bot;
  if (!b || b.revived || wctx.count('fuel_cell') < 1) return;
  wctx.take('fuel_cell', 1);
  b.revived = true;
  b.talking = true;
  wctx.activity('You refueled the MaintenanceBot M-64.');
  b.spr.rotation = 0;
  b.spr.tint = 0xffffff;
  puff(wctx, b.spr);
  wctx.sound('PROTO_PUFF', { volume: 0.5 });
  useSheet(b.spr, b.happy, 0.4);
  await wctx.wait(900);
  useSheet(b.spr, b.talk, 0.3);
  await wctx.converse({ title: 'MaintenanceBot M-64', kicker: b.station.label, beats: REVIVE });
  b.talking = false;
  // leave(0): the flag, then off it rolls.
  wctx.progressQuest(QUEST, 'refuel_bot');
  wctx.save?.();
  b.rollFrom = { x: b.spr.x, at: Date.now() };
  b.spr.textures = [b.moveTex];
  b.spr.scale.x = -Math.abs(b.spr.scale.x);
  // No longer a target, but the sprite stays to roll away (unregister destroys a target's sprite).
  b.target.sprite = null;
  wctx.unregister(b.target);
  b.target = null;
  rollOff(wctx, b);
  if (wctx.questProgress(QUEST, 'made_fuel_cell') > 0) await wctx.turnInQuest(QUEST);
}

/**
 * npc_maintenance_bot.js 445-457 revive(): itemstack_overlay smoke_puff,
 * delta_y 140 from the bot's display top, no duration (the SWF plays once and
 * holds its empty last frame): Tiny Speck's own puff (tools/overlay-art, G251).
 */
function puff(wctx, spr) {
  const at = itemstackOverlayPoint(spr.x, displayTopOf(spr), { dy: PUFF_DY });
  playSheetOverlay(wctx.PIXI, 'smoke_puff', { layer: wctx.engine.fxLayer || wctx.engine.entityLayer, at: () => at, durationMs: 1500, loop: false });
}

/** leave(0): off along the platform at 300 px/s, on its own clock (the turn-in ends the world hooks' ticks). */
function rollOff(wctx, b) {
  const frame = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
  const step = () => {
    const spr = b.spr;
    const roll = b.rollFrom;
    if (!roll || !spr || spr.destroyed || bot !== b) return;
    spr.x = roll.x - ((Date.now() - roll.at) / 1000) * BOT_SPEED;
    spr.alpha = Math.max(0, Math.min(1, (spr.x + 40) / 200));
    if (spr.x < -60) {
      spr.visible = false;
      b.rollFrom = null;
      b.gone = true;
      publishBot(wctx);
      return;
    }
    frame(step);
  };
  frame(step);
}

function publishBot(wctx) {
  wctx.setData('baBot', bot ? (bot.gone ? 'gone' : bot.revived ? 'revived' : 'waiting') : '');
  wctx.setData('baStation', bot?.station?.label || '');
  wctx.setData('baCollided', bot?.collided ? '1' : '0');
  wctx.setData('baDanced', bot?.danced ? '1' : '0');
  wctx.setData('baRevived', bot?.revived ? '1' : '0');
  wctx.setData('baBotGone', bot?.gone ? '1' : '0');
}

/** &backalleyautoplay: the closest station's subway door, then into the bot, refuel, turn in. */
async function runAutoplay(wctx, mode) {
  const engine = wctx.engine;
  const dialogs = async () => {
    for (let i = 0; i < 40 && !wctx.dialogOpen(); i++) await wctx.wait(150);
    while (wctx.dialogOpen()) {
      wctx.advanceDialog();
      await wctx.wait(300);
    }
  };
  if (!stationByTsid(engine.streetTsid)) {
    const row = SUBWAY_STREETS.find((r) => r.street === engine.streetTsid) || nearestStation(engine.street?.hubId);
    const station = surfaceStation(row.street);
    const door = stationArrival(null);
    auto.stage = 'travel';
    await engine.enter(station.streetTsid, { spawnX: door.x, spawnY: door.y });
  }
  for (let i = 0; i < 60 && !bot; i++) await wctx.wait(150);
  if (!bot) return 'no-bot';
  auto.stage = 'collide';
  wctx.place(bot.spr.x - 60, bot.spr.y - 2);
  await dialogs();
  if (mode === 'collide') return 'collide';
  if (wctx.count('fuel_cell') < 1) wctx.give('fuel_cell', 1);
  if (mode !== 'refuel') wctx.progressQuest(QUEST, 'made_fuel_cell');
  auto.stage = 'refuel';
  refuel(wctx);
  for (let i = 0; i < 20 && !wctx.dialogOpen(); i++) await wctx.wait(150);
  await dialogs();
  if (mode === 'refuel') return 'refueled';
  for (let i = 0; i < 60 && wctx.questActive(QUEST); i++) {
    wctx.advanceAward();
    await wctx.wait(300);
  }
  for (let i = 0; i < 10; i++) {
    wctx.advanceAward();
    await wctx.wait(300);
  }
  return 'complete';
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

export const room = {
  id: ROOM_ID,
  title: 'The Back Alley',
  kicker: 'Strictly off the record',
  icon: `${ART}bureaucrat_icon.png`,
  theme: 'dark',
  hubName: 'Instance',
  durationFor: () => ALLEY_MS,
  firstStage: () => 'alley',
  leaveText: 'Leave The Back Alley? The Bureaucrat has not had his word yet.',
  travelText: 'Come alone, he said. Use Leave to go back.',
  expireText: 'The Back Alley closes up.',
  doneLabel: 'Go back',

  stageLabel() {
    return 'The Back Alley';
  },

  start(ctx) {
    ctx.data.returnHub = ctx.engine.street?.hubId || '';
  },

  build(ctx) {
    return {
      label: 'The Back Alley',
      hubName: 'Instance',
      width: ALLEY.W,
      height: ALLEY.FLOOR + 140,
      background: drawAlley(ctx.PIXI),
      platforms: alleyPlatforms(ctx.kit),
      spawn: { x: ALLEY.spawnX, y: ALLEY.FLOOR },
    };
  },

  enter(ctx) {
    enterAlley(ctx);
  },

  verbs(ctx, target) {
    if (target === ctx.data.bureaucratTarget) {
      return [{ id: 'talk_to', label: 'Talk to', enabled: !ctx.data.talking && !ctx.data.talked, tooltip: 'Pssst.', durationMs: 0 }];
    }
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target === ctx.data.bureaucratTarget && verbId === 'talk_to') {
      proposition(ctx);
      return true;
    }
    return false;
  },

  tick(ctx) {
    const p = ctx.player;
    if (!p) return;
    const busy = ctx.dialogOpen() || ctx.engine.acting();
    // The back_alley_entered box: from the Bureaucrat's wall to the log.
    if (!ctx.data.talked && !ctx.data.talking && !busy && inEnteredBox(p.x)) proposition(ctx);
  },

  onEvent(ctx, counter) {
    if (!String(counter).startsWith('making_tool_output:fuelmaker:')) return;
    ctx.progress('made_fuel_cell');
  },

  objective(ctx) {
    return { text: ctx.data.talked ? 'Off you go. Come alone, he said.' : 'Someone is waiting for you in The Back Alley.' };
  },

  onLeave() {
    // Alley: onExitLocation fails the quest unless the Bureaucrat spoke (the runtime fails an unsolved run).
    return { leaveFlag: false };
  },

  publish(ctx) {
    ctx.setData('baStage', ctx.stage || '');
    ctx.setData('baTalked', ctx.data.talked ? '1' : '0');
    ctx.setData('baNearest', ctx.data.nearest?.street || '');
  },

  async autoplay(ctx, mode) {
    for (let i = 0; i < 40 && !ctx.data.bureaucrat; i++) await ctx.wait(150);
    if (mode === 'leave') {
      ctx.leave({ transition: false });
      return 'left';
    }
    ctx.place(ALLEY.triggerX - 40, ALLEY.FLOOR);
    for (let i = 0; i < 40 && !ctx.dialogOpen(); i++) await ctx.wait(150);
    if (mode === 'talk') return 'talk';
    while (ctx.dialogOpen()) {
      ctx.advanceDialog();
      await ctx.wait(300);
    }
    return 'talked';
  },

  /* World hooks: the Fuel Cell, and the bot on every station while the job is open. */
  world: {
    onTick(wctx) {
      worldEngine = wctx.engine;
      const p = wctx.player;
      const mode = wctx.param('backalleyautoplay') || '';
      if (mode && !auto && talkedTo(wctx) && !refueled(wctx)) {
        auto = { stage: 'start' };
        runAutoplay(wctx, mode).then((out) => { auto.stage = out; wctx.setData('baAutoplay', out); }, (err) => wctx.setData('baAutoplay', `error:${err?.message || err}`));
      }
      if (auto) wctx.setData('baAutoplay', auto.stage);
      if (!bot || !p) return;
      const spr = bot.spr;
      const busy = wctx.dialogOpen() || wctx.engine.acting();
      if (spr && !spr.destroyed && !bot.collided && !bot.revived && !busy && inBotBox(spr, p.x, p.y)) botCollide(wctx);
      publishBot(wctx);
    },
    onStreetEnter(wctx, street) {
      worldEngine = wctx.engine;
      bot = null;
      const station = stationByTsid(street?.tsid);
      if (botWaits({ active: wctx.questActive(QUEST), talked: talkedTo(wctx), refueled: refueled(wctx), station: Boolean(station) })) spawnBot(wctx, station);
      publishBot(wctx);
    },
    onStreetClear(wctx) {
      dropBot(wctx);
    },
    verbs(wctx, target) {
      if (!bot || target !== bot.target) return [];
      return botVerbs({ revived: bot.revived, danced: bot.danced, cells: wctx.count('fuel_cell') })
        .map((v) => ({ ...v, durationMs: 0, enabled: v.enabled && !bot.talking && !bot.dancing }));
    },
    runVerb(wctx, target, verbId) {
      if (!bot || target !== bot.target) return false;
      if (verbId === 'refuel') {
        if (wctx.count('fuel_cell') < 1) wctx.toast(BOT_TEXT.noCells);
        else refuel(wctx);
        return true;
      }
      if (verbId === 'dance' && !bot.danced) {
        dance(wctx);
        return true;
      }
      return false;
    },
    onEvent(wctx, counter) {
      worldEngine = wctx.engine;
      if (!String(counter).startsWith('making_tool_output:fuelmaker:') || !wctx.questActive(QUEST)) return;
      wctx.progressQuest(QUEST, 'made_fuel_cell');
      if (wctx.questProgress(QUEST, 'refuel_bot') > 0) wctx.turnInQuest(QUEST);
    },
  },
};

/** QA / tests: the bot on this station, if any. */
export function _bot() {
  return bot ? { x: bot.spr?.x, y: bot.spr?.y, station: bot.station?.label || '', collided: bot.collided, revived: bot.revived, gone: bot.gone } : null;
}
export const _engine = () => worldEngine;
