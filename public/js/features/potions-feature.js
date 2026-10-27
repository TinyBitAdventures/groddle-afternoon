/**
 * The Cauldron's quaff and pour potions that had no verb (G149), and the
 * Rug's Munch, as a feature module (see js/feature-host.js). Rules and copy
 * live in js/potions.js.
 *
 * Every potion gets its source verb on its pack popover ("Quaff (5/5)",
 * "Pour (3/3)"), disabled with its own canQuaff / canPour reason. A use is
 * the potion_base 2.5 s overlay (the bottle over your head, or over the
 * animal or tree you pour on) with the potion's tool sound, then the effect,
 * one use off the open bottle (an empty bottle is used up), the
 * potions_used counter and "You quaffed an Amorous Philtre. ..." in the
 * activity feed.
 *
 * - Amorous Philtre: Feeling Called Love (+10% of max mood, 60 s; a heart
 *   over the avatar for the buff's indicator). The Rug's Munch (FOX_EAT)
 *   applies it too, any time.
 * - Elixir of Avarice: Crazy Quoin Collector, today's quoin limit + 50 until
 *   the new day.
 * - Draught of Giant Amicability (potion_favor): 111 favor with the open
 *   bottle's Giant (rolled when a bottle is opened), capped at the emblem
 *   target, once a day; Shake (three a day) picks another Giant.
 * - Keycutter Tonic: pick one of your keys; it becomes a different random
 *   key 1 to 6.
 * - Potion of Animal Youth: the closest Piggy, Chicken or Butterfly within
 *   200 px becomes a Piglet, Chick or Caterpillar on the ground.
 * - Embiggenifying / De-Embiggenifying Potion: a cloud at your feet for two
 *   minutes; walking into it scales you 1.2x / 0.6x for 10 s (BIGENNIFY /
 *   SMALLIFY; a new cloud replaces the other's effect). The BACK_TO_NORMAL
 *   sound the source queued 5 s later is not in the sound catalog.
 * - Rainbow Juice: a rainbow at your feet for five minutes; touching it
 *   reverses gravity five-fold for 2 s.
 * - Trantsformation Fluid: the closest grown tree within 200 px (an Egg Plant
 *   only on your home street) becomes a different random tree at health 4,
 *   maturity max(4, maturity - 3). A street tree's spot goes to the patches
 *   feature, as for a tree that died (tree-death-feature `replaced`).
 * - Charades Potion and Ancestral Spirits show their solo refusals: Charades
 *   needs other players; Ancestral Spirits needs Overwhelming Ancestral
 *   Nostalgia, the Ancestral Lands timer the remake leaves out (G39).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&potiondemo=1 packs one
 *   of every potion here, a Yellow-Purple Triangle Key and a Rug (open the
 *   pack and use them; &potionautoplay=<class> uses one on arrival, the key
 *   choice taking the first key). The Rug: &homedemo=decorate (a furnished
 *   room with a Rug) and &potionautoplay=rug, which munches once the Decorate
 *   bar is closed.
 *   Canvas: potionLast, potionUses, potionItems, potionScale, potionGravity,
 *   potionRugs, potionFavorGiant.
 */

import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { getGameDayKey } from '../game-day.js';
import { metabolicGain, moodMax } from '../metabolics.js';
import { quoinDailyLimitFor } from '../quoins.js';
import { emblemCostFor } from '../shrines.js?v=spinning-wheel-test-4';
import { GROWN_TREE_LABELS, trantsformPlotTree } from '../patches.js';
import { isPoisoned } from '../tree-poison.js';
import { furnitureSize } from '../home-decor.js?v=home-decor-4';
import { textureFromUrl, sourceFromUrl, frameTexture } from '../textures.js';
import { POTION_ART } from '../potion-art.js?v=g149-1';
import { playPoofIn, playSheetOverlay } from '../overlay-art.js?v=g311-1';
import {
  ANIMAL_BABIES,
  KEY_NAMES,
  PHYSICS_ITEMS,
  POTIONS,
  POTION_ACTION_MS,
  POTION_TEXT,
  POUR_RANGE,
  RUG_MUNCH,
  amorousCheck,
  ancestralCheck,
  animalYouthCheck,
  avariceCheck,
  charadesCheck,
  chooseFavorGiant,
  closestWithin,
  crazyQuoinLimit,
  favorCheck,
  favorMessage,
  favorShakeButton,
  shakeFavorGiant,
  isTrantsformable,
  keyChoices,
  keycutterCheck,
  keycutterMessage,
  keycutterReplacement,
  loveMood,
  physicsOf,
  physicsPourCheck,
  potionButton,
  potionMessage,
  touchPhysicsItem,
  touchesPhysicsItem,
  trantsformCheck,
  trantsformMessage,
  trantsformOutcome,
  usePotion,
} from '../potions.js?v=g149-1';
import { itemVerbAchievementCounters } from '../item-verbs.js?v=item-verbs-4';
import { patchesFeature } from './patches-feature.js?v=patches-15';
import { homesFeature } from './homes-feature.js?v=homes-45';
import { streetTreeIndex } from './tree-death-feature.js?v=tree-death-18';
import { questRoomConverse } from './quest-instances-feature.js?v=qi-16';

export const POTIONS_FEATURE_ID = 'potions';
const LOVE = 'feeling_called_love';
const CRAZY = 'crazy_coin_collector';
const TREE_DEATH = 'tree-death';
const RUG_SYNC_MS = 400;

let uses = {}; // open bottle uses per class
let favorGiant = ''; // the open Draught of Giant Amicability's Giant
let daily = { day: '', quaffed: {}, shakes: 0 };
let items = []; // physics items: { id, classTsid, tsid, x, y, expiresAt }
let seq = 0;
let effects = {}; // addCTPCPhysics: { [itemId]: { classTsid, until } }
let touching = new Set();
let baseScale = null;
let pending = null; // { classTsid, at, target, extra, fx }
let last = '';
let demoDone = false;
let autoplayAt = 0;
let lastRugSync = 0;
let rugTargets = [];
let heart = null; // playSheetOverlay handle
let heartRetryAt = 0;
let adopting = []; // street trees handed to patches, waiting for their plot's first draw
const views = new Map(); // item id -> sprite

const now = () => Date.now();

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('potionLast', last);
  engine.setData('potionUses', Object.entries(uses).map(([k, v]) => `${k}:${v}`).join(','));
  engine.setData('potionItems', items.filter((i) => i.tsid === engine.streetTsid).map((i) => i.classTsid).join(','));
  const phys = physicsOf(effects, now());
  engine.setData('potionScale', String(phys.scale));
  engine.setData('potionGravity', String(phys.gravity));
  engine.setData('potionRugs', String(rugTargets.length));
  engine.setData('potionFavorGiant', favorGiant);
}

function say(engine, text, ok = true) {
  if (!text) return;
  engine.pushActivity?.(text);
  engine.toast?.(text, ok ? 3600 : 2600);
}

function isDead(engine) {
  return engine.metabolicGate?.('energy', 'gain')?.ok === false;
}

function today() {
  const day = getGameDayKey(now());
  if (daily.day !== day) daily = { day, quaffed: {}, shakes: 0 };
  return daily;
}

function labelOf(classTsid) {
  return KEY_NAMES[classTsid] || GROWN_TREE_LABELS[classTsid] || classTsid;
}

/* ------------------------------------------------------------------ */
/* Targets                                                              */
/* ------------------------------------------------------------------ */

function live(engine, test) {
  return (engine.interactables || []).filter((t) => t?.sprite && !t.sprite.destroyed && t.sprite.visible !== false && test(t));
}

function closestAnimal(engine) {
  const p = engine.player;
  const list = live(engine, (t) => Boolean(ANIMAL_BABIES[t.classId])).map((t) => ({ x: t.sprite.x, target: t }));
  return closestWithin(list, Number(p?.x) || 0, POUR_RANGE)?.target || null;
}

function onHomeStreet(engine) {
  return Boolean(engine.homeContext?.().inHome);
}

function closestTree(engine) {
  const p = engine.player;
  const home = onHomeStreet(engine);
  // Street trees (no feature) and trees grown in Patches (grownFromBean); poisoned trees are not targets.
  const list = live(engine, (t) => !t.featureId && t.state && isTrantsformable(t, { home, poisoned: isPoisoned(t.state) }))
    .map((t) => ({ x: t.sprite.x, target: t }));
  return closestWithin(list, Number(p?.x) || 0, POUR_RANGE)?.target || null;
}

function signpostsHere(engine) {
  const b = engine.street?.bounds || { l: 0, t: 0 };
  return (engine.street?.signposts || []).map((s) => ({ x: s.x - b.l, y: s.y - b.t }));
}

/* ------------------------------------------------------------------ */
/* Checks                                                               */
/* ------------------------------------------------------------------ */

function maxFavorFor(engine, giant) {
  const shrine = engine.shrineState;
  return shrine ? emblemCostFor(shrine, giant) : 0;
}

function ensureFavorGiant() {
  if (!favorGiant) favorGiant = chooseFavorGiant();
  return favorGiant;
}

/** canQuaff / canPour for the open bottle, as { ok, error, tooltip } (plus the chosen target). */
function checkFor(classTsid, engine) {
  switch (classTsid) {
    case 'potion_amorous_philtre':
      return amorousCheck({ loveActive: engine.hasBuff(LOVE) });
    case 'potion_elixir_of_avarice':
      return avariceCheck({ crazyActive: engine.hasBuff(CRAZY) });
    case 'potion_favor': {
      const giant = ensureFavorGiant();
      return favorCheck({
        giant,
        quaffedToday: Boolean(today().quaffed[classTsid]),
        favor: Number(engine.shrineState?.favor?.[giant]) || 0,
        maxFavor: maxFavorFor(engine, giant),
      });
    }
    case 'potion_keycutter_tonic':
      return keycutterCheck({ keys: keyChoices(engine.inv) });
    case 'potion_charades':
      // Solo: nobody else is ever on the street. Multiplayer (player verbs): the players here, from
      // player-verbs-mp-feature (which answers nothing in solo).
      return engine.query?.('charadesCheck', engine) || charadesCheck({ players: 1 });
    case 'potion_ancestral_spirits':
      return ancestralCheck({ nostalgia: engine.hasBuff('ancestral_nostalgia') });
    case 'potion_animal_youth': {
      const target = closestAnimal(engine);
      return { ...animalYouthCheck(target), target };
    }
    case 'potion_avatar_large':
    case 'potion_avatar_small':
    case 'potion_rainbow_juice': {
      const p = engine.player || { x: 0, y: 0 };
      const memory = Boolean(engine.transientInstance?.()) && !engine.inScene?.() && !engine.instanceHold;
      return physicsPourCheck(classTsid, { x: p.x, y: p.y, signposts: signpostsHere(engine), room: engine.streetTsid, memory });
    }
    case 'potion_trantsformation_fluid': {
      const target = closestTree(engine);
      return { ...trantsformCheck(target), target };
    }
    default:
      return { ok: false };
  }
}

function buttonFor(classTsid, engine) {
  return potionButton(classTsid, { uses: uses[classTsid], dead: isDead(engine), check: checkFor(classTsid, engine) });
}

/* ------------------------------------------------------------------ */
/* The 2.5 s use                                                        */
/* ------------------------------------------------------------------ */

function bottleFx(engine, classTsid, target) {
  const { PIXI } = engine;
  if (!PIXI?.Sprite || !engine.entityLayer) return null;
  const spr = new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${classTsid}.png`));
  spr.anchor.set(0.5, 1);
  spr.zIndex = 900;
  spr.scale.set(0.9);
  engine.entityLayer.addChild(spr);
  const follow = () => {
    if (spr.destroyed) return;
    const host = target?.sprite && !target.sprite.destroyed ? target.sprite : engine.player;
    if (!host) return;
    // pc_overlay delta_y -135 over the avatar; itemstack_overlay delta_y 20 over a target.
    spr.x = host.x + Math.sin(now() / 140) * 3;
    spr.y = host.y - (target ? 110 : 135);
    spr.rotation = Math.sin(now() / 180) * 0.35;
  };
  follow();
  return { spr, follow };
}

function stopFx() {
  const s = pending?.fx?.spr;
  if (s && !s.destroyed) {
    s.parent?.removeChild(s);
    s.destroy();
  }
}

/** Start a quaff or pour: conditions now, the effect when the overlay ends. */
export function usePotionNow(engine, classTsid, extra = {}) {
  const def = POTIONS[classTsid];
  if (!def || countItem(engine.inv, classTsid) < 1 || pending) return null;
  const button = buttonFor(classTsid, engine);
  if (!button.enabled) {
    engine.toast?.(button.reason, 2600);
    last = `${classTsid}:refused`;
    publish(engine);
    return null;
  }
  const check = checkFor(classTsid, engine);
  const target = check.target || null;
  // potion_base: announce_sound('POTION_GENERIC'); the client's tool sound is POTION_<CLASS>.
  engine.playSound?.(classTsid.toUpperCase(), { volume: 0.6 });
  pending = { classTsid, at: now() + POTION_ACTION_MS, target, extra, tsid: engine.streetTsid };
  pending.fx = bottleFx(engine, classTsid, target);
  last = `${classTsid}:${def.verb}ing`;
  publish(engine);
  return pending;
}

/** onQuaffComplete / onPourComplete. */
function complete(engine) {
  const { classTsid, target, extra } = pending;
  stopFx();
  pending = null;
  if (countItem(engine.inv, classTsid) < 1) return;
  const result = EFFECTS[classTsid]?.(engine, { target, extra }) || { ok: false };
  const def = POTIONS[classTsid];
  if (result.ok && !result.noUse) {
    const used = usePotion(classTsid, uses[classTsid]);
    if (used.emptied) {
      removeItem(engine.inv, classTsid, 1);
      delete uses[classTsid];
      if (classTsid === 'potion_favor') favorGiant = '';
    } else {
      uses[classTsid] = used.uses;
    }
    engine.achievement(`potions_used:${classTsid}`, 1);
    for (const row of itemVerbAchievementCounters(classTsid, def.verb)) engine.achievement(row.counter, row.amount);
  }
  say(engine, potionMessage(classTsid, result.msg ? [result.msg] : [], !result.ok), result.ok);
  last = `${classTsid}:${result.ok ? result.tag || 'ok' : 'failed'}`;
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
}

function applyLove(engine) {
  // buffs_apply restarts a running buff; on_apply adds 10% of max mood.
  if (engine.hasBuff(LOVE)) engine.removeBuff(LOVE);
  engine.applyBuff(LOVE);
  syncTrayIcons(engine);
  const pc = engine.pc;
  // catalog_buffs.js 719: on_apply is metabolics_add_mood, nothing while dead (inc_metabolics.js 79-86).
  const before = Number(pc.mood) || 0;
  if (metabolicGain('mood').ok) pc.mood = Math.min(moodMax(pc), before + loveMood(moodMax(pc)));
  const gained = Math.round(pc.mood - before);
  if (gained && engine.player) engine.floatText?.(engine.player.x, engine.player.y - 96, `+${gained} mood`, 0xff7eb6);
  engine.refreshPack?.();
}

function baseQuoinLimit(engine) {
  return quoinDailyLimitFor(engine.pc?.imaginationUpgrades || []);
}

function syncQuoinLimit(engine) {
  const state = engine.quoinState;
  if (!state) return;
  if (engine.hasBuff(CRAZY)) {
    const want = crazyQuoinLimit(baseQuoinLimit(engine));
    if (state.dailyLimit < want) state.dailyLimit = want;
  }
}

const EFFECTS = {
  potion_amorous_philtre(engine) {
    applyLove(engine);
    return { ok: true, tag: LOVE };
  },

  potion_elixir_of_avarice(engine) {
    engine.applyBuff(CRAZY);
    syncTrayIcons(engine);
    const state = engine.quoinState;
    if (state) state.dailyLimit = crazyQuoinLimit(baseQuoinLimit(engine));
    engine.refreshPack?.();
    return { ok: true, msg: POTION_TEXT.avariceDone, tag: CRAZY };
  },

  potion_favor(engine) {
    const giant = ensureFavorGiant();
    const check = checkFor('potion_favor', engine);
    if (!check.ok) return { ok: false, msg: check.error };
    today().quaffed.potion_favor = 1;
    engine.playSound?.('DONATION_4TH_TIER', { volume: 0.6 });
    const favor = engine.shrineState?.favor;
    let gained = 0;
    if (favor) {
      const before = Number(favor[giant]) || 0;
      favor[giant] = Math.min(maxFavorFor(engine, giant), before + 111);
      gained = favor[giant] - before;
    }
    return { ok: true, msg: favorMessage(giant, gained), tag: `${giant}:${gained}` };
  },

  potion_keycutter_tonic(engine, { extra }) {
    const from = extra?.key;
    if (!from || countItem(engine.inv, from) < 1) return { ok: false };
    const to = keycutterReplacement(from);
    removeItem(engine.inv, from, 1);
    ensureItem(to, { label: KEY_NAMES[to] });
    addItem(engine.inv, to, 1);
    return { ok: true, msg: keycutterMessage(labelOf(from), labelOf(to)), tag: `${from}>${to}` };
  },

  potion_animal_youth(engine, { target }) {
    if (!target?.sprite || target.sprite.destroyed || !(engine.interactables || []).includes(target)) {
      // onPour returns { ok: 0, error } with no msg.
      return { ok: false };
    }
    const baby = ANIMAL_BABIES[target.classId];
    const x = target.sprite.x;
    const ground = (engine.groundY ?? target.sprite.y) || target.sprite.y;
    const y = target.classId === 'npc_butterfly' ? Math.max(target.sprite.y, ground) : target.sprite.y;
    // replaceWithPoofIfOnGround: the animal goes, its baby lies where it stood.
    const done = typeof target.husbandryVanish === 'function' ? target.husbandryVanish() : null;
    if (typeof done === 'function') done();
    else {
      // A street animal: hidden and out of reach, as a captured Piggy (game.js still walks its sprite).
      target.sprite.visible = false;
      const list = engine.interactables;
      const at = list.indexOf(target);
      if (at >= 0) list.splice(at, 1);
    }
    engine.dropWorldStack?.(baby, 1, x, y - 1);
    poof(engine, x, y - 1, BABY_STACK_H);
    return { ok: true, tag: `${target.classId}>${baby}` };
  },

  potion_avatar_large: (engine) => spawnPhysicsItem(engine, 'avatar_embiggenifier'),
  potion_avatar_small: (engine) => spawnPhysicsItem(engine, 'avatar_smallifier'),
  potion_rainbow_juice: (engine) => spawnPhysicsItem(engine, 'anti_gravitys_rainbow'),
  // Player verbs, multiplayer: onQuaff asks for the secret word (potion_charades.js 541-552); the potion
  // goes once the realtime server takes it (player-verbs-mp-feature). Solo never gets here.
  potion_charades: (engine) => engine.query?.('charadesQuaff', engine) || { ok: false },

  potion_trantsformation_fluid(engine, { target }) {
    if (!target?.state || !(engine.interactables || []).includes(target)) return { ok: false };
    const check = trantsformCheck(target);
    // onPour re-checks size and health with sendActivity and returns false.
    if (!check.ok) return { ok: false, msg: check.error };
    const home = onHomeStreet(engine);
    const out = trantsformOutcome(target.classId, target.state.maturity, { home });
    const x = target.sprite.x;
    const y = target.sprite.y;
    const treeH = Math.min(260, Math.max(60, Number(target.sprite.height) || 0));
    const oldLabel = GROWN_TREE_LABELS[target.classId] || target.label;
    if (target.grownFromBean) {
      const plots = engine.streetSlot('patches')?.plots || {};
      const plot = Object.values(plots).find((row) => row?.tree?.state === target.state);
      if (!plot) return { ok: false };
      trantsformPlotTree(plot, out, now());
    } else {
      const index = streetTreeIndex(engine.streetWorld?.()?.trees, target);
      if (index < 0) return { ok: false };
      const slot = engine.streetSlot(TREE_DEATH);
      slot.replaced ||= {};
      slot.replaced[index] = { classId: target.classId, soilClass: 'patch', at: now(), trantsformed: out.classId };
      engine.unregister(target);
      const entity = patchesFeature.adoptPlot(engine, { key: `tree:${index}`, soilClass: 'patch', x, y: y - 4 });
      if (!entity?.plot) return { ok: false };
      // adoptPlot draws the bare plot first; the new tree takes it over once that is on screen.
      adopting.push({ entity, out, until: now() + 5000 });
    }
    poof(engine, x, y, treeH);
    return { ok: true, msg: trantsformMessage(oldLabel, GROWN_TREE_LABELS[out.classId]), tag: `${target.classId}>${out.classId}` };
  },
};

/** potion_favor.js verbs.shake. */
export function shakeFavor(engine) {
  const button = favorShakeButton(today().shakes);
  if (!button.enabled) {
    engine.toast?.(button.reason, 2600);
    return false;
  }
  const out = shakeFavorGiant(ensureFavorGiant());
  favorGiant = out.giant;
  today().shakes += 1;
  engine.pushActivity?.(out.message);
  last = `potion_favor:shake:${out.giant}`;
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

function tickAdopting(t) {
  if (!adopting.length) return;
  adopting = adopting.filter((row) => {
    if (row.entity.sprite && !row.entity.sprite.destroyed) {
      trantsformPlotTree(row.entity.plot, row.out, t);
      return false;
    }
    if (t > row.until) {
      trantsformPlotTree(row.entity.plot, row.out, t);
      return false;
    }
    return true;
  });
}

/** A dropped stack's height in the street (the baby lies there as a ground stack). */
const BABY_STACK_H = 40;

/**
 * replaceWithPoofIfOnGround (items/item.js 478-488) makes the new stack with
 * createItemStackWithPoof: Tiny Speck's proto_puff poof_in, centred on it
 * (locations/location.js 2054-2071, js/overlay-art.js playPoofIn). `bottom`
 * is the new stack's feet, `itemH` its height.
 */
function poof(engine, x, bottom, itemH = 0) {
  const layer = engine.fxLayer || engine.entityLayer;
  if (!layer) return null;
  return playPoofIn(engine.PIXI, { layer, x, bottom, itemH });
}

/* ------------------------------------------------------------------ */
/* Physics items                                                        */
/* ------------------------------------------------------------------ */

let frameCache = new Map();
function framesFor(engine, name) {
  if (frameCache.has(name)) return frameCache.get(name);
  const art = POTION_ART[name];
  const { PIXI } = engine;
  if (!art || !PIXI?.Rectangle) return [];
  const base = sourceFromUrl(art.url);
  const out = [];
  for (let i = 0; i < art.frames; i += 1) {
    const c = i % art.cols;
    const r = Math.floor(i / art.cols);
    out.push(frameTexture(base, new PIXI.Rectangle(c * art.cellW, r * art.cellH, art.cellW, art.cellH)));
  }
  frameCache.set(name, out);
  return out;
}

function spawnPhysicsItem(engine, classTsid) {
  const p = engine.player;
  if (!p) return { ok: false };
  const def = PHYSICS_ITEMS[classTsid];
  seq += 1;
  const item = { id: `pi${seq}`, classTsid, tsid: engine.streetTsid, x: Math.round(p.x), y: Math.round(p.y), expiresAt: now() + def.lifeSec * 1000 };
  items.push(item);
  drawItem(engine, item);
  // The avatar is standing in it: createItemStackWithPoof does not collide until you move in again.
  touching.add(item.id);
  return { ok: true, tag: classTsid };
}

function drawItem(engine, item) {
  const { PIXI } = engine;
  const art = POTION_ART[item.classTsid];
  if (!PIXI?.AnimatedSprite || !art || views.has(item.id)) return;
  const frames = framesFor(engine, item.classTsid);
  if (!frames.length) return;
  const spr = new PIXI.AnimatedSprite(frames);
  spr.anchor.set(art.anchorX / art.cellW, art.anchorY / art.cellH);
  spr.scale.set(art.scale);
  spr.animationSpeed = 0.5 * (30 / 60);
  spr.zIndex = 35;
  spr.eventMode = 'none';
  spr.x = item.x;
  spr.y = item.y + 4;
  spr.play();
  engine.entityLayer.addChild(spr);
  views.set(item.id, spr);
}

function dropView(id) {
  const spr = views.get(id);
  if (spr && !spr.destroyed) {
    spr.parent?.removeChild(spr);
    spr.destroy();
  }
  views.delete(id);
}

function clearViews() {
  for (const id of [...views.keys()]) dropView(id);
}

function tickPhysicsItems(engine, t) {
  const before = items.length;
  items = items.filter((i) => i.expiresAt > t);
  if (items.length !== before) for (const id of [...views.keys()]) if (!items.some((i) => i.id === id)) dropView(id);
  const p = engine.player;
  if (!p) return;
  for (const item of items) {
    if (item.tsid !== engine.streetTsid) continue;
    const inside = touchesPhysicsItem(item, p.x, p.y);
    if (inside && !touching.has(item.id)) {
      touching.add(item.id);
      const out = touchPhysicsItem(effects, item, t);
      effects = out.effects;
      if (out.sound) engine.playSound?.(out.sound, { volume: 0.7 });
      last = `touch:${item.classTsid}`;
    } else if (!inside) {
      touching.delete(item.id);
    }
  }
}

function applyScale(engine, t) {
  const p = engine.player;
  if (!p) return;
  for (const [id, e] of Object.entries(effects)) if (!(e.until > t)) delete effects[id];
  const { scale } = physicsOf(effects, t);
  if (scale !== 1) {
    if (baseScale == null) baseScale = Math.abs(p.baseScale || 1);
    const want = baseScale * scale;
    if (Math.abs(Math.abs(p.baseScale) - want) > 1e-6) p.baseScale = want;
  } else if (baseScale != null) {
    p.baseScale = baseScale;
    baseScale = null;
  }
}

function endEffects(engine) {
  effects = {};
  touching = new Set();
  if (baseScale != null && engine?.player) engine.player.baseScale = baseScale;
  baseScale = null;
}

/* ------------------------------------------------------------------ */
/* The Rug                                                              */
/* ------------------------------------------------------------------ */

function homeRugs() {
  let s;
  try {
    s = homesFeature._state?.();
  } catch {
    return [];
  }
  if (!s?.scene || s.scene.room !== 'interior' || s.mode === 'decorate') return [];
  return (s.decor?.placed || []).filter((row) => row.classTsid === RUG_MUNCH.classTsid);
}

function dropRugTargets(engine) {
  for (const t of rugTargets) engine.unregister(t);
  rugTargets = [];
}

function syncRugs(engine) {
  const rugs = homeRugs();
  const key = rugs.map((r) => `${r.id}@${Math.round(r.x)},${Math.round(r.y)}`).join(';');
  if (key === syncRugs.key && rugTargets.every((t) => t.sprite && !t.sprite.destroyed)) return;
  syncRugs.key = key;
  dropRugTargets(engine);
  const { PIXI } = engine;
  if (!PIXI?.Sprite) return;
  for (const row of rugs) {
    const { w, h } = furnitureSize(row.classTsid);
    // The Rug is drawn by the house (homes-feature); this is its click box.
    const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
    spr.anchor.set(0.5, 1);
    spr.x = row.x;
    spr.y = row.y;
    spr._worldHitW = w;
    spr._worldHitH = Math.max(h, 40);
    engine.entityLayer.addChild(spr);
    rugTargets.push(engine.register({
      classId: RUG_MUNCH.classTsid,
      featureId: POTIONS_FEATURE_ID,
      label: 'Rug',
      subtitle: '',
      sprite: spr,
      rugId: row.id,
    }));
  }
}
syncRugs.key = '';

export function munchRug(engine) {
  engine.playSound?.(RUG_MUNCH.sound, { volume: 0.7 });
  applyLove(engine);
  for (const row of itemVerbAchievementCounters(RUG_MUNCH.classTsid, RUG_MUNCH.verb)) engine.achievement(row.counter, row.amount);
  say(engine, RUG_MUNCH.message);
  last = 'furniture_rug:munch';
  engine.save?.();
  publish(engine);
  return true;
}

/* ------------------------------------------------------------------ */
/* Feeling Called Love's heart                                          */
/* ------------------------------------------------------------------ */

/**
 * Buff tray icons for buffs whose item_class iconic does not survive (as
 * buff-triggers BUFF_ICONS does): Crazy Quoin Collector (item_class quoin)
 * shows the Elixir of Avarice, Feeling Called Love (none) the Amorous
 * Philtre, Please Wait (npc_bureaucrat) the Bureaucrat's own Cubimal.
 */
const TRAY_ICONS = Object.freeze({ crazy_coin_collector: 'potion_elixir_of_avarice', feeling_called_love: 'potion_amorous_philtre', please_wait: 'npc_cubimal_bureaucrat' });

function syncTrayIcons(engine) {
  for (const [buff, icon] of Object.entries(TRAY_ICONS)) {
    const row = engine.buffRow?.(buff);
    if (row && row.sourceItem !== icon) row.sourceItem = icon;
  }
}

/**
 * Feeling Called Love's indicator (catalog_buffs.js 721
 * announce_add_indicator('feeling_called_love', 'amorous_philtre_heart');
 * players/inc_announcements.js 585-642): a pc_overlay of Tiny Speck's
 * amorous_philtre_heart at 1:1, delta_y -120, duration 0 (until the buff
 * ends and announce_remove_indicator takes it off). The heart rides higher
 * on an embiggened avatar.
 */
export const LOVE_HEART = Object.freeze({ key: 'amorous_philtre_heart', dy: -120 });

function stopHeart() {
  heart?.stop?.();
  heart = null;
}

function syncHeart(engine) {
  const on = engine.hasBuff(LOVE) && engine.player;
  if (!on) {
    if (heart) stopHeart();
    return;
  }
  if (heart || now() < heartRetryAt) return;
  const layer = engine.fxLayer || engine.entityLayer;
  if (!layer) return;
  heart = playSheetOverlay(engine.PIXI, LOVE_HEART.key, {
    layer,
    at: () => {
      const p = engine.player;
      if (!p) return { x: 0, y: 0 };
      const k = Math.abs(p.baseScale || 1) / Math.abs(baseScale || p.baseScale || 1);
      return { x: p.x, y: p.y + LOVE_HEART.dy * k };
    },
    durationMs: Infinity,
    zIndex: 950,
  });
  const mine = heart;
  // Gone without a stop (a street change cleared its layer, or no art): try again shortly.
  heart.done.then(() => {
    if (heart !== mine || mine.stopped) return;
    heart = null;
    heartRetryAt = now() + 500;
  });
}

/* ------------------------------------------------------------------ */
/* QA                                                                   */
/* ------------------------------------------------------------------ */

function setupDemo(engine) {
  if (demoDone || engine.param?.('potiondemo') !== '1') return;
  demoDone = true;
  for (const classTsid of Object.keys(POTIONS)) if (countItem(engine.inv, classTsid) < 1) addItem(engine.inv, classTsid, 1);
  if (countItem(engine.inv, 'door_key_1') < 1) {
    ensureItem('door_key_1', { label: KEY_NAMES.door_key_1 });
    addItem(engine.inv, 'door_key_1', 1);
  }
  engine.removeBuff?.(LOVE);
  engine.removeBuff?.(CRAZY);
  daily = { day: '', quaffed: {}, shakes: 0 };
  engine.setData?.('potionDemo', '1');
  engine.refreshPack?.();
  if (engine.param?.('potionautoplay')) autoplayAt = now() + 1800;
}

async function runAutoplay(engine) {
  const mode = engine.param?.('potionautoplay');
  if (!mode) return;
  if (mode === 'rug') {
    // Waits for a Rug outside Decorate mode (homedemo=decorate opens it; close the bar).
    syncRugs(engine);
    const rug = rugTargets[0];
    if (!rug) {
      autoplayAt = now() + 1000;
      return;
    }
    if (engine.player) {
      engine.player.x = rug.sprite.x + 40;
      engine.player.vx = 0;
    }
    munchRug(engine);
    return;
  }
  if (mode === 'potion_keycutter_tonic') {
    usePotionNow(engine, mode, { key: keyChoices(engine.inv)[0] });
    return;
  }
  if (mode === 'potion_animal_youth' || mode === 'potion_trantsformation_fluid') {
    // Stand beside the closest target first.
    const want = mode === 'potion_animal_youth' ? (t) => Boolean(ANIMAL_BABIES[t.classId]) : (t) => !t.featureId && t.state && isTrantsformable(t, { home: onHomeStreet(engine) }) && (t.state.maturity >= 4) && (t.state.health >= 4);
    const list = live(engine, want).sort((a, b) => Math.abs(a.sprite.x - engine.player.x) - Math.abs(b.sprite.x - engine.player.x));
    if (list[0] && engine.player) {
      engine.player.x = list[0].sprite.x - 60;
      engine.player.vx = 0;
      engine.snapCamera?.();
    }
  }
  usePotionNow(engine, mode);
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

export const potionsFeature = {
  id: POTIONS_FEATURE_ID,

  onStreetEnter(street, engine) {
    setupDemo(engine);
    for (const item of items) if (item.tsid === engine.streetTsid) drawItem(engine, item);
    syncRugs.key = '';
    syncRugs(engine);
    syncQuoinLimit(engine);
    publish(engine);
  },

  onStreetClear(engine) {
    // is_permanent 0: the physics end with the street; effects scheduled here do not follow you.
    if (pending) {
      stopFx();
      pending = null;
    }
    clearViews();
    endEffects(engine);
    // A tree handed over as you left: the plot is saved; it grows on your next visit.
    for (const row of adopting) trantsformPlotTree(row.entity.plot, row.out, now());
    adopting = [];
    rugTargets = [];
    syncRugs.key = '';
    stopHeart();
  },

  onTick(dtMs, t, engine) {
    if (pending) {
      pending.fx?.follow?.();
      if (t >= pending.at) complete(engine);
    }
    tickAdopting(t);
    tickPhysicsItems(engine, t);
    applyScale(engine, t);
    syncHeart(engine);
    syncTrayIcons(engine);
    if (t - lastRugSync >= RUG_SYNC_MS) {
      lastRugSync = t;
      syncRugs(engine);
      syncQuoinLimit(engine);
      publish(engine);
    }
    if (autoplayAt && t >= autoplayAt && !engine.acting?.()) {
      autoplayAt = 0;
      runAutoplay(engine);
    }
  },

  physics(engine) {
    const { gravity } = physicsOf(effects, now());
    if (gravity === 1) return { speed: 1, jump: 1, gravity: 1 };
    // vy_max 1.0: the normal terminal speed caps the rise.
    return { speed: 1, jump: 1, gravity, vyMax: 1 };
  },

  onNewDay(t, engine) {
    // player.js:997-1001: the new day's limit, and Crazy Quoin Collector ends.
    if (engine.hasBuff(CRAZY)) engine.removeBuff(CRAZY);
    daily = { day: getGameDayKey(t), quaffed: {}, shakes: 0 };
  },

  packVerbs(classTsid, engine) {
    if (!POTIONS[classTsid] || countItem(engine.inv, classTsid) < 1) return [];
    const out = [buttonFor(classTsid, engine)];
    if (classTsid === 'potion_favor') out.push(favorShakeButton(today().shakes));
    return out;
  },

  runPackVerb(classTsid, verbId, engine) {
    const def = POTIONS[classTsid];
    if (classTsid === 'potion_favor' && verbId === 'shake') {
      shakeFavor(engine);
      return true;
    }
    if (!def || def.verb !== verbId) return false;
    if (classTsid === 'potion_keycutter_tonic') {
      const keys = keyChoices(engine.inv);
      const button = buttonFor(classTsid, engine);
      if (!button.enabled || pending) {
        if (!button.enabled) engine.toast?.(button.reason, 2600);
        return true;
      }
      // valid_items: the client asks which key.
      questRoomConverse(engine, {
        title: def.name,
        kicker: 'Quaff',
        text: def.tooltip,
        choices: [...keys.map((k) => ({ label: labelOf(k), value: k })), { label: 'Cancel', value: 'cancel' }],
      }).then((key) => {
        if (key && key !== 'cancel' && key !== 'ok') usePotionNow(engine, classTsid, { key });
      });
      return true;
    }
    usePotionNow(engine, classTsid);
    return true;
  },

  verbsFor(target) {
    if (target?.classId !== RUG_MUNCH.classTsid) return null;
    return [{ id: RUG_MUNCH.verb, label: RUG_MUNCH.label, sort: 10, enabled: true, reason: '', energy: 0, durationMs: 0, tooltip: '' }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== RUG_MUNCH.classTsid || verbId !== RUG_MUNCH.verb) return false;
    return munchRug(engine);
  },

  save() {
    return { version: 1, uses: { ...uses }, favorGiant, daily: { ...daily, quaffed: { ...daily.quaffed } }, items: items.map((i) => ({ ...i })), seq };
  },

  restore(slice) {
    uses = {};
    for (const [k, v] of Object.entries(slice?.uses || {})) {
      const n = Math.floor(Number(v));
      if (POTIONS[k] && n > 0 && n < POTIONS[k].capacity) uses[k] = n;
    }
    favorGiant = typeof slice?.favorGiant === 'string' ? slice.favorGiant : '';
    const d = slice?.daily || {};
    daily = { day: String(d.day || ''), quaffed: { ...(d.quaffed || {}) }, shakes: Math.max(0, Math.floor(Number(d.shakes) || 0)) };
    const t = now();
    items = (Array.isArray(slice?.items) ? slice.items : [])
      .filter((i) => PHYSICS_ITEMS[i?.classTsid] && Number(i.expiresAt) > t && typeof i.tsid === 'string')
      .map((i) => ({ id: String(i.id), classTsid: i.classTsid, tsid: i.tsid, x: Number(i.x) || 0, y: Number(i.y) || 0, expiresAt: Number(i.expiresAt) }));
    seq = Math.max(0, Math.floor(Number(slice?.seq) || 0));
    pending = null;
    effects = {};
    touching = new Set();
  },

  /** Tests. */
  _state() {
    return { uses: { ...uses }, favorGiant, daily, items: items.map((i) => ({ ...i })), effects: { ...effects }, pending: pending ? pending.classTsid : null, last, rugs: rugTargets.length };
  },
  _complete(engine) {
    if (pending) complete(engine);
  },
  _reset() {
    uses = {};
    favorGiant = '';
    daily = { day: '', quaffed: {}, shakes: 0 };
    items = [];
    seq = 0;
    effects = {};
    touching = new Set();
    baseScale = null;
    pending = null;
    adopting = [];
    last = '';
    demoDone = false;
    autoplayAt = 0;
    rugTargets = [];
    syncRugs.key = '';
    views.clear();
    frameCache = new Map();
    stopHeart();
  },
};
