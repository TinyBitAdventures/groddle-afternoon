/**
 * #585 (an empty Quests list on Firefox, not reproduced with stock ad blockers; likely a hiding rule
 * the player made): a bug report carries what the page can honestly learn about extensions changing
 * it. js/extension-marks.js (the bait check and the page marks, read only, never probing extension
 * URLs), features/bug-report-feature.js (context adblock and marks), and the site keeping the keys
 * (groddle-afternoon-site src/BugReports.php CONTEXT, the console's contextRows).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { BAIT_CLASSES, KNOWN_MARKS, MARKS_MAX, baitHidden, marksLine, pageMarks, startBaitCheck } from '../public/js/extension-marks.js?v=36c70f4b';
import { extensionContext, reportContext } from '../public/js/features/bug-report-feature.js?v=191cfb5e';

const root = join(import.meta.dirname, '..');

/** A tiny DOM: tags, ids, classes and attributes, and simple selectors (tag, .class, [attr], [attr="v"], [attr^="v"], comma lists). */
class El {
  constructor(tag, attrs = {}) {
    this.localName = tag;
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentNode = null;
  }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.localName === 'html'; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  append(...kids) { for (const k of kids) { k.parentNode = this; this.children.push(k); } }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; }
  set className(v) { this.attrs.class = v; }
  get className() { return this.attrs.class || ''; }
  matches(selector) { return selector.split(',').some((s) => simpleMatch(this, s.trim())); }
}

function simpleMatch(el, sel) {
  const m = /^([a-z0-9-]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i.exec(sel);
  if (!m) throw new SyntaxError(sel);
  if (m[1] && m[1] !== el.localName) return false;
  const classes = el.className.split(/\s+/);
  for (const c of m[2].split('.').filter(Boolean)) if (!classes.includes(c)) return false;
  for (const [, k, op, v] of m[3].matchAll(/\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/g)) {
    const have = el.getAttribute(k);
    if (have === null) return false;
    if (op === '=' && have !== v) return false;
    if (op === '^=' && !have.startsWith(v)) return false;
  }
  return true;
}

function fakeDoc() {
  const html = new El('html');
  const head = new El('head');
  const body = new El('body');
  html.append(head, body);
  const all = () => { const out = []; const walk = (n) => { out.push(n); n.children.forEach(walk); }; walk(html); return out; };
  return {
    documentElement: html, head, body,
    createElement: (tag) => { const n = new El(tag); n.style = {}; return n; },
    querySelectorAll: (sel) => (sel === '*' ? all() : all().filter((n) => n.matches(sel))),
    querySelector: (sel) => all().find((n) => n.matches(sel)) || null,
  };
}

/** The game's own page: its style and script in head, its windows in body. */
function gamePage() {
  const doc = fakeDoc();
  doc.head.append(new El('style'), new El('script', { src: 'js/data-urls.js' }), new El('link', { rel: 'stylesheet', href: 'style.css' }));
  const wrap = new El('div', { id: 'wrap' });
  wrap.append(new El('div', { id: 'quest-panel', class: 'ui-sheet' }));
  doc.body.append(wrap, new El('style', { id: 'bug-report-css' }));
  return doc;
}

describe('#585: what a report learns about extensions changing the page', () => {
  it('the game\'s own page has no marks', () => {
    assert.deepEqual(pageMarks(gamePage()), []);
    assert.equal(marksLine(gamePage()), '');
    assert.equal(marksLine(undefined), '', 'no document, no marks');
  });

  it('names known extensions from the traces they leave', () => {
    const doc = gamePage();
    doc.documentElement.setAttribute('data-darkreader-mode', 'dynamic');
    doc.documentElement.append(new El('style', { class: 'darkreader darkreader--fallback' }));
    doc.body.setAttribute('data-new-gr-c-s-check-loaded', '14.1');
    doc.body.setAttribute('data-gr-ext-installed', '');
    doc.body.append(new El('grammarly-desktop-integration'));
    doc.documentElement.setAttribute('data-lt-installed', 'true');
    // A Stylus user style: the kind of hiding rule #585 most likely came from.
    doc.documentElement.append(new El('style', { id: 'stylus-3', class: 'stylus' }));
    assert.deepEqual(pageMarks(doc), ['Dark Reader', 'Grammarly', 'LanguageTool', 'Stylus']);
  });

  it('counts traces it does not know: custom elements, tags straight under <html>, extension files already in the page', () => {
    const doc = gamePage();
    doc.documentElement.append(new El('style'), new El('style'), new El('script'));
    doc.body.append(new El('foo-helper'), new El('foo-helper'), new El('bar-widget'));
    doc.head.append(new El('link', { rel: 'stylesheet', href: 'moz-extension://0a1b/content.css' }));
    doc.body.append(new El('img', { src: 'chrome-extension://abc/icon.png' }));
    assert.deepEqual(pageMarks(doc), ['2 other elements (foo-helper, bar-widget)', '2 injected style tags', '1 injected script', '2 extension files']);
    assert.equal(marksLine(doc), '2 other elements (foo-helper, bar-widget), 2 injected style tags, 1 injected script, 2 extension files');
  });

  it('keeps the line short and the table easy to extend', () => {
    const doc = gamePage();
    for (let i = 0; i < 40; i += 1) doc.body.append(new El(`very-long-custom-element-name-${i}`));
    for (let i = 0; i < 300; i += 1) doc.documentElement.append(new El('style'));
    assert.ok(marksLine(doc).length <= MARKS_MAX);
    const more = [...KNOWN_MARKS, { name: 'Foo Helper', selector: 'foo-helper' }];
    const d2 = gamePage();
    d2.body.append(new El('foo-helper'));
    assert.deepEqual(pageMarks(d2, more), ['Foo Helper'], 'a known custom element is named, not counted');
    for (const m of KNOWN_MARKS) assert.ok(m.name && m.selector && !/[—–]/.test(m.name), m.name);
  });

  it('never asks for an extension\'s files: it only reads the page', () => {
    const src = readFileSync(join(root, 'public/js/extension-marks.js'), 'utf8');
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|new Image\(|\.src\s*=|import\(/);
  });

  it('the bait: hidden, removed or no size is an ad blocker; shown is none', () => {
    const win = (style) => ({ getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', ...style }) });
    const shown = { isConnected: true, getClientRects: () => [{}], getBoundingClientRect: () => ({ width: 4, height: 4 }) };
    assert.equal(baitHidden(shown, win({})), false);
    assert.equal(baitHidden(shown, win({ display: 'none' })), true);
    assert.equal(baitHidden(shown, win({ visibility: 'hidden' })), true);
    assert.equal(baitHidden({ ...shown, isConnected: false }, win({})), true, 'removed');
    assert.equal(baitHidden({ ...shown, getClientRects: () => [] }, win({})), true, 'no box');
    assert.equal(baitHidden({ ...shown, getBoundingClientRect: () => ({ width: 4, height: 0 }) }, win({})), true, 'no height');
    assert.match(BAIT_CLASSES, /\badsbox\b/);
    assert.match(BAIT_CLASSES, /\bpub_300x250\b/);
  });

  it('the bait check puts the bait off screen, reads it after a frame and a wait, then takes it away', () => {
    const doc = gamePage();
    const timers = [];
    const frames = [];
    let hide = false;
    const win = {
      requestAnimationFrame: (f) => frames.push(f),
      setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; },
      clearTimeout: () => {},
      getComputedStyle: () => ({ display: hide ? 'none' : 'block', visibility: 'visible', opacity: '1' }),
    };
    const check = startBaitCheck({ doc, win, wait: 600 });
    const bait = doc.querySelector('[data-report-bait]');
    assert.ok(bait, 'placed');
    assert.equal(bait.parentNode, doc.body, 'in body, outside #wrap (never in the picture)');
    assert.equal(bait.className, BAIT_CLASSES);
    assert.equal(bait.getAttribute('aria-hidden'), 'true');
    assert.match(bait.style.cssText, /left:-10000px/);
    bait.getClientRects = () => [{}];
    bait.getBoundingClientRect = () => ({ width: 4, height: 4 });
    assert.equal(frames.length, 1);
    frames[0]();
    assert.equal(timers[0][1], 600);
    hide = true; // an ad blocker's rule arrives
    timers[0][0]();
    assert.equal(check.read(), 'yes');
    assert.equal(doc.querySelector('[data-report-bait]'), null, 'removed');
    // Shown, early read: answered at once.
    const doc2 = gamePage();
    hide = false;
    const early = startBaitCheck({ doc: doc2, win });
    const b2 = doc2.querySelector('[data-report-bait]');
    b2.getClientRects = () => [{}];
    b2.getBoundingClientRect = () => ({ width: 4, height: 4 });
    assert.equal(early.read(), 'no');
    early.stop();
    assert.equal(doc2.querySelector('[data-report-bait]'), null);
    assert.equal(early.read(), 'no', 'the answer stays');
  });

  it('the report\'s context carries adblock and marks', () => {
    const doc = gamePage();
    doc.documentElement.setAttribute('data-darkreader-scheme', 'dark');
    assert.deepEqual(extensionContext({ read: () => 'yes' }, doc), { adblock: 'yes', marks: 'Dark Reader' });
    assert.deepEqual(extensionContext(null, doc), { adblock: '', marks: 'Dark Reader' });
    doc.getElementById = () => null;
    const ctx = reportContext({}, [], { document: doc, location: { pathname: '/play/online/' }, navigator: { userAgent: 'T' }, innerWidth: 1, innerHeight: 1 }, { read: () => 'no' });
    assert.equal(ctx.adblock, 'no');
    assert.equal(ctx.marks, 'Dark Reader');
    const src = readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8');
    assert.match(src, /bait = startBaitCheck\(\)/, 'the check runs as the new report form opens');
  });

  it('the site keeps the keys, cut short, and the console shows them', { skip: skipWithoutSite }, async () => {
    const php = readFileSync(sitePath('src/BugReports.php'), 'utf8');
    assert.match(php, /'adblock' => 8, 'marks' => 200, 'extensions' => 200\]/);
    const mod = await import(pathToFileURL(sitePath('console/console.js')).href);
    assert.deepEqual(mod.contextRows({ agent: 'Firefox/160', adblock: 'yes', marks: 'Stylus', extensions: 'uBlock Origin' }), [['Browser', 'Firefox/160'], ['Ad blocker', 'yes'], ['Extension marks', 'Stylus'], ['Extensions (player)', 'uBlock Origin']]);
  });
});
