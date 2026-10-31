/**
 * Street doors as a feature module (see js/feature-host.js).
 *
 * Rules live in js/doors.js; data comes from build-street-navigation.mjs
 * (`street.doors`, `street.boxes`). This file binds them to the world:
 * - Draws each visible door at its source rect with its recovered deco
 *   (assets/decos/groddle, CoU _png-2x), or a plain drawn door when the art
 *   was never recovered. Locked doors carry their key's CC0 icon, numbered
 *   doors a small plate. Hidden doors (client DoorView) are not drawn.
 * - Enter: the source door-move checks (destination, level, key). A failed
 *   check is spoken by the door, like the client's talking-door bubble.
 *   Locked doors use up one matching Door Key each time (inc_locked_doors.js).
 *   Arrival is the door's own connect x/y in the target street; random-
 *   destination doors (`destinations`) arrive at the street's usual spot
 *   because their Teleport Markers were lost.
 * - Every move asks the host travelGate first (Hell, Pooped) and stays shut
 *   inside transient instances and feature scenes, which keep their exits.
 * - Corridor One's key_drop box gives one Yellow-Purple Triangle Key per game
 *   day when none is in the pack ("You found a door key!").
 *
 * QA: ?autostart=1&doordemo=<street tsid> places the avatar at that street's
 * first visible door (&doorindex=N for another); &doorkey=N puts Door Key N
 * in the pack; &doorautoplay=1 enters it. Canvas data: doorCount,
 * doorLocked, doorDemo, doorLast, doorFrom, doorArrived, doorArrivedX,
 * doorKeyDrop.
 */

import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=85d4faba';
import { getGameDayKey } from '../game-day.js?v=3095e05b';
import { loadDecoManifest } from '../street-render.js?v=262c3652';
import {
  DOOR_KEYS,
  DOOR_KEY_BASE_COST,
  DOOR_KEY_STACK,
  DOOR_TEXT,
  KEY_DROP,
  checkDoorEntry,
  doorDestination,
  doorKeyClass,
  doorSubtitle,
  doorTooltip,
  drawnDoorStyle,
  keyDropDue,
  normalizeDoorState,
  visibleDoors,
} from '../doors.js?v=eb9510b1';
import { isLoaded, onLoaded, textureFromUrl } from '../textures.js?v=01a295a1';

export const DOORS_FEATURE_ID = 'doors';
const DECO_BASE = 'assets/decos/groddle/';
const DOOR_Z = 3;
const NO_EXIT = 'This place has its own way out. The door will have to wait.';
const UNLOCK_MS = 700;

let state = normalizeDoorState();
let views = []; // { door, sprite, extras: [], target }
let generation = 0;
let pending = null; // { at, door, dest, target }
let demo = { stage: 'idle', at: 0 };
let lastBoxCheck = 0;

const hasKeyIn = (engine) => (classTsid) => countItem(engine.inv, classTsid) > 0;

function publish(engine) {
  const doors = visibleDoors(engine.street);
  engine.setData('doorCount', doors.length);
  engine.setData('doorLocked', doors.filter((d) => d.is_locked).length);
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

function drawnDoorTexture(PIXI, door) {
  const w = Math.max(24, Math.round(door.w || 60));
  const h = Math.max(40, Math.round(door.h || 110));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const style = drawnDoorStyle(door.sprite);
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const r = Math.min(w / 2, h / 3);
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, r);
  g.arc(w / 2, r, w / 2, Math.PI, 0);
  g.lineTo(w, h);
  g.closePath();
  g.fillStyle = hex(style.frame);
  g.fill();
  const inset = Math.max(4, Math.round(w * 0.08));
  g.beginPath();
  g.moveTo(inset, h);
  g.lineTo(inset, r + inset * 0.3);
  g.arc(w / 2, r + inset * 0.3, w / 2 - inset, Math.PI, 0);
  g.lineTo(w - inset, h);
  g.closePath();
  g.fillStyle = hex(style.fill);
  g.fill();
  if (style.kind === 'door') {
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = Math.max(1, w * 0.02);
    for (const fx of [0.36, 0.64]) {
      g.beginPath();
      g.moveTo(w * fx, r + inset);
      g.lineTo(w * fx, h - inset);
      g.stroke();
    }
    g.fillStyle = '#e8cf7a';
    g.beginPath();
    g.arc(w * 0.74, h * 0.58, Math.max(2, w * 0.05), 0, Math.PI * 2);
    g.fill();
  }
  return PIXI.Texture.from(canvas);
}

function applyRect(sprite, door) {
  if (door.w > 0) sprite.width = door.w;
  if (door.h > 0) sprite.height = door.h;
  if (door.flip) sprite.scale.x = -Math.abs(sprite.scale.x);
}

function addExtra(engine, view, child) {
  child.zIndex = DOOR_Z + 1;
  child.eventMode = 'none';
  engine.entityLayer.addChild(child);
  view.extras.push(child);
}

function buildView(engine, door, available) {
  const { PIXI } = engine;
  // `src`: art rendered at the door's own size (Jethimadh Room 16's mouth, tools/room-art), over the deco.
  const hasArt = Boolean(door.src) || (door.sprite && available.has(door.sprite));
  const tex = door.src ? textureFromUrl(door.src) : hasArt ? textureFromUrl(`${DECO_BASE}${door.sprite}.png`) : drawnDoorTexture(PIXI, door);
  const sprite = new PIXI.Sprite(tex);
  sprite.anchor.set(0.5, 1);
  sprite.x = door.x;
  sprite.y = door.y;
  sprite.rotation = ((Number(door.r) || 0) * Math.PI) / 180;
  sprite.zIndex = DOOR_Z;
  sprite.roundPixels = true;
  applyRect(sprite, door);
  if (!isLoaded(tex.source)) onLoaded(tex.source, () => !sprite.destroyed && applyRect(sprite, door));
  sprite._worldHitW = Math.max(40, door.w || 60);
  sprite._worldHitH = Math.max(60, door.h || 110);
  engine.entityLayer.addChild(sprite);
  const view = { door, sprite, extras: [], target: null, art: hasArt ? 'deco' : 'drawn' };

  if (door.key_id && DOOR_KEYS[door.key_id]) {
    const badge = new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${doorKeyClass(door.key_id)}.png`));
    badge.anchor.set(0.5, 0.5);
    badge.x = door.x;
    badge.y = door.y - Math.max(40, (door.h || 110) * 0.62);
    badge.alpha = 0.92;
    addExtra(engine, view, badge);
  }
  if (door.house_number) {
    const plate = new PIXI.Text({ text: String(door.house_number), style: {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 13,
      fontWeight: '700',
      fill: 0xfff6dc,
      stroke: { color: 0x3a2a18, width: 3 },
    } });
    plate.anchor.set(0.5, 1);
    plate.x = door.x;
    plate.y = door.y - (door.h || 110) - 4;
    addExtra(engine, view, plate);
  }

  // A held instance's exit door belongs to the instance (a quest room registers its own Exit).
  if (door.instance_exit && engine.instanceHold) {
    views.push(view);
    return view;
  }
  view.target = engine.register({
    classId: 'street_door',
    featureId: DOORS_FEATURE_ID,
    label: doorTooltip(door),
    subtitle: doorSubtitle(door, { hasKey: hasKeyIn(engine) }) || 'A door',
    sprite,
    door,
  });
  views.push(view);
  return view;
}

function clearViews(engine) {
  for (const view of views) {
    if (view.target) engine.unregister(view.target);
    for (const child of view.extras) {
      if (child.parent) child.parent.removeChild(child);
      if (!child.destroyed) child.destroy();
    }
  }
  views = [];
}

/* ------------------------------------------------------------------ */
/* Entering                                                            */
/* ------------------------------------------------------------------ */

function refuse(engine, target, code, msg) {
  engine.setData('doorLast', code);
  engine.say(target, msg, 3200);
  engine.toast(msg);
  return true;
}

function enterDoor(engine, target) {
  const door = target?.door;
  if (!door || pending) return true;
  const dest = doorDestination(door, { current: engine.streetTsid });
  // Same-street doors only move the avatar, so they keep working inside a
  // feature instance (Mazza'la Gala's five rooms in a party space).
  const sameStreet = dest?.street && dest.street === engine.streetTsid;
  if ((engine.transientInstance() && !sameStreet) || engine.homeContext?.().inHome) return refuse(engine, target, 'instance', NO_EXIT);
  const check = checkDoorEntry(door, {
    level: Number(engine.pc?.level) || 1,
    hasKey: hasKeyIn(engine),
    destination: dest,
  });
  if (!check.ok) return refuse(engine, target, check.code, check.msg);
  const gate = engine.travelGate(dest.street, { via: 'door' });
  if (gate && gate.ok === false) return refuse(engine, target, 'gate', gate.msg || 'You cannot go through right now.');
  if (check.consumeKey) {
    removeItem(engine.inv, check.consumeKey, 1);
    state.keysUsed += 1;
    engine.refreshPack();
    engine.save();
  }
  engine.setData('doorLast', check.consumeKey ? 'unlocked' : 'open');
  // The client plays the door art's unlock() and waits a second before a locked move.
  pending = { at: Date.now() + (check.consumeKey ? UNLOCK_MS : 120), door, dest, target };
  const sprite = target.sprite;
  if (sprite && !sprite.destroyed) sprite.tint = 0xfff2c8;
  return true;
}

async function finishEnter(engine) {
  const { door, dest } = pending;
  pending = null;
  state.entered += 1;
  engine.setData('doorFrom', engine.streetTsid);
  const arrive = dest.arrive;
  if (dest.street === engine.streetTsid) {
    if (arrive && engine.player) {
      engine.player.x = arrive.x;
      engine.player.y = arrive.y;
      engine.player.vx = 0;
      engine.player.vy = 0;
      engine.snapCamera();
    }
  } else {
    await engine.enter(dest.street, arrive ? { spawnX: arrive.x, spawnY: arrive.y } : {});
  }
  engine.setData('doorArrived', engine.streetTsid);
  engine.setData('doorArrivedX', Math.round(engine.player?.x || 0));
  engine.save();
  return door;
}

/* ------------------------------------------------------------------ */
/* Corridor One key drop                                               */
/* ------------------------------------------------------------------ */

function checkKeyDrop(engine, now) {
  if (now - lastBoxCheck < 250 || !engine.player) return;
  lastBoxCheck = now;
  const street = engine.street;
  const day = getGameDayKey(now);
  const due = keyDropDue(state, {
    street: street?.tsid,
    boxes: street?.boxes,
    x: engine.player.x,
    y: engine.player.y,
    day,
    hasKey: countItem(engine.inv, doorKeyClass(KEY_DROP.key)) > 0,
  });
  if (!due) return;
  state.keyDropDay = day;
  addItem(engine.inv, doorKeyClass(KEY_DROP.key), 1);
  engine.pushActivity(DOOR_TEXT.foundKey);
  engine.floatText(engine.player.x, engine.player.y - 90, DOOR_TEXT.foundKey, 0xffe08a);
  engine.setData('doorKeyDrop', day);
  engine.refreshPack();
  engine.save();
}

/* ------------------------------------------------------------------ */
/* QA                                                                  */
/* ------------------------------------------------------------------ */

function demoStreet(engine) {
  const raw = engine.param('doordemo');
  if (!raw) return null;
  return raw === '1' ? 'GDOHDJ84BST2UI2' : raw;
}

function demoDoor(engine) {
  const doors = visibleDoors(engine.street);
  const at = Math.max(0, Math.min(doors.length - 1, Number(engine.param('doorindex')) || 0));
  return doors[at] || null;
}

function demoStep(engine, now) {
  const tsid = demoStreet(engine);
  if (!tsid || now < demo.at || demo.stage === 'done' || demo.stage === 'away') return;
  if (demo.stage === 'idle') {
    const key = Number(engine.param('doorkey'));
    if (DOOR_KEYS[key] && countItem(engine.inv, doorKeyClass(key)) < 1) {
      addItem(engine.inv, doorKeyClass(key), 1);
      engine.refreshPack();
    }
    if (!engine.streetExists(tsid)) {
      demo = { stage: 'done', at: 0 };
      engine.setData('doorDemo', 'unknown-street');
      return;
    }
    demo = { stage: 'away', at: 0 };
    engine.setData('doorDemo', 'travelling');
    engine.enter(tsid);
    return;
  }
  if (demo.stage === 'place') {
    const door = demoDoor(engine);
    if (!door) {
      demo = { stage: 'done', at: 0 };
      engine.setData('doorDemo', 'no-door');
      return;
    }
    engine.player.x = door.x;
    engine.player.y = door.y;
    engine.player.vx = 0;
    engine.player.vy = 0;
    engine.snapCamera();
    engine.setData('doorDemo', 'placed');
    demo = engine.param('doorautoplay') === '1' ? { stage: 'enter', at: now + 1500 } : { stage: 'done', at: 0 };
    return;
  }
  if (demo.stage === 'enter') {
    if (engine.busy()) return;
    const door = demoDoor(engine);
    const view = views.find((v) => v.door === door);
    demo = { stage: 'done', at: 0 };
    engine.setData('doorDemo', 'entered');
    if (view?.target) enterDoor(engine, view.target);
  }
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

export const doorsFeature = {
  id: DOORS_FEATURE_ID,

  init(engine) {
    for (const [id, key] of Object.entries(DOOR_KEYS)) {
      ensureItem(doorKeyClass(id), {
        label: key.label,
        desc: key.desc,
        baseCost: DOOR_KEY_BASE_COST,
        stackMax: DOOR_KEY_STACK,
        tags: ['key', 'no_rube'],
      });
    }
    if (demoStreet(engine)) engine.setData('doorDemo', 'idle');
  },

  save() {
    return state;
  },

  restore(slice) {
    state = normalizeDoorState(slice || {});
  },

  async onStreetEnter(street, engine) {
    const mine = ++generation;
    clearViews(engine);
    pending = null;
    const doors = visibleDoors(street);
    publish(engine);
    if (demo.stage === 'away' && street.tsid === engine.streetTsid && demoStreet(engine)) {
      const wanted = demoStreet(engine);
      if (engine.streetExists(wanted) && (street.tsid === wanted || street.tsid.slice(1) === wanted.slice(1))) {
        demo = { stage: 'place', at: Date.now() + 400 };
      }
    }
    if (!doors.length) return;
    const available = await loadDecoManifest();
    if (mine !== generation || engine.street !== street) return;
    for (const door of doors) buildView(engine, door, available);
    engine.setData('doorArt', views.map((v) => v.art).join(','));
  },

  onStreetClear(engine) {
    generation += 1;
    clearViews(engine);
  },

  onTick(_dtMs, now, engine) {
    if (!engine.started) return;
    if (pending && now >= pending.at) {
      finishEnter(engine);
      return;
    }
    demoStep(engine, now);
    if (engine.street?.tsid === KEY_DROP.street) checkKeyDrop(engine, now);
  },

  verbsFor(target, engine) {
    const door = target?.door;
    if (!door) return [];
    target.subtitle = doorSubtitle(door, { hasKey: hasKeyIn(engine) }) || 'A door';
    return [{
      id: 'enter',
      label: 'Enter',
      enabled: !pending,
      durationMs: 0,
      tooltip: doorTooltip(door),
    }];
  },

  runVerb(target, verbId, engine) {
    if (verbId !== 'enter') return false;
    return enterDoor(engine, target);
  },
};
