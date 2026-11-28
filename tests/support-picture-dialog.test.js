/**
 * A Support report's pictures open in the site's picture pop-up (Austin 2026-11-27: "Images embedded
 * here: /chat/support/694/ need the same open in dialog treatment [as the snap page]. Currently they
 * open directly which isn't very helpful."). Ours: Glitch had no web support pages and no pop-up viewer.
 *
 * - The page: groddle-afternoon-site src/SupportPages.php reportPage, messageHtml and pictureDialog,
 *   rendered on a throwaway MariaDB database by tests/fixtures/support/support-picture-dialog.php
 *   (three pictures: the report's own, two with a reply). Each thumbnail stays a link to the picture
 *   (no script, or a modifier click, opens it as before) and carries the pop-up's hooks: its line (who
 *   sent it and when) and its download name. The dialog is drawn closed with the first picture.
 * - The script: community/picture-dialog.js (shared with a Snap's page, tests/snap-modal.test.js),
 *   run here against a small fake page: plain clicks only, Previous and Next (buttons and arrow
 *   keys, round the ends), Escape, the backdrop and Close, the focus back on the picture last shown.
 * - Its wiring: community.js imports it by the import map (content key) for each view; the
 *   Community pages' key moves on.
 * - Access is unchanged: another player's picture is still the site's 404.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/support-picture-dialog.test.js
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
const HAS_SITE = existsSync(join(SITE_DIR, 'src/SupportPages.php'));
const HAS_MODULE = existsSync(join(SITE_DIR, 'community/picture-dialog.js'));
const mod = HAS_MODULE ? await import(pathToFileURL(join(SITE_DIR, 'community/picture-dialog.js')).href) : {};
const ENGINE = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');

function mysql() {
  const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, 'utf8');
  const def = (k) => (text.match(new RegExp(`define\\(\\s*'${k}'\\s*,\\s*'([^']*)'`)) || [])[1];
  return def('DB_HOST') && def('DB_USER') ? { host: def('DB_HOST'), user: def('DB_USER'), pass: def('DB_PASSWORD') || '' } : null;
}
const db = mysql();
const reachable = db && HAS_PHP && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = (!HAS_SITE && 'no site repo') || phpSkip('mysqli', 'gd')
  || (!existsSync(join(ENGINE, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

/** A tag's attributes (the server's own markup, well formed). */
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-z-]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&amp;/g, '&');
  return out;
}

/* ------------------------------------------------------------------ */
/* The rendered page                                                    */
/* ------------------------------------------------------------------ */

describe('a Support report with three pictures (src/SupportPages.php, throwaway database)', { skip: skipDb }, () => {
  let r;
  let html;
  let id;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [join(GAME_DIR, 'tests/fixtures/support/support-picture-dialog.php'), ENGINE, SITE_DIR, db.host, db.user, db.pass], { timeout: 120000, maxBuffer: 32 * 1024 * 1024 }).toString());
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true, 'throwaway database dropped');
    assert.equal(r.made.status, 303, r.made.error);
    assert.equal(r.made.replied, 303);
    assert.equal(r.page.status, 200, r.page.error);
    html = r.page.body;
    id = r.made.id;
  });

  it('without the script: every thumbnail is still a link to its picture, in a new tab', () => {
    const links = [...html.matchAll(/<a class="csupport-pic"[^>]*>/g)].map((m) => attrs(m[0]));
    assert.equal(links.length, 3);
    assert.equal(links[0].href, `/report-pictures/${id}`, 'the report\'s own picture first');
    assert.match(links[1].href, new RegExp(`^/report-pictures/${id}/\\d+/1$`));
    assert.equal(links[2].href, links[1].href.replace(/1$/, '2'), 'then the reply\'s two');
    for (const a of links) {
      assert.equal(a.target, '_blank');
      assert.equal(a.rel, 'noopener');
    }
  });

  it('each thumbnail carries the pop-up\'s hooks: who sent it and when, and its name among the report\'s pictures', () => {
    const links = [...html.matchAll(/<a class="csupport-pic"[^>]*>/g)].map((m) => attrs(m[0]));
    for (const a of links) assert.ok(Object.hasOwn(a, 'data-snap-open'), a.href);
    assert.deepEqual(links.map((a) => a['data-snap-name']), [1, 2, 3].map((n) => `report-${id}-picture-${n}.jpg`));
    for (const a of links) assert.match(a['data-snap-line'], /^Sent by you · (just now|\d+ minutes? ago)$/);
  });

  it('carries one closed dialog: the first picture, its count and line, Previous, Next, a real Download link and Close', () => {
    const dialog = html.match(/<dialog class="snap-modal csupport-modal"[\s\S]*?<\/dialog>/)?.[0];
    assert.ok(dialog, 'the dialog');
    assert.equal(html.match(/<dialog/g).length, 1, 'one for the whole report');
    const tag = attrs(dialog.match(/<dialog[^>]*>/)[0]);
    assert.ok(Object.hasOwn(tag, 'data-snap-modal'));
    assert.equal(tag.open, undefined, 'closed until the script opens it');
    assert.equal(tag['aria-label'], 'Picture 1 of 3');
    const img = attrs(dialog.match(/<img[^>]*>/)[0]);
    assert.equal(img.src, `/report-pictures/${id}`);
    assert.deepEqual([img.width, img.height], ['500', '300']);
    assert.ok(Object.hasOwn(img, 'data-snap-img'));
    assert.match(dialog, /<p class="snap-modal-caption" data-snap-count="">Picture 1 of 3<\/p>/);
    assert.match(dialog, /<p class="snap-modal-meta" data-snap-meta="">Sent by you · [^<]+<\/p>/);
    assert.match(dialog, /<button type="button" class="snap-modal-step" data-snap-prev="">Previous<\/button><button type="button" class="snap-modal-step" data-snap-next="">Next<\/button>/);
    const dl = attrs(dialog.match(/<a class="snap-modal-download"[^>]*>/)[0]);
    assert.equal(dl.href, `/report-pictures/${id}`);
    assert.equal(dl.download, `report-${id}-picture-1.jpg`);
    assert.match(dialog, /<button type="button" class="snap-modal-close" data-snap-close="">Close<\/button>/);
    assert.doesNotMatch(dialog, /—/, 'no em dashes');
    // Inside the report's section, so a move around /chat/ in place brings it with the view.
    const section = html.slice(html.indexOf('data-support-report='), html.indexOf('</section>', html.indexOf('data-support-report=')));
    assert.ok(section.includes('<dialog class="snap-modal'), 'in the report\'s section');
  });

  it('access is unchanged: Ada sees her own pictures; Bea\'s picture and report are the site\'s 404 to her', () => {
    assert.deepEqual(r.routes.adaOwn, [200, 200, 200]);
    assert.equal(r.routes.adaBea, 404, 'another player\'s picture');
    assert.equal(r.bea.pageForAda, 404, 'another player\'s report');
    assert.equal(r.routes.beaBea, 200, 'Bea\'s own');
    assert.equal(r.routes.beaAda, 404, 'Ada\'s picture to Bea');
    assert.equal(r.routes.outAda, 404, 'signed out');
  });
});

/* ------------------------------------------------------------------ */
/* The script                                                           */
/* ------------------------------------------------------------------ */

class El {
  constructor(doc, tag, a = {}) {
    Object.assign(this, { doc, tag, a: { ...a }, children: [], listeners: {}, open: false, textContent: '' });
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

/** A report's page as the server draws it: three thumbnails in two messages, the closed dialog. */
function page() {
  const doc = { activeElement: null };
  const e = (tag, a) => new El(doc, tag, a);
  const classes = new Set();
  const html = e('html');
  html.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) };
  const pics = [
    ['/report-pictures/694', 500, 300, 'A picture you sent (1)', 'Sent by you · 2 hours ago'],
    ['/report-pictures/694/12/1', 400, 240, 'A picture you sent (1)', 'Sent by you · 5 minutes ago'],
    ['/report-pictures/694/12/2', 240, 400, 'A picture you sent (2)', 'Sent by you · 5 minutes ago'],
  ];
  const links = pics.map(([href, w, h, alt, line], i) => e('a', { href, target: '_blank', 'data-snap-open': '', 'data-snap-line': line, 'data-snap-name': `report-694-picture-${i + 1}.jpg` })
    .add(e('img', { src: href, width: String(w), height: String(h), alt })));
  const img = e('img', { 'data-snap-img': '', src: pics[0][0], width: '500', height: '300', alt: pics[0][3] });
  const count = e('p', { 'data-snap-count': '' });
  count.textContent = 'Picture 1 of 3';
  const meta = e('p', { 'data-snap-meta': '' });
  meta.textContent = pics[0][4];
  const prev = e('button', { 'data-snap-prev': '' });
  const next = e('button', { 'data-snap-next': '' });
  const download = e('a', { 'data-snap-download': '', href: pics[0][0], download: 'report-694-picture-1.jpg' });
  const close = e('button', { 'data-snap-close': '' });
  const inner = e('div').add(img, e('div').add(count, meta), e('div').add(prev, next, download, close));
  const dialog = e('dialog', { 'data-snap-modal': '', 'aria-label': 'Picture 1 of 3' }).add(inner);
  const calls = [];
  dialog.showModal = () => { calls.push('showModal'); dialog.open = true; };
  dialog.close = () => { if (!dialog.open) return; calls.push('close'); dialog.open = false; dialog.fire('close'); };
  const section = e('section').add(...links, dialog);
  html.add(section);
  section.ownerDocument = doc;
  doc.documentElement = html;
  const stop = mod.wirePictureDialog(section);
  const shown = () => ({ src: img.src, w: img.getAttribute('width'), h: img.getAttribute('height'), count: count.textContent, meta: meta.textContent, href: download.href, name: download.getAttribute('download'), label: dialog.getAttribute('aria-label') });
  return { doc, html, links, dialog, img, prev, next, download, close, inner, calls, stop, shown };
}

describe('community/picture-dialog.js: a report\'s pictures in the pop-up (groddle-afternoon-site)', { skip: !HAS_MODULE && 'no site repo (or main without the shared pop-up)' }, () => {
  it('a plain click on the second picture opens the dialog on it, not the link: its picture, count, line and download', () => {
    const p = page();
    assert.equal(p.links[1].fire('click').defaultPrevented, true, 'the link is not followed');
    assert.deepEqual(p.calls, ['showModal']);
    assert.deepEqual(p.shown(), { src: '/report-pictures/694/12/1', w: '400', h: '240', count: 'Picture 2 of 3', meta: 'Sent by you · 5 minutes ago', href: '/report-pictures/694/12/1', name: 'report-694-picture-2.jpg', label: 'Picture 2 of 3' });
    assert.equal(p.doc.activeElement, p.close, 'focus on Close');
    assert.ok(p.html.classList.contains('snap-modal-open'), 'the page behind is held still');
  });

  it('a middle click or a click with Ctrl, Cmd, Shift or Alt still opens the picture itself', () => {
    for (const init of [{ button: 1 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) {
      const p = page();
      const ev = p.links[2].fire('click', init);
      assert.equal(ev.defaultPrevented, Boolean(init.defaultPrevented), JSON.stringify(init));
      assert.deepEqual(p.calls, [], JSON.stringify(init));
    }
  });

  it('Next and Previous go between all the report\'s pictures, round the ends', () => {
    const p = page();
    p.links[0].fire('click');
    p.next.fire('click');
    assert.equal(p.shown().count, 'Picture 2 of 3');
    p.next.fire('click');
    assert.deepEqual([p.shown().src, p.shown().w, p.shown().h, p.shown().name], ['/report-pictures/694/12/2', '240', '400', 'report-694-picture-3.jpg']);
    p.next.fire('click');
    assert.equal(p.shown().count, 'Picture 1 of 3', 'after the last, the first');
    assert.equal(p.shown().meta, 'Sent by you · 2 hours ago');
    p.prev.fire('click');
    assert.equal(p.shown().count, 'Picture 3 of 3', 'before the first, the last');
    assert.equal(p.dialog.open, true);
  });

  it('the arrow keys step too, and the page behind never sees them; other keys do nothing', () => {
    const p = page();
    p.links[0].fire('click');
    const right = p.dialog.fire('keydown', { key: 'ArrowRight' });
    assert.equal(p.shown().count, 'Picture 2 of 3');
    assert.equal(right.defaultPrevented && right.stopped, true);
    p.dialog.fire('keydown', { key: 'ArrowLeft' });
    p.dialog.fire('keydown', { key: 'ArrowLeft' });
    assert.equal(p.shown().count, 'Picture 3 of 3');
    p.dialog.fire('keydown', { key: 'ArrowLeft', altKey: true });
    p.dialog.fire('keydown', { key: 'Enter' });
    assert.equal(p.shown().count, 'Picture 3 of 3');
    assert.equal(p.dialog.open, true);
  });

  it('Escape closes it, and the focus goes to the picture last shown', () => {
    const p = page();
    p.links[0].fire('click');
    p.next.fire('click');
    p.dialog.fire('keydown', { key: 'Escape' });
    assert.equal(p.dialog.open, false);
    assert.equal(p.doc.activeElement, p.links[1]);
    assert.equal(p.html.classList.contains('snap-modal-open'), false, 'the page scrolls again');
  });

  it('a click on the backdrop closes it; a click inside, or a drag from inside out, does not; Close closes it', () => {
    const p = page();
    p.links[2].fire('click');
    p.dialog.fire('pointerdown', { target: p.inner });
    p.dialog.fire('click', { target: p.inner });
    assert.equal(p.dialog.open, true, 'a click on the picture or words');
    p.dialog.fire('pointerdown', { target: p.inner });
    p.dialog.fire('click', { target: p.dialog });
    assert.equal(p.dialog.open, true, 'a drag that ends on the backdrop');
    p.dialog.fire('pointerdown', { target: p.dialog });
    p.dialog.fire('click', { target: p.dialog });
    assert.equal(p.dialog.open, false, 'the backdrop');
    assert.equal(p.doc.activeElement, p.links[2]);
    p.links[0].fire('click');
    p.close.fire('click');
    assert.equal(p.dialog.open, false, 'Close');
  });

  it('a view that goes away while it is open (Back inside /chat/) closes it and lets the page scroll', () => {
    const p = page();
    p.links[0].fire('click');
    p.stop();
    assert.equal(p.dialog.open, false);
    assert.equal(p.html.classList.contains('snap-modal-open'), false);
    p.links[0].fire('click');
    assert.equal(p.dialog.open, false, 'unhooked');
  });

  it('starts itself only outside the Community app (a Snap\'s page), where community.js wires each view', () => {
    const js = site('community/picture-dialog.js');
    assert.match(js, /if \(typeof document !== 'undefined' && !document\.querySelector\('main\[data-community\]'\)\) wirePictureDialog\(document\);\s*$/);
  });
});

/* ------------------------------------------------------------------ */
/* The wiring and the keys                                              */
/* ------------------------------------------------------------------ */

describe('community.js wires the pop-up on a report, by a key that moves with the file', { skip: !HAS_SITE && 'no site repo' }, () => {
  it('imports picture-dialog.js by its bare address (the import map\'s content key) and stops it with the view', () => {
    const js = site('community/community.js');
    assert.match(js, /const supportPictures = supportReport\?\.querySelector\('\[data-snap-modal\]'\) \? supportReport : null;/);
    assert.match(js, /import\('\/wp-content\/themes\/groddle\/community\/picture-dialog\.js'\)\s*\.then\(\(m\) => \{ if \(!gone\) stopPictures = m\.wirePictureDialog\(supportPictures\); \}\)/);
    assert.match(js, /stops\.push\(\(\) => \{ gone = true; stopPictures\?\.\(\); \}\)/);
    assert.match(site('src/Extension.php'), /'\/wp-content\/themes\/groddle\/community\/picture-dialog\.js',\n {4}\];/, 'in MODULE_IMPORTS');
    assert.match(site('src/CommunityPages.php'), /ASSET_KEY = 'community-25'/, 'community.js changed, so its key moved');
  });

  it('the look is the Snap\'s (style.css .snap-modal) with Previous and Next in the same buttons, tokens only', () => {
    const css = site('style.css');
    assert.match(css, /\.snap-modal-download, \.snap-modal-close, \.snap-modal-step \{ display: inline-flex;/);
    assert.match(css, /\.snap-modal-download:focus-visible, \.snap-modal-close:focus-visible, \.snap-modal-step:focus-visible \{ outline: 3px solid var\(--accent\)/);
    const lines = css.split('\n').filter((l) => /snap-modal-step/.test(l)).join('\n');
    assert.doesNotMatch(lines, /#[0-9a-f]{3,8}\b|rgba?\(|\b(black|white)\b/i, 'no literal colours');
  });
});
