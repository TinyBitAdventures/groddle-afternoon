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
 * - Sneezing Powder: Scatter. -2 mood and, two seconds later, the ah-choo,
 *   its sneeze overlay over you and a Bean at your feet. (The sneezing fits
 *   are for other players.)
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
 * Multiplayer (G327; engine.mode 'multiplayer' with the realtime client):
 * Scatter and Sprinkle first ask the realtime server (groddle-afternoon-server
 * hi.go powder_spread), which counts the street: over 15 players a Sneezing
 * Powder is "Really? Really?! Why be SUCH a jerk??" and a splanking (three
 * drops of 10 mood), over 10 a Sparkle Powder is "There ain't enough sparkle
 * in the jar for this many people."; neither uses a charge. Otherwise the jar
 * runs as in solo and every other player on the street catches it: the
 * Sneezing buff (sneezes the server times, 0-8 s in and at 13 s, seen by
 * everyone, and at 21 s the last one and a Bean at their feet) or +20 mood,
 * each with the source's line; Sneeze-O-Rama at 5 others, Sparkle Buddy at 7
 * (the server's powders counters). The 150% window sparkle overlay is not
 * built (overlay_sparkle_powder.fla is not in the overlay sheets yet).
 * Canvas: powderMp.
 *
 * Fertilidust in multiplayer (G361, G335 slice 4): the street's shared trees
 * are the server's. Using a jar on them asks the server first
 * (street-objects-feature sharedFertilize, the server's objects.go
 * handleDust), which uses one of the jar's charges through the site's ledger
 * (LedgerUse.php) and refuses with the ledger's words when it holds none.
 * Its go-ahead (powderUseGranted) runs the verb here, with the charges the
 * ledger left (an emptied jar applied once through ledgerReceipt), and the
 * server grows the trees for everyone as the dust lands; the local rules run
 * on this page's copy at the same moment.
 *
 * Solo: the sneezing and sparkle effects on other players are multiplayer's
 * (Sneeze-O-Rama and Sparkle Buddy stay out of reach). Nothing to build for
 * include/trants.js:1244 onFertilidust: it calls this.reduceRookedness(60) on
 * a rooked trant, but no GSJS file defines reduceRookedness.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&powderdemo=1 packs one of
 *   every powder (a Fecundity cooldown is cleared); &powderautoplay=<class>
 *   runs that powder's verb once on arrival. Canvas: powderDemo, powderLast,
 *   powderCharges, powderNoNo, powderTreesGrown.
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { getGameDayKey } from '../game-day.js';
import { isPooped } from '../hell.js';
import { metabolicGain, moodMax, loseEnergy, loseMood } from '../metabolics.js';
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
} from '../powders.js?v=g414-1';
import { itemVerbAchievementCounters } from '../item-verbs.js?v=item-verbs-4';
import { DEAD_TRANT_CLASSES } from '../patches.js?v=g414-1';
import { hellFeature } from './hell-feature.js?v=hell-16';
import { grantMoodXp } from '../mood-xp.js';
import { displayTopOf, playSheetOverlay } from '../overlay-art.js?v=g448-2';
import { OVERLAY_USES, playOverlay } from '../overlays.js?v=g448-2';
import {
  POWDER_MP,
  POWDER_MP_TEXT,
  SPREAD_POWDERS,
  counterRows,
  powderCaughtLine,
  powderRefusedLine,
  powderRefusedSound,
} from '../hi-signs-mp.js?v=g327-1';

export const POWDERS_FEATURE_ID = 'powders';

let charges = {};
let noNo = { day: '', sniffs: 0, startAt: 0 };
let pending = [];
let last = '';
let demoDone = false;
/** G335: the server's go-ahead for a jar on shared trees, while its verb runs: { classTsid, use }. */
let granted = null;

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
/**
 * G380: the powder burst on each tree (fertilidust.js 283-294: target_effect_powder_extreme, 300 px,
 * delta 25 / 200 from the stack's top, 5.4 s after 2 s; fertilidust_lite.js 279-290:
 * target_effect_powder_mild, delta 75 / 200, 4.3 s).
 */
function powderBurst(engine, key, targets) {
  const use = OVERLAY_USES[key];
  for (const t of targets) {
    const spr = t?.sprite;
    if (!spr || spr.destroyed) continue;
    playOverlay(engine.PIXI, key, {
      layer: engine.fxLayer || engine.entityLayer,
      at: () => ({ x: spr.x + use.dx, y: displayTopOf(spr) + use.dy }),
      wh: use.wh,
      durationMs: use.durationMs,
      delayMs: use.delayMs,
      loop: false,
    });
  }
  engine.setData?.('powderBurst', `${key}:${targets.length}`);
}

function finishUse(engine, classTsid) {
  const def = POWDERS[classTsid];
  if (def.sound) engine.playSound?.(def.sound, { volume: 0.6 });
  const use = granted?.classTsid === classTsid ? granted.use : null;
  if (use && def.maxCharges) {
    // The ledger used this charge (LedgerUse.php): the jar holds what it says is left, and an
    // emptied jar leaves the pack once (the trade slice's applied list holds its op).
    const left = Math.max(0, Math.floor(Number(use.left) || 0));
    if (use.spent && engine.query?.('ledgerReceipt', String(use.op || ''), engine) === false) {
      delete charges[classTsid];
      notify(engine, classTsid, def.verb);
      engine.refreshPack?.();
      engine.save?.();
      return;
    }
    charges[classTsid] = use.spent ? 1 : Math.min(def.maxCharges - 1, left) + 1;
  }
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

/**
 * G335 multiplayer: a jar used on the street's shared trees asks the server first (its go-ahead runs
 * the verb again through powderUseGranted). True when asked; false for trees that are only yours.
 */
function askDust(engine, classTsid, targets, lite) {
  if (granted?.classTsid === classTsid) return false;
  return engine.query?.('sharedFertilize', targets, lite, engine, classTsid) === true;
}

function fertilize(engine, targets) {
  // G361 multiplayer: the server grows the street's shared trees for everyone as the dust lands (it was asked when the jar was used).
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
    loseMood(pc, 2); // sneezing_powder.js 297 metabolics_lose_mood(2) (G300)
    say(engine, POWDER_TEXT.sneezing);
    const x = nearestPlayerX(engine);
    const y = Number(engine.player?.y) || 0;
    // sneezing_powder.js: SNEEZING_AHCHOO and a Bean at your feet two seconds later, and (282-293)
    // the overlay_sneezing_powder pc_overlay over you: delay_ms 2000, 2 s, 300 x 300, delta_y -110.
    later(2000, () => {
      engine.playSound?.('SNEEZING_AHCHOO', { volume: 0.7 });
      engine.dropWorldStack?.('bean_plain', 1, x, y - 1);
      sneezeOverlay(engine, () => (engine.player ? { x: engine.player.x, y: engine.player.y } : null));
    });
    finishUse(engine, classTsid);
    engine.updateHud?.();
    return 'scatter';
  },

  sparkle_powder(engine, classTsid) {
    const pc = engine.pc;
    loseEnergy(pc, 20); // G289 loss gate (inc_metabolics.js 108-122)
    // sparkle_powder.js 289: metabolics_add_mood(10), nothing while dead (inc_metabolics.js 79-86).
    if (metabolicGain('mood').ok) pc.mood = Math.min(moodMax(pc), (Number(pc.mood) || 0) + 10);
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
    if (out.ok && askDust(engine, classTsid, trees, false)) return 'asked';
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
    powderBurst(engine, 'target_effect_powder_extreme', trees);
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
    if (out.ok && askDust(engine, classTsid, [out.tree.target], true)) return 'asked';
    say(engine, out.message, out.ok);
    if (!out.ok) return 'no-tree';
    later(3000, () => fertilize(engine, [out.tree.target]));
    powderBurst(engine, 'target_effect_powder_mild', [out.tree.target]);
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
    loseMood(pc, 2); // krazy_salts.js 111 metabolics_lose_mood(2) (G300)
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
  // Multiplayer: Scatter and Sprinkle reach the street; the server says who first (powder_spread).
  if (SPREAD_POWDERS.has(classTsid) && ensureMp(engine)?.state === 'online') {
    if (asking) return null;
    asking = classTsid;
    mpc.send('powder_spread', { cls: classTsid });
    last = `${classTsid}:asked`;
    mpNote(engine, last);
    publish(engine);
    return last;
  }
  last = `${classTsid}:${runnerFor(classTsid)(engine, classTsid)}`;
  publish(engine);
  return last;
}

// ---------------------------------------------------------------------------
// Multiplayer (G327): powders that spread to the other players on the street
// ---------------------------------------------------------------------------

let mpc = null;
let asking = '';

function ensureMp(engine) {
  if (mpc) return mpc;
  if (engine?.mode !== 'multiplayer') return null;
  const c = engine.query?.('realtimeClient');
  if (c) attachMp(engine, c);
  return mpc;
}

function mpNote(engine, s) {
  engine.setData?.('powderMp', s);
}

function remoteAt(id) {
  const r = globalThis.groddleRealtime?.remotes?.get?.(Number(id))?.root;
  return r && !r.destroyed ? { x: r.x, y: r.y } : null;
}

/** The sneeze over a player (pc_overlay overlay_sneezing_powder, 300 x 300, 110 px up). */
function sneezeOverlay(engine, at) {
  let spot = at();
  const layer = engine.fxLayer || engine.entityLayer;
  if (!engine.PIXI || !layer || !spot) return;
  playSheetOverlay(engine.PIXI, 'overlay_sneezing_powder', {
    layer,
    // A pc_overlay stands (center bottom) 110 px above the feet, following them; where they were if they left.
    at: () => {
      spot = at() || spot;
      return { x: spot.x, y: spot.y + POWDER_MP.SNEEZE_DY };
    },
    wh: POWDER_MP.SNEEZE_WH,
    durationMs: POWDER_MP.SNEEZE_MS,
    loop: false,
    zIndex: 70,
  });
}

function attachMp(engine, c) {
  mpc = c;
  c.on('msg:powder_spread', (m) => onSpread(engine, m));
  c.on('msg:powder_caught', (m) => onCaught(engine, m));
  c.on('msg:powder_sneeze', (m) => onSneeze(engine, m));
  c.on('state', ({ state }) => {
    if (state !== 'online') asking = '';
  });
}

/** The server's answer to Scatter / Sprinkle: run the jar (as solo) and count the badge, or refuse. */
function onSpread(engine, m) {
  const cls = String(m.cls || '');
  if (!SPREAD_POWDERS.has(cls) || asking !== cls) return;
  asking = '';
  if (!m.ok) {
    const line = powderRefusedLine(cls, m.why);
    say(engine, line, false);
    const sound = powderRefusedSound(cls, m.why);
    if (sound) engine.playSound?.(sound, { volume: 0.6 });
    if (cls === 'sneezing_powder' && m.why === 'crowd') {
      // naughtySplanking (players/player.js 2936-2970): three drops of 10 mood, 3.5 s apart.
      for (let i = 1; i <= POWDER_MP.SPLANK_DROPS; i += 1) {
        later(i * POWDER_MP.SPLANK_MS, () => {
          loseMood(engine.pc, POWDER_MP.SPLANK_MOOD);
          engine.updateHud?.();
        });
      }
    }
    last = `${cls}:refused:${m.why || ''}`;
    mpNote(engine, last);
    publish(engine);
    return;
  }
  if (countItem(engine.inv, cls) < 1) return;
  last = `${cls}:${runnerFor(cls)(engine, cls)}:${Number(m.players) || 0}`;
  for (const [counter, amount] of counterRows(m.counters)) engine.achievement(counter, amount);
  mpNote(engine, last);
  publish(engine);
}

/** Someone else's powder reached you. */
function onCaught(engine, m) {
  const cls = String(m.cls || '');
  const name = String(m.from?.name || '');
  if (cls === 'sneezing_powder') {
    // catalog_buffs.js 2411: Sneezing, 21 s; its sneezes come from the server (powder_sneeze).
    engine.applyBuff?.('sneezing');
    say(engine, powderCaughtLine(cls, name));
  } else if (cls === 'sparkle_powder') {
    // sparkle_powder.js 324: metabolics_add_mood(20) for each of the others.
    const pc = engine.pc;
    let granted = 0;
    if (pc && metabolicGain('mood').ok) {
      const before = Number(pc.mood) || 0;
      pc.mood = Math.min(moodMax(pc), before + POWDER_MP.SPARKLE_MOOD);
      granted = Math.round(pc.mood - before);
    }
    say(engine, powderCaughtLine(cls, name, granted));
    engine.updateHud?.();
    engine.save?.();
  } else return;
  mpNote(engine, `caught:${cls}:${name}`);
}

/** A sneeze on the street: yours (the sound, the line, at the last one the bean) or another player's overlay. */
function onSneeze(engine, m) {
  const id = Number(m.id) || 0;
  const mine = id && id === Number(mpc?.me?.id);
  if (mine) {
    const pl = engine.player;
    engine.playSound?.('SNEEZING_AHCHOO', { volume: 0.7 });
    sneezeOverlay(engine, () => (engine.player ? { x: engine.player.x, y: engine.player.y } : null));
    if (m.last) {
      say(engine, POWDER_MP_TEXT.lastSneeze);
      // Sneezing on_remove: location.createItem('bean_plain', 1, pc.x, pc.y).
      if (pl) engine.dropWorldStack?.('bean_plain', 1, pl.x, pl.y - 1);
    } else engine.pushActivity?.(POWDER_MP_TEXT.sneeze);
    mpNote(engine, `sneeze:me${m.last ? ':last' : ''}`);
    return;
  }
  if (!id || engine.query?.('realtimeHidden', id)) return;
  sneezeOverlay(engine, () => remoteAt(id));
  mpNote(engine, `sneeze:${id}${m.last ? ':last' : ''}`);
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
    if (engine?.mode === 'multiplayer' && !mpc) ensureMp(engine);
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

  /**
   * G335: the server's go-ahead for a jar used on shared trees (street-objects-feature, on
   * obj_dust_used): the verb runs now with the charges the ledger left (use: { op, c, left, spent },
   * or null when the server has no ledger and the jar is this page's own word).
   */
  powderUseGranted(classTsid, use, engine) {
    if (!POWDERS[classTsid] || !engine || countItem(engine.inv, classTsid) < 1) return null;
    granted = { classTsid, use: use && typeof use === 'object' ? use : null };
    try {
      last = `${classTsid}:${runnerFor(classTsid)(engine, classTsid)}:granted`;
    } finally {
      granted = null;
    }
    publish(engine);
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
  _attachMp(engine, client) {
    attachMp(engine, client);
  },
  _reset() {
    mpc = null;
    asking = '';
    granted = null;
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
