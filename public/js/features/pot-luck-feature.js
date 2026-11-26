/**
 * Pot Luck Day (G982), part A: the chicken costumes in the world (rules in js/pot-luck.js; the
 * season is js/seasons.js pot_luck_day, asked through seasons-feature's seasonOn).
 *
 * Ours, all of it (inventions register pot-luck-costumes, pot-luck-fancy-feather): Glitch never
 * dressed an animal. During the season a street Chicken's menu has Dress in Turkey Tailfan /
 * Dress in Rooster Plume (one per costume in the pack, js/pot-luck.js dressVerbs), and dropping
 * the costume on it does the same (js/world-drop.js dress rules), as a Rook Balm goes on a
 * Chicken. The costume leaves the pack, the Chicken wears it in every clip it plays (its frames
 * swapped for the costume sheets' twins, tools/pot-luck-art), and `chicken_dressed:<costume>` is
 * counted for lane B's badges. A dressed Chicken can be re-dressed in the other costume, and each
 * player counts each Chicken once (G1181, Austin 2026-11-23): the save slice's `counted` holds the
 * Chickens you dressed this season ("<street>:<i>"), solo and online, and empties when it ends.
 *
 * Who holds the costume: online, the realtime server, for everyone on the street (objects_
 * creatures.go askDress; the dress verb asks it first through street-objects-feature and the
 * ledger takes the costume; its "cos" comes back on the Chicken's state, js/street-creatures.js
 * applyCreatureState). Solo, this feature's save slice (dressed: { "<street>:<i>": costume }).
 * When the season ends every costume falls off (the server clears its own) and Fancy Feathers in
 * the pack rot into Lumps of Loam; a ?season= or ?seasondate= preview never does (G342).
 *
 * A squeeze that lands on a dressed Chicken (the chicken:squoze counter, npc_chicken.js 1557)
 * drops a Fancy Feather one time in four, five a game day (js/pot-luck.js featherDrop).
 *
 * QA canvas data: potLuckOn (1|0), potLuckCostumes ("0:turkey_tailfan,1:-": the street's
 * Chickens, what each wears and whether its costume art is showing, "~" while it loads),
 * potLuckFeathers (today's), potLuckCounted (how many Chickens you have dressed this season),
 * potLuckLast.
 */

import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=3be7988a';
import { getGameDayKey } from '../game-day.js?v=57fecfcb';
import { askedUrl, frameTexture, isLoaded, onLoaded, sourceFromUrl } from '../textures.js?v=b8e38103';
import {
  COSTUME_CELL,
  DRESS_COUNTER,
  DRESS_VERB,
  FANCY_FEATHER,
  FEATHER_ROTS_TO,
  POT_LUCK_ITEMS,
  POT_LUCK_LINES,
  POT_LUCK_SEASON,
  costumeFrame,
  dressCheck,
  dressVerbCostume,
  dressVerbs,
  dressWhy,
  featherDrop,
  isCostume,
} from '../pot-luck.js?v=e704c060';

export const POT_LUCK_FEATURE_ID = 'pot-luck';

const fresh = () => ({ dressed: {}, counted: {}, feathers: { day: '', n: 0 }, wasOn: false });
let slice = fresh();
let last = '';
let checkAt = 0;
let on = false;

/* ------------------------------------------------------------ helpers */

/** A Chicken of the street (game.js spawnChickens), not one of your own animals or a yard's. */
export const isStreetChicken = (t) => t?.classId === 'npc_chicken' && !t.featureId && !t.yardVisit && Number.isInteger(t.classIndex);
/** Your own Chicken (animal-husbandry) or a visited yard's: it stays home, and its menu says so. */
const isHomeChicken = (t) => t?.classId === 'npc_chicken' && !isStreetChicken(t);

/** Your own or a yard's Chicken while you carry a costume: the dress rows greyed, saying only a street Chicken dresses up. */
function homeDressRows(target, engine) {
  if (!isHomeChicken(target) || !seasonOn(engine)) return [];
  return dressVerbs({ season: true, street: false, inv: engine.inv });
}
const keyOf = (engine, t) => `${engine.streetTsid}:${t.classIndex}`;
const online = (engine) => engine?.mode === 'multiplayer';

function seasonOn(engine) {
  return engine?.query?.('seasonOn', POT_LUCK_SEASON, engine) === true;
}

/** What a street Chicken wears: the server's word online, the save's solo. */
export function costumeOf(engine, t) {
  if (!isStreetChicken(t)) return '';
  const c = online(engine) ? t.state?.costume : slice.dressed[keyOf(engine, t)];
  return isCostume(c) ? c : '';
}

/** G1181: did you dress this street Chicken already this season? */
const countedOf = (engine, t) => isStreetChicken(t) && slice.counted[keyOf(engine, t)] === true;

function say(engine, msg, ok = true) {
  last = String(msg || '');
  engine.pushActivity?.(last);
  engine.toast?.(last, ok ? 3200 : 2600);
  engine.refreshPack?.();
}

/* ------------------------------------------------------- costume frames */

const WRAP = Symbol('potLuckCostume');
/** Chicken frame Texture -> Map(costume -> its twin on the costume sheet). */
const twins = new WeakMap();
/** A frames array -> Map(costume -> the twins array). */
const twinLists = new WeakMap();
let loadedTick = 0;

function protoAccessor(obj, name) {
  for (let p = obj; p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d?.set) return d;
  }
  return null;
}

/** The costume twin of one chicken frame, or null (not a chicken sheet's frame, or its sheet not in yet). */
function twinOf(t, costume) {
  const PIXI = globalThis.PIXI;
  if (!t || !PIXI || t === PIXI.Texture.EMPTY) return t || null;
  let byCostume = twins.get(t);
  if (byCostume?.has(costume)) return byCostume.get(costume);
  const r = costumeFrame(costume, askedUrl(t), t.frame);
  if (!r) return null;
  const source = sourceFromUrl(r.path);
  if (!isLoaded(source)) {
    // Wait for the sheet; the next tick puts the costume on (meanwhile the plain bird shows).
    onLoaded(source, () => { loadedTick += 1; });
    return null;
  }
  const out = frameTexture(source, new PIXI.Rectangle(r.x, r.y, r.w, r.h), { orig: new PIXI.Rectangle(0, 0, COSTUME_CELL[0], COSTUME_CELL[1]) });
  if (!byCostume) twins.set(t, (byCostume = new Map()));
  byCostume.set(costume, out);
  return out;
}

/** The costume twins of a whole clip, or null when any frame has none yet (it plays plain). */
function dressedFrames(frames, costume) {
  if (!costume || !Array.isArray(frames) || !frames.length) return null;
  let byCostume = twinLists.get(frames);
  if (byCostume?.has(costume)) return byCostume.get(costume);
  const out = frames.map((t) => twinOf(t, costume));
  if (out.some((t) => !t)) return null;
  if (!byCostume) twinLists.set(frames, (byCostume = new Map()));
  byCostume.set(costume, out);
  return out;
}

/**
 * Wrap a Chicken sprite's `textures` so every clip anyone gives it (walk, peck, stand, the idles,
 * a scared flight, sitting) plays from the costume sheet while it is dressed. The getter keeps
 * answering with the chicken's own frames, so the code that picks clips (js/chicken-idle-art.js,
 * chicken-scare) and its feet (js/sprite-feet.js standOnFeet) see the bird they always did: the
 * twin keeps the frame's cell, so the costume stands exactly where the plain bird would.
 */
function wrap(spr) {
  if (spr[WRAP]) return spr[WRAP];
  const own = protoAccessor(spr, 'textures');
  if (!own) return null;
  const w = { costume: '', base: own.get.call(spr), shown: '', own };
  Object.defineProperty(spr, 'textures', {
    configurable: true,
    get() { return w.base ?? own.get.call(this); },
    set(v) {
      w.base = v;
      const dressed = dressedFrames(v, w.costume);
      w.shown = dressed ? w.costume : '';
      own.set.call(this, dressed || v);
    },
  });
  spr[WRAP] = w;
  return w;
}

/** Put `costume` ('' none) on a Chicken sprite, keeping its clip, frame and play state. */
export function dressSprite(spr, costume) {
  if (!spr || spr.destroyed || !Array.isArray(spr.textures)) return '';
  const w = wrap(spr);
  if (!w) return '';
  const want = costume && dressedFrames(w.base, costume) ? costume : '';
  w.costume = costume;
  if (w.shown === want) return w.shown || (costume ? '~' : '');
  const frame = spr.currentFrame;
  const playing = spr.playing;
  spr.textures = w.base;
  if (playing) spr.gotoAndPlay(frame);
  else spr.gotoAndStop(frame);
  return w.shown || (costume ? '~' : '');
}

/* ------------------------------------------------------------ the verbs */

function dressCtx(engine, target, cls) {
  return { classId: target?.classId, street: isStreetChicken(target), season: seasonOn(engine), costume: costumeOf(engine, target), cls, have: countItem(engine.inv, cls), counted: countedOf(engine, target) };
}

/** The dress landing: the costume leaves the pack and goes on the Chicken (over the other one, G1181). */
function dress(engine, target, cls) {
  const check = dressCheck(dressCtx(engine, target, cls));
  if (!check.ok) {
    say(engine, check.msg, false);
    engine.playSound?.('CLICK_FAILURE', { volume: 0.45 });
    return true;
  }
  // Online, the server and the ledger go first (street-objects-feature asks; the go-ahead runs this again).
  if (online(engine) && engine.query?.('sharedObjectVerb', target, `${DRESS_VERB}:${cls}`, engine) === true) return true;
  removeItem(engine.inv, cls, 1);
  if (!online(engine)) slice.dressed[keyOf(engine, target)] = cls;
  if (target.state) target.state.costume = cls;
  dressSprite(target.sprite, cls);
  // Counted once per Chicken (dressCheck refuses a counted one, so this is its first).
  slice.counted[keyOf(engine, target)] = true;
  engine.achievement?.(`${DRESS_COUNTER}:${cls}`, 1);
  engine.say?.(target, cls === 'rooster_plume' ? 'A-doodle-doo?' : 'Gobble? Gobble.', 2600);
  engine.playSound?.('ITEM_PICKUP', { volume: 0.5 });
  say(engine, POT_LUCK_LINES.dressed[cls]);
  engine.save?.();
  publish(engine);
  return true;
}

/* -------------------------------------------------------- the season end */

/** Pot Luck Day ended (not a preview): every costume off, Fancy Feathers to loam. */
function seasonEnded(engine) {
  slice.dressed = {};
  slice.counted = {};
  let any = false;
  for (const t of engine.interactables || []) {
    if (!isStreetChicken(t)) continue;
    if (t.state?.costume && !online(engine)) delete t.state.costume;
    if (t.sprite?.[WRAP]?.costume) any = true;
    dressSprite(t.sprite, costumeOf(engine, t));
  }
  if (any) say(engine, POT_LUCK_LINES.fellOff);
  const n = countItem(engine.inv, FANCY_FEATHER);
  if (n > 0) {
    removeItem(engine.inv, FANCY_FEATHER, n);
    addItem(engine.inv, FEATHER_ROTS_TO, n);
    say(engine, POT_LUCK_LINES.rot(n));
  }
  engine.save?.();
}

function publish(engine) {
  if (!engine?.setData) return;
  const list = (engine.interactables || []).filter(isStreetChicken).sort((a, b) => a.classIndex - b.classIndex);
  engine.setData('potLuckOn', on ? '1' : '0');
  engine.setData('potLuckCostumes', list.map((t) => {
    const c = costumeOf(engine, t);
    const shown = t.sprite?.[WRAP]?.shown;
    return `${t.classIndex}:${c || '-'}${c && shown !== c ? '~' : ''}`;
  }).join(',') || 'none');
  engine.setData('potLuckCounted', String(Object.keys(slice.counted).length));
  engine.setData('potLuckFeathers', String(slice.feathers.day === getGameDayKey(Date.now()) ? slice.feathers.n : 0));
  engine.setData('potLuckLast', last || 'none');
}

/* ---------------------------------------------------------- the feature */

export const potLuckFeature = {
  id: POT_LUCK_FEATURE_ID,

  init(engine) {
    for (const [id, meta] of Object.entries(POT_LUCK_ITEMS)) ensureItem(id, { ...meta, sellable: true });
    publish(engine);
  },

  /**
   * A street Chicken's menu: the dress rows (js/pot-luck.js dressVerbs) during the season. A visited
   * yard's Chicken: the rows greyed while you carry a costume (homeDressRows).
   */
  decorateVerbs(target, verbs, engine) {
    const home = homeDressRows(target, engine);
    if (home.length) return [...verbs, ...home];
    if (!isStreetChicken(target) || !seasonOn(engine)) return null;
    return [...verbs, ...dressVerbs({ season: true, costume: costumeOf(engine, target), inv: engine.inv, counted: countedOf(engine, target) })];
  },

  /** Your own Chicken's menu (animal-husbandry owns it): the dress rows greyed while you carry a costume. */
  extraVerbs(target, engine) {
    const home = homeDressRows(target, engine);
    return home.length ? home : null;
  },

  runVerbOverride(target, verbId, engine) {
    if (!String(verbId).startsWith(DRESS_VERB)) return null;
    const cls = dressVerbCostume(verbId);
    if (!cls) {
      // The plain row only says why not (counted, wearing a costume you lack the other of, or nothing to wear).
      const why = seasonOn(engine) ? dressWhy({ costume: costumeOf(engine, target), counted: countedOf(engine, target) }) : POT_LUCK_LINES.noSeason;
      say(engine, why, false);
      return true;
    }
    return dress(engine, target, cls);
  },

  /** A squeeze that landed (npc_chicken.js 1557 chicken:squoze): a dressed Chicken may drop a Fancy Feather. */
  onEvent(counter, amount, engine) {
    if (counter !== 'chicken:squoze' || !on) return;
    const t = engine.verbTarget?.();
    if (!featherDrop(slice.feathers, { dressed: Boolean(costumeOf(engine, t)), dayKey: getGameDayKey(Date.now()) })) return;
    addItem(engine.inv, FANCY_FEATHER, 1);
    say(engine, POT_LUCK_LINES.feather);
    engine.save?.();
    publish(engine);
  },

  onStreetEnter(street, engine) {
    checkAt = 0;
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (now >= checkAt) {
      checkAt = now + 2000;
      on = seasonOn(engine);
      const preview = engine.query?.('seasonPreview', engine) === true;
      if (!preview) {
        if (slice.wasOn && !on) seasonEnded(engine);
        slice.wasOn = on;
      }
      publish(engine);
    }
    // G1195: a season's costume beyond Pot Luck Day (new-ur-party-feature: the party hat, Dec 31 and Jan 1).
    const seasonal = engine.query?.('chickenCostume', null, engine) || '';
    for (const t of engine.interactables || []) {
      if (!isStreetChicken(t) || !t.sprite) continue;
      const c = (on ? costumeOf(engine, t) : '') || seasonal;
      const w = t.sprite[WRAP];
      if (!c && !w?.costume) continue;
      if (!w || w.costume !== c || (c && w.shown !== c && w.tick !== loadedTick)) {
        dressSprite(t.sprite, c);
        if (t.sprite[WRAP]) t.sprite[WRAP].tick = loadedTick;
      }
    }
  },

  save() {
    return { version: 1, dressed: { ...slice.dressed }, counted: { ...slice.counted }, feathers: { ...slice.feathers }, wasOn: slice.wasOn };
  },

  restore(data) {
    slice = fresh();
    if (!data || typeof data !== 'object') return;
    for (const [k, c] of Object.entries(data.dressed || {})) if (typeof k === 'string' && isCostume(c)) slice.dressed[k] = c;
    // A save from before G1181 has no `counted`: solo, every Chicken it dressed was this player's.
    if (data.counted && typeof data.counted === 'object') {
      for (const [k, v] of Object.entries(data.counted)) if (v === true) slice.counted[k] = true;
    } else for (const k of Object.keys(slice.dressed)) slice.counted[k] = true;
    if (data.feathers && typeof data.feathers === 'object') slice.feathers = { day: String(data.feathers.day || ''), n: Math.max(0, Math.floor(Number(data.feathers.n) || 0)) };
    slice.wasOn = data.wasOn === true;
  },

  /** QA / tests. */
  _state() {
    return { slice, on, last };
  },
  _reset() {
    slice = fresh();
    on = false;
    last = '';
    checkAt = 0;
  },
};
