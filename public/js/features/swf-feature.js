/**
 * The three SWFs and the Game (register row G190), as a feature module (see
 * js/feature-host.js). Rules and source lines live in js/swf.js.
 *
 * - SWF (swf_1, swf_2, swf_3, from barnacle scraping's swfs_1-3 drop
 *   tables): Wrangle on the pack card pays 25 iMG with the mood bonus, says
 *   the source line and deletes the SWF.
 * - Holding all three: when an SWF lands in the pack and the other two are
 *   there, 400 ms later the big "You've got multiple SWFs!" line shows for
 *   5 s (the avatar stands still: the source overlay is locking), the three
 *   SWFs go on the ground one by one at x, x + 40, x + 80, a Game lands in
 *   the pack, and the SWFs vanish. The pack is read every frame (items_added
 *   has no hook here); a save that already held all three makes its Game on
 *   load.
 * - Game (game_box): Play runs 24.5 s and pays 250 iMG with the mood bonus,
 *   then the Game is gone. Drop is blocked while it plays (the
 *   packDropBlockReason query in game.js). Stand-in: play_glitch's overlay
 *   art survives only as glitch-overlays/play_glitch.fla (vector XFL, not
 *   converted), so the Game's own CC0 icon bobs above the avatar instead.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&swfdemo=wrangle|game|play
 *   wrangle: swf_1 and swf_2 in the pack (&swfautoplay=1 wrangles swf_1).
 *   game: swf_1 and swf_2 in the pack, swf_3 arrives 1.5 s later.
 *   play: a Game in the pack (&swfautoplay=1 plays it, &swffast=1 plays for
 *   2.45 s instead of 24.5 s).
 *   Canvas data: swfLast, swfGame (stage), swfGames, swfPlaying (ms left),
 *   swfLocked, swfCounts.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-4';
import { grantMoodXp } from '../mood-xp.js';
import { textureFromUrl } from '../textures.js';
import { vpOverlay } from '../quest-rooms/vp-overlay.js?v=ffw-1';
import {
  GAME_BOX,
  GAME_STAGES,
  GLITCH_GAME,
  PLAY,
  SWF_CLASSES,
  WRANGLE,
  dropPoints,
  gameBoxVerbs,
  hasAllSwfs,
  isSwf,
  normalizeSwfState,
  playMessage,
  swfAddedWithSet,
  swfCounts,
  swfVerbs,
  wrangleMessage,
} from '../swf.js?v=g190-1';

export const SWF_FEATURE_ID = 'swf';

let state = normalizeSwfState({});
/** The running Glitch game: { stage, at, created, drops }. */
let game = null;
let lockUntil = 0;
let lastCounts = null;
let last = '';
let badge = null; // the Play stand-in sprite
let demoDone = false;
let fast = false;

const ITEMS = Object.freeze({
  // swf_1.js 3-8, swf_2.js 8, swf_3.js 8.
  swf_1: "One of the three essential elementary thingamabobs that go into making a game. Without this one, the whatsitcalleds won't do that rendering thingy. And without that nothing works, as any fool knows.",
  swf_2: "One of the three necessary somethings that go into making an awesome game. Without this one, the thingmabobs won't scale to the server whatsit. And that's just not cool. So you totally want to avoid that, by having this in your game. Right?",
  swf_3: "One of the three vitally important widgets that go into making a game great. Without this one, the doodahs don't layer correctly, and the side-scrolling shizzle-facilitator gets all out of whack. And you don't want that.",
});
// game_box.js 3-8.
const GAME_DESC = 'This is a tiny box containing a whole imaginary world, created in the minds of 11 Giants. At the bottom, there\'s a tagline: "Do stuff. In a game." it says. Wow. That\'s a terrible tag line. Game looks pretty awesome, though.';

function ensureItems() {
  for (const cls of SWF_CLASSES) {
    const have = ITEM_CATALOG[cls];
    if (have && have.label === 'SWF' && !/^Item /.test(have.desc || '')) continue;
    ensureItem(cls, { label: 'SWF', namePlural: 'SWF', desc: ITEMS[cls], baseCost: 0, stackMax: 1, tags: ['no_rube', 'collectible', 'swf', 'no_auction'], sellable: false });
  }
  const box = ITEM_CATALOG[GAME_BOX];
  if (!box || box.label !== 'Game' || /^Item /.test(box.desc || '')) {
    ensureItem(GAME_BOX, { label: 'Game', namePlural: 'Games', desc: GAME_DESC, baseCost: 0, stackMax: 1, tags: ['no_rube', 'no_discovery_dialog', 'collectible', 'swf', 'no_auction'], sellable: false });
  }
}

const playing = (now = Date.now()) => state.playUntil > 0 && now < state.playUntil;

function publish(engine) {
  const now = Date.now();
  engine.setData?.('swfLast', last);
  engine.setData?.('swfGame', game ? game.stage : '');
  engine.setData?.('swfGames', String(state.games));
  engine.setData?.('swfPlaying', state.playUntil ? String(Math.max(0, state.playUntil - now)) : '');
  engine.setData?.('swfLocked', now < lockUntil ? '1' : '');
  const c = swfCounts(engine.inv);
  engine.setData?.('swfCounts', SWF_CLASSES.map((cls) => `${cls}=${c[cls]}`).join(','));
}

function changed(engine) {
  engine.updateHud?.();
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
}

/* ------------------------------------------------------------- wrangle */

/** swf_*.js verbs.wrangle handler. */
export function wrangleSwf(engine, classTsid) {
  if (!isSwf(classTsid) || countItem(engine.inv, classTsid) < 1) return false;
  const xp = grantMoodXp(engine.pc, WRANGLE.xpPerSwf);
  removeItem(engine.inv, classTsid, 1);
  lastCounts = swfCounts(engine.inv);
  state.wrangled += 1;
  engine.pushActivity?.({ base: wrangleMessage(1), effects: xp ? { xp } : {} });
  engine.toast?.(WRANGLE.line, 3600);
  const p = engine.player;
  if (p && xp) engine.floatText?.(p.x, p.y - 100, `+${xp} iMG`, 0xffd36b);
  last = `${classTsid}:wrangle`;
  changed(engine);
  return true;
}

/* -------------------------------------------------------- Glitch game */

function startGame(now, engine, { delayMs = GLITCH_GAME.stepMs } = {}) {
  game = { stage: GAME_STAGES[0], at: now + delayMs, created: false, drops: [] };
  last = 'game:queued';
  publish(engine);
}

/** One SWF from the pack to the ground (takeable_drop / apiPutItemIntoPosition). */
function dropSwf(engine, classTsid, index) {
  if (countItem(engine.inv, classTsid) < 1 || !engine.streetTsid) return;
  const p = engine.player;
  const points = dropPoints(p?.x ?? 0, engine.worldW);
  // game.js dropPackItem: a dropped stack sits 74 px above the feet.
  const y = (p?.y ?? engine.groundY ?? 0) - 74;
  removeItem(engine.inv, classTsid, 1);
  const res = engine.dropWorldStack?.(classTsid, 1, points[index], y);
  if (res?.ok && res.stack) game.drops.push({ id: res.stack.id, tsid: engine.streetTsid, classTsid });
  engine.playSound?.('ITEM_DROP', { volume: 0.5 });
}

/** onFinishCreateGame: apiDelete each SWF wherever it is now. */
function deleteSwfs(engine, drops) {
  const streets = engine.droppedItems?.streets || {};
  let ground = false;
  for (const d of drops) {
    const rows = streets[d.tsid];
    const i = Array.isArray(rows) ? rows.findIndex((r) => r.id === d.id) : -1;
    if (i >= 0) {
      rows.splice(i, 1);
      if (!rows.length) delete streets[d.tsid];
      ground = true;
    } else if (countItem(engine.inv, d.classTsid) > 0) {
      // Picked back up before the end: it still goes.
      removeItem(engine.inv, d.classTsid, 1);
    }
  }
  if (ground) engine.droppedItemsChanged?.();
}

function runStage(now, engine) {
  const stage = game.stage;
  if (stage === 'announce') {
    // createGlitchGame: the locking overlay, then swf_1 at your feet.
    vpOverlay(engine, { lines: [GLITCH_GAME.overlay.text], durationMs: GLITCH_GAME.overlay.durationMs, topY: GLITCH_GAME.overlay.topY });
    lockUntil = Date.now() + GLITCH_GAME.overlay.durationMs;
    dropSwf(engine, 'swf_1', 0);
  } else if (stage === 'drop2') {
    dropSwf(engine, 'swf_2', 1);
  } else if (stage === 'drop3') {
    dropSwf(engine, 'swf_3', 2);
  } else if (stage === 'create') {
    // createItemFromGround('game_box', 1): from your feet into the pack.
    addItem(engine.inv, GAME_BOX, 1);
    game.created = true;
    state.games += 1;
    const p = engine.player;
    if (p) engine.floatText?.(p.x, p.y - 100, '+1 Game', 0x7dcea0);
    engine.playSound?.('ITEM_PICKUP', { volume: 0.6 });
  } else if (stage === 'finish') {
    deleteSwfs(engine, game.drops);
    game = null;
    lastCounts = swfCounts(engine.inv);
    last = 'game:made';
    // "Check again": three more SWFs start another Game.
    if (hasAllSwfs(engine.inv)) startGame(now, engine);
    changed(engine);
    return;
  }
  last = `game:${stage}`;
  const next = GAME_STAGES[GAME_STAGES.indexOf(stage) + 1];
  game.stage = next;
  game.at = now + GLITCH_GAME.stepMs;
  lastCounts = swfCounts(engine.inv);
  changed(engine);
}

/** A reload cut a Glitch game short: finish it at once. */
function settleCutGame(engine) {
  const cut = state.game;
  state.game = null;
  if (!cut) return;
  // The SWFs still in the pack would have gone to the ground and then away.
  for (const cls of SWF_CLASSES) {
    if (!cut.drops.some((d) => d.classTsid === cls) && countItem(engine.inv, cls) > 0) removeItem(engine.inv, cls, 1);
  }
  deleteSwfs(engine, cut.drops);
  if (!cut.created) {
    addItem(engine.inv, GAME_BOX, 1);
    state.games += 1;
  }
  lastCounts = swfCounts(engine.inv);
  last = 'game:settled';
  changed(engine);
}

/* ---------------------------------------------------------------- play */

function playMs() {
  return fast ? PLAY.durationMs / 10 : PLAY.durationMs;
}

/** game_box.js verbs.play handler. */
export function playGame(engine, now = Date.now()) {
  if (countItem(engine.inv, GAME_BOX) < 1) return false;
  if (playing(now)) {
    engine.toast?.(PLAY.alreadyPlaying, 2600);
    return false;
  }
  state.playUntil = now + playMs();
  last = 'game_box:play';
  showBadge(engine);
  changed(engine);
  return true;
}

/** game_box.js onFinishPlayGame. */
export function finishPlay(engine) {
  state.playUntil = 0;
  clearBadge();
  const xp = grantMoodXp(engine.pc, PLAY.xp);
  if (countItem(engine.inv, GAME_BOX) > 0) removeItem(engine.inv, GAME_BOX, 1);
  state.played += 1;
  engine.pushActivity?.({ base: playMessage(), effects: xp ? { xp } : {} });
  engine.toast?.(PLAY.line, 3600);
  const p = engine.player;
  if (p && xp) engine.floatText?.(p.x, p.y - 100, `+${xp} iMG`, 0xffd36b);
  last = 'game_box:played';
  changed(engine);
}

function clearBadge() {
  if (badge && !badge.destroyed) badge.destroy();
  badge = null;
}

function showBadge(engine) {
  clearBadge();
  const { PIXI } = engine;
  const layer = engine.fxLayer || engine.entityLayer;
  if (!PIXI || !layer) return;
  const url = ITEM_CATALOG[GAME_BOX]?.icon || `assets/sprites/icons/${GAME_BOX}.png`;
  badge = new PIXI.Sprite(textureFromUrl(url));
  badge.anchor.set(0.5, 0.5);
  // game_box.js getAssetInfo: 37 x 51.
  badge.width = 37;
  badge.height = 51;
  badge.zIndex = 60;
  badge.eventMode = 'none';
  layer.addChild(badge);
}

function tickBadge(now, engine) {
  if (!badge || badge.destroyed) return;
  const p = engine.player;
  if (!p) return;
  // play_glitch's pc_overlay sat at delta_y -140 above the avatar.
  badge.x = p.x;
  badge.y = p.y - 140 + Math.sin(now / 260) * 4;
}

/* ----------------------------------------------------------------- demo */

function setupDemo(engine) {
  const demo = engine.param?.('swfdemo');
  if (demoDone || !demo) return;
  demoDone = true;
  fast = engine.param?.('swffast') === '1';
  const auto = engine.param?.('swfautoplay') === '1';
  if (demo === 'wrangle') {
    // Two, not three: three at once would make a Game.
    for (const cls of ['swf_1', 'swf_2']) if (countItem(engine.inv, cls) < 1) addItem(engine.inv, cls, 1);
    lastCounts = swfCounts(engine.inv);
    changed(engine);
    if (auto) setTimeout(() => wrangleSwf(engine, 'swf_1'), 1200);
  } else if (demo === 'game') {
    for (const cls of ['swf_1', 'swf_2']) if (countItem(engine.inv, cls) < 1) addItem(engine.inv, cls, 1);
    lastCounts = swfCounts(engine.inv);
    changed(engine);
    setTimeout(() => {
      addItem(engine.inv, 'swf_3', 1);
      engine.refreshPack?.();
    }, 1500);
  } else if (demo === 'play') {
    if (countItem(engine.inv, GAME_BOX) < 1) addItem(engine.inv, GAME_BOX, 1);
    changed(engine);
    if (auto) setTimeout(() => playGame(engine), 1200);
  }
}

/* -------------------------------------------------------------- feature */

export const swfFeature = {
  id: SWF_FEATURE_ID,

  init() {
    ensureItems();
  },

  onStreetEnter(street, engine) {
    ensureItems();
    settleCutGame(engine);
    if (playing()) showBadge(engine);
    setupDemo(engine);
    publish(engine);
  },

  onStreetClear() {
    clearBadge();
  },

  onTick(dtMs, now, engine) {
    if (!engine.started || !engine.inv) return;
    if (!game) {
      const counts = swfCounts(engine.inv);
      if (swfAddedWithSet(lastCounts, counts)) startGame(now, engine);
      lastCounts = counts;
    }
    while (game && now >= game.at) runStage(now, engine);
    if (lockUntil && Date.now() >= lockUntil) {
      lockUntil = 0;
      publish(engine);
    }
    if (state.playUntil && now >= state.playUntil) finishPlay(engine);
    tickBadge(now, engine);
  },

  /** createGlitchGame's overlay is locking: the avatar stands still under it. */
  physics() {
    return Date.now() < lockUntil ? { speed: 0, jump: 0 } : {};
  },

  packVerbs(classTsid, engine) {
    if (isSwf(classTsid)) return swfVerbs(classTsid, engine.inv);
    if (classTsid === GAME_BOX) return gameBoxVerbs(engine.inv, playing());
    return [];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (isSwf(classTsid) && verbId === WRANGLE.id) return wrangleSwf(engine, classTsid) || true;
    if (classTsid === GAME_BOX && verbId === PLAY.id) return playGame(engine) || true;
    return false;
  },

  /** game.js packDropBlockReason: game_box.js verbs.drop conditions. */
  packDropBlockReason(classTsid) {
    return classTsid === GAME_BOX && playing() ? PLAY.noDrop : null;
  },

  save() {
    const out = { ...state };
    out.game = game ? { stage: game.stage, created: game.created, drops: game.drops } : null;
    return out;
  },

  restore(slice) {
    state = normalizeSwfState(slice || {});
    game = null;
    lockUntil = 0;
    lastCounts = null;
  },

  /** Tests. */
  _state() {
    return { state, game, lockUntil, lastCounts, last, badge };
  },
  _reset() {
    state = normalizeSwfState({});
    game = null;
    lockUntil = 0;
    lastCounts = null;
    last = '';
    clearBadge();
    demoDone = false;
    fast = false;
  },
};
