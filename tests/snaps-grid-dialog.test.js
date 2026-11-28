/**
 * A profile's snaps open in the site's picture pop-up (ours, Austin's pick 2026-11-28): on a player's
 * profile (its newest snaps) and on their All snaps page, a plain click on a snap opens the same
 * dialog a Snap's page and a Support report use (community/picture-dialog.js): the snap's full
 * picture, its caption, street, date and by-name, Download, Previous and Next through the snaps on
 * that page (buttons and arrow keys, round the ends), an "Open snap page" link and Close. A middle
 * or Ctrl/Cmd/Shift/Alt click, and a page without the script, still go to the snap's page.
 * Glitch had no pop-up viewer on its photo pages.
 *
 * - The pages: groddle-afternoon-site src/PlayerPages.php snapsSection, snapCard and snapsDialog,
 *   rendered on a throwaway MariaDB database by tests/fixtures/snaps/snaps-routes.php while two of
 *   Ada's snaps are public. The grid only ever lists public snaps (Snaps::publicOf), the owner's own
 *   view too, so the pop-up shows nothing a viewer could not already open.
 * - The script: community/picture-dialog.js run against a small fake page of two snap cards.
 * - The look: style.css (tokens only), the four buttons on one line on a 390 px phone.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/snaps-grid-dialog.test.js
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GAME_DIR, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const site = (f) => readFileSync(join(SITE_DIR, f), 'utf8');
const HAS_SITE = existsSync(join(SITE_DIR, 'community/picture-dialog.js'));
const mod = HAS_SITE ? await import(pathToFileURL(join(SITE_DIR, 'community/picture-dialog.js')).href) : {};

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
const skipDb = (!HAS_SITE && 'no site repo')
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

/** A tag's attributes (the server's own markup, well formed). */
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-z-]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&amp;/g, '&').replace(/&#039;/g, "'");
  return out;
}
const cards = (html) => [...html.matchAll(/<a class="profile-snap"[^>]*>/g)].map((m) => attrs(m[0]));
const dialogOf = (html) => html.match(/<dialog class="snap-modal profile-snaps-modal"[\s\S]*?<\/dialog>/)?.[0];
const SCRIPT = /<script type="module" src="\/wp-content\/themes\/groddle\/community\/picture-dialog\.js\?v=[0-9a-f]{8}"><\/script>/;

/* ------------------------------------------------------------------ */
/* The rendered pages                                                   */
/* ------------------------------------------------------------------ */

describe('a profile\'s snaps grids (src/PlayerPages.php, throwaway database)', { skip: skipDb }, () => {
  let g;
  let ids;
  const ADA = 910;
  before(() => {
    const r = JSON.parse(execFileSync(PHP, [join(GAME_DIR, 'tests/fixtures/snaps/snaps-routes.php'), engineDir, SITE_DIR, join(GAME_DIR, 'public'), db.host, db.user, db.pass], { timeout: 90000, maxBuffer: 32 * 1024 * 1024 }).toString());
    assert.equal(r.error, undefined, r.error);
    g = r.grid;
    ids = g.ids;
    assert.equal(ids.length, 2, 'two public snaps, newest first');
    for (const k of ['overview', 'tab', 'own', 'one', 'none']) assert.doesNotMatch(g[k], /^status /, `${k}: ${g[k].slice(0, 80)}`);
  });

  it('without the script: each card is still a link to its snap\'s page', () => {
    for (const k of ['overview', 'tab', 'own']) {
      assert.deepEqual(cards(g[k]).map((a) => a.href), ids.map((id) => `/players/zz-ada/snaps/${id}/`), k);
      assert.equal(cards(g[k]).some((a) => a.target), false, `${k}: same tab, as before`);
    }
  });

  it('each card carries the pop-up\'s hooks: the full picture, the download route, the caption and street, date and by-name', () => {
    const [first, second] = cards(g.tab);
    for (const [a, id, caption] of [[first, ids[0], 'Ada public'], [second, ids[1], 'Ada private']]) {
      assert.ok(Object.hasOwn(a, 'data-snap-open'), id);
      assert.equal(a['data-snap-src'], `/players/${ADA}/snaps/${id}/picture`);
      assert.equal(a['data-snap-download'], `/players/${ADA}/snaps/${id}/download`);
      assert.equal(a['data-snap-caption'], caption);
      assert.match(a['data-snap-line'], /^[^·]+ · [A-Z][a-z]+ \d{1,2}, \d{4} · by Zz Ada$/, 'street, date, by-name, as the Snap\'s page says it');
    }
  });

  it('the All snaps page carries one closed dialog: the newest snap, its words, Previous, Next, Download, Open snap page and Close', () => {
    const dialog = dialogOf(g.tab);
    assert.ok(dialog, 'the dialog');
    assert.equal(g.tab.match(/<dialog/g).length, 1, 'one for the page');
    const tag = attrs(dialog.match(/<dialog[^>]*>/)[0]);
    assert.ok(Object.hasOwn(tag, 'data-snap-modal'));
    assert.equal(tag.open, undefined, 'closed until the script opens it');
    assert.equal(tag['aria-label'], 'Ada public');
    const img = attrs(dialog.match(/<img[^>]*>/)[0]);
    assert.ok(Object.hasOwn(img, 'data-snap-img'));
    assert.equal(img.src, `/players/${ADA}/snaps/${ids[0]}/picture`, 'the full picture, not the cards\' copy');
    assert.deepEqual([img.width, img.height], ['960', '540']);
    assert.match(dialog, /<p class="snap-modal-caption" data-snap-caption="">Ada public<\/p>/);
    assert.match(dialog, /<p class="snap-modal-meta" data-snap-meta="">[^<]+ · by Zz Ada<\/p>/);
    const page = attrs(dialog.match(/<a class="snap-modal-page"[^>]*>/)[0]);
    assert.equal(page.href, `/players/zz-ada/snaps/${ids[0]}/`);
    assert.match(dialog, /data-snap-page="">Open snap page<\/a>/);
    assert.match(dialog, /<button type="button" class="snap-modal-step" data-snap-prev="">Previous<\/button><button type="button" class="snap-modal-step" data-snap-next="">Next<\/button>/);
    const dl = attrs(dialog.match(/<a class="snap-modal-download"[^>]*>/)[0]);
    assert.equal(dl.href, `/players/${ADA}/snaps/${ids[0]}/download`);
    assert.equal(dl.download, '', 'the route names the file');
    assert.match(dialog, /<button type="button" class="snap-modal-close" data-snap-close="">Close<\/button>/);
    assert.doesNotMatch(dialog, /—/, 'no em dashes');
    assert.match(g.tab, SCRIPT, 'the site\'s picture pop-up, keyed by its content');
  });

  it('the profile\'s own grid opens the same, and the owner sees just what anyone sees (public snaps only)', () => {
    assert.ok(dialogOf(g.overview), 'the profile');
    assert.match(g.overview, SCRIPT);
    assert.equal(dialogOf(g.own), dialogOf(g.tab), 'the owner\'s All snaps: the same dialog');
    assert.deepEqual(cards(g.own), cards(g.tab));
  });

  it('one snap: the dialog without Previous and Next; no snaps: no dialog and no script', () => {
    const one = dialogOf(g.one);
    assert.ok(one, 'one snap still opens');
    assert.doesNotMatch(one, /data-snap-prev|data-snap-next/);
    assert.match(one, /data-snap-caption="">Ada public</);
    assert.equal(dialogOf(g.none), undefined);
    assert.doesNotMatch(g.none, /picture-dialog\.js/);
  });
});

/* ------------------------------------------------------------------ */
/* The script                                                           */
/* ------------------------------------------------------------------ */

class El {
  constructor(doc, tag, a = {}) {
    Object.assign(this, { doc, tag, a: { ...a }, children: [], listeners: {}, open: false, hidden: false, textContent: '' });
  }
  get href() { return this.a.href; }
  set href(v) { this.a.href = v; }
  get src() { return this.a.src; }
  set src(v) { this.a.src = v; }
  get alt() { return this.a.alt; }
  set alt(v) { this.a.alt = v; }
  getAttribute(k) { return Object.hasOwn(this.a, k) ? this.a[k] : null; }
  setAttribute(k, v) { this.a[k] = String(v); }
  removeAttribute(k) { delete this.a[k]; }
  add(...kids) { this.children.push(...kids); return this; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  match(sel) { return sel === 'img' ? this.tag === 'img' : Object.hasOwn(this.a, sel.slice(1, -1)); }
  querySelector(sel) { return this.all().find((c) => c.match(sel)) || null; }
  querySelectorAll(sel) { return this.all().filter((c) => c.match(sel)); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  fire(type, init = {}) {
    const e = { type, target: this, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...init };
    for (const fn of this.listeners[type] || []) fn(e);
    return e;
  }
  focus() { this.doc.activeElement = this; }
}

/** An All snaps page as the server draws it: three cards (the last with no caption) and the closed dialog on the first. */
function page() {
  const doc = { activeElement: null };
  const e = (tag, a) => new El(doc, tag, a);
  const classes = new Set();
  const html = e('html');
  html.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) };
  const snaps = [
    [33, 960, 540, 'Sunset on the ridge', 'Hechey Track, Groddle Meadow · November 27, 2026 · by Zz Ada'],
    [31, 640, 480, 'Pigs', 'Gregarious Grange, Groddle Forest · November 20, 2026 · by Zz Ada'],
    [30, 1920, 1200, '', 'Tallish Crest, Groddle Heights · November 2, 2026 · by Zz Ada'],
  ];
  const links = snaps.map(([id, w, h, caption, line]) => e('a', { href: `/players/zz-ada/snaps/${id}/`, 'data-snap-open': '', 'data-snap-src': `/players/910/snaps/${id}/picture`, 'data-snap-download': `/players/910/snaps/${id}/download`, 'data-snap-caption': caption, 'data-snap-line': line })
    .add(e('img', { src: `/players/910/snaps/${id}/small`, width: String(w), height: String(h), alt: caption || 'A snap' })));
  const img = e('img', { 'data-snap-img': '', src: '/players/910/snaps/33/picture', width: '960', height: '540', alt: 'Sunset on the ridge' });
  const caption = e('p', { 'data-snap-caption': '' });
  caption.textContent = snaps[0][3];
  const meta = e('p', { 'data-snap-meta': '' });
  meta.textContent = snaps[0][4];
  const open = e('a', { 'data-snap-page': '', href: '/players/zz-ada/snaps/33/' });
  const prev = e('button', { 'data-snap-prev': '' });
  const next = e('button', { 'data-snap-next': '' });
  const download = e('a', { 'data-snap-download': '', href: '/players/910/snaps/33/download', download: '' });
  const close = e('button', { 'data-snap-close': '' });
  const inner = e('div').add(img, e('div').add(caption, meta, open), e('div').add(prev, next, download, close));
  const dialog = e('dialog', { 'data-snap-modal': '', 'aria-label': 'Sunset on the ridge' }).add(inner);
  const calls = [];
  dialog.showModal = () => { calls.push('showModal'); dialog.open = true; };
  dialog.close = () => { if (!dialog.open) return; calls.push('close'); dialog.open = false; dialog.fire('close'); };
  html.add(...links, dialog);
  Object.assign(doc, { documentElement: html, querySelector: (s) => html.querySelector(s), querySelectorAll: (s) => html.querySelectorAll(s) });
  const stop = mod.wirePictureDialog(doc);
  const shown = () => ({
    src: img.src, w: img.getAttribute('width'), h: img.getAttribute('height'), alt: img.alt,
    caption: caption.textContent, captionHidden: caption.hidden, meta: meta.textContent,
    download: download.href, name: download.getAttribute('download'), page: open.href, label: dialog.getAttribute('aria-label'),
  });
  return { doc, html, links, dialog, prev, next, close, calls, stop, shown };
}

describe('community/picture-dialog.js: a profile\'s snaps in the pop-up (groddle-afternoon-site)', { skip: !HAS_SITE && 'no site repo' }, () => {
  it('a plain click on the second snap opens the dialog on it, not its page: its full picture, words, download and page', () => {
    const p = page();
    assert.equal(p.links[1].fire('click').defaultPrevented, true, 'the snap\'s page is not opened');
    assert.deepEqual(p.calls, ['showModal']);
    assert.deepEqual(p.shown(), {
      src: '/players/910/snaps/31/picture', w: '640', h: '480', alt: 'Pigs',
      caption: 'Pigs', captionHidden: false, meta: 'Gregarious Grange, Groddle Forest · November 20, 2026 · by Zz Ada',
      download: '/players/910/snaps/31/download', name: '', page: '/players/zz-ada/snaps/31/', label: 'Pigs',
    });
    assert.equal(p.doc.activeElement, p.close, 'focus on Close');
    assert.ok(p.html.classList.contains('snap-modal-open'));
  });

  it('a middle click or a click with Ctrl, Cmd, Shift or Alt still opens the snap\'s page', () => {
    for (const init of [{ button: 1 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) {
      const p = page();
      assert.equal(p.links[0].fire('click', init).defaultPrevented, false, JSON.stringify(init));
      assert.deepEqual(p.calls, [], JSON.stringify(init));
    }
  });

  it('Next and Previous go through the page\'s snaps, round the ends; a snap with no caption hides the caption line', () => {
    const p = page();
    p.links[0].fire('click');
    p.next.fire('click');
    assert.equal(p.shown().caption, 'Pigs');
    p.next.fire('click');
    assert.deepEqual([p.shown().src, p.shown().caption, p.shown().captionHidden, p.shown().alt, p.shown().label], ['/players/910/snaps/30/picture', '', true, 'A snap', 'A snap']);
    assert.equal(p.shown().page, '/players/zz-ada/snaps/30/');
    p.next.fire('click');
    assert.deepEqual([p.shown().src, p.shown().captionHidden], ['/players/910/snaps/33/picture', false], 'after the last, the first');
    p.prev.fire('click');
    assert.equal(p.shown().download, '/players/910/snaps/30/download', 'before the first, the last');
    assert.equal(p.dialog.open, true);
  });

  it('the arrow keys step too; Escape closes it and the focus goes to the snap last shown', () => {
    const p = page();
    p.links[0].fire('click');
    const left = p.dialog.fire('keydown', { key: 'ArrowLeft' });
    assert.equal(left.defaultPrevented && left.stopped, true);
    assert.equal(p.shown().src, '/players/910/snaps/30/picture');
    p.dialog.fire('keydown', { key: 'ArrowRight' });
    p.dialog.fire('keydown', { key: 'ArrowRight' });
    assert.equal(p.shown().caption, 'Pigs');
    p.dialog.fire('keydown', { key: 'Escape' });
    assert.equal(p.dialog.open, false);
    assert.equal(p.doc.activeElement, p.links[1]);
    assert.equal(p.html.classList.contains('snap-modal-open'), false);
  });
});

/* ------------------------------------------------------------------ */
/* The look                                                             */
/* ------------------------------------------------------------------ */

describe('the snaps grid pop-up\'s look (style.css)', { skip: !HAS_SITE && 'no site repo' }, () => {
  it('cards say they open larger; Open snap page is a link in the words; the four buttons fit a phone; tokens only', () => {
    const css = site('style.css');
    assert.match(css, /\.profile-snap\[data-snap-open\] \{ cursor: zoom-in; \}/);
    assert.match(css, /\.snap-modal-links \{[^}]*\}/);
    assert.match(css, /\.csupport-modal \.snap-modal-actions, \.csupport-modal \.snap-modal-steps, \.profile-snaps-modal \.snap-modal-actions, \.profile-snaps-modal \.snap-modal-steps \{ gap: 6px; \}/);
    const lines = css.split('\n').filter((l) => /snap-modal-links|profile-snaps-modal|profile-snap\[data-snap-open\]/.test(l)).join('\n');
    assert.doesNotMatch(lines, /#[0-9a-f]{3,8}\b|rgba?\(|\b(black|white)\b/i, 'no literal colours');
  });
});
