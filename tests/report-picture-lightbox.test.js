// Austin 2026-11-03 (his screenshot: "Open the picture full size" opened a whole new browser tab):
// a report's picture opens over the game instead, in js/ui/picture-lightbox.js. Fitted to the
// window (92vw by 88vh, a small picture at its own size), zoom to actual size and back, Esc closes
// the picture only, keys never reach the game or the window behind, focus goes back the shared way
// (js/ui/focus-return.js) with the report window standing in for the world.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIGHTBOX_FIT, LIGHTBOX_PAN_STEP, LIGHTBOX_TEXT, fitPicture, lightboxFocusTarget, lightboxLink, openLightbox, plainClick, zoomScroll } from '../public/js/ui/picture-lightbox.js?v=0d2814c8';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=ee8a262f';
import { REPORT_TEXT } from '../public/js/reports.js?v=782a6e42';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

// —— A small DOM with bubbling, enough for the lightbox and the sheet ——
class Node {
  constructor(tag, doc) {
    Object.assign(this, { tagName: String(tag).toUpperCase(), ownerDocument: doc, children: [], attrs: {}, listeners: {}, dataset: {}, parentNode: null, _text: '', hidden: false, disabled: false, value: '', className: '', style: {}, scrollLeft: 0, scrollTop: 0, clientWidth: 0, clientHeight: 0 });
    const self = this;
    this.classList = {
      toggle(c, on) { const set = new Set(self.className.split(/\s+/).filter(Boolean)); if (on) set.add(c); else set.delete(c); self.className = [...set].join(' '); },
      contains: (c) => self.className.split(/\s+/).includes(c),
    };
  }
  setAttribute(k, v) {
    if (k === 'hidden') { this.hidden = true; return; }
    if (k === 'class') { this.className = String(v); return; }
    if (k === 'id') this.id = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    this.attrs[k] = String(v);
  }
  removeAttribute(k) {
    delete this.attrs[k];
    if (k.startsWith('data-')) delete this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  append(...ns) { for (const n of ns) { const c = typeof n === 'string' ? Object.assign(new Node('#text', this.ownerDocument), { _text: n }) : n; c.parentNode = this; this.children.push(c); } }
  replaceChildren(...ns) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...ns); }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument.documentElement; }
  get lastElementChild() { return this.children.at(-1) || null; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 50 }; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  find(pred) { return this.all().find(pred) || null; }
  querySelector() { return null; }
}
function fakeDoc() {
  const doc = { activeElement: null };
  doc.createElement = (t) => new Node(t, doc);
  doc.createTextNode = (t) => Object.assign(new Node('#text', doc), { _text: String(t) });
  doc.documentElement = new Node('html', doc);
  return doc;
}
/** Fires an event at `node` and bubbles it up; returns the event (stopped, prevented). */
function fire(node, kind, init = {}) {
  const ev = { type: kind, target: node, button: 0, detail: 1, stopped: false, prevented: false, ...init };
  ev.stopPropagation = () => { ev.stopped = true; };
  ev.preventDefault = () => { ev.prevented = true; };
  for (let n = node; n && !ev.stopped; n = n.parentNode) for (const fn of n.listeners[kind] || []) fn(ev);
  return ev;
}
const byData = (r, k) => r.find((n) => k in n.dataset);
const fakeWin = (w = 1440, h = 900) => ({ innerWidth: w, innerHeight: h, listeners: {}, addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }, removeEventListener(k, fn) { this.listeners[k] = (this.listeners[k] || []).filter((f) => f !== fn); } });
/** How focus-return.js's installFocusReturn would have recorded the presses. */
function pressed(doc, link, how, last = how) {
  const map = new WeakMap();
  if (link) map.set(link, how);
  doc.__inputIntent = { last, pressed: map };
}

/** The lightbox on its own, in a host on the page, with the game's key listener above it. */
function stage({ w = 1280, h = 720, win = fakeWin(1024, 768) } = {}) {
  const doc = fakeDoc();
  const page = new Node('body', doc);
  doc.documentElement.append(page);
  const game = [];
  page.addEventListener('keydown', (ev) => game.push(ev.key));
  page.addEventListener('keyup', (ev) => game.push(`up:${ev.key}`));
  const host = new Node('div', doc);
  const behind = new Node('h2', doc);
  const link = new Node('a', doc);
  link.setAttribute('href', '/report-pictures/7');
  host.append(behind, link);
  page.append(host);
  const closed = [];
  const box = openLightbox({ doc, host, src: '/report-pictures/7', width: w, height: h, alt: 'The game', label: 'Report picture', opener: () => link, fallback: () => behind, win, onClose: (to) => closed.push(to) });
  return { doc, page, host, behind, link, box, game, closed, win };
}

describe('the picture lightbox: the rules', () => {
  it('fits the picture to 92% by 88% of the window, keeping its shape, and never enlarges it', () => {
    assert.deepEqual(LIGHTBOX_FIT, { w: 0.92, h: 0.88 });
    const big = fitPicture(1280, 720, 1024, 768);
    assert.equal(big.width, Math.round(1024 * 0.92));
    assert.ok(Math.abs(big.width / big.height - 1280 / 720) < 0.01, 'its shape is kept');
    assert.equal(big.zoomable, true);
    const tall = fitPicture(1280, 1280, 1440, 900);
    assert.equal(tall.height, Math.round(900 * 0.88), 'a tall one fits the height');
    const small = fitPicture(400, 300, 1440, 900);
    assert.deepEqual([small.width, small.height, small.scale, small.zoomable], [400, 300, 1, false], 'a small picture shows at its own size, no zoom');
    assert.equal(fitPicture(0, 0, 1440, 900).zoomable, false);
  });

  it('keeps the clicked spot in view at actual size, inside the picture', () => {
    assert.deepEqual(zoomScroll(0.5, 0.5, 1280, 720, 1000, 600), { left: 140, top: 60 });
    assert.deepEqual(zoomScroll(0, 0, 1280, 720, 1000, 600), { left: 0, top: 0 });
    assert.deepEqual(zoomScroll(1, 1, 1280, 720, 1000, 600), { left: 280, top: 120 });
    assert.deepEqual(zoomScroll(0.9, 0.9, 400, 300, 1000, 600), { left: 0, top: 0 }, 'smaller than the view: no scroll');
  });

  it('a plain click opens it; Cmd, Ctrl, Shift, Alt or a middle click keep the browser tab', () => {
    assert.equal(plainClick({ button: 0 }), true);
    for (const ev of [{ button: 1 }, { button: 0, metaKey: true }, { button: 0, ctrlKey: true }, { button: 0, shiftKey: true }, { button: 0, altKey: true }]) assert.equal(plainClick(ev), false, JSON.stringify(ev));
  });

  it('focus goes back the shared way: the picture after a keyboard open and close, else the window behind', () => {
    assert.equal(lightboxFocusTarget({ openerPressed: 'keyboard', last: 'keyboard' }), 'opener');
    assert.equal(lightboxFocusTarget({ openerPressed: 'pointer', last: 'keyboard' }), 'window', 'clicked open, Esc closed');
    assert.equal(lightboxFocusTarget({ openerPressed: 'keyboard', last: 'pointer' }), 'window', 'closed with the pointer');
    assert.equal(lightboxFocusTarget({}), 'opener', 'without tracking, as before');
  });

  it('has its words, with no em dashes', () => {
    for (const v of Object.values(LIGHTBOX_TEXT)) assert.doesNotMatch(v, /—/);
    assert.equal(REPORT_TEXT.pictureLabel, 'Report picture');
    assert.equal(LIGHTBOX_TEXT.newTab, 'Open in a new tab');
  });
});

describe('the picture lightbox: opening and closing', () => {
  it('opens as a labelled modal dialog over its host with the picture, zoom, a new-tab link and close, and takes focus', () => {
    const { doc, host, box } = stage();
    const lb = byData(host, 'pictureLightbox');
    assert.equal(lb, box.root);
    assert.equal(lb.getAttribute('role'), 'dialog');
    assert.equal(lb.getAttribute('aria-modal'), 'true');
    assert.equal(lb.getAttribute('aria-label'), 'Report picture');
    const img = byData(lb, 'pictureLightboxImg');
    assert.equal(img.getAttribute('src'), '/report-pictures/7');
    assert.equal(img.getAttribute('width'), '1280');
    const tab = byData(lb, 'pictureLightboxTab');
    assert.equal(tab.getAttribute('href'), '/report-pictures/7');
    assert.equal(tab.getAttribute('target'), '_blank');
    assert.equal(tab.getAttribute('rel'), 'noopener');
    assert.equal(byData(lb, 'pictureLightboxZoom').hidden, false, 'bigger than the window: zoom shows');
    assert.equal(doc.activeElement, lb, 'focus moves in, on the dialog: a stray Space presses nothing');
  });

  it('Esc closes the picture only: the key stops at the lightbox', () => {
    const { doc, host, box, game, behind, link } = stage();
    pressed(doc, link, 'keyboard');
    const heard = [];
    host.addEventListener('keydown', (ev) => heard.push(ev.key));
    const ev = fire(doc.activeElement, 'keydown', { key: 'Escape' });
    assert.equal(ev.stopped, true);
    assert.equal(ev.prevented, true);
    assert.equal(box.open, false);
    assert.equal(byData(host, 'pictureLightbox'), null, 'gone from the page');
    assert.deepEqual(heard, [], 'the window behind never hears Esc');
    assert.deepEqual(game, [], 'nor the game');
    assert.equal(doc.activeElement, link, 'keyboard open and close: back on the picture');
    assert.notEqual(doc.activeElement, behind);
  });

  it('no key reaches the game while it is open: no walking, no jumping', () => {
    const { doc, box, game } = stage();
    for (const key of ['ArrowRight', 'ArrowLeft', ' ', 'a', 'd', 'Enter', 'w', 'c']) {
      for (const kind of ['keydown', 'keyup', 'keypress']) assert.equal(fire(box.root, kind, { key }).stopped, true, `${kind} ${key}`);
      fire(doc.activeElement, 'keydown', { key });
    }
    assert.deepEqual(game, []);
    assert.equal(box.open, true, 'only Esc closes it');
    assert.equal(doc.activeElement, box.root);
  });

  it('Tab stays inside', () => {
    const { doc, box } = stage();
    const order = [];
    for (let i = 0; i < 4; i++) { fire(doc.activeElement, 'keydown', { key: 'Tab' }); order.push(Object.keys(doc.activeElement.dataset)[0]); }
    assert.deepEqual(order, ['pictureLightboxZoom', 'pictureLightboxTab', 'pictureLightboxClose', 'pictureLightboxZoom']);
    fire(doc.activeElement, 'keydown', { key: 'Tab', shiftKey: true });
    assert.equal(doc.activeElement, byData(box.root, 'pictureLightboxClose'));
  });

  it('a held Enter that opened it does not press its close button', () => {
    const { doc, box } = stage();
    const ev = fire(doc.activeElement, 'keydown', { key: 'Enter', repeat: true });
    assert.equal(ev.prevented, true);
    assert.equal(box.open, true);
  });

  it('a click on the backdrop closes it; a click on the picture or the bar does not', () => {
    const { doc, box, behind, link } = stage();
    pressed(doc, link, 'pointer');
    fire(byData(box.root, 'pictureLightboxTab'), 'click');
    assert.equal(box.open, true, 'the new-tab link stays the browser\'s');
    fire(box.root.find((n) => n.className === 'picture-lightbox-bar'), 'click');
    assert.equal(box.open, true);
    fire(byData(box.root, 'pictureLightboxStage'), 'click', { offsetX: 10, offsetY: 10 });
    assert.equal(box.open, false);
    assert.equal(doc.activeElement, behind, 'a pointer open and close: focus stays in the report window, not the world');
  });

  it('the close button closes it; clicked open with the pointer, focus goes to the window behind even after Esc', () => {
    const a = stage();
    pressed(a.doc, a.link, 'pointer');
    fire(byData(a.box.root, 'pictureLightboxClose'), 'click');
    assert.equal(a.box.open, false);
    assert.equal(a.doc.activeElement, a.behind);
    assert.deepEqual(a.closed, ['window']);
    const b = stage();
    pressed(b.doc, b.link, 'pointer', 'keyboard');
    fire(b.doc.activeElement, 'keydown', { key: 'Escape' });
    assert.equal(b.doc.activeElement, b.behind);
  });

  it('zooms between fit and actual size: the picture, the button and the + and - keys; the arrows pan at actual size', () => {
    const { doc, box } = stage();
    const img = byData(box.root, 'pictureLightboxImg');
    const zoom = byData(box.root, 'pictureLightboxZoom');
    const st = byData(box.root, 'pictureLightboxStage');
    Object.assign(st, { clientWidth: 1000, clientHeight: 600 });
    fire(img, 'click', { clientX: 100, clientY: 50 });
    assert.equal(box.zoomed, true);
    assert.ok('zoomed' in box.root.dataset);
    assert.equal(img.style.width, '1280px');
    assert.deepEqual([st.scrollLeft, st.scrollTop], [280, 120], 'the clicked corner stays in view');
    assert.equal(zoom.getAttribute('aria-pressed'), 'true');
    assert.equal(zoom.getAttribute('aria-label'), LIGHTBOX_TEXT.zoomOut);
    assert.equal(box.open, true, 'a click on the picture never closes it');
    fire(doc.activeElement, 'keydown', { key: 'ArrowLeft' });
    assert.equal(st.scrollLeft, 280 - LIGHTBOX_PAN_STEP);
    fire(doc.activeElement, 'keydown', { key: '-' });
    assert.equal(box.zoomed, false);
    assert.equal(img.style.width, '');
    fire(doc.activeElement, 'keydown', { key: '+' });
    assert.equal(box.zoomed, true);
    fire(zoom, 'click');
    assert.equal(box.zoomed, false);
    assert.equal(zoom.getAttribute('aria-label'), LIGHTBOX_TEXT.zoomIn);
  });

  it('a drag at actual size pans and is not a click', () => {
    const { box } = stage();
    const img = byData(box.root, 'pictureLightboxImg');
    const st = byData(box.root, 'pictureLightboxStage');
    Object.assign(st, { clientWidth: 1000, clientHeight: 600 });
    box.zoom(true);
    const left = st.scrollLeft;
    fire(img, 'pointerdown', { pointerId: 1, clientX: 300, clientY: 300 });
    fire(img, 'pointermove', { pointerId: 1, clientX: 260, clientY: 300 });
    fire(img, 'pointerup', { pointerId: 1 });
    assert.equal(st.scrollLeft, left + 40);
    fire(img, 'click', { clientX: 10, clientY: 10 });
    assert.equal(box.zoomed, true, 'the click that ends a drag does not zoom out');
    assert.equal(box.open, true);
  });

  it('a report picture (1280 by 720) fits a 1440 window as it is: no zoom there', () => {
    const { box } = stage({ win: fakeWin(1440, 900) });
    assert.equal(box.zoomable, false);
    // 1280 by 800 fits at 99%: no zoom for a 1% step (LIGHTBOX_ZOOM_MIN).
    assert.equal(fitPicture(1280, 800, 1440, 900).zoomable, false);
    assert.equal(fitPicture(1280, 800, 1024, 768).zoomable, true);
  });

  it('a picture smaller than the window shows at its own size, with no zoom', () => {
    const { box } = stage({ w: 400, h: 300 });
    assert.equal(box.zoomable, false);
    assert.equal(byData(box.root, 'pictureLightboxZoom').hidden, true);
    fire(byData(box.root, 'pictureLightboxImg'), 'click', { clientX: 5, clientY: 5 });
    assert.equal(box.zoomed, false);
    assert.equal(box.open, true);
  });

  it('a second open replaces the first; the resize listener goes with it', () => {
    const s = stage();
    const again = openLightbox({ doc: s.doc, host: s.host, src: '/report-pictures/7', width: 1280, height: 720, win: s.win });
    assert.equal(s.box.open, false);
    assert.equal(s.host.all().filter((n) => 'pictureLightbox' in n.dataset).length, 1);
    again.close();
    assert.equal((s.win.listeners.resize || []).length, 0);
  });
});

describe('the Report a bug window opens its picture in the lightbox, not a new tab', () => {
  function sheet() {
    const doc = fakeDoc();
    const page = new Node('body', doc);
    doc.documentElement.append(page);
    const host = new Node('div', doc);
    page.append(host);
    const game = [];
    page.addEventListener('keydown', (ev) => game.push(ev.key));
    const at = new Date('2026-11-03T12:00:00Z').toISOString();
    const api = {
      list: async () => ({ tickets: [{ id: 7, status: 'open', subject: 'Sample', lastAuthor: 'player', lastMessageAt: at, unread: false }] }),
      unread: async () => ({ unread: 0 }),
      thread: async (id) => ({ ticket: { id, status: 'open', subject: 'Sample', lastAuthor: 'player', lastMessageAt: at }, messages: [{ id: 1, author: 'player', body: 'Sample with an attachment', at }], picture: { url: '/report-pictures/7', width: 1280, height: 720 } }),
      reply: async () => ({}), close: async () => ({}), create: async () => ({}),
    };
    const s = mountReportsSheet({ doc, host, api, now: () => Date.parse(at) });
    return { doc, host, s, game };
  }

  it('a plain click opens it over the game inside the report window; Esc closes only the picture', async () => {
    const { doc, host, s, game } = sheet();
    await s.openTicket(7);
    await flush();
    const a = byData(host, 'reportsThreadPicture');
    assert.equal(a.getAttribute('target'), '_blank', 'Cmd or a middle click still open a tab');
    pressed(doc, a, 'pointer');
    const ev = fire(a, 'click', { button: 0 });
    assert.equal(ev.prevented, true, 'the browser does not open a tab');
    const lb = byData(host, 'pictureLightbox');
    assert.ok(lb, 'the lightbox is open');
    assert.equal(lb.parentNode, s.panel, 'inside the report window');
    assert.equal(lb.getAttribute('aria-label'), 'Report picture');
    assert.equal(s.lightbox?.root, lb);
    const esc = fire(doc.activeElement, 'keydown', { key: 'Escape' });
    assert.equal(esc.stopped, true);
    assert.equal(byData(host, 'pictureLightbox'), null);
    assert.equal(s.state, 'open', 'the report window stays open');
    assert.equal(s.panel.hidden, false);
    assert.equal(doc.activeElement?.id, 'bug-report-title', 'clicked open: focus goes to the report window');
    assert.deepEqual(game, []);
    // Esc again closes the report window itself.
    fire(doc.activeElement, 'keydown', { key: 'Escape' });
    assert.equal(s.state, 'closed');
  });

  it('a modified click is left to the browser', async () => {
    const { host, s } = sheet();
    await s.openTicket(7);
    await flush();
    const a = byData(host, 'reportsThreadPicture');
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { button: 1 }]) {
      const ev = fire(a, 'click', { button: 0, ...mod });
      assert.equal(ev.prevented, false, JSON.stringify(mod));
    }
    assert.equal(byData(host, 'pictureLightbox'), null);
  });

  it('Enter (the link\'s click) and Space open it; a keyboard close gives focus back to the picture', async () => {
    const { doc, host, s } = sheet();
    await s.openTicket(7);
    await flush();
    const a = byData(host, 'reportsThreadPicture');
    pressed(doc, a, 'keyboard');
    fire(a, 'click', { button: 0, detail: 0 });
    assert.ok(byData(host, 'pictureLightbox'));
    fire(doc.activeElement, 'keydown', { key: 'Escape' });
    assert.equal(doc.activeElement, a);
    const down = fire(a, 'keydown', { key: ' ' });
    assert.equal(down.prevented, true, 'Space scrolls nothing');
    assert.equal(byData(host, 'pictureLightbox'), null, 'opened on the release');
    fire(a, 'keyup', { key: ' ' });
    assert.ok(byData(host, 'pictureLightbox'));
    assert.equal(s.state, 'open');
  });

  it('closing the report window, going back to the list or another report takes the picture with it', async () => {
    const { host, s } = sheet();
    await s.openTicket(7);
    await flush();
    fire(byData(host, 'reportsThreadPicture'), 'click', { button: 0 });
    assert.ok(s.lightbox);
    s.close();
    assert.equal(s.lightbox, null);
    assert.equal(byData(host, 'pictureLightbox'), null);
    await s.openTicket(7);
    await flush();
    fire(byData(host, 'reportsThreadPicture'), 'click', { button: 0 });
    fire(byData(host, 'reportsBack'), 'click');
    assert.equal(byData(host, 'pictureLightbox'), null);
  });
});

describe('the picture lightbox: styles and wiring', () => {
  const style = read('public/js/features/bug-report-feature.js');
  const classic = read('public/css/classic.css');
  const sheetSrc = read('public/js/ui/reports-sheet.js');

  it('the report window uses it, and nothing in the game opens a report picture in a tab on a plain click', () => {
    assert.match(sheetSrc, /lightboxLink\(a, \{/);
    assert.match(sheetSrc, /label: T\.pictureLabel/);
    assert.match(sheetSrc, /fallback: \(\) => title/);
  });

  it('Modern: fixed over the window, the picture at most 92vw by 88vh, a dim backdrop, tokens only', () => {
    assert.match(style, /\.picture-lightbox \{ position: fixed; inset: 0;/);
    assert.match(style, /\.picture-lightbox-img \{[^}]*max-width: 92vw; max-height: 88vh; width: auto; height: auto;/);
    assert.match(style, /\.picture-lightbox\[data-zoomed\] \.picture-lightbox-stage \{ overflow: auto; \}/);
    assert.match(style, /\[data-ui="modern"\] #bug-report-panel \.picture-lightbox \{ background: color-mix\(in srgb, var\(--c-black\) 72%, transparent\); \}/);
  });

  it('Classic: its own skin under :root[data-ui="classic"], with the window close X', () => {
    for (const sel of ['.picture-lightbox {', '.picture-lightbox-img {', '.picture-lightbox-x {', ':is(.picture-lightbox-zoom, .picture-lightbox-tab) {']) {
      assert.ok(classic.includes(`:root[data-ui="classic"] #bug-report-panel ${sel}`), sel);
    }
    assert.match(classic, /\.picture-lightbox-x::before,/);
  });
});
