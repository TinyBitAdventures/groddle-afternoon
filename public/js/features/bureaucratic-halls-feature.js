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
 * QA: ?autostart=1&questoffer=off&doordemo=GA5I10NJDL52TKD (Chego Chase),
 *   doordemo=GA91JUQT2G82GUL (Baeli Bray) or doordemo=GLI32G3NUTD100I&doorindex=1
 *   (Gregarious Grange) stands you at the hall door; add &hallautoplay=1 to
 *   walk in (doorautoplay=1 goes through the doors feature, which refuses a
 *   door with no street). Canvas: hallScene, hallLast.
 */

import { LEGALIZE_CLERKS } from '../legalize-it.js?v=legalize-2';

export const HALLS_FEATURE_ID = 'bureaucratic-halls';
export const HALL_ENTER_VERB = 'hall_enter';
export const HALL_LEAVE_VERB = 'hall_leave';
/** features/supply-feature.js owns npc_bureaucrat verbs (buy the documents). */
const CLERK_FEATURE_ID = 'supply';

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
  counter.position.set(830, ROOM.ground);
  counter.width = 1020;
  counter.height = 132;
  counter.zIndex = 44;
  counter.eventMode = 'none';
  engine.entityLayer.addChild(counter);
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

  verbsFor(target) {
    if (target?.classId !== 'bureaucratic_hall_exit') return null;
    return [{ id: HALL_LEAVE_VERB, label: 'Leave', sort: 10, enabled: true, reason: '', energy: 0, durationMs: 0, tooltip: target.subtitle || 'Leave the hall' }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== 'bureaucratic_hall_exit' || verbId !== HALL_LEAVE_VERB) return false;
    leaveHall(engine);
    return true;
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
