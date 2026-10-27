/**
 * The Bureaucratic Halls behind the street doors, as a feature module (see
 * js/feature-host.js).
 *
 * Three streets carry the same door (door_asset_bureaucratic_hall_ext) and the
 * same bureaucratic_hall_exterior_1 facade, each leading into hub 69's halls
 * (inc_data_maps_prod.js:18006-18010): Gregarious Grange to the Bureaucratic
 * Hall (LIF101O8CDQ1AMU), Chego Chase to the Andra Bureaucratic Hall
 * (LDOCV86VHCD245F) and Baeli Bray to the Muufo Bureaucratic Hall
 * (LIF2E3LVGK82J7Q). The server treats all three alike: any location whose
 * instance_id starts with "bureaucratic_hall" runs the bureaucrats' greeting,
 * waiting area and Please Wait rules (locations/location.js:810, 1076;
 * players/player.js:1891; items/npc_bureaucrat.js:735), and the Grange and
 * Andra doors share the same arrival point (-857, -153). The halls' own
 * geometry is lost, so every door opens the one hall the remake built for
 * Legalize It (game.js drawBureaucraticHall): four bureaucrats behind the
 * counter and the hall's glass doors (door_asset_bureaucratic_hall_int) back
 * out to the street.
 *
 * The bureaucrats sell what npc_bureaucrat.js getItems lists (store 17): the
 * Card-Carrying Qualification, Your Papers and the General Building Permit,
 * through the supply feature's clerk verbs (js/bureaucracy.js). The greeting,
 * waiting area and random questions are not rebuilt outside Legalize It.
 *
 * Every hall has its Water Cooler (js/water-cooler.js: items/water_cooler.js
 * get_water, 2 energy for a Cup of Water). Drinking the cup (cup_of_water.js
 * drink: 5 mood) puts Being Watched (quests/stale_but_necessary.js) to the
 * player at once, as quests_offer(id, true) did; accepting it starts the
 * quest's room through the quest-instances feature. Where the cooler stands
 * is ours (the halls' geometry is lost): right of the counter, clear of the
 * glass doors, the chairs and the counter.
 *
 * QA: ?autostart=1&questoffer=off&doordemo=GA5I10NJDL52TKD (Chego Chase),
 *   doordemo=GA91JUQT2G82GUL (Baeli Bray) or doordemo=GLI32G3NUTD100I&doorindex=1
 *   (Gregarious Grange) stands you at the hall door; add &hallautoplay=1 to
 *   walk in (doorautoplay=1 goes through the doors feature, which refuses a
 *   door with no street). Canvas: hallScene, hallLast.
 */

import { LEGALIZE_CLERKS } from '../legalize-it.js?v=legalize-2';
import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { loseEnergy, loseMood } from '../metabolics.js';
import { acceptOffer, ensureQuestOfferState, markOffered, questStatus } from '../quest-offers.js';
import { getQuestCatalog } from '../content-catalogs.js';
import { parseQuestConversation } from '../quests.js';
import { CUP_CLASS, CUP_OF_WATER, WATER_COOLER, WATER_COOLER_CLASS, drinkCup, getWater, getWaterState } from '../water-cooler.js?v=g352-1';

export const HALLS_FEATURE_ID = 'bureaucratic-halls';
export const HALL_ENTER_VERB = 'hall_enter';
export const HALL_LEAVE_VERB = 'hall_leave';
/** features/supply-feature.js owns npc_bureaucrat verbs (buy the documents). */
const CLERK_FEATURE_ID = 'supply';
const CUP_QUEST_ID = 'stale_but_necessary';

/** Street door id -> the hall behind it (location XML door connects). */
export const HALL_DOORS = Object.freeze({
  door_1300484753304: Object.freeze({ street: 'GLI32G3NUTD100I', streetLabel: 'Gregarious Grange', tsid: 'LIF101O8CDQ1AMU', label: 'Bureaucratic Hall' }),
  door_1321408650118: Object.freeze({ street: 'GA5I10NJDL52TKD', streetLabel: 'Chego Chase', tsid: 'LDOCV86VHCD245F', label: 'Andra Bureaucratic Hall' }),
  door_1312484975748: Object.freeze({ street: 'GA91JUQT2G82GUL', streetLabel: 'Baeli Bray', tsid: 'LIF2E3LVGK82J7Q', label: 'Muufo Bureaucratic Hall' }),
});

/** Scene ids stay apart from Legalize It's own LIF101O8CDQ1AMU scene. */
export function hallSceneTsid(hallTsid) {
  return `HALL_${hallTsid}`;
}

/** The hall for a street door target, or null. */
export function hallForDoor(target) {
  if (target?.classId !== 'street_door') return null;
  return HALL_DOORS[target.door?.id] || null;
}

const ROOM = Object.freeze({ width: 1600, height: 760, ground: 620, spawnX: 150 });
const EXIT_X = 70;
/** Ours: right of the counter (x 620-1480), inside the room's 1600 px. */
export const COOLER_X = 1536;
const COOLER_ART = 'assets/sprites/icons/water_cooler@3x.png';
export const GET_WATER_VERB = WATER_COOLER.verb.id;
export const DRINK_VERB = 'cup_drink';
const EXIT_ART = 'assets/decos/groddle/door_asset_bureaucratic_hall_int.png';
const COUNTER_ART = 'assets/decos/groddle/bureaucratic_hall_counter_1.png';

let hall = null; // { def, returnTo }
let last = '';
let demoDone = false;
let demoAt = 0;

function publish(engine) {
  engine.setData?.('hallScene', hall ? hall.def.tsid : '');
  engine.setData?.('hallLast', last);
}

/** `kit` = engine.bureaucraticHall(): { layer, clerk(index, x, y, scale), sprite(url) }. */
function spawnHall(engine, kit) {
  const door = kit.sprite(EXIT_ART);
  door.anchor.set(0.5, 1);
  door.position.set(EXIT_X, ROOM.ground + 2);
  door.scale.set(0.5);
  door.zIndex = 30;
  engine.entityLayer.addChild(door);
  engine.register({
    classId: 'bureaucratic_hall_exit',
    featureId: HALLS_FEATURE_ID,
    label: hall.def.streetLabel,
    subtitle: `Back out to ${hall.def.streetLabel}`,
    sprite: door,
  });
  LEGALIZE_CLERKS.forEach((clerk, index) => {
    const spr = kit.clerk(index, 850 + index * 170, 555, 0.84);
    spr.zIndex = 40;
    engine.entityLayer.addChild(spr);
    engine.register({
      classId: 'npc_bureaucrat',
      featureId: CLERK_FEATURE_ID,
      label: clerk.name,
      subtitle: hall.def.label,
      sprite: spr,
    });
  });
  const counter = kit.sprite(COUNTER_ART);
  counter.anchor.set(0.5, 1);
  // x 620-1480 as in game.js spawnLegalizeHall: clear of the doors and the waiting-area chairs.
  counter.position.set(1050, ROOM.ground);
  counter.width = 860;
  counter.height = 132;
  counter.zIndex = 44;
  counter.eventMode = 'none';
  engine.entityLayer.addChild(counter);
  const cooler = kit.sprite(COOLER_ART);
  cooler.anchor.set(0.5, 1);
  cooler.position.set(COOLER_X, ROOM.ground + 2);
  // getAssetInfo: a 96 x 172 box.
  cooler.width = WATER_COOLER.w;
  cooler.height = WATER_COOLER.h;
  cooler.zIndex = 46;
  engine.entityLayer.addChild(cooler);
  engine.register({
    classId: WATER_COOLER_CLASS,
    featureId: HALLS_FEATURE_ID,
    label: WATER_COOLER.label,
    subtitle: hall.def.label,
    sprite: cooler,
  });
}

/** The cup in the shared catalog (cup_of_water.js label, description, base_cost, stackmax, tags). */
function ensureCup() {
  ensureItem(CUP_CLASS, {
    label: CUP_OF_WATER.label,
    namePlural: CUP_OF_WATER.namePlural,
    desc: CUP_OF_WATER.desc,
    baseCost: CUP_OF_WATER.baseCost,
    stackMax: CUP_OF_WATER.stackMax,
    tags: [...CUP_OF_WATER.tags],
  });
}

/** How many cups fit (the pack's room, when it has a limit to ask), else null. */
function cupRoom(engine) {
  const room = engine.query?.('packRoom', CUP_CLASS, 1, engine);
  return Number.isFinite(room) ? room : null;
}

function runGetWater(engine) {
  ensureCup();
  const res = getWater(engine.inv, { room: cupRoom(engine), addItem, loseEnergy: (n) => loseEnergy(engine.pc, n) });
  if (!res.ok) {
    engine.toast?.(res.msg);
    return true;
  }
  engine.pushActivity?.(res.msg);
  engine.playSound?.('ITEM_GIVE', { volume: 0.5 });
  engine.refreshPack?.();
  engine.updateHud?.();
  engine.save?.();
  last = 'water';
  publish(engine);
  return true;
}

/**
 * quests_offer('stale_but_necessary', true): offered at once, prereqs skipped
 * (force_now), as the source's emergency card (is_emergency: no way to put it
 * off). Accepting it starts the room (quest-instances, needsStart).
 */
function offerNap(engine, id) {
  const qs = engine.questState;
  const def = getQuestCatalog()[id];
  if (!qs || !def || typeof engine.offerQuestDialogue !== 'function') return false;
  ensureQuestOfferState(qs);
  markOffered(qs, id, Date.now());
  engine.setData?.('questOffer', id);
  engine.playSound?.('QUEST_OFFER', { volume: 0.55 });
  engine.offerQuestDialogue({
    title: def.title,
    kicker: 'Magic Rock',
    beats: parseQuestConversation(def.offer || def.desc),
    acceptLabel: def.acceptLabel || 'Take nap',
    declinable: false,
    urgent: true,
    onAccept: () => {
      const result = acceptOffer(qs, id, { inv: engine.inv, pc: engine.pc, addItem, removeItem, countItem, now: Date.now() });
      engine.setData?.('questOfferResult', result.ok ? 'accepted' : result.reason || 'failed');
      if (result.ok) engine.pushActivity?.(`New quest: ${def.title}`);
      engine.refreshPack?.();
      engine.save?.();
      // questInstanceLocation takes you from where you drank. The nap starts from a street (the
      // hall is a scene, and the quest-instances feature waits for one), so step out of the hall
      // first; you wake outside its door.
      if (result.ok && hall) leaveHall(engine);
    },
  });
  return true;
}

function runDrink(engine) {
  const status = engine.questState ? questStatus(engine.questState, CUP_QUEST_ID) : 'done';
  const res = drinkCup(engine.inv, { removeItem, countItem, loseMood: (n) => loseMood(engine.pc, n), questStatus: status });
  if (!res.ok) return true;
  engine.pushActivity?.(res.msg);
  engine.playSound?.('ITEM_DRINK', { volume: 0.6 });
  engine.refreshPack?.();
  engine.updateHud?.();
  engine.save?.();
  last = res.offer ? 'drink:offer' : 'drink';
  if (res.offer) offerNap(engine, res.offer);
  publish(engine);
  return true;
}

/** Walk through a hall door: the hall scene, remembering the street door to come back to. */
export function enterHall(engine, def, door = null) {
  if (!def || typeof engine.bureaucraticHall !== 'function') return false;
  if (engine.transientInstance?.()) {
    engine.toast?.('This place has its own way out. The door will have to wait.');
    return false;
  }
  const scene = hallSceneTsid(def.tsid);
  const gate = engine.travelGate?.(scene, { via: 'door' });
  if (gate && gate.ok === false) {
    engine.toast?.(gate.msg || 'You cannot go through right now.');
    last = 'gate';
    publish(engine);
    return false;
  }
  const returnTo = {
    tsid: engine.streetTsid,
    x: Math.round(Number(door?.x ?? engine.player?.x) || 0),
    y: Math.round(Number(door?.y ?? engine.player?.y) || 0),
  };
  const kit = engine.bureaucraticHall();
  const { layer } = kit;
  // The camera keeps the pack's allowance below the floor: carry the floor's grey on down.
  if (engine.PIXI?.Graphics) layer.addChild(new engine.PIXI.Graphics().rect(0, ROOM.height, ROOM.width, 240).fill(0x77766d));
  engine.playSound?.('DOOR_OPEN', { volume: 0.6 });
  engine.enterScene({
    tsid: scene,
    label: def.label,
    hubName: def.streetLabel,
    width: ROOM.width,
    height: ROOM.height,
    background: layer,
    platforms: layer.platformsScreen,
    walls: [],
    spawn: { x: ROOM.spawnX, y: ROOM.ground },
    returnTo,
    ownLight: true,
  });
  hall = { def, returnTo };
  spawnHall(engine, kit);
  last = `enter:${def.tsid}`;
  publish(engine);
  return true;
}

/** The glass doors: back to the street door you came in by. */
export async function leaveHall(engine) {
  if (!hall) return false;
  const back = hall.returnTo;
  const tsid = back.tsid || hall.def.street;
  last = `leave:${hall.def.tsid}`;
  hall = null;
  engine.playSound?.('DOOR_OPEN', { volume: 0.6 });
  await engine.enter(tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
  publish(engine);
  return true;
}

function runDemo(engine, now) {
  const target = (engine.interactables || []).find((t) => hallForDoor(t)?.street === engine.streetTsid);
  // The door registers once its art has loaded: look again shortly.
  demoAt = target ? 0 : now + 1000;
  if (!target) return;
  demoDone = true;
  enterHall(engine, hallForDoor(target), target.door);
}

export const bureaucraticHallsFeature = {
  id: HALLS_FEATURE_ID,

  onStreetEnter(street, engine) {
    if (!demoDone && engine.param?.('hallautoplay') === '1') demoAt = Date.now() + 1800;
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (demoAt && now >= demoAt && !engine.busy?.()) runDemo(engine, now);
  },

  onStreetClear() {
    // Leaving the scene any way (the glass doors, the Map, a teleport) leaves the hall.
    hall = null;
  },

  /** The hall doors (doors-feature draws them; their connect has no street): Enter opens the hall. */
  verbOverride(target) {
    const def = hallForDoor(target);
    if (!def) return null;
    return [{ id: HALL_ENTER_VERB, label: 'Enter', sort: 10, enabled: true, reason: '', energy: 0, durationMs: 0, tooltip: def.label }];
  },

  runVerbOverride(target, verbId, engine) {
    if (verbId !== HALL_ENTER_VERB) return null;
    enterHall(engine, hallForDoor(target), target.door);
    return true;
  },

  verbsFor(target, engine) {
    if (target?.classId === WATER_COOLER_CLASS) {
      const st = getWaterState({ room: engine ? cupRoom(engine) : null });
      return [{ id: GET_WATER_VERB, label: WATER_COOLER.verb.label, sort: 50, enabled: st.enabled, reason: st.reason, energy: WATER_COOLER.energy, durationMs: 0, tooltip: WATER_COOLER.verb.tooltip }];
    }
    if (target?.classId !== 'bureaucratic_hall_exit') return null;
    return [{ id: HALL_LEAVE_VERB, label: 'Leave', sort: 10, enabled: true, reason: '', energy: 0, durationMs: 0, tooltip: target.subtitle || 'Leave the hall' }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId === WATER_COOLER_CLASS && verbId === GET_WATER_VERB) return runGetWater(engine);
    if (target?.classId !== 'bureaucratic_hall_exit' || verbId !== HALL_LEAVE_VERB) return false;
    leaveHall(engine);
    return true;
  },

  /** cup_of_water.js drink (the cup's default verb, keys_in_pack n). */
  packVerbs(classTsid, engine) {
    if (classTsid !== CUP_CLASS || !(countItem(engine?.inv || {}, CUP_CLASS) > 0)) return null;
    return [{ id: DRINK_VERB, label: CUP_OF_WATER.verb.label, enabled: true, reason: '', tooltip: CUP_OF_WATER.verb.tooltip, primary: true }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== CUP_CLASS || verbId !== DRINK_VERB) return false;
    return runDrink(engine);
  },

  init() {
    // A cup kept in a save shows its own name and description in the pack.
    ensureCup();
  },

  /** Tests. */
  _state() {
    return { hall: hall ? { tsid: hall.def.tsid, returnTo: { ...hall.returnTo } } : null, last };
  },
  _reset() {
    hall = null;
    last = '';
    demoDone = false;
    demoAt = 0;
  },
};
