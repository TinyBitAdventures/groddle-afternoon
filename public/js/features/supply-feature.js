/**
 * Item supply: the pack verbs that close the source's production chains.
 *
 *  - Machine Stand: Assemble a Woodworker / Metalmaker / Fuelmaker /
 *    Blockmaker from the stand and three vendor parts (js/machines.js).
 *  - Machines: Refuel from pack Fuel Cells (+50 each, 200 max). Machine
 *    recipes burn the tank, so a Fuelmaker keeps every machine running.
 *  - Sounds: the stand and each part while a machine is put together, each
 *    part as it is taken apart (js/machines.js assemblySounds), the hopper
 *    lid on Distill, the Still's chime on Collect, and its done chime
 *    (STILL_READY) at the moment a Still runs dry or fills up (still.js
 *    400-418 finishWorking: the last Hooch it can make is made), for the
 *    player in the place the Still stands in (the owner in a house, everyone
 *    there on a street). A Still that stopped while the game was closed, the
 *    tab asleep or the player elsewhere does not ring late.
 *  - Still (#285): it works on the ground only, as in the source (still.js
 *    getDescExtras 545; verbs.collect and verbs.distill refuse in the pack,
 *    "You must first Drop this to use it.", 134-136, 208-210). Dropped, it
 *    has Distill (which grain, how many, room in the hopper), Collect (4 s,
 *    the collect clip, then the Hooch) and Pick up; its hopper and Hooch are
 *    the dropped stack's own words (js/world-items.js tags[0]), so they lie
 *    with it, keep working while you are away (one Hooch every 140 s) and
 *    come back into the pack with it, where it stops (onPickup 488-493). Put
 *    down with grain in it, it starts 2 s later (onDrop 482-486). Its art is
 *    Tiny Speck's four states (js/still-art.js). A crop dragged from the pack
 *    onto it distills (drop_ok_code, js/world-drop.js).
 *  - Butterfly Milk, Butter, the four Cheeses and every herb: Shake,
 *    Compress, Age, Poke and Shuck (js/item-transforms.js).
 *  - Your Papers and General Building Permits for those with Bureaucratic
 *    Arts, and a Card-Carrying Qualification for anyone without its badge
 *    (js/bureaucracy.js). Inside the Bureaucratic Halls the bureaucrats sell
 *    them through the hall's visit (bureaucratic-halls-feature.js,
 *    js/bureaucratic-hall.js); the clerk verbs here are the QA street clerk's.
 *    Complete Your Papers in the pack for the You Have Papers badge.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&supplydemo=1 grants a Machine Stand,
 *     every part, Fuel Cells, a Still with Grain, Butterfly Milk, herbs and
 *     the skills, and drops the Still beside you (3 Hooch made);
 *     &supplyautoplay=1 assembles all four machines, refuels one, distills
 *     into the dropped Still, collects (4 s), shakes, compresses, ages and
 *     shucks. Canvas: data-supply-machines, data-supply-fuel, data-supply-still
 *     (the dropped Still here, else the first in the pack: hopper, hooch,
 *     working, ground, art), data-supply-last, data-supply-autoplay.
 *     &supplystillsoon=<seconds> starts the demo Still on its last Hooch, done in
 *     that many seconds (data-supply-still-ready counts the done chimes).
 *     &supplystill=pack keeps the demo Still in the pack; &supplystill=empty
 *     starts it empty.
 *     Clerk: ?autostart=1&fresh=1&resetgame=1&streetdemo=GLI32G3NUTD100I&supplydemo=clerk
 *     puts a Bureaucrat beside you on the street, for QA only
 *     (&supplyautoplay=1 buys Your Papers, completes them, buys a permit;
 *     data-supply-permits).
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem } from '../inventory.js?v=f49c8998';
import { getToolCondition, copyForVerb, copyTag, copyTags, migrateClassTag, setCopyTag } from '../tools.js?v=48542c24';
import {
  MACHINE_ASSEMBLIES,
  MACHINE_IDS,
  MACHINE_PART_ITEMS,
  MACHINE_STAND,
  MAX_FUEL,
  STILL,
  advanceStill,
  assemblyCheck,
  collectHooch,
  createStillState,
  disassemblyCheck,
  distillInStill,
  finishMachineWork,
  isMachine,
  machineWorkSounds,
  startAssembly,
  startDisassembly,
  refuelCheck,
  refuelMachine,
  STILL_COLLECT_MS,
  STILL_DROP_START_MS,
  STILL_TEXT,
  stillCollectCheck,
  stillCollectTip,
  stillDistillCheck,
  stillDistillChoices,
  stillDistillTip,
  stillOnCollectStart,
  stillOnPickup,
  stillStopsAt,
  stillWaitsToStart,
} from '../machines.js?v=e96d8d3b';
import { STILL_ART_BOX, STILL_ART_CELL, stillArtFrame, stillArtState, stillSheetDef } from '../still-art.js?v=2eeb65ff';
import { createSheetLoader } from '../sprite-sheets.js?v=b4abfbf2';
import { HERB_SEEDS, ITEM_TRANSFORMS, listTransformVerbs, runTransform, transformVerbCount } from '../item-transforms.js?v=07b416a3';
import {
  BUREAUCRACY_ITEMS,
  HALL_STREETS,
  PAPERS,
  buyDocument,
  clerkOffers,
  completePapers,
  completePapersCheck,
} from '../bureaucracy.js?v=b71fdd01';
import { frameTexture, sourceFromUrl } from '../textures.js?v=814d7926';
import { setMetalMakingMusic } from '../sound-moments.js?v=d7ea4f12';
import { itemZ } from '../item-bands.js?v=e98b10bc';

export const SUPPLY_FEATURE_ID = 'supply';
export const CLERK_CLASS = 'npc_bureaucrat';
const CLERK_ART = 'assets/sprites/quests/legalize/npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_idle1_png_1354832995.webp';
const CLERK_FRAME = { w: 97, h: 89 };

/** Items the chains need that no other module registers with source text. */
const EXTRA_ITEMS = {
  small_worthless: {
    label: 'Small shiny object with no intrinsic value',
    desc: 'Shiny, but you can barely see the shine so it ends up a little dull. Totally worthless: it has no purpose. Holding on to this little object simply cannot be recommended.',
    baseCost: 0,
  },
};

/*
 * Each Still's hopper and Hooch are its own (still.js 30-31: hooch and hopper_amount are instance
 * props), kept as that copy's words in js/tools.js (row.tags; 2026-11-04: one hopper for every Still
 * made a second Still, or one bought after one was sold, come with the first one's Hooch). `still` is
 * the Still a verb is working on (loadStill), and the only one for an engine with no tool state.
 */
let still = createStillState();

function keepsStills(engine) {
  return Boolean(engine?.toolState && countItem(engine.inv, STILL.classTsid) > 0);
}

/** Load Still `copy` (null: the first) into `still`; returns its place, or -1. */
function loadStill(engine, copy = null) {
  if (!keepsStills(engine)) return -1;
  const at = copyForVerb(engine.toolState, STILL.classTsid, copy);
  if (at < 0) return -1;
  still = createStillState(copyTag(engine.toolState, STILL.classTsid, at) || {});
  advanceStill(still);
  return at;
}

/** Write `still` back to its copy. */
function storeStill(engine, at) {
  if (at < 0 || !engine?.toolState) return;
  const empty = !still.hopper && !still.hooch && !still.workingSince;
  setCopyTag(engine.toolState, STILL.classTsid, at, empty ? null : { ...still });
}

/*
 * A Still in the pack does not work (still.js onPickup 488-493 cancels its timers). A pack copy
 * still marked as working (one picked up a moment ago, or an older save's, when Stills worked in
 * the pack) is counted up to now and stopped there, so its Hooch is kept and goes down with it.
 */
let stillWatchedAt = 0;
/** The watcher looks four times a second: the chime is a moment, not a frame. */
const STILL_WATCH_MS = 250;
/** A stop noticed more than this late (the game was closed, the tab asleep) passes in silence. */
const STILL_READY_LATE_MS = 2000;

function stopPackStills(engine, now) {
  if (!keepsStills(engine)) return false;
  let changed = false;
  copyTags(engine.toolState, STILL.classTsid).forEach((tag, at) => {
    if (!tag?.workingSince) return;
    const state = stillOnPickup(createStillState(tag), now);
    setCopyTag(engine.toolState, STILL.classTsid, at, !state.hopper && !state.hooch ? null : { ...state });
    changed = true;
  });
  return changed;
}

/*
 * Stills on the ground (#285): the dropped stacks of class still in this place, each holding its
 * hopper and Hooch as its own words (tags[0], js/world-items.js), so they persist, travel with the
 * stack and come back into the pack with it (game.js arrivingToolPoints). A stack shared with the
 * street online is not one (drops-mp keeps a Still the player's own: js/drops-mp.js shareReason).
 */
function groundRows(engine, tsid = engine?.dropTsid) {
  const rows = tsid ? engine?.droppedItems?.streets?.[tsid] : null;
  return Array.isArray(rows) ? rows.filter((r) => r?.classTsid === STILL.classTsid && !r.shared && r.count === 1) : [];
}

function groundRecord(engine, id, tsid = engine?.dropTsid) {
  return groundRows(engine, tsid).find((r) => r.id === id) || null;
}

/**
 * `ready`: finishWorking set the Still's state to 'ready' since it was put down (still.js 409),
 * kept until the next state change; a Still picked up is 'empty' (onPickup 489) and nothing sets
 * another state on drop (onDrop 482-486) or on load (onContainerChanged 468-472 only on creation),
 * so a dropped Still shows empty until it starts working or a run of its finishes.
 */
function groundState(record) {
  const tag = (Array.isArray(record?.tags) && record.tags[0]) || {};
  return { ...createStillState(tag), ready: tag.ready === true };
}

/** finishWorking for a run that ended (or ended while nobody looked): its Hooch, and the 'ready' state. */
function settleGround(state, now = Date.now()) {
  const stopsAt = stillStopsAt(state);
  if (!stopsAt || now < stopsAt) return false;
  advanceStill(state, now);
  state.ready = true;
  return true;
}

function writeGround(record, state) {
  const tags = Array.isArray(record.tags) ? record.tags.slice() : [];
  // A working Still is 'active' (startWorking 521); 'ready' lasts until then.
  const ready = Boolean(state.ready && !state.workingSince);
  tags[0] = !state.hopper && !state.hooch && !state.workingSince && !ready ? null : { hopper: state.hopper, hooch: state.hooch, workingSince: state.workingSince, ...(ready ? { ready: true } : {}) };
  if (tags.some((t) => t != null)) record.tags = tags;
  else delete record.tags;
}

const groundKey = (tsid, id) => `${tsid}|${id}`;

function isGroundStill(target) {
  return target?.classId === 'dropped_item' && target.state?.classTsid === STILL.classTsid && !target.state?.shared && Number(target.state?.count) === 1;
}

/** In someone else's house (pols_is_pol and not the owner). */
function othersHome(engine) {
  const home = engine?.homeContext?.();
  return Boolean(home?.inHome && home.owned === false);
}

/** The 4 s collect under way (still.js give_pc and its giveHooch timer): { key, tsid, id, at, inHome }. */
let collecting = null;
/** When each working Still here will stop, for the done chime; keyed by groundKey. */
const groundStops = new Map();
/** When each idle Still with grain in it was first seen (onDrop's 2 s), keyed by groundKey. */
const groundWaiting = new Map();
let groundTsid = '';
let stillChimes = 0;

/** finishWorking's chime, for the player in the place the Still stands in, and its 2 s start. */
function watchGround(engine, now) {
  const tsid = engine?.dropTsid || '';
  if (tsid !== groundTsid) {
    groundTsid = tsid;
    groundStops.clear();
    groundWaiting.clear();
  }
  let changed = false;
  let rang = false;
  for (const rec of groundRows(engine, tsid)) {
    const key = groundKey(tsid, rec.id);
    if (collecting?.key === key) {
      groundStops.delete(key);
      groundWaiting.delete(key);
      continue;
    }
    const state = groundState(rec);
    if (stillWaitsToStart(state)) {
      const since = groundWaiting.get(key) ?? now;
      groundWaiting.set(key, since);
      if (now - since >= STILL_DROP_START_MS) {
        // startWorking at the timer's moment (never a time ahead of now: js/copy-tags.js cleanStill).
        state.workingSince = Math.min(now, since + STILL_DROP_START_MS);
        writeGround(rec, state);
        groundWaiting.delete(key);
        changed = true;
      }
      continue;
    }
    groundWaiting.delete(key);
    const stopsAt = stillStopsAt(state);
    if (stopsAt && now < stopsAt) {
      groundStops.set(key, stopsAt);
      continue;
    }
    const due = stopsAt || groundStops.get(key) || 0;
    groundStops.delete(key);
    if (stopsAt) {
      settleGround(state, now);
      writeGround(rec, state);
      changed = true;
    }
    if (due && now >= due && now - due <= STILL_READY_LATE_MS) rang = true;
  }
  if (changed) engine.droppedItemsChanged?.();
  if (!rang) return changed;
  // still.js 410-417: the owner standing in the house, or everyone on the street; one chime however many stop.
  stillChimes += 1;
  engine.playSound?.('STILL_READY', { volume: 0.55 });
  engine.setData?.('supplyStillReady', String(stillChimes));
  return true;
}

function watchStills(engine, now = Date.now()) {
  if (now >= stillWatchedAt && now - stillWatchedAt < STILL_WATCH_MS) return;
  stillWatchedAt = now;
  const pack = stopPackStills(engine, now);
  const ground = watchGround(engine, now);
  if (pack) engine.refreshPack?.();
  if (pack || ground) publish(engine);
}

/** Collect (still.js verbs.collect handler 159-167): the collect clip, the chime, and the Hooch 4 s later. */
function startCollect(engine, target) {
  const tsid = engine.dropTsid;
  const rec = groundRecord(engine, target.state.id, tsid);
  if (!rec) return say(engine, 'That stack has already been picked up.', false);
  const key = groundKey(tsid, rec.id);
  const state = groundState(rec);
  const check = stillCollectCheck(state, learned(engine), { onGround: true, collecting: collecting?.key === key, othersHome: othersHome(engine) });
  if (!check.ok) return say(engine, check.msg, false);
  stillOnCollectStart(state);
  writeGround(rec, state);
  const now = Date.now();
  collecting = { key, tsid, id: rec.id, at: now, inHome: Boolean(engine.homeContext?.().inHome) };
  engine.playSound?.('STILL_COLLECT', { volume: 0.6 });
  engine.droppedItemsChanged?.();
  publish(engine);
  return true;
}

/** giveHooch 445-466: the Hooch into the pack, then on with the hopper or empty. */
function settleCollect(engine, now = Date.now()) {
  if (!collecting || now - collecting.at < STILL_COLLECT_MS) return;
  const done = collecting;
  collecting = null;
  const rec = groundRecord(engine, done.id, done.tsid);
  if (!rec) return publish(engine);
  const state = groundState(rec);
  const res = collectHooch(state, engine.inv, learned(engine), now);
  // giveHooch 458-464: on working (startWorking, 'active') or 'empty'.
  state.ready = false;
  writeGround(rec, state);
  // still.js:454-455 giveHooch: only Hooch collected in your own home (POL) counts.
  if (res.ok && done.inHome) engine.achievement?.('still:collected_in_pol', res.got);
  // still.js:453 giveHooch: quests_inc_counter('make_hooch', hooch) on every collect, for the
  // multiplayer quest that uses it (G329, js/quests-mp.js); solo has no quest that counts it.
  if (res.ok && res.got > 0 && engine.mode === 'multiplayer') engine.achievement?.('make_hooch', res.got);
  engine.updateHud?.();
  engine.droppedItemsChanged?.();
  say(engine, res.msg, res.ok);
  engine.save?.();
}

/** Distill (still.js verbs.distill handler 273-376) into a Still on the ground: `n` of `cls`. */
function distillGround(engine, target, cls, n) {
  const rec = groundRecord(engine, target.state.id);
  if (!rec) return say(engine, 'That stack has already been picked up.', false);
  const state = groundState(rec);
  const check = stillDistillCheck(state, engine.inv, learned(engine), { onGround: true });
  if (!check.ok) return say(engine, check.msg, false);
  settleGround(state);
  const res = distillInStill(state, engine.inv, cls, learned(engine), Date.now(), upgrades(engine), n);
  if (res.ok) {
    writeGround(rec, state);
    // still.js:370: the hopper lid.
    engine.playSound?.('FUELMAKER_LOAD_OPEN');
    engine.updateHud?.();
    engine.droppedItemsChanged?.();
    engine.save?.();
  }
  return say(engine, res.msg, res.ok);
}

/*
 * The art (js/still-art.js): each Still drawn on the ground gets the state sheet its contents call
 * for, on a child sprite at the cell's registration; its hit box is the resting art's 68 x 100.
 */
let sheets = null;
let dressed = [];

function dressStill(engine, spr, stack) {
  if (!engine?.PIXI || !spr || stack?.classTsid !== STILL.classTsid || stack.shared || stack.count !== 1) return false;
  sheets ||= createSheetLoader(engine.PIXI);
  spr._worldHitW = STILL_ART_BOX.w;
  spr._worldHitH = STILL_ART_BOX.h;
  const art = new engine.PIXI.Sprite();
  art.label = 'still-art';
  art.anchor.set(STILL_ART_CELL.ax / STILL_ART_CELL.fw, STILL_ART_CELL.ay / STILL_ART_CELL.fh);
  art.eventMode = 'none';
  art.visible = false;
  spr.addChild(art);
  dressed.push({ spr, art, id: stack.id, look: '', since: 0, plain: spr.texture });
  return true;
}

function drawStills(engine, now) {
  if (!dressed.length) return;
  dressed = dressed.filter((d) => !d.spr.destroyed && !d.art.destroyed);
  const tsid = engine.dropTsid;
  for (const d of dressed) {
    const rec = groundRecord(engine, d.id, tsid);
    if (!rec) continue;
    const key = groundKey(tsid, d.id);
    const busy = collecting?.key === key;
    const look = stillArtState(groundState(rec), { collecting: busy, now });
    if (look !== d.look) {
      d.look = look;
      d.since = busy ? collecting.at : now;
    }
    const def = stillSheetDef(look);
    if (!sheets.ready(def)) {
      sheets.load(def);
      continue;
    }
    const frames = sheets.frames(def);
    const tex = frames[stillArtFrame(look, now - d.since)];
    if (!tex) continue;
    d.art.texture = tex;
    if (!d.art.visible) {
      d.art.visible = true;
      // The sheet stands in for the resting art (the stack's sprite keeps its size and hit box).
      d.spr.texture = engine.PIXI.Texture.EMPTY;
    }
    d.spr._stillArt = look;
  }
}

/** The copy the pack menu is about while its verbs are drawn or run (feature-host opts.copy). */
let pickedStill = null;
/** Machine parts being installed or uninstalled: { kind, machine, energy, ms, readyAt, full? }. */
let work = null;
/** The part sounds of that work still to play: { startAt, plan: [{ atMs, key }], next }. */
let workSounds = null;
/** A part sound more than this late (a tab asleep, a reload) is skipped, so nothing plays in a burst. */
const WORK_SOUND_LATE_MS = 600;
/** metalmaker.js music_on: on by default, toggled by Turn Music Off / On. */
let metalMusicOn = true;
let last = '';
let demoDone = false;
let demoDropPending = false;
let autoplayAt = 0;
let autoplayDone = false;
let clerk = null;

function achievements(engine) {
  return engine.unlockedAchievements || [];
}

function spawnClerk(engine, point) {
  const { PIXI } = engine;
  const base = sourceFromUrl(CLERK_ART);
  const spr = new PIXI.Sprite(frameTexture(base, new PIXI.Rectangle(0, 0, CLERK_FRAME.w, CLERK_FRAME.h)));
  spr.anchor.set(0.5, 1);
  spr.x = point.x;
  spr.y = point.y + 2;
  // npc_bureaucrat is a foreground item: in front of the trees and the project sign.
  spr.zIndex = itemZ(CLERK_CLASS, 0);
  spr._worldHitW = 60;
  spr._worldHitH = 90;
  engine.entityLayer.addChild(spr);
  const target = engine.register({
    classId: CLERK_CLASS,
    featureId: SUPPLY_FEATURE_ID,
    label: 'Bureaucrat',
    subtitle: `Bureaucratic Hall, ${HALL_STREETS[engine.streetTsid] || 'clerk'}`,
    sprite: spr,
  });
  clerk = { sprite: spr, target };
  engine.setData?.('supplyClerk', `${Math.round(spr.x)},${Math.round(spr.y)}`);
}

function learned(engine) {
  return engine.learnedSkills || [];
}

function upgrades(engine) {
  return engine.pc?.imaginationUpgrades || [];
}

function workReason() {
  return work ? (work.kind === 'assemble' ? 'Installing parts…' : 'Uninstalling parts…') : '';
}

function syncMetalMusic(engine) {
  setMetalMakingMusic(upgrades(engine).includes('metalmaking_music') && metalMusicOn);
}

/** Line up the part sounds of the work just started (js/machines.js assemblySounds / disassemblySounds). */
function cueWorkSounds(pending) {
  const plan = machineWorkSounds(pending);
  workSounds = plan.length ? { startAt: pending.readyAt - pending.ms, plan, next: 0 } : null;
}

/** Play each part's sound as its moment in the install comes (items/<machine>.js announce_sound_to_all). */
function playWorkSounds(engine, now) {
  if (!work || !workSounds) return;
  const t = now - workSounds.startAt;
  while (workSounds.next < workSounds.plan.length && workSounds.plan[workSounds.next].atMs <= t) {
    const cue = workSounds.plan[workSounds.next];
    workSounds.next += 1;
    if (t - cue.atMs <= WORK_SOUND_LATE_MS) engine.playSound?.(cue.key);
  }
}

/** Finish the installing / uninstalling overlay once its time is up. */
function settleWork(engine, now = Date.now()) {
  if (!work || now < work.readyAt) return;
  const done = work;
  work = null;
  workSounds = null;
  const res = finishMachineWork(engine.inv, engine.toolState, done);
  if (!res.ok) return;
  // metalmaker.js:1386 and siblings: machines_assembled:<machine>.
  if (done.kind === 'assemble') engine.achievement?.(`machines_assembled:${done.machine}`, 1);
  // G443: machine_stand.js 797-808 onDisassembled: Machine Shop Pit Stop's second half.
  else engine.achievement?.(`machines_disassembled:${done.machine}`, 1);
  engine.updateHud?.();
  say(engine, res.msg, true);
  engine.save?.();
}

function label(id) {
  return ITEM_CATALOG[id]?.label || MACHINE_PART_ITEMS[id]?.label || id;
}

function say(engine, msg, ok = true) {
  last = msg;
  engine.pushActivity?.(msg);
  engine.toast?.(msg, ok ? 2600 : 2400);
  engine.refreshPack?.();
  publish(engine);
}

function publish(engine) {
  if (!engine?.setData) return;
  const inv = engine.inv || {};
  engine.setData('supplyMachines', MACHINE_IDS.filter((id) => countItem(inv, id) > 0).join(',') || 'none');
  engine.setData(
    'supplyFuel',
    MACHINE_IDS.filter((id) => countItem(inv, id) > 0)
      .map((id) => `${id}:${getToolCondition(engine.toolState, id).remaining}`)
      .join(',') || 'none'
  );
  // The dropped Still here (the first), else the first in the pack.
  const rec = groundRows(engine)[0];
  if (rec) {
    const ground = groundState(rec);
    settleGround(ground);
    const busy = collecting?.key === groundKey(engine.dropTsid, rec.id);
    engine.setData('supplyStill', `hopper=${ground.hopper},hooch=${ground.hooch},working=${ground.workingSince && ground.workingSince <= Date.now() ? 1 : 0},ground=1,art=${stillArtState(ground, { collecting: busy })}`);
  } else {
    const shown = loadStill(engine, null);
    advanceStill(still);
    if (shown >= 0) storeStill(engine, shown);
    engine.setData('supplyStill', `hopper=${still.hopper},hooch=${still.hooch},working=${still.workingSince ? 1 : 0},ground=0`);
  }
  engine.setData('supplyLast', last || 'none');
}

function machineVerbs(classTsid, engine) {
  const inv = engine.inv;
  if (classTsid === MACHINE_STAND) {
    return MACHINE_IDS.map((machine) => {
      const check = assemblyCheck(inv, engine.pc, machine, learned(engine), upgrades(engine));
      const def = MACHINE_ASSEMBLIES[machine];
      const ok = check.ok && !work;
      return {
        id: `assemble:${machine}`,
        label: `Assemble a ${def.label}`,
        enabled: ok,
        reason: work ? workReason() : check.msg || '',
        tooltip: `Stand + ${def.parts.map(label).join(' + ')}. ${check.energy ? `Takes ${check.energy} energy.` : 'Master Assembler: no energy.'}`,
        primary: ok,
      };
    });
  }
  if (isMachine(classTsid)) {
    const fuel = getToolCondition(engine.toolState, classTsid).remaining;
    // metalmaker.js turn_off_music / turn_on_music, only with Making Metal.
    const music = classTsid === 'metalmaker' && upgrades(engine).includes('metalmaking_music')
      ? [metalMusicOn
        ? { id: 'music:off', label: 'Turn Music Off', enabled: true, tooltip: 'Stop playing Metal Music while the machine is working' }
        : { id: 'music:on', label: 'Turn Music On', enabled: true, tooltip: 'Play Metal Music while the machine is working' }]
      : [];
    const one = refuelCheck(inv, engine.toolState, classTsid);
    const rows = [
      { id: 'refuel:1', label: 'Refuel', enabled: one.ok, reason: one.msg || '', tooltip: `Add more fuel. Current level: ${fuel}/${MAX_FUEL}`, primary: one.ok },
    ];
    if (one.ok && one.cells > 1) rows.push({ id: 'refuel:all', label: `Refuel with ${one.cells} cells`, enabled: true, tooltip: `Fill the tank. Current level: ${fuel}/${MAX_FUEL}` });
    rows.push(...music);
    // machine_base disassemble (one part at a time, 15 energy each) and
    // Master Exploder's fully_disassemble (15 energy, one go).
    const busy = Boolean(work) || Boolean(engine.acting?.());
    const apart = disassemblyCheck(inv, engine.pc, classTsid, learned(engine), upgrades(engine), { busy });
    rows.push({
      id: 'disassemble',
      label: 'Disassemble',
      enabled: apart.ok,
      reason: work ? workReason() : apart.msg || '',
      tooltip: `Uninstall every part, back to a Machine Stand. Takes ${apart.energy ?? 45} energy; the fuel is lost.`,
    });
    if (upgrades(engine).includes('engineering_disassemble_machine')) {
      const full = disassemblyCheck(inv, engine.pc, classTsid, learned(engine), upgrades(engine), { busy, full: true });
      rows.push({
        id: 'disassemble:full',
        label: 'Fully disassemble',
        enabled: full.ok,
        reason: work ? workReason() : full.msg || '',
        tooltip: 'Fully disassemble the machine. Takes 15 energy.',
      });
    }
    return rows;
  }
  if (classTsid === STILL.classTsid) {
    // In the pack both rows stay, refused (still.js verbs.collect 130-136, verbs.distill 208-213:
    // "You must first Drop this to use it."), with the source's tooltips for this Still's contents.
    const at = loadStill(engine, pickedStill);
    advanceStill(still);
    if (at >= 0) storeStill(engine, at);
    const collect = stillCollectCheck(still, learned(engine), { onGround: false });
    const distill = stillDistillCheck(still, inv, learned(engine), { onGround: false });
    return [
      { id: 'collect', label: 'Collect', enabled: false, reason: collect.msg, tooltip: stillCollectTip(still) },
      { id: 'distill', label: 'Distill', enabled: false, reason: distill.msg, tooltip: stillDistillTip(still) },
    ];
  }
  return null;
}

function runMachineVerb(classTsid, verbId, engine) {
  const inv = engine.inv;
  const [verb, arg] = String(verbId).split(':');
  if (classTsid === MACHINE_STAND && verb === 'assemble') {
    if (work) return true;
    const res = startAssembly(inv, engine.pc, arg, learned(engine), upgrades(engine));
    if (res.ok) {
      work = res.pending;
      engine.updateHud?.();
      // machine_stand.js 693: the stand's assembly starts with STAND1; then each part, in its turn.
      engine.playSound?.('STAND1');
      cueWorkSounds(work);
      settleWork(engine);
    }
    say(engine, res.ok && work ? `${res.msg} (${(res.durationMs / 1000).toFixed(0)} s)` : res.msg, res.ok);
    return true;
  }
  if (classTsid === 'metalmaker' && verb === 'music') {
    metalMusicOn = arg === 'on';
    syncMetalMusic(engine);
    say(engine, metalMusicOn ? 'The Metalmaker will play Metal Music while it works.' : 'The Metalmaker will work without Metal Music.', true);
    return true;
  }
  if (isMachine(classTsid) && verb === 'disassemble') {
    if (work) return true;
    const busy = Boolean(engine.acting?.());
    const res = startDisassembly(inv, engine.pc, classTsid, learned(engine), upgrades(engine), { full: arg === 'full', busy });
    if (res.ok) {
      work = res.pending;
      cueWorkSounds(work);
      engine.updateHud?.();
    }
    say(engine, res.ok ? `${res.msg} (${(res.durationMs / 1000).toFixed(1).replace(/\.0$/, '')} s)` : res.msg, res.ok);
    return true;
  }
  if (isMachine(classTsid) && verb === 'refuel') {
    const res = refuelMachine(inv, engine.toolState, classTsid, { all: arg === 'all' });
    if (res.ok) engine.achievement?.('machines:refueled', res.cells);
    say(engine, res.msg, res.ok);
    return true;
  }
  if (classTsid === STILL.classTsid && (verb === 'distill' || verb === 'collect')) {
    // A Still works on the ground only (#285): the pack's rows refuse.
    loadStill(engine, pickedStill);
    const check = verb === 'collect' ? stillCollectCheck(still, learned(engine), { onGround: false }) : stillDistillCheck(still, inv, learned(engine), { onGround: false });
    say(engine, check.msg, false);
    return true;
  }
  return false;
}

function transformVerbs(classTsid, engine, opts = {}) {
  if (!ITEM_TRANSFORMS[classTsid] && !HERB_SEEDS[classTsid]) return null;
  return listTransformVerbs(classTsid, engine.inv, engine.pc, learned(engine), { stackCount: opts?.stackCount });
}

function runTransformVerb(classTsid, verbId, engine) {
  if (!ITEM_TRANSFORMS[classTsid] && !HERB_SEEDS[classTsid]) return false;
  const [verb] = String(verbId).split(':');
  // `<verb>:<n>` from the How many chooser (report #101), `:1`, or `:all` (the supply demo).
  const res = runTransform(classTsid, verb, transformVerbCount(verbId), engine.inv, engine.pc, learned(engine));
  // G444: gandlevery.js 359-372: the seeds that landed count seeds_extracted (Shucks To Be You).
  if (res.ok && HERB_SEEDS[classTsid] && res.got > 0 && res.out) engine.achievement?.(`herb_seeds_extracted:${res.out}`, res.got);
  // items/item.js 719-739 notifyVerb after a handler that succeeded: quests count VERB:<class>:<verb>
  // by the verb's count (the `<class>:<verb>` event, quest-offers.js COUNTER_ROUTES 'verbs'), and the
  // badges VERB:<verb>:<class>. Ticket 88: Seeker of the Shiny counts its Very Stinky Cheese pokes.
  if (res.ok && ITEM_TRANSFORMS[classTsid] && res.count > 0) {
    engine.achievement?.(`${classTsid}:${verb}`, res.count);
    engine.achievement?.(`VERB:${verb}:${classTsid}`, res.count);
  }
  // butterfly_butter.js:211: compressing Butterfly Butter into Cheese grants Cheesemongerer.
  if (res.ok && classTsid === 'butterfly_butter' && verb === 'compress') engine.grantAchievement?.('cheesemongerer');
  engine.updateHud?.();
  say(engine, res.msg, res.ok);
  return true;
}

function clerkDemo(engine) {
  for (const id of ['bureaucraticarts_1', 'bureaucraticarts_2']) engine.grantSkill?.(id);
  engine.grantAchievement?.('card_carrying_qualification');
  engine.pc.currants = Math.max(engine.pc.currants || 0, 1000);
  engine.updateHud?.();
  if (engine.param('supplyautoplay')) autoplayAt = Date.now() + 1200;
  publish(engine);
}

function demoSetup(engine) {
  const demo = engine.param?.('supplydemo');
  if (demoDone || !demo) return;
  demoDone = true;
  if (demo === 'clerk') return clerkDemo(engine);
  for (const id of ['engineering_1', 'woodworking_1', 'fuelmaking_1', 'blockmaking_1', 'metalwork_1', 'distilling_1', 'fiber_arts_1', 'herbalism_1']) {
    engine.grantSkill?.(id);
  }
  const grants = {
    machine_stand: 4,
    blockmaker_engine: 4,
    woodworker_fuser: 1,
    woodworker_chassis: 1,
    metalmaker_mechanism: 1,
    metalmaker_tooler: 1,
    fuelmaker_case: 1,
    fuelmaker_core: 1,
    blockmaker_chassis: 1,
    blockmaker_plates: 1,
    fuel_cell: 4,
    still: 1,
    grain: 30,
    milk_butterfly: 4,
    rookswort: 2,
  };
  for (const [id, n] of Object.entries(grants)) if (countItem(engine.inv, id) < n) addItem(engine.inv, id, n - countItem(engine.inv, id));
  // A Still that has already been working: three Hooch waiting. With supplystillsoon it is on
  // its last Hooch (one run's worth in the hopper), done in that many seconds.
  const soon = Number(engine.param?.('supplystillsoon'));
  still = Number.isFinite(soon) && soon > 0
    ? createStillState({ hopper: STILL.hoochCost, hooch: 3, workingSince: Date.now() - STILL.workMs + Math.round(soon * 1000) })
    : createStillState(engine.param?.('supplystill') === 'empty' ? {} : { hopper: 0, hooch: 3 });
  if (keepsStills(engine)) storeStill(engine, copyForVerb(engine.toolState, STILL.classTsid, null));
  // #285: a Still works on the ground, so the demo puts it down beside you (its contents go with it),
  // once the street is up (demoDrop, on the tick).
  demoDropPending = engine.param?.('supplystill') !== 'pack';
  engine.pc.energy = Math.max(engine.pc.energy || 0, 400);
  engine.pc.mood = Math.max(engine.pc.mood || 0, 200);
  engine.updateHud?.();
  if (engine.param('supplyautoplay')) autoplayAt = Date.now() + 1200;
  publish(engine);
}

/** The demo's Still, dropped beside the player when the game will take a drop. */
function demoDrop(engine) {
  if (!demoDropPending || !engine.player || !engine.dropPackStackAt) return;
  const res = engine.dropPackStackAt(STILL.classTsid, 1, (engine.player.x || 0) + 90, engine.player.y || engine.groundY || 0);
  if (res?.reason === 'not_started') return;
  demoDropPending = false;
  publish(engine);
}

function autoplay(engine) {
  autoplayDone = true;
  if (engine.param('supplydemo') === 'clerk') {
    const target = clerk?.target;
    if (target) supplyFeature.runVerb(target, 'buy:your_papers', engine);
    supplyFeature.runPackVerb(PAPERS, 'complete', engine);
    // grantSkill/grantAchievement settle synchronously; the permit needs both.
    if (target) supplyFeature.runVerb(target, 'buy:general_building_permit', engine);
    engine.setData('supplyAutoplay', 'done');
    engine.setData('supplyPermits', String(countItem(engine.inv, 'general_building_permit')));
    publish(engine);
    return;
  }
  const steps = [
    ...MACHINE_IDS.map((m) => [MACHINE_STAND, `assemble:${m}`]),
    ['woodworker', 'refuel:all'],
    ['milk_butterfly', 'shake:all'],
    ['butterfly_butter', 'compress:1'],
    ['cheese', 'age:1'],
    ['rookswort', 'shuck:1'],
  ];
  const results = [];
  // The dropped Still: Distill all the Grain that fits, then Collect (its Hooch comes 4 s later).
  const rec = groundRows(engine)[0];
  if (rec) {
    const target = { classId: 'dropped_item', state: { id: rec.id, classTsid: STILL.classTsid, count: 1 } };
    supplyFeature.runVerbOverride(target, `distill:grain:${countItem(engine.inv, 'grain')}`, engine);
    results.push(`distill=${last.slice(0, 24)}`);
    supplyFeature.runVerbOverride(target, 'collect', engine);
    results.push(`collect=${last.slice(0, 24)}`);
  }
  for (const [classTsid, verbId] of steps) {
    supplyFeature.runPackVerb(classTsid, verbId, engine);
    // The installing overlays take seconds; the demo does not wait for them.
    settleWork(engine, Infinity);
    results.push(`${verbId}=${last.slice(0, 24)}`);
  }
  engine.setData('supplyAutoplay', 'done');
  publish(engine);
  return results;
}

export const supplyFeature = {
  id: SUPPLY_FEATURE_ID,

  init(engine) {
    for (const [id, meta] of Object.entries(MACHINE_PART_ITEMS)) {
      ensureItem(id, { label: meta.label, desc: meta.desc, baseCost: meta.baseCost, isTool: meta.isTool === true, stackMax: id === 'still' ? 1 : undefined });
    }
    for (const [id, meta] of Object.entries(BUREAUCRACY_ITEMS)) ensureItem(id, { label: meta.label, desc: meta.desc, baseCost: meta.cost });
    for (const [id, meta] of Object.entries(EXTRA_ITEMS)) {
      if (!ITEM_CATALOG[id] || /^Item /.test(ITEM_CATALOG[id].desc || '')) ensureItem(id, meta);
    }
    publish(engine);
  },

  onStreetEnter(street, engine) {
    // The Bureaucrats stand inside the halls now; this one is the clerk QA route's.
    if (HALL_STREETS[engine.streetTsid] && engine.param?.('supplydemo') === 'clerk') {
      spawnClerk(engine, { x: (engine.player?.x || 0) + 90, y: engine.player?.y || engine.groundY });
    }
    demoSetup(engine);
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    syncMetalMusic(engine);
    if (work) {
      playWorkSounds(engine, now);
      settleWork(engine, now);
    }
    settleCollect(engine, now);
    watchStills(engine, now);
    drawStills(engine, now);
    if (demoDropPending) demoDrop(engine);
    if (autoplayAt && !demoDropPending && !autoplayDone && now >= autoplayAt) autoplay(engine);
  },

  packVerbs(classTsid, engine, opts = {}) {
    if (classTsid === STILL.classTsid) {
      pickedStill = opts?.copy ?? null;
      try {
        return machineVerbs(classTsid, engine) || [];
      } finally {
        pickedStill = null;
      }
    }
    if (classTsid === PAPERS) {
      const check = completePapersCheck(engine.inv, achievements(engine));
      return [{ id: 'complete', label: 'Complete', enabled: check.ok, reason: check.msg || '', tooltip: 'Fill these out and your papers will be "in order"', primary: check.ok }];
    }
    return machineVerbs(classTsid, engine) || transformVerbs(classTsid, engine, opts) || [];
  },

  runPackVerb(classTsid, verbId, engine, opts = {}) {
    if (classTsid === STILL.classTsid) {
      pickedStill = opts?.copy ?? null;
      try {
        return runMachineVerb(classTsid, verbId, engine);
      } finally {
        pickedStill = null;
      }
    }
    if (classTsid === PAPERS && verbId === 'complete') {
      const res = completePapers(engine.inv, achievements(engine));
      if (res.ok) engine.grantAchievement?.(res.badge);
      say(engine, res.msg, res.ok);
      return true;
    }
    if (runMachineVerb(classTsid, verbId, engine)) return true;
    return runTransformVerb(classTsid, verbId, engine);
  },

  /**
   * A Still on the ground (#285): Pick up (refused for the 4 s of a collect, canPickup 390-396),
   * Collect and Distill with the source's conditions, tooltips and refusals (still.js 110-377).
   */
  decorateVerbs(target, verbs, engine) {
    if (!isGroundStill(target)) return null;
    const rec = groundRecord(engine, target.state.id);
    if (!rec) return null;
    const state = groundState(rec);
    const busy = collecting?.key === groundKey(engine.dropTsid, rec.id);
    const out = verbs.map((v) => (v.id === 'pickup' && (busy || othersHome(engine))
      ? { ...v, enabled: false, reason: busy ? STILL_TEXT.collectingSelf : STILL_TEXT.stealing }
      : v));
    const collect = stillCollectCheck(state, learned(engine), { onGround: true, collecting: busy, othersHome: othersHome(engine) });
    out.push({ id: 'collect', label: 'collect', sort: 53, tooltip: stillCollectTip(state), enabled: collect.ok, reason: collect.msg, energy: 0, durationMs: 0 });
    const distill = stillDistillCheck(state, engine.inv, learned(engine), { onGround: true });
    out.push({ id: 'distill', label: 'distill', sort: 54, picker: 'distill', emptyMsg: STILL_TEXT.noChoices, tooltip: stillDistillTip(state), enabled: distill.ok, reason: distill.msg, energy: 0, durationMs: 0 });
    return out;
  },

  runVerbOverride(target, verbId, engine) {
    if (!isGroundStill(target)) return null;
    const [verb, cls, n] = String(verbId).split(':');
    if (verb === 'collect') {
      startCollect(engine, target);
      return true;
    }
    if (verb === 'distill' && cls) {
      distillGround(engine, target, cls, n ? Number(n) : Infinity);
      return true;
    }
    return null;
  },

  /** Distill's target-item step (valid_items 237-272): the grain that fits, and how many of each. */
  pickerChoices(target, verbId, engine) {
    if (verbId !== 'distill' || !isGroundStill(target)) return null;
    const rec = groundRecord(engine, target.state.id);
    if (!rec) return [];
    return stillDistillChoices(groundState(rec), engine.inv).map((c) => ({ classTsid: c.classTsid, label: label(c.classTsid), have: c.have }));
  },

  /** requires_target_item_count: Distill asks how many, up to what the hopper has room for (can_fit). */
  pickerMax(target, verbId, classTsid, engine) {
    if (verbId !== 'distill' || !isGroundStill(target)) return null;
    const rec = groundRecord(engine, target.state.id);
    const row = rec ? stillDistillChoices(groundState(rec), engine.inv).find((c) => c.classTsid === classTsid) : null;
    return row ? row.max : 0;
  },

  pickerTakesCount(target, verbId) {
    return verbId === 'distill' && isGroundStill(target) ? true : null;
  },

  /** drop_ok_code 192-201: a distillable the hopper has room for, dragged onto a Still on the ground. */
  stillTakes(target, classTsid, engine) {
    if (!isGroundStill(target)) return null;
    const rec = groundRecord(engine, target.state.id);
    return Boolean(rec && stillDistillChoices(groundState(rec), engine.inv).some((c) => c.classTsid === classTsid));
  },

  /** canPickup 386-398: not from someone else's house, not while a collect is under way. */
  groundPickupRefused(target, engine) {
    if (!isGroundStill(target)) return null;
    if (othersHome(engine)) return STILL_TEXT.stealing;
    return collecting?.key === groundKey(engine.dropTsid, target.state.id) ? STILL_TEXT.collectingSelf : null;
  },

  /** canDrop 379-384: no Still left in someone else's house. */
  packDropBlockReason(classTsid, engine) {
    return classTsid === STILL.classTsid && othersHome(engine) ? "This is someone else's house. Don't litter!" : null;
  },

  /** game.js spawnDroppedItemStack: a Still on the ground plays its state (js/still-art.js). */
  dressDroppedStack(spr, stack, engine) {
    return dressStill(engine, spr, stack) || null;
  },

  onStreetClear() {
    dressed = [];
    if (clerk?.sprite && !clerk.sprite.destroyed) clerk.sprite.destroy();
    clerk = null;
  },

  verbsFor(target, engine) {
    if (target.classId !== CLERK_CLASS) return null;
    return clerkOffers(engine.learnedSkills || [], achievements(engine)).map((o) => ({
      id: `buy:${o.classTsid}`,
      label: `buy ${o.label} (${o.cost}c)`,
      enabled: o.ok && (engine.pc.currants || 0) >= o.cost,
      reason: o.reason || `That will be ${o.cost} currants.`,
      tooltip: BUREAUCRACY_ITEMS[o.classTsid].desc,
      durationMs: 0,
    }));
  },

  runVerb(target, verbId, engine) {
    if (target.classId !== CLERK_CLASS) return false;
    const id = String(verbId).replace(/^buy:/, '');
    const res = buyDocument(engine.pc, engine.inv, id, engine.learnedSkills || [], achievements(engine));
    if (res.ok) engine.updateHud?.();
    say(engine, res.msg, res.ok);
    return true;
  },

  save() {
    advanceStill(still);
    // version 2: with a tool state each Still is saved as its copy's words; `still` is the fallback.
    return { version: 2, still: { ...still }, ...(work ? { work: { ...work } } : {}), ...(metalMusicOn ? {} : { metalMusic: false }) };
  },

  restore(slice, engine) {
    still = createStillState(slice?.still || {});
    advanceStill(still);
    // An older save's one Still state is the first Still's; any other Still starts empty.
    if ((slice?.version || 1) < 2 && engine?.toolState && keepsStills(engine) && (still.hopper || still.hooch || still.workingSince)) {
      migrateClassTag(engine.toolState, STILL.classTsid, { ...still });
    }
    metalMusicOn = slice?.metalMusic !== false;
    // A reload mid-install finishes the job (the overlays were seconds long).
    const saved = slice?.work;
    work = saved && MACHINE_ASSEMBLIES[saved.machine] && (saved.kind === 'assemble' || saved.kind === 'disassemble')
      ? { ...saved, readyAt: 0 }
      : null;
    workSounds = null;
    collecting = null;
    groundStops.clear();
    groundWaiting.clear();
    stillWatchedAt = 0;
  },

  /** QA / tests. */
  _state() {
    return { still: { ...still }, last, work: work ? { ...work } : null, collecting: collecting ? { ...collecting } : null };
  },
  _reset() {
    still = createStillState();
    work = null;
    workSounds = null;
    collecting = null;
    groundStops.clear();
    groundWaiting.clear();
    groundTsid = '';
    dressed = [];
    stillChimes = 0;
    stillWatchedAt = 0;
    metalMusicOn = true;
    last = '';
    demoDone = false;
    demoDropPending = false;
    autoplayAt = 0;
    autoplayDone = false;
  },
};
