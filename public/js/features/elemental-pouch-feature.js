/**
 * The Elemental Pouch (js/elemental-pouch.js) as a feature module (G83).
 *
 *  - Registers bag_elemental_pouch as a pack item with its source copy. The
 *    Hardware, Alchemical Goods, Tool and Mining Vendors stock it
 *    (store-catalog.js), and buying one completes "Get Elemental!"
 *    (quests/elementhandling_buy_elemental_pouch.js), which the Magic Rock
 *    offers once you know Element Handling and which pays 100 Red, Green and
 *    Blue Elements.
 *  - Pack verbs: Shake (once a game day, with Elemental Shake or Super
 *    Elemental Shake). Rename is every bag's (features/bags-feature.js,
 *    js/bag-names.js), so each pouch has its own name; a save from when one
 *    name covered every pouch gives that name to the first pouch, once.
 *  - A pouch lying on the street can only be picked up with Element Handling
 *    (canPickup), through the decorateVerbs hook on the dropped stack's menu.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&pouchdemo=1 puts a
 *     pouch and 100 of each element in the pack (&pouchelements=N);
 *     &pouchcard=1|2 owns Elemental Shake (2 adds Super Elemental Shake);
 *     &pouchroll=0..1 fixes choose_one (0 = smallest delta, 0.99 = largest).
 *     pouchdemo=full fills each element to 5000 (too full); pouchdemo=ground
 *     drops a pouch at your feet (&pouchnoskill=1 treats you as not knowing
 *     Element Handling); pouchdemo=buy accepts "Get Elemental!" and opens the
 *     Alchemical Goods Vendor with no pouch in the pack.
 *     &pouchautoplay=shake shakes, then tries again (already shook today);
 *     =rename names the first pouch &pouchname=Sparkles. Canvas: pouchCount,
 *     pouchContents, pouchShake, pouchShakeDay, pouchLast, pouchMade,
 *     pouchDeltas, pouchName, pouchCards, pouchPickup, pouchAutoplay.
 */

import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=b0e33301';
import { getGameDayKey } from '../game-day.js?v=edb00566';
import { acceptOffer, ensureQuestOfferState } from '../quest-offers.js?v=3c7925ca';
import { VENDOR_PROFILES } from '../vendor.js?v=998821e3';
import {
  ELEMENT_STACKMAX,
  POUCH_CLASS,
  POUCH_ELEMENTS,
  POUCH_ITEM,
  SHAKE_CARD_1,
  SHAKE_CARD_2,
  SHAKE_COPY,
  createPouchState,
  pouchContents,
  pouchPickupCheck,
  shakeCheck,
  shakePouch,
} from '../elemental-pouch.js?v=42528ad0';

export const POUCH_FEATURE_ID = 'elemental-pouch';
const POUCH_QUEST = 'elementhandling_buy_elemental_pouch';

let state = createPouchState();
let last = '';
let lastMade = '';
let lastDeltas = '';
let demoDone = false;
let autoplayAt = 0;
let autoplayStep = 0;
let publishAt = 0;

const dayKey = () => getGameDayKey(Date.now());
const upgrades = (engine) => engine.pc?.imaginationUpgrades || [];

function learned(engine) {
  if (engine.param?.('pouchnoskill')) return [];
  return engine.learnedSkills || [];
}

function rngFor(engine) {
  const raw = engine.param?.('pouchroll');
  if (raw === null || raw === undefined || raw === '') return Math.random;
  const value = Number(raw);
  return Number.isFinite(value) ? () => value : Math.random;
}

function registerItem() {
  ensureItem(POUCH_CLASS, { ...POUCH_ITEM });
}

/** The first pouch's shown name (its own, else the class label). */
function firstPouchLabel(engine) {
  return engine.query?.('packFirstBag', POUCH_CLASS, engine)?.label || POUCH_ITEM.label;
}

/** A save from when one name covered every pouch: that name goes to the first pouch, once. */
function migrateName(engine) {
  if (!state.name || !engine?.started || countItem(engine.inv, POUCH_CLASS) < 1) return;
  if (!engine.query?.('packRenameFirst', POUCH_CLASS, state.name, engine)) return;
  state.name = '';
  engine.save?.();
}

function shakeState(engine) {
  const check = shakeCheck(state, engine.inv, upgrades(engine), dayKey());
  if (!check) return 'hidden';
  return check.ok ? 'enabled' : `disabled:${check.msg}`;
}

function publish(engine) {
  if (!engine?.setData) return;
  const inv = engine.inv || {};
  engine.setData('pouchCount', String(countItem(inv, POUCH_CLASS)));
  engine.setData('pouchContents', POUCH_ELEMENTS.map((el) => `${el.classTsid.slice(8)}:${countItem(inv, el.classTsid)}`).join(','));
  engine.setData('pouchShake', shakeState(engine));
  engine.setData('pouchShakeDay', state.shakeDay || 'none');
  engine.setData('pouchShakes', String(state.shakes));
  engine.setData('pouchLast', last || 'none');
  engine.setData('pouchMade', lastMade || 'none');
  engine.setData('pouchDeltas', lastDeltas || 'none');
  engine.setData('pouchName', firstPouchLabel(engine));
  engine.setData('pouchCards', [SHAKE_CARD_1, SHAKE_CARD_2].filter((id) => upgrades(engine).includes(id)).join(',') || 'none');
  engine.setData('pouchPickup', pouchPickupCheck(learned(engine)).ok ? 'ok' : 'blocked');
}

function say(engine, msg, ok = true) {
  last = String(msg || '').trim();
  engine.pushActivity?.(last);
  engine.toast?.(last, ok ? 3200 : 2600);
  engine.refreshPack?.();
  publish(engine);
}

/* ------------------------------------------------------------ verbs */

function runShake(engine) {
  const out = shakePouch(state, engine.inv, upgrades(engine), dayKey(), { rng: rngFor(engine) });
  if (out.hidden) return false;
  if (!out.ok) {
    say(engine, out.msg, false);
    return true;
  }
  lastMade = POUCH_ELEMENTS.map((el) => `${el.classTsid.slice(8)}:${out.made[el.classTsid] || 0}`).join(',');
  lastDeltas = POUCH_ELEMENTS.map((el) => `${el.classTsid.slice(8)}:${out.deltas[el.classTsid]}`).join(',');
  say(engine, out.msg, !out.full);
  engine.save?.();
  return true;
}

/* ------------------------------------------------------------ QA */

function demoSetup(engine) {
  const demo = engine.param?.('pouchdemo');
  if (demoDone || !demo) return;
  demoDone = true;
  const inv = engine.inv;
  const pc = engine.pc;
  if (!Array.isArray(pc.imaginationUpgrades)) pc.imaginationUpgrades = [];
  const card = engine.param('pouchcard');
  if (card === '1' || card === '2') {
    if (!pc.imaginationUpgrades.includes(SHAKE_CARD_1)) pc.imaginationUpgrades.push(SHAKE_CARD_1);
    if (card === '2' && !pc.imaginationUpgrades.includes(SHAKE_CARD_2)) pc.imaginationUpgrades.push(SHAKE_CARD_2);
  }
  if (demo === 'buy') {
    removeItem(inv, POUCH_CLASS, countItem(inv, POUCH_CLASS));
    pc.currants = Math.max(Number(pc.currants) || 0, 500);
    const qs = engine.questState;
    if (qs && !(qs.completed || []).includes(POUCH_QUEST) && !qs.active?.[POUCH_QUEST]) {
      ensureQuestOfferState(qs);
      acceptOffer(qs, POUCH_QUEST, { pc, inv, skills: engine.learnedSkills, countItem });
    }
    engine.updateHud?.();
    engine.openShop?.(VENDOR_PROFILES.alchemical);
    publish(engine);
    return;
  }
  if (demo === 'ground') {
    removeItem(inv, POUCH_CLASS, countItem(inv, POUCH_CLASS));
    const p = engine.player;
    engine.dropWorldStack?.(POUCH_CLASS, 1, (p?.x || 400) + 60, p?.y || 600);
    engine.updateHud?.();
    publish(engine);
    return;
  }
  if (countItem(inv, POUCH_CLASS) < 1) addItem(inv, POUCH_CLASS, 1);
  const fill = demo === 'full' ? ELEMENT_STACKMAX : Math.max(0, Math.floor(Number(engine.param('pouchelements') ?? 100) || 0));
  for (const el of POUCH_ELEMENTS) {
    const have = countItem(inv, el.classTsid);
    if (have < fill) addItem(inv, el.classTsid, fill - have);
    else if (have > fill) removeItem(inv, el.classTsid, have - fill);
  }
  if (engine.param('pouchname')) engine.query?.('packRenameFirst', POUCH_CLASS, engine.param('pouchname'), engine);
  engine.updateHud?.();
  if (engine.param('pouchautoplay')) autoplayAt = Date.now() + 1500;
  publish(engine);
}

function autoplay(engine) {
  const mode = engine.param('pouchautoplay');
  autoplayAt = 0;
  if (mode === 'rename') {
    engine.query?.('packRenameFirst', POUCH_CLASS, engine.param('pouchname') || 'Sparkles', engine);
    publish(engine);
    engine.setData('pouchAutoplay', 'done');
    return;
  }
  if (mode !== 'shake') return;
  pouchFeature.runPackVerb(POUCH_CLASS, 'shake', engine);
  autoplayStep += 1;
  engine.setData('pouchAutoplay', autoplayStep === 1 ? `shook:${last}` : `again:${last}`);
  if (autoplayStep < 2) autoplayAt = Date.now() + 1500;
  else engine.setData('pouchAutoplay', `done:${last}`);
}

/* ------------------------------------------------------------ feature */

export const pouchFeature = {
  id: POUCH_FEATURE_ID,

  init(engine) {
    registerItem();
    publish(engine);
  },

  onStreetEnter(street, engine) {
    demoSetup(engine);
    publish(engine);
  },

  onNewDay(now, engine) {
    // doNewDay clears the daily counters; the day key comparison already
    // treats an old shakeDay as unused, so this only refreshes the readout.
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    migrateName(engine);
    if (autoplayAt && now >= autoplayAt) autoplay(engine);
    // Keep the canvas readout current after purchases and quest rewards (QA only).
    if (now >= publishAt && demoDone) {
      publishAt = now + 1000;
      publish(engine);
    }
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== POUCH_CLASS) return [];
    const rows = [];
    // sort_on: shake 50 (rename 67 is the bags feature's).
    const check = shakeCheck(state, engine.inv, upgrades(engine), dayKey());
    if (check) {
      rows.push({ id: 'shake', label: 'Shake', enabled: check.ok, reason: check.msg, tooltip: SHAKE_COPY.tooltip, primary: true });
    }
    return rows;
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== POUCH_CLASS) return false;
    if (countItem(engine.inv, POUCH_CLASS) < 1) return false;
    if (verbId === 'shake') return runShake(engine);
    return false;
  },

  /** canPickup: the dropped pouch's pick up needs Element Handling. */
  decorateVerbs(target, verbs, engine) {
    if (target?.classId !== 'dropped_item' || target.state?.classTsid !== POUCH_CLASS) return null;
    const gate = pouchPickupCheck(learned(engine));
    publish(engine);
    if (gate.ok) return null;
    return verbs.map((v) => (v.id === 'pickup' ? { ...v, enabled: false, reason: gate.msg } : v));
  },

  save() {
    return { ...state };
  },

  restore(slice) {
    state = createPouchState(slice || {});
    registerItem();
  },

  /** QA / tests. */
  _state() {
    return state;
  },
  _reset() {
    state = createPouchState();
    last = '';
    lastMade = '';
    lastDeltas = '';
    demoDone = false;
    autoplayAt = 0;
    autoplayStep = 0;
    publishAt = 0;
    registerItem();
  },
};

