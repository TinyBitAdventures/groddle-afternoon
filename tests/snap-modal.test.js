/**
 * A public Snap's page opens its picture in a larger view over the page (ours, Austin's ask
 * 2026-11-27): a plain left click on the picture opens a dialog with the picture fitted to the
 * window, its caption and where and when, a Download (the download route) and a Close. Escape, a
 * click on the backdrop and Close shut it; the focus goes back to the picture. Without the script
 * the picture's link still opens the picture, and the page keeps its own Download link.
 *
 * - The page itself: groddle-afternoon-site src/PlayerPages.php snapPage, rendered on a throwaway
 *   MariaDB database by tests/fixtures/snaps/snaps-routes.php (the same run as g1240).
 * - The script: groddle-afternoon-site players/players.js, run here against a small fake page.
 * - The look: style.css .snap-modal (colours from restoration.css's tokens only).
 *
 * Run: node --test tests/snap-modal.test.js (GRODDLE_SITE_DIR for a site worktree; MariaDB as
 * g1240-snaps-full.test.js finds it).
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { GAME_DIR, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const site = (f) => readFileSync(join(SITE_DIR, f), 'utf8');
const HAS_SITE = existsSync(join(SITE_DIR, 'players/players.js'));

/* ------------------------------------------------------------------ */
/* The rendered page                                                    */
/* ------------------------------------------------------------------ */

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
const db = mysql();
const reachable = db && HAS_PHP && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const gdArgs = HAS_PHP && spawnSync(PHP, ['-r', 'exit(function_exists("imagecreatetruecolor") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=gd'] : [];
const skipDb = (!HAS_SITE && 'no site repo')
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

/** One tag's attributes, from the first match of `re` in the page (the page is the server's own, well formed). */
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-z-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

describe('a public Snap\'s page (src/PlayerPages.php snapPage)', { skip: skipDb }, () => {
  let html;
  let base;
  before(() => {
    const r = JSON.parse(execFileSync(PHP, [...gdArgs, join(GAME_DIR, 'tests/fixtures/snaps/snaps-routes.php'), engineDir, SITE_DIR, join(GAME_DIR, 'public'), db.host, db.user, db.pass], { timeout: 90000 }).toString());
    assert.equal(r.error, undefined, r.error);
    html = r.pageHtml;
    base = `/players/${r.pageIds.owner}/snaps/${r.pageIds.snap}`;
  });

  it('without the script: the picture is still a link to the picture, and the page keeps its Download', () => {
    const link = html.match(/<a class="snap-page-picture"[^>]*>/)?.[0];
    assert.ok(link, 'the picture link');
    assert.equal(attrs(link).href, `${base}/picture`);
    assert.ok(Object.hasOwn(attrs(link), 'data-snap-open'), 'the script\'s hook on it');
    assert.match(html, new RegExp(`<p class="snap-page-links"><a href="${base}/download" download="">Download</a>`));
  });

  it('carries the dialog: the picture, the words, a real Download link to the download route, and Close', () => {
    const dialog = html.match(/<dialog class="snap-modal"[\s\S]*?<\/dialog>/)?.[0];
    assert.ok(dialog, 'the dialog');
    assert.ok(Object.hasOwn(attrs(dialog.match(/<dialog[^>]*>/)[0]), 'data-snap-modal'));
    assert.doesNotMatch(dialog.match(/<dialog[^>]*>/)[0], /\bopen\b/, 'closed until the script opens it');
    assert.equal(attrs(dialog.match(/<img[^>]*>/)[0]).src, `${base}/picture`, 'the full picture');
    assert.match(dialog, /class="snap-modal-caption">Ada public</);
    assert.match(dialog, /class="snap-modal-meta">[^<]*by /);
    const dl = attrs(dialog.match(/<a class="snap-modal-download"[^>]*>/)[0]);
    assert.equal(dl.href, `${base}/download`);
    assert.equal(dl.download, '');
    assert.match(dialog, /<button type="button" class="snap-modal-close" data-snap-close="">Close<\/button>/);
    assert.doesNotMatch(dialog, /—/, 'no em dashes');
  });

  it('loads players.js, keyed by its content', () => {
    assert.match(html, /<script src="\/wp-content\/themes\/groddle\/players\/players\.js\?v=[0-9a-f]{8}" defer><\/script>/);
  });
});

/* ------------------------------------------------------------------ */
/* The script                                                           */
/* ------------------------------------------------------------------ */

class El {
  constructor(name, attrsIn = {}) {
    this.name = name;
    this.attrs = attrsIn;
    this.children = [];
    this.listeners = {};
    this.open = false;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, init = {}) {
    let prevented = false;
    const e = { type, target: this, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault() { prevented = true; this.defaultPrevented = true; }, ...init };
    for (const fn of this.listeners[type] || []) fn(e);
    return prevented;
  }
  querySelector(sel) {
    const key = sel.slice(1, -1);
    for (const c of this.children) {
      if (Object.hasOwn(c.attrs, key)) return c;
      const deep = c.querySelector(sel);
      if (deep) return deep;
    }
    return null;
  }
  focus() { this.doc.activeElement = this; }
}

function page() {
  const doc = { activeElement: null };
  const html = new El('html');
  const classes = new Set();
  html.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) };
  const link = new El('a', { 'data-snap-open': '' });
  const dialog = new El('dialog', { 'data-snap-modal': '' });
  const close = new El('button', { 'data-snap-close': '' });
  const download = new El('a', { download: '' });
  const inner = new El('div');
  inner.children.push(new El('img'), download, close);
  dialog.children.push(inner);
  for (const el of [link, dialog, close, download, inner]) el.doc = doc;
  const calls = [];
  dialog.showModal = () => { calls.push('showModal'); dialog.open = true; };
  dialog.close = () => { if (!dialog.open) return; calls.push('close'); dialog.open = false; dialog.fire('close'); };
  html.children.push(link, dialog);
  Object.assign(doc, {
    documentElement: html,
    querySelector: (sel) => html.querySelector(sel),
    addEventListener() {},
  });
  vm.runInNewContext(site('players/players.js'), { document: doc, window: {}, history: {}, location: {}, URLSearchParams, FormData: class {} });
  return { doc, html, link, dialog, close, inner, calls };
}

describe('players.js opens the Snap\'s larger view (groddle-afternoon-site)', { skip: !HAS_SITE && 'no site repo' }, () => {
  it('a plain left click opens the dialog instead of following the link; the focus moves in; the page stops scrolling', () => {
    const p = page();
    assert.equal(p.link.fire('click'), true, 'the link is not followed');
    assert.deepEqual(p.calls, ['showModal']);
    assert.equal(p.doc.activeElement, p.close, 'focus on Close');
    assert.ok(p.html.classList.contains('snap-modal-open'), 'the page behind is held still');
  });

  it('a middle click or a click with Ctrl, Cmd, Shift or Alt still follows the link (a new tab)', () => {
    for (const init of [{ button: 1 }, { button: 2 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) {
      const p = page();
      assert.equal(p.link.fire('click', init), false, JSON.stringify(init));
      assert.deepEqual(p.calls, [], JSON.stringify(init));
    }
  });

  it('Escape closes it and the focus goes back to the picture', () => {
    const p = page();
    p.link.fire('click');
    p.dialog.fire('keydown', { key: 'Enter' });
    assert.equal(p.dialog.open, true, 'another key leaves it open');
    p.dialog.fire('keydown', { key: 'Escape' });
    assert.equal(p.dialog.open, false);
    assert.equal(p.doc.activeElement, p.link);
    assert.equal(p.html.classList.contains('snap-modal-open'), false, 'the page scrolls again');
  });

  it('a click on the backdrop closes it; a click inside, or a drag from inside out, does not', () => {
    const p = page();
    p.link.fire('click');
    p.dialog.fire('pointerdown', { target: p.inner });
    p.dialog.fire('click', { target: p.inner });
    assert.equal(p.dialog.open, true, 'a click on the picture or words');
    p.dialog.fire('pointerdown', { target: p.inner });
    p.dialog.fire('click', { target: p.dialog });
    assert.equal(p.dialog.open, true, 'a drag that ends on the backdrop');
    p.dialog.fire('pointerdown', { target: p.dialog });
    p.dialog.fire('click', { target: p.dialog });
    assert.equal(p.dialog.open, false, 'the backdrop');
    assert.equal(p.doc.activeElement, p.link);
  });

  it('Close closes it', () => {
    const p = page();
    p.link.fire('click');
    p.close.fire('click');
    assert.equal(p.dialog.open, false);
    assert.equal(p.doc.activeElement, p.link);
  });

  it('a browser without dialogs leaves the link alone', () => {
    const doc = { querySelector: (sel) => (sel === '[data-snap-open]' ? link : sel === '[data-snap-modal]' ? {} : null), addEventListener() {}, documentElement: {} };
    const link = new El('a');
    vm.runInNewContext(site('players/players.js'), { document: doc, window: {}, history: {}, location: {}, URLSearchParams, FormData: class {} });
    assert.equal(link.fire('click'), false);
  });
});

/* ------------------------------------------------------------------ */
/* The look                                                             */
/* ------------------------------------------------------------------ */

describe('the larger view\'s styles (style.css)', { skip: !HAS_SITE && 'no site repo' }, () => {
  const rules = () => site('style.css').split('\n').filter((l) => /snap-modal/.test(l)).join('\n');

  it('fits the picture to the window without growing it past its own size', () => {
    const img = rules().match(/\.snap-modal-img \{[^}]*\}/)[0];
    assert.match(img, /width: auto; height: auto; max-width: 100%; max-height: calc\(100dvh - \d+px\)/);
    assert.match(rules(), /html\.snap-modal-open \{ overflow: hidden; \}/, 'the page behind does not scroll');
  });

  it('colours come only from tokens restoration.css sets for both themes', () => {
    const css = rules();
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|\b(black|white)\b/i, 'no literal colours');
    const tokens = [...css.matchAll(/var\(--([a-z-]+)\)/g)].map((m) => m[1]);
    const theme = readFileSync(join(GAME_DIR, 'public/restoration/restoration.css'), 'utf8');
    const dark = theme.slice(theme.indexOf(':root[data-theme="dark"]'));
    const nonColour = new Set(['radius', 'radius-lg']);
    for (const t of new Set(tokens)) {
      if (nonColour.has(t)) continue;
      assert.match(dark, new RegExp(`--${t}:`), `--${t} is set for the dark theme`);
    }
  });

  it('moves only when the reader has not asked for less motion', () => {
    const css = site('style.css');
    const at = css.indexOf('.snap-modal[open] { animation');
    assert.ok(at > 0);
    assert.match(css.slice(css.lastIndexOf('@media', at), at), /@media \(prefers-reduced-motion: no-preference\) \{\s*$/);
  });
});
