/**
 * G1240 (players, chat 11-24: snaps were "very wee"; Austin 2026-11-24): Snaps at full size, a
 * full-size viewer, the saved dialog's links, and profile Snaps that are private until made public.
 * Glitch's saved dialog gave the photo's page, a download and a short URL (glitch-client
 * GlitchrSavedDialog.as 160-225, startWithParameters 165-169) and Snaps lived on the profile.
 *
 * - The capture size (js/snaps.js snapResolution, snapSteps; features/snaps-feature.js drawSnap): the
 *   view at the renderer's own resolution, up to the site's 1920x1200, smaller only to fit 1 MB.
 * - The viewer's pure helpers (viewerStep, viewerActions, savedActions) and the viewer itself on a fake
 *   page: opens from a card, Previous and Next and the arrow keys, Escape, the actions for a public and a
 *   private Snap, Make public, Delete's confirm step, and no Go there (Austin 2026-11-24).
 * - The site (groddle-afternoon-site src/Snaps.php, src/PlayerPages.php) on a throwaway MariaDB
 *   database (tests/fixtures/snaps/snaps-routes.php): a new Snap is private, the owner toggles it, the
 *   profile lists public ones only, a private Snap's picture, page and download answer only its owner,
 *   the Camera's random Snap is public only, old file names are replaced.
 *
 * Run: node --test tests/g1240-snaps-full.test.js (GRODDLE_SITE_DIR for a site worktree; MariaDB as
 * tests/floor-merge.test.js finds it).
 */
import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  SNAP_MAX_H, SNAP_MAX_W, SNAP_QUALITY, SNAP_QUALITY_LOW, SNAP_WIDTHS,
  isSnapUrl, savedActions, snapResolution, snapShareUrl, snapSteps, viewerActions, viewerStep,
} from '../public/js/snaps.js?v=b5be8bff';
import { snapsFeature } from '../public/js/features/snaps-feature.js?fresh=g1240';
import { GAME_DIR, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const site = (f) => readFileSync(join(SITE_DIR, f), 'utf8');
const HAS_SITE = existsSync(join(SITE_DIR, 'src/Snaps.php'));

/* ------------------------------------------------------------------ */
/* The capture size                                                     */
/* ------------------------------------------------------------------ */

describe('a Snap is taken at the view\'s own pixels, up to the site\'s 1920x1200', () => {
  it('the renderer\'s resolution, capped by the site\'s widest', () => {
    assert.equal(snapResolution({ viewW: 960, resolution: 2 }), 2, 'a 2x screen: 1920 wide');
    assert.equal(snapResolution({ viewW: 960, resolution: 1 }), 1);
    assert.equal(snapResolution({ viewW: 960, resolution: 3 }), 2, 'never wider than 1920');
    assert.equal(snapResolution({ viewW: 1200, resolution: 2 }), 1.6);
    assert.equal(snapResolution({ viewW: 960, resolution: 0 }), 1, 'no resolution: 1');
  });

  it('its own size first at 0.85, then lower quality, then smaller, never under the site\'s least', () => {
    assert.deepEqual(SNAP_WIDTHS.slice(0, 1), [1920], 'SNAP_WIDTHS starts at the site\'s widest');
    assert.deepEqual([SNAP_MAX_W, SNAP_MAX_H], [1920, 1200]);
    const steps = snapSteps(1920, 1200);
    assert.deepEqual(steps.slice(0, 3), [{ w: 1920, h: 1200, quality: SNAP_QUALITY }, { w: 1920, h: 1200, quality: SNAP_QUALITY_LOW }, { w: 1600, h: 1000, quality: SNAP_QUALITY }]);
    assert.deepEqual(steps.at(-1), { w: 640, h: 400, quality: SNAP_QUALITY_LOW });
    assert.deepEqual(snapSteps(960, 600)[0], { w: 960, h: 600, quality: SNAP_QUALITY }, 'a 1x screen keeps its 960');
    assert.deepEqual(snapSteps(1080, 1800)[0], { w: 720, h: 1200, quality: SNAP_QUALITY }, 'a tall view fits the site\'s 1200 high');
    assert.deepEqual(snapSteps(2400, 1500)[0], { w: 1920, h: 1200, quality: SNAP_QUALITY });
    for (const s of snapSteps(1920, 1200)) assert.ok(s.w >= 320 && s.h >= 160 && s.w <= 1920 && s.h <= 1200, JSON.stringify(s));
    assert.deepEqual(snapSteps(0, 0), []);
  });

  it('Enter in Camera Mode draws the view at the renderer\'s resolution', () => {
    const page = fakePage();
    const views = [];
    const { engine } = fakeEngine({
      pc: { imaginationUpgrades: ['snapshotting'], level: 7 },
      viewWidth: 960,
      renderer: { resolution: 2 },
      snapshotView: (opts) => { views.push(opts); return null; },
    });
    try {
      snapsFeature.init(engine);
      snapsFeature.cameraSnap(engine, {});
      assert.deepEqual(views, [{ resolution: 2 }], 'the 2x screen\'s own pixels (it was 1: 960 wide)');
    } finally {
      page.done();
    }
  });
});

/* ------------------------------------------------------------------ */
/* The viewer's pure helpers                                            */
/* ------------------------------------------------------------------ */

const snapRow = (id, over = {}) => ({
  id,
  url: `/players/910/snaps/${id}/picture`,
  small: `/players/910/snaps/${id}/small`,
  download: `/players/910/snaps/${id}/download`,
  street: 'GLI3272LOTD1B1F',
  x: 100,
  y: -80,
  caption: `Snap ${id}`,
  width: 1920,
  height: 1200,
  at: '2026-11-24T13:37:28Z',
  public: false,
  page: null,
  ...over,
});

describe('the viewer\'s rules', () => {
  it('Previous and Next stop at either end', () => {
    assert.equal(viewerStep(3, 0, 1), 1);
    assert.equal(viewerStep(3, 1, -1), 0);
    assert.equal(viewerStep(3, 2, 1), -1);
    assert.equal(viewerStep(3, 0, -1), -1);
    assert.equal(viewerStep(0, 0, 1), -1);
    assert.equal(viewerStep(3, 7, 1), -1);
  });

  it('a private Snap has no link to copy; a public one does, and says Make private', () => {
    assert.deepEqual(viewerActions(snapRow(1)), ['download', 'public', 'delete']);
    assert.deepEqual(viewerActions(snapRow(1, { public: true, page: '/players/zz-ada/snaps/1/' })), ['download', 'copy', 'private', 'delete']);
    assert.deepEqual(viewerActions(snapRow(1, { street: '' })), ['download', 'public', 'delete'], 'no Go there from your own Snaps');
    assert.deepEqual(viewerActions(snapRow(1, { public: true, page: 'https://evil.example/' })), ['download', 'private', 'delete'], 'only the site\'s own page is copied');
    assert.deepEqual(viewerActions(null), []);
  });

  it('the saved dialog offers View, Download and Make public, then Copy link', () => {
    assert.deepEqual(savedActions(snapRow(1)), ['view', 'download', 'public']);
    assert.deepEqual(savedActions(snapRow(1, { public: true, page: '/players/zz-ada/snaps/1/' })), ['view', 'download', 'copy']);
    assert.deepEqual(savedActions(null), []);
  });

  it('pictures only from the site\'s own route; the copied link is the page\'s full address', () => {
    assert.ok(isSnapUrl('/players/910/snaps/12/picture'));
    assert.ok(isSnapUrl('/players/910/snaps/12/small'));
    for (const bad of ['/wp-content/uploads/groddle-snaps/0123456789abcdef01234567.jpg', '/players/910/snaps/12/download', 'https://evil.example/players/1/snaps/1/picture', '/players/x/snaps/1/picture']) assert.equal(isSnapUrl(bad), false, bad);
    assert.equal(snapShareUrl('/players/zz-ada/snaps/12/', 'https://groddleafternoon.com/play/online/'), 'https://groddleafternoon.com/players/zz-ada/snaps/12/');
    assert.equal(snapShareUrl('//evil.example/x', 'https://groddleafternoon.com/'), '');
  });
});

/* ------------------------------------------------------------------ */
/* The album and the viewer on a fake page                              */
/* ------------------------------------------------------------------ */

class FakeEl {
  constructor(tag) {
    this.tag = tag;
    this.tagName = tag.toUpperCase();
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.parent = null;
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.src = '';
    this.alt = '';
    if (tag === 'button' || tag === 'input') this.disabled = false;
    const cls = new Set();
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) };
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'hidden') this.hidden = true;
    if (k === 'disabled') this.disabled = true;
    if (k === 'id') this.id = String(v);
    if (k === 'href') this.href = String(v);
  }
  get isConnected() { let n = this; while (n.parent) n = n.parent; return n.tag === 'body'; }
  append(...kids) { for (const k of kids) { if (k && typeof k === 'object') { k.parent = this; this.children.push(k); } } }
  insertBefore(k) { this.append(k); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, e = {}) { for (const fn of this.listeners[type] || []) fn({ target: this, stopPropagation() {}, preventDefault() {}, ...e }); }
  click() { if (!this.disabled) this.fire('click'); }
  focus() { globalThis.document.activeElement = this; }
  querySelector(sel) { return this.all().find((n) => matches(n, sel)) || null; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}
function matches(n, sel) {
  if (sel.startsWith('[')) {
    const [k, v] = sel.slice(1, -1).split('=');
    return Object.hasOwn(n.attrs, k) && (v === undefined || n.attrs[k] === v.replace(/^"|"$/g, ''));
  }
  if (sel.startsWith('.')) return String(n.attrs.class || '').split(' ').includes(sel.slice(1));
  if (sel.startsWith('#')) return n.id === sel.slice(1);
  return n.tag === sel;
}

function fakePage(routes = () => null, calls = []) {
  const body = new FakeEl('body');
  const head = new FakeEl('head');
  const gameRoot = new FakeEl('div');
  gameRoot.id = 'game-root';
  const more = new FakeEl('div');
  more.id = 'more-list';
  body.append(gameRoot, more);
  globalThis.document = {
    baseURI: 'https://groddle.localhost/',
    body,
    head,
    activeElement: null,
    createElement: (tag) => new FakeEl(tag),
    createTextNode: (t) => Object.assign(new FakeEl('#text'), { textContent: t }),
    getElementById: (id) => [body, head, ...body.all(), ...head.all()].find((n) => n.id === id) || null,
  };
  globalThis.requestAnimationFrame = (fn) => fn();
  globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body2 = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body: body2 });
    const path = new URL(url).pathname.replace(/^\/wp-json\/groddle\/v1\//, '');
    const answer = routes(path, method, body2) || { status: 404, body: { code: 'nope', message: 'nope' } };
    return { status: answer.status || 200, ok: (answer.status || 200) < 300, headers: { get: () => null }, json: async () => answer.body, text: async () => '' };
  };
  return {
    body,
    done() {
      for (const k of ['document', 'requestAnimationFrame', 'GRODDLE_MP_BOOT', 'fetch', 'groddleSnaps']) delete globalThis[k];
    },
  };
}

function fakeEngine(over = {}) {
  const log = { buffs: [], feats: [], hits: [], enters: [], toasts: [], data: {} };
  const engine = {
    mode: 'multiplayer',
    started: true,
    inv: {},
    pc: { imaginationUpgrades: ['snapshotting'], level: 7 },
    player: { x: 10, y: 20 },
    streetTsid: 'GLI2V0UN7RD1T2J',
    buffs: new Set(),
    hasBuff(id) { return this.buffs.has(id); },
    applyBuff(id, opts = {}) { this.buffs.add(id); log.buffs.push([id, opts]); },
    featsIncrement: (id, n) => log.feats.push([id, n]),
    playHit: (h, ms) => log.hits.push([h, ms]),
    enter: async (tsid, opts) => log.enters.push([tsid, opts]),
    travelGate: () => ({ ok: true }),
    transientInstance: () => false,
    toast: (m) => log.toasts.push(m),
    playSound: () => {},
    setData: (k, v) => { log.data[k] = v; },
    query: () => null,
    ...over,
  };
  return { engine, log };
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

describe('the album and the full-size viewer (fake page)', () => {
  let page;
  let calls;
  let album;
  beforeEach(() => {
    calls = [];
    album = [snapRow(3, { public: true, page: '/players/zz-ada/snaps/3/' }), snapRow(2), snapRow(1, { street: '', caption: '' })];
    const answer = () => ({ body: { snaps: album, max: 60, profile: '/players/zz-ada/' } });
    page = fakePage((path, method, body) => {
      if (path === 'snaps' && method === 'GET') return answer();
      let m = path.match(/^snaps\/(\d+)\/public$/);
      if (m && method === 'POST') {
        album = album.map((x) => (x.id === Number(m[1]) ? { ...x, public: body.public, page: body.public ? `/players/zz-ada/snaps/${x.id}/` : null } : x));
        return { body: { snap: album.find((x) => x.id === Number(m[1])), snaps: album, max: 60 } };
      }
      m = path.match(/^snaps\/(\d+)$/);
      if (m && method === 'DELETE') {
        album = album.filter((x) => x.id !== Number(m[1]));
        return answer();
      }
      return null;
    }, calls);
    mock.timers.enable({ apis: ['setTimeout'] });
  });
  afterEach(() => {
    mock.timers.reset();
    page.done();
  });

  const viewer = () => page.body.querySelector('[data-snap-viewer]');
  const actions = () => viewer().querySelector('[data-snap-actions]').children.map((b) => b.attrs['data-snap-action']);
  const key = (k, extra = {}) => viewer().fire('keydown', { key: k, ...extra });

  it('the cards keep each Snap\'s own shape, with no crop, and a click opens the viewer on it', async () => {
    const { engine, log } = fakeEngine();
    snapsFeature.init(engine);
    globalThis.groddleSnaps.openAlbum();
    await flush();
    const cards = page.body.querySelector('[data-snaps-window]').all().filter((n) => n.attrs['data-snap-open']);
    assert.equal(cards.length, 3);
    const img = cards[0].querySelector('img');
    assert.deepEqual([img.attrs.width, img.attrs.height, img.attrs.src], ['1920', '1200', '/players/910/snaps/3/small'], 'its own width and height, the small copy');
    assert.ok(cards[0].querySelector('[data-snap-public]'), 'a public Snap says so');
    assert.equal(cards[1].querySelector('[data-snap-public]'), null);
    const css = readFileSync(join(GAME_DIR, 'public/js/features/snaps-feature.js'), 'utf8');
    assert.doesNotMatch(css, /\.snap-card img \{[^}]*object-fit: cover/, 'never cropped');
    assert.doesNotMatch(css, /\.snap-card img \{[^}]*aspect-ratio: 16 \/ 9/, 'never forced to 16:9');
    assert.doesNotMatch(readFileSync(join(GAME_DIR, 'public/style.css'), 'utf8'), /\.snap-card img \{[^}]*object-fit: cover/);

    cards[1].click();
    assert.ok(viewer(), 'the viewer opens');
    assert.equal(viewer().attrs['aria-modal'], 'true');
    assert.equal(viewer().querySelector('[data-snap-viewer-img]').src, '/players/910/snaps/2/picture', 'the full picture');
    assert.equal(viewer().querySelector('[data-snap-viewer-caption]').textContent, 'Snap 2');
    assert.match(viewer().querySelector('[data-snap-viewer-meta]').textContent, /November 24, 2026 · 2 of 3$/);
    assert.equal(log.data.snapViewer, '1');
    assert.deepEqual(actions(), ['download', 'public', 'delete'], 'private: no Copy link');

    key('ArrowLeft');
    assert.equal(viewer().querySelector('[data-snap-viewer-caption]').textContent, 'Snap 3');
    assert.deepEqual(actions(), ['download', 'copy', 'private', 'delete'], 'public: Copy link and Make private');
    assert.equal(viewer().querySelector('[data-snap-step="prev"]').disabled, true, 'the first has no Previous');
    key('ArrowLeft');
    assert.equal(viewer().querySelector('[data-snap-viewer-caption]').textContent, 'Snap 3', 'stops at the first');
    viewer().querySelector('[data-snap-step="next"]').click();
    viewer().querySelector('[data-snap-step="next"]').click();
    assert.equal(viewer().querySelector('[data-snap-viewer-caption]').hidden, true, 'no caption: none shown');
    assert.deepEqual(actions(), ['download', 'public', 'delete'], 'no Go there from your own Snaps');
    assert.equal(viewer().querySelector('[data-snap-step="next"]').disabled, true);

    key('Escape');
    assert.equal(viewer(), null, 'Escape closes the viewer');
    assert.ok(page.body.querySelector('[data-snaps-window]'), 'and leaves the album open');
    assert.equal(globalThis.document.activeElement?.attrs?.['data-snap-open'], '1', 'focus goes back to that Snap\'s card');
  });

  it('Make public, then Copy link; Make private takes the link away', async () => {
    const { engine } = fakeEngine();
    snapsFeature.init(engine);
    await globalThis.groddleSnaps.album();
    globalThis.groddleSnaps.openViewer(1);
    viewer().querySelector('[data-snap-action="public"]').click();
    await flush();
    assert.deepEqual(calls.at(-1), { url: 'https://groddle.localhost/wp-json/groddle/v1/snaps/2/public', method: 'POST', body: { public: true } });
    assert.deepEqual(actions(), ['download', 'copy', 'private', 'delete']);
    assert.equal(viewer().querySelector('[data-snap-viewer-msg]').textContent, 'This snap is public now.');
    viewer().querySelector('[data-snap-action="private"]').click();
    await flush();
    assert.deepEqual(calls.at(-1).body, { public: false });
    assert.deepEqual(actions(), ['download', 'public', 'delete']);
  });

  it('Delete asks first; Keep it keeps it, Yes deletes and shows the next', async () => {
    const { engine } = fakeEngine();
    snapsFeature.init(engine);
    await globalThis.groddleSnaps.album();
    globalThis.groddleSnaps.openViewer(0);
    viewer().querySelector('[data-snap-action="delete"]').click();
    const confirm = viewer().querySelector('[data-snap-confirm-row]');
    assert.equal(confirm.hidden, false);
    assert.match(confirm.children[0].textContent, /Delete this snap\?/);
    assert.equal(calls.filter((c) => c.method === 'DELETE').length, 0, 'nothing deleted yet');
    viewer().querySelector('[data-snap-confirm="no"]').click();
    assert.equal(viewer().querySelector('[data-snap-confirm-row]').hidden, true);
    viewer().querySelector('[data-snap-action="delete"]').click();
    viewer().querySelector('[data-snap-confirm="yes"]').click();
    await flush();
    assert.deepEqual(calls.filter((c) => c.method === 'DELETE').map((c) => c.url), ['https://groddle.localhost/wp-json/groddle/v1/snaps/3']);
    assert.equal(viewer().querySelector('[data-snap-viewer-caption]').textContent, 'Snap 2', 'the next one shows');
    assert.match(viewer().querySelector('[data-snap-viewer-meta]').textContent, /1 of 2$/);
  });

  it('Tab stays inside the viewer', async () => {
    const { engine } = fakeEngine();
    snapsFeature.init(engine);
    await globalThis.groddleSnaps.album();
    globalThis.groddleSnaps.openViewer(0);
    const seen = new Set();
    for (let i = 0; i < 12; i++) {
      key('Tab');
      seen.add(globalThis.document.activeElement);
    }
    for (const n of seen) {
      let p = n;
      while (p && p !== viewer()) p = p.parent;
      assert.equal(p, viewer(), 'focus never leaves the viewer');
    }
    assert.ok(seen.size >= 4);
  });
});

/* ------------------------------------------------------------------ */
/* The site                                                             */
/* ------------------------------------------------------------------ */

describe('the site keeps a public flag (groddle-afternoon-site)', { skip: !HAS_SITE && 'no site repo' }, () => {
  it('declares `public` on groddle_snaps, default 0, with the minn.json version moved on', () => {
    const manifest = JSON.parse(site('minn.json'));
    assert.ok(manifest.tables.groddle_snaps.includes('public tinyint(1) unsigned NOT NULL DEFAULT 0'));
    const [maj, min, patch] = manifest.version.split('.').map(Number);
    assert.ok(maj > 0 || min > 5 || (min === 5 && patch >= 59), manifest.version);
  });

  it('accepts a full-size Snap: 1920x1200 is within SnapImage\'s sizes', () => {
    const src = site('src/SnapImage.php');
    assert.match(src, /MAX_W = 1920;/);
    assert.match(src, /MAX_H = 1200;/);
    assert.match(src, /MAX_BYTES = 1_000_000;/);
  });
});

function mysql() {
  const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, 'utf8');
  const def = (k) => text.match(new RegExp(`define\\(\\s*'${k}',\\s*'([^']*)'`))?.[1];
  const host = def('DB_HOST');
  const user = def('DB_USER');
  return host && user ? { host, user, pass: def('DB_PASSWORD') || '' } : null;
}
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = HAS_PHP;
const db = mysql();
const reachable = db && hasPhp && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
// GD makes the full-size picture the save is tried with; a PHP that has it as a module only gets it loaded.
const gdArgs = hasPhp && spawnSync(PHP, ['-r', 'exit(function_exists("imagecreatetruecolor") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=gd'] : [];
const skipDb = (!HAS_SITE && 'no site repo')
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the site\'s Snaps routes on a throwaway database', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [...gdArgs, join(GAME_DIR, 'tests/fixtures/snaps/snaps-routes.php'), engineDir, SITE_DIR, join(GAME_DIR, 'public'), db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true);
  });

  it('a new Snap is private: full size accepted, a small copy beside it, its file\'s name never sent', (t) => {
    if (!r.gd) return t.skip('no GD in this PHP');
    assert.equal(r.save.status, 201, r.save.code);
    assert.equal(r.save.snap.public, false);
    assert.equal(r.save.snap.page, null);
    assert.equal(r.save.row.public, 0);
    assert.deepEqual([r.save.snap.width, r.save.snap.height], [1920, 1200]);
    assert.ok(r.save.fileName32 && r.save.fileOnDisk && r.save.indexHtml);
    assert.ok(r.save.smallOnDisk);
    assert.equal(r.save.smallWidth, 640);
    assert.equal(r.save.jsonHasFileName, false);
    assert.match(r.save.snap.url, /^\/players\/910\/snaps\/\d+\/picture$/);
    assert.match(r.save.snap.small, /^\/players\/910\/snaps\/\d+\/small$/);
    assert.deepEqual(r.delete, { file: false, small: false, row: null }, 'Delete takes the small copy too');
  });

  it('the album gives the site\'s routes, never an upload\'s address; old file names are replaced once', () => {
    assert.equal(r.album.status, 200);
    assert.equal(r.album.profile, '/players/zz-ada/');
    assert.equal(r.album.mentionsUploads, false);
    assert.deepEqual([r.album.private.public, r.album.private.page], [false, null]);
    assert.deepEqual([r.album.public.public, r.album.public.page], [true, `/players/zz-ada/snaps/${r.ids.adaPublic}/`]);
    assert.equal(r.album.private.download, `/players/910/snaps/${r.ids.adaPrivate}/download`);
    assert.ok(r.album.oldRenamed && r.album.oldGone && r.album.newThere, 'a pre-G1240 file has a new name: its old address stops loading');
    assert.equal(r.album.sealedOption, '1');
  });

  it('a Snap that caught a shooting star keeps it, and its page shows the tag (meteor showers, ours)', (t) => {
    assert.equal(r.meteor.tagged.status, 200);
    assert.equal(r.meteor.tagged.tag, true, 'a "Shooting star" tag on its page');
    assert.deepEqual(r.meteor.plain, { status: 200, tag: false }, 'none on another Snap');
    assert.deepEqual(r.meteor.album, { public: true, private: false });
    if (!r.gd) return t.skip('no GD in this PHP');
    assert.equal(r.save.row.meteor, 1, 'saved with meteor: true');
    assert.equal(r.save.snap.meteor, true);
  });

  it('only the owner makes a Snap public or private', () => {
    assert.deepEqual(r.toggle.notOwner, [404, 'groddle_snap_missing', 0]);
    assert.deepEqual(r.toggle.badBody, [400, 'groddle_snap_public']);
    assert.equal(r.toggle.on.status, 200);
    assert.deepEqual([r.toggle.on.snap.public, r.toggle.on.snap.page, r.toggle.on.row], [true, `/players/zz-ada/snaps/${r.ids.adaPrivate}/`, 1]);
    assert.deepEqual([r.toggle.off.snap.public, r.toggle.off.snap.page, r.toggle.off.row], [false, null, 0]);
  });

  it('a private Snap\'s picture answers only its owner, and is never stored by a cache', () => {
    assert.deepEqual([r.picture.privateOwner.status, r.picture.privateOwner.cache, r.picture.privateOwner.type], [200, 'private, no-store', 'image/jpeg']);
    for (const k of ['privateOther', 'privateSignedOut', 'privateSmallOther', 'publicBlocked', 'wrongOwner', 'missing']) assert.equal(r.picture[k].status, 404, k);
    assert.equal(r.picture.publicOther.status, 200);
    assert.equal(r.picture.publicSignedOut.status, 200);
    assert.equal(r.picture.publicOther.cache, 'public, max-age=0, must-revalidate', 'asked again every time, so private is private at once');
    assert.equal(r.picture.publicRevalidated.status, 304);
  });

  it('download: the original file named for its street and date, the owner\'s only while private', () => {
    assert.equal(r.download.privateOwner.status, 200);
    assert.match(r.download.privateOwner.disposition, /^attachment; filename="Snap of [A-Za-z ]+ \d{4}-\d{2}-\d{2}\.jpg"; filename\*=UTF-8''/);
    assert.equal(r.download.privateOwner.bytes, r.picture.privateOwner.bytes, 'the kept file itself');
    assert.equal(r.download.privateOther.status, 404);
    assert.equal(r.download.privateSignedOut.status, 404);
    assert.equal(r.download.publicOther.status, 200);
  });

  it('a public Snap has its own page; a private one is its owner\'s alone', () => {
    assert.deepEqual(r.page.public, { status: 200, caption: true, picture: true, download: true, ogImage: true, uploads: false });
    assert.equal(r.page.privateOther, 404);
    assert.deepEqual(r.page.privateOwner, { status: 200, note: true, noindex: true });
    assert.equal(r.page.blocked, 404, 'none for a player who blocks the owner');
    assert.equal(r.page.wrongOwner, 404);
  });

  it('the profile shows only public Snaps; none to a player either of them blocks', () => {
    assert.equal(r.profile.error, null, r.profile.error);
    assert.deepEqual(r.profile.list, [r.ids.adaPublic]);
    assert.deepEqual(r.profile.listSignedOut, [r.ids.adaPublic]);
    assert.deepEqual(r.profile.listBlocked, []);
    assert.equal(r.profile.overviewPublic, true);
    assert.equal(r.profile.overviewPrivate, false);
    assert.equal(r.profile.tabPublic, true);
    assert.equal(r.profile.tabPrivate, false);
    assert.equal(r.profile.tabLink, true);
    assert.equal(r.profile.ownerNote, true, 'the owner is told how a Snap gets there');
    assert.equal(r.profile.otherNote, false);
  });

  it('made private again: off the profile, its picture and page at once', () => {
    assert.deepEqual(r['private again'].whilePublic, [[r.ids.adaPrivate, r.ids.adaPublic].sort((a, b) => b - a), 200]);
    assert.deepEqual(r['private again'].after, [[r.ids.adaPublic], 404, 404]);
  });

  it('the Camera\'s random Snap is another player\'s public one, never a private one', () => {
    assert.deepEqual(r.random.bea, [r.ids.adaPublic], 'Ada\'s private and old ones never come up');
    assert.deepEqual(r.random.ada, [r.ids.beaPublic]);
    assert.deepEqual(r.random.cy, [r.ids.beaPublic], 'none from a player Cy blocks');
    assert.match(r.randomShape.url, /^\/players\/910\/snaps\/\d+\/picture$/);
    assert.equal(r.randomShape.public, true);
  });
});
