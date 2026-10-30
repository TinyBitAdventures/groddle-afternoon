/**
 * G332: player Snaps, the Camera's snap travel. The pure rules (js/snaps.js)
 * against the source's words and numbers, the multiplayer branch of
 * features/snaps-feature.js on a fake page (the Toy Vendor's Camera, take a
 * picture with, the travel screen: Go there! and Forget it, the wonky
 * timeout, Enter in Camera Mode), that solo is untouched, and the site's
 * half (src/Snaps.php, src/SnapImage.php; skip without it), the picture
 * checks run in PHP when the engine is here.
 * Run: node --test tests/g332-snaps-mp.test.js
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  CAMERA_OFFER, FORGET_RECHARGE_SEC, RECHARGE_BUFF, SNAP_COPY, SNAPSHOTTERY, TRAVEL,
  canSnap, cleanCaption, isSnapStreet, isSnapUrl, snapAuthor, snapPlace, snapStreet, takePictureState, withCamera,
} from '../public/js/snaps.js?v=g332-snaps-1';
import { snapsFeature } from '../public/js/features/snaps-feature.js?v=g478-1';
import { FEATURES } from '../public/js/features/index.js?v=registry-368';
import { HAS_SITE, SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const client = join(root, '..', 'glitch-client', 'com/tinyspeck/engine');
const HAS_GSJS = existsSync(join(gsjs, 'items/camera.js'));
const HAS_CLIENT = existsSync(join(client, 'view/gameoverlay/SnapTravelView.as'));
const site = (f) => readFileSync(join(SITE_DIR, f), 'utf8');

describe('snaps: the rules from the source', () => {
  it('take a picture with: recharging, then dead (camera.js 104-111)', () => {
    assert.deepEqual(takePictureState({}), { enabled: true, reason: '' });
    assert.deepEqual(takePictureState({ recharging: true, dead: true }), { enabled: false, reason: 'You need to wait for your camera to recharge' });
    assert.deepEqual(takePictureState({ dead: true }), { enabled: false, reason: 'The dead have no use for pictures' });
  });

  it('the copy is the source\'s', { skip: !(HAS_GSJS && HAS_CLIENT) && 'source repos not found' }, () => {
    const camera = readFileSync(join(gsjs, 'items/camera.js'), 'utf8');
    for (const s of [SNAP_COPY.recharging, SNAP_COPY.dead, SNAP_COPY.verb, SNAP_COPY.verbTip.replace("'", "'")]) assert.ok(camera.includes(s), s);
    assert.ok(camera.includes("'In Soviet '+pc.location.label+', picture takes you!'"));
    assert.equal(SNAP_COPY.travel('Groddle Meadow'), 'In Soviet Groddle Meadow, picture takes you!');
    const view = readFileSync(join(client, 'view/gameoverlay/SnapTravelView.as'), 'utf8');
    for (const s of [SNAP_COPY.go, SNAP_COPY.forget, SNAP_COPY.someplace, SNAP_COPY.wonky, 'Snapshot taken by: ', SNAP_COPY.byNobody]) assert.ok(view.includes(s), s);
    assert.match(view, /SNAP_SHOW_DELAY_MS:uint = 2000/);
    assert.match(view, /TIMEOUT_MS:uint = 10000/);
    assert.match(view, /IMAGE_PADD:uint = 16/);
    assert.equal(TRAVEL.showDelayMs, 2000);
    assert.equal(TRAVEL.timeoutMs, 10000);
    assert.equal(TRAVEL.framePx, 16);
    const main = readFileSync(join(gsjs, 'main.js'), 'utf8');
    assert.match(main, /function doSnapTravelForget[\s\S]{0,200}buffs_alter_time\('camera_recharging', 0, 15\)/);
    assert.equal(FORGET_RECHARGE_SEC, 15);
    assert.match(main, /function doSnapTravel\(pc, msg\)[\s\S]{0,300}feats_increment\('tottlys_toys', 1\)[\s\S]{0,100}playHitAnimation\('hit1', 1000\)/);
    assert.match(readFileSync(join(gsjs, 'items/catalog_stores.js'), 'utf8'), /class_tsid: "camera",\s*cost: 1100,/);
    assert.equal(CAMERA_OFFER.cost, 1100);
    assert.match(readFileSync(join(gsjs, 'players/player.js'), 'utf8'), /if \(!this\.imagination_has_upgrade\('snapshotting'\)\)\{\s*can_snap = false;\s*disabled_reason = 'Get the Snapshottery upgrade first\.'/);
    assert.equal(SNAP_COPY.needCard, 'Get the Snapshottery upgrade first.');
    const snapView = readFileSync(join(client, 'view/ui/glitchr/GlitchrSnapshotView.as'), 'utf8');
    assert.ok(snapView.includes("label: 'Save snap'") && snapView.includes("'discard'") && snapView.includes('input_submit.maxChars = 500;'));
    assert.ok(readFileSync(join(client, 'view/ui/glitchr/GlitchroidSnapshot.as'), 'utf8').includes(`"${SNAP_COPY.caption}"`));
    const saved = readFileSync(join(client, 'view/ui/glitchr/GlitchrSavedDialog.as'), 'utf8');
    assert.ok(saved.includes(SNAP_COPY.saved) && saved.includes("label: 'Done'"));
    for (const line of Object.values(SNAP_COPY)) if (typeof line === 'string') assert.ok(!line.includes('—'), `no em-dash: ${line}`);
  });

  it('the camera_recharging buff is the source\'s 90 s', () => {
    const buffs = JSON.parse(read('public/assets/content/buffs.json'));
    const buff = (Array.isArray(buffs) ? buffs.find((b) => b.classTsid === RECHARGE_BUFF) : buffs[RECHARGE_BUFF]);
    assert.equal(buff.duration, 90);
    assert.equal(buff.itemClass, 'camera');
  });

  it('Snapshottery lets a player snap', () => {
    assert.equal(canSnap([]), false);
    assert.equal(canSnap(['snapshottery_basic_filter_pack']), false);
    assert.equal(canSnap([SNAPSHOTTERY]), true);
  });

  it('a Snap leads only to an ordinary street the player is really on', () => {
    const on = { realtime: 'LLI32G3NUTD100I', street: 'LLI32G3NUTD100I', dropTsid: 'LLI32G3NUTD100I' };
    assert.equal(snapStreet(on), 'LLI32G3NUTD100I');
    assert.equal(snapStreet({ ...on, realtime: '' }), '', 'offline: the street is not shared');
    assert.equal(snapStreet({ ...on, inHome: true }), '');
    assert.equal(snapStreet({ ...on, transient: true }), '');
    assert.equal(snapStreet({ ...on, dropTsid: 'LLI32G3NUTD100I:floor2' }), '', 'a Tower floor');
    assert.equal(snapStreet({ realtime: 'HOME_57', street: 'HOME_57' }), '');
    assert.equal(snapStreet({ ...on, indexed: () => false }), '');
    assert.equal(isSnapStreet('PARTY_12'), false);
    assert.equal(isSnapStreet('GLI3272LOTD1B1F'), true);
  });

  it('the travel screen\'s lines', () => {
    assert.deepEqual(snapPlace(null), { label: 'Some interesting place', hub: 'Ur' });
    assert.deepEqual(snapPlace({ label: 'Groddle Meadow', hubName: 'Groddle Meadow' }), { label: 'Groddle Meadow', hub: 'Groddle Meadow' });
    assert.equal(snapAuthor({ name: 'Zz Bo' }), 'Snapshot taken by: Zz Bo');
    assert.equal(snapAuthor({}), 'Snapshot by someone, but not sure who');
    assert.equal(cleanCaption('  two\n lines\u0007 '), 'two lines');
    assert.equal([...cleanCaption('x'.repeat(600))].length, 500);
  });

  it('loads only the site\'s own Snap files', () => {
    assert.ok(isSnapUrl('/wp-content/uploads/groddle-snaps/0123456789abcdef01234567.jpg'));
    for (const bad of ['https://evil.example/x.jpg', '/wp-content/uploads/groddle-snaps/../wp-config.php', 'javascript:alert(1)', '/wp-content/uploads/groddle-snaps/0123456789abcdef01234567.php', '//evil.example/wp-content/uploads/groddle-snaps/0123456789abcdef01234567.jpg']) assert.equal(isSnapUrl(bad), false, bad);
  });

  it('the Toy Vendor gains the Camera once', () => {
    const toys = { key: 'toys', label: 'Toy Vendor', buyMultiplier: 0.66, offers: [{ classTsid: 'dice', label: 'Pair of Dice', buyPrice: 550, sellPrice: 363 }] };
    const out = withCamera(toys);
    assert.deepEqual(out.offers.at(-1), { classTsid: 'camera', label: 'Camera', buyPrice: 1100, sellPrice: 726 });
    assert.equal(toys.offers.length, 1, 'the profile itself is not changed');
    assert.equal(withCamera(out), null);
    assert.equal(withCamera({ key: 'produce', offers: [] }), null);
  });
});

/* ------------------------------------------------------------------ */
/* A fake page for the feature                                          */
/* ------------------------------------------------------------------ */

class FakeEl {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.parent = null;
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.value = '';
    this.src = '';
    const cls = new Set();
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) };
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'hidden') this.hidden = true;
    if (k === 'disabled') this.disabled = true;
    if (k === 'id') this.id = String(v);
  }
  append(...kids) { for (const k of kids) { if (k && typeof k === 'object') { k.parent = this; this.children.push(k); } } }
  insertBefore(k) { this.append(k); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, e = {}) { for (const fn of this.listeners[type] || []) fn({ target: this, stopPropagation() {}, preventDefault() {}, ...e }); }
  click() { if (!this.disabled) this.fire('click'); }
  focus() {}
  querySelector(sel) { return this.all().find((n) => matches(n, sel)) || null; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}
const matches = (n, sel) => (sel.startsWith('[') ? Object.hasOwn(n.attrs, sel.slice(1, -1).split('=')[0]) : sel.startsWith('.') ? String(n.attrs.class || '').split(' ').includes(sel.slice(1)) : n.tag === sel);

function fakeDocument() {
  const body = new FakeEl('body');
  const head = new FakeEl('head');
  const gameRoot = new FakeEl('div');
  gameRoot.id = 'game-root';
  const more = new FakeEl('div');
  more.id = 'more-list';
  body.append(gameRoot, more);
  const doc = {
    baseURI: 'https://groddle.localhost/',
    body,
    head,
    createElement: (tag) => new FakeEl(tag),
    createTextNode: (t) => Object.assign(new FakeEl('#text'), { textContent: t }),
    getElementById: (id) => [body, head, ...body.all(), ...head.all()].find((n) => n.id === id) || null,
  };
  return doc;
}

function fakeFetch(routes, calls) {
  return async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    const path = new URL(url).pathname.replace(/^\/wp-json\/groddle\/v1\//, '');
    const answer = routes(path, new URL(url).searchParams, init) || { status: 404, body: { code: 'nope' } };
    return { status: answer.status || 200, ok: (answer.status || 200) < 300, headers: { get: () => null }, json: async () => answer.body, text: async () => '' };
  };
}

function fakeEngine(over = {}) {
  const log = { buffs: [], feats: [], hits: [], enters: [], toasts: [], activity: [], sounds: [], data: {} };
  const engine = {
    mode: 'multiplayer',
    started: true,
    inv: { camera: 1 },
    pc: { imaginationUpgrades: [], level: 7 },
    player: { x: 512.4, y: -88.6 },
    street: { label: 'Hechey Track', hubName: 'Groddle Meadow' },
    streetTsid: 'GLI2V0UN7RD1T2J',
    dropTsid: 'GLI2V0UN7RD1T2J',
    buffs: new Set(),
    hasBuff(id) { return this.buffs.has(id); },
    applyBuff(id, opts = {}) { this.buffs.add(id); log.buffs.push([id, opts]); return { ok: true }; },
    featsIncrement: (id, n) => log.feats.push([id, n]),
    playHit: (h, ms) => log.hits.push([h, ms]),
    enter: async (tsid, opts) => log.enters.push([tsid, opts]),
    travelGate: () => ({ ok: true }),
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    toast: (m) => log.toasts.push(m),
    pushActivity: (m) => log.activity.push(m),
    playSound: (k) => log.sounds.push(k),
    setData: (k, v) => { log.data[k] = v; },
    query: () => null,
    ...over,
  };
  return { engine, log };
}

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };

describe('snaps feature: solo is untouched', () => {
  it('answers nothing outside multiplayer', () => {
    const solo = { mode: 'solo', inv: { camera: 1 } };
    snapsFeature.init(solo);
    assert.deepEqual(snapsFeature.packVerbs('camera', solo), []);
    assert.equal(snapsFeature.runPackVerb('camera', 'take_picture', solo), false);
    assert.equal(snapsFeature.vendorProfile({ key: 'toys', offers: [] }, solo), null);
    assert.equal(snapsFeature.cameraSnap(solo, {}), null);
    assert.equal(snapsFeature.cameraSnapHint(solo, 400), null);
  });

  it('is registered before street-objects; vendorProfile answers chain; the card is dealt only online', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('snaps'));
    assert.ok(ids.indexOf('snaps') < ids.indexOf('street-objects'));
    const game = read('public/game.js');
    assert.match(game, /for \(const feature of features\.features\) \{\s*if \(typeof feature\.vendorProfile === 'function'\) activeVendor = feature\.vendorProfile\(activeVendor, engine\) \|\| activeVendor;/);
    const imagination = read('public/js/features/imagination-feature.js');
    assert.match(imagination, /MULTIPLAYER_OFFERS = new Set\(\[[^\]]*'snapshotting'/);
    assert.doesNotMatch(imagination.match(/MULTIPLAYER_OFFERS = new Set\(\[[^\]]*\]/)[0], /snapshottery_/);
    assert.match(read('build-stores.mjs'), /entry\.class_tsid === 'camera'/, 'solo stores still leave the Camera out');
    const cam = read('public/js/features/camera-mode-feature.js');
    assert.match(cam, /k === 'enter'[^\n]*engine\.query\?\.\('cameraSnap', engine, \{ end: \(\) => setActive\(engine, false\) \}\) === true/);
  });
});

describe('snaps feature: multiplayer', () => {
  let calls;
  let random;
  let saved;
  beforeEach(() => {
    calls = [];
    random = { snap: { id: 7, url: '/wp-content/uploads/groddle-snaps/0123456789abcdef01234567.jpg', street: 'GLI3272LOTD1B1F', x: 900, y: -120, caption: 'hi', owner: { id: 99, name: 'Zz Bo' } } };
    saved = [];
    globalThis.document = fakeDocument();
    globalThis.requestAnimationFrame = (fn) => fn();
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = fakeFetch((path, q, init) => {
      if (path === 'snaps/random') return { body: random };
      if (path === 'snaps' && (init.method || 'GET') === 'POST') { saved.push(JSON.parse(init.body)); return { status: 201, body: { snap: { id: 1, url: '/wp-content/uploads/groddle-snaps/aaaaaaaaaaaaaaaaaaaaaaaa.jpg' }, snaps: [], max: 60 } }; }
      if (path === 'snaps') return { body: { snaps: [], max: 60 } };
      return null;
    }, calls);
    mock.timers.enable({ apis: ['setTimeout'] });
  });
  afterEach(() => {
    mock.timers.reset();
    delete globalThis.document;
    delete globalThis.requestAnimationFrame;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleSnaps;
  });

  const travelEl = () => globalThis.document.getElementById('game-root').children.find((c) => c.attrs['data-snap-travel'] !== undefined);

  it('adds Menu, Snaps and the Toy Vendor\'s Camera', () => {
    const { engine } = fakeEngine();
    snapsFeature.init(engine);
    assert.ok(globalThis.document.getElementById('snaps-btn'));
    const out = snapsFeature.vendorProfile({ key: 'toys', offers: [] }, engine);
    assert.equal(out.offers[0].classTsid, 'camera');
    assert.equal(out.offers[0].buyPrice, 1100);
  });

  it('take a picture with: the screen, a Snap 2 s later, Go there!', async () => {
    const { engine, log } = fakeEngine();
    snapsFeature.init(engine);
    const [verb] = snapsFeature.packVerbs('camera', engine);
    assert.deepEqual([verb.id, verb.label, verb.enabled, verb.tooltip], ['take_picture', 'Take a picture', true, "Doesn't do exactly what it says on the tin"]);
    assert.equal(snapsFeature.runPackVerb('camera', 'take_picture', engine), true);
    const screen = travelEl();
    assert.equal(screen.querySelector('[data-snap-text]').textContent, 'In Soviet Hechey Track, picture takes you!');
    await flush();
    assert.ok(calls.some((c) => c.url.endsWith('snaps/random?exclude=GLI2V0UN7RD1T2J')), 'this street is excluded');
    const img = screen.querySelector('img');
    assert.equal(img.src, random.snap.url);
    img.fire('load');
    assert.equal(log.data.snapStage, 'text');
    mock.timers.tick(2300);
    mock.timers.tick(100);
    assert.equal(log.data.snapStage, 'shown');
    assert.equal(screen.querySelector('[data-snap-author]').textContent, 'Snapshot taken by: Zz Bo');
    assert.equal(screen.querySelector('[data-snap-place]').children[0].textContent, 'Groddle Forest Junction');
    assert.equal(screen.querySelector('[data-snap-place]').children[1].textContent, 'in Ur');
    screen.querySelector('[data-snap-go]').click();
    assert.deepEqual(log.buffs, [['camera_recharging', {}]]);
    assert.deepEqual(log.feats, [['tottlys_toys', 1]]);
    assert.deepEqual(log.hits, [['hit1', 1000]]);
    assert.equal(travelEl(), undefined, 'the screen closes');
    assert.deepEqual(log.enters, []);
    mock.timers.tick(500);
    await flush();
    assert.deepEqual(log.enters, [['GLI3272LOTD1B1F', { spawnX: 900, spawnY: -120 }]]);
  });

  it('Forget it recharges for 15 s; recharging disables the verb', async () => {
    const { engine, log } = fakeEngine();
    snapsFeature.init(engine);
    snapsFeature.runPackVerb('camera', 'take_picture', engine);
    await flush();
    travelEl().querySelector('[data-snap-forget]').click();
    assert.deepEqual(log.buffs, [['camera_recharging', { durationSec: 15 }]]);
    assert.equal(travelEl(), undefined);
    const [verb] = snapsFeature.packVerbs('camera', engine);
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, 'You need to wait for your camera to recharge');
  });

  it('no Snap in 10 s: wonky, no buff', async () => {
    random = { snap: null };
    const { engine, log } = fakeEngine();
    snapsFeature.init(engine);
    snapsFeature.runPackVerb('camera', 'take_picture', engine);
    await flush();
    for (let i = 0; i < 70; i++) mock.timers.tick(200);
    assert.deepEqual(log.activity, ['Your camera seems to have gone all wonky. Give it another try soon.']);
    assert.deepEqual(log.buffs, []);
    assert.equal(travelEl(), undefined);
  });

  it('a Snap from somewhere else is never loaded', async () => {
    random = { snap: { ...random.snap, url: 'https://evil.example/x.jpg' } };
    const { engine } = fakeEngine();
    snapsFeature.init(engine);
    snapsFeature.runPackVerb('camera', 'take_picture', engine);
    await flush();
    assert.equal(travelEl().querySelector('img').src, '');
  });

  it('Enter in Camera Mode needs the card; with it the hint says so', () => {
    const { engine, log } = fakeEngine();
    snapsFeature.init(engine);
    assert.equal(snapsFeature.cameraSnap(engine, {}), true);
    assert.deepEqual(log.toasts, ['Get the Snapshottery upgrade first.']);
    assert.equal(snapsFeature.cameraSnapHint(engine, 400), null, 'without Eyeballery its own line stays');
    assert.match(snapsFeature.cameraSnapHint(engine, Infinity), /Purchase the Snapshottery upgrade/);
    engine.pc.imaginationUpgrades = ['snapshotting'];
    assert.match(snapsFeature.cameraSnapHint(engine, 400), /Enter to snap/);
  });
});

describe('snaps: the site (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  it('declares groddle_snaps and registers the routes, signed-in only', () => {
    const manifest = JSON.parse(site('minn.json'));
    const t = manifest.tables.groddle_snaps;
    assert.ok(t.includes('PRIMARY KEY  (id)') && t.includes('KEY user_id (user_id,created_at)'));
    assert.match(site('src/Extension.php'), /new Snaps\(\$minn\)/);
    const src = site('src/Snaps.php');
    for (const route of ["Method::Get, '/groddle/v1/snaps'", "Method::Post, '/groddle/v1/snaps'", "Method::Delete, '/groddle/v1/snaps/{id:\\d+}'", "Method::Get, '/groddle/v1/snaps/random'"]) {
      assert.ok(src.includes(`#[Route(${route}, policy: new Policy(Access::SignedIn))]`), route);
    }
    assert.match(src, /UPGRADE = 'snapshotting'/);
    assert.match(src, /LEVEL = 5/);
    // The caller is the signed-in reader, never an id from the request; deletes are the owner's only.
    assert.match(src, /\$this->minn->reader->userId/);
    assert.match(src, /DELETE FROM \{\$table\} WHERE id = \? AND user_id = \?/);
    // The random Snap: another player's, not this street, no blocks either way.
    assert.match(src, /s\.user_id <> \? AND s\.street <> '' AND s\.street <> \?/);
    assert.match(src, /i\.user_id = \? AND i\.ignored_id = s\.user_id\) OR \(i\.user_id = s\.user_id AND i\.ignored_id = \?/);
    // Only names it wrote are ever deleted from disk.
    assert.match(src, /FILE = '\/\^\[0-9a-f\]\{24\}\\\.jpg\$\/'/);
    // No WordPress function.
    for (const f of ['src/Snaps.php', 'src/SnapImage.php']) assert.doesNotMatch(site(f), /\b(wp_[a-z_]+|get_option|update_option|esc_[a-z]+|sanitize_[a-z_]+|add_action|add_filter)\(/, f);
  });

  const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  it('checks pictures by their bytes and keeps only a new JPEG (php, when the engine is here)', { skip: !(HAS_SITE && existsSync(join(engineDir, 'src/Minn/Autoloader.php'))) && 'Minn Engine not found (set MINN_ENGINE_DIR)' }, () => {
    const out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/snaps/snap-image.php'), engineDir, SITE_DIR], { encoding: 'utf8' }));
    assert.deepEqual(out, {
      jpeg: 'ok:960x540:image/jpeg:clean',
      png: 'ok:960x540:image/jpeg:clean',
      pngAsJpegDataUrl: 'ok:960x540:image/jpeg:clean',
      jpegAsPngDataUrl: 'ok:960x540:image/jpeg:clean',
      polyglot: 'ok:960x540:image/jpeg:clean',
      gif: 'groddle_snap_type:415',
      html: 'groddle_snap_type:415',
      phpInJpegClothes: 'groddle_snap_image:400',
      truncatedJpeg: 'groddle_snap_image:400',
      trailingJunk: 'groddle_snap_image:400',
      tooSmall: 'groddle_snap_size:400',
      tooWide: 'groddle_snap_size:400',
      bigPngHeader: 'groddle_snap_size:400',
      bigJpegHeader: 'groddle_snap_size:400',
      tooManyBytes: 'groddle_snap_too_large:413',
      notBase64: 'groddle_snap_image:400',
      empty: 'groddle_snap_image:400',
      notString: 'groddle_snap_image:400',
      caption: 'ok:Over the moon :)',
      captionLong: 'groddle_snap_caption:400',
      captionNotText: 'groddle_snap_caption:400',
      street: 'ok:LLI32G3NUTD100I',
      streetPrivate: 'groddle_snap_street:400',
      streetEmpty: 'ok:',
      streetPath: 'groddle_snap_street:400',
      url: '/wp-content/uploads/groddle-snaps/0123456789abcdef01234567.jpg',
    });
  });
});
