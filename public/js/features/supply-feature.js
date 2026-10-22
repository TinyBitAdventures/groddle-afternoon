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
 *  - A Bureaucrat outside the Bureaucratic Halls (Gregarious Grange, Baeli
 *    Bray, Chego Chase) sells Your Papers and General Building Permits to
 *    those with Bureaucratic Arts, and a Card-Carrying Qualification to
 *    anyone without its badge (js/bureaucracy.js); Complete Your Papers
 *    in the pack for the You Have Papers badge.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&supplydemo=1 grants a Machine Stand,
 *     every part, Fuel Cells, a Still with Grain, Butterfly Milk, herbs and
 *     the skills; &supplyautoplay=1 assembles all four machines, refuels one,
 *     distills, collects (the demo still starts with 3 Hooch made), shakes,
 *     compresses, ages and shucks. Canvas: data-supply-machines,
 *     data-supply-fuel, data-supply-still, data-supply-last, data-supply-autoplay.
 *     Clerk: ?autostart=1&fresh=1&resetgame=1&streetdemo=GLI32G3NUTD100I&supplydemo=clerk
 *     (&supplyautoplay=1 buys Your Papers, completes them, buys a permit;
 *     data-supply-permits).
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem } from '../inventory.js?v=catalog-unified-3';
import { getToolCondition } from '../tools.js';
import {
  MACHINE_ASSEMBLIES,
  MACHINE_IDS,
  MACHINE_PART_ITEMS,
  MACHINE_STAND,
  MAX_FUEL,
  STILL,
  advanceStill,
  assembleMachine,
  assemblyCheck,
  collectHooch,
  createStillState,
  distillInStill,
  isMachine,
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
      const check = assemblyCheck(inv, engine.pc, machine, learned(engine));
      const def = MACHINE_ASSEMBLIES[machine];
      return {
        id: `assemble:${machine}`,
        label: `Assemble a ${def.label}`,
        enabled: check.ok,
        reason: check.msg || '',
        tooltip: `Stand + ${def.parts.map(label).join(' + ')}. Takes ${20 * def.parts.length} energy.`,
        primary: check.ok,
      };
    });
  }
  if (isMachine(classTsid)) {
    const fuel = getToolCondition(engine.toolState, classTsid).remaining;
    const one = refuelCheck(inv, engine.toolState, classTsid);
    const rows = [
      { id: 'refuel:1', label: 'Refuel', enabled: one.ok, reason: one.msg || '', tooltip: `Add more fuel. Current level: ${fuel}/${MAX_FUEL}`, primary: one.ok },
    ];
    if (one.ok && one.cells > 1) rows.push({ id: 'refuel:all', label: `Refuel with ${one.cells} cells`, enabled: true, tooltip: `Fill the tank. Current level: ${fuel}/${MAX_FUEL}` });
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
    const res = assembleMachine(inv, engine.pc, engine.toolState, arg, learned(engine));
    if (res.ok) engine.updateHud?.();
    // metalmaker.js:1386 and siblings: machines_assembled:<machine>.
    if (res.ok) engine.achievement?.(`machines_assembled:${arg}`, 1);
    say(engine, res.msg, res.ok);
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
      ? distillInStill(still, inv, arg, learned(engine))
      : verb === 'collect'
        ? collectHooch(still, inv, learned(engine))
        : null;
    if (!res) return false;
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
    if (HALL_STREETS[engine.streetTsid]) {
      const near = { x: (engine.player?.x || 0) + 90, y: engine.player?.y || engine.groundY };
      const point = engine.param?.('supplydemo') === 'clerk' ? near : engine.placement('supply-clerk')[0] || near;
      spawnClerk(engine, point);
    }
    demoSetup(engine);
    publish(engine);
  },

  onTick(dtMs, now, engine) {
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

  placementGroups(population, street) {
    return HALL_STREETS[street?.tsid] ? [{ key: 'supply-clerk', count: 1, clearance: 90 }] : [];
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
    return { version: 1, still: { ...still } };
  },

  restore(slice) {
    still = createStillState(slice?.still || {});
    advanceStill(still);
  },

  /** QA / tests. */
  _state() {
    return { still: { ...still }, last };
  },
  _reset() {
    still = createStillState();
    last = '';
    demoDone = false;
    autoplayAt = 0;
    autoplayDone = false;
  },
};
