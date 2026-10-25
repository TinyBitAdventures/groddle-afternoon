/**
 * Powders as a feature module (see js/feature-host.js). Rules live in
 * js/powders.js; this file puts each jar's one verb on its pack popover and
 * plays it on the street.
 *
 * - No-No Powder: Sniff. A rush (both tanks held full, croak suppressed by
 *   hell.js) of 360 s halved by every earlier sniff today, then a crash of
 *   the same shape that drains 3% a minute; a crash that ends with no rush
 *   croaks you. A rush kept going more than 660 s after the first sniff
 *   earns Dragon Chaser. Sniffing while pooped wastes the powder.
 * - Sneezing Powder: Scatter. -2 mood and, two seconds later, the ah-choo
 *   and a Bean at your feet. (The sneezing itself is for other players.)
 * - Sparkle Powder: Sprinkle. -20 energy, +10 mood.
 * - Powder of Mild / Startling Fecundity: Disperse. The street's piggies,
 *   butterflies and chickens (15 at most) drop meat, milk and grain 6 / 7 s
 *   later; ten minutes of Fecundity Powder Cooldown. Startling over five or
 *   more animals earns Critter Catalyzer.
 * - Fertilidust: Disperse. Three seconds later every tree on the street grows
 *   one stage (trants to full health too); four or more trees earn Fertilivert.
 *   Every dead trant on the street (a patches-feature plot) comes back at
 *   maturity 4, health 5, for 25 iMG each. Fertilidust Lite: Sprinkle, the
 *   closest living tree only.
 * - Fairly / Extremely Hallowed Shrine Powder: Sprinkle. Doubles / triples
 *   your next shrine donation (js/shrines.js); an Extremely Hallowed donation
 *   worth 1,000 or more earns Hallowed Be Shrine Name (game.js).
 * - Krazy Salts: Push (-2 mood; kept).
 *
 * Charges: a jar has 5 (No-No Powder is used up by each sniff); the open
 * jar's charges are saved per class, and the jar goes at zero.
 *
 * Feats (solo Feats, js/solo-feats.js): Fertilidust that reaches living
 * trees gives "... And Ask Nothing in Return" +3 waiting (fertilidust.js:352
 * pc.feats_increment_for_commit(3), inside `if (trants)`), so the runner
 * sends fertilidust:trees_grown only then; reviving dead trants alone sends
 * just the verb's own fertilidust:disperse, which the Feat does not count.
 * Fertilidust Lite gives +1 (fertilidust_lite.js:296) and a Fecundity powder
 * loses the pile (feats_reset_commit). The source switched these off after
 * the Feat ran (inc_feats.js:321 returns on its first line); solo Feats turn
 * them back on.
 *
 * Not built: the sneezing and sparkle effects on other players (Sneeze-O-Rama
 * needs 5 of them, Sparkle Buddy 7: lost). Nothing to build for
 * include/trants.js:1244 onFertilidust: it calls this.reduceRookedness(60) on
 * a rooked trant, but no GSJS file defines reduceRookedness.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&powderdemo=1 packs one of
 *   every powder (a Fecundity cooldown is cleared); &powderautoplay=<class>
 *   runs that powder's verb once on arrival. Canvas: powderDemo, powderLast,
 *   powderCharges, powderNoNo, powderTreesGrown.
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-4';
import { getGameDayKey } from '../game-day.js';
import { isPooped } from '../hell.js';
import { moodMax } from '../metabolics.js';
import {
  POWDERS,
  POWDER_TEXT,
  dragonChased,
  fecundityScatter,
  FECUNDITY_DELAY_MS,
  fertilidustLiteTarget,
  fertilidustOutcome,
  fertilizeTree,
  isFertileTree,
  noNoCrashSeconds,
  powderVerbFor,
  sniffNoNo,
  sprinkleHallowed,
  usePowderCharge,
} from '../powders.js?v=powders-1';
import { itemVerbAchievementCounters } from '../item-verbs.js?v=g137-1';
import { DEAD_TRANT_CLASSES } from '../patches.js';
import { hellFeature } from './hell-feature.js?v=hell-7';
import { grantMoodXp } from '../mood-xp.js';

export const POWDERS_FEATURE_ID = 'powders';

let charges = {};
let noNo = { day: '', sniffs: 0, startAt: 0 };
let pending = [];
let last = '';
let demoDone = false;

function publish(engine) {
  engine.setData?.('powderLast', last);
  engine.setData?.('powderCharges', Object.entries(charges).map(([k, v]) => `${k}:${v}`).join(','));
  engine.setData?.('powderNoNo', `${noNo.sniffs}@${noNo.day}${noNo.startAt ? ':rush' : ''}`);
}

function later(ms, fn) {
  pending.push({ at: Date.now() + ms, fn });
}

function say(engine, text, ok = true) {
  if (!text) return;
  engine.pushActivity?.(text);
  engine.toast?.(text, ok ? 3600 : 2600);
}

function sniffsToday(now = Date.now()) {
  const day = getGameDayKey(now);
  if (noNo.day !== day) noNo = { ...noNo, day, sniffs: 0 };
  return noNo.sniffs;
}

function nearestPlayerX(engine) {
  return Number(engine.player?.x) || 0;
}

/** Street trees and animals, from the live targets (game.js, patches, resource nodes). */
function streetTargets(engine, test) {
  return (engine.interactables || []).filter((t) => t?.sprite && !t.sprite.destroyed && test(t));
}

function treeTargets(engine) {
  return streetTargets(engine, (t) => isFertileTree(t.classId) && t.state && !/_dead$/.test(t.classId));
}

/** Dead trants on the street: patches-feature plots (tree-death-feature adopts dead street trees there). */
function deadTreeTargets(engine) {
  return streetTargets(engine, (t) => t.featureId === 'patches' && DEAD_TRANT_CLASSES.includes(t.classId) && t.patchKey);
}

/**
 * fertilidust.js onUse replaceWith: mark each dead trant's plot; the patches
 * feature's next tick (500 ms) revives it (js/patches.js tickPlot, reviveDeadTree)
 * and redraws it as a living tree.
 */
function reviveDeadTrees(engine, targets, now = Date.now()) {
  const plots = engine.streetSlot?.('patches')?.plots || {};
  const revived = [];
  for (const target of targets) {
    const plot = plots[target.patchKey];
    if (plot?.stage !== 'dead') continue;
    plot.fertilidustAt = now;
    revived.push(`${target.classId}:${target.patchKey}`);
  }
  engine.setData?.('powderTreesRevived', revived.join(','));
  return revived.length;
}

function notify(engine, classTsid, verb) {
  for (const row of itemVerbAchievementCounters(classTsid, verb)) engine.achievement(row.counter, row.amount);
}

/** powder_base doVerb after a successful onUse: use_sound, one charge, notifyVerb. */
function finishUse(engine, classTsid) {
  const def = POWDERS[classTsid];
  if (def.sound) engine.playSound?.(def.sound, { volume: 0.6 });
  const used = usePowderCharge(classTsid, charges[classTsid]);
  if (used.emptied) {
    removeItem(engine.inv, classTsid, 1);
    delete charges[classTsid];
  } else if (used.charges != null) {
    charges[classTsid] = used.charges;
  }
  notify(engine, classTsid, def.verb);
  engine.refreshPack?.();
  engine.save?.();
}

function fertilize(engine, targets) {
  const grown = [];
  for (const target of targets) {
    const before = target.state?.maturity;
    if (!fertilizeTree(target.classId, target.state)) continue;
    grown.push(`${target.classId}:${before}>${target.state.maturity}`);
    engine.refreshTreeVisual?.(target);
  }
  engine.setData?.('powderTreesGrown', grown.join(','));
}

const RUNNERS = {
  no_no_powder(engine, classTsid) {
    const now = Date.now();
    const out = sniffNoNo({ pooped: Boolean(isPooped(hellFeature._state?.(), now)), sniffsToday: sniffsToday(now) });
    if (!out.ok) {
      // no_no_powder.js: a failed sniff still deletes the powder (no sound, no charge).
      removeItem(engine.inv, classTsid, 1);
      engine.refreshPack?.();
      say(engine, out.message, false);
      return 'pooped';
    }
    // pc.no_no_powder_start: set by the first rush of a chain, cleared when a
    // crash ends without one (here: when neither is running, as after a croak).
    if (!noNo.startAt || (!engine.hasBuff('no_no_powder') && !engine.hasBuff('no_no_powder_crash'))) noNo.startAt = now;
    // catalog_buffs.js no_no_powder on_apply: the crash ends, the rush restarts.
    engine.removeBuff('no_no_powder_crash');
    engine.removeBuff('no_no_powder');
    engine.applyBuff('no_no_powder', { durationSec: out.durationSec });
    noNo.sniffs += 1;
    say(engine, out.message);
    finishUse(engine, classTsid);
    return `rush:${out.durationSec}`;
  },

  sneezing_powder(engine, classTsid) {
    const pc = engine.pc;
    pc.mood = Math.max(0, (Number(pc.mood) || 0) - 2);
    say(engine, POWDER_TEXT.sneezing);
    const x = nearestPlayerX(engine);
    const y = Number(engine.player?.y) || 0;
    // sneezing_powder.js: SNEEZING_AHCHOO and a Bean at your feet two seconds later.
    later(2000, () => {
      engine.playSound?.('SNEEZING_AHCHOO', { volume: 0.7 });
      engine.dropWorldStack?.('bean_plain', 1, x, y - 1);
    });
    finishUse(engine, classTsid);
    engine.updateHud?.();
    return 'scatter';
  },

  sparkle_powder(engine, classTsid) {
    const pc = engine.pc;
    pc.energy = Math.max(0, (Number(pc.energy) || 0) - 20);
    pc.mood = Math.min(moodMax(pc), (Number(pc.mood) || 0) + 10);
    say(engine, POWDER_TEXT.sparkle);
    finishUse(engine, classTsid);
    engine.updateHud?.();
    return 'sprinkle';
  },

  fecundity(engine, classTsid) {
    const kind = POWDERS[classTsid].fecundity;
    const animals = streetTargets(engine, (t) => /^npc_(?:piggy|butterfly|chicken)$/.test(t.classId))
      .map((t) => ({ classId: t.classId, x: t.sprite.x, y: t.sprite.y }));
    const out = fecundityScatter(kind, animals);
    for (const drop of out.drops) {
      later(FECUNDITY_DELAY_MS[kind], () => engine.dropWorldStack?.(drop.classTsid, drop.count, drop.x, drop.y - 1));
    }
    later(2000, () => engine.playSound?.(out.sound, { volume: 0.6 }));
    for (const row of out.achievementCounters) engine.achievement(row.counter, row.amount);
    say(engine, out.message);
    engine.applyBuff('fecundity_cooldown');
    finishUse(engine, classTsid);
    return `${kind}:${out.count}`;
  },

  fertilidust(engine, classTsid) {
    const trees = treeTargets(engine);
    const deadTargets = deadTreeTargets(engine);
    const paper = streetTargets(engine, (t) => t.classId === 'paper_tree').length;
    const out = fertilidustOutcome({ trants: trees.length, dead: deadTargets.length, paper });
    for (const msg of out.msgs) say(engine, msg, out.ok);
    if (!out.ok) return 'no-trees';
    const dead = reviveDeadTrees(engine, deadTargets);
    if (out.xp) {
      // 25 iMG for every dead trant brought back (fertilidust.js 371,
      // stats_add_xp(n, false): the mood bonus applies).
      const xp = grantMoodXp(engine.pc, out.xp);
      if (engine.player) engine.floatText?.(engine.player.x, engine.player.y - 90, `+${xp} iMG`, 0xb388ff);
      engine.updateHud?.();
    }
    if (trees.length) later(3000, () => fertilize(engine, trees));
    if (out.sound) later(2000, () => engine.playSound?.(out.sound, { volume: 0.6 }));
    for (const row of out.achievementCounters) engine.achievement(row.counter, row.amount);
    // fertilidust.js:352: the Feat counts only when living trees took the dust.
    if (trees.length) engine.achievement('fertilidust:trees_grown', 1);
    finishUse(engine, classTsid);
    return `trees:${trees.length}${dead ? `:revived:${dead}` : ''}`;
  },

  fertilidust_lite(engine, classTsid) {
    const trees = [
      ...treeTargets(engine),
      ...streetTargets(engine, (t) => t.classId === 'paper_tree'),
    ].map((t) => ({ classId: t.classId, x: t.sprite.x, target: t }));
    const out = fertilidustLiteTarget(trees, nearestPlayerX(engine));
    say(engine, out.message, out.ok);
    if (!out.ok) return 'no-tree';
    later(3000, () => fertilize(engine, [out.tree.target]));
    later(2000, () => engine.playSound?.(out.sound, { volume: 0.6 }));
    finishUse(engine, classTsid);
    return `tree:${out.tree.classId}`;
  },

  hallowed(engine, classTsid) {
    const out = sprinkleHallowed(classTsid, { active: engine.hasBuff(POWDERS[classTsid].buffId) });
    say(engine, out.message, out.ok);
    if (!out.ok) return 'already';
    engine.applyBuff(out.buffId);
    // The effect sound plays only with a shrine on the street (findCloseStack isShrine).
    if (streetTargets(engine, (t) => /^npc_shrine/.test(String(t.classId))).length) {
      later(2000, () => engine.playSound?.(out.sound, { volume: 0.6 }));
    }
    finishUse(engine, classTsid);
    return out.buffId;
  },

  krazy_salts(engine, classTsid) {
    const pc = engine.pc;
    pc.mood = Math.max(0, (Number(pc.mood) || 0) - 2);
    say(engine, POWDER_TEXT.krazy);
    notify(engine, classTsid, 'push');
    engine.updateHud?.();
    return 'push';
  },
};

function runnerFor(classTsid) {
  const def = POWDERS[classTsid];
  if (!def) return null;
  if (def.fecundity) return RUNNERS.fecundity;
  if (def.buffId) return RUNNERS.hallowed;
  return RUNNERS[classTsid] || null;
}

/** Run a powder's verb (also the QA autoplay and tests). */
export function runPowder(engine, classTsid) {
  const def = POWDERS[classTsid];
  if (!def || countItem(engine.inv, classTsid) < 1) return null;
  const button = powderVerbFor(classTsid, { charges: charges[classTsid], cooldown: engine.hasBuff('fecundity_cooldown') });
  if (!button.enabled) {
    engine.toast?.(button.reason, 2400);
    return null;
  }
  last = `${classTsid}:${runnerFor(classTsid)(engine, classTsid)}`;
  publish(engine);
  return last;
}

function setupDemo(engine) {
  if (demoDone || engine.param?.('powderdemo') !== '1') return;
  demoDone = true;
  for (const classTsid of Object.keys(POWDERS)) {
    if (countItem(engine.inv, classTsid) < 1) addItem(engine.inv, classTsid, 1);
  }
  engine.removeBuff?.('fecundity_cooldown');
  engine.setData?.('powderDemo', '1');
  engine.refreshPack?.();
  const auto = engine.param?.('powderautoplay');
  if (auto && POWDERS[auto]) later(1500, () => runPowder(engine, auto));
}

export const powdersFeature = {
  id: POWDERS_FEATURE_ID,

  onStreetEnter(street, engine) {
    setupDemo(engine);
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (!pending.length) return;
    const due = pending.filter((p) => p.at <= now);
    if (!due.length) return;
    pending = pending.filter((p) => p.at > now);
    for (const p of due) p.fn();
  },

  onStreetClear() {
    // Effects scheduled for the street you left do not follow you.
    pending = [];
  },

  onEvent(counter, amount, engine) {
    if (counter === 'buff_tick:no_no_powder') {
      // catalog_buffs.js:1487 (on_tick): Dragon Chaser.
      if (dragonChased(noNo.startAt) && !(engine.unlockedAchievements || []).includes('dragon_chaser')) {
        engine.achievement('powders:dragon_chaser', 1);
      }
    } else if (counter === 'buff_expired:no_no_powder') {
      // no_no_powder on_remove: the crash, halved after the first sniff today.
      engine.applyBuff('no_no_powder_crash', { durationSec: noNoCrashSeconds(sniffsToday()) });
    } else if (counter === 'buff_expired:no_no_powder_crash') {
      // no_no_powder_crash on_remove: no rush running, so croak (hell.js croaks at zero energy).
      if (!engine.hasBuff('no_no_powder')) {
        noNo.startAt = 0;
        engine.pc.energy = 0;
        engine.updateHud?.();
        engine.save?.();
      }
    }
    publish(engine);
  },

  packVerbs(classTsid, engine) {
    if (!POWDERS[classTsid] || countItem(engine.inv, classTsid) < 1) return [];
    return [powderVerbFor(classTsid, { charges: charges[classTsid], cooldown: engine.hasBuff('fecundity_cooldown') })];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!POWDERS[classTsid] || POWDERS[classTsid].verb !== verbId) return false;
    runPowder(engine, classTsid);
    return true;
  },

  save() {
    return { version: 1, charges: { ...charges }, noNo: { ...noNo } };
  },

  restore(slice) {
    charges = {};
    for (const [k, v] of Object.entries(slice?.charges || {})) {
      const n = Math.floor(Number(v));
      if (POWDERS[k]?.maxCharges && n > 0 && n < POWDERS[k].maxCharges) charges[k] = n;
    }
    const s = slice?.noNo || {};
    noNo = { day: String(s.day || ''), sniffs: Math.max(0, Math.floor(Number(s.sniffs) || 0)), startAt: Math.max(0, Number(s.startAt) || 0) };
    pending = [];
  },

  /** Tests. */
  _state() {
    return { charges, noNo, pending: pending.length, last };
  },
  _reset() {
    charges = {};
    noNo = { day: '', sniffs: 0, startAt: 0 };
    pending = [];
    last = '';
    demoDone = false;
  },
  _flush(now = Infinity) {
    this.onTick(0, now);
  },
};
