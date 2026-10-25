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

const art = () => import('../public/js/overlay-art.js?v=g309-1');
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
