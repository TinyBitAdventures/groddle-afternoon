/**
 * Item supply: the pack verbs that close the source's production chains.
 *
 *  - Machine Stand: Assemble a Woodworker / Metalmaker / Fuelmaker /
 *    Blockmaker from the stand and three vendor parts (js/machines.js).
 *  - Machines: Refuel from pack Fuel Cells (+50 each, 200 max). Machine
 *    recipes burn the tank, so a Fuelmaker keeps every machine running.
 *  - Still: Distill Grain, Corn, Potatoes or Bushels into the hopper, then
 *    Collect the Hooch it makes, one every 140 seconds, offline too.
 *  - Butterfly Milk, Butter, the four Cheeses and every herb: Shake,
 *    Compress, Age, Poke and Shuck (js/item-transforms.js).
 *  - The Bureaucrats inside the Bureaucratic Halls (bureaucratic-halls-feature.js,
 *    behind the doors on Gregarious Grange, Baeli Bray and Chego Chase)
 *    sell Your Papers and General Building Permits to those with
 *    Bureaucratic Arts, and a Card-Carrying Qualification to anyone without
 *    its badge (js/bureaucracy.js): their verbs live here. Complete Your
 *    Papers in the pack for the You Have Papers badge.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&supplydemo=1 grants a Machine Stand,
 *     every part, Fuel Cells, a Still with Grain, Butterfly Milk, herbs and
 *     the skills; &supplyautoplay=1 assembles all four machines, refuels one,
 *     distills, collects (the demo still starts with 3 Hooch made), shakes,
 *     compresses, ages and shucks. Canvas: data-supply-machines,
 *     data-supply-fuel, data-supply-still, data-supply-last, data-supply-autoplay.
 *     Clerk: ?autostart=1&fresh=1&resetgame=1&streetdemo=GLI32G3NUTD100I&supplydemo=clerk
 *     puts a Bureaucrat beside you on the street, for QA only
 *     (&supplyautoplay=1 buys Your Papers, completes them, buys a permit;
 *     data-supply-permits).
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem } from '../inventory.js?v=catalog-unified-6';
import { getToolCondition } from '../tools.js';
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
  startAssembly,
  startDisassembly,
  refuelCheck,
  refuelMachine,
  stillEtaSeconds,
  stillRoom,
} from '../machines.js';
import { HERB_SEEDS, ITEM_TRANSFORMS, listTransformVerbs, runTransform } from '../item-transforms.js';
import {
  BUREAUCRACY_ITEMS,
  HALL_STREETS,
  PAPERS,
  buyDocument,
  clerkOffers,
  completePapers,
  completePapersCheck,
} from '../bureaucracy.js';
import { frameTexture, sourceFromUrl } from '../textures.js';
import { setMetalMakingMusic } from '../sound-moments.js';

export const SUPPLY_FEATURE_ID = 'supply';
export const CLERK_CLASS = 'npc_bureaucrat';
const CLERK_ART = 'assets/sprites/quests/legalize/npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_idle1_png_1354832995.png';
const CLERK_FRAME = { w: 97, h: 89 };

/** Items the chains need that no other module registers with source text. */
const EXTRA_ITEMS = {
  small_worthless: {
    label: 'Small shiny object with no intrinsic value',
    desc: 'Shiny, but you can barely see the shine so it ends up a little dull. Totally worthless: it has no purpose. Holding on to this little object simply cannot be recommended.',
    baseCost: 0,
  },
};

let still = createStillState();
/** Machine parts being installed or uninstalled: { kind, machine, energy, readyAt, full? }. */
let work = null;
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
  spr.zIndex = 6;
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

/** Finish the installing / uninstalling overlay once its time is up. */
function settleWork(engine, now = Date.now()) {
  if (!work || now < work.readyAt) return;
  const done = work;
  work = null;
  const res = finishMachineWork(engine.inv, engine.toolState, done);
  if (!res.ok) return;
  // metalmaker.js:1386 and siblings: machines_assembled:<machine>.
  if (done.kind === 'assemble') engine.achievement?.(`machines_assembled:${done.machine}`, 1);
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
  advanceStill(still);
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
    advanceStill(still);
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
      engine.playSound?.('ENGINE1');
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
    const res = verb === 'distill'
      ? distillInStill(still, inv, arg, learned(engine), Date.now(), upgrades(engine))
      : verb === 'collect'
        ? collectHooch(still, inv, learned(engine))
        : null;
    if (!res) return false;
    // still.js:454-455 giveHooch: only Hooch collected in your own home (POL) counts.
    if (res.ok && verb === 'collect' && engine.homeContext?.().inHome) engine.achievement?.('still:collected_in_pol', res.got);
    say(engine, res.msg, res.ok);
    engine.save?.();
    return true;
  }
  return false;
}

function transformVerbs(classTsid, engine) {
  if (!ITEM_TRANSFORMS[classTsid] && !HERB_SEEDS[classTsid]) return null;
  return listTransformVerbs(classTsid, engine.inv, engine.pc, learned(engine));
}

function runTransformVerb(classTsid, verbId, engine) {
  if (!ITEM_TRANSFORMS[classTsid] && !HERB_SEEDS[classTsid]) return false;
  const [verb, count] = String(verbId).split(':');
  const res = runTransform(classTsid, verb, count === 'all' ? 'all' : 1, engine.inv, engine.pc, learned(engine));
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
  // A Still that has already been working: three Hooch waiting.
  still = createStillState({ hopper: 0, hooch: 3 });
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
    if (work) settleWork(engine, now);
    if (autoplayAt && !autoplayDone && now >= autoplayAt) autoplay(engine);
  },

  packVerbs(classTsid, engine) {
    if (classTsid === PAPERS) {
      const check = completePapersCheck(engine.inv, achievements(engine));
      return [{ id: 'complete', label: 'Complete', enabled: check.ok, reason: check.msg || '', tooltip: 'Fill these out and your papers will be "in order"', primary: check.ok }];
    }
    return machineVerbs(classTsid, engine) || transformVerbs(classTsid, engine) || [];
  },

  runPackVerb(classTsid, verbId, engine) {
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
    return { version: 1, still: { ...still }, ...(work ? { work: { ...work } } : {}), ...(metalMusicOn ? {} : { metalMusic: false }) };
  },

  restore(slice, engine) {
    still = createStillState(slice?.still || {});
    advanceStill(still);
    metalMusicOn = slice?.metalMusic !== false;
    // A reload mid-install finishes the job (the overlays were seconds long).
    const saved = slice?.work;
    work = saved && MACHINE_ASSEMBLIES[saved.machine] && (saved.kind === 'assemble' || saved.kind === 'disassemble')
      ? { ...saved, readyAt: 0 }
      : null;
  },

  /** QA / tests. */
  _state() {
    return { still: { ...still }, last, work: work ? { ...work } : null };
  },
  _reset() {
    still = createStillState();
    work = null;
    metalMusicOn = true;
    last = '';
    demoDone = false;
    autoplayAt = 0;
    autoplayDone = false;
  },
};
