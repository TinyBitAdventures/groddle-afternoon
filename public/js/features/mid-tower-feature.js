/**
 * Jethimadh Tower: Mid as a feature module (see js/feature-host.js). The
 * Stairs and the Mezzanine are street JSON (js/tower-mid-rooms.js, written by
 * tools/build-tower-rooms.mjs); tower-rooms-feature gives them their interior
 * ecology and door plaques. This file adds what a street JSON cannot carry:
 *
 * - Greeterbot Sentry G-42 in the Mezzanine (GSJS npc_quest_giver_widget,
 *   widgetWood art from its own SWF). Talk to follows its doTalk:
 *   - It's Educational (rook_hall_start) or It's Educational II (rook_hall)
 *     under way: the museum (engine.startRookMuseum, the same instance as
 *     ?questdemo=rookmuseum; the Greeterbot's welcome plays inside, as
 *     enterHall did after the turn-in);
 *   - rook_hall done: the hall_repeat conversation ("Would you like to return
 *     to the Museum of the Rook ...?" Yes / No);
 *   - otherwise its no_quest_text ("One must be called to do so.").
 * - The museum door ("enter the door to the Rook museum", beta recap
 *   2011-08-19) goes the Greeterbot's way: its Enter runs the same check.
 * - The teleporter under the floorboards (Mezzanine box mezz_stoot_teleporter:
 *   jump at the crawlspace's left end) to unnnn, the Stoot Shrine, and unnnn's
 *   way back (STOOT_RETURN: walk into its left end).
 *
 * QA (real input): ?autostart=1&questoffer=off&doordemo=GIF5UU8FO3029OK&doorautoplay=1
 *   enters the tower from Tower St West; or &streetdemo=GIFGJ2246R72LJL for the
 *   Mezzanine. &midtowerquest=start puts It's Educational in the quest log
 *   (=done marks both parts done, for the repeat conversation).
 * Canvas data: midTowerRoom, greeterbot (waiting | museum | repeat |
 * declined | refused), midTowerLast, midTowerTeleports.
 */

import { insideBottomRect } from '../doors.js';
import { assignQuest } from '../quests.js';
import { textureFromUrl } from '../textures.js';
import {
  GREETERBOT,
  MEZZANINE_TSID,
  MUSEUM_DOOR_ID,
  STOOT_RETURN,
  boxToScreen,
  midTowerRoomByTsid,
} from '../tower-mid-rooms.js?v=mid-tower-1';

export const MID_TOWER_FEATURE_ID = 'mid-tower';
export const ROOK_HALL_START = 'rook_hall_start';
export const ROOK_HALL = 'rook_hall';
const MUSEUM_VERB = 'mid_tower_museum_enter';
const TELEPORT_CHECK_MS = 120;
const ARRIVAL_GRACE_MS = 800;

let views = [];
let greeter = null;
let teleportBoxes = [];
let teleporting = false;
let lastCheck = 0;
let enteredAt = 0;
let teleports = 0;

function clear(engine) {
  if (greeter && engine) engine.unregister(greeter);
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy();
  }
  views = [];
  greeter = null;
  teleportBoxes = [];
}

/**
 * What the Greeterbot does for this quest log (npc_quest_giver_widget.doTalk):
 * 'repeat' once rook_hall is done, 'museum' while either part is under way
 * (or part one is done and part two never finished), else 'refuse'.
 */
export function greeterAction(questState) {
  const done = questState?.completed || [];
  const active = questState?.active || {};
  if (done.includes(ROOK_HALL)) return 'repeat';
  if (active[ROOK_HALL_START] || active[ROOK_HALL] || done.includes(ROOK_HALL_START)) return 'museum';
  return 'refuse';
}

function enterMuseum(engine) {
  engine.setData('greeterbot', 'museum');
  engine.setData('midTowerLast', 'museum');
  engine.startRookMuseum?.();
}

/** Talk to the Greeterbot (or Enter the museum door, which asks the same). */
export function greet(engine, speaker) {
  const action = greeterAction(engine.questState);
  if (action === 'museum') {
    enterMuseum(engine);
    return true;
  }
  if (action === 'repeat') {
    engine.setData('greeterbot', 'repeat');
    engine.scriptedDialogue?.({
      title: 'Museum of the Rook',
      kicker: GREETERBOT.label,
      beats: [{ text: GREETERBOT.repeatQuestion, response: GREETERBOT.repeatYes }],
      cancelable: true,
      primaryLabel: GREETERBOT.repeatYes,
      cancelLabel: GREETERBOT.repeatNo,
      onComplete: () => enterMuseum(engine),
      onCancel: () => {
        engine.setData('greeterbot', 'declined');
        engine.scriptedDialogue?.({
          title: 'Museum of the Rook',
          kicker: GREETERBOT.label,
          beats: [{ text: GREETERBOT.repeatDeclined, response: GREETERBOT.repeatDeclinedResponse }],
        });
      },
    });
    return true;
  }
  engine.setData('greeterbot', 'refused');
  engine.setData('midTowerLast', 'refused');
  engine.say(speaker || greeter, GREETERBOT.noQuestText, 6000);
  return true;
}

function drawGreeter(engine, room, street) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(textureFromUrl(GREETERBOT.art));
  sprite.anchor.set(0.5, 1);
  sprite.x = room.greeterbot.x - street.bounds.l;
  sprite.y = room.greeterbot.y - street.bounds.t;
  sprite.zIndex = 30;
  engine.entityLayer.addChild(sprite);
  views.push(sprite);
  greeter = engine.register({
    classId: GREETERBOT.classId,
    featureId: MID_TOWER_FEATURE_ID,
    label: GREETERBOT.label,
    subtitle: 'Museum docent',
    sprite,
  });
  return greeter;
}

/** The Hall door's lock: the corridors' door-sized lock overlay, drawn above the door sprite. */
function drawLock(engine, lock, street) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(textureFromUrl(`assets/decos/groddle/${lock.sprite}.png`));
  sprite.anchor.set(0.5, 1);
  sprite.x = lock.x - street.bounds.l;
  sprite.y = lock.y - street.bounds.t;
  sprite.width = lock.w;
  sprite.height = lock.h;
  sprite.zIndex = 4;
  sprite.eventMode = 'none';
  engine.entityLayer.addChild(sprite);
  views.push(sprite);
}

/** Teleporter boxes for the current street, screen space: { box, street, arrive, label }. */
function boxesFor(street) {
  const out = [];
  for (const b of street?.boxes || []) {
    if (b.teleport?.street && b.teleport.arrive) out.push({ id: b.id, box: b, street: b.teleport.street, arrive: b.teleport.arrive, label: b.teleport.label });
  }
  if (street?.tsid === STOOT_RETURN.tsid) {
    const to = midTowerRoomByTsid(STOOT_RETURN.to.tsid);
    out.push({
      id: 'stoot_return',
      box: boxToScreen(STOOT_RETURN.bounds, STOOT_RETURN.box),
      street: STOOT_RETURN.to.tsid,
      arrive: { x: STOOT_RETURN.to.x - to.bounds.l, y: STOOT_RETURN.to.y - to.bounds.t },
      label: to.label,
    });
  }
  return out;
}

async function teleport(engine, row) {
  const gate = engine.travelGate(row.street, { via: 'teleporter' });
  if (gate && gate.ok === false) return;
  teleporting = true;
  try {
    teleports += 1;
    engine.setData('midTowerTeleports', teleports);
    engine.setData('midTowerLast', `teleport:${row.id}`);
    engine.playSound?.('TELEPORT_AWAY', { volume: 0.5 });
    await engine.enter(row.street, { spawnX: row.arrive.x, spawnY: row.arrive.y });
    engine.pushActivity(row.street === MEZZANINE_TSID ? 'You slipped back under the Mezzanine floorboards.' : `You slipped through to ${row.label}.`);
    engine.save();
  } finally {
    teleporting = false;
  }
}

export const midTowerFeature = {
  id: MID_TOWER_FEATURE_ID,

  onStreetEnter(street, engine) {
    clear(engine);
    enteredAt = Date.now();
    const room = midTowerRoomByTsid(street?.tsid);
    engine.setData('midTowerRoom', room ? room.tsid : '');
    teleportBoxes = boxesFor(street);
    if (room?.hallLock) drawLock(engine, room.hallLock, street);
    if (room?.greeterbot) {
      drawGreeter(engine, room, street);
      engine.setData('greeterbot', 'waiting');
      const quest = engine.param('midtowerquest');
      const qs = engine.questState;
      if (quest === 'start' && qs) {
        assignQuest(qs, ROOK_HALL_START, { ignorePrereq: true });
      } else if (quest === 'done' && qs) {
        for (const id of [ROOK_HALL_START, ROOK_HALL]) if (!qs.completed.includes(id)) qs.completed.push(id);
      }
    }
  },

  onStreetClear(engine) {
    clear(engine);
  },

  verbsFor(target) {
    if (target?.classId !== GREETERBOT.classId || target !== greeter) return null;
    return [{ id: 'talk_to', label: 'Talk to', sort: 50, tooltip: 'Listen to what they have to say', enabled: true, reason: '', durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target !== greeter) return false;
    if (verbId === 'talk_to') greet(engine, target);
    return true;
  },

  /** The museum door is a street door (doors-feature draws it); its Enter asks the Greeterbot. */
  verbOverride(target) {
    if (target?.classId !== 'street_door' || target.door?.id !== MUSEUM_DOOR_ID) return null;
    return [{ id: MUSEUM_VERB, label: 'Enter', enabled: true, durationMs: 0, tooltip: 'Enter the Museum of the Rook' }];
  },

  runVerbOverride(target, verbId, engine) {
    if (verbId !== MUSEUM_VERB) return null;
    greet(engine, greeter || target);
    return true;
  },

  onTick(_dtMs, now, engine) {
    if (!teleportBoxes.length || teleporting || now - lastCheck < TELEPORT_CHECK_MS || !engine.player) return;
    lastCheck = now;
    if (Date.now() - enteredAt < ARRIVAL_GRACE_MS || engine.acting() || engine.questDialogueOpen()) return;
    const row = teleportBoxes.find((r) => insideBottomRect(r.box, engine.player.x, engine.player.y));
    if (row) teleport(engine, row);
  },

  /** QA / tests. */
  _state() {
    return { greeter: Boolean(greeter), boxes: teleportBoxes.map((r) => ({ id: r.id, street: r.street, box: r.box, arrive: r.arrive })), teleports };
  },
};
