/**
 * We're Off to See the Lizard (quests/fuelmaking_refuel_robot.js): The Back
 * Alley, then a Subway Station.
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
 * Lost / reconstructed: both locations' geometry. The alley reuses the
 * Legalize It forest staging and recovered art (decos, the Shady Bureaucrat
 * sheets); the remake has no subway network, so while the bot waits a
 * street's subway door (twelve imported streets have one) opens a rebuilt
 * station platform (pillars, map stand and train from the Lily Linguistic
 * subway recordings) instead of "This door is not working!". The bot's
 * climb to y -349 has no stairs here, so it rolls the same 300 px/s along
 * the platform and out of sight. No route line: the closest station's street
 * is named in the activity feed and the room objective.
 */

export const QUEST = 'fuelmaking_refuel_robot';
const ART = 'assets/sprites/quest-rooms/back_alley/';
const LEGALIZE = 'assets/sprites/quests/legalize/';
const BOT_ART = 'assets/sprites/quest-rooms/le_miserable/';

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
  { street: 'GIF2IUQJQ571TFL', label: 'Eastern Approach', hubId: '50', hub: 'Ilmenskie Caverns', station: 'Eastern Approach Subway Station', door: 'door_1306221529369' },
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

/** Which location a start opens: the alley until the bureaucrat has spoken. */
export function chooseStage({ talked = false } = {}) {
  return talked ? 'station' : 'alley';
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

/* ------------------------------------------------------------------ */
/* Layouts (world pixels, y down; a platform's y is its walking line)   */
/* ------------------------------------------------------------------ */

export const ALLEY = Object.freeze({ W: 1600, FLOOR: 620, spawnX: 1300, bureaucratX: 880, triggerX: 1060 });
export const STATION = Object.freeze({
  W: 1800,
  FLOOR: 600,
  spawnX: 260,
  // Same 778 px from the arrival point as the source (door connect x ~-580 -> bot 198).
  botX: 260 + (BOT_SOURCE.x - -580),
  exitX: 150,
  mapX: 700,
  pillars: [470, 1290],
  trainX: 1480,
});

export function alleyPlatforms(kit) {
  return [kit.plat(0, ALLEY.FLOOR, ALLEY.W, ALLEY.FLOOR, 'invisible', { id: 'ba_floor' })];
}

export function stationPlatforms(kit) {
  return [kit.plat(0, STATION.FLOOR, STATION.trainX - 30, STATION.FLOOR, 'invisible', { id: 'ba_platform' })];
}

/* ------------------------------------------------------------------ */
/* Stage choice across starts                                            */
/* ------------------------------------------------------------------ */

let worldEngine = null; // set by the world hooks while the quest is active
let pendingStation = null; // { station, street, label } from the door that opened it

function questProgress(engine, name) {
  return Number(engine?.questState?.active?.[QUEST]?.progress?.[name]) || 0;
}

function wantedStage() {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('backalleystage') : null;
  if (forced === 'station' || forced === 'alley') return forced;
  if (pendingStation) return 'station';
  return chooseStage({ talked: questProgress(worldEngine, 'talk_to_bureaucrat') > 0 });
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

function drawAlley(ctx) {
  const { PIXI, kit } = ctx;
  const { W, FLOOR } = ALLEY;
  const H = FLOOR + 140;
  const root = kit.sceneRoot(PIXI, W, H);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#0f2418'], [0.6, '#21452f'], [1, '#2f5a3b']], 960, 640));
  const far = root.layer(0.45, 1);
  [['tree_background_01', 80], ['tree_background_02', 330], ['tree_background_03', 560], ['tree_background_02', 820],
    ['tree_background_01', 1080], ['tree_background_03', 1330]].forEach(([n, x], i) => {
    far.addChild(kit.deco(PIXI, n, x, FLOOR - 60, { scale: 1.6 + (i % 3) * 0.1, alpha: 0.6 }));
  });
  const world = root.layer(1, 2);
  // Light through the canopy (the recording's soft beams).
  const beams = new PIXI.Graphics();
  beams.beginFill(0xc9f0c0, 0.09).drawPolygon([520, 0, 700, 0, 980, FLOOR, 760, FLOOR]).endFill();
  beams.beginFill(0xc9f0c0, 0.06).drawPolygon([900, 0, 1010, 0, 1240, FLOOR, 1090, FLOOR]).endFill();
  world.addChild(beams);
  // The ruined stone wall behind the Bureaucrat.
  const wall = new PIXI.Graphics();
  wall.beginFill(0x6d7166).drawRoundedRect(560, FLOOR - 300, 300, 300, 10).endFill();
  wall.lineStyle(2, 0x51554c, 0.8);
  for (let row = 0; row < 7; row++) {
    const y = FLOOR - 300 + row * 43;
    wall.moveTo(562, y).lineTo(858, y);
    for (let x = 560 + (row % 2) * 40; x < 860; x += 80) wall.moveTo(x, y).lineTo(x, y + 43);
  }
  wall.lineStyle(0);
  wall.beginFill(0x4a4d45).drawRect(760, FLOOR - 82, 120, 82).endFill();
  wall.beginFill(0x8d9186).drawRect(780, FLOOR - 64, 18, 26).drawRect(842, FLOOR - 64, 18, 26).endFill();
  world.addChild(wall);
  world.addChild(kit.deco(PIXI, 'forest_hole_back', 285, FLOOR, { scale: 1.05 }));
  // Forest floor: a mossy edge on dark earth, the recovered terrain mound behind the hole.
  const mound = kit.deco(PIXI, 'ground_forest_terrain_plat_01', 300, FLOOR + 30, { scale: 0.55, alpha: 0.9 });
  world.addChild(mound);
  const floor = new PIXI.Graphics();
  floor.beginFill(0x2e2116).drawRect(-600, FLOOR, W + 1200, H - FLOOR + 200).endFill();
  floor.beginFill(0x4f6b2c).drawRect(-600, FLOOR - 4, W + 1200, 12).endFill();
  floor.beginFill(0x6d8a3c);
  for (let x = -600; x < W + 600; x += 46) floor.drawEllipse(x + (x % 3) * 7, FLOOR - 3, 30, 7);
  floor.endFill();
  floor.beginFill(0x45331f);
  for (let i = 0; i < 26; i++) floor.drawEllipse((i * 131) % W, FLOOR + 30 + ((i * 47) % 90), 10 + (i % 4) * 4, 5 + (i % 3) * 2);
  floor.endFill();
  world.addChild(floor);
  // A fallen log on the path.
  const log = new PIXI.Graphics();
  log.beginFill(0x5b3b22).drawRoundedRect(1120, FLOOR - 34, 260, 30, 14).endFill();
  log.beginFill(0x7a5332).drawEllipse(1380, FLOOR - 19, 12, 15).endFill();
  world.addChild(log);
  [['tree_front_02', 70, 0.68], ['tree_front_01', 1500, 0.9]].forEach(([n, x, s]) => {
    world.addChild(kit.deco(PIXI, n, x, FLOOR + 30, { scale: s }));
  });
  return root;
}

function drawStation(ctx, stationName) {
  const { PIXI, kit } = ctx;
  const { W, FLOOR } = STATION;
  const H = FLOOR + 140;
  const root = kit.sceneRoot(PIXI, W, H);
  const bg = root.layer(0, 0);
  bg.addChild(kit.gradient(PIXI, [[0, '#3c3f3c'], [1, '#585b57']], 960, 640));
  const world = root.layer(1, 1);
  // Cracked concrete wall and its ledge (Lily Linguistic "Subway" recordings).
  const wall = new PIXI.Graphics();
  wall.beginFill(0x7b7d78).drawRect(-600, -200, W + 1200, FLOOR + 130).endFill();
  wall.beginFill(0x6a6c67).drawRect(-600, FLOOR - 140, W + 1200, 22).endFill();
  wall.beginFill(0x2b2c2a).drawRect(-600, FLOOR - 118, W + 1200, 48).endFill();
  wall.lineStyle(3, 0x5c5e59, 0.9);
  for (const [x, y] of [[300, 120], [880, 220], [1180, 90], [1640, 250]]) {
    wall.moveTo(x, y).lineTo(x + 18, y + 60).lineTo(x + 6, y + 120).lineTo(x + 30, y + 190);
  }
  wall.lineStyle(0);
  world.addChild(wall);
  world.addChild(kit.label(PIXI, stationName.toUpperCase(), 900, FLOOR - 250, { size: 22, fill: 0xdad7c8, alpha: 0.75 }));
  // The platform face (recovered subway_platform_1): its yellow edge sits behind the walking line.
  const plat = kit.deco(PIXI, 'subway_platform_1', -600, FLOOR - 70, { ax: 0, ay: 0 });
  plat.width = W + 1200;
  plat.height = 300;
  world.addChild(plat);
  // Train waiting at the far end.
  const train = new PIXI.Graphics();
  const tx = STATION.trainX;
  train.lineStyle(4, 0x3c4546, 1).beginFill(0xe6e8e2);
  train.drawRoundedRect(tx, FLOOR - 270, 520, 250, 90);
  train.endFill().lineStyle(0);
  train.beginFill(0x93a4a6).drawRoundedRect(tx + 40, FLOOR - 230, 120, 80, 24).drawRoundedRect(tx + 190, FLOOR - 230, 130, 80, 16).endFill();
  train.beginFill(0x5e6d70).drawRect(tx, FLOOR - 70, 520, 18).endFill();
  world.addChild(train);
  // Pillars.
  for (const x of STATION.pillars) {
    const p = new PIXI.Graphics();
    p.beginFill(0x8e908b).drawRect(x - 34, 0, 68, FLOOR + 14).endFill();
    p.beginFill(0x767873).drawRect(x + 18, 0, 16, FLOOR + 14).endFill();
    p.lineStyle(2, 0x5f615c, 0.8).moveTo(x - 10, FLOOR - 220).lineTo(x + 4, FLOOR - 170).lineTo(x - 6, FLOOR - 120);
    world.addChild(p);
  }
  // Subway map stand.
  const stand = new PIXI.Graphics();
  const mx = STATION.mapX;
  stand.beginFill(0x8a8c87).drawRect(mx - 3, FLOOR - 70, 6, 70).endFill();
  stand.beginFill(0x8a8c87).drawEllipse(mx, FLOOR, 22, 5).endFill();
  stand.lineStyle(3, 0x9c9a90).beginFill(0xe9e5d6).drawRoundedRect(mx - 42, FLOOR - 140, 84, 72, 4).endFill();
  stand.lineStyle(2, 0xb4ae9c).moveTo(mx - 28, FLOOR - 100).bezierCurveTo(mx - 10, FLOOR - 130, mx + 10, FLOOR - 80, mx + 28, FLOOR - 110);
  world.addChild(stand);
  world.addChild(kit.label(PIXI, 'SUBWAY MAP', mx, FLOOR - 131, { size: 9, fill: 0x6b675c }));
  return root;
}

function exitSign(ctx, streetLabel) {
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.beginFill(0x1f2120, 0.94).drawRoundedRect(-80, -150, 160, 56, 6).endFill();
  g.beginFill(0xffffff).drawPolygon([50, -114, 64, -124, 64, -118, 72, -118, 72, -110, 64, -110, 64, -104]).endFill();
  // The stairway up to the street: a dark opening with lit steps.
  g.beginFill(0x2a2b29).drawRoundedRect(-58, -90, 116, 90, 10).endFill();
  g.beginFill(0x6e706b);
  for (let i = 0; i < 5; i++) g.drawRect(-48 + i * 4, -14 - i * 15, 96 - i * 8, 6);
  g.endFill();
  g.lineStyle(3, 0x8e908b).drawRoundedRect(-58, -90, 116, 90, 10).lineStyle(0);
  g.beginFill(0xffffff, 0.001).drawRect(-80, -150, 160, 150).endFill();
  c.addChild(g);
  c.addChild(kit.label(PIXI, streetLabel, -8, -129, { size: 12, fill: 0xffffff, wrap: 110 }));
  c.x = STATION.exitX;
  c.y = STATION.FLOOR;
  return c;
}

function useSheet(spr, sheet, speed) {
  const set = () => {
    if (!spr || spr.destroyed || !sheet.frames.length) return;
    spr.textures = sheet.frames;
    spr.animationSpeed = speed;
    spr.play();
  };
  if (sheet.frames.length) set();
  else sheet.base.once('loaded', () => setTimeout(set, 0));
}

/* ------------------------------------------------------------------ */
/* Alley                                                                */
/* ------------------------------------------------------------------ */

async function proposition(ctx) {
  if (ctx.data.talking || ctx.data.talked) return;
  ctx.data.talking = true;
  const spr = ctx.data.bureaucrat;
  useSheet(spr, ctx.data.bTalk, 0.24);
  await ctx.converse({ title: SSS, kicker: 'The Back Alley', beats: PROPOSITION });
  useSheet(spr, ctx.data.bIdle, 0.12);
  ctx.data.talking = false;
  ctx.data.talked = true;
  ctx.progress('talk_to_bureaucrat');
  const back = ctx.run?.returnTo?.tsid;
  const near = SUBWAY_STREETS.find((r) => r.street === back) || nearestStation(ctx.data.returnHub);
  ctx.data.nearest = near;
  ctx.activity(`The closest Subway Station: ${near.station}, on ${near.label} (${near.hub}).`);
  ctx.solve();
  await ctx.wait(500);
  ctx.leave({ transition: ctx.fx() });
}

function enterAlley(ctx) {
  const { PIXI, kit } = ctx;
  ctx.data.bIdle = kit.sheetFrames(PIXI, `${LEGALIZE}npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_idle1_png_1354832995.png`, 10, 6, 57);
  ctx.data.bTalk = kit.sheetFrames(PIXI, `${LEGALIZE}npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_talk_png_1354832993.png`, 9, 3, 26);
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 1);
  spr.scale.set(0.95);
  spr.x = ALLEY.bureaucratX;
  spr.y = ALLEY.FLOOR + 4;
  ctx.add(spr, 30);
  useSheet(spr, ctx.data.bIdle, 0.12);
  ctx.data.bureaucrat = spr;
  ctx.data.bureaucratTarget = ctx.register({
    classId: 'npc_bureaucrat',
    label: SSS,
    subtitle: 'Pssst. Over here.',
    sprite: spr,
  });
}

/* ------------------------------------------------------------------ */
/* Station                                                              */
/* ------------------------------------------------------------------ */

function enterStation(ctx) {
  const { PIXI, kit } = ctx;
  ctx.solve(); // a station is an ordinary place: leaving it never fails the quest
  const refueled = ctx.hasProgress('refuel_bot');
  const sign = exitSign(ctx, ctx.data.station?.label || 'Exit');
  ctx.add(sign, 25);
  ctx.data.exitTarget = ctx.register({ classId: 'subway_exit', label: `Exit to ${ctx.data.station?.label || 'the street'}`, subtitle: 'Back up to the street', sprite: sign });
  if (refueled) return;
  // QA: &backalleycell=1 puts a Fuel Cell in the pack; &backalleymade=1 stands in for a Fuelmaker run.
  if (ctx.param('backalleycell') === '1' && ctx.count('fuel_cell') < 1) ctx.give('fuel_cell', 1);
  if (ctx.param('backalleymade') === '1') ctx.progress('made_fuel_cell');
  ctx.data.botTalk = kit.sheetFrames(PIXI, `${BOT_ART}bot_talk.png`, 12, 6, 69);
  ctx.data.botHappy = kit.sheetFrames(PIXI, `${ART}bot_attract.png`, 12, 5, 57);
  const moveTex = PIXI.Texture.from(`${ART}bot_move.png`);
  ctx.data.botMoveTex = moveTex;
  const bot = new PIXI.AnimatedSprite([moveTex]);
  bot.anchor.set(0.5, 1);
  bot.x = STATION.botX;
  bot.y = STATION.FLOOR + 2;
  // Out of fuel: slumped and dull.
  bot.rotation = -0.22;
  bot.tint = 0xa3a39c;
  ctx.add(bot, 30);
  ctx.data.bot = bot;
  ctx.data.botTarget = ctx.register({ classId: 'npc_maintenance_bot', label: 'MaintenanceBot M-64', subtitle: 'Out of fuel', sprite: bot });
}

async function botCollide(ctx) {
  ctx.data.collided = true;
  ctx.data.talking = true;
  await ctx.converse({ title: 'MaintenanceBot M-64', kicker: ctx.data.station?.station || 'Subway Station', beats: COLLIDE });
  await ctx.converse({ title: 'Magic Rock', kicker: 'Magic Rock', text: FUEL_HINT });
  ctx.data.talking = false;
}

async function dance(ctx) {
  ctx.data.danced = true;
  ctx.data.dancing = true;
  for (const step of DANCE_STEPS) {
    setTimeout(() => ctx.engine.playHit(step.hit, 1000), step.at);
  }
  await ctx.wait(DANCE_FAMILIAR_AT);
  ctx.data.dancing = false;
  await ctx.converse({ title: 'Magic Rock', kicker: 'Magic Rock', beats: DANCE_FAMILIAR });
}

async function refuel(ctx) {
  if (ctx.data.revived || ctx.count('fuel_cell') < 1) return;
  ctx.take('fuel_cell', 1);
  ctx.data.revived = true;
  ctx.data.talking = true;
  ctx.activity('You refueled the MaintenanceBot M-64.');
  const bot = ctx.data.bot;
  bot.rotation = 0;
  bot.tint = 0xffffff;
  puff(ctx, bot.x, bot.y - PUFF_DY);
  ctx.sound('PROTO_PUFF', { volume: 0.5 });
  useSheet(bot, ctx.data.botHappy, 0.4);
  await ctx.wait(900);
  useSheet(bot, ctx.data.botTalk, 0.3);
  await ctx.converse({ title: 'MaintenanceBot M-64', kicker: ctx.data.station?.station || 'Subway Station', beats: REVIVE });
  ctx.data.talking = false;
  // leave(0): the flag, then off it rolls.
  ctx.progress('refuel_bot');
  ctx.data.rollFrom = { x: bot.x, at: Date.now() };
  bot.textures = [ctx.data.botMoveTex];
  bot.scale.x = -Math.abs(bot.scale.x);
  ctx.unregister(ctx.data.botTarget);
  ctx.data.botTarget = null;
  if (ctx.complete()) {
    ctx.data.turnedIn = true;
    await ctx.turnIn();
  }
}

function puff(ctx, x, y) {
  const { PIXI } = ctx;
  const g = new PIXI.Graphics();
  for (const [dx, dy, r] of [[0, 0, 26], [-24, 10, 18], [24, 8, 20], [-10, -18, 16], [14, -16, 15]]) {
    g.beginFill(0xe8e6df, 0.9).drawCircle(dx, dy, r).endFill();
  }
  g.x = x;
  g.y = y;
  ctx.add(g, 40);
  ctx.data.puff = { g, at: Date.now() };
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

export const room = {
  id: 'back_alley',
  title: 'The Back Alley',
  kicker: 'Strictly off the record',
  icon: `${ART}bureaucrat_icon.png`,
  theme: 'dark',
  hubName: 'Instance',
  durationFor: () => (wantedStage() === 'alley' ? ALLEY_MS : 0),
  firstStage: () => wantedStage(),
  leaveText: 'Leave The Back Alley? The Bureaucrat has not had his word yet.',
  travelText: 'Come alone, he said. Use Leave to go back.',
  expireText: 'The Back Alley closes up.',
  doneLabel: 'Go back',

  stageLabel(stage, ctx) {
    return stage === 'station' ? ctx?.data?.station?.station || 'Subway Station' : 'The Back Alley';
  },

  start(ctx) {
    const back = ctx.run?.returnTo?.tsid;
    const fromDoor = pendingStation;
    pendingStation = null;
    const row = SUBWAY_STREETS.find((s) => s.street === back) || null;
    ctx.data.station = fromDoor || (row ? { station: row.station, label: row.label } : { station: 'Subway Station', label: 'the street' });
    ctx.data.returnHub = ctx.engine.street?.hubId || '';
  },

  build(ctx, stage) {
    const { kit } = ctx;
    if (stage === 'station') {
      return {
        label: ctx.data.station.station,
        hubName: ctx.data.station.hub || '',
        width: STATION.W,
        height: STATION.FLOOR + 140,
        background: drawStation(ctx, ctx.data.station.station),
        platforms: stationPlatforms(kit),
        spawn: { x: STATION.spawnX, y: STATION.FLOOR },
      };
    }
    return {
      label: 'The Back Alley',
      hubName: 'Instance',
      width: ALLEY.W,
      height: ALLEY.FLOOR + 140,
      background: drawAlley(ctx),
      platforms: alleyPlatforms(kit),
      spawn: { x: ALLEY.spawnX, y: ALLEY.FLOOR },
    };
  },

  enter(ctx, stage) {
    if (stage === 'station') enterStation(ctx);
    else enterAlley(ctx);
  },

  verbs(ctx, target) {
    if (target === ctx.data.bureaucratTarget) {
      return [{ id: 'talk_to', label: 'Talk to', enabled: !ctx.data.talking && !ctx.data.talked, tooltip: 'Pssst.', durationMs: 0 }];
    }
    if (target === ctx.data.botTarget) {
      return botVerbs({ revived: ctx.data.revived, danced: ctx.data.danced, cells: ctx.count('fuel_cell') })
        .map((v) => ({ ...v, durationMs: 0, enabled: v.enabled && !ctx.data.talking && !ctx.data.dancing }));
    }
    if (target === ctx.data.exitTarget) return [{ id: 'leave', label: 'Exit', enabled: true, tooltip: 'Back up to the street', durationMs: 0 }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target === ctx.data.bureaucratTarget && verbId === 'talk_to') {
      proposition(ctx);
      return true;
    }
    if (target === ctx.data.botTarget) {
      if (verbId === 'refuel') {
        if (ctx.count('fuel_cell') < 1) ctx.toast(BOT_TEXT.noCells);
        else refuel(ctx);
        return true;
      }
      if (verbId === 'dance' && !ctx.data.danced) {
        dance(ctx);
        return true;
      }
    }
    if (target === ctx.data.exitTarget && verbId === 'leave') {
      ctx.leave({ transition: ctx.fx() });
      return true;
    }
    return false;
  },

  tick(ctx) {
    const p = ctx.player;
    if (!p) return;
    const busy = ctx.dialogOpen() || ctx.engine.acting();
    if (ctx.stage === 'alley') {
      // The back_alley_entered box: from the Bureaucrat's wall to the log.
      if (!ctx.data.talked && !ctx.data.talking && !busy && p.x <= ALLEY.triggerX) proposition(ctx);
      return;
    }
    const bot = ctx.data.bot;
    if (bot && !bot.destroyed && !ctx.data.collided && !ctx.data.revived && !busy && inBotBox(bot, p.x, p.y)) botCollide(ctx);
    const pf = ctx.data.puff;
    if (pf && !pf.g.destroyed) {
      const t = (Date.now() - pf.at) / 700;
      pf.g.scale.set(1 + t * 0.8);
      pf.g.alpha = Math.max(0, 1 - t);
      if (t >= 1) pf.g.visible = false;
    }
    const roll = ctx.data.rollFrom;
    if (roll && bot && !bot.destroyed) {
      const dist = ((Date.now() - roll.at) / 1000) * BOT_SPEED;
      bot.x = roll.x - dist;
      bot.alpha = Math.max(0, Math.min(1, (bot.x + 40) / 200));
      if (bot.x < -60) {
        bot.visible = false;
        ctx.data.rollFrom = null;
        ctx.data.botGone = true;
      }
    }
  },

  onEvent(ctx, counter) {
    if (!String(counter).startsWith('making_tool_output:fuelmaker:')) return;
    ctx.progress('made_fuel_cell');
    if (ctx.hasProgress('refuel_bot') && ctx.complete() && !ctx.data.turnedIn) {
      ctx.data.turnedIn = true;
      ctx.turnIn();
    }
  },

  objective(ctx) {
    const cells = ctx.count('fuel_cell');
    if (ctx.stage === 'alley') {
      return { text: ctx.data.talked ? 'Off you go. Come alone, he said.' : 'Someone is waiting for you in The Back Alley.' };
    }
    const made = ctx.hasProgress('made_fuel_cell');
    let text = 'Find the Maintenance Bot on the platform.';
    if (ctx.data.turnedIn || (ctx.data.revived && !ctx.engine.questState?.active?.[QUEST])) text = 'The trains will run smoothly. Head back up.';
    else if (ctx.data.revived) text = made ? 'The bot is back at work.' : 'Bot refuelled. Now make a Fuel Cell with a Fuelmaker.';
    else if (ctx.data.collided) text = cells ? 'Refuel the MaintenanceBot M-64.' : 'It needs a Fuel Cell. Make one with a Fuelmaker.';
    return { text, stats: [['Fuel Cells', cells], ['made one', made ? 'yes' : 'not yet']] };
  },

  onLeave() {
    // Alley: onExitLocation fails the quest unless the Bureaucrat spoke (the runtime fails an unsolved run).
    return { leaveFlag: false };
  },

  publish(ctx) {
    ctx.setData('baStage', ctx.stage || '');
    ctx.setData('baTalked', ctx.data.talked ? '1' : '0');
    ctx.setData('baCollided', ctx.data.collided ? '1' : '0');
    ctx.setData('baDanced', ctx.data.danced ? '1' : '0');
    ctx.setData('baRevived', ctx.data.revived ? '1' : '0');
    ctx.setData('baBotGone', ctx.data.botGone ? '1' : '0');
    ctx.setData('baStation', ctx.data.station?.station || '');
    ctx.setData('baNearest', ctx.data.nearest?.street || '');
  },

  async autoplay(ctx, mode) {
    for (let i = 0; i < 40 && !ctx.data.bureaucrat && !ctx.data.bot; i++) await ctx.wait(150);
    if (ctx.stage === 'alley') {
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
    }
    // Station: walk into the bot, then refuel it with a Fuel Cell.
    ctx.place(STATION.botX - 60, STATION.FLOOR);
    for (let i = 0; i < 40 && !ctx.dialogOpen(); i++) await ctx.wait(150);
    while (ctx.dialogOpen()) {
      ctx.advanceDialog();
      await ctx.wait(300);
    }
    if (mode === 'collide') return 'collide';
    if (ctx.count('fuel_cell') < 1) ctx.give('fuel_cell', 1);
    refuel(ctx);
    for (let i = 0; i < 20 && !ctx.dialogOpen(); i++) await ctx.wait(150);
    while (ctx.dialogOpen()) {
      ctx.advanceDialog();
      await ctx.wait(300);
    }
    if (mode === 'refuel') return 'refueled';
    for (let i = 0; i < 60 && ctx.run; i++) {
      ctx.advanceAward();
      await ctx.wait(300);
    }
    return 'complete';
  },

  /* World hooks: the Fuel Cell, and the subway doors while the bot waits. */
  world: {
    onTick(wctx) {
      worldEngine = wctx.engine;
    },
    onStreetEnter(wctx) {
      worldEngine = wctx.engine;
    },
    onEvent(wctx, counter) {
      worldEngine = wctx.engine;
      if (!String(counter).startsWith('making_tool_output:fuelmaker:') || !wctx.questActive(QUEST)) return;
      wctx.progressQuest(QUEST, 'made_fuel_cell');
      if (wctx.questProgress(QUEST, 'refuel_bot') > 0) wctx.turnInQuest(QUEST);
    },
    verbOverride(wctx, target) {
      if (target?.classId !== 'street_door' || !wctx.questActive(QUEST)) return null;
      const st = stationForDoor(target.door);
      if (!st || !wctx.questProgress(QUEST, 'talk_to_bureaucrat') || wctx.questProgress(QUEST, 'refuel_bot')) return null;
      return [{ id: 'ba_station', label: 'Enter', enabled: true, durationMs: 0, tooltip: st.station }];
    },
    runVerbOverride(wctx, target, verbId) {
      if (verbId !== 'ba_station') return null;
      const st = stationForDoor(target?.door);
      if (!st) return null;
      const row = SUBWAY_STREETS.find((s) => s.street === wctx.engine.streetTsid);
      pendingStation = { ...st, label: row?.label || wctx.engine.street?.label || 'the street', hub: row?.hub || wctx.engine.street?.hubName || '' };
      worldEngine = wctx.engine;
      wctx.startInstance(QUEST);
      return true;
    },
  },
};
