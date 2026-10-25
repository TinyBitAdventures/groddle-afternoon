/**
 * Craftybot as a feature module (see js/feature-host.js). Rules live in
 * js/craftybot.js; this file binds them to the home, the pack and the panel.
 *
 * Source map:
 *  - Delivery: locations/location.js onPlayerEnter 128-156 puts a "Special
 *    One-Time Delivery" (butler_box, state 'craftybot') 124 px left of the
 *    Magic Rock, on the platform under it, when the owner enters their house
 *    (`!this.is_public && pc == this.owner`) without a Crafty Bot: the yard
 *    rock (inc_homes.js homes_demo_backyard 2354, x -29), so the box stands
 *    in the back yard at x -153 (G232; it used to stand on the home street,
 *    in front of the house's wall art). Read label runs
 *    butler_box.js read_label_craftybot (five beats); Open puffs the box
 *    (proto_puff) and player.js createCraftybot makes the bot 750 ms later at
 *    the box's x: "All hail the Craftybot."
 *  - The bot (items/npc_crafty_bot.js): verbs install a crystal, kick, pick up,
 *    refuel (one Fuel Cell, +500), craft (opens the job panel); in the pack:
 *    craft, refuel, install a crystal, kick, drop (canDrop: only inside the
 *    house). Teach and Stop Crafting are disabled in the source.
 *  - Where it stands decides its ingredient source: on the home street or in
 *    the house it fetches dropped stacks (and Storage Display Boxes indoors)
 *    by walking to them; in the pack it uses the pack and cannot run machines.
 *  - The panel follows the client's CraftyDialog: the job queue with the
 *    active job pinned on top, Which tool? / Which recipe? (known recipes,
 *    no furniture, no machine recipes), the job details ("To make this I'll
 *    need to..."), Pause / Edit / Remove / Collect, and the footer with
 *    crystals, Queue Size and the fuel gauge (Add More walks to a Fuel Cell).
 *
 * QA (with ?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=home):
 *   &craftybotdemo=box     the delivery box by the yard's Magic Rock (with
 *                          homedemo=interior; &homex=-200 stands beside it)
 *   &craftybotdemo=bot     the bot already out, Cherries and a Fruit Changing
 *                          Machine dropped on the home street
 *   &craftybotdemo=pack    the bot in the pack with Cherries and the machine
 *   &craftybotdemo=fuel    the bot out with 6 fuel left (halts mid-job)
 *   &craftybotautoplay=1   box: read, open, drop the ingredients, queue 3 Apples,
 *                          wait, Collect; bot/pack/fuel: queue and run that job
 *                          (=hold stops before Collect)
 *   &craftybotspeed=N      run the bot's clock N times faster (QA only)
 * Canvas data: craftybotState, craftybotWhere, craftybotX, craftybotAnim,
 *   craftybotCraftState, craftybotFuel, craftybotCrystals, craftybotQueue,
 *   craftybotPanel, craftybotLast, craftybotAutoplay.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, itemIcon, removeItem } from '../inventory.js?v=catalog-unified-6';
import { canUseTool, getToolCondition, setToolRemaining } from '../tools.js?v=woodcutting-test-2';
import { MAKING_TOOL_SKILLS, listRecipes, recipeKnown, TOOL_CATALOG } from '../making.js?v=g268-1';
import { listDroppedStacks } from '../world-items.js?v=world-items-3';
import { homeStreetLayout } from '../home-cultivation.js?v=home-cultivation-3';
import { BACK_YARD_GROUND_Y, homesFeature } from './homes-feature.js?v=homes-19';
import {
  CRAFTYBOT,
  CRAFTYBOT_BOX,
  CRAFTYBOT_COPY,
  activeLine,
  advanceCraftybot,
  autoRefuel,
  canAutoRefuel,
  collectJob,
  costCheck,
  craftybotSpec,
  craftybotView,
  createBot,
  createCraftybotState,
  installCrystal,
  installCrystalCheck,
  isCrafting,
  kick,
  moveX,
  noticeSourceChange,
  normalizeCraftybotState,
  onMoved,
  peek,
  queueRemove,
  queueSize,
  queueSizeMax,
  rebuildAll,
  refuelCheck,
  refuelFromCells,
  serializeCraftybotState,
  setCraftybotSpecs,
  setJobTotal,
  setLocked,
  setPaused,
} from '../craftybot.js?v=craftybot-1';
import { frameTexture, isLoaded, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js';
import { grantMoodXp } from '../mood-xp.js';
import { displayTopOf, itemstackOverlayPoint, playSheetOverlay } from '../overlay-art.js?v=g251-1';

export const CRAFTYBOT_FEATURE_ID = 'craftybot';
const HOME_STREET_TSID = 'RH_HOME_EXT';
const HOME_INTERIOR_TSID = 'RH_HOME_INT';
const BOT = CRAFTYBOT.CLASS;
const BOX = CRAFTYBOT_BOX.CLASS;
const SPECS_URL = 'assets/content/craftybot-specs.json?v=craftybot-2';
const ART = 'assets/sprites/craftybot/';
/**
 * OGA npc_crafty_bot__x1_* sheets (137x140 cells, one registration point;
 * labels from npc_crafty_bot.swf), every cell cropped to the shared 128x129
 * box at (9, 11) that holds all of the art, so the 3x renders fit the budget.
 * The body's centre is x 76 and the feet y 137 in the original cell.
 */
const CELL = { w: 128, h: 129 };
const ANCHOR = { x: (76 - 9) / 128, y: (137 - 11) / 129 };
const CLIPS = {
  idle0: { file: 'craftybot_idle0.webp', cols: 1, frames: 1, loop: true },
  walk: { file: 'craftybot_walk.webp', cols: 6, frames: 29, loop: true },
  collapse: { file: 'craftybot_collapse.webp', cols: 7, frames: 97, loop: false },
  craftStart: { file: 'craftybot_craftStart.webp', cols: 7, frames: 13, loop: false },
  craftEnd: { file: 'craftybot_craftEnd.webp', cols: 6, frames: 17, loop: false },
  expand: { file: 'craftybot_expand.webp', cols: 7, frames: 93, loop: false },
  sleepMode: { file: 'craftybot_sleepMode.webp', cols: 1, frames: 1, loop: true },
  peek: { file: 'craftybot_peek.webp', cols: 7, frames: 75, loop: false },
  idle1: { file: 'craftybot_idle1.webp', cols: 7, frames: 60, loop: false },
  idle2: { file: 'craftybot_idle2.webp', cols: 7, frames: 61, loop: false },
};
/** The SWF's 'craft' label is two frames of the open cube; the OGA set has no sheet for it, so hold craftStart's last frame. */
const ANIM_CLIP = { craft: 'craftStart', idle0: 'idle0', iconic: 'idle0', iconic_craft: 'craftStart' };
const FPS = 30;
const BOX_ART = `${ART}butler_box_craftybot.png`;
/** butler_box.swf root frame 2 ('craftybot') at zoom 3; js/textures.js reads resolution 3 from the name. */
const BOX_ART_3X = `${ART}butler_box_craftybot@3x.png`;
const OVERLAY_MS = 2500;

let bot = createCraftybotState();
let engineRef = null;
let specsReady = false;
let specsPromise = null;
let view = null; // { room, box, botSprite, target, ... }
let panel = null;
let panelState = { view: 'jobs', tool: null, item: null, qty: 1, editing: false, confirm: null, search: '', scrollTop: 0 };
let label = null; // the box label dialog
let lastSig = null;
let lastSigAt = 0;
let lastPanelKey = '';
let lastPanelAt = 0;
let simNow = 0;
let realLast = 0;
let lastMsg = '';
let lastSaveAt = 0;
let demo = null;
let autoplay = null;
let pendingOpenAt = 0;
let frameCache = new Map();

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

function ensureItems() {
  ensureItem(BOT, {
    label: 'Crafty Bot',
    namePlural: 'Crafty Bots',
    desc: 'A robot that can make stuff for you.',
    icon: itemIcon(BOT),
    stackMax: 1,
    baseCost: 0,
    sellable: false,
    donatable: false,
    tags: ['no_rube', 'no_trade', 'no_bag', 'no_drop'],
  });
}

function labelFor(cls, n = 1) {
  const meta = ITEM_CATALOG[cls];
  const single = meta?.label || TOOL_CATALOG[cls]?.label || String(cls).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const plural = meta?.namePlural || (single.endsWith('s') ? single : `${single}s`);
  const article = /^[aeiou]/i.test(single) ? 'an' : 'a';
  return { single, plural, article, n };
}

function itemName(cls, n = 1) {
  const l = labelFor(cls, n);
  return n === 1 ? l.single : l.plural;
}

function loadSpecs() {
  if (specsPromise) return specsPromise;
  specsPromise = fetch(SPECS_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      setCraftybotSpecs(json?.specs || {});
      specsReady = true;
      return true;
    })
    .catch(() => {
      specsReady = false;
      return false;
    });
  return specsPromise;
}

/* ------------------------------------------------------------------ */
/* The ingredient source (world adapter for js/craftybot.js)            */
/* ------------------------------------------------------------------ */

/** G226: move a bot standing in `room` (and its walk) by dx. Pure; true when it moved. */
export function shiftBotX(state, room, dx) {
  if (!state?.owned || state.where !== room || !Number.isFinite(dx) || !dx) return false;
  state.x = Math.round((Number(state.x) || 0) + dx);
  if (Number.isFinite(state.xNow)) state.xNow += dx;
  if (state.move) {
    state.move.fromX += dx;
    state.move.toX += dx;
  }
  return true;
}

function homeTsid(where) {
  return where === 'interior' ? HOME_INTERIOR_TSID : HOME_STREET_TSID;
}

function interiorDecor() {
  return homesFeature._state?.()?.houseDecor || null;
}

function locationRows(engine, where) {
  const tsid = homeTsid(where);
  const rows = listDroppedStacks(engine.droppedItems, tsid).map((s) => ({ id: s.id, cls: s.classTsid, count: s.count, x: s.x, sdb: false }));
  if (where === 'interior') {
    // G226: furniture sits in room x; the bot and the dropped stacks in world x.
    const x0 = homesFeature.roomWorldX?.() || 0;
    for (const p of interiorDecor()?.placed || []) {
      if (p.classTsid === 'bag_furniture_sdb' && p.display?.count > 0) {
        rows.push({ id: `sdb:${p.id}`, cls: p.display.classTsid, count: p.display.count, x: x0 + p.x, sdb: true });
      }
    }
  }
  return rows;
}

function toolUsable(engine, cls, wear) {
  if (!getToolCondition(engine.toolState, cls).tracked) return true;
  return canUseTool(engine.toolState, cls, Math.max(0, Number(wear) || 0)).ok;
}

function isToolClass(cls) {
  return Boolean(TOOL_CATALOG[cls]) || getToolCondition(null, cls).tracked;
}

function makeWorld(engine) {
  const where = bot.where;
  const inLocation = where !== 'pack';
  let dirty = false;
  const tsid = homeTsid(where);
  const rows = () => (inLocation ? locationRows(engine, where) : null);
  const usable = (cls, toolWear) => !isToolClass(cls) || toolUsable(engine, cls, toolWear);
  const world = {
    inLocation,
    count(cls, { toolWear } = {}) {
      let n = 0;
      for (const c of String(cls).split('|')) {
        if (!usable(c, toolWear)) continue;
        if (inLocation) n += rows().filter((r) => r.cls === c).reduce((s, r) => s + r.count, 0);
        else n += countItem(engine.inv, c);
      }
      return n;
    },
    find(cls, { toolWear } = {}) {
      for (const c of String(cls).split('|')) {
        if (!usable(c, toolWear)) continue;
        if (!inLocation) {
          if (countItem(engine.inv, c) > 0) return { id: c, cls: c, x: bot.x };
          continue;
        }
        const list = rows().filter((r) => r.cls === c && r.count > 0);
        // findItem: Storage Display Boxes first, then anywhere else.
        const pick = list.filter((r) => r.sdb).sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x))[0]
          || list.sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x))[0];
        if (pick) return { id: pick.id, cls: pick.cls, x: pick.x };
      }
      return null;
    },
    take(id, cls, n) {
      n = Math.max(0, Math.floor(n));
      if (!n) return 0;
      if (!inLocation) {
        const have = countItem(engine.inv, id);
        const k = Math.min(have, n);
        if (k > 0) removeItem(engine.inv, id, k);
        if (k > 0) engine.refreshPack?.();
        return k;
      }
      if (String(id).startsWith('sdb:')) {
        const row = interiorDecor()?.placed?.find((p) => `sdb:${p.id}` === id);
        if (!row?.display) return 0;
        const k = Math.min(row.display.count, n);
        row.display.count -= k;
        if (row.display.count <= 0) delete row.display;
        dirty = 'sdb';
        return k;
      }
      const list = engine.droppedItems?.streets?.[tsid];
      const i = Array.isArray(list) ? list.findIndex((r) => r.id === id) : -1;
      if (i < 0) return 0;
      const row = list[i];
      const k = Math.min(row.count, n);
      row.count -= k;
      if (row.count <= 0) list.splice(i, 1);
      if (!list.length) delete engine.droppedItems.streets[tsid];
      dirty = dirty || 'ground';
      return k;
    },
    wear(cls, n) {
      const c = getToolCondition(engine.toolState, cls);
      if (!c.tracked) return { broke: false };
      // wearTool: points_remaining > wear subtracts; otherwise the tool hits 0 and breaks.
      if (c.remaining > n) {
        setToolRemaining(engine.toolState, cls, c.remaining - n);
        return { broke: false };
      }
      setToolRemaining(engine.toolState, cls, 0);
      return { broke: true };
    },
    drop(cls, n, x) {
      if (!inLocation) {
        addItem(engine.inv, cls, n);
        engine.refreshPack?.();
        return;
      }
      const state = engine.droppedItems;
      if (!state) return;
      state.streets[tsid] ||= [];
      state.streets[tsid].push({ id: `world-item-${state.nextId++}`, streetTsid: tsid, classTsid: cls, count: n, x: Math.round(x), y: engine.groundY || 620, droppedAt: Date.now() });
      dirty = dirty || 'ground';
    },
    give(cls, n) {
      addItem(engine.inv, cls, n);
      engine.refreshPack?.();
    },
    imagination(n) {
      const k = Math.floor(n);
      if (k <= 0) return;
      // npc_crafty_bot.js 1132: stats_add_xp(count / 20, false) takes the mood bonus.
      grantMoodXp(engine.pc, k);
      engine.updateHud?.();
    },
    fuelCell() {
      return inLocation ? world.find('fuel_cell') : null;
    },
    // sendBubble: only seen when you are next to the bot.
    say(text, ms = 4000) {
      lastMsg = text;
      if (view?.target && view.room === where) engine.say(view.target, text, ms);
    },
    // sendCraftyMessage from the pack: a "From Crafty-bot" prompt; prompts_add_simple: a passing notice.
    prompt(text, title) {
      lastMsg = text;
      if (title) engine.prompt({ kicker: title, title: 'Craftybot', text });
      else {
        engine.toast?.(text, 5000);
        engine.pushActivity?.(text);
      }
    },
    sound(key) {
      if (view?.room === where || !inLocation) engine.playSound?.(key, { volume: 0.6 });
    },
    stopSound() {},
    overlay(cls) {
      if (view?.room === where) showOverlay(engine, cls);
    },
    crafted(cls, n) {
      engine.achievement?.(`craftybot_crafted:${cls}`, n);
    },
    flush() {
      if (!dirty) return;
      if (dirty === 'sdb') {
        engine.save?.();
        if (view?.room === 'interior') engine.refreshHomeScene?.();
      } else if (view?.room === where) engine.droppedItemsChanged?.();
      else engine.save?.();
      dirty = false;
    },
  };
  return world;
}

/** Item counts in the bot's source, to notice new arrivals (onContainerItemAdded). */
function sourceCounts(engine) {
  const out = {};
  if (bot.where === 'pack') {
    for (const [k, v] of Object.entries(engine.inv || {})) if (v > 0 && k !== BOT) out[k] = v;
  } else {
    for (const r of locationRows(engine, bot.where)) out[r.cls] = (out[r.cls] || 0) + r.count;
  }
  return out;
}

function checkSource(engine) {
  const counts = sourceCounts(engine);
  if (lastSig) {
    let added = false;
    for (const [k, v] of Object.entries(counts)) {
      const before = lastSig[k] || 0;
      if (v > before) {
        if (bot.dropped[k]) delete bot.dropped[k];
        else added = true;
      }
    }
    if (added && bot.queue.length) noticeSourceChange(bot);
  }
  lastSig = counts;
}

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

function speed(engine) {
  const n = Number(engine.param('craftybotspeed'));
  return Number.isFinite(n) && n > 0 ? Math.min(200, n) : 1;
}

function now(engine) {
  const real = Date.now();
  if (!realLast) {
    realLast = real;
    simNow = Math.max(real, bot.clock || 0);
  }
  simNow += (real - realLast) * speed(engine);
  realLast = real;
  return simNow;
}

/** Run the bot to `t` against the current source, then persist what it moved. */
function step(engine, t = now(engine)) {
  if (!bot.owned || !specsReady) return;
  const world = makeWorld(engine);
  const fired = advanceCraftybot(bot, t, world);
  world.flush();
  // Keep the bot's progress saved with what it took from the floor or the pack.
  if (fired > 0 && performance.now() - lastSaveAt > 1000) {
    lastSaveAt = performance.now();
    engine.save?.();
  }
}

/** Run a panel/verb action at the current time (the bot first catches up). */
function act(engine, fn) {
  const t = now(engine);
  const world = makeWorld(engine);
  advanceCraftybot(bot, t, world);
  const out = fn(world);
  world.flush();
  // The action may have moved the bot (pick up / drop), so run on with a fresh source.
  const after = makeWorld(engine);
  advanceCraftybot(bot, t, after);
  after.flush();
  engine.save?.();
  lastSaveAt = performance.now();
  renderPanel(engine, true);
  publish(engine);
  return out;
}

/* ------------------------------------------------------------------ */
/* World view                                                          */
/* ------------------------------------------------------------------ */

function currentRoom(engine) {
  const ctx = engine.homeContext?.();
  if (!ctx?.inHome) return null;
  if (engine.streetTsid === HOME_STREET_TSID) return 'street';
  if (engine.streetTsid === HOME_INTERIOR_TSID && homesFeature._state?.()?.scene?.tower == null) return 'interior';
  return null;
}

/** The house's left end in interior world x (the back yard is left of it). */
function houseLeftX() {
  return homesFeature.roomWorldX?.() || 0;
}

/**
 * G232: the yard rock's x in the house (inc_homes.js 2354: -29 from the
 * house's left end, homes-feature YARD_ROCK).
 */
function yardRockX(engine) {
  const rock = engine.interactables?.find((t) => t.classId === 'magic_rock' && t.state?.room === 'yard' && t.sprite && !t.sprite.destroyed);
  return rock ? rock.sprite.x : houseLeftX() - 29;
}

/** location.js 147-148: the box at the rock's x - 124. */
function boxX(engine) {
  return Math.round(yardRockX(engine) + CRAFTYBOT.BOX_OFFSET_X);
}

/**
 * QA demos that start with the bot already out keep it on the home street,
 * where the remake used to deliver it: 124 px left of the street rock
 * (G231, houseX + 221).
 */
function streetDemoX() {
  const cult = homesFeature._state?.()?.cult;
  return Math.round((cult ? homeStreetLayout(cult).houseX + 221 : 600) + CRAFTYBOT.BOX_OFFSET_X);
}

/**
 * G232: the ground under x where the bot stands: in the house, left of its
 * open end is the back yard, 60 px lower than the floor (homes-feature
 * BACK_YARD_GROUND_Y); elsewhere the scene's ground.
 */
function groundYAt(engine, x, room = currentRoom(engine)) {
  if (room === 'interior' && x < houseLeftX()) return BACK_YARD_GROUND_Y;
  return engine.groundY;
}

function clipFrames(engine, clip) {
  if (frameCache.has(clip)) return frameCache.get(clip);
  const def = CLIPS[clip];
  const { PIXI } = engine;
  const base = sourceFromUrl(ART + def.file);
  const list = [];
  for (let i = 0; i < def.frames; i += 1) {
    list.push(frameTexture(base, new PIXI.Rectangle((i % def.cols) * CELL.w, Math.floor(i / def.cols) * CELL.h, CELL.w, CELL.h)));
  }
  frameCache.set(clip, list);
  return list;
}

function spawnBox(engine) {
  const { PIXI } = engine;
  const spr = new PIXI.Sprite(textureFromUrl(BOX_ART_3X));
  spr.anchor.set(0.5, 0.96);
  spr.x = boxX(engine);
  spr.y = groundYAt(engine, spr.x, 'interior') + 2;
  spr.zIndex = 27;
  engine.entityLayer.addChild(spr);
  const target = engine.register({
    classId: BOX,
    featureId: CRAFTYBOT_FEATURE_ID,
    label: CRAFTYBOT_BOX.label,
    subtitle: CRAFTYBOT_BOX.description,
    sprite: spr,
    state: {},
  });
  return { box: spr, target };
}

function spawnBot(engine) {
  const { PIXI } = engine;
  const spr = new PIXI.AnimatedSprite(clipFrames(engine, 'idle0'));
  spr.anchor.set(ANCHOR.x, ANCHOR.y);
  spr.animationSpeed = FPS / 60;
  spr.x = bot.xNow ?? bot.x;
  spr.zIndex = 29;
  const box = new PIXI.Container();
  box.zIndex = 29;
  box.addChild(spr);
  box.x = spr.x;
  spr.x = 0;
  box.y = groundYAt(engine, box.x) + 2;
  spr.y = 0;
  const tool = new PIXI.Sprite(PIXI.Texture.EMPTY);
  tool.anchor.set(0.5, 1);
  tool.y = -58;
  tool.visible = false;
  box.addChild(tool);
  engine.entityLayer.addChild(box);
  const target = engine.register({
    classId: BOT,
    featureId: CRAFTYBOT_FEATURE_ID,
    label: 'Crafty Bot',
    subtitle: botSubtitle(),
    sprite: box,
    state: {},
  });
  return { container: box, anim: spr, tool, target, clip: null, animKey: null };
}

function botSubtitle() {
  const v = craftybotView(bot, labelFor);
  const active = v.jobs.find((j) => j.status.is_active);
  if (active) return activeLine(active, labelFor);
  return `${v.jobs_count}/${v.jobs_max} queued · fuel ${v.fuel_count}/${v.fuel_max}`;
}

function setClip(engine, clip, restart = true) {
  const v = view?.bot;
  if (!v || v.anim.destroyed) return;
  if (v.clip === clip && !restart) return;
  const def = CLIPS[clip];
  v.anim.textures = clipFrames(engine, clip);
  v.anim.loop = def.loop;
  v.anim.onComplete = null;
  v.clip = clip;
  if (def.frames > 1) v.anim.gotoAndPlay(0);
  else v.anim.gotoAndStop(0);
}

/** Map the rules' animation state onto a sheet, starting where the state began. */
function syncAnim(engine, t) {
  const v = view?.bot;
  if (!v) return;
  const key = `${bot.anim}:${bot.animAt}`;
  if (v.animKey !== key) {
    v.animKey = key;
    const clip = ANIM_CLIP[bot.anim] || (CLIPS[bot.anim] ? bot.anim : 'idle0');
    setClip(engine, clip, true);
    if (bot.anim === 'craft') {
      // Hold the open cube while it works.
      v.anim.gotoAndStop(CLIPS.craftStart.frames - 1);
    } else if (!CLIPS[clip].loop && CLIPS[clip].frames > 1) {
      // Catch up a non-looping clip that started a while ago (offline or tab hidden).
      const into = Math.floor(((t - bot.animAt) / 1000) * FPS);
      if (into >= CLIPS[clip].frames - 1) v.anim.gotoAndStop(CLIPS[clip].frames - 1);
      else if (into > 0) v.anim.gotoAndPlay(into);
    }
  }
  // An idle bot fidgets now and then (idle1 / idle2), then stands again.
  if (bot.anim === 'idle0' && bot.craftState === 'idle' && v.clip === 'idle0' && Math.random() < 0.0015) {
    setClip(engine, Math.random() < 0.5 ? 'idle1' : 'idle2', true);
    v.anim.onComplete = () => setClip(engine, 'idle0', true);
  }
  v.container.x = Math.round(bot.move ? moveX(bot, t) : bot.x);
  v.container.y = groundYAt(engine, v.container.x) + 2;
  // The walk art faces left (npc_crafty_bot.js onPathing: "asset is backwards").
  v.anim.scale.x = bot.dir === 'right' ? -1 : 1;
  // While crafting the tool rides above the open cube (make_config special_display).
  const toolCls = bot.craftState === 'craft' && bot.anim === 'craft' ? bot.craftingTool : null;
  if (toolCls) {
    if (v.toolCls !== toolCls) {
      v.tool.texture = textureFromUrl(itemIcon(toolCls));
      v.toolCls = toolCls;
    }
    v.tool.visible = true;
    v.tool.y = -62 + Math.sin(t / 180) * 3;
    v.tool.scale.set(0.9);
  } else v.tool.visible = false;
  if (v.target) v.target.subtitle = botSubtitle();
  hideHeldTools(engine);
}

/** toggleActiveToolVisibility: a tool the bot has picked up is hidden where it lay until it is done with it. */
function hideHeldTools(engine) {
  const row = bot.active != null ? bot.queue[bot.active] : null;
  const held = new Set();
  for (const h of Object.values(row?.holder?.general || {})) for (const id of Object.keys(h.tsid || {})) held.add(id);
  for (const t of engine.interactables || []) {
    const id = t.sprite?.worldItemId;
    if (!id || t.sprite.destroyed) continue;
    const hide = held.has(id);
    if (hide && t.sprite.visible) {
      t.sprite.visible = false;
      t.craftybotHidden = true;
    } else if (!hide && t.craftybotHidden) {
      t.sprite.visible = true;
      t.craftybotHidden = false;
    }
  }
}

function showOverlay(engine, cls) {
  const v = view?.bot;
  if (!v || !cls) return;
  const { PIXI } = engine;
  v.overlay?.destroy?.();
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.roundRect(-26, -26, 52, 52, 12).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 1.5, color: 0xc9c2b2 });
  g.moveTo(-6, 26).lineTo(0, 34).lineTo(6, 26).fill({ color: 0xffffff, alpha: 0.95 });
  const icon = new PIXI.Sprite(textureFromUrl(itemIcon(cls)));
  icon.anchor.set(0.5);
  const fit = () => {
    const w = icon.texture.orig?.width || icon.texture.width || 40;
    const h = icon.texture.orig?.height || icon.texture.height || 40;
    icon.scale.set(Math.min(40 / w, 40 / h, 1.2));
  };
  if (isLoaded(icon.texture.source)) fit();
  else onLoaded(icon.texture.source, fit);
  c.addChild(g, icon);
  c.y = -175;
  c.zIndex = 60;
  v.container.addChild(c);
  v.overlay = c;
  v.overlayUntil = performance.now() + OVERLAY_MS;
}

function clearView() {
  view = null;
}

function spawnView(engine, room) {
  clearView();
  view = { room, box: null, bot: null };
  if (room === 'interior' && !bot.owned && engine.homeContext?.().owned) {
    view.box = spawnBox(engine);
    if (pendingOpenAt) view.box.box.alpha = 0.5;
  }
  if (bot.owned && bot.where === room) {
    view.bot = spawnBot(engine);
    view.target = view.bot.target;
  }
  // Dropped stacks are part of the home now that the bot fetches from them.
  engine.droppedItemsChanged?.();
}

/* ------------------------------------------------------------------ */
/* Box, bot and pack verbs                                              */
/* ------------------------------------------------------------------ */

function readLabel(engine) {
  openLabel(engine);
}

function openBox(engine) {
  if (!view?.box || pendingOpenAt) return;
  const x = view.box.box.x;
  engine.playSound?.('PROTO_PUFF', { volume: 0.7 });
  puff(engine, x, displayTopOf(view.box.box));
  view.box.box.visible = false;
  engine.unregister?.(view.box.target);
  pendingOpenAt = performance.now() + CRAFTYBOT.OPEN_DELAY_MS;
  pendingOpenX = x;
}

let pendingOpenX = 0;

/**
 * items/butler_box.js 114-121 (the Craftybot box opens the same way):
 * itemstack_overlay proto_puff, delta_y 125 from the box's display top, 2 s:
 * Tiny Speck's own puff (tools/overlay-art, G251; stop() on its last frame).
 */
function puff(engine, x, top) {
  const at = itemstackOverlayPoint(x, top, { dy: 125 });
  playSheetOverlay(engine.PIXI, 'proto_puff', { layer: engine.entityLayer, at: () => at, durationMs: 2000, loop: false, zIndex: 70 });
}

function finishOpen(engine) {
  pendingOpenAt = 0;
  const t = now(engine);
  // player.js createCraftybot: in the box's location, the house.
  createBot(bot, pendingOpenX, 'interior', t);
  engine.pushActivity(CRAFTYBOT_COPY.created);
  engine.toast?.(CRAFTYBOT_COPY.created, 3000);
  lastMsg = CRAFTYBOT_COPY.created;
  engine.save?.();
  if (currentRoom(engine) === 'interior') {
    view?.box?.box?.destroy?.();
    view.box = null;
    view.bot = spawnBot(engine);
    view.target = view.bot.target;
  }
  publish(engine);
}

function pickUp(engine) {
  if (bot.where === 'pack') return;
  act(engine, (world) => {
    bot.where = 'pack';
    addItem(engine.inv, BOT, 1);
    engine.unregister?.(view?.bot?.target);
    view?.bot?.container?.destroy?.({ children: true });
    if (view) {
      view.bot = null;
      view.target = null;
    }
    onMoved(bot, makeWorld(engine));
    engine.refreshPack?.();
    engine.pushActivity('You picked up the Crafty Bot.');
    lastSig = null;
  });
}

/** canDrop: only inside the owner's house. */
function canDropHere(engine) {
  return currentRoom(engine) === 'interior';
}

function dropBot(engine) {
  if (bot.where !== 'pack' || !canDropHere(engine)) return;
  act(engine, () => {
    removeItem(engine.inv, BOT, 1);
    bot.where = 'interior';
    bot.x = Math.round(engine.player?.x || 600);
    bot.move = null;
    onMoved(bot, makeWorld(engine));
    engine.refreshPack?.();
    lastSig = null;
    if (view) {
      view.bot = spawnBot(engine);
      view.target = view.bot.target;
    }
  });
}

function refuel(engine) {
  const cells = countItem(engine.inv, 'fuel_cell');
  const check = refuelCheck(bot, cells);
  if (!check.ok) {
    engine.toast(check.msg);
    return;
  }
  act(engine, (world) => {
    removeItem(engine.inv, 'fuel_cell', 1);
    refuelFromCells(bot, world, 1);
    engine.refreshPack?.();
    engine.pushActivity(`You refueled the Crafty Bot. Fuel: ${bot.fuel}/${CRAFTYBOT.MAX_FUEL}.`);
  });
}

function addCrystal(engine) {
  const check = installCrystalCheck(bot, countItem(engine.inv, 'plain_crystal'));
  if (!check.ok) {
    engine.toast(check.msg);
    return;
  }
  act(engine, () => {
    removeItem(engine.inv, 'plain_crystal', 1);
    installCrystal(bot);
    engine.playSound?.('SAVE_AND_CHECKOUT', { volume: 0.6 });
    engine.pushActivity(CRAFTYBOT_COPY.crystalInstalled);
    engine.refreshPack?.();
  });
}

function kickBot(engine) {
  act(engine, (world) => kick(bot, world));
  engine.pushActivity('You kicked the Crafty Bot.');
}

function refuelTooltip() {
  return CRAFTYBOT_COPY.tooltips.refuel.replace('$fuel_level', bot.fuel).replace('$max_fuel', CRAFTYBOT.MAX_FUEL);
}

function botVerbs(engine, inPack) {
  const cells = countItem(engine.inv, 'fuel_cell');
  const fuelCheck = refuelCheck(bot, cells);
  const crystalCheck = installCrystalCheck(bot, countItem(engine.inv, 'plain_crystal'));
  const verbs = [
    { id: 'craft', label: 'craft', enabled: specsReady, reason: specsReady ? '' : 'The Crafty Bot is still booting up.', tooltip: CRAFTYBOT_COPY.tooltips.craft, durationMs: 0, primary: true },
    { id: 'install_crystal', label: 'install a crystal', enabled: crystalCheck.ok, reason: crystalCheck.msg || '', tooltip: CRAFTYBOT_COPY.tooltips.install_crystal, durationMs: 0 },
    { id: 'kick', label: 'kick', enabled: true, tooltip: CRAFTYBOT_COPY.tooltips.kick, durationMs: 0 },
    { id: 'refuel', label: 'refuel', enabled: fuelCheck.ok, reason: fuelCheck.msg || '', tooltip: refuelTooltip(), durationMs: 0 },
  ];
  if (inPack) {
    const ok = canDropHere(engine);
    verbs.push({ id: 'drop_bot', label: 'set down', enabled: ok, reason: ok ? '' : 'You can only put your Crafty Bot down inside your house.', tooltip: CRAFTYBOT_COPY.tooltips.drop, durationMs: 0 });
  } else {
    verbs.push({ id: 'pickup', label: 'pick up', enabled: true, tooltip: CRAFTYBOT_COPY.tooltips.pickup, durationMs: 0 });
  }
  return verbs;
}

function runBotVerb(engine, id) {
  switch (id) {
    case 'craft':
      openPanel(engine);
      return true;
    case 'install_crystal':
      addCrystal(engine);
      return true;
    case 'kick':
      kickBot(engine);
      return true;
    case 'refuel':
      refuel(engine);
      return true;
    case 'pickup':
      pickUp(engine);
      return true;
    case 'drop_bot':
      dropBot(engine);
      return true;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* The job panel (client CraftyDialog)                                  */
/* ------------------------------------------------------------------ */

const CSS = `
.cb-card{width:min(380px,94vw);padding:0;overflow:hidden;display:flex;flex-direction:column;background:#f4f2ef}
.cb-head{display:flex;align-items:center;gap:.55rem;padding:.65rem .85rem .55rem;min-height:52px;border-bottom:1px solid #d6d1c6;background:#fbfaf7}
.cb-head h2{margin:0;font-size:1.12rem;flex:1 1 auto;color:#3a3a3a}
.cb-head img{width:36px;height:36px;object-fit:contain}
.cb-back{border:0;background:#e9e5dc;color:#5a5446;width:28px;height:28px;border-radius:50%;font-size:1rem;font-weight:800;cursor:pointer;line-height:1}
.cb-active{background:#fffbe8;border-bottom:1px solid #e7dcb5;padding:.4rem .6rem}
.cb-body{max-height:min(343px,52vh);min-height:180px;overflow:auto;background:#fff}
.cb-empty{text-align:center;color:#6b6656;padding:1.6rem 1rem .6rem;font-size:.9rem}
.cb-cta{display:flex;justify-content:center;padding:.6rem 0 1rem}
.cb-job{display:grid;grid-template-columns:40px 1fr auto;gap:.55rem;align-items:center;padding:.45rem .65rem;border-bottom:1px solid #ece8df;cursor:pointer}
.cb-job:hover{background:#f7f5ef}
.cb-job img{width:40px;height:40px;object-fit:contain}
.cb-job.is-missing img{opacity:.45}
.cb-job.is-complete{background:#f2f7df}
.cb-job.is-active{background:#fffbe8;cursor:pointer}
.cb-job b{font-size:.9rem;color:#34322b}
.cb-job .cb-name{font-size:.88rem;color:#34322b}
.cb-job small{display:block;font-size:.74rem;color:#6f6a5c}
.cb-st-complete{color:#5f8a1d;font-weight:700}
.cb-st-missing{color:#b0382f;font-weight:700}
.cb-search{padding:.45rem .6rem;background:#ebebeb;border-bottom:1px solid #ccc}
.cb-search input{width:100%;box-sizing:border-box;font:inherit;font-size:.85rem;padding:.3rem .55rem;border:1px solid #cbcbcb;border-radius:11px}
.cb-tool{display:grid;grid-template-columns:40px 1fr auto;gap:.55rem;align-items:center;padding:.4rem .65rem;border-bottom:1px solid #ece8df;cursor:pointer;font-size:.88rem}
.cb-tool:hover{background:#f7f5ef}
.cb-tool img{width:36px;height:36px;object-fit:contain}
.cb-tool small{color:#7a7464}
.cb-recipes{background:#ebebeb;padding:.3rem .45rem}
.cb-recipe{display:grid;grid-template-columns:40px 1fr;gap:.5rem;align-items:center;background:#fff;border-radius:10px;padding:.3rem .5rem;margin:.3rem 0;cursor:pointer;font-size:.88rem}
.cb-recipe:hover{box-shadow:0 0 0 2px #c9e2a4}
.cb-recipe img{width:36px;height:36px;object-fit:contain}
.cb-dhead{display:flex;align-items:center;gap:.6rem;padding:.75rem 1rem;background:#ebebeb;border-bottom:1px solid #ccc;min-height:44px}
.cb-dhead.is-complete{background:#eff4d8}
.cb-qty{display:flex;align-items:center;gap:.25rem}
.cb-qty button{width:24px;height:24px;border-radius:50%;border:0;font-weight:800;cursor:pointer;color:#fff}
.cb-qty .minus{background:#c9493e}.cb-qty .plus{background:#6aa83a}
.cb-qty input{width:3.2rem;text-align:center;font:inherit;font-size:.95rem;font-weight:700;border:1px solid #cbcbcb;border-radius:6px;padding:.15rem}
.cb-fuel-use{font-size:.74rem;color:#6a6555;margin-top:.15rem}
.cb-count{font-size:.78rem;color:#6b6555;line-height:1.1}
.cb-count b{font-size:1.35rem;color:#34322b}
.cb-count .halted{color:#b0382f}
.cb-spacer{flex:1}
.cb-status{background:#4e595a;border-top:2px solid #465051;border-bottom:1px solid #6c7f80;color:#fff;font-size:.68rem;font-weight:800;letter-spacing:.06em;padding:.25rem 1rem;text-transform:uppercase}
.cb-status.is-halted{background:#933536;border-top-color:#843030;border-bottom-color:#c14444}
.cb-comp{display:grid;grid-template-columns:auto 1fr;gap:.5rem;align-items:center;padding:.4rem 1rem;border-bottom:1px solid #f0ede6;font-size:.84rem;color:#3e3b33}
.cb-comp img{width:30px;height:30px;object-fit:contain}
.cb-comp .ico{display:flex;gap:2px}
.cb-comp.is-complete{color:#7c9440}
.cb-comp.is-complete img{opacity:.55}
.cb-comp.is-missing,.cb-comp.is-halted{color:#b0382f}
.cb-comp.is-active{background:repeating-linear-gradient(-45deg,#fff,#fff 10px,#e2e6e7 10px,#e2e6e7 14px)}
.cb-comp .miss{font-size:.74rem;color:#b0382f}
.cb-halted{margin:.6rem 1.2rem;border:1px solid #e3b7b2;background:#fbeeec;border-radius:8px;padding:.5rem .7rem;font-size:.8rem;color:#7c2b25}
.cb-halted b{display:block;color:#b0382f}
.cb-done{display:flex;align-items:center;gap:.6rem;padding:.55rem 1rem;background:#eff4d8;border-top:1px solid #d8e3b0;font-size:.82rem}
.cb-done p{margin:0;flex:1}
.cb-foot{display:grid;grid-template-columns:auto 1fr;gap:.35rem .6rem;align-items:center;background:#4e595a;color:#fff;padding:.5rem .8rem;font-size:.76rem}
.cb-crystals{display:flex;gap:2px}
.cb-crystals i{display:inline-block;width:9px;height:14px;border-radius:2px;background:#363e3f;border:1px solid #6c7f80}
.cb-crystals i.on{background:linear-gradient(#e8f6ff,#9fd1ee);border-color:#d3eefc}
.cb-queue{justify-self:end;background:#363e3f;border-radius:9px;padding:.1rem .55rem}
.cb-fuel{grid-column:1/-1;display:grid;grid-template-columns:auto 1fr auto;gap:.5rem;align-items:center;background:#e3e4e4;color:#3d3a33;border-radius:6px;padding:.25rem .45rem}
.cb-fuel a{color:#2f6db4;cursor:pointer;text-decoration:underline}
.cb-bar{height:9px;border-radius:5px;background:#c9caca;overflow:hidden}
.cb-bar>i{display:block;height:100%;background:linear-gradient(90deg,#97c04a,#b9d676)}
.cb-card button.cb-btn,.cb-label button.cb-btn{font:inherit;font-size:.78rem;font-weight:700;border-radius:7px;border:1px solid #9cbf6c;background:#fff;color:#3c5a17;padding:.32rem .7rem;cursor:pointer;white-space:nowrap}
.cb-card button.cb-btn.primary,.cb-label button.cb-btn.primary{background:#7cb342;border-color:#5f9431;color:#fff}
.cb-card button.cb-btn.minor{background:#f4f2ef;border-color:#c8c2b4;color:#4d4a40}
.cb-card button.cb-btn.danger{border-color:#d9a19b;color:#a33a31}
.cb-card button.cb-btn[disabled]{opacity:.45;cursor:not-allowed}
.cb-round{width:38px;height:38px;border-radius:50%;padding:0!important;font-size:1rem!important}
.cb-confirm{padding:1rem 1.1rem;font-size:.86rem;color:#3b382f}
.cb-confirm h3{margin:0 0 .4rem;font-size:1rem}
.cb-confirm .row{display:flex;gap:.5rem;justify-content:flex-end;margin-top:.7rem}
.cb-label{width:min(440px,94vw)}
.cb-label .cb-label-body{display:grid;grid-template-columns:96px 1fr;gap:.8rem;align-items:center;padding:.5rem .2rem}
.cb-label img{width:96px;height:auto}
.cb-label p{margin:0;font-size:.95rem;color:#36332c}
.cb-label .row{display:flex;justify-content:flex-end;margin-top:.5rem}
@media (max-width:420px){.cb-job{grid-template-columns:34px 1fr}.cb-job>div:last-child{grid-column:1/-1;justify-self:end}}
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function img(cls, size = 40) {
  const i = el('img', { src: itemIcon(cls), alt: '', width: size, height: size });
  i.onerror = () => {
    i.style.visibility = 'hidden';
  };
  return i;
}

function ensureCss() {
  if (document.getElementById('cb-css')) return;
  const style = document.createElement('style');
  style.id = 'cb-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function ensurePanel(engine) {
  if (panel || typeof document === 'undefined') return panel;
  ensureCss();
  panel = el('div', { id: 'craftybot-panel', class: 'glitch-modal craftybot-panel' });
  panel.hidden = true;
  panel.innerHTML = `<div class="glitch-modal-card cb-card" role="dialog" aria-modal="true" aria-labelledby="cb-title">
    <div class="cb-head"><button type="button" class="cb-back" data-cb-back aria-label="Back" hidden>‹</button><span data-cb-icon></span><h2 id="cb-title" data-cb-title>Craftybot</h2>
    <button type="button" class="verb-menu-x" data-cb-close aria-label="Close">×</button></div>
    <div class="cb-active" data-cb-active hidden></div>
    <div class="cb-body" data-cb-body></div>
    <div data-cb-tail></div>
    <div class="cb-foot" data-cb-foot></div>
  </div>`;
  const host = document.getElementById('make-panel')?.parentElement || document.body;
  host.appendChild(panel);
  panel.addEventListener('click', (e) => {
    if (e.target === panel || e.target.closest('[data-cb-close]')) closePanel(engine);
    else if (e.target.closest('[data-cb-back]')) back(engine);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.hidden) {
      e.stopPropagation();
      if (panelState.confirm) {
        panelState.confirm = null;
        renderPanel(engine, true);
      } else closePanel(engine);
    }
  }, true);
  return panel;
}

function click(engine, ok = true) {
  engine.playSound?.(ok ? 'CLICK_SUCCESS' : 'CLICK_FAILURE', { volume: 0.5 });
}

function openPanel(engine) {
  if (!ensurePanel(engine)) return;
  // craftybot verb handler: craftSequenceRebuildAll on the next update.
  act(engine, (world) => rebuildAll(bot, world));
  panelState = { view: 'jobs', tool: null, item: null, qty: 1, editing: false, confirm: null, search: '', scrollTop: 0 };
  panel.hidden = false;
  renderPanel(engine, true);
  publish(engine);
}

function closePanel(engine) {
  if (panel) panel.hidden = true;
  if (panelState.editing && panelState.item) {
    // CraftyJobDetailsUI onStageClick: leaving the quantity picker releases the lock.
    act(engine, (world) => setLocked(bot, panelState.item, false));
  }
  panelState.view = 'closed';
  publish(engine);
}

function back(engine) {
  click(engine);
  if (panelState.view === 'details' && panelState.tool) panelState.view = 'recipes';
  else if (panelState.view === 'recipes') panelState.view = 'tools';
  else {
    panelState.view = 'jobs';
    panelState.tool = null;
  }
  if (panelState.editing && panelState.item) act(engine, () => setLocked(bot, panelState.item, false));
  panelState.editing = false;
  panelState.confirm = null;
  renderPanel(engine, true);
}

/** The recipes the client lists: known, not furniture, not a machine recipe, with a Craftybot spec. */
function menuRecipes(engine) {
  const learned = engine.learnedSkills || [];
  const done = engine.questState?.completed || [];
  const ach = engine.unlockedAchievements || [];
  return listRecipes().filter((r) => {
    const out = r.outputs?.[0]?.classTsid;
    if (!out || !craftybotSpec(out)?.ingredients) return false;
    if (out.startsWith('furniture_') || out.startsWith('bag_furniture_')) return false;
    if (r.fuel || (r.inputs || []).some((i) => i.classTsid === 'fuel_cell')) return false;
    if (!recipeKnown(r, done)) return false;
    // can_make: the recipe is learnt (its skills known); transmogrification is known to everyone.
    const transmog = MAKING_TOOL_SKILLS[r.tool]?.makingType === 'transmogrification';
    const skills = [...new Set([...(r.skill ? [r.skill] : []), ...(r.skills || [])])];
    if (!transmog && skills.some((s) => !learned.includes(s))) return false;
    if ((r.achievements || []).some((a) => !ach.includes(a))) return false;
    return true;
  });
}

function renderPanel(engine, force = false) {
  if (!panel || panel.hidden) return;
  // Never rebuild under someone typing in the search or quantity box.
  if (!force && panel.contains(document.activeElement) && document.activeElement?.tagName === 'INPUT') return;
  const v = craftybotView(bot, labelFor);
  const key = JSON.stringify([panelState, v, bot.fuel, countItem(engine.inv, 'fuel_cell')]);
  if (!force && key === lastPanelKey) return;
  lastPanelKey = key;
  const q = (s) => panel.querySelector(s);
  const body = q('[data-cb-body]');
  const scroll = body.scrollTop;
  body.replaceChildren();
  q('[data-cb-tail]').replaceChildren();
  q('[data-cb-back]').hidden = panelState.view === 'jobs';
  q('[data-cb-icon]').replaceChildren();
  const activeBox = q('[data-cb-active]');
  activeBox.replaceChildren();
  activeBox.hidden = true;
  if (panelState.confirm) {
    renderConfirm(engine, body);
  } else if (panelState.view === 'tools') {
    q('[data-cb-title]').textContent = 'Which tool?';
    renderTools(engine, body);
  } else if (panelState.view === 'recipes') {
    q('[data-cb-title]').textContent = 'Which recipe?';
    q('[data-cb-icon]').append(img(panelState.tool, 36));
    renderRecipes(engine, body);
  } else if (panelState.view === 'details') {
    q('[data-cb-title]').textContent = itemName(panelState.item, 1);
    q('[data-cb-icon]').append(img(panelState.item, 36));
    renderDetails(engine, body, v);
  } else {
    q('[data-cb-title]').textContent = 'Craftybot';
    const active = v.jobs.find((j) => j.status.is_active);
    if (active) {
      activeBox.hidden = false;
      activeBox.append(jobRow(engine, active, true));
    }
    renderJobs(engine, body, v);
  }
  renderFooter(engine, q('[data-cb-foot]'), v);
  if (!force || panelState.view === 'jobs') body.scrollTop = scroll;
  publish(engine);
}

function jobRow(engine, job, isActive = false) {
  const cls = job.item_class;
  const row = el('div', { class: `cb-job${job.status.is_complete ? ' is-complete' : ''}${job.craftable_count === 0 && !job.status.is_complete ? ' is-missing' : ''}${isActive ? ' is-active' : ''}`, dataset: { cbJob: cls } });
  const text = el('div');
  const name = el('div', { class: 'cb-name' });
  const b = el('b', {}, `${job.done}/${job.total} `);
  name.append(b, document.createTextNode(job.total > 1 ? labelFor(cls).plural : labelFor(cls).single));
  text.append(name);
  let status = '';
  let cls2 = '';
  if (isActive) status = activeLine(job, labelFor);
  if (job.status.is_complete) {
    status = 'Job Complete!';
    cls2 = 'cb-st-complete';
  } else if (job.status.is_halted) {
    status = 'Job Halted!';
    cls2 = 'cb-st-missing';
  } else if (job.craftable_count === 0 && !isActive) {
    status = 'Missing Ingredient(s)';
    cls2 = 'cb-st-missing';
  }
  if (status) text.append(el('small', { class: cls2 }, status));
  const acts = el('div');
  if (job.done) {
    const c = el('button', { type: 'button', class: 'cb-btn primary', dataset: { cbCollect: cls } }, `Collect ${job.done}`);
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      click(engine);
      requestRemove(engine, cls, job.done);
    });
    acts.append(c);
  } else if (!isActive) {
    const r = el('button', { type: 'button', class: 'cb-btn danger', title: 'Remove job', 'aria-label': 'Remove job', dataset: { cbRemove: cls } }, '×');
    r.addEventListener('click', (e) => {
      e.stopPropagation();
      click(engine);
      requestRemove(engine, cls, job.total);
    });
    acts.append(r);
  }
  row.append(img(cls), text, acts);
  row.addEventListener('click', () => {
    click(engine);
    showDetails(engine, cls);
  });
  return row;
}

function renderJobs(engine, body, v) {
  const list = v.jobs.filter((j) => !j.status.is_active);
  if (!v.jobs.length) {
    const p = el('p', { class: 'cb-empty' });
    p.append(document.createTextNode(CRAFTYBOT_COPY.noQueue), el('br'), el('br'), el('b', {}, CRAFTYBOT_COPY.noQueueCta));
    body.append(p);
  }
  for (const job of list) body.append(jobRow(engine, job));
  const cta = el('div', { class: 'cb-cta' });
  const add = el('button', { type: 'button', class: 'cb-btn primary', dataset: { cbAdd: '1' } }, v.jobs.length ? '+ Add another job' : 'Start Crafting');
  add.addEventListener('click', () => {
    click(engine);
    panelState.view = 'tools';
    panelState.search = '';
    renderPanel(engine, true);
  });
  cta.append(add);
  body.append(cta);
}

function searchBox(engine, body, onPick) {
  const wrap = el('div', { class: 'cb-search' });
  const input = el('input', { type: 'search', placeholder: 'Search recipes', 'aria-label': 'Search recipes', value: panelState.search || '' });
  wrap.append(input);
  body.append(wrap);
  const results = el('div');
  body.append(results);
  const run = () => {
    panelState.search = input.value;
    results.replaceChildren();
    const s = input.value.trim().toLowerCase();
    if (!s) return;
    // WorldModel.searchRecipes: names starting with the text first, then names containing it.
    const all = menuRecipes(engine);
    const starts = all.filter((r) => r.name.toLowerCase().startsWith(s)).sort((a, b) => a.name.localeCompare(b.name));
    const contains = all.filter((r) => !starts.includes(r) && r.name.toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name));
    const box = el('div', { class: 'cb-recipes' });
    for (const r of [...starts, ...contains].slice(0, 30)) box.append(recipeRow(engine, r));
    results.append(box);
  };
  input.addEventListener('input', run);
  run();
  return results;
}

function recipeRow(engine, r) {
  const out = r.outputs[0].classTsid;
  const row = el('div', { class: 'cb-recipe', dataset: { cbRecipe: out } });
  row.append(img(out, 36), el('span', {}, labelFor(out).single));
  row.addEventListener('click', () => {
    click(engine);
    showDetails(engine, out);
  });
  return row;
}

function renderTools(engine, body) {
  searchBox(engine, body);
  const byTool = new Map();
  for (const r of menuRecipes(engine)) byTool.set(r.tool, (byTool.get(r.tool) || 0) + 1);
  const tools = [...byTool.keys()].sort((a, b) => labelFor(a).single.localeCompare(labelFor(b).single));
  for (const t of tools) {
    const row = el('div', { class: 'cb-tool', dataset: { cbTool: t } });
    const n = byTool.get(t);
    row.append(img(t, 36), el('span', {}, labelFor(t).single), el('small', {}, `(${n}${n !== 1 ? ' Recipes' : ' Recipe'})`));
    row.addEventListener('click', () => {
      click(engine);
      panelState.view = 'recipes';
      panelState.tool = t;
      renderPanel(engine, true);
    });
    body.append(row);
  }
}

function renderRecipes(engine, body) {
  searchBox(engine, body);
  const box = el('div', { class: 'cb-recipes' });
  const list = menuRecipes(engine).filter((r) => r.tool === panelState.tool).sort((a, b) => a.name.localeCompare(b.name));
  for (const r of list) box.append(recipeRow(engine, r));
  body.append(box);
}

function showDetails(engine, cls) {
  panelState.view = 'details';
  panelState.item = cls;
  panelState.editing = false;
  const job = bot.queue.find((r) => r.item === cls);
  panelState.qty = job ? Math.max(job.count, 1) : 1;
  renderPanel(engine, true);
}

/** CraftyComponentUI.setText: "Fetch 9 Cherries (Missing 3)", "Craft 3 Apples", a tool icon on craft steps. */
function componentRow(c) {
  const missing = (c.status === 'missing' || c.status === 'halted') && !c.can_start;
  const row = el('div', { class: `cb-comp is-${missing ? 'missing' : c.status}`, title: c.status_txt || '' });
  const ico = el('span', { class: 'ico' });
  for (const cls of c.item_classes) ico.append(img(String(cls).split('|')[0], 30));
  if (c.tool_class) ico.append(img(String(c.tool_class).split('|')[0], 30));
  const text = el('div');
  text.append(document.createTextNode(c.type === 'fetch' ? 'Fetch ' : 'Craft '));
  c.item_classes.forEach((cls, k) => {
    const chunks = String(cls).split('|');
    const l = labelFor(chunks[0]);
    const n = Number(c.counts[k]) || 0;
    if (n > 1) text.append(el('b', {}, n.toLocaleString()), document.createTextNode(' '));
    let name;
    if (n > 1 || c.status === 'complete') name = n !== 1 ? l.plural : l.single;
    else if (n === 1) name = l.single;
    else name = l.plural;
    text.append(document.createTextNode(name + (chunks.length > 1 ? ' of some sort' : '')));
    const miss = Number(c.counts_missing?.[k]) || 0;
    if (miss > 0) text.append(el('span', { class: 'miss' }, ` (Missing\u00a0${miss.toLocaleString()})`));
    if (k < c.item_classes.length - 1) text.append(document.createTextNode(', '));
  });
  if (!c.can_start && !(Number(c.counts_missing?.[0]) > 0)) row.style.opacity = '0.55';
  row.append(ico, text);
  return row;
}

function renderDetails(engine, body, v) {
  const cls = panelState.item;
  const job = v.jobs.find((j) => j.item_class === cls) || null;
  const world = makeWorld(engine);
  const qtyMode = !job || panelState.editing;
  const qty = Math.max(1, Math.min(CRAFTYBOT.MAX_QUANTITY, panelState.qty || 1));
  const cost = qtyMode ? costCheck(world, cls, qty) : null;
  const head = el('div', { class: `cb-dhead${job?.status.is_complete ? ' is-complete' : ''}` });
  if (qtyMode) {
    const max = Math.min(v.jobs_max - v.jobs_count + (job ? job.total : 0), CRAFTYBOT.MAX_QUANTITY);
    const min = job ? Math.max(job.done, 1) : 1;
    const wrap = el('div');
    const picker = el('div', { class: 'cb-qty' });
    const minus = el('button', { type: 'button', class: 'minus', 'aria-label': 'Fewer' }, '−');
    const input = el('input', { type: 'number', min: String(min), max: String(Math.max(min, max)), value: String(qty), 'aria-label': 'How many?', dataset: { cbQty: '1' } });
    const plus = el('button', { type: 'button', class: 'plus', 'aria-label': 'More' }, '+');
    const setQty = (n) => {
      panelState.qty = Math.max(min, Math.min(Math.max(min, max), Math.floor(Number(n) || min)));
      renderPanel(engine, true);
    };
    minus.addEventListener('click', () => setQty(qty - 1));
    plus.addEventListener('click', () => setQty(qty + 1));
    input.addEventListener('change', () => setQty(input.value));
    picker.append(minus, input, plus);
    wrap.append(picker, el('div', { class: 'cb-fuel-use' }, `Uses: ${cost ? cost.fuel_cost : 0} Fuel`));
    head.append(wrap, el('span', { class: 'cb-spacer' }));
    if (!job) {
      const add = el('button', { type: 'button', class: 'cb-btn primary', dataset: { cbQueue: cls } }, '+ Add to Queue');
      const full = v.jobs_count >= v.jobs_max;
      add.disabled = full;
      if (full) add.title = CRAFTYBOT_COPY.queueFull;
      add.addEventListener('click', () => {
        click(engine, !add.disabled);
        if (add.disabled) return;
        addJob(engine, cls, qty);
      });
      head.append(add);
    } else {
      const ok = el('button', { type: 'button', class: 'cb-btn primary', dataset: { cbSet: cls } }, 'Done');
      ok.addEventListener('click', () => {
        click(engine);
        // onStageClick: unlock, then shrink (remove) or grow (add) to the picked total.
        const total = qty;
        panelState.editing = false;
        act(engine, (w) => setLocked(bot, cls, false));
        if (job.total > total) requestRemove(engine, cls, job.total - total);
        else addJob(engine, cls, total);
      });
      head.append(ok);
    }
  } else if (job.status.is_complete) {
    head.append(el('b', { class: 'cb-st-complete' }, 'Job Complete!'));
  } else {
    const count = el('div', { class: 'cb-count' });
    const b = el('b', { class: job.status.is_halted ? 'halted' : '' }, String(job.total - job.done));
    count.append(b, document.createTextNode(`/${job.total}`), el('br'), document.createTextNode('Remaining '));
    const edit = el('button', { type: 'button', class: 'cb-btn minor', title: 'Edit', dataset: { cbEdit: cls } }, 'Edit');
    edit.addEventListener('click', () => {
      click(engine);
      panelState.editing = true;
      panelState.qty = Math.max(job.total, 1);
      act(engine, () => setLocked(bot, cls, true));
    });
    count.append(edit);
    head.append(count, el('span', { class: 'cb-spacer' }));
    const remove = el('button', { type: 'button', class: 'cb-btn danger cb-round', title: 'Remove', 'aria-label': 'Remove', dataset: { cbRemoveJob: cls } }, '🗑');
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      click(engine);
      requestRemove(engine, cls, job.total);
    });
    const paused = job.status.is_paused;
    const pause = el('button', { type: 'button', class: `cb-btn cb-round ${paused ? 'primary' : 'minor'}`, title: paused ? 'Resume' : 'Pause', 'aria-label': paused ? 'Resume' : 'Pause', dataset: { cbPause: cls } }, paused ? '▶' : '❚❚');
    pause.addEventListener('click', () => {
      click(engine);
      act(engine, (w) => setPaused(bot, w, cls, !paused));
    });
    head.append(remove, pause);
  }
  body.append(head);
  const status = el('div', { class: `cb-status${job?.status.is_halted && !job.status.is_complete ? ' is-halted' : ''}` });
  status.textContent = job && !panelState.editing ? String(job.status.txt || CRAFTYBOT_COPY.defaultStatus) : `To make ${qty > 1 ? 'these' : 'this'} I'll need to...`;
  body.append(status);
  const comps = job && !panelState.editing ? job.components : cost?.components || [];
  let halted = null;
  for (const c of comps) {
    body.append(componentRow(c));
    if (c.status === 'halted') halted = c.status_txt;
  }
  if (halted) {
    const h = el('div', { class: 'cb-halted' });
    h.append(el('b', {}, 'Job Halted!'), document.createTextNode(halted));
    if (canAutoRefuel(bot, world)) {
      const a = el('a', {}, ' Add More');
      a.style.cursor = 'pointer';
      a.addEventListener('click', () => refuelFromLocation(engine));
      h.append(a);
    }
    body.append(h);
  }
  const tail = panel.querySelector('[data-cb-tail]');
  if (job && (job.status.is_complete || job.done > 0)) {
    const done = el('div', { class: 'cb-done' });
    const l = labelFor(cls);
    const p = el('p');
    if (job.status.is_complete) p.append(document.createTextNode("I've made all of the "), el('b', {}, l.plural));
    else {
      p.append(document.createTextNode("I've crafted "), el('b', {}, `${job.done} ${job.done !== 1 ? l.plural : l.single}`), document.createTextNode(' so far'));
    }
    const c = el('button', { type: 'button', class: 'cb-btn primary', dataset: { cbCollect: cls } }, `Collect ${job.done} ${job.done !== 1 ? l.plural : l.single}`);
    c.addEventListener('click', () => {
      click(engine);
      requestRemove(engine, cls, job.done);
    });
    done.append(p, c);
    tail.append(done);
  }
}

function renderConfirm(engine, body) {
  const c = panelState.confirm;
  const box = el('div', { class: 'cb-confirm' });
  box.append(el('h3', {}, 'Are you sure?'), el('p', {}, c.text));
  const row = el('div', { class: 'row' });
  const no = el('button', { type: 'button', class: 'cb-btn minor', dataset: { cbConfirm: 'no' } }, 'Nevermind');
  const yes = el('button', { type: 'button', class: 'cb-btn primary', dataset: { cbConfirm: 'yes' } }, 'Yes, go ahead!');
  no.addEventListener('click', () => {
    click(engine);
    panelState.confirm = null;
    renderPanel(engine, true);
  });
  yes.addEventListener('click', () => {
    click(engine);
    const { cls, count } = c;
    panelState.confirm = null;
    doRemove(engine, cls, count);
  });
  row.append(no, yes);
  box.append(row);
  body.append(box);
}

function renderFooter(engine, foot, v) {
  foot.replaceChildren();
  const crystals = el('div', { class: 'cb-crystals', title: CRAFTYBOT_COPY.crystalsTip, 'aria-label': `${v.crystal_count} of ${v.crystal_max} crystals` });
  for (let i = 0; i < v.crystal_max; i += 1) crystals.append(el('i', { class: i < v.crystal_count ? 'on' : '' }));
  const queue = el('span', { class: 'cb-queue' });
  queue.append(el('b', {}, 'Queue Size: '), document.createTextNode(`${v.jobs_count}/${v.jobs_max}`));
  const fuel = el('div', { class: 'cb-fuel' });
  const label = el('span', {}, 'Fuel');
  if (canAutoRefuel(bot, makeWorld(engine))) {
    label.append(document.createTextNode(' - '));
    const a = el('a', { dataset: { cbRefuel: '1' } }, 'Add More');
    a.addEventListener('click', () => refuelFromLocation(engine));
    label.append(a);
  }
  const bar = el('div', { class: 'cb-bar' });
  const fill = el('i');
  fill.style.width = `${Math.round((v.fuel_count / v.fuel_max) * 100)}%`;
  bar.append(fill);
  fuel.append(label, bar, el('span', {}, `${v.fuel_count}/${v.fuel_max}`));
  foot.append(crystals, queue, fuel);
}

function refuelFromLocation(engine) {
  click(engine);
  act(engine, (world) => autoRefuel(bot, world));
}

function addJob(engine, cls, total) {
  const res = act(engine, (world) => setJobTotal(bot, world, cls, total));
  if (res == null) {
    engine.toast(CRAFTYBOT_COPY.queueFull);
    return;
  }
  // addStatus: a new job sends the dialog back to the queue.
  panelState.view = 'jobs';
  panelState.tool = null;
  panelState.editing = false;
  renderPanel(engine, true);
}

/** CraftyManager.removeJob: confirm when the job is running or the whole job goes. */
function requestRemove(engine, cls, count) {
  const v = craftybotView(bot, labelFor);
  const job = v.jobs.find((j) => j.item_class === cls);
  if (!job) return;
  if (job.status.is_active && count > job.done) panelState.confirm = { cls, count, text: CRAFTYBOT_COPY.removeActive };
  else if (job.total === count && !job.status.is_complete) panelState.confirm = { cls, count, text: CRAFTYBOT_COPY.removeAll };
  if (panelState.confirm) {
    renderPanel(engine, true);
    return;
  }
  doRemove(engine, cls, count);
}

function doRemove(engine, cls, count) {
  const given = act(engine, (world) => collectJob(bot, world, cls, count));
  if (given > 0) {
    engine.pushActivity(`The Crafty Bot handed over ${given} ${itemName(cls, given)}.`);
    engine.playSound?.('ITEM_PICKUP', { volume: 0.6 });
  }
  if (!bot.queue.find((r) => r.item === cls)) {
    panelState.view = 'jobs';
    panelState.tool = null;
  }
  renderPanel(engine, true);
}

/* ------------------------------------------------------------------ */
/* The box label (butler_box read_label_craftybot)                      */
/* ------------------------------------------------------------------ */

function openLabel(engine, onDone) {
  ensureCss();
  if (!label) {
    label = el('div', { id: 'craftybot-label', class: 'glitch-modal' });
    label.innerHTML = `<div class="glitch-modal-card cb-label" role="dialog" aria-modal="true" aria-labelledby="cb-label-title">
      <div class="glitch-modal-head"><h2 id="cb-label-title">${CRAFTYBOT_BOX.label}</h2><button type="button" class="verb-menu-x" data-cbl-close aria-label="Close">×</button></div>
      <div class="cb-label-body"><img src="${BOX_ART}" srcset="${BOX_ART} 1x, ${BOX_ART_3X} 3x" alt=""><p data-cbl-text></p></div>
      <div class="row"><button type="button" class="cb-btn primary" data-cbl-next></button></div></div>`;
    (document.getElementById('make-panel')?.parentElement || document.body).appendChild(label);
    label.addEventListener('click', (e) => {
      if (e.target === label || e.target.closest('[data-cbl-close]')) closeLabel(engine, false);
    });
  }
  let i = 0;
  const render = () => {
    const beat = CRAFTYBOT_BOX.beats[i];
    label.querySelector('[data-cbl-text]').textContent = beat.text;
    const next = label.querySelector('[data-cbl-next]');
    next.textContent = beat.response;
    next.onclick = () => {
      click(engine);
      i += 1;
      if (i >= CRAFTYBOT_BOX.beats.length) closeLabel(engine, true);
      else render();
    };
    label.dataset.beat = String(i);
  };
  label.hidden = false;
  render();
  publish(engine);
}

function closeLabel(engine, finished) {
  if (label) label.hidden = true;
  if (finished) {
    bot.boxRead = true;
    engine.save?.();
    if (view?.box?.target) view.box.target.subtitle = 'Open me!';
  }
  publish(engine);
}

/* ------------------------------------------------------------------ */
/* QA                                                                  */
/* ------------------------------------------------------------------ */

function publish(engine) {
  const v = specsReady ? craftybotView(bot, labelFor) : null;
  engine.setData('craftybotState', bot.owned ? (bot.where === 'pack' ? 'pack' : 'bot') : view?.box ? 'box' : 'none');
  engine.setData('craftybotWhere', bot.owned ? bot.where : '');
  engine.setData('craftybotX', Math.round(bot.move ? moveX(bot, simNow || Date.now()) : bot.x));
  engine.setData('craftybotAnim', bot.anim);
  engine.setData('craftybotCraftState', bot.craftState);
  engine.setData('craftybotFuel', `${bot.fuel}/${CRAFTYBOT.MAX_FUEL}`);
  engine.setData('craftybotCrystals', `${bot.crystals}/${bot.slots}:${bot.crystalHp}`);
  engine.setData('craftybotQueue', v ? v.jobs.map((j) => `${j.item_class}:${j.done}/${j.total}:${j.status.txt}`).join(',') : '');
  engine.setData('craftybotQueueSize', v ? `${v.jobs_count}/${v.jobs_max}` : '');
  engine.setData('craftybotPanel', panel && !panel.hidden ? (panelState.confirm ? 'confirm' : panelState.view) : label && !label.hidden ? `label:${label.dataset.beat}` : 'closed');
  engine.setData('craftybotLast', lastMsg);
  engine.setData('craftybotBoxRead', bot.boxRead ? '1' : '0');
}

function demoSetup(engine) {
  const kind = String(engine.param('craftybotdemo') || '').toLowerCase();
  if (!kind || demo) return;
  demo = { kind };
  const inv = engine.inv;
  inv.cherry = Math.max(inv.cherry || 0, 12);
  inv.fruit_changing_machine = Math.max(inv.fruit_changing_machine || 0, 1);
  inv.fuel_cell = Math.max(inv.fuel_cell || 0, 2);
  inv.plain_crystal = Math.max(inv.plain_crystal || 0, 1);
  if (kind === 'box') {
    bot = createCraftybotState();
  } else {
    bot = createCraftybotState();
    const t = now(engine);
    createBot(bot, streetDemoX(), kind === 'pack' ? 'pack' : 'street', t);
    bot.boxRead = true;
    if (kind === 'pack') addItem(inv, BOT, 1);
    else {
      // Cherries and the machine on the floor to the right of the bot.
      const state = engine.droppedItems;
      state.streets[HOME_STREET_TSID] = (state.streets[HOME_STREET_TSID] || []).filter((r) => !['cherry', 'fruit_changing_machine'].includes(r.classTsid));
      const drop = (cls, n, x) => state.streets[HOME_STREET_TSID].push({ id: `world-item-${state.nextId++}`, streetTsid: HOME_STREET_TSID, classTsid: cls, count: n, x, y: engine.groundY, droppedAt: Date.now() });
      drop('cherry', 12, bot.x + 260);
      drop('fruit_changing_machine', 1, bot.x + 420);
    }
    if (kind === 'fuel') bot.fuel = 6;
  }
  engine.refreshPack?.();
  engine.save?.();
  if (engine.param('craftybotautoplay')) autoplay = { phase: 'start', at: performance.now() + 1500, mode: String(engine.param('craftybotautoplay')) };
}

function autoplayStep(engine) {
  if (!autoplay || performance.now() < autoplay.at) return;
  const say = (s) => engine.setData('craftybotAutoplay', s);
  const later = (ms) => {
    autoplay.at = performance.now() + ms;
  };
  switch (autoplay.phase) {
    case 'start':
      if (!view) return later(300);
      if (!bot.owned) {
        readLabel(engine);
        autoplay.phase = 'label';
      } else autoplay.phase = 'queue';
      say(autoplay.phase);
      return later(800);
    case 'label': {
      const next = label?.querySelector('[data-cbl-next]');
      if (next && !label.hidden) {
        next.click();
        return later(500);
      }
      openBox(engine);
      autoplay.phase = 'opening';
      say('opening');
      return later(1500);
    }
    case 'opening': {
      if (!bot.owned) return later(300);
      // Drop the Cherries and the machine from the pack onto the floor, right of the bot.
      const state = engine.droppedItems;
      const tsid = homeTsid(bot.where);
      state.streets[tsid] ||= [];
      for (const [cls, n, dx] of [['cherry', 9, 260], ['fruit_changing_machine', 1, 420]]) {
        if (countItem(engine.inv, cls) < n) continue;
        removeItem(engine.inv, cls, n);
        state.streets[tsid].push({ id: `world-item-${state.nextId++}`, streetTsid: tsid, classTsid: cls, count: n, x: bot.x + dx, y: groundYAt(engine, bot.x + dx), droppedAt: Date.now() });
      }
      engine.droppedItemsChanged?.();
      engine.refreshPack?.();
      autoplay.phase = 'queue';
      say('dropped');
      return later(1200);
    }
    case 'queue':
      if (!specsReady) return later(300);
      openPanel(engine);
      autoplay.phase = 'tools';
      say('panel');
      return later(700);
    case 'tools':
      panel.querySelector('[data-cb-add]')?.click();
      autoplay.phase = 'tool';
      return later(700);
    case 'tool':
      panel.querySelector('[data-cb-tool="fruit_changing_machine"]')?.click();
      autoplay.phase = 'recipe';
      return later(700);
    case 'recipe':
      panel.querySelector('[data-cb-recipe="apple"]')?.click();
      autoplay.phase = 'qty';
      return later(700);
    case 'qty': {
      const input = panel.querySelector('[data-cb-qty]');
      if (input) {
        input.value = '3';
        input.dispatchEvent(new Event('change'));
      }
      autoplay.phase = 'add';
      return later(700);
    }
    case 'add':
      panel.querySelector('[data-cb-queue="apple"]')?.click();
      autoplay.phase = 'wait';
      say('working');
      return later(1000);
    case 'wait': {
      const job = bot.queue.find((r) => r.item === 'apple');
      if (demo?.kind === 'fuel' && job?.halted) {
        say('halted');
        autoplay.phase = 'refuel';
        return later(1500);
      }
      if (!job || job.crafted < Math.min(job.count, 3)) return later(500);
      if (autoplay.mode === 'hold') {
        say('ready');
        autoplay = null;
        return;
      }
      autoplay.phase = 'collect';
      return later(800);
    }
    case 'refuel':
      if (autoplay.mode === 'hold') {
        autoplay = null;
        return;
      }
      refuel(engine);
      autoplay.phase = 'wait';
      say('refueled');
      return later(800);
    case 'collect': {
      const btn = panel.querySelector('[data-cb-collect="apple"]');
      if (btn) btn.click();
      autoplay.phase = 'done';
      return later(600);
    }
    case 'done':
      say('done');
      autoplay = null;
      return;
    default:
      autoplay = null;
  }
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

export const craftybotFeature = {
  id: CRAFTYBOT_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    ensureItems();
    loadSpecs().then(() => {
      if (bot.owned) {
        const world = makeWorld(engine);
        rebuildAll(bot, world);
        step(engine);
      }
      publish(engine);
    });
    publish(engine);
  },

  save() {
    return serializeCraftybotState(bot);
  },

  restore(slice) {
    bot = normalizeCraftybotState(slice || {});
    // The pack copy is the bot itself.
    realLast = 0;
    lastSig = null;
  },

  onStreetClear() {
    clearView();
  },

  /**
   * G226 (homes-feature shiftShownRoom): the house moved `dx` in that room's
   * world x (a back-yard or left street expansion), so a bot standing there
   * moves with it, as items keep their place beside the house in the source.
   */
  homeRoomShifted(room, dx, engine) {
    if (shiftBotX(bot, room, dx)) {
      lastSig = null;
      publish(engine);
    }
    return null;
  },

  onTick(dtMs, t, engine) {
    if (!engine.started) return;
    const room = currentRoom(engine);
    if (room && !view) {
      demoSetup(engine);
      spawnView(engine, room);
      publish(engine);
    }
    if (pendingOpenAt && performance.now() >= pendingOpenAt) finishOpen(engine);
    if (bot.owned && specsReady) {
      const clock = now(engine);
      if (performance.now() - lastSigAt > 1000) {
        lastSigAt = performance.now();
        checkSource(engine);
      }
      step(engine, clock);
      if (view?.bot) {
        syncAnim(engine, clock);
        if (view.bot.overlay && performance.now() > view.bot.overlayUntil) {
          view.bot.overlay.destroy({ children: true });
          view.bot.overlay = null;
        }
        // onPlayerCollision while asleep: peek.
        const p = engine.player;
        if (p && bot.craftState === 'sleep' && Math.abs(p.x - view.bot.container.x) < 70) {
          const world = makeWorld(engine);
          if (peek(bot, world)) publish(engine);
        }
      }
      if (performance.now() - lastPanelAt > 400) {
        lastPanelAt = performance.now();
        renderPanel(engine);
        publish(engine);
      }
    }
    autoplayStep(engine);
  },

  verbsFor(target, engine) {
    if (target.classId === BOX) {
      // butler_box.js: read label until it is read, then only open.
      return bot.boxRead
        ? [{ id: 'open', label: 'open', enabled: true, tooltip: 'Open the box', durationMs: 0 }]
        : [{ id: 'read_label', label: 'read label', enabled: true, tooltip: 'Read the label', durationMs: 0 }];
    }
    if (target.classId === BOT) return botVerbs(engine, false);
    return null;
  },

  runVerb(target, verbId, engine) {
    if (target.classId === BOX) {
      if (verbId === 'read_label') readLabel(engine);
      else if (verbId === 'open') openBox(engine);
      return true;
    }
    if (target.classId === BOT) return runBotVerb(engine, verbId);
    return false;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== BOT || bot.where !== 'pack') return [];
    return botVerbs(engine, true);
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== BOT) return false;
    return runBotVerb(engine, verbId);
  },

  /** QA / tests. */
  _state() {
    return { bot, view, panelState, specsReady };
  },
  _world(engine) {
    return makeWorld(engine);
  },
  _menu(engine) {
    return menuRecipes(engine);
  },
};
