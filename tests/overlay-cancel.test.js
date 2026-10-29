// G309: a street change cancels every overlay-art player (AnnouncementController
// cancelAllOverlaysWeCan 193-215, run from TSMainView.moveMoveStarted 1612 and
// LocationView.dispose 50). Browser pieces are stubbed: fetch, Image, Blob URLs,
// a canvas element and requestAnimationFrame.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MANIFEST = {
  test_vector: { kind: 'svg', fla: 'abcdef0123456789', fps: 30, frames: 2, stage: [100, 100], box: [0, 0, 100, 100], file: 'test_vector.frames.json' },
  test_sheet: { kind: 'sheet', fla: 'abcdef0123456789', fps: 30, frames: 2, order: [0, 1], stage: [100, 100], box: [0, 0, 100, 100], file: 'test_sheet.webp' },
};

const saved = {};
let manifestGate = null; // a promise the manifest fetch waits on, when set
const appended = [];

function fakeCanvas() {
  const el = {
    className: '', dataset: {}, width: 0, height: 0, isConnected: false,
    style: { setProperty() {} },
    getContext: () => ({ setTransform() {}, clearRect() {}, drawImage() {} }),
    remove() { el.isConnected = false; },
  };
  return el;
}

function fakeRoot() {
  return { appendChild(el) { el.isConnected = true; appended.push(el); } };
}

before(() => {
  for (const k of ['fetch', 'document', 'Image', 'requestAnimationFrame', 'devicePixelRatio']) saved[k] = globalThis[k];
  saved.createObjectURL = URL.createObjectURL;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('overlays.json')) {
      if (manifestGate) await manifestGate;
      return { ok: true, json: async () => MANIFEST };
    }
    if (u.includes('test_vector.frames.json')) return { ok: true, json: async () => ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<svg xmlns="http://www.w3.org/2000/svg"/>'] };
    return { ok: false, status: 404, json: async () => null };
  };
  URL.createObjectURL = () => 'blob:test';
  globalThis.Image = class { constructor() { this.complete = true; } decode() { return Promise.resolve(); } };
  globalThis.document = { createElement: () => fakeCanvas() };
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 4);
});

after(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (k === 'createObjectURL') URL.createObjectURL = v;
    else if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
});

const art = () => import('../public/js/overlay-art.js?v=g448-1');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('G309 cancelAllOverlays', () => {
  it('stops a playing window overlay: its canvas goes and it resolves null', async () => {
    const { cancelAllOverlays, liveOverlayCount, playVectorOverlay } = await art();
    const p = playVectorOverlay(fakeRoot(), 'test_vector', { rect: { left: 0, top: 0, width: 200, height: 100 }, durationMs: 60000 });
    for (let i = 0; i < 50 && !appended.length; i += 1) await wait(5);
    const canvas = appended.at(-1);
    assert.ok(canvas?.isConnected, 'the overlay is on screen');
    assert.equal(liveOverlayCount(), 1);
    assert.equal(cancelAllOverlays(), 1);
    assert.equal(canvas.isConnected, false);
    assert.equal(await p, null);
    assert.equal(liveOverlayCount(), 0);
  });

  it('a window overlay still loading when the street changes never shows', async () => {
    const { cancelAllOverlays, playVectorOverlay } = await art();
    const before = appended.length;
    // test_vector's frames are cached by now; a second key keeps it loading.
    MANIFEST.test_vector_2 = { ...MANIFEST.test_vector, file: 'test_vector.frames.json' };
    let open;
    manifestGate = new Promise((r) => { open = r; });
    const p = playVectorOverlay(fakeRoot(), 'test_vector_2', { rect: { left: 0, top: 0, width: 200, height: 100 } });
    cancelAllOverlays();
    open();
    manifestGate = null;
    assert.equal(await p, null);
    assert.equal(appended.length, before);
  });

  it('a played-out window overlay still resolves true', async () => {
    const { playVectorOverlay } = await art();
    const ok = await playVectorOverlay(fakeRoot(), 'test_vector', { rect: { left: 0, top: 0, width: 200, height: 100 }, durationMs: 30, fade: { inMs: 0, outMs: 0 } });
    assert.equal(ok, true);
  });

  it('cancels a street sheet overlay: cancelled, not stopped, done false', async () => {
    const { cancelAllOverlays, liveOverlayCount, playSheetOverlay } = await art();
    let open;
    manifestGate = new Promise((r) => { open = r; });
    const PIXI = { Sprite: class {} };
    const h = playSheetOverlay(PIXI, 'test_sheet', { layer: { destroyed: false, addChild() {} }, at: () => ({ x: 0, y: 0 }) });
    assert.equal(liveOverlayCount(), 1);
    assert.equal(cancelAllOverlays(), 1);
    open();
    manifestGate = null;
    assert.equal(await h.done, false);
    assert.equal(h.cancelled, true);
    // stop() is the caller's: potions-feature replays an indicator that was not stopped (GSJS sends them again on arrival).
    assert.equal(h.stopped, false);
    assert.equal(liveOverlayCount(), 0);
  });

  it('a stopped sheet overlay leaves the live set', async () => {
    const { liveOverlayCount, playSheetOverlay } = await art();
    const h = playSheetOverlay({ Sprite: class {} }, 'missing_key', { layer: { destroyed: false, addChild() {} }, at: () => ({ x: 0, y: 0 }) });
    h.stop();
    assert.equal(await h.done, false);
    assert.equal(liveOverlayCount(), 0);
  });

  it('game.js cancels where a street change starts (endStreetOverlays)', () => {
    const src = readFileSync(join(root, 'public/game.js'), 'utf8');
    const body = src.slice(src.indexOf('function endStreetOverlays('), src.indexOf('function enterHeldBy('));
    assert.match(body, /cancelAllOverlays\(\)/);
    assert.match(src, /import \{[^}]*cancelAllOverlays[^}]*\} from '\.\/js\/overlay-art\.js\?v=/);
  });

  it('the race win rainbow draws no stand-in arc once cancelled', () => {
    const src = readFileSync(join(root, 'public/js/race-render.js'), 'utf8');
    assert.match(src, /!h\.stopped && !h\.cancelled\) c\.addChild\(drawWinnerArc/);
  });
});

/*
 * G311: players with their own loops join the same cancel (overlay-art trackOverlay): the
 * loneliness fireworks (vp_overlay, loneliness.js 355-430), Señor Funpickle's sneeze and the
 * Game's play_glitch (pc_overlay). The game splash is not an overlay and the source keeps it.
 */
const GS = join(root, '..', 'glitch-GameServerJS');
const CLIENT = join(root, '..', 'glitch-client');

describe('G311 players outside overlay-art', () => {
  it('trackOverlay: cancel runs once at the street change; release() leaves the set', async () => {
    const { cancelAllOverlays, liveOverlayCount, trackOverlay } = await art();
    cancelAllOverlays();
    let calls = 0;
    const release = trackOverlay(() => { calls += 1; });
    const kept = trackOverlay(() => { calls += 10; });
    assert.equal(liveOverlayCount(), 2);
    release();
    assert.equal(liveOverlayCount(), 1);
    assert.equal(cancelAllOverlays(), 1);
    assert.equal(calls, 10);
    kept(); // releasing after the cancel is harmless
    assert.equal(cancelAllOverlays(), 0);
    assert.equal(calls, 10);
  });

  it('a firework under the fx layer stops when the street changes and resolves null', async () => {
    const { cancelAllOverlays, liveOverlayCount } = await art();
    const { fireworksUnder } = await import('../public/js/features/spirit-loneliness-feature.js?v=g448-1');
    cancelAllOverlays();
    const sprites = [];
    const PIXI = {
      Texture: { from: () => ({ destroy() {}, source: { update() {} } }) },
      Sprite: class {
        constructor() { this.visible = true; this.destroyed = false; sprites.push(this); }
        destroy() { this.destroyed = true; }
      },
    };
    const engine = { PIXI, fxLayer: { destroyed: false, addChildAt() {} }, camera: { x: 0, y: 0 } };
    const vp = { width: 960, height: 540, scale: 1 };
    const p = fireworksUnder(engine, { key: 'test_vector', x: 0.5, y: 0.75 }, vp, 60000);
    for (let i = 0; i < 50 && !sprites.length; i += 1) await wait(5);
    assert.equal(sprites.length, 1, 'playing');
    assert.equal(liveOverlayCount(), 1);
    assert.equal(cancelAllOverlays(), 1);
    assert.equal(sprites[0].visible, false);
    assert.equal(await p, null);
    assert.equal(sprites[0].destroyed, true);
    assert.equal(liveOverlayCount(), 0);
    // GSJS: each firework is a vp_overlay sent to the street.
    const lonely = readFileSync(join(GS, 'items/include/loneliness.js'), 'utf8');
    assert.match(lonely, /function lonelinessEndPartyOverlay\(stage\) \{\s*switch\(stage\) \{\s*case 0:\s*this\.container\.apiSendAnnouncement\(\{\s*type: 'vp_overlay',/);
  });

  it('funpickle and swf register their own loops; the splash stays out (a view, not an overlay)', () => {
    const funpickle = readFileSync(join(root, 'public/js/features/funpickle-feature.js'), 'utf8');
    assert.match(funpickle, /mine\.release = trackOverlay\(/);
    assert.match(funpickle, /function clearOverlay\(\) \{\s*overlay\?\.release\?\.\(\);/);
    const swf = readFileSync(join(root, 'public/js/features/swf-feature.js'), 'utf8');
    assert.match(swf, /releaseBadge = trackOverlay\(/);
    assert.match(readFileSync(join(GS, 'items/game_box.js'), 'utf8'), /type: 'pc_overlay',\s*swf_url: overlay_key_to_url\('play_glitch'\),/);
    // GameSplashScreenView is a BaseSplashScreenView (an AbstractTSView), not one of the pools
    // cancelAllOverlaysWeCan empties; it closes only from its own buttons (onButtonClick, onDoneClick).
    const base = readFileSync(join(CLIENT, 'com/tinyspeck/engine/view/gameoverlay/BaseSplashScreenView.as'), 'utf8');
    assert.match(base, /class BaseSplashScreenView extends AbstractTSView/);
    const ac = readFileSync(join(CLIENT, 'com/tinyspeck/engine/control/engine/AnnouncementController.as'), 'utf8');
    const cancelAll = ac.slice(ac.indexOf('public function cancelAllOverlaysWeCan'), ac.indexOf('public function hideOverlaysForUserSnap'));
    assert.doesNotMatch(cancelAll, /Splash/);
    assert.doesNotMatch(readFileSync(join(root, 'public/js/game-splash.js'), 'utf8'), /trackOverlay/);
  });

  it('the Game of Crowns tip is a 3 s vp_overlay and the HUD goes before the splash', async () => {
    const games = readFileSync(join(GS, 'players/inc_games.js'), 'utf8');
    const tips = [...games.matchAll(/uid: "it_game_tip",\s*type: "vp_overlay",\s*duration: (\d+),/g)].map((m) => Number(m[1]));
    assert.ok(tips.length >= 4);
    const { CROWNS_TIP_MS } = await import('../public/js/features/crowns-feature.js?v=g448-1');
    assert.ok(tips.every((ms) => ms === CROWNS_TIP_MS));
    assert.match(games, /function games_end_it_game\(\)\{[\s\S]*?this\.games_it_dismiss_overlays\(\);/);
    const crowns = readFileSync(join(root, 'public/js/features/crowns-feature.js'), 'utf8');
    const finish = crowns.slice(crowns.indexOf('function finish('), crowns.indexOf('async function leave('));
    assert.match(finish, /clearTip\(\);\s*hud\.bar\.hidden = true;/);
    assert.match(crowns, /tipTimer = setTimeout\(clearTip, CROWNS_TIP_MS\);/);
  });
});
