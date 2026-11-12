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
 *   packDropBlockReason query in game.js). Above the avatar plays
 *   play_glitch, Tiny Speck's own overlay (glitch-overlays/play_glitch.fla,
 *   recovered by tools/overlay-art as a 15 fps sheet, register G194; the
 *   Glitch wordmark left out): a little Glitch client loads, "still
 *   loading...", "just a little more...", runs for a moment, then "OOPS
 *   flash crashed". The Game's own icon bobs there only if that sheet
 *   cannot load.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&swfdemo=wrangle|game|play
 *   wrangle: swf_1 and swf_2 in the pack (&swfautoplay=1 wrangles swf_1).
 *   game: swf_1 and swf_2 in the pack, swf_3 arrives 1.5 s later.
 *   play: a Game in the pack (&swfautoplay=1 plays it, &swffast=1 plays for
 *   2.45 s instead of 24.5 s).
 *   Canvas data: swfLast, swfGame (stage), swfGames, swfPlaying (ms left),
 *   swfLocked, swfCounts, swfPlayArt (vector | sheet: the overlay drawn from
 *   its SVG frames on a dense screen, else its 2x sheet).
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=2bd5b93e';
import { grantMoodXp } from '../mood-xp.js?v=958e7680';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js?v=92ec53cd';
import {
  OVERLAY_BASE,
  cellRect,
  defaultOverlayResolution,
  holdVectorTexture,
  loadOverlayManifest,
  overlayAlpha,
  overlayDensity,
  overlayFrameAt,
  standPlacement,
  trackOverlay,
  vectorDensity,
} from '../overlay-art.js?v=a6561207';
import { vpOverlay } from '../quest-rooms/vp-overlay.js?v=2123f2b1';
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
} from '../swf.js?v=6dd72036';

export const SWF_FEATURE_ID = 'swf';

let state = normalizeSwfState({});
/** The running Glitch game: { stage, at, created, drops }. */
let game = null;
let lockUntil = 0;
let lastCounts = null;
let last = '';
let badge = null; // the play_glitch overlay sprite (or the icon stand-in)
let releaseBadge = null; // G311: overlay-art's cancel for the badge
/** G311: the play's overlay was taken down by a move; it is not sent again (the play still runs). */
let badgeGone = false;
let playArt = null; // overlays.json play_glitch, once loaded
let playArtFailed = false;
const playFrames = new Map(); // sheet cell -> Texture
/** The badge's SVG frames on a dense screen (overlay-art vectorTexture: { texture, draw, destroy }), or null. */
let playVector = null;
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
  // takeable_drop 164-167 puts it in at pc.y - 20; it falls to the line under it (game.js dropWorldStack).
  const y = (p?.y ?? engine.groundY ?? 0) - 20;
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
    const lock = Date.now() + GLITCH_GAME.overlay.durationMs;
    lockUntil = lock;
    // G313: a street change cancels the line, and with it the lock (overlayIsDone drops
    // overlay_locker_count, AnnouncementController.as 448-457).
    vpOverlay(engine, { lines: [GLITCH_GAME.overlay.text], durationMs: GLITCH_GAME.overlay.durationMs, topY: GLITCH_GAME.overlay.topY })
      .then((shown) => {
        if (shown === false && lockUntil === lock) {
          lockUntil = 0;
          publish(engine);
        }
      });
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
  badgeGone = false;
  showBadge(engine);
  changed(engine);
  return true;
}

/** game_box.js onFinishPlayGame. */
export function finishPlay(engine) {
  state.playUntil = 0;
  clearBadge();
  badgeGone = false;
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
  releaseBadge?.();
  releaseBadge = null;
  if (badge && !badge.destroyed) badge.destroy();
  badge = null;
  // The canvas, its texture and the decoded frames go with the badge.
  playVector?.destroy();
  playVector = null;
}

/**
 * The 110 px play_glitch box's device px per stage px on this screen, as playSheetOverlay
 * reads it (the renderer's resolution x the layer's scale): over 1.2 x the sheet's 2 texels per
 * stage px (a Retina window draws it at about 2.5), the badge draws the overlay's SVG frames
 * (overlays.json play_glitch.vector) at that density instead (vectorDensity; 0 = the sheet).
 */
function playDensity(layer) {
  if (typeof Image !== 'function' || !playArt?.vector) return 0;
  const layerScale = Math.hypot(layer?.worldTransform?.a ?? 1, layer?.worldTransform?.b ?? 0) || 1;
  return vectorDensity(playArt, overlayDensity(playArt, { wh: 110, resolution: defaultOverlayResolution(), layerScale }));
}

/** Draw the badge from the SVG frames once they are decoded; the sheet if they cannot load. */
function holdPlayVector(PIXI, density) {
  const mine = badge;
  mine.playArt = 'wait';
  holdVectorTexture(PIXI, PLAY_OVERLAY.key, playArt, density).then((tex) => {
    if (badge !== mine || mine.destroyed) {
      tex?.destroy();
      return;
    }
    mine.playArt = tex ? 'vector' : 'sheet';
    if (!tex) return;
    playVector = tex;
    mine.texture = tex.texture;
  }, () => {
    if (badge === mine) mine.playArt = 'sheet';
  });
}

/*
 * G311: play_glitch is a pc_overlay (game_box.js 137-149), so a move takes it down
 * (TSMainView.moveMoveStarted 1612, AnnouncementController.cancelAllOverlaysWeCan 193-215),
 * even while its art is still loading. Nothing sends it again: the play goes on (the item's
 * onFinishPlayGame event, 24.5 s) and pays out wherever you are, with no overlay.
 */
function trackBadge(engine) {
  releaseBadge?.();
  releaseBadge = trackOverlay(() => {
    releaseBadge = null;
    badgeGone = true;
    clearBadge();
    engine.setData?.('swfPlayOverlay', 'cancelled');
  });
}

/** game_box.js 137-149: pc_overlay play_glitch, 110 x 110 box, delta_y -140. */
const PLAY_OVERLAY = Object.freeze({ key: 'play_glitch', dy: -140 });

function playTexture(cellIndex) {
  let t = playFrames.get(cellIndex);
  if (!t) {
    const c = cellRect(playArt, cellIndex);
    t = frameTexture(sourceFromUrl(`${OVERLAY_BASE}${playArt.file}`), new globalThis.PIXI.Rectangle(c.x, c.y, c.w, c.h));
    playFrames.set(cellIndex, t);
  }
  return t;
}

function showBadge(engine) {
  clearBadge();
  if (badgeGone) return;
  // The announcement is live from here, drawn or not (no layer yet, art still loading).
  trackBadge(engine);
  engine.setData?.('swfPlayOverlay', 'playing');
  const { PIXI } = engine;
  const layer = engine.fxLayer || engine.entityLayer;
  if (!PIXI || !layer) return;
  if (!playArt && !playArtFailed) {
    loadOverlayManifest()
      .then((m) => {
        if (!m?.[PLAY_OVERLAY.key]) throw new Error('no play_glitch');
        playArt = m[PLAY_OVERLAY.key];
      })
      .catch(() => {
        playArtFailed = true;
      })
      .finally(() => {
        if (playing() && !badgeGone) showBadge(engine);
      });
  }
  if (playArt) {
    // On a dense screen the SVG frames draw it and the sheet is never fetched (it stays the fallback).
    const density = playDensity(layer);
    badge = new PIXI.Sprite(density > 0 ? PIXI.Texture.EMPTY : playTexture(playArt.order[0]));
    badge.label = 'play_glitch';
    badge.playArt = 'sheet';
    badge.zIndex = 60;
    badge.eventMode = 'none';
    layer.addChild(badge);
    if (density > 0) holdPlayVector(PIXI, density);
    return;
  }
  const url = ITEM_CATALOG[GAME_BOX]?.icon || `assets/sprites/icons/${GAME_BOX}.webp`;
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
  if (badge.label === 'play_glitch' && playArt) {
    // The overlay's own clock: 24.5 s of the 744-frame clip (QA &swffast=1 runs it 10x).
    const ms = ((now - (state.playUntil - playMs())) / playMs()) * PLAY.durationMs;
    const frame = overlayFrameAt(playArt, ms, { loop: false });
    // The SVG frames are numbered on their own (identical frames kept once, play_glitch.vector.order).
    if (playVector) playVector.draw(playArt.vector.order[frame]);
    else if (badge.playArt !== 'wait') badge.texture = playTexture(playArt.order[frame]);
    // A pc_overlay stands on its point (center_bottom, G251): the 110 x 80 stage fitted to 110.
    const at = standPlacement(playArt, p.x, p.y + PLAY_OVERLAY.dy, 110);
    badge.x = at.left;
    badge.y = at.top;
    badge.width = at.width;
    badge.height = at.height;
    badge.alpha = overlayAlpha(ms, PLAY.durationMs);
    engine.setData?.('swfPlayFrame', String(frame));
    engine.setData?.('swfPlayArt', badge.playArt === 'vector' ? 'vector' : badge.playArt === 'wait' ? '' : 'sheet');
    return;
  }
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
    // G311: a move cancelled the overlay and nothing re-sends it; a reload (badgeGone false) draws it again.
    if (playing() && !badgeGone) showBadge(engine);
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
    badgeGone = false;
    demoDone = false;
    fast = false;
  },
};
