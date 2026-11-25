/**
 * G1286 (Austin 2026-11-25, a house file loaded in solo: "I wasn't able to take a photo of the inside.
 * Is that an issue with solo mode? Pressing C showed the camera, but pressing enter to take a shot
 * started to interact with the items, like the machine tools").
 *
 * Cause: features/camera-mode-feature.js kept Enter only when snaps-feature answered `cameraSnap`,
 * which it did in multiplayer only, so solo's Enter (and online's without a session) went on to the
 * game's Enter: the nearest thing's menu.
 *
 * Glitch: Camera Mode took the focus (glitch-client CameraMan.as startUserMode 420-423), so
 * TSMainView.blur (538-559) stopped LocationInputHandler (stopListeningForControlEvts 115-131): no
 * street click, no ENTER, no number keys 1-5 (stopListeningForKeyEvts 149-163); CameraMan's own
 * Enter snapped (onEnterKey 679-683).
 *
 * - Camera Mode keeps Enter, E, the Menu key and the emote keys from the street, solo and online.
 * - A phone's Act (a scripted Enter, touchAct) does nothing while looking.
 * - Solo snaps: Enter takes the Snap and offers Download (a blob: link) and Close; Shift+Enter at
 *   home the whole house; the card rule is online's, and a house file's practice copy has the card.
 *
 * Run: node --test tests/g1286-camera-solo-snap.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cameraKey } from '../public/js/features/camera-mode-feature.js?v=9df0576f';
import { cameraModeFeature } from '../public/js/features/camera-mode-feature.js?fresh=g1286';
import { snapsFeature } from '../public/js/features/snaps-feature.js?fresh=g1286';
import { SNAP_COPY, snapFileName } from '../public/js/snaps.js?v=b5be8bff';
import { remakeStatus, isOfferedInRemake } from '../public/js/imagination-remake.js?v=99997003';
import { HOUSE_FILE_SNAP_NOTE, grantPracticeSnapshottery, showHouseFileReport } from '../public/js/house-file-loader.js?v=b55d31ac';
import { roomPieces } from '../public/js/home-wallpaper.js?v=a882fa38';
import { createHomeDecorState, INTERIOR } from '../public/js/home-decor.js?v=adc6b830';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, '..', f), 'utf8');

/* ------------------------------------------------------------------ */
/* Which keys Camera Mode keeps                                         */
/* ------------------------------------------------------------------ */

describe('cameraKey: the keys Camera Mode keeps from the street', () => {
  it('Enter snaps, Shift+Enter snaps the whole house', () => {
    assert.equal(cameraKey({ key: 'Enter' }), 'snap');
    assert.equal(cameraKey({ key: 'Enter', shiftKey: true }), 'whole');
  });
  it('E, the Menu key, Shift+F10 and the emote keys 1-5 are held (LocationInputHandler.as 134-163)', () => {
    for (const e of [{ key: 'e' }, { key: 'E' }, { key: 'ContextMenu' }, { key: 'F10', shiftKey: true },
      { key: '1' }, { key: '5' }, { key: 'End', code: 'Numpad1' }, { key: '!', code: 'Digit1', shiftKey: true }]) {
      const want = e.shiftKey && e.key !== 'F10' ? null : 'held';
      assert.equal(cameraKey(e), want, JSON.stringify(e));
    }
  });
  it('a phone\'s Act (its scripted Enter) is held: it never snaps or acts while looking', () => {
    assert.equal(cameraKey({ key: 'Enter', touchAct: true }), 'held');
  });
  it('other keys go on (the map, panels, browser shortcuts)', () => {
    for (const e of [{ key: 'm' }, { key: '6' }, { key: 'x' }, { key: 'Enter', ctrlKey: true }, { key: 'e', metaKey: true }, { key: 'Tab' }]) {
      assert.equal(cameraKey(e), null, JSON.stringify(e));
    }
  });
});

/* ------------------------------------------------------------------ */
/* Camera Mode on a fake window: the game's own Enter never runs        */
/* ------------------------------------------------------------------ */

/** A window whose keydown runs capture listeners first, then the rest, as a real one at its target. */
function fakeWindow() {
  const capture = [];
  const bubble = [];
  return {
    addEventListener(type, fn, opts) {
      if (type !== 'keydown') return;
      ((opts === true || opts?.capture) ? capture : bubble).push(fn);
    },
    removeEventListener() {},
    key(init) {
      const e = {
        ...init,
        target: init.target || null,
        prevented: false,
        stopped: false,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; },
        stopPropagation() { this.stopped = true; },
      };
      for (const fn of [...capture, ...bubble]) {
        if (e.stopped) break;
        fn(e);
      }
      return e;
    },
  };
}

function cameraEngine(mode, { snap = null } = {}) {
  const log = { snaps: 0, data: {} };
  const engine = {
    mode,
    learnedSkills: [],
    camera: { x: 0, w: 960 },
    worldW: 3000,
    busy: () => false,
    acting: () => false,
    setCameraLook() {},
    setData: (k, v) => { log.data[k] = v; },
    playSound() {},
    param: () => null,
    query(hook) {
      if (hook === 'cameraSnap') {
        log.snaps += 1;
        return snap;
      }
      return null;
    },
  };
  return { engine, log };
}

describe('Camera Mode keeps Enter from the street (fake window)', () => {
  const win = fakeWindow();
  const acts = [];
  globalThis.window = win;
  // The game's own keydown (game.js: Enter / E open the nearest thing's menu), added after the feature's.
  let current = null;
  try {
    current = cameraEngine('solo');
    cameraModeFeature.init(current.engine);
  } finally {
    delete globalThis.window;
  }
  win.addEventListener('keydown', (e) => acts.push(e.key));

  for (const mode of ['solo', 'multiplayer']) {
    it(`${mode}: Enter in Camera Mode asks for a Snap and never reaches the game's Act`, () => {
      const { engine, log } = cameraEngine(mode);
      // The feature holds the engine it was given at init; the hooks it asks read through it.
      Object.assign(current.engine, { mode, query: engine.query });
      acts.length = 0;
      win.key({ key: 'c' });
      assert.equal(current.log.data.cameraMode, '1');
      const enter = win.key({ key: 'Enter' });
      assert.equal(enter.stopped, true);
      assert.equal(enter.prevented, true);
      assert.equal(log.snaps, 1, 'the Snap is asked for');
      // Even with no Snap to take (no card, no session), the street never hears it.
      for (const key of ['e', '1', 'ContextMenu']) assert.equal(win.key({ key }).stopped, true, key);
      win.key({ key: 'Enter', repeat: true });
      assert.equal(log.snaps, 1, 'a held Enter takes one Snap');
      assert.deepEqual(acts, [], 'the game\'s Enter / E / emote keys never ran');
      win.key({ key: 'Escape' });
      assert.equal(current.log.data.cameraMode, '0');
      win.key({ key: 'Enter' });
      assert.deepEqual(acts, ['Enter'], 'out of Camera Mode, Enter works the street again');
    });
  }

  it('a phone\'s Act press does nothing while looking (no Snap, no Act)', () => {
    const { engine, log } = cameraEngine('solo');
    Object.assign(current.engine, { mode: 'solo', query: engine.query });
    acts.length = 0;
    win.key({ key: 'c' });
    const act = win.key({ key: 'Enter', touchAct: true, isTrusted: false });
    assert.equal(act.stopped, true);
    assert.equal(log.snaps, 0);
    assert.deepEqual(acts, []);
    win.key({ key: 'c' });
    assert.equal(current.log.data.cameraMode, '0');
  });

  it('a focused button keeps its own Enter (no Snap), and the street still never hears it', () => {
    const { engine, log } = cameraEngine('solo');
    Object.assign(current.engine, { mode: 'solo', query: engine.query });
    acts.length = 0;
    win.key({ key: 'c' });
    const button = { closest: (sel) => (sel === 'button, a[href]' ? button : null) };
    const e = win.key({ key: 'Enter', target: button });
    assert.equal(e.stopped, true);
    assert.equal(e.prevented, false, 'the button\'s own click still happens');
    assert.equal(log.snaps, 0);
    assert.deepEqual(acts, []);
    win.key({ key: 'Escape' });
  });

  it('the phone hides Act and the stick while looking; a tap on the street never acts (#271, #500)', () => {
    assert.match(read('public/style.css'), /:root\.touch-phone\.camera-mode-on \.touch-controls \{ display: none; \}/);
    assert.match(read('public/game.js'), /if \(features\.query\('cameraModeActive', engine\) === true\) return;/);
  });
});

/* ------------------------------------------------------------------ */
/* Solo snaps to the device (fake page)                                 */
/* ------------------------------------------------------------------ */

function fakeCanvas(w = 0, h = 0) {
  return {
    width: w,
    height: h,
    getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(v) {}, set imageSmoothingEnabled(v) {}, set imageSmoothingQuality(v) {} }),
    toDataURL: () => `data:image/jpeg;base64,${'A'.repeat(4000)}`,
  };
}

class FakeEl {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.parent = null;
    this.textContent = '';
    this.disabled = false;
    this.style = {};
    const cls = new Set();
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) };
    if (tag === 'canvas') Object.assign(this, fakeCanvas());
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; }
  append(...kids) { for (const k of kids) if (k && typeof k === 'object') { k.parent = this; this.children.push(k); } }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() {
    const e = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    if (!this.disabled) for (const fn of this.listeners.click || []) fn(e);
    return e;
  }
  dispatchKey(key) { for (const fn of this.listeners.keydown || []) fn({ key, target: this, stopPropagation() {} }); }
  focus() {}
  querySelector(sel) { return this.all().find((n) => matches(n, sel)) || null; }
  querySelectorAll(sel) { return this.all().filter((n) => matches(n, sel)); }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}

function matches(n, sel) {
  if (sel.startsWith('[')) {
    const [k, v] = sel.slice(1, -1).split('=');
    return Object.hasOwn(n.attrs, k) && (v === undefined || n.attrs[k] === v.replace(/"/g, ''));
  }
  if (sel.startsWith('.')) return String(n.attrs.class || '').split(' ').includes(sel.slice(1));
  return n.tag === sel;
}

function fakePage() {
  const body = new FakeEl('body');
  const head = new FakeEl('head');
  const gameRoot = new FakeEl('div');
  gameRoot.id = 'game-root';
  body.append(gameRoot);
  const fetched = [];
  globalThis.document = {
    baseURI: 'https://groddle.localhost/play/',
    body,
    head,
    createElement: (tag) => new FakeEl(tag),
    getElementById: (id) => [body, head, ...body.all(), ...head.all()].find((n) => n.id === id) || null,
  };
  globalThis.requestAnimationFrame = (fn) => fn();
  globalThis.fetch = async (url) => { fetched.push(String(url)); throw new Error('no network in solo'); };
  return {
    body,
    fetched,
    done() {
      for (const k of ['document', 'requestAnimationFrame', 'fetch', 'groddleSnaps']) delete globalThis[k];
    },
  };
}

function floorsOf(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const state = createHomeDecorState({ layout: 'house', wallSegments: 7 });
    const room = roomPieces(state, { floorY: INTERIOR.floorY, leftOpen: i === 0 });
    out.push({ index: i, top: room.top, bottom: room.bottom, bound: room.bound, pitch: room.pitch, width: room.width, x0: i === 0 ? 600 : 0, live: i === 0 });
  }
  return out;
}

/** A solo engine standing in its own house (homes-feature homeShotSource answers its floors). */
function soloEngine({ card = true, ctx = { inHome: true, owned: true, room: 'interior' } } = {}) {
  const log = { toasts: [], data: {}, ended: 0 };
  const world = { children: [], x: -100, y: -50 };
  const floors = floorsOf(2).map((f) => (f.live ? f : { ...f, build: () => ({ children: [], destroy() {} }) }));
  const engine = {
    mode: 'solo',
    worldW: 2670,
    entityLayer: { parent: world },
    viewAt(frame, fn) {
      const was = { x: world.x, y: world.y };
      world.x = -frame.x;
      world.y = -frame.y;
      try { return fn(); } finally { world.x = was.x; world.y = was.y; }
    },
    homeShotIo: {
      read: (container, opts) => fakeCanvas(Math.round(opts.width * opts.resolution), Math.round(opts.height * opts.resolution)),
      canvas: (w, h) => fakeCanvas(w, h),
    },
    viewWidth: 960,
    renderer: { resolution: 1 },
    street: { label: 'Groddle Meadow' },
    pc: { imaginationUpgrades: card ? ['snapshotting'] : [] },
    player: { x: 700, y: 620 },
    homeContext: () => ctx,
    snapshotView: () => fakeCanvas(960, 540),
    toast: (m) => log.toasts.push(m),
    playSound() {},
    setData: (k, v) => { log.data[k] = v; },
    query(hook) {
      if (hook === 'homeShotSource') return { kind: 'house', width: floors[0].width, floors };
      return null;
    },
  };
  return { engine, log, end: () => { log.ended += 1; } };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('solo snaps save to the device (fake page)', () => {
  it('the hint under "Camera Mode" says Enter saves to your device; no card is online\'s line', () => {
    const page = fakePage();
    try {
      const { engine } = soloEngine();
      snapsFeature.init(engine);
      assert.equal(snapsFeature.cameraSnapHint(engine, Infinity), SNAP_COPY.hintDevice);
      assert.match(SNAP_COPY.hintDevice, /Enter saves a snap to your device/);
      assert.equal(snapsFeature.cameraSnapHint(engine, 400), SNAP_COPY.hintDeviceStreet);
      const none = soloEngine({ card: false }).engine;
      assert.equal(snapsFeature.cameraSnapHint(none, Infinity), SNAP_COPY.hintNoCard, 'the same card rule as online');
      assert.equal(snapsFeature.cameraSnapHint(none, 400), null);
      // The Camera item and its travel stay online.
      assert.deepEqual(snapsFeature.packVerbs('camera', { ...engine, inv: { camera: 1 } }), []);
      assert.equal(snapsFeature.vendorProfile({ key: 'toys', offers: [] }, engine), null);
      assert.equal(page.body.querySelector('#snaps-btn'), null, 'no Menu Snaps (no album) in solo');
    } finally {
      page.done();
    }
  });

  it('Enter: the Snap, then Download (a blob: JPEG named as the client named it) and Close; nothing uploaded', async () => {
    const page = fakePage();
    try {
      const { engine, log, end } = soloEngine();
      snapsFeature.init(engine);
      assert.equal(snapsFeature.cameraSnap(engine, { end }), true);
      await wait(150);
      assert.equal(log.data.snapDialog, 'open');
      const link = page.body.querySelector('[data-snap-download]');
      assert.ok(link, 'Download');
      assert.equal(link.tag, 'a');
      assert.ok(page.body.querySelector('[data-snap-close]'), 'Close');
      assert.equal(page.body.querySelector('[data-snap-save]'), null, 'no Save snap: there is no album');
      assert.equal(page.body.querySelector('[data-snap-caption]'), null);
      assert.match(link.getAttribute('download'), /^Groddle_Meadow_\d{4}_\d{2}_\d{2}-\d{2}_\d{2}_\d{2}\.jpg$/);
      const click = link.click();
      assert.equal(click.defaultPrevented, false, 'the link\'s own click saves the file');
      assert.match(link.getAttribute('href'), /^blob:/);
      assert.equal(log.data.snapDialog, 'downloaded');
      assert.equal(log.data.snapFile, link.getAttribute('download'));
      assert.equal(log.ended, 1, 'leaves Camera Mode, as a save does online');
      assert.deepEqual(page.fetched, [], 'no upload, no account');
      page.body.querySelector('[data-snap-close]').click();
      assert.equal(log.data.snapDialog, 'closed');
      assert.equal(page.body.querySelector('[data-snap-dialog]'), null);
      await wait(1100);
    } finally {
      page.done();
    }
  });

  it('without the card: the online line, no picture', () => {
    const page = fakePage();
    try {
      const { engine, log } = soloEngine({ card: false });
      snapsFeature.init(engine);
      assert.equal(snapsFeature.cameraSnap(engine, {}), true);
      assert.deepEqual(log.toasts, [SNAP_COPY.needCard]);
      assert.equal(log.data.snapsLast, 'no-card');
      assert.equal(snapsFeature.cameraWholeLabel(engine), null);
    } finally {
      page.done();
    }
  });

  it('Shift+Enter at home: the whole house, then Download', async () => {
    const page = fakePage();
    try {
      const { engine, log, end } = soloEngine();
      snapsFeature.init(engine);
      assert.equal(snapsFeature.cameraWholeLabel(engine), 'Snap the whole house');
      assert.equal(await snapsFeature.cameraWholeSnap(engine, { end }), true);
      assert.equal(log.data.snapsLast, 'whole:house:2');
      await wait(150);
      assert.equal(log.data.snapDialog, 'open');
      const link = page.body.querySelector('[data-snap-download]');
      link.click();
      assert.match(link.getAttribute('href'), /^blob:/);
      assert.equal(log.data.snapDialog, 'downloaded');
      assert.deepEqual(page.fetched, []);
      page.body.querySelector('[data-snap-dialog]').dispatchKey('Escape');
      assert.equal(log.data.snapDialog, 'closed', 'Esc closes it');
      await wait(1100);
    } finally {
      page.done();
    }
  });

  it('the file name follows CameraMan.as 541 and StringUtil.getUrlDate', () => {
    assert.equal(snapFileName('Groddle Meadow', new Date(2026, 10, 25, 9, 5, 3)), 'Groddle_Meadow_2026_11_25-09_05_03.jpg');
    assert.equal(snapFileName('a/b: c?', new Date(2026, 0, 2, 3, 4, 5)), 'ab_c_2026_01_02-03_04_05.jpg');
    assert.match(snapFileName('', new Date(2026, 0, 1)), /^Snap_2026_01_01-/);
  });
});

/* ------------------------------------------------------------------ */
/* The card                                                             */
/* ------------------------------------------------------------------ */

describe('the Snapshottery card in solo', () => {
  it('solo deals the card and its filter packs (the same card rule as online)', () => {
    for (const id of ['snapshotting', 'snapshottery_basic_filter_pack', 'snapshottery_filter_pack_1', 'snapshottery_filter_pack_2', 'snapshottery_filter_pack_3']) {
      assert.equal(isOfferedInRemake(id), true, id);
    }
    assert.match(remakeStatus('snapshotting').note, /solo they save to your device/);
  });

  it('a house file\'s practice copy is given the card (and only a practice copy)', () => {
    const grants = [];
    const features = { get: (id) => (id === 'imagination' ? { grantTutorialUpgrade: (cid, eng) => { grants.push(cid); eng.pc.imaginationUpgrades.push(cid); return true; } } : null) };
    let saved = 0;
    const engine = { pc: { imaginationUpgrades: [] }, save: () => { saved += 1; } };
    assert.equal(grantPracticeSnapshottery({ engine, features, practice: false }), false, 'never a real save');
    assert.deepEqual(grants, []);
    assert.equal(grantPracticeSnapshottery({ engine, features, practice: true }), true);
    assert.deepEqual(engine.pc.imaginationUpgrades, ['snapshotting']);
    assert.equal(saved, 1);
    assert.equal(grantPracticeSnapshottery({ engine, features, practice: true }), false, 'once');
    const src = read('public/js/house-file-loader.js');
    assert.match(src, /applyHouse\(built, \{ engine, features, homeState, imagineHome, url: req\.url \}\);\n  const snapCard = grantPracticeSnapshottery\(\{ engine, features \}\);/);
    assert.match(src, /grantPracticeSnapshottery\(\{ engine, features \}\);\n    engine\?\.setData\?\.\('houseFile', 'kept'\);/, 'a reload of the copy has it too');
  });

  it('the house file report says so', () => {
    const page = fakePage();
    try {
      const box = showHouseFileReport(globalThis.document, { title: 'Test', summary: '3 pieces', note: HOUSE_FILE_SNAP_NOTE });
      assert.ok(box.children.some((c) => c.textContent === HOUSE_FILE_SNAP_NOTE));
      assert.match(HOUSE_FILE_SNAP_NOTE, /press C, then Enter/);
    } finally {
      page.done();
    }
  });
});
