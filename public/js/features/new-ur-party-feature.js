/**
 * Happy New Ur's party pieces in the world (register G1195; the rules and what Glitch did are in
 * js/new-ur-party.js; the countdown and the six midnights are js/new-ur.js and new-ur-feature.js).
 *
 *  - The keepsake and the badge: at a midnight you see (new-ur-feature's collect('newUrMidnight')),
 *    a Midnight Sparkly once a year and a count toward Rang In the New Ur. Online only the server's
 *    word counts (new_ur.go marks each midnight "seen" for the sockets connected then, and lists the
 *    eve's seen midnights on new_ur_sync); solo the page's own clock.
 *  - Confetti Popper (Pop, from the pack): the bang (GLITCHMAS_CRACKER, the Glitchmas Cracker's), a
 *    burst of confetti in the popper's colour, and everyone near jumps (surprise). Online the server
 *    sends the burst to the whole street (new_ur_pop / new_ur_popped).
 *  - Bubbly (Drink, or Toast from the pack): Toast drinks it with the players near you; each of you
 *    gets mood and plays happy (new_ur_toast / new_ur_toasted). Solo it toasts the street companions
 *    when they are out (?companions=1); else it says to just Drink it.
 *  - The two seasonal recipes go into the Make lists (making.js recipe.season holds them to the
 *    season).
 *  - Sparkly Batterflies: from the big midnight to the end of January 1 (js/new-ur.js
 *    sparklyBatterflies), every Batterfly glints gold.
 *  - Party hats on street Chickens, December 31 and January 1 (js/new-ur.js hatsOn): pot-luck-feature
 *    puts the costume on through the chickenCostume query answered here.
 *
 * QA: ?autostart=1&questoffer=off&seasondate=2026-12-27&newurpartydemo=1 stocks the pack (poppers,
 * Bubbly, the makings, a Tinkertool and a Cocktail Shaker and their skills); ?seasondate=2026-12-31
 * &newurmidnight=4&newurlead=15 gives the keepsake at the show; ?seasondate=2027-01-01 shows the
 * Batterflies (streetdemo=GA9114MS8B32FB2, Churni Sanctum). window.groddleNewUrParty: state(), pop(cls),
 * toast(). Canvas: newUrKeepsakes (years), newUrPops, newUrToasts, newUrBursts, newUrBatterflies
 * (sparkling count), newUrHats (on|off), newUrPartyLast.
 */

import { addItem, countItem, ensureItem, registerItemUse, removeItem } from '../inventory.js?v=6414dbdc';
import { RECIPE_CATALOG, isRecipeCatalogReady, setRecipeCatalog } from '../making.js?v=6cfac327';
import { gainMetabolic } from '../metabolics.js?v=48f784bf';
import { exposeQA } from '../qa-gate.js?v=f4e2cd82';
import { parseSeasonDate, urDate } from '../seasons.js?v=5d8f545a';
import { hatsOn, sparklyBatterflies } from '../new-ur.js?v=96c11429';
import {
  BUBBLY,
  BUBBLY_DRINK,
  KEEPSAKE,
  MIDNIGHT_COUNTER,
  NEW_UR_ITEMS,
  NEW_UR_PARTY,
  NEW_UR_PARTY_TEXT,
  NEW_UR_RECIPES,
  POPPERS,
  bitAt,
  burstBits,
  createPartyState,
  isPopper,
  keepsakeDue,
  popperColour,
} from '../new-ur-party.js?v=05952cd9';

export const NEW_UR_PARTY_FEATURE_ID = 'new-ur-party';
/** The costume pot-luck-feature puts on a street Chicken for us (js/pot-luck.js costumeFrame). */
export const PARTY_HAT = 'party_hat';

let state = createPartyState();
let engineRef = null;
let client = null;
let recipesAdded = false;
let demoDone = false;
let toastAsked = false;
let last = '';
let lastSig = '';
let bursts = []; // { layer, bits: [{ g, bit }], at, x, y }
let glints = []; // { g, born, life, vx, vy }
let glintAt = 0;
let sparkling = 0;
let hats = false;

const online = (engine) => engine?.mode === 'multiplayer' && client?.state === 'online';
const seasonOff = (engine) => ['none', 'off'].includes(String(engine?.param?.('season') || '').trim().toLowerCase());

/** The clock the party runs on: ?seasondate= noon Pacific (QA), else the New Ur clock (server, QA or local). */
function partyNow(engine) {
  const qa = engine?.param?.('newurmidnight') ? null : parseSeasonDate(engine?.param?.('seasondate'));
  if (qa) return qa;
  const c = engine?.query?.('newUrClock', engine);
  return Number.isFinite(c) ? c : Date.now();
}

function say(engine, msg, ok = true) {
  last = String(msg || '');
  engine.pushActivity?.(last);
  engine.toast?.(last, ok ? 3200 : 2600);
}

function emote(engine, kind) {
  if (engine.query?.('emote', kind, engine) !== true) engine.playEmotion?.(kind);
}

function gain(engine, stat, n) {
  const pc = engine.pc;
  if (!pc || !(n > 0)) return 0;
  return Math.round(gainMetabolic(pc, stat, n));
}

/* --------------------------------------------------------------- keepsake */

/** The year an eve belongs to, from one of its midnights (ms): December 31 on Ur's clock. */
const eveYear = (at) => urDate(Number(at)).y;

function grantKeepsake(engine, year, { server = false } = {}) {
  const due = keepsakeDue(state, { year, online: engine?.mode === 'multiplayer', server });
  if (due.grant) {
    addItem(engine.inv, KEEPSAKE, 1);
    say(engine, NEW_UR_PARTY_TEXT.keepsake(year));
    engine.playSound?.('DISCOVER_USEFUL_NEW_ITEM', { volume: 0.5 });
    engine.refreshPack?.();
  }
  if (due.badge) engine.achievement?.(MIDNIGHT_COUNTER, 1);
  if (due.grant || due.badge) engine.save?.();
  publish(engine);
  return due;
}

/* ----------------------------------------------------------------- bursts */

/** The confetti burst at (x, y) in world px, in a popper's colour. */
function burst(engine, x, y, colour) {
  const PIXI = engine?.PIXI;
  const fx = engine?.fxLayer;
  if (!PIXI?.Container || !fx) return;
  const layer = new PIXI.Container();
  layer.label = 'new-ur-popper';
  layer.eventMode = 'none';
  layer.x = x;
  layer.y = y;
  const bits = burstBits(colour).map((bit) => {
    const g = new PIXI.Graphics();
    g.rect(-bit.w / 2, -bit.h / 2, bit.w, bit.h).fill(bit.colour);
    layer.addChild(g);
    return { g, bit };
  });
  fx.addChild(layer);
  bursts.push({ layer, bits, at: performance.now() });
}

function tickBursts() {
  const now = performance.now();
  bursts = bursts.filter((b) => {
    const t = (now - b.at) / 1000;
    if (b.layer.destroyed || t * 1000 > NEW_UR_PARTY.burstMs) {
      if (!b.layer.destroyed) b.layer.destroy({ children: true });
      return false;
    }
    const fade = Math.min(1, Math.max(0, (NEW_UR_PARTY.burstMs / 1000 - t) / 0.6));
    for (const { g, bit } of b.bits) {
      const p = bitAt(bit, t);
      g.x = p.x;
      g.y = p.y;
      g.rotation = bit.spin * t;
      g.alpha = fade;
    }
    return true;
  });
}

function clearBursts() {
  for (const b of bursts) if (!b.layer.destroyed) b.layer.destroy({ children: true });
  bursts = [];
  for (const s of glints) if (!s.g.destroyed) s.g.destroy();
  glints = [];
}

/** Where your own Glitch's bang goes off: a little above its feet, at the popper in hand. */
const handAt = (engine) => ({ x: Number(engine.player?.x) || 0, y: (Number(engine.player?.y) || 0) - 40 });

/* -------------------------------------------------------------------- pop */

function pop(engine, cls) {
  if (!isPopper(cls) || countItem(engine.inv, cls) < 1) return false;
  const colour = popperColour(cls);
  removeItem(engine.inv, cls, 1);
  const at = handAt(engine);
  burst(engine, at.x, at.y, colour);
  engine.playSound?.('GLITCHMAS_CRACKER', { volume: 0.7 });
  emote(engine, 'surprise');
  state.popped += 1;
  engine.achievement?.('new_ur:popped', 1);
  say(engine, NEW_UR_PARTY_TEXT.popped);
  if (online(engine)) client.send('new_ur_pop', { c: colour });
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

function onPopped(engine, m) {
  const id = Number(m?.id) || 0;
  if (!id || engine.query?.('realtimeHidden', id)) return;
  const r = globalThis.groddleRealtime?.remotes?.get?.(id)?.root;
  const x = r && !r.destroyed ? r.x : Number(m.x) || 0;
  const y = (r && !r.destroyed ? r.y : Number(m.y) || 0) - 40;
  burst(engine, x, y, CONFETTI_OK.has(m.c) ? m.c : 'mix');
  if (m.near) {
    engine.playSound?.('GLITCHMAS_CRACKER', { volume: 0.55 });
    emote(engine, 'surprise');
    last = NEW_UR_PARTY_TEXT.poppedBy(String(m.name || 'Someone'));
    engine.pushActivity?.(last);
  }
  publish(engine);
}
const CONFETTI_OK = new Set(['mix', 'red', 'green', 'blue', 'shiny']);

/* ------------------------------------------------------------------ toast */

/** Solo: the street companions out with you (game.js whoIsHere lists you first). */
const companions = (engine) => (engine.whoIsHere?.() || []).slice(1).filter(Boolean);

function drinkToast(engine, names) {
  if (countItem(engine.inv, BUBBLY) < 1) return false;
  removeItem(engine.inv, BUBBLY, 1);
  gain(engine, 'energy', BUBBLY_DRINK.energy);
  gain(engine, 'mood', BUBBLY_DRINK.mood + NEW_UR_PARTY.toastMood);
  engine.playSound?.('ITEM_DRINK', { volume: 0.6 });
  emote(engine, 'happy');
  state.toasts += 1;
  engine.achievement?.('new_ur:toasted', 1);
  say(engine, NEW_UR_PARTY_TEXT.toasted(names));
  engine.updateHud?.();
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

function toast(engine) {
  if (countItem(engine.inv, BUBBLY) < 1) return false;
  if (online(engine)) {
    if (toastAsked) return false;
    toastAsked = true;
    client.send('new_ur_toast', {});
    return true;
  }
  const names = companions(engine);
  if (!names.length) {
    say(engine, NEW_UR_PARTY_TEXT.toastAlone, false);
    return false;
  }
  return drinkToast(engine, names);
}

function onToast(engine, m) {
  toastAsked = false;
  if (!m?.ok) {
    say(engine, m?.why === 'slow' ? NEW_UR_PARTY_TEXT.toastSlow : NEW_UR_PARTY_TEXT.toastAlone, false);
    return;
  }
  drinkToast(engine, Array.isArray(m.with) ? m.with : []);
}

function onToasted(engine, m) {
  const from = m?.from || {};
  if (engine.query?.('realtimeHidden', Number(from.id))) return;
  gain(engine, 'mood', NEW_UR_PARTY.toastMood);
  emote(engine, 'happy');
  say(engine, NEW_UR_PARTY_TEXT.toastedBy(String(from.name || 'Someone')));
  engine.updateHud?.();
  engine.save?.();
}

/* ----------------------------------------------------------------- online */

function watch(engine) {
  if (client || engine?.mode !== 'multiplayer') return;
  const c = engine.query?.('realtimeClient');
  if (!c?.on) return;
  client = c;
  c.on('msg:new_ur', (m) => {
    // The server's word that this character was connected at a midnight: the keepsake's check.
    if (m?.ev === 'midnight' && m.seen === true) grantKeepsake(engine, eveYear(m.at), { server: true });
    else if (Array.isArray(m?.seen) && m.seen.length && Array.isArray(m.midnights) && m.midnights.length) grantKeepsake(engine, eveYear(m.midnights[0]), { server: true });
  });
  c.on('msg:new_ur_popped', (m) => onPopped(engine, m));
  c.on('msg:new_ur_pop', (m) => {
    if (m?.ok === false && m.why === 'slow') last = 'pop:slow';
  });
  c.on('msg:new_ur_toast', (m) => onToast(engine, m));
  c.on('msg:new_ur_toasted', (m) => onToasted(engine, m));
  c.on('state', ({ state: s } = {}) => {
    if (s !== 'online') toastAsked = false;
  });
}

/* ---------------------------------------------------------- the batterflies */

const isBatterfly = (t) => t?.classId === 'npc_batterfly' && t.sprite && !t.sprite.destroyed;
const GLINT = [0xfff3b0, 0xffd84a, 0xffffff];

function tickBatterflies(engine, on) {
  const PIXI = engine.PIXI;
  const fx = engine.fxLayer;
  const list = on ? (engine.interactables || []).filter(isBatterfly) : [];
  sparkling = list.length;
  for (const t of engine.interactables || []) {
    if (t?.classId !== 'npc_batterfly' || !t.sprite || t.sprite.destroyed) continue;
    const want = on ? 0xffe7a3 : 0xffffff;
    if (t.sprite.tint !== want && (on || t.sprite.newUrTinted)) {
      t.sprite.tint = want;
      t.sprite.newUrTinted = on;
    }
  }
  const now = performance.now();
  if (on && PIXI?.Graphics && fx && now >= glintAt) {
    glintAt = now + 140;
    for (const t of list) {
      // Around the Batterfly as drawn (its bounds in the fx layer's space), whatever its anchor.
      const gb = t.sprite.getBounds?.();
      const p0 = gb && fx.toLocal ? fx.toLocal({ x: gb.x, y: gb.y }) : { x: t.sprite.x - 20, y: t.sprite.y - 40 };
      const p1 = gb && fx.toLocal ? fx.toLocal({ x: gb.x + gb.width, y: gb.y + gb.height }) : { x: t.sprite.x + 20, y: t.sprite.y };
      const g = new PIXI.Graphics();
      const r = 2 + Math.random() * 2.5;
      // A four-point glint (ours: the Sparkle Powder's stars, drawn small).
      g.poly([0, -r * 2, r * 0.45, -r * 0.45, r * 2, 0, r * 0.45, r * 0.45, 0, r * 2, -r * 0.45, r * 0.45, -r * 2, 0, -r * 0.45, -r * 0.45]).fill(GLINT[Math.floor(Math.random() * GLINT.length)]);
      g.blendMode = 'add';
      g.x = p0.x + Math.random() * (p1.x - p0.x);
      g.y = p0.y + Math.random() * (p1.y - p0.y);
      g.eventMode = 'none';
      fx.addChild(g);
      glints.push({ g, born: now, life: 700 + Math.random() * 500, vy: -0.01 - Math.random() * 0.02 });
    }
  }
  glints = glints.filter((s) => {
    const age = now - s.born;
    if (s.g.destroyed || age > s.life) {
      if (!s.g.destroyed) s.g.destroy();
      return false;
    }
    const k = age / s.life;
    s.g.alpha = Math.sin(Math.PI * k);
    s.g.scale.set(0.6 + 0.6 * Math.sin(Math.PI * k));
    s.g.y += s.vy * 16;
    return true;
  });
}

/* ------------------------------------------------------------------- items */

function addRecipes() {
  if (recipesAdded || !isRecipeCatalogReady()) return;
  recipesAdded = true;
  const add = {};
  for (const [out, r] of Object.entries(NEW_UR_RECIPES)) {
    if (RECIPE_CATALOG[out]) continue;
    add[out] = { ...r, inputs: r.inputs.map((i) => ({ ...i })), outputs: r.outputs.map((o) => ({ ...o })), skills: [...r.skills], achievements: [] };
  }
  if (Object.keys(add).length) setRecipeCatalog({ ...RECIPE_CATALOG, ...add });
}

/** ?newurpartydemo=1: a kit for the poppers, the Bubbly and their recipes. */
const DEMO_KIT = Object.freeze([['confetti_popper', 3], ['confetti_popper_red', 1], ['confetti_popper_shiny', 1], ['bubbly', 3], ['paper', 4], ['sparkly', 4], ['element_red', 50],
  ['bunch_of_grapes', 3], ['tiny_bubble', 3], ['tinkertool', 1], ['cocktail_shaker', 1]]);

function demo(engine) {
  if (demoDone || !engine.param?.('newurpartydemo')) return;
  demoDone = true;
  for (const [cls, n] of DEMO_KIT) if (countItem(engine.inv, cls) < n) addItem(engine.inv, cls, n - countItem(engine.inv, cls));
  for (const id of ['tinkering_1', 'cocktailcrafting_1']) if (!(engine.learnedSkills || []).includes(id)) engine.grantSkill?.(id);
  engine.refreshPack?.();
}

/* ----------------------------------------------------------------- publish */

function publish(engine) {
  if (!engine?.setData) return;
  const sig = `${state.keepsakes.join(',')}|${state.popped}|${state.toasts}|${bursts.length}|${sparkling}|${hats}|${last}`;
  if (sig === lastSig) return;
  lastSig = sig;
  engine.setData('newUrKeepsakes', state.keepsakes.join(',') || 'none');
  engine.setData('newUrPops', String(state.popped));
  engine.setData('newUrToasts', String(state.toasts));
  engine.setData('newUrBursts', String(bursts.length));
  engine.setData('newUrBatterflies', String(sparkling));
  engine.setData('newUrHats', hats ? 'on' : 'off');
  engine.setData('newUrPartyLast', last || 'none');
}

/* ----------------------------------------------------------------- feature */

export const newUrPartyFeature = {
  id: NEW_UR_PARTY_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    for (const [id, meta] of Object.entries(NEW_UR_ITEMS)) ensureItem(id, { ...meta, tags: [...meta.tags] });
    registerItemUse(BUBBLY, { ...BUBBLY_DRINK, source: 'ours (G1195): include/drink.js drink_mood / drink_energy, a Slow Gin Fizz halved' }, { label: NEW_UR_ITEMS[BUBBLY].label });
    exposeQA('groddleNewUrParty', {
      state: () => ({ ...createPartyState(state), bursts: bursts.length, sparkling, hats, last, now: partyNow(engine) }),
      pop: (cls = 'confetti_popper') => pop(engine, cls),
      toast: () => toast(engine),
      keepsake: (year) => grantKeepsake(engine, year),
    });
    publish(engine);
  },

  /** new-ur-feature at each midnight seen: solo the keepsake and the badge (online the server's word does it). */
  newUrMidnight(info, engine) {
    if (engine?.mode !== 'multiplayer') grantKeepsake(engine, info?.year);
    return [];
  },

  packVerbs(classTsid, engine) {
    if (isPopper(classTsid) && countItem(engine.inv, classTsid) > 0) {
      return [{ id: 'new_ur:pop', label: NEW_UR_PARTY_TEXT.pop, enabled: true, reason: '', tooltip: NEW_UR_PARTY_TEXT.popTip }];
    }
    if (classTsid === BUBBLY && countItem(engine.inv, BUBBLY) > 0) {
      const alone = !online(engine) && !companions(engine).length;
      return [{ id: 'new_ur:toast', label: NEW_UR_PARTY_TEXT.toast, enabled: !alone && !toastAsked, reason: alone ? NEW_UR_PARTY_TEXT.toastAlone : '', tooltip: NEW_UR_PARTY_TEXT.toastTip }];
    }
    return [];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (verbId === 'new_ur:pop' && isPopper(classTsid)) return pop(engine, classTsid), true;
    if (verbId === 'new_ur:toast' && classTsid === BUBBLY) return toast(engine), true;
    return false;
  },

  /** pot-luck-feature asks what a street Chicken wears beyond Pot Luck Day: the party hat, Dec 31 and Jan 1. */
  chickenCostume(target, engine) {
    return hats ? PARTY_HAT : null;
  },

  onStreetEnter(street, engine) {
    engineRef = engine;
    clearBursts();
    demo(engine);
    watch(engine);
  },

  onStreetClear() {
    clearBursts();
  },

  onTick(dtMs, now, engine) {
    addRecipes();
    watch(engine);
    if (!engine.started) return;
    const t = partyNow(engine);
    const off = seasonOff(engine);
    hats = !off && hatsOn(t);
    tickBatterflies(engine, !off && sparklyBatterflies(t));
    tickBursts();
    publish(engine);
  },

  save() {
    return createPartyState(state);
  },

  restore(slice) {
    state = createPartyState(slice || {});
  },

  /** Tests. */
  _state() {
    return { state, last, bursts: bursts.length, hats, sparkling, engine: engineRef };
  },
  _reset() {
    state = createPartyState();
    client = null;
    toastAsked = false;
    last = '';
    lastSig = '';
    bursts = [];
    glints = [];
    hats = false;
    sparkling = 0;
  },
};

export { POPPERS };
