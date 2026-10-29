// G313: quest-rooms/vp-overlay.js joins the street-change cancel (AnnouncementController
// cancelAllOverlaysWeCan 193-215, run from TSMainView.moveMoveStarted 1612 and
// LocationView.dispose 50). cancel() is finish() (AbstractAnnouncementOverlay.as 148-150);
// overlayIsDone drops the locking count (AnnouncementController.as 448-457), so a cancelled
// locking line lets the avatar go, and a sequence stops at a cancelled line. A small fake DOM
// stands in for the page.
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cancelAllOverlays, liveOverlayCount } from '../public/js/overlay-art.js?v=g446-2';
import { advanceVpOverlay, vpOverlay, vpOverlayText, vpSequence } from '../public/js/quest-rooms/vp-overlay.js?v=g446-2';
import { swfFeature } from '../public/js/features/swf-feature.js?v=g446-2';

const saved = {};

function fakeEl() {
  let html = '';
  const node = {
    className: '',
    hidden: false,
    style: {},
    attrs: {},
    children: [],
    paras: [],
    button: null,
    parentElement: null,
    setAttribute(k, v) { node.attrs[k] = v; },
    appendChild(child) { child.parentElement = node; node.children.push(child); return child; },
    get innerHTML() { return html; },
    set innerHTML(v) {
      html = String(v);
      node.paras = (html.match(/<p\b/g) || []).map(() => ({ textContent: '' }));
      node.button = html.includes('<button') ? fakeButton() : null;
    },
    querySelectorAll(sel) { return sel === 'p' ? node.paras : []; },
    querySelector(sel) { return sel === 'button' ? node.button : null; },
  };
  return node;
}

function fakeButton() {
  const listeners = [];
  return {
    addEventListener(type, fn) { if (type === 'click') listeners.push(fn); },
    click() { for (const fn of listeners.splice(0)) fn({ type: 'click' }); },
  };
}

const body = fakeEl();

before(() => {
  for (const k of ['document', 'requestAnimationFrame']) saved[k] = globalThis[k];
  globalThis.document = { body, getElementById: () => null, createElement: () => fakeEl() };
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(0), 0);
});

after(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
});

afterEach(() => {
  cancelAllOverlays();
  swfFeature._reset();
});

const sink = () => {
  const data = {};
  return { data, setData: (k, v) => { data[k] = v; } };
};
const settledWithin = (p, ms = 50) => Promise.race([p.then((v) => ({ v })), new Promise((r) => setTimeout(() => r(null), ms))]);

describe('vp_overlay lines and the street-change cancel (G313)', () => {
  it('registers while it shows and resolves false when a move cancels it', async () => {
    const s = sink();
    const p = vpOverlay(s, { lines: ['What ho! ...'], clickToAdvance: true });
    assert.equal(vpOverlayText(), 'What ho! ...');
    assert.equal(liveOverlayCount(), 1);
    assert.equal(cancelAllOverlays(), 1);
    assert.deepEqual(await settledWithin(p), { v: false });
    assert.equal(vpOverlayText(), '');
    assert.equal(s.data.vpOverlay, '');
    assert.equal(liveOverlayCount(), 0);
  });

  it('resolves true when clicked through, and leaves the cancel list', async () => {
    const p = vpOverlay(sink(), { lines: ['Click me'], clickToAdvance: true });
    assert.ok(advanceVpOverlay());
    assert.deepEqual(await settledWithin(p), { v: true });
    assert.equal(liveOverlayCount(), 0);
    assert.equal(cancelAllOverlays(), 0);
  });

  it('resolves true when a timed line runs out', async () => {
    const p = vpOverlay(sink(), { lines: ['Brief'], durationMs: 300 });
    assert.deepEqual(await settledWithin(p, 600), { v: true });
    assert.equal(liveOverlayCount(), 0);
  });

  it('a line still waiting out its delay_ms never shows once cancelled', async () => {
    const s = sink();
    const p = vpOverlay(s, { lines: ['Later'], durationMs: 3000, delayMs: 40 });
    assert.equal(liveOverlayCount(), 1);
    cancelAllOverlays();
    assert.deepEqual(await settledWithin(p), { v: false });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(vpOverlayText(), '');
    assert.equal(s.data.vpOverlay, undefined);
  });

  it('a cancelled line stops the rest of the sequence', async () => {
    const s = sink();
    const seq = vpSequence(s, [{ lines: ['What ho! ...'], clickToAdvance: true }, { lines: ['... Fireflies!'], durationMs: 2500 }]);
    assert.equal(vpOverlayText(), 'What ho! ...');
    cancelAllOverlays();
    assert.deepEqual(await settledWithin(seq), { v: false });
    assert.equal(vpOverlayText(), '', 'the second line never comes up');
    assert.equal(liveOverlayCount(), 0);
  });

  it('a sequence clicked through runs every line and resolves true', async () => {
    const seq = vpSequence(sink(), [{ lines: ['One'], clickToAdvance: true }, { lines: ['Two'], clickToAdvance: true }]);
    advanceVpOverlay();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(vpOverlayText(), 'Two');
    advanceVpOverlay();
    assert.deepEqual(await settledWithin(seq), { v: true });
  });
});

describe('createGlitchGame: the cancelled locking line lets the avatar go (G313)', () => {
  function fakeEngine() {
    const data = {};
    const dropped = { streets: {} };
    let id = 1;
    const engine = {
      started: true,
      inv: { swf_1: 1, swf_2: 1, swf_3: 0 },
      pc: { mood: 100, moodMax: 100, imagination: 0, xp: 0 },
      player: { x: 500, y: 600 },
      streetTsid: 'GTEST',
      worldW: 3000,
      setData: (k, v) => { data[k] = v; },
      data,
      pushActivity() {}, toast() {}, refreshPack() {}, save() {}, updateHud() {}, floatText() {}, playSound() {},
      param: () => null,
      get droppedItems() { return dropped; },
      droppedItemsChanged() {},
      dropWorldStack(classTsid, count, x, y) {
        const rows = dropped.streets[engine.streetTsid] ||= [];
        const stack = { id: `w${id++}`, classTsid, count, x, y };
        rows.push(stack);
        return { ok: true, stack: { ...stack } };
      },
    };
    return engine;
  }

  it('holds the avatar under the line, and lets go when a street change cancels it', async () => {
    const engine = fakeEngine();
    swfFeature.onTick(100, 0, engine);
    engine.inv.swf_3 = 1;
    swfFeature.onTick(100, 1000, engine);
    swfFeature.onTick(100, 1400, engine);
    assert.deepEqual(swfFeature.physics(), { speed: 0, jump: 0 }, 'locking while it shows');
    assert.match(vpOverlayText(), /\S/);
    cancelAllOverlays();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(swfFeature._state().lockUntil, 0);
    assert.deepEqual(swfFeature.physics(), {});
    assert.equal(engine.data.swfLocked, '');
  });
});

describe('loneliness: the street lines and the invite go at move start (G313)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const GS = join(root, '..', 'glitch-GameServerJS');
  const src = readFileSync(join(root, 'public/js/features/spirit-loneliness-feature.js'), 'utf8');

  it('both register with trackOverlay and let go when they end', () => {
    const show = src.slice(src.indexOf('function showStreetOverlay('), src.indexOf('function hideStreetOverlay('));
    assert.match(show, /streetRelease \|\|= trackOverlay\(\(\) => \{\s*streetRelease = null;\s*hideStreetOverlay\(\);/);
    assert.match(src, /function hideStreetOverlay\(\) \{\s*streetRelease\?\.\(\);/);
    const open = src.slice(src.indexOf('function openInvite('), src.indexOf('function closeInvite('));
    assert.match(open, /inviteRelease \|\|= trackOverlay\(\(\) => \{\s*inviteRelease = null;\s*closeInvite\(\);/);
    assert.match(src, /function closeInvite\(\) \{\s*rt\.invite = null;\s*inviteRelease\?\.\(\);/);
  });

  it('in the source both are vp_overlays', () => {
    const lonely = readFileSync(join(GS, 'items/include/loneliness.js'), 'utf8');
    assert.match(lonely, /function lonelinessShowRaceOverlay\(target\) \{[\s\S]*?type: "vp_overlay",/);
    const annc = readFileSync(join(GS, 'players/inc_announcements.js'), 'utf8');
    const speech = annc.slice(annc.indexOf('function announce_remote_item_speech('), annc.indexOf('function announce_remote_item_state_change('));
    assert.equal((speech.match(/type: 'vp_overlay'/g) || []).length, 2);
    const events = readFileSync(join(GS, 'players/inc_world_events.js'), 'utf8');
    assert.match(events, /this\.announce_remote_item_speech\(source_item\.class_tsid, text, args\)/);
  });
});
