/**
 * G124: the buffs whose GameServerJS trigger the remake already has
 * (rules in js/buff-triggers.js, numbers in js/buffs.js).
 *
 * - Drinks and foods: the `<class>:<verb>` event after a successful eat or
 *   drink applies the item's buff (buffs_apply restarts a running one).
 * - Gandlevery gets its herb Munch beside Eat (pack verb).
 * - Package overrides: Impervious Miner, Easy Animalia, Bubble-Enhanced
 *   Meditation, and at a batch start Flaming Grinder / Smelt It, Dealt It,
 *   set the package fields getSkillPackageDetails writes last; they are
 *   rebuilt from the running buffs, so reloads and expiry stay in step.
 * - Small Enlightenment speeds the current study (engine.accelerateStudy).
 * - Moonwalk's physics live in buffs.js buffPhysics and its reversed
 *   orientation in game.js applyPlayerFacing.
 * - Systems that already keep their own timer show it as the source buff:
 *   Meditation Cooldown and Levitating (meditation), Teleportation Cooldown,
 *   Rook Armor, Rube Lure, Don't Get Caught! (smuggling), Hog-Tied Escape
 *   Alert and Piggy Capture Cooldown (herdkeeping), and the twelve timed
 *   quests' timer buffs. The systems keep the effect; this only mirrors it.
 * - A Cold Place / A Hearty Feeling on the three Kukubee winter streets.
 * - Nekkid! while no coat, shirt, pants, dress or skirt is worn.
 * - Pooped and Super Pooped while js/hell.js holds them (G213).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&buffdemo=1 puts one of each
 * consumable in the pack (&buffautoplay=<class> drinks or eats it;
 * &buffautoplay=gandlevery munches). Canvas data: buffTriggerLast,
 * buffTriggerOverrides, buffTriggerMirrors, buffColdTicks.
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=85d4faba';
import {
  BUBBLE_MEDITATION_PACKAGES,
  BUFF_END_MESSAGES,
  BUFF_ICONS,
  BUFF_PACKAGE_CLEARS,
  BUFF_PACKAGE_OVERRIDES,
  BUFF_TICK_MESSAGES,
  CONSUME_BUFFS,
  GANDLEVERY_MUNCH,
  GARLIC_AGAIN,
  coldPlaceMessage,
  consumeBuffFor,
  flamingGrinderFreeCrushes,
  freeBatchEnergyCost,
  gandleveryMunchButton,
  isKukubeeWinter,
  isNekkid,
  questTimerBuffs,
  smallEnlightenmentSeconds,
  smeltItDealtItFreeSmelts,
} from '../buff-triggers.js?v=a3093922';
import {
  addSkillPackageOverride,
  getSkillPackageOverride,
  removeSkillPackageOverride,
  skillPackageDetails,
} from '../skill-packages.js?v=bfb87281';
import { husbandryPack } from '../animal-husbandry.js?v=16364589';
import { itemVerbAchievementCounters } from '../item-verbs.js?v=729ccd91';
// The same module instances js/features/index.js registers (tests/buff-triggers.test.js checks the tags).
import { meditationFeature } from './meditation-feature.js?v=72f3a544';
import { teleportationFeature } from './teleportation-feature.js?v=a79a7cea';
import { rookAttackFeature } from './rook-attack-feature.js?v=3d0e7100';
import { rubeFeature } from './rube-feature.js?v=d7085805';
import { smugglingFeature } from './smuggling-feature.js?v=22345862';
import { hellFeature } from './hell-feature.js?v=6825f033';
import { isPooped } from '../hell.js?v=454c9f42';

export const BUFF_TRIGGERS_FEATURE_ID = 'buff-triggers';

const SYNC_MS = 250;
const CONTRABAND = 'contraband';
const HOGTIED_PIGGY = 'hogtied_piggy';

/** Buffs this feature mirrors from another system's state. */
export const MIRRORED_BUFFS = Object.freeze([
  'meditation_cooldown',
  'levitation_by_meditation',
  'teleportation_cooldown',
  'rook_armor',
  'rube_lure',
  'dont_get_caught',
  'hog_tie',
  'piggy_capture_cooldown',
  'nekkid',
  'pooped',
  'super_pooped',
]);

/** Mirrors whose system already spoke (Pooped's own prompt): no "kicks in" line. */
const QUIET_MIRRORS = new Set(['pooped', 'super_pooped']);

let engineRef = null;
let lastSync = 0;
let last = '';
let coldTicks = 0;
let demoDone = false;
let autoplayAt = 0;
/** Mirrors and quest timers this feature applied (so it only removes its own). */
let mirrored = new Set();
/** Packages whose override this feature set, by buff. */
let owned = {};

const now = () => Date.now();

function publish(engine) {
  engine.setData?.('buffTriggerLast', last);
  engine.setData?.('buffTriggerOverrides', Object.keys(owned).sort().join(','));
  engine.setData?.('buffTriggerMirrors', [...mirrored].sort().join(','));
  engine.setData?.('buffColdTicks', String(coldTicks));
}

function isDead(engine) {
  return engine.metabolicGate?.('energy', 'gain')?.ok === false;
}

/** buffs_apply: a running buff restarts (no on_remove), else it starts. */
function restart(engine, buff, opts) {
  if (engine.hasBuff(buff)) engine.removeBuff(buff);
  return engine.applyBuff(buff, opts);
}

/* ------------------------------------------------------------------ */
/* Consumables                                                          */
/* ------------------------------------------------------------------ */

function onConsume(row, engine) {
  last = `${row.event}>${row.buff}`;
  if (row.buff === 'buff_garlic_breath' && engine.hasBuff('buff_garlic_breath')) {
    engine.pushActivity?.(GARLIC_AGAIN);
    publish(engine);
    return;
  }
  if (row.buff === 'small_enlightenment') {
    // pungent_sunrise.js:121: remember what was left, then restart.
    const runningRow = engine.buffRow?.('small_enlightenment');
    const prev = runningRow?.expiresAt ? Math.max(0, (runningRow.expiresAt - now()) / 1000) : 0;
    restart(engine, 'small_enlightenment');
    engine.accelerateStudy?.(smallEnlightenmentSeconds(prev), { ignoreMax: true });
  } else if (row.buff === 'kukubee_winter_positive') {
    restart(engine, 'kukubee_winter_positive');
    // on_apply: the cold ends.
    engine.removeBuff('kukubee_winter_negative');
  } else if (row.buff === 'bubble_enhanced_meditation') {
    restart(engine, 'bubble_enhanced_meditation');
    setBubbleOverrides(engine);
  } else if (row.buff === 'moonwalk') {
    restart(engine, 'moonwalk');
    // on_apply: announce_sound_to_all('MOONWALK').
    engine.playSound?.('MOONWALK', { volume: 0.6 });
  } else {
    restart(engine, row.buff);
  }
  syncOverrides(engine);
  publish(engine);
}

function runGandleveryMunch(engine) {
  const g = GANDLEVERY_MUNCH;
  if (countItem(engine.inv, g.classTsid) < 1) return false;
  const button = gandleveryMunchButton(munchCtx(engine));
  if (!button.enabled) {
    engine.toast?.(button.reason, 2600);
    return true;
  }
  removeItem(engine.inv, g.classTsid, 1);
  engine.applyBuff('gandlevery');
  // items/item.js notifyVerb: gandlevery:munch and VERB:munch:gandlevery.
  for (const c of itemVerbAchievementCounters(g.classTsid, g.verb)) engine.achievement(c.counter, c.amount);
  engine.pushActivity?.(g.message);
  engine.toast?.(g.message, 3200);
  engine.playSound?.('ITEM_EAT', { volume: 0.6 });
  last = 'gandlevery:munch>gandlevery';
  engine.refreshPack?.();
  engine.updateHud?.();
  engine.save?.();
  publish(engine);
  return true;
}

function munchCtx(engine) {
  return {
    dead: isDead(engine),
    energy: engine.pc?.energy,
    mood: engine.pc?.mood,
    active: engine.hasBuff('gandlevery'),
  };
}

/* ------------------------------------------------------------------ */
/* Package overrides                                                    */
/* ------------------------------------------------------------------ */

function learned(engine) {
  return engine.learnedSkills || [];
}

function upgrades(engine) {
  return engine.pc?.imaginationUpgrades || [];
}

/** bubble_enhanced_meditation on_apply: clear, then bonus_amount x 2 of each package. */
function setBubbleOverrides(engine) {
  for (const id of BUBBLE_MEDITATION_PACKAGES) removeSkillPackageOverride(id);
  for (const id of BUBBLE_MEDITATION_PACKAGES) {
    const details = skillPackageDetails(id, learned(engine), upgrades(engine));
    if (details && details.bonus_amount) addSkillPackageOverride(id, { bonus_amount: details.bonus_amount * 2 });
  }
  owned.bubble_enhanced_meditation = true;
}

function clearOverrides(buff) {
  for (const id of BUFF_PACKAGE_CLEARS[buff] || []) removeSkillPackageOverride(id);
  delete owned[buff];
}

/** Keep the package overrides in step with the running buffs. */
function syncOverrides(engine) {
  for (const [buff, rows] of Object.entries(BUFF_PACKAGE_OVERRIDES)) {
    if (engine.hasBuff(buff)) {
      for (const [pkg, fields] of Object.entries(rows)) addSkillPackageOverride(pkg, fields);
      owned[buff] = true;
    } else if (owned[buff]) {
      clearOverrides(buff);
    }
  }
  if (engine.hasBuff('bubble_enhanced_meditation')) {
    if (!owned.bubble_enhanced_meditation) setBubbleOverrides(engine);
  } else if (owned.bubble_enhanced_meditation) {
    clearOverrides('bubble_enhanced_meditation');
  }
  for (const buff of ['flaming_grinder', 'smelt_it_dealt_it']) {
    if (owned[buff] && !engine.hasBuff(buff)) clearOverrides(buff);
  }
}

function remainingSec(engine, buff) {
  const row = engine.buffRow?.(buff);
  if (!row) return 0;
  return row.expiresAt == null ? Infinity : Math.max(0, (row.expiresAt - now()) / 1000);
}

/**
 * game.js runMakeCraft announces `making_batch:<tool>` with the unit count
 * before it prices the batch: the grinder's and smelter's verbs, which set
 * the override for that batch (ore_grinder.js:454-475, smelter.js:446-478).
 */
function onBatch(tool, units, engine) {
  const n = Math.max(1, Math.floor(Number(units) || 1));
  if ((tool === 'ore_grinder' || tool === 'grand_ol_grinder') && engine.hasBuff('flaming_grinder')) {
    removeSkillPackageOverride('refining');
    const details = skillPackageDetails('refining', learned(engine), upgrades(engine));
    if (!details) return;
    const free = flamingGrinderFreeCrushes(remainingSec(engine, 'flaming_grinder'), upgrades(engine));
    addSkillPackageOverride('refining', { energy_cost: freeBatchEnergyCost(n, free, details.energy_cost) });
    owned.flaming_grinder = true;
  } else if (tool === 'smelter' && engine.hasBuff('smelt_it_dealt_it')) {
    removeSkillPackageOverride('smelting');
    const details = skillPackageDetails('smelting', learned(engine), upgrades(engine));
    if (!details) return;
    const free = smeltItDealtItFreeSmelts(remainingSec(engine, 'smelt_it_dealt_it'));
    addSkillPackageOverride('smelting', { energy_cost: freeBatchEnergyCost(n, free, details.energy_cost) });
    owned.smelt_it_dealt_it = true;
  }
  publish(engine);
}

/* ------------------------------------------------------------------ */
/* Mirrors                                                              */
/* ------------------------------------------------------------------ */

/**
 * Show a system's own timer as its source buff: `until` is an end time,
 * `true` for an open-ended buff, or falsy when it is not running.
 */
function mirror(engine, buff, until) {
  const t = now();
  const on = until === true || (Number(until) || 0) > t;
  if (on) {
    if (!engine.hasBuff(buff)) {
      const quiet = QUIET_MIRRORS.has(buff);
      const res = engine.applyBuff(buff, until === true ? { quiet } : { quiet, durationSec: Math.max(1, Math.ceil((until - t) / 1000)) });
      if (!res?.ok) return;
    }
    mirrored.add(buff);
    const row = engine.buffRow?.(buff);
    // The system owns it: the buffs panel offers no "End effect" (G213).
    if (row) row.heldBy = BUFF_TRIGGERS_FEATURE_ID;
    if (row && until !== true) row.expiresAt = Number(until);
  } else if (mirrored.has(buff)) {
    if (engine.hasBuff(buff)) engine.removeBuff(buff);
    mirrored.delete(buff);
  }
}

function sliceOf(feature) {
  try {
    return feature?.save?.() || {};
  } catch {
    return {};
  }
}

/** Tray icons for buffs whose item_class has no surviving iconic (BUFF_ICONS). */
function syncIcons(engine) {
  for (const [buff, icon] of Object.entries(BUFF_ICONS)) {
    const row = engine.buffRow?.(buff);
    if (row && row.sourceItem !== icon) row.sourceItem = icon;
  }
}

function syncMirrors(engine) {
  const med = sliceOf(meditationFeature);
  mirror(engine, 'levitation_by_meditation', med.levitateUntil);
  // Levitating's on_remove starts the 20 s cooldown; show one at a time.
  mirror(engine, 'meditation_cooldown', (Number(med.levitateUntil) || 0) > now() ? 0 : med.cooldownUntil);
  mirror(engine, 'teleportation_cooldown', sliceOf(teleportationFeature).cooldownUntil);
  mirror(engine, 'rook_armor', sliceOf(rookAttackFeature).armorUntil);
  mirror(engine, 'rube_lure', sliceOf(rubeFeature).lureActive === true);
  // contraband.js:158 on pickup, removed on delivery (npc_smuggler.js).
  mirror(engine, 'dont_get_caught', Boolean(sliceOf(smugglingFeature).run) && countItem(engine.inv, CONTRABAND) > 0);
  // inc_items.js:647: a Hog-tied Piggy in the pack.
  mirror(engine, 'hog_tie', countItem(engine.inv, HOGTIED_PIGGY) > 0);
  mirror(engine, 'piggy_capture_cooldown', husbandryPack()?.captureCooldownUntil);
  mirror(engine, 'nekkid', typeof engine.wornArticle === 'function' && isNekkid((type) => engine.wornArticle(type)));
  // G213: Pooped / Super Pooped are timed buffs to the next game day (inc_metabolics.js
  // 141-155 buffs_apply(..., { duration: remaining }), catalog_buffs.js 1689-1713,
  // 2619-2647); js/hell.js keeps them in the hell state, so show that here.
  const hell = sliceOf(hellFeature);
  const poopedKind = isPooped(hell, now());
  for (const kind of ['pooped', 'super_pooped']) {
    mirror(engine, kind, poopedKind === kind ? Number(hell.pooped?.expiresAt) || 0 : 0);
  }
  // Timed quests: one timer buff per open timer.
  const timers = questTimerBuffs(engine.questState?.offers?.timers || {}, now());
  for (const [buff, endsAt] of Object.entries(timers)) mirror(engine, buff, endsAt);
  for (const buff of [...mirrored]) {
    if (MIRRORED_BUFFS.includes(buff) || timers[buff]) continue;
    mirror(engine, buff, 0);
  }
}

/* ------------------------------------------------------------------ */
/* Kukubee winter                                                       */
/* ------------------------------------------------------------------ */

function syncCold(engine) {
  const tsid = engine.streetTsid;
  if (isKukubeeWinter(tsid)) {
    if (!engine.hasBuff('kukubee_winter_positive') && !engine.hasBuff('kukubee_winter_negative')) {
      coldTicks = 0;
      engine.applyBuff('kukubee_winter_negative');
    }
  } else if (engine.hasBuff('kukubee_winter_negative')) {
    // on_tick: buffs_remove off the winter streets.
    engine.removeBuff('kukubee_winter_negative');
  }
}

/* ------------------------------------------------------------------ */
/* QA                                                                   */
/* ------------------------------------------------------------------ */

const DEMO_ITEMS = [...new Set(CONSUME_BUFFS.map((row) => row.event.split(':')[0])), GANDLEVERY_MUNCH.classTsid];

function demoSetup(engine) {
  if (demoDone || engine.param?.('buffdemo') !== '1') return;
  demoDone = true;
  for (const classTsid of DEMO_ITEMS) if (countItem(engine.inv, classTsid) < 1) addItem(engine.inv, classTsid, 1);
  engine.pc.energy = Math.min(engine.pc.energy, 50);
  engine.pc.mood = Math.min(engine.pc.mood, 50);
  engine.setData?.('buffDemo', '1');
  engine.refreshPack?.();
  engine.updateHud?.();
  if (engine.param?.('buffautoplay')) autoplayAt = now() + 1500;
}

function runAutoplay(engine) {
  const classTsid = engine.param?.('buffautoplay');
  if (!classTsid) return;
  if (classTsid === GANDLEVERY_MUNCH.classTsid) {
    runGandleveryMunch(engine);
    return;
  }
  engine.usePackItem?.(classTsid);
}

export const buffTriggersFeature = {
  id: BUFF_TRIGGERS_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    publish(engine);
  },

  onStreetEnter(street, engine) {
    demoSetup(engine);
    syncCold(engine);
    publish(engine);
  },

  onEvent(counter, amount, engine) {
    const c = String(counter || '');
    const row = consumeBuffFor(c);
    if (row) {
      onConsume(row, engine);
      return;
    }
    if (c.startsWith('making_batch:')) {
      onBatch(c.slice('making_batch:'.length), amount, engine);
      return;
    }
    const tick = /^buff_tick:(.+)$/.exec(c);
    if (tick) {
      const id = tick[1];
      if (BUFF_TICK_MESSAGES[id]) engine.pushActivity?.(BUFF_TICK_MESSAGES[id]);
      if (id === 'kukubee_winter_negative') {
        coldTicks += 1;
        const msg = coldPlaceMessage(coldTicks);
        if (msg) engine.pushActivity?.(msg);
      }
      return;
    }
    const expired = /^buff_expired:(.+)$/.exec(c);
    if (expired) {
      const id = expired[1];
      if (BUFF_END_MESSAGES[id]) engine.pushActivity?.(BUFF_END_MESSAGES[id]);
      // kukubee_winter_positive on_remove: back into the cold on a winter street.
      if (id === 'kukubee_winter_positive') syncCold(engine);
      if (BUFF_PACKAGE_CLEARS[id]) syncOverrides(engine);
    }
  },

  onTick(dtMs, t, engine) {
    if (!engine.started) return;
    if (autoplayAt && t >= autoplayAt && !engine.busy?.()) {
      autoplayAt = 0;
      runAutoplay(engine);
    }
    if (t - lastSync < SYNC_MS) return;
    lastSync = t;
    syncOverrides(engine);
    syncMirrors(engine);
    syncCold(engine);
    syncIcons(engine);
    publish(engine);
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== GANDLEVERY_MUNCH.classTsid || countItem(engine.inv, classTsid) < 1) return [];
    return [gandleveryMunchButton(munchCtx(engine))];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== GANDLEVERY_MUNCH.classTsid || verbId !== GANDLEVERY_MUNCH.verb) return false;
    runGandleveryMunch(engine);
    return true;
  },

  save() {
    return { version: 1, mirrored: [...mirrored], coldTicks };
  },

  restore(slice) {
    mirrored = new Set(Array.isArray(slice?.mirrored) ? slice.mirrored.filter((id) => typeof id === 'string') : []);
    coldTicks = Math.max(0, Math.floor(Number(slice?.coldTicks) || 0));
    owned = {};
  },

  /** Tests. */
  _state() {
    return { last, mirrored: [...mirrored], owned: { ...owned }, coldTicks };
  },
  _reset() {
    last = '';
    coldTicks = 0;
    demoDone = false;
    autoplayAt = 0;
    lastSync = 0;
    mirrored = new Set();
    for (const buff of Object.keys(BUFF_PACKAGE_CLEARS)) clearOverrides(buff);
    owned = {};
  },
  _overrideOf: (pkg) => getSkillPackageOverride(pkg),
};
