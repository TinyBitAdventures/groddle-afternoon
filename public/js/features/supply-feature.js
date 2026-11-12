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
 *    400-418 finishWorking: the last Hooch it can make is made). The source
 *    rang that for the owner standing in the house the Still was in, or for
 *    everyone on a street; this Still works from the pack, so its holder
 *    hears it, like its other sounds. A Still that stopped while the game was
 *    closed or the tab asleep does not ring late.
 *  - Still: Distill Grain, Corn, Potatoes or Bushels into the hopper, then
 *    Collect the Hooch it makes, one every 140 seconds, offline too.
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
 *     the skills; &supplyautoplay=1 assembles all four machines, refuels one,
 *     distills, collects (the demo still starts with 3 Hooch made), shakes,
 *     compresses, ages and shucks. Canvas: data-supply-machines,
 *     data-supply-fuel, data-supply-still, data-supply-last, data-supply-autoplay.
 *     &supplystillsoon=<seconds> starts the demo Still on its last Hooch, done in
 *     that many seconds (data-supply-still-ready counts the done chimes).
 *     Clerk: ?autostart=1&fresh=1&resetgame=1&streetdemo=GLI32G3NUTD100I&supplydemo=clerk
 *     puts a Bureaucrat beside you on the street, for QA only
 *     (&supplyautoplay=1 buys Your Papers, completes them, buys a permit;
 *     data-supply-permits).
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem } from '../inventory.js?v=5be47371';
import { getToolCondition, copyForVerb, copyTag, copyTags, migrateClassTag, setCopyTag } from '../tools.js?v=5f482998';
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
  stillEtaSeconds,
  stillRoom,
  stillStopsAt,
} from '../machines.js?v=301212d7';
import { HERB_SEEDS, ITEM_TRANSFORMS, listTransformVerbs, runTransform, transformVerbCount } from '../item-transforms.js?v=a57c16bc';
import {
  BUREAUCRACY_ITEMS,
  HALL_STREETS,
  PAPERS,
  buyDocument,
  clerkOffers,
  completePapers,
  completePapersCheck,
} from '../bureaucracy.js?v=bed2faed';
import { frameTexture, sourceFromUrl } from '../textures.js?v=92ec53cd';
import { setMetalMakingMusic } from '../sound-moments.js?v=52ad523c';
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
 * The done chime (still.js 400-418). A Still's Hooch is counted whenever something reads it, so
 * the watcher remembers when each working Still will stop (pack order) and rings at that moment,
 * whether it or a menu did the counting. `stillStops` holds those times, 0 for an idle Still.
 */
let stillStops = [];
let stillChimes = 0;
let stillWatchedAt = 0;
/** The watcher looks four times a second: the chime is a moment, not a frame. */
const STILL_WATCH_MS = 250;
/** A stop noticed more than this late (the game was closed, the tab asleep) passes in silence. */
const STILL_READY_LATE_MS = 2000;

function watchStills(engine, now = Date.now()) {
  if (now >= stillWatchedAt && now - stillWatchedAt < STILL_WATCH_MS) return;
  stillWatchedAt = now;
  if (!keepsStills(engine)) {
    stillStops = [];
    return;
  }
  const tags = copyTags(engine.toolState, STILL.classTsid);
  // A Still came or went: the places no longer line up, so start over without a chime.
  if (tags.length !== stillStops.length) stillStops = tags.map(() => 0);
  let rang = false;
  tags.forEach((tag, at) => {
    const state = createStillState(tag || {});
    const stopsAt = stillStopsAt(state);
    if (stopsAt && now < stopsAt) {
      stillStops[at] = stopsAt;
      return;
    }
    // Stopped: counted here, or already by a menu since the last look (then the tag is idle).
    const due = stopsAt || stillStops[at];
    stillStops[at] = 0;
    if (stopsAt) {
      advanceStill(state, now);
      setCopyTag(engine.toolState, STILL.classTsid, at, !state.hopper && !state.hooch && !state.workingSince ? null : { ...state });
    }
    if (due && now >= due && now - due <= STILL_READY_LATE_MS) rang = true;
  });
  if (!rang) return;
  // still.js:413 owner.announce_sound('STILL_READY'); one chime however many Stills stop at once.
  stillChimes += 1;
  engine.playSound?.('STILL_READY', { volume: 0.55 });
  engine.setData?.('supplyStillReady', String(stillChimes));
  engine.refreshPack?.();
  publish(engine);
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
  const shown = loadStill(engine, null);
  advanceStill(still);
  if (shown >= 0) storeStill(engine, shown);
  engine.setData('supplyStill', `hopper=${still.hopper},hooch=${still.hooch},working=${still.workingSince ? 1 : 0}`);
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
    const at = loadStill(engine, pickedStill);
    advanceStill(still);
    if (at >= 0) storeStill(engine, at);
    const skill = learned(engine).includes(STILL.skill);
    const rows = [];
    for (const [id, value] of Object.entries(STILL.distillables)) {
      if (countItem(inv, id) < 1) continue;
      const fits = Math.floor(stillRoom(still) / value);
      rows.push({
        id: `distill:${id}`,
        label: `Distill ${label(id)}`,
        enabled: skill && fits > 0 && still.hooch < STILL.maxHooch,
        reason: !skill ? 'You need to know Distilling to use a Still.' : fits < 1 ? 'There is no room left in the hopper.' : 'The Still is totally full.',
        tooltip: `Hopper ${still.hopper}/${STILL.hopperSize}. Each ${label(id)} adds ${value}; 14 makes a Hooch.`,
      });
    }
    const eta = stillEtaSeconds(still);
    rows.push({
      id: 'collect',
      label: still.hooch ? `Collect ${still.hooch} Hooch` : 'Collect Hooch',
      enabled: skill && still.hooch > 0,
      reason: !skill ? 'You need to know Distilling to use a Still.' : eta ? `Next Hooch in ${eta}s.` : 'Put Grain, Corn or Potatoes in the hopper first.',
      tooltip: eta ? `Next Hooch in ${eta}s (hopper ${still.hopper}/${STILL.hopperSize}).` : `Hopper ${still.hopper}/${STILL.hopperSize}.`,
      primary: still.hooch > 0,
    });
    return rows;
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
  if (classTsid === STILL.classTsid) {
    // The Still picked (else the first): its own hopper and Hooch.
    const at = loadStill(engine, pickedStill);
    const res = verb === 'distill'
      ? distillInStill(still, inv, arg, learned(engine), Date.now(), upgrades(engine))
      : verb === 'collect'
        ? collectHooch(still, inv, learned(engine))
        : null;
    if (!res) return false;
    storeStill(engine, at);
    // still.js:370 distill: the hopper lid; still.js:166 collect: the Still's own collect chime.
    if (res.ok) engine.playSound?.(verb === 'distill' ? 'FUELMAKER_LOAD_OPEN' : 'STILL_COLLECT', verb === 'distill' ? undefined : { volume: 0.6 });
    // still.js:454-455 giveHooch: only Hooch collected in your own home (POL) counts.
    if (res.ok && verb === 'collect' && engine.homeContext?.().inHome) engine.achievement?.('still:collected_in_pol', res.got);
    // still.js:453 giveHooch: quests_inc_counter('make_hooch', hooch) on every collect, for the
    // multiplayer quest that uses it (G329, js/quests-mp.js); solo has no quest that counts it.
    if (res.ok && verb === 'collect' && res.got > 0 && engine.mode === 'multiplayer') engine.achievement?.('make_hooch', res.got);
    say(engine, res.msg, res.ok);
    engine.save?.();
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
    : createStillState({ hopper: 0, hooch: 3 });
  if (keepsStills(engine)) storeStill(engine, copyForVerb(engine.toolState, STILL.classTsid, null));
  engine.pc.energy = Math.max(engine.pc.energy || 0, 400);
  engine.pc.mood = Math.max(engine.pc.mood || 0, 200);
  engine.updateHud?.();
  if (engine.param('supplyautoplay')) autoplayAt = Date.now() + 1200;
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
    [STILL.classTsid, 'distill:grain'],
    [STILL.classTsid, 'collect'],
    ['milk_butterfly', 'shake:all'],
    ['butterfly_butter', 'compress:1'],
    ['cheese', 'age:1'],
    ['rookswort', 'shuck:1'],
  ];
  const results = [];
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
    watchStills(engine, now);
    if (autoplayAt && !autoplayDone && now >= autoplayAt) autoplay(engine);
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

  onStreetClear() {
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
    stillStops = [];
    stillWatchedAt = 0;
  },

  /** QA / tests. */
  _state() {
    return { still: { ...still }, last, work: work ? { ...work } : null };
  },
  _reset() {
    still = createStillState();
    work = null;
    workSounds = null;
    stillStops = [];
    stillChimes = 0;
    stillWatchedAt = 0;
    metalMusicOn = true;
    last = '';
    demoDone = false;
    autoplayAt = 0;
    autoplayDone = false;
  },
};
