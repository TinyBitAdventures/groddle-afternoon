/**
 * Door Drink (js/door-drink.js) as a feature module (G123, config
 * portal_group).
 *
 *  - Pack verb Pour on a Door Drink: a 2.5 s locking pour, then a
 *    Hyperspacetime Portal Door stands at your feet (nudged off a signpost)
 *    and the bottle loses one of its three uses.
 *  - Doors are saved with the portal group and drawn on whichever street
 *    they stand. Enter (E) opens the door and takes you to the door it is
 *    paired with: your newest door leads to the one before it and back.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&doordrinkdemo=1 puts
 *     two Door Drinks in the pack (click one, Pour).
 *     &doordrinkautoplay=pour pours one where you stand;
 *     =pair pours here, travels to Sylvan Grove, pours there, then enters
 *     the new door and comes back through it (&doordrinkhold=1 stops before
 *     entering). Canvas: doorDrinkPortals, doorDrinkActive, doorDrinkUses,
 *     doorDrinkLast, doorDrinkPour, doorDrinkHere, doorDrinkAutoplay.
 */

import { ITEM_CATALOG, ensureItem } from '../inventory.js?v=catalog-unified-3';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js';
import {
  CLOSE_AFTER_MS,
  DOOR_DRINK,
  DOOR_DRINK_COPY,
  DOOR_DRINK_USES,
  OPEN_MS,
  PORTAL_CLASS,
  PORTAL_LABEL,
  PORTAL_SHEET,
  POUR_MS,
  addPortal,
  bumpDropLocation,
  canEnter,
  canPour,
  createPortalGroup,
  normalizePortalGroup,
  portalsOn,
  prunePortals,
  useDoorDrink,
} from '../door-drink.js';

export const DOOR_DRINK_FEATURE_ID = 'door-drink';
const NARAKA_HUB_ID = '40';
const DEMO_AWAY_STREET = 'GCR10NQRPKJ16H6'; // Sylvan Grove, Groddle Forest

let group = createPortalGroup();
let last = '';
let pouring = null; // { at, fx }
let frames = null;
/** Doors drawn on this street: id -> { target, sprite, mode, modeAt, closeAt, travel } */
const views = new Map();
let demo = null;
let auto = null; // { step, at }
let pruneAt = 0;

function cutFrames(PIXI) {
  if (frames) return frames;
  const base = sourceFromUrl(PORTAL_SHEET.url);
  const all = [];
  for (let i = 0; i < 37; i += 1) {
    const c = i % PORTAL_SHEET.cols;
    const r = Math.floor(i / PORTAL_SHEET.cols);
    all.push(frameTexture(base, new PIXI.Rectangle(c * PORTAL_SHEET.cellW, r * PORTAL_SHEET.cellH, PORTAL_SHEET.cellW, PORTAL_SHEET.cellH)));
  }
  frames = all;
  return frames;
}

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('doorDrinkPortals', Object.entries(group.portals).map(([id, p]) => `${id}@${p.tsid}:${p.x},${p.y}->${p.target ? p.target.tsid : 'none'}`).join(';') || 'none');
  engine.setData('doorDrinkActive', group.active || 'none');
  engine.setData('doorDrinkUses', String(group.bottleUses));
  engine.setData('doorDrinkLast', last || 'none');
  engine.setData('doorDrinkPour', pouring ? 'pouring' : 'idle');
  engine.setData('doorDrinkHere', [...views.keys()].join(',') || 'none');
}

function say(engine, msg, ok = true) {
  if (!msg) return;
  last = msg;
  engine.pushActivity?.(msg);
  engine.toast?.(msg, ok ? 3200 : 2600);
}

function pourContext(engine) {
  const home = engine.homeContext?.() || {};
  return {
    inHome: Boolean(home.inHome),
    inInstance: Boolean(engine.transientInstance?.() || engine.inScene?.()),
    inHell: String(engine.street?.hubId || '') === NARAKA_HUB_ID,
  };
}

/* ------------------------------------------------------------- doors */

function spawnDoor(engine, id, portal) {
  const { PIXI } = engine;
  if (!PIXI || views.has(id) || !engine.entityLayer) return;
  const f = cutFrames(PIXI);
  const sprite = new PIXI.Sprite(f[PORTAL_SHEET.closed[0]]);
  sprite.anchor.set(0.5, 0.99);
  sprite.scale.set(PORTAL_SHEET.scale);
  sprite.x = portal.x;
  sprite.y = portal.y;
  sprite.zIndex = 20;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  engine.entityLayer.addChild(sprite);
  const target = engine.register({
    classId: PORTAL_CLASS,
    featureId: DOOR_DRINK_FEATURE_ID,
    label: PORTAL_LABEL,
    portalId: id,
    sprite,
  });
  views.set(id, { target, sprite, mode: 'closed', modeAt: 0, closeAt: 0, travel: null });
}

function removeDoor(engine, id) {
  const v = views.get(id);
  if (!v) return;
  views.delete(id);
  engine.unregister?.(v.target);
  if (v.sprite && !v.sprite.destroyed) v.sprite.destroy();
}

function syncDoors(engine) {
  const here = new Set(portalsOn(group, engine.streetTsid).map((p) => p.id));
  for (const id of [...views.keys()]) if (!here.has(id)) removeDoor(engine, id);
  for (const p of portalsOn(group, engine.streetTsid)) spawnDoor(engine, p.id, p);
}

function frameFor(v, now) {
  const age = now - v.modeAt;
  const pick = (list, ms) => list[Math.min(list.length - 1, Math.floor((age / ms) * list.length))];
  if (v.mode === 'opening') return pick(PORTAL_SHEET.opening, OPEN_MS);
  if (v.mode === 'open') return PORTAL_SHEET.open[Math.floor(age / 66) % PORTAL_SHEET.open.length];
  if (v.mode === 'closing') return pick(PORTAL_SHEET.closing, OPEN_MS);
  return PORTAL_SHEET.closed[0];
}

function setMode(v, mode, now) {
  v.mode = mode;
  v.modeAt = now;
}

function tickDoors(engine, now) {
  if (!frames) return;
  for (const v of views.values()) {
    if (v.mode === 'opening' && now - v.modeAt >= OPEN_MS) {
      setMode(v, 'open', now);
      v.closeAt = now + CLOSE_AFTER_MS;
      if (v.travel) {
        const t = v.travel;
        v.travel = null;
        travel(engine, t);
      }
    } else if (v.mode === 'open' && v.closeAt && now >= v.closeAt) {
      setMode(v, 'closing', now);
    } else if (v.mode === 'closing' && now - v.modeAt >= OPEN_MS) {
      setMode(v, 'closed', now);
    }
    if (v.sprite && !v.sprite.destroyed) v.sprite.texture = frames[frameFor(v, now)];
  }
}

function travel(engine, target) {
  const gate = engine.travelGate?.(target.tsid) || { ok: true };
  if (gate.ok === false) return say(engine, gate.msg, false);
  if (engine.streetExists && !engine.streetExists(target.tsid)) return say(engine, DOOR_DRINK_COPY.noDestination, false);
  engine.playSound?.('TELEPORT_AWAY', { volume: 0.5 });
  last = `entered:${target.tsid}`;
  engine.enter(target.tsid, { spawnX: target.x, spawnY: target.y, teleport: true });
}

/** portal.js openDoor. */
function enterDoor(engine, id) {
  const portal = group.portals[id];
  const check = canEnter(portal);
  if (!check.ok) return say(engine, check.msg, false), true;
  const v = views.get(id);
  const now = Date.now();
  if (v && v.mode !== 'open') {
    setMode(v, 'opening', now);
    v.travel = check.target;
  } else {
    travel(engine, check.target);
  }
  return true;
}

/* -------------------------------------------------------------- pour */

function pourFx(engine) {
  const { PIXI } = engine;
  const p = engine.player;
  if (!PIXI || !p || !engine.fxLayer) return null;
  const bottle = new PIXI.Sprite(textureFromUrl(ITEM_CATALOG[DOOR_DRINK]?.icon || `assets/sprites/icons/${DOOR_DRINK}.png`));
  bottle.anchor.set(0.5);
  bottle.zIndex = 9000;
  engine.fxLayer.addChild(bottle);
  return { bottle, age: 0 };
}

function tickPourFx(fx, engine, dtMs) {
  if (!fx || fx.bottle.destroyed) return;
  fx.age += dtMs;
  const p = engine.player;
  if (p) {
    fx.bottle.x = p.x;
    fx.bottle.y = (p.y || 0) - 135;
  }
  const k = Math.min(1, fx.age / POUR_MS);
  fx.bottle.rotation = 0.9 * Math.min(1, k * 3) + Math.sin(fx.age / 140) * 0.2;
  fx.bottle.alpha = k > 0.88 ? (1 - k) / 0.12 : 1;
}

function stopPourFx() {
  if (pouring?.fx?.bottle && !pouring.fx.bottle.destroyed) pouring.fx.bottle.destroy();
}

function startPour(engine) {
  if (pouring) return say(engine, 'You are already pouring a potion.', false), true;
  if (!((Number(engine.inv?.[DOOR_DRINK]) || 0) >= 1)) return true;
  const check = canPour(pourContext(engine));
  if (!check.ok) return say(engine, check.msg, false), true;
  engine.playSound?.('POTION_GENERIC', { volume: 0.6 });
  pouring = { at: Date.now() + POUR_MS, fx: pourFx(engine), tsid: engine.streetTsid };
  publish(engine);
  return true;
}

/** potion_base onPourComplete -> potion_chris onPour -> groups/portal.js create_portal. */
export function completePour(engine, now = Date.now()) {
  const p = engine.player;
  const check = canPour(pourContext(engine));
  if (!p || !check.ok) return say(engine, check.msg || DOOR_DRINK_COPY.cantPour, false), null;
  const used = useDoorDrink(group, engine.inv);
  if (!used.ok) return null;
  const b = engine.street?.bounds || { l: 0, t: 0 };
  const signposts = (engine.street?.signposts || []).map((s) => ({ x: s.x, y: s.y }));
  const spot = bumpDropLocation(p.x + b.l, (p.y || 0) + b.t, signposts);
  const id = addPortal(group, { tsid: engine.streetTsid, x: spot.x - b.l, y: spot.y - b.t }, now);
  engine.achievement?.(`potions_used:${DOOR_DRINK}`, 1);
  // items/item.js notifyVerb on success.
  engine.achievement?.(`${DOOR_DRINK}:pour`, 1);
  engine.achievement?.(`VERB:pour:${DOOR_DRINK}`, 1);
  say(engine, DOOR_DRINK_COPY.poured);
  syncDoors(engine);
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return id;
}

function tickPour(engine, now, dtMs) {
  if (!pouring) return;
  tickPourFx(pouring.fx, engine, dtMs);
  if (now < pouring.at) return;
  const same = pouring.tsid === engine.streetTsid;
  stopPourFx();
  pouring = null;
  if (same) completePour(engine, now);
  publish(engine);
}

/* --------------------------------------------------------------- QA */

function demoSetup(engine) {
  if (demo || !engine.param?.('doordrinkdemo')) return;
  demo = { home: engine.streetTsid };
  if ((Number(engine.inv[DOOR_DRINK]) || 0) < 2) engine.inv[DOOR_DRINK] = 2;
  engine.refreshPack?.();
  const mode = engine.param('doordrinkautoplay');
  if (mode) auto = { step: mode === 'pair' ? 'pour1' : 'pour', at: Date.now() + 1500 };
}

function autoplay(engine, now) {
  if (!auto || now < auto.at || engine.busy?.({ ignoreHome: true }) && auto.step !== 'wait-away') return;
  const step = auto.step;
  const set = (s, ms) => {
    auto = { step: s, at: now + ms };
    engine.setData?.('doorDrinkAutoplay', step);
  };
  if (step === 'pour' || step === 'pour1') {
    startPour(engine);
    return set(step === 'pour' ? 'done' : 'travel', POUR_MS + 900);
  }
  if (step === 'travel') {
    engine.enter(DEMO_AWAY_STREET);
    return set('wait-away', 3500);
  }
  if (step === 'wait-away') {
    if (engine.streetTsid !== DEMO_AWAY_STREET) return set('wait-away', 500);
    return set('pour2', 800);
  }
  if (step === 'pour2') {
    startPour(engine);
    return set(engine.param('doordrinkhold') ? 'done' : 'enter', POUR_MS + 1200);
  }
  if (step === 'enter') {
    if (group.active) enterDoor(engine, group.active);
    return set('done', 0);
  }
  auto = null;
  engine.setData?.('doorDrinkAutoplay', 'done');
}

/* ----------------------------------------------------------- feature */

export const doorDrinkFeature = {
  id: DOOR_DRINK_FEATURE_ID,

  init(engine) {
    ensureItem(PORTAL_CLASS, { label: PORTAL_LABEL, sellable: false, donatable: false });
    publish(engine);
  },

  onStreetEnter(street, engine) {
    demoSetup(engine);
    prunePortals(group, Date.now());
    syncDoors(engine);
    publish(engine);
  },

  onStreetClear() {
    // The world's entities are destroyed with the street; drop the references.
    views.clear();
    if (pouring) {
      stopPourFx();
      pouring = null;
    }
  },

  onTick(dtMs, now, engine) {
    autoplay(engine, now);
    tickPour(engine, now, dtMs);
    tickDoors(engine, now);
    if (now >= pruneAt) {
      pruneAt = now + 500;
      if (prunePortals(group, now).length) {
        syncDoors(engine);
        engine.save?.();
        publish(engine);
      }
    }
  },

  /** potion_base pour is a locking overlay. */
  physics() {
    return pouring ? { speed: 0, jump: 0 } : null;
  },

  verbsFor(target) {
    if (target?.classId !== PORTAL_CLASS) return null;
    const check = canEnter(group.portals[target.portalId]);
    return [{ id: 'enter', label: 'Enter', enabled: check.ok, reason: check.ok ? '' : check.msg, tooltip: DOOR_DRINK_COPY.enterTooltip }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== PORTAL_CLASS || verbId !== 'enter') return false;
    return enterDoor(engine, target.portalId);
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== DOOR_DRINK) return [];
    const check = canPour(pourContext(engine));
    const uses = `${group.bottleUses} of ${DOOR_DRINK_USES} left`;
    return [{
      id: 'pour',
      label: 'Pour',
      enabled: check.ok && !pouring,
      reason: check.ok ? (pouring ? 'You are already pouring a potion.' : '') : check.msg,
      tooltip: `${DOOR_DRINK_COPY.pourTooltip} · ${uses}`,
      primary: true,
    }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== DOOR_DRINK || verbId !== 'pour') return false;
    return startPour(engine);
  },

  save() {
    return group;
  },

  restore(slice) {
    group = normalizePortalGroup(slice || {});
  },

  /** QA / tests. */
  _state() {
    return { group, pouring, views, last };
  },
  _reset() {
    group = createPortalGroup();
    last = '';
    pouring = null;
    views.clear();
    demo = null;
    auto = null;
    pruneAt = 0;
  },
  _enterDoor: enterDoor,
};
