/**
 * Sno Cones as a feature module (see js/feature-host.js). Rules live in
 * js/sno-cones.js (items/sno_cone_*.js, sno_cone_base).
 *
 * - Pack: Eat gives the cone's iMG (37 to 1,100), never energy; below the
 *   cone's level it refuses. The third cone of a game day warns, and every
 *   cone after that has a 50% chance to freeze your brain: mood to zero, no
 *   iMG, brain:frozen (The Walking Frozed at 11). build-recipes.mjs leaves
 *   sno cones out of the food uses, so the ordinary Eat never shows.
 * - Dropped cones: Pick up works only at home; Bemoan gives half the cone's
 *   iMG (19 to 550) and the cone is gone; a dropped cone melts 30 minutes
 *   after the drop, on any street.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&snoconedemo=1 packs one
 *   of each cone (level 15, so every gate is open); &snoconeeaten=N starts the
 *   day at N cones eaten; &snoconeautoplay=<class> eats that cone on arrival,
 *   &snoconeautoplay=drop drops a Blue Sno Cone and bemoans it.
 *   Canvas: snoConeLast, snoConeEaten.
 */

import { ITEM_CATALOG, addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-3';
import { getGameDayKey } from '../game-day.js?v=dametime-1';
import { listDroppedStacks } from '../world-items.js?v=catalog-unified-2';
import { XP_FOR_LEVEL } from '../progression.js?v=progression-1';
import {
  SNO_CONES,
  SNO_CONE_TEXT,
  bemoanSnoCone,
  conesEatenToday,
  eatSnoCone,
  isSnoCone,
  snoConeEatButton,
  snoConeMelted,
} from '../sno-cones.js?v=g148-1';

export const SNO_CONES_FEATURE_ID = 'sno-cones';
export const BEMOAN_VERB = 'sno_cone_bemoan';
const MELT_CHECK_MS = 5000;

let daily = { day: '', eaten: 0 };
let last = '';
let meltCheckAt = 0;
let demoDone = false;

const dayKey = (now = Date.now()) => getGameDayKey(now);

function eatenToday(now = Date.now()) {
  return conesEatenToday(daily, dayKey(now));
}

function publish(engine) {
  engine.setData?.('snoConeLast', last);
  engine.setData?.('snoConeEaten', String(eatenToday()));
}

function say(engine, text, ok = true) {
  if (!text) return;
  engine.pushActivity?.(text);
  engine.toast?.(text, ok ? 3600 : 2600);
}

function atHome(engine) {
  const home = engine.homeContext?.();
  return Boolean(home?.inHome && home.owned);
}

/** Eat one cone from the pack (pack button, QA autoplay, tests). */
export function eatPackedSnoCone(engine, classTsid, rng = Math.random) {
  if (!isSnoCone(classTsid) || countItem(engine.inv, classTsid) < 1) return null;
  const now = Date.now();
  const out = eatSnoCone(classTsid, engine.pc, { eatenToday: eatenToday(now), rng });
  if (!out.ok) {
    for (const msg of out.msgs) say(engine, msg, false);
    last = `${classTsid}:${out.reason || 'refused'}`;
    publish(engine);
    return last;
  }
  removeItem(engine.inv, classTsid, 1);
  daily = { day: dayKey(now), eaten: out.eatenToday };
  for (const row of out.achievementCounters) engine.achievement(row.counter, row.amount);
  // items/item.js notifyVerb: VERB:eat:<class> (and <class>:eat).
  engine.achievement(`${classTsid}:eat`, 1);
  engine.achievement(`VERB:eat:${classTsid}`, 1);
  for (const msg of out.msgs) say(engine, msg, !out.froze);
  if (out.xp && engine.player) engine.floatText?.(engine.player.x, engine.player.y - 90, `+${out.xp} iMG`, 0xb388ff);
  if (!out.msgs.length) engine.pushActivity?.(`You ate a ${ITEM_CATALOG[classTsid]?.label || 'Sno Cone'}.`);
  last = `${classTsid}:${out.froze ? 'froze' : 'ate'}:${out.eatenToday}`;
  engine.updateHud?.();
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return last;
}

function stackOf(engine, target) {
  const id = target?.state?.id || target?.worldItemId;
  const rows = engine.droppedItems?.streets?.[engine.streetTsid] || [];
  return rows.find((row) => row.id === id) || null;
}

function removeStack(engine, stackId, tsid = engine.streetTsid) {
  const streets = engine.droppedItems?.streets;
  const rows = streets?.[tsid];
  if (!Array.isArray(rows)) return false;
  const index = rows.findIndex((row) => row.id === stackId);
  if (index < 0) return false;
  rows.splice(index, 1);
  if (!rows.length) delete streets[tsid];
  return true;
}

/** The bemoan verb on a dropped cone: its iMG for the whole stack, then the stack is gone. */
export function bemoanDroppedSnoCone(engine, target) {
  const stack = stackOf(engine, target);
  if (!stack || !isSnoCone(stack.classTsid)) return null;
  const out = bemoanSnoCone(stack.classTsid, engine.pc, stack.count);
  removeStack(engine, stack.id);
  engine.droppedItemsChanged?.();
  engine.achievement(`VERB:bemoan:${stack.classTsid}`, out.count);
  for (const msg of out.msgs) say(engine, msg);
  if (engine.player) engine.floatText?.(engine.player.x, engine.player.y - 90, `+${out.xp} iMG`, 0xb388ff);
  last = `${stack.classTsid}:bemoan:${out.xp}`;
  engine.updateHud?.();
  engine.save?.();
  publish(engine);
  return last;
}

/** onMelt for every dropped cone on every street; redraws the street you stand on. */
export function meltSnoCones(engine, now = Date.now()) {
  const streets = engine.droppedItems?.streets || {};
  let here = false;
  let any = false;
  for (const tsid of Object.keys(streets)) {
    for (const stack of listDroppedStacks(engine.droppedItems, tsid)) {
      if (!snoConeMelted(stack, now)) continue;
      removeStack(engine, stack.id, tsid);
      any = true;
      if (tsid === engine.streetTsid) here = true;
    }
  }
  if (here) engine.droppedItemsChanged?.();
  else if (any) engine.save?.();
  return any;
}

function setupDemo(engine) {
  if (demoDone || engine.param?.('snoconedemo') !== '1') return;
  demoDone = true;
  for (const classTsid of Object.keys(SNO_CONES)) if (countItem(engine.inv, classTsid) < 1) addItem(engine.inv, classTsid, 1);
  if ((Number(engine.pc.level) || 0) < 15) {
    engine.pc.xp = Math.max(Number(engine.pc.xp) || 0, XP_FOR_LEVEL[14] || 0);
    engine.pc.level = 15;
    engine.updateHud?.();
  }
  const preset = Number(engine.param?.('snoconeeaten'));
  if (Number.isFinite(preset) && preset >= 0) daily = { day: dayKey(), eaten: Math.floor(preset) };
  engine.refreshPack?.();
  const auto = engine.param?.('snoconeautoplay');
  if (auto === 'drop') {
    setTimeout(() => {
      const drop = engine.dropWorldStack?.('sno_cone_blue', 1, (engine.player?.x || 0) + 60, (engine.player?.y || 0) - 1);
      if (drop?.ok) removeItem(engine.inv, 'sno_cone_blue', 1);
      if (drop?.stack) bemoanDroppedSnoCone(engine, { state: { id: drop.stack.id } });
    }, 1500);
  } else if (isSnoCone(auto)) {
    setTimeout(() => eatPackedSnoCone(engine, auto), 1500);
  }
}

export const snoConesFeature = {
  id: SNO_CONES_FEATURE_ID,

  onStreetEnter(street, engine) {
    setupDemo(engine);
    meltSnoCones(engine);
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (now - meltCheckAt < MELT_CHECK_MS) return;
    meltCheckAt = now;
    meltSnoCones(engine, now);
  },

  packVerbs(classTsid, engine) {
    if (!isSnoCone(classTsid) || countItem(engine.inv, classTsid) < 1) return [];
    return [snoConeEatButton(classTsid, eatenToday())];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!isSnoCone(classTsid) || verbId !== 'eat') return false;
    eatPackedSnoCone(engine, classTsid);
    return true;
  },

  /** A dropped cone: Pick up only at home, and Bemoan (sno_cone_base keys_in_location). */
  decorateVerbs(target, verbs, engine) {
    if (target?.classId !== 'dropped_item' || !isSnoCone(target.state?.classTsid)) return null;
    const home = atHome(engine);
    const out = verbs.map((v) => (v.id === 'pickup'
      ? { ...v, tooltip: SNO_CONE_TEXT.pickupTooltip, enabled: home && v.enabled !== false, reason: home ? v.reason : SNO_CONE_TEXT.pickupRefused }
      : v));
    out.push({ id: BEMOAN_VERB, label: 'bemoan', sort: 50, tooltip: SNO_CONE_TEXT.bemoanTooltip, enabled: true, reason: '', energy: 0, durationMs: 0 });
    return out;
  },

  runVerbOverride(target, verbId, engine) {
    if (verbId !== BEMOAN_VERB) return null;
    bemoanDroppedSnoCone(engine, target);
    return true;
  },

  save() {
    return { version: 1, daily: { ...daily } };
  },

  restore(slice) {
    const d = slice?.daily || {};
    daily = { day: String(d.day || ''), eaten: Math.max(0, Math.floor(Number(d.eaten) || 0)) };
  },

  /** Tests. */
  _state() {
    return { daily: { ...daily }, last };
  },
  _reset() {
    daily = { day: '', eaten: 0 };
    last = '';
    meltCheckAt = 0;
    demoDone = false;
  },
};
