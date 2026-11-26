/**
 * Thanksgiving Day's feast (G1009): the week's Harvest Table food spilled over Groddle Forest
 * Junction as piles eaten where they lie (rules and sources: js/feast-day.js; all ours, inventions
 * register feast-day-piles). This module puts them in the world.
 *
 *  - The piles: 16 spots right of the table (js/feast-day.js FEAST_SPOTS), each one food drawn as its own put-down art for its
 *    bites (js/world-art.js count states, no number badge), one feature sprite each, created once and
 *    removed one at a time (as Hell One's grapes, hell-feature spawnGrapes), never picked up.
 *  - Eat (Drink for a drink, #723) takes one bite: the pack Eat's or Drink's refusals first
 *    (engine.eatGate: full energy, stuffed, dead; a drink: dead, a mood drink at full mood),
 *    then the bite is the server's to give online (feast_day.go, the first eater wins it) or the
 *    save's solo; the food's energy, mood, fullness, variety iMG, buffs and badge counters come from
 *    the pack's own Eat on a one-item stock (engine.eatFromStock), so it never enters the pack.
 *  - 11 bites a player for the day; an emptied spot is laid again 20 s later; the leftovers are
 *    packed away at midnight. The Harvest Table's card (and each pile's) says "N servings left".
 *  - Solo mirrors it on the player's own copy: the pool is their own table's lays this season
 *    (pot-luck-feast-feature feastLayCounts), topped up by Pot as online.
 *
 * QA: ?seasondate=2026-11-26 lays the feast; &feastdemo=1 (with pot-luck-feast's pack kit) lays a
 * demo week when the solo table is bare and lowers a full energy so a bite can go in.
 * window.groddleFeastDay (qa-gate): state(), eat(spot), refillNow(), seasonDate('2026-11-26').
 * Canvas data: feastDay (on|off), feastDayPiles, feastDayLeft, feastDayAte, feastDayLast.
 */

import { ITEM_CATALOG, getItemUseInfo } from '../inventory.js?v=3be7988a';
import { parseSeasonDate } from '../seasons.js?v=5d8f545a';
import { landingY, nearestSurfaceY } from '../walk-surface.js?v=3c919d5b';
import { isLoaded, onLoaded, textureFromUrl } from '../textures.js?v=b8e38103';
import { standOnFeet } from '../sprite-feet.js?v=6358a697';
import { FALLBACK_MAX, worldArtFor } from '../world-art.js?v=a67514c8';
import { exposeQA } from '../qa-gate.js?v=f4e2cd82';
import { energyMax, forceMetabolic } from '../metabolics.js?v=48f784bf';
import { TABLE_AT, TABLE_STREET } from '../pot-luck-feast.js?v=971888be';
import {
  FEAST_DAY_LINES,
  FEAST_DAY_RULES,
  FEAST_PILE_CLASS,
  FEAST_SPOTS,
  biteSolo,
  createFeastDayState,
  feastDayKey,
  refillDue,
  servingsLeft,
  settleFeastDay,
} from '../feast-day.js?v=3f2d4603';

export const FEAST_DAY_FEATURE_ID = 'feast-day';

/** &feastdemo=1's week when the solo table is bare: a few dishes and crops (QA only). */
const DEMO_COUNTS = Object.freeze({ pumpkin_pie: 3, corny_fritter: 2, wavy_gravy: 2, corn: 4, potato: 3, carrot: 2, pumpkin: 2, onion: 2, tomato: 2, cabbage: 2 });

let solo = createFeastDayState(); // the save's feast (solo)
let online = null; // the server's last word: { on, piles: [{ s, n, c, b, x }], left, ate, cap }
let client = null;
let offs = [];
let pending = null; // { s, at }: a bite the server has not answered
let syncAt = 0;
let checkAt = 0;
let dayAt = 0; // online: when the calendar's day was last read
let dayWas = null; // online: the feast day key last read (null: not yet)
let shown = new Map(); // spot -> { target, sprite, n, c, b }
let last = '';
let qaDate = null;
let engineRef = null;

const nowForCalendar = (engine) => qaDate ?? parseSeasonDate(engine?.param?.('seasondate')) ?? Date.now();
const onStreet = (engine) => String(engine?.streetTsid || '') === TABLE_STREET;
const label = (cls) => ITEM_CATALOG[cls]?.label || String(cls || '').replace(/_/g, ' ');
/** #723: a drink's pile is drunk (its pack verb is Drink, include/drink.js verbs.drink), a food's eaten. */
const isDrink = (cls) => getItemUseInfo(cls)?.kind === 'drink';

function liveClient(engine) {
  return engine.mode === 'multiplayer' ? engine.query?.('realtimeClient') || null : null;
}

function shared(engine) {
  const c = liveClient(engine);
  return c && c.state === 'online' && onStreet(engine) ? c : null;
}

/** The solo pool: the player's own table's lays this season (or the demo week). */
function soloCounts(engine) {
  const counts = engine.query?.('feastLayCounts', engine) || {};
  if (engine.param?.('feastdemo') && !Object.keys(counts).length) return { ...DEMO_COUNTS };
  return counts;
}

/** The feast as drawn now: { on, piles (non-empty), left, ate, cap }. */
function view(engine) {
  if (engine.mode === 'multiplayer') return online || { on: false, piles: [], left: 0, ate: 0, cap: FEAST_DAY_RULES.cap };
  return {
    on: Boolean(solo.key),
    piles: solo.piles.filter((p) => p.b > 0).map((p) => ({ ...p, x: FEAST_SPOTS[p.s] })),
    left: servingsLeft(solo, soloCounts(engine)),
    ate: solo.ate,
    cap: FEAST_DAY_RULES.cap,
  };
}

function publish(engine) {
  if (!engine?.setData) return;
  const v = view(engine);
  engine.setData('feastDay', v.on ? 'on' : 'off');
  engine.setData('feastDayPiles', String(shown.size));
  engine.setData('feastDayLeft', String(v.left || 0));
  engine.setData('feastDayAte', String(v.ate || 0));
  engine.setData('feastDayLast', last || 'none');
}

function say(engine, msg, ok = true) {
  last = String(msg || '').trim();
  engine.toast?.(last, ok ? 3200 : 2600);
  if (!ok) engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
  publish(engine);
}

/* --------------------------------------------------------------- piles */

function groundAt(engine, x, refY) {
  return landingY(engine.platforms, x, (refY ?? engine.groundY) - 60)
    ?? nearestSurfaceY(engine.platforms, x, refY ?? engine.groundY)
    ?? engine.groundY;
}

/** The pile's art for its bites: its put-down scene for that count, else its icon shrunk. */
function dress(sprite, c, b) {
  const icon = ITEM_CATALOG[c]?.icon || `assets/sprites/icons/${c}.webp`;
  const art = worldArtFor(c, b, icon);
  const tex = textureFromUrl(art?.url || icon);
  if (sprite.texture !== tex) sprite.texture = tex;
  const size = () => {
    if (sprite.destroyed || sprite.texture !== tex) return;
    standOnFeet(sprite);
    if (art) sprite.scale.set(1);
    else {
      const w = Math.max(1, tex.orig?.width || tex.width || FALLBACK_MAX);
      const h = Math.max(1, tex.orig?.height || tex.height || FALLBACK_MAX);
      sprite.scale.set(Math.min(1, FALLBACK_MAX / Math.max(w, h)));
    }
  };
  size();
  if (!isLoaded(tex)) onLoaded(tex, size);
}

function removeSpot(engine, s) {
  const row = shown.get(s);
  if (!row) return;
  engine.unregister?.(row.target);
  shown.delete(s);
}

function clearPiles(engine) {
  for (const s of [...shown.keys()]) removeSpot(engine, s);
  publish(engine);
}

/** Make the street's piles match the feast: a sprite per pile, its art changed as bites go. */
function redraw(engine) {
  if (!engine?.street || !onStreet(engine) || engine.inScene?.()) {
    clearPiles(engine);
    return;
  }
  const v = view(engine);
  const want = new Map(v.on ? v.piles.map((p) => [p.s, p]) : []);
  for (const [s, row] of shown) {
    const p = want.get(s);
    if (!p || p.n !== row.n || p.c !== row.c) removeSpot(engine, s);
  }
  const { PIXI } = engine;
  const l = engine.street?.bounds?.l || 0;
  const t = engine.street?.bounds?.t || 0;
  const subtitle = FEAST_DAY_LINES.subtitle(v.left);
  for (const p of want.values()) {
    let row = shown.get(p.s);
    if (!row) {
      const sprite = new PIXI.Sprite();
      const x = (Number(p.x) || FEAST_SPOTS[p.s]) - l;
      sprite.x = x;
      sprite.y = groundAt(engine, x, TABLE_AT.y - t);
      // Every other pile a little behind its neighbours, so the spread reads as heaps side by side.
      sprite.zIndex = p.s % 2 ? 11 : 12;
      sprite.eventMode = 'static';
      sprite.cursor = 'pointer';
      engine.entityLayer.addChild(sprite);
      const target = engine.register({
        classId: FEAST_PILE_CLASS,
        featureId: FEAST_DAY_FEATURE_ID,
        label: label(p.c),
        subtitle,
        sprite,
        feastSpot: p.s,
      });
      row = { target, sprite, n: p.n, c: p.c, b: 0 };
      shown.set(p.s, row);
    }
    if (row.b !== p.b) {
      dress(row.sprite, p.c, p.b);
      row.b = p.b;
    }
    row.target.subtitle = subtitle;
  }
  engine.query?.('feastTableRedraw', engine);
  publish(engine);
}

/* --------------------------------------------------------------- online */

function watch(engine) {
  const c = liveClient(engine);
  if (c === client) return;
  for (const off of offs) off?.();
  offs = [];
  client = c;
  online = null;
  if (!c?.on) return;
  const put = (pile, left) => {
    if (!online || !pile) return;
    online.piles = online.piles.filter((p) => p.s !== pile.s);
    if (pile.b > 0) online.piles.push(pile);
    if (Number.isFinite(Number(left))) online.left = Number(left);
  };
  offs.push(c.on('msg:feastday_state', (msg) => {
    const was = online?.on;
    online = { on: msg.on === true, piles: Array.isArray(msg.piles) ? msg.piles : [], left: Number(msg.left) || 0, ate: Number(msg.ate) || 0, cap: Number(msg.cap) || FEAST_DAY_RULES.cap };
    if (was && !online.on) say(engine, FEAST_DAY_LINES.packed);
    redraw(engine);
  }));
  offs.push(c.on('msg:feastday_pile', (msg) => {
    put(msg?.pile, msg?.left);
    redraw(engine);
  }));
  offs.push(c.on('msg:feastday_left', (msg) => {
    if (online && Number.isFinite(Number(msg?.left))) online.left = Number(msg.left);
    redraw(engine);
  }));
  offs.push(c.on('msg:feastday_ate', (msg) => {
    pending = null;
    put(msg?.pile, msg?.left);
    if (online) online.ate = Number(msg.ate) || online.ate + 1;
    // The server gave the bite: the food's own eat, from a stock that never was in the pack.
    if (msg?.c) engine.eatFromStock?.(String(msg.c));
    last = `ate:${msg?.c || ''}`;
    redraw(engine);
  }));
  offs.push(c.on('msg:feastday_no', (msg) => {
    pending = null;
    say(engine, String(msg?.message || FEAST_DAY_LINES.gone), false);
  }));
}

/* ----------------------------------------------------------------- eat */

function pileAt(engine, s) {
  return view(engine).piles.find((p) => p.s === s) || null;
}

/** One bite of spot s: the checks, then the server's word online, else the save's feast. */
function bite(engine, s) {
  const v = view(engine);
  const p = pileAt(engine, s);
  if (!v.on) return say(engine, FEAST_DAY_LINES.noSeason, false), false;
  if (!p) return say(engine, FEAST_DAY_LINES.gone, false), false;
  if (v.ate >= v.cap) return say(engine, FEAST_DAY_LINES.full, false), false;
  const gate = engine.eatGate?.(p.c) || { ok: true };
  if (!gate.ok) return say(engine, gate.msg, false), false;
  if (engine.mode === 'multiplayer') {
    const live = shared(engine);
    if (!live) return say(engine, FEAST_DAY_LINES.offline, false), false;
    if (pending && Date.now() - pending.at < 8000) return say(engine, FEAST_DAY_LINES.slow, false), false;
    if (!live.send('feastday_eat', { s: p.s, n: p.n })) return say(engine, FEAST_DAY_LINES.offline, false), false;
    pending = { s: p.s, at: Date.now() };
    return true;
  }
  const res = biteSolo(solo, p.s, p.n, soloCounts(engine), Date.now());
  if (!res.ok) return say(engine, res.msg, false), false;
  engine.eatFromStock?.(p.c);
  last = `ate:${p.c}`;
  redraw(engine);
  engine.save?.();
  return true;
}

/* ------------------------------------------------------------- the day */

/** Solo: lay the feast on Thanksgiving Day, pack it away after; then any refills due. */
function settleSolo(engine, force = false) {
  if (engine.mode === 'multiplayer') return;
  const now = Date.now();
  if (!force && now - checkAt < 2000) return;
  checkAt = now;
  const counts = soloCounts(engine);
  const changed = settleFeastDay(solo, feastDayKey(nowForCalendar(engine)), counts);
  const laid = solo.key ? refillDue(solo, counts, now) : [];
  if (changed === 'packed' && engine.started && onStreet(engine)) say(engine, FEAST_DAY_LINES.packed);
  if (changed || laid.length) {
    redraw(engine);
    engine.save?.();
  }
}

function demoSetup(engine) {
  if (!engine.param?.('feastdemo') || !engine.pc || !onStreet(engine)) return;
  // A full energy refuses every bite (include/food.js 126-128): QA starts with room to eat.
  const max = energyMax(engine.pc);
  if (Number(engine.pc.energy) >= max * 0.5) {
    forceMetabolic(engine.pc, 'energy', Math.round(max * 0.3));
    engine.updateHud?.();
  }
}

export const feastDayFeature = {
  id: FEAST_DAY_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    exposeQA('groddleFeastDay', {
      state: () => ({ ...view(engine), shown: [...shown.entries()].map(([s, r]) => ({ s, n: r.n, c: r.c, b: r.b })), solo: engine.mode === 'multiplayer' ? null : { ...solo }, pending }),
      eat: (s) => bite(engine, Number(s)),
      refillNow: () => {
        for (const k of Object.keys(solo.refill)) solo.refill[k] = 0;
        settleSolo(engine, true);
        return view(engine).piles.length;
      },
      seasonDate: (text) => {
        qaDate = parseSeasonDate(text);
        settleSolo(engine, true);
        redraw(engine);
        return view(engine).on;
      },
    });
    publish(engine);
  },

  onStreetEnter(street, engine) {
    watch(engine);
    settleSolo(engine, true);
    demoSetup(engine);
    redraw(engine);
  },

  onStreetClear(engine) {
    clearPiles(engine);
    pending = null;
    online = null;
    syncAt = 0;
  },

  onTick(dtMs, now, engine) {
    watch(engine);
    if (!online && onStreet(engine) && now - syncAt > 5000 && shared(engine)) {
      syncAt = now;
      shared(engine).send('feastday_sync', {});
    }
    // Online the server lays the feast at midnight and tells the street (feast_day.go); when this
    // page's calendar turns too, its word is asked for again in case that one was missed.
    if (engine.mode === 'multiplayer' && now - dayAt > 2000) {
      dayAt = now;
      const day = feastDayKey(nowForCalendar(engine));
      if (dayWas !== null && day !== dayWas && online && shared(engine)) shared(engine).send('feastday_sync', {});
      dayWas = day;
    }
    settleSolo(engine);
  },

  verbsFor(target, engine) {
    if (target?.classId !== FEAST_PILE_CLASS) return null;
    const v = view(engine);
    const room = v.ate < v.cap;
    const drink = isDrink(pileAt(engine, Number(target.feastSpot))?.c);
    return [{
      id: drink ? 'drink' : 'eat',
      label: drink ? FEAST_DAY_LINES.drinkVerb : FEAST_DAY_LINES.verb,
      sort: 10,
      enabled: v.on && room,
      reason: v.on ? FEAST_DAY_LINES.full : FEAST_DAY_LINES.noSeason,
      tooltip: `${drink ? FEAST_DAY_LINES.drinkTip : FEAST_DAY_LINES.verbTip} (${FEAST_DAY_LINES.bitesLeft(Math.max(0, v.cap - v.ate))})`,
      energy: 0,
      durationMs: 0,
    }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== FEAST_PILE_CLASS) return false;
    if (verbId === 'eat' || verbId === 'drink') bite(engine, Number(target.feastSpot));
    return true;
  },

  /** The Harvest Table's card on the day: "N servings left" (pot-luck-feast-feature asks). */
  feastDayServings(engine) {
    if (!onStreet(engine)) return null;
    const v = view(engine);
    return v.on ? v.left : null;
  },

  save() {
    return engineRef?.mode === 'multiplayer' ? {} : { feast: solo };
  },

  restore(slice, engine) {
    solo = createFeastDayState(slice?.feast || {});
    if (engine) {
      settleSolo(engine, true);
      publish(engine);
    }
  },
};
