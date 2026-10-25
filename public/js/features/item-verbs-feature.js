/**
 * Small item verbs and badge counters from GameServerJS that need the street
 * or the pack, as a feature module (see js/feature-host.js). Rules live in
 * js/item-verbs.js and js/buffs.js.
 *
 * - Spices and gases: each one's own examine verb on its pack popover
 *   (Spice Examiner, Mad Gasser); Garlic's ordinary Eat counts garlic:eat.
 * - Ice: Crunch (Holy Zamboni at 1,009 cubes, a 10% brain freeze toward
 *   The Walking Frozed).
 * - Beer: every drink restarts Buzzed (catalog_buffs.js buff_buzzed); each
 *   buzzed minute counts buff_times:buzzed, and the count starts over when the
 *   buzz fades (Perseverating Dipsomaniac at ten straight minutes).
 * - Essence of Hairball (js/buffs.js: Imbibe, Hairball Dash): players/inc_buffs.js
 *   adds the distance between where you start and end on each street; a dash
 *   over 14,000 px sets essence_of_hairball:distance_dashed (Hairball Gonzales).
 * - Metalmaker with Making Metal (metalmaking_music): metalmaker.js:925-934
 *   onMakingComplete counts sloths:played_music_for for every Sloth within
 *   250 px (Noise-Bringer). The remake counts on each unit made.
 * - Games (location.is_game: race scenes, Grab 'Em Good, Game of Crowns, the
 *   Great Hog Haul): Essence of Hairball, Hairball Flower and Spinach refuse
 *   with their own lines (js/item-verbs.js GAME_CHEAT_BLOCKS, packUseGate).
 * - Your home: home.js:40 and inc_cultivation.js:152 set
 *   cultivation_items:has to the cultivated items on your home street
 *   (Self-sufficientiser); home.js:46-52 and trophy_base drop set
 *   trophy:placed_eleven once 11 trophies stand on your home street and in your
 *   house (Humble Bragger). Read every 2 s while you are home.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&itemverbdemo=1 packs
 *   one of every spice and gas, 20 Ice, 3 Beer and an Essence of Hairball;
 *   &itemverbautoplay=<class> runs that item's verb once. Canvas:
 *   itemVerbLast, itemVerbBuzz, itemVerbDash.
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-4';
import { moodMax } from '../metabolics.js';
import { listDroppedStacks } from '../world-items.js?v=catalog-unified-2';
import {
  GARLIC_EAT_COUNTER,
  ITEM_VERBS,
  crunchIce,
  gameCheatBlock,
  iceCrunchButton,
  itemVerbButton,
  itemVerbsFor,
  runItemVerb,
} from '../item-verbs.js?v=g137-1';
import { homesFeature } from './homes-feature.js?v=homes-10';
import { CROWNS_STREET } from '../game-of-crowns.js?v=crowns-1';
import { HOG_HAUL_STREET_ID } from '../hog-haul.js?v=hog-haul-2';
import { isRaceSceneTsid } from '../races.js?v=races-4';

export const ITEM_VERBS_FEATURE_ID = 'item-verbs';

/** players/inc_buffs.js buffs_hairball_end: the dash must beat 14,000 px. */
export const HAIRBALL_DASH_MIN = 14000;
/** metalmaker.js:928: Sloths within 250 px of the machine. */
export const SLOTH_MUSIC_RANGE = 250;
/** home.js:49: trophies (tag trophy, the 18 trophy_* items, not their pieces). */
export const TROPHIES_FOR_BRAGGING = 11;

const HOME_STREETS = Object.freeze(['RH_HOME_EXT', 'RH_HOME_INT']);

let last = '';
let dash = null; // { distance, streetStart }
let homeCheckAt = 0;
let lastCultivated = -1;
let demoDone = false;

const energyCap = (pc) => Math.max(100, Number(pc?.energyMax) || 100);

export function isTrophyClass(classTsid) {
  return /^trophy_/.test(String(classTsid || '')) && !/_piece\d+$/.test(classTsid);
}

/** Trophies standing on your home street and in your house (dropped stacks). */
export function homeTrophyCount(droppedState) {
  let n = 0;
  for (const tsid of HOME_STREETS) {
    for (const row of listDroppedStacks(droppedState, tsid)) {
      if (isTrophyClass(row.classTsid)) n += Math.max(0, Math.floor(Number(row.count) || 0));
    }
  }
  return n;
}

/** inc_buffs.js buffs_hairball_leave_street / _end: |street start - x| per street. */
export function addDashLeg(state, x) {
  if (!state) return null;
  state.distance += Math.abs((Number(state.streetStart) || 0) - (Number(x) || 0));
  state.streetStart = Number(x) || 0;
  return state;
}

function publish(engine) {
  engine.setData?.('itemVerbLast', last);
  engine.setData?.('itemVerbDash', dash ? String(Math.round(dash.distance)) : '');
}

function say(engine, text, ok = true) {
  if (!text) return;
  engine.pushActivity?.(text);
  engine.toast?.(text, ok ? 3400 : 2400);
}

function applyRows(engine, rows) {
  for (const row of rows || []) engine.achievement(row.counter, row.amount);
}

function ctxFor(engine) {
  return { energy: engine.pc.energy, mood: engine.pc.mood, unlocked: engine.unlockedAchievements || [] };
}

/** Run an item's verb (pack button, QA autoplay, tests). */
export function runItemVerbFor(engine, classTsid, verbId) {
  if (countItem(engine.inv, classTsid) < 1) return null;
  if (classTsid === 'ice' && verbId === 'crunch') {
    const out = crunchIce(engine.pc, 1, { unlocked: engine.unlockedAchievements || [], moodMax: moodMax(engine.pc) });
    applyRows(engine, out.achievementCounters);
    if (out.consumed) removeItem(engine.inv, 'ice', out.consumed);
    for (const msg of out.msgs) say(engine, msg, out.ok);
    last = `ice:crunch:${out.ok ? 'ok' : 'tired'}`;
  } else {
    const def = itemVerbsFor(classTsid).find((v) => v.verb === verbId);
    if (!def) return null;
    const out = runItemVerb(def, engine.pc, { unlocked: engine.unlockedAchievements || [], energyMax: energyCap(engine.pc), moodMax: moodMax(engine.pc) });
    for (const msg of out.msgs) say(engine, msg, out.ok);
    if (!out.ok) return null;
    if (out.consume) removeItem(engine.inv, classTsid, 1);
    if (out.buff) engine.applyBuff(out.buff);
    applyRows(engine, out.achievementCounters);
    last = `${classTsid}:${verbId}`;
  }
  engine.updateHud?.();
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return last;
}

/** location.is_game: a race scene (races and Grab 'Em Good), the Game of Crowns arena or the Great Hog Haul. */
export function inGameLocation(tsid) {
  const key = String(tsid || '');
  return isRaceSceneTsid(key) || key === CROWNS_STREET || key === HOG_HAUL_STREET_ID;
}

function checkHome(engine, now) {
  const home = engine.homeContext?.();
  if (!home?.inHome || !home.owned) return;
  if (now - homeCheckAt < 2000) return;
  homeCheckAt = now;
  if (homeTrophyCount(engine.droppedItems) >= TROPHIES_FOR_BRAGGING && !(engine.unlockedAchievements || []).includes('humble_bragger')) {
    engine.achievement('trophy:placed_eleven', 1);
  }
  if (home.room !== 'street') return;
  const items = homesFeature._state?.().cult?.items;
  const count = Array.isArray(items) ? items.length : 0;
  if (count !== lastCultivated) {
    lastCultivated = count;
    // achievements_set: start over, then count what stands there now.
    engine.resetAchievementCounter('cultivation_items:has');
    if (count > 0) engine.achievement('cultivation_items:has', count);
  }
}

function setupDemo(engine) {
  if (demoDone || engine.param?.('itemverbdemo') !== '1') return;
  demoDone = true;
  for (const def of ITEM_VERBS) if (countItem(engine.inv, def.classTsid) < 1) addItem(engine.inv, def.classTsid, 1);
  if (countItem(engine.inv, 'ice') < 20) addItem(engine.inv, 'ice', 20);
  if (countItem(engine.inv, 'beer') < 3) addItem(engine.inv, 'beer', 3);
  if (countItem(engine.inv, 'essence_of_hairball') < 1) addItem(engine.inv, 'essence_of_hairball', 1);
  engine.refreshPack?.();
  const auto = engine.param?.('itemverbautoplay');
  const def = auto === 'ice' ? { classTsid: 'ice', verb: 'crunch' } : itemVerbsFor(auto)[0];
  if (def) setTimeout(() => runItemVerbFor(engine, def.classTsid, def.verb), 1500);
}

export const itemVerbsFeature = {
  id: ITEM_VERBS_FEATURE_ID,

  onStreetEnter(street, engine) {
    // inc_buffs.js buffs_enter_location: a new street leg starts here
    // (a dash saved across a reload whose buff has run out just ends).
    if (dash && !engine.hasBuff?.('hairball_dash')) dash = null;
    if (dash) dash.streetStart = Number(engine.player?.x) || 0;
    lastCultivated = -1;
    homeCheckAt = 0;
    setupDemo(engine);
    publish(engine);
  },

  onStreetClear(engine) {
    // buffs_hairball_leave_street: the leg on the street you leave.
    if (dash) addDashLeg(dash, engine?.player?.x);
  },

  onTick(dtMs, now, engine) {
    checkHome(engine, now);
  },

  onEvent(counter, amount, engine) {
    if (counter === 'items_eaten:garlic') {
      engine.achievement(GARLIC_EAT_COUNTER, 1);
    } else if (counter === 'beer:drink') {
      // beer.js:117: buffs_apply('buff_buzzed') restarts a running buzz (no on_remove).
      engine.removeBuff('buff_buzzed');
      engine.applyBuff('buff_buzzed');
    } else if (counter === 'buff_tick:buff_buzzed') {
      engine.pushActivity?.('That is a nice buzz you got going on.');
      engine.achievement('buff_times:buzzed', 1);
    } else if (counter === 'buff_expired:buff_buzzed') {
      engine.pushActivity?.('You feel your buzz fading.');
      // catalog_buffs.js:221: "it's continuous, not cumulative".
      engine.resetAchievementCounter('buff_times:buzzed');
    } else if (counter === 'essence_of_hairball:use') {
      dash = { distance: 0, streetStart: Number(engine.player?.x) || 0 };
    } else if (counter === 'buff_expired:hairball_dash' && dash) {
      addDashLeg(dash, engine.player?.x);
      const distance = Math.round(dash.distance);
      dash = null;
      if (distance > HAIRBALL_DASH_MIN) {
        engine.resetAchievementCounter('essence_of_hairball:distance_dashed');
        engine.achievement('essence_of_hairball:distance_dashed', distance);
      }
    } else if (counter === 'making_tool:metalmaker') {
      if (!(engine.pc?.imaginationUpgrades || []).includes('metalmaking_music')) return;
      const x = Number(engine.player?.x) || 0;
      for (const t of engine.interactables || []) {
        if (t?.classId === 'npc_sloth' && t.sprite && Math.abs(t.sprite.x - x) <= SLOTH_MUSIC_RANGE) {
          engine.achievement('sloths:played_music_for', 1);
        }
      }
    } else {
      return;
    }
    publish(engine);
  },

  /** essence_of_hairball / hairball_flower / spinach: no cheating in a game. */
  packUseGate(classTsid, engine) {
    return gameCheatBlock(classTsid, inGameLocation(engine?.streetTsid));
  },

  packVerbs(classTsid, engine) {
    if (countItem(engine.inv, classTsid) < 1) return [];
    if (classTsid === 'ice') return [iceCrunchButton(ctxFor(engine))];
    return itemVerbsFor(classTsid).map((def) => itemVerbButton(def, ctxFor(engine))).filter(Boolean);
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid === 'ice' && verbId === 'crunch') {
      runItemVerbFor(engine, classTsid, verbId);
      return true;
    }
    if (!itemVerbsFor(classTsid).some((v) => v.verb === verbId)) return false;
    runItemVerbFor(engine, classTsid, verbId);
    return true;
  },

  save() {
    return { version: 1, dash: dash ? { ...dash } : null };
  },

  restore(slice) {
    const d = slice?.dash;
    dash = d && Number.isFinite(Number(d.distance)) ? { distance: Number(d.distance), streetStart: Number(d.streetStart) || 0 } : null;
  },

  /** Tests. */
  _state() {
    return { last, dash };
  },
  _reset() {
    last = '';
    dash = null;
    homeCheckAt = 0;
    lastCultivated = -1;
    demoDone = false;
  },
};
