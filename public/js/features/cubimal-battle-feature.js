/**
 * Cubimal battles (register G40): Panache, Wile and Gumption (battle) on every
 * Cubimal figure in the pack, as GameServerJS npc_cubimal_base gave them (the
 * rules and their sources are js/cubimal-battle.js).
 *
 * The verb sets the figure down at your feet (CUBIMAL_WIND_UP, "You battled a
 * Chick Cubimal."). Online (engine.mode 'multiplayer' with the realtime
 * client) the realtime server (cubimal_battle.go) pairs it a second later
 * with another player's figure set down to fight on the street, or it says
 * "Come at me, Bro!" and waits there; the server rolls every insult and Ego
 * and tells the street, and this draws the figures, their runs and walks
 * back, the bubbles (each owner sees its own figure's style shout), the
 * activity lines ("... VS. ...", "...'s Ego remaining: N", "... defeated
 * ...") and the loser's puff. The winner's new level and experience go into
 * its copy's words (js/tools.js row.tags, beside its name), which travel with
 * it. Solo has no other player's figure, so the figure does what it does on a
 * street with none: "Come at me, Bro!", and waits until you pick it up
 * (canPickup 525: its owner only, never once it has an opponent). Leaving the
 * street, or a reload, puts a figure that is out back in the pack with its
 * words.
 *
 * QA: &cubibattleautoplay=p|s|r runs that verb on the first figure in the
 * pack a moment after the street loads (with &cubimaldemo=race to put a Chick
 * in the pack); window.groddleCubiBattle = { battle(classTsid, style),
 * pickup(), state() }. Canvas: cubiBattleState (idle | pending | waiting |
 * fighting | won | lost), cubiBattleFighters (on this street), cubiBattleLast
 * (the last activity line), cubiBattleSay (the last bubble), cubiBattleEgo
 * (id:ego,...), cubiBattleMine (class:level:xp of the figure out),
 * cubiBattleWins, cubiBattleLevel (the last level a win left).
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=60dfc9ca';
import { copyForVerb, copyTag, setCopyTag, takeToolCopy } from '../tools.js?v=5f482998';
import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=d9a73bdc';
import { landingY, walkSurfaceY } from '../walk-surface.js?v=106bfdc5';
import { displayTopOf, itemstackOverlayPoint, playSheetOverlay } from '../overlay-art.js?v=75c3ea34';
import { CUBIMAL_RACE, cubimalArticle, cubimalInfo, cubimalRaceSheet } from '../cubimals.js?v=5e340c94';
import {
  CUBIMAL_BATTLE,
  battleStyleOfVerb,
  canBattle,
  cubimalBattleLabel,
  cubimalBattleStats,
  cubimalBattleVerbMessage,
  cubimalEgo,
  cubimalTagName,
  cubimalTagWith,
} from '../cubimal-battle.js?v=80a58864';

export const CUBIMAL_BATTLE_FEATURE_ID = 'cubimal-battle';
const SOLO_ID = 'solo';
/** How long the game waits for the server to set a figure down before it goes back to the pack. */
const PENDING_MS = 5_000;
const FIGURE_Z = 40;
/** checkWin 557: smoke_puff_overlay on the loser, delta_y 120. */
const PUFF = Object.freeze({ overlay: 'smoke_puff', deltaY: 120, durationMs: 1_500 });
const TEXT = Object.freeze({
  busy: 'One of your Cubimals is already out.',
  notNow: 'Not right now.',
  gone: 'That Cubimal is no longer in your pack.',
  noAnswer: 'Your Cubimal could not be set down here. It is back in your pack.',
  pickedUp: (classTsid) => `You picked up ${cubimalArticle(classTsid)} ${cubimalInfo(classTsid)?.label || 'Cubimal'}.`,
});

let loader = null;
let eng = null;
/** Figures on this street: id (an owner's player id, or 'solo') -> fighter. */
const fighters = new Map();
/** Your figure out of the pack: { classTsid, tag, style, sentAt, confirmed, state }. */
let mine = null;
let session = null;
let last = '';
let lastSay = '';
let wins = 0;
let lastLevel = '';
let demoDone = false;
const timers = new Set();

const now = () => Date.now();

function later(ms, fn) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

function clearTimers() {
  for (const id of timers) clearTimeout(id);
  timers.clear();
}

function isMp(engine) {
  return engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));
}

function myId() {
  return Number(session?.client?.me?.id) || 0;
}

function publish(engine = eng) {
  if (!engine?.setData) return;
  engine.setData('cubiBattleState', mine?.state || 'idle');
  engine.setData('cubiBattleFighters', String(fighters.size));
  engine.setData('cubiBattleLast', last);
  engine.setData('cubiBattleSay', lastSay);
  engine.setData('cubiBattleEgo', [...fighters.values()].map((f) => `${f.id}:${f.ego}`).join(','));
  const st = mine ? cubimalBattleStats(mine.tag) : null;
  engine.setData('cubiBattleMine', mine ? `${mine.classTsid}:${st.level}:${st.xp}` : '');
  engine.setData('cubiBattleWins', String(wins));
  engine.setData('cubiBattleLevel', lastLevel);
}

function line(engine, text) {
  if (!text) return;
  last = text;
  engine.pushActivity?.(text);
  publish(engine);
}

// —— Figures on the street ——————————————————————————————————————————————————

function feetY(engine, x, y) {
  return landingY(engine.platforms, x, y - 4) ?? walkSurfaceY(engine.platforms, x, y, { up: 120, down: 120 }) ?? y;
}

function makeSprite(engine, classTsid, x, y) {
  const PIXI = engine.PIXI;
  const def = cubimalRaceSheet(classTsid);
  const ready = Boolean(def && loader?.ready(def));
  const sprite = new PIXI.AnimatedSprite(ready ? loader.frames(def) : [PIXI.Texture.EMPTY]);
  sprite.anchor.set(0.5, 1);
  sprite.x = x;
  sprite.y = y;
  sprite.zIndex = FIGURE_Z;
  sprite.label = 'cubimal-fighter';
  sprite.animationSpeed = pixiSpeed(CUBIMAL_RACE.fps);
  sprite.loop = true;
  sprite.gotoAndStop(0);
  engine.entityLayer?.addChild(sprite);
  if (!ready && def && loader) {
    loader.load(def).then(() => {
      const frames = loader.frames(def);
      if (sprite.destroyed || !frames.length) return;
      sprite.textures = frames;
      sprite.gotoAndStop(0);
    });
  }
  return sprite;
}

function placeFighter(engine, f) {
  const id = f.id === SOLO_ID ? SOLO_ID : Number(f.id);
  const old = fighters.get(id);
  if (old) {
    Object.assign(old, { label: f.label, level: f.level, state: f.state, ego: f.ego, vs: f.vs });
    if (old.target) old.target.label = f.label;
    publish(engine);
    return old;
  }
  const x = Math.round(Number(f.x) || 0);
  const y = feetY(engine, x, Number(f.y) || 0);
  const sprite = makeSprite(engine, f.c, x, y);
  const mineToo = id === SOLO_ID || id === myId();
  const fighter = {
    id,
    mine: mineToo,
    ownerName: String(f.name || ''),
    classTsid: f.c,
    label: f.label,
    level: f.level,
    style: f.style,
    state: f.state || 'waiting',
    ego: Number(f.ego) || 0,
    vs: Number(f.vs) || 0,
    x,
    y,
    toX: x,
    speed: 0,
    sprite,
    target: null,
  };
  fighter.target = engine.register({
    classId: 'cubimal_fighter',
    featureId: CUBIMAL_BATTLE_FEATURE_ID,
    label: f.label,
    subtitle: mineToo ? cubimalInfo(f.c)?.label || 'Cubimal' : `${fighter.ownerName}'s Cubimal`,
    sprite,
    state: { fighterId: id },
  });
  fighters.set(id, fighter);
  publish(engine);
  return fighter;
}

function removeFighter(engine, id) {
  const f = fighters.get(id);
  if (!f) return null;
  fighters.delete(id);
  if (f.target) engine.unregister?.(f.target);
  else if (f.sprite && !f.sprite.destroyed) f.sprite.destroy();
  publish(engine);
  return f;
}

function clearFighters(engine) {
  for (const id of [...fighters.keys()]) removeFighter(engine, id);
}

function sayAt(engine, f, text, ms) {
  if (!f?.target || !text) return;
  lastSay = text;
  engine.say?.(f.target, text, ms);
  publish(engine);
}

function face(f, dir) {
  if (!f.sprite || f.sprite.destroyed || !dir) return;
  const s = Math.abs(f.sprite.scale.x) || 1;
  // The race sheets face right.
  f.sprite.scale.x = dir < 0 ? -s : s;
}

function tickFighters(engine, dtMs) {
  const surface = (x, y) => walkSurfaceY(engine.platforms, x, y, { up: 24, down: 24 });
  for (const f of fighters.values()) {
    if (!f.sprite || f.sprite.destroyed) continue;
    if (f.toX !== f.x && f.speed > 0) {
      const step = (f.speed * dtMs) / 1000;
      const dir = Math.sign(f.toX - f.x);
      const nx = Math.abs(f.toX - f.x) <= step ? f.toX : f.x + dir * step;
      const ny = surface(nx, f.y);
      f.x = nx;
      if (ny != null) f.y = ny;
      face(f, dir);
      if (!f.sprite.playing) f.sprite.gotoAndPlay(0);
      if (f.x === f.toX) {
        f.sprite.gotoAndStop(0);
        // At rest it faces its opponent (onBattleStart 776-791).
        const o = fighters.get(f.vs);
        if (o) face(f, Math.sign(o.x - f.x));
      }
    }
    f.sprite.x = f.x;
    f.sprite.y = f.y;
  }
}

// —— Your figure out of the pack ——————————————————————————————————————————————

function giveBack(engine, { quiet = false } = {}) {
  if (!mine) return;
  const { classTsid, tag } = mine;
  mine = null;
  if (!engine?.inv) return;
  addItem(engine.inv, classTsid, 1);
  if (tag != null && engine.toolState) setCopyTag(engine.toolState, classTsid, countItem(engine.inv, classTsid) - 1, tag);
  if (!quiet) {
    engine.refreshPack?.();
    engine.save?.();
  }
  publish(engine);
}

function startBattle(engine, classTsid, style, copy = null) {
  eng = engine;
  const player = engine.player;
  if (!canBattle(classTsid) || !CUBIMAL_BATTLE.verbs[style] || !player || !engine.started) return false;
  if (mine) {
    engine.toast?.(TEXT.busy);
    return false;
  }
  if (engine.busy?.()) {
    engine.toast?.(TEXT.notNow);
    return false;
  }
  const mp = isMp(engine);
  if (mp) ensureSession(engine);
  if (mp && session?.client?.state !== 'online') {
    engine.toast?.(TEXT.notNow);
    return false;
  }
  // The figure picked fights, with its own words; it leaves the pack from its own slot (as a race does).
  const at = engine.toolState ? copyForVerb(engine.toolState, classTsid, copy) : -1;
  const tag = at >= 0 ? copyTag(engine.toolState, classTsid, at) : null;
  if (at >= 0) {
    engine.query?.('packTakeUnit', classTsid, at, 1, engine);
    takeToolCopy(engine.toolState, classTsid, { copy: at });
  }
  if (countItem(engine.inv, classTsid) < 1 || !removeItem(engine.inv, classTsid, 1)) {
    engine.toast?.(TEXT.gone);
    return false;
  }
  const { level, xp } = cubimalBattleStats(tag);
  const name = cubimalTagName(tag);
  mine = { classTsid, tag, style, sentAt: now(), confirmed: false, state: 'pending' };
  engine.playSound?.(CUBIMAL_BATTLE.sounds.windUp, { volume: 0.7 });
  line(engine, cubimalBattleVerbMessage(classTsid));
  engine.refreshPack?.();
  engine.save?.();
  if (mp) {
    if (!session.client.send('cubi_battle', { c: classTsid, style, name, level, xp })) {
      giveBack(engine);
      engine.toast?.(TEXT.notNow);
      return false;
    }
    publish(engine);
    return true;
  }
  // Solo: set down at your feet; a second later its search finds nobody (search 994, 1035).
  const x = Math.round(player.x);
  placeFighter(engine, { id: SOLO_ID, c: classTsid, label: cubimalBattleLabel(classTsid, name, level), level, style, x, y: player.y, state: 'waiting', ego: cubimalEgo(level), vs: 0 });
  mine.confirmed = true;
  mine.state = 'waiting';
  const street = engine.streetTsid;
  later(CUBIMAL_BATTLE.timing.searchMs, () => {
    if (engine.streetTsid !== street || !fighters.has(SOLO_ID)) return;
    sayAt(engine, fighters.get(SOLO_ID), CUBIMAL_BATTLE.text.comeAtMe, CUBIMAL_BATTLE.timing.comeAtMeMs);
  });
  publish(engine);
  return true;
}

function pickUp(engine) {
  if (!mine) return false;
  if (isMp(engine)) {
    session?.client?.send('cubi_pickup', {});
    return true;
  }
  const classTsid = mine.classTsid;
  removeFighter(engine, SOLO_ID);
  giveBack(engine);
  line(engine, TEXT.pickedUp(classTsid));
  return true;
}

// —— The realtime server ——————————————————————————————————————————————————————

function ensureSession(engine) {
  if (!isMp(engine)) return session;
  const client = engine.query('realtimeClient');
  if (session?.client === client) return session;
  // A new client (a new game in this page): listen to it instead.
  for (const off of session?.offs || []) off?.();
  const offs = [];
  const on = (kind, fn) => offs.push(client.on(kind, (msg) => fn(msg || {}, eng || engine)));
  session = { client, offs };
  on('msg:cubi_fighters', (msg, e) => {
    if (msg.street && e.streetTsid && msg.street !== e.streetTsid) return;
    clearFighters(e);
    for (const f of Array.isArray(msg.fighters) ? msg.fighters : []) placeFighter(e, f);
  });
  on('msg:cubi_fighter', (msg, e) => {
    const f = msg.f;
    if (!f) return;
    placeFighter(e, f);
    if (Number(f.id) === myId() && mine) {
      mine.confirmed = true;
      mine.state = f.state === 'fighting' ? 'fighting' : 'waiting';
      publish(e);
    }
  });
  on('msg:cubi_say', (msg, e) => sayAt(e, fighters.get(Number(msg.id)), String(msg.text || ''), Number(msg.ms) || 3_000));
  on('msg:cubi_vs', (msg, e) => {
    for (const id of [Number(msg.a), Number(msg.b)]) {
      const f = fighters.get(id);
      if (f) {
        f.state = 'fighting';
        f.vs = id === Number(msg.a) ? Number(msg.b) : Number(msg.a);
      }
    }
    if (mine && (Number(msg.a) === myId() || Number(msg.b) === myId())) mine.state = 'fighting';
    line(e, String(msg.text || ''));
  });
  on('msg:cubi_strike', (msg, e) => {
    const f = fighters.get(Number(msg.id));
    const o = fighters.get(Number(msg.vs));
    if (o) o.ego = Number(msg.ego) || 0;
    if (!f) return;
    // showInsult 754: the bubble 100 ms in; the run unless it choked (onBattleStart 815-830).
    later(CUBIMAL_BATTLE.timing.insultDelayMs, () => sayAt(e, fighters.get(f.id), String(msg.text || ''), Number(msg.ms) || CUBIMAL_BATTLE.timing.insultMs));
    if (!msg.choke) {
      f.toX = Number(msg.to);
      f.speed = Number(msg.speed) || CUBIMAL_BATTLE.strikeSpeed;
    }
    if (f.mine) e.playSound?.(CUBIMAL_BATTLE.sounds.race, { volume: 0.5 });
    publish(e);
  });
  on('msg:cubi_back', (msg, e) => {
    const f = fighters.get(Number(msg.id));
    if (!f) return;
    f.toX = Number(msg.to);
    f.speed = Number(msg.speed) || CUBIMAL_BATTLE.backSpeed;
    if (f.mine) e.playSound?.(CUBIMAL_BATTLE.sounds.windDown, { volume: 0.6 });
  });
  on('msg:cubi_line', (msg, e) => line(e, String(msg.text || '')));
  on('msg:cubi_won', (msg, e) => {
    line(e, String(msg.text || ''));
    const loser = fighters.get(Number(msg.vs));
    if (loser?.sprite && !loser.sprite.destroyed && e.PIXI) {
      const at = itemstackOverlayPoint(loser.x, displayTopOf(loser.sprite), { dy: PUFF.deltaY });
      playSheetOverlay(e.PIXI, PUFF.overlay, { layer: e.fxLayer || e.entityLayer, at: () => at, durationMs: PUFF.durationMs, loop: false, zIndex: 70 });
    }
    e.playSound?.(CUBIMAL_BATTLE.sounds.puff, { volume: 0.6 });
    // The winner's gain is settled now (it keeps it even if you leave before it comes home).
    if (mine && Number(msg.id) === myId()) {
      mine.tag = cubimalTagWith(mine.tag, { level: Number(msg.level), xp: Number(msg.xp) });
      mine.state = 'won';
      wins += 1;
      lastLevel = String(cubimalBattleStats(mine.tag).level);
      e.save?.();
    } else if (mine && Number(msg.vs) === myId()) {
      mine.state = 'lost';
    }
    publish(e);
  });
  on('msg:cubi_home', (msg, e) => {
    const id = Number(msg.id);
    removeFighter(e, id);
    if (id !== myId() || !mine) return;
    if (msg.why === 'won' && Number.isFinite(Number(msg.level))) mine.tag = cubimalTagWith(mine.tag, { level: Number(msg.level), xp: Number(msg.xp) });
    const classTsid = mine.classTsid;
    giveBack(e);
    if (msg.why === 'picked') line(e, TEXT.pickedUp(classTsid));
  });
  on('error', (err, e) => {
    if (err.code !== 'cubi_battle') return;
    if (mine && !mine.confirmed) {
      giveBack(e);
      e.toast?.(err.message === 'busy' ? TEXT.busy : TEXT.notNow);
    }
  });
  return session;
}

// —— QA ——————————————————————————————————————————————————————————————————————

function setupDemo(engine) {
  const style = engine.param?.('cubibattleautoplay');
  if (demoDone || !style || !CUBIMAL_BATTLE.verbs[style]) return;
  demoDone = true;
  later(Number(engine.param('cubibattledelay')) || 2_500, () => {
    const classTsid = Object.keys(engine.inv || {}).find((k) => canBattle(k) && countItem(engine.inv, k) > 0);
    if (classTsid) startBattle(engine, classTsid, style);
  });
}

function qaApi() {
  return {
    battle: (classTsid, style = 'r') => startBattle(eng, classTsid, style),
    pickup: () => pickUp(eng),
    state: () => ({
      mine: mine ? { ...mine } : null,
      fighters: [...fighters.values()].map((f) => ({ id: f.id, mine: f.mine, c: f.classTsid, label: f.label, state: f.state, ego: f.ego, x: Math.round(f.x), y: Math.round(f.y) })),
      last,
      lastSay,
      wins,
    }),
  };
}

// —— Feature ———————————————————————————————————————————————————————————————

export const cubimalBattleFeature = {
  id: CUBIMAL_BATTLE_FEATURE_ID,

  init(engine) {
    eng = engine;
    loader = engine.PIXI ? createSheetLoader(engine.PIXI) : null;
    if (typeof globalThis !== 'undefined') globalThis.groddleCubiBattle = qaApi();
    publish(engine);
  },

  onStreetEnter(street, engine) {
    eng = engine;
    const defs = Object.keys(engine.inv || {}).filter((k) => canBattle(k)).map((k) => cubimalRaceSheet(k)).filter(Boolean);
    if (loader && defs.length) loader.loadAll(defs).then(() => setupDemo(engine));
    else setupDemo(engine);
  },

  onStreetClear(engine) {
    // Off the street: every figure there goes, and yours back to the pack (the server sends it home too).
    clearTimers();
    clearFighters(engine);
    giveBack(engine, { quiet: true });
    engine.refreshPack?.();
    publish(engine);
  },

  onTick(dtMs, t, engine) {
    eng = engine;
    if (engine.mode === 'multiplayer' && engine.started) ensureSession(engine);
    if (mine && !mine.confirmed && now() - mine.sentAt > PENDING_MS) {
      giveBack(engine);
      engine.toast?.(TEXT.noAnswer);
    }
    if (fighters.size) tickFighters(engine, Math.min(100, Number(dtMs) || 16));
  },

  /** The source verbs, in its order (all sort_on 50): Panache, Wile, Gumption (battle). */
  packVerbs(classTsid, engine, opts = {}) {
    if (!canBattle(classTsid) || countItem(engine.inv, classTsid) < 1) return [];
    eng = engine;
    return CUBIMAL_BATTLE.styles.map((s) => {
      const v = CUBIMAL_BATTLE.verbs[s];
      return { id: v.id, label: v.label, tooltip: CUBIMAL_BATTLE.tooltip, enabled: !mine, reason: mine ? TEXT.busy : '' };
    });
  },

  runPackVerb(classTsid, verbId, engine, opts = {}) {
    const style = battleStyleOfVerb(verbId);
    if (!style || !canBattle(classTsid)) return false;
    startBattle(engine, classTsid, style, opts?.copy);
    return true;
  },

  /** A figure on the ground: its owner may pick it up while it waits (canPickup 525-534). */
  verbsFor(target, engine) {
    if (target?.classId !== 'cubimal_fighter') return null;
    const f = fighters.get(target.state?.fighterId);
    if (!f?.mine || f.state !== 'waiting') return [];
    return [{ id: 'cubimal_battle_pickup', label: 'Pick up', tooltip: 'Put it in your pack', enabled: true, reason: '' }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== 'cubimal_fighter') return false;
    if (verbId === 'cubimal_battle_pickup') return pickUp(engine);
    return false;
  },

  save() {
    return { version: 1, out: mine ? { c: mine.classTsid, tag: mine.tag ?? null } : null };
  },

  restore(slice, engine) {
    eng = engine || eng;
    // A reload with a figure out: it goes home to the pack with its words.
    const out = slice?.out;
    mine = null;
    if (out && canBattle(out.c) && engine?.inv) {
      mine = { classTsid: out.c, tag: cubimalTagWith(out.tag ?? null, {}) };
      giveBack(engine, { quiet: true });
    }
  },
};
