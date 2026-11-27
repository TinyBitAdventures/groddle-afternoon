// G808, Circle the spot (player idea #49, Austin 2026-11-22: build option A). A player asked to mark
// the problem on a report's picture. In the big picture view (js/ui/picture-lightbox.js, shared with
// the phone companion) a drag draws a red ring round the problem, a tap drops one, up to 3; the keys
// move and size them. Done draws them into the JPEG that is sent and the thumbnail shows it; the
// picture itself is kept until Send, so Undo and Clear still work when it is opened again. The world
// picture and the one with the game's UI are framed differently, so changing Include the game's UI
// clears the rings, in a short line.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MARKS, MARK_COLOURS, MARK_TEXT, clampRing, createMarkBook, dragRing, isTap, paintRings, ringKey, ringPlace, ringStroke, tapRing } from '../public/js/ui/picture-marks.js?v=315bb1da';
import { openLightbox } from '../public/js/ui/picture-lightbox.js?v=9ede59ba';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=917a2f8c';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (ok, ms = 5000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(10);
  assert.ok(ok(), 'timed out');
};
const JPEG = (tag) => `data:image/jpeg;base64,${Buffer.from(`jpeg ${tag} ${'x'.repeat(30)}`).toString('base64')}`;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

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
  click() { if (!this.disabled) fire(this, 'click'); }
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
function fire(node, kind, init = {}) {
  const ev = { type: kind, target: node, button: 0, detail: 1, pointerId: 1, stopped: false, prevented: false, ...init };
  ev.stopPropagation = () => { ev.stopped = true; };
  ev.preventDefault = () => { ev.prevented = true; };
  for (let n = node; n && !ev.stopped; n = n.parentNode) for (const fn of n.listeners[kind] || []) fn(ev);
  return ev;
}
const byData = (r, k) => r.find((n) => k in n.dataset);
const byId = (r, id) => r.find((n) => n.id === id);
const fakeWin = (w = 1440, h = 900) => ({ innerWidth: w, innerHeight: h, addEventListener() {}, removeEventListener() {} });
/** A press on the picture's layer (100 x 50 on screen) from one spot to another: a tap when they are the same. */
function press(layer, [x0, y0], [x1, y1] = [x0, y0]) {
  fire(layer, 'pointerdown', { clientX: x0, clientY: y0 });
  if (x1 !== x0 || y1 !== y0) fire(layer, 'pointermove', { clientX: x1, clientY: y1 });
  fire(layer, 'pointerup', { clientX: x1, clientY: y1 });
}

describe('G808: the rings, as pure rules', () => {
  it('a tap drops a round ring of a set size; a drag draws the ellipse inside the box it spans', () => {
    const t = tapRing(0.25, 0.5, 1280, 720);
    assert.ok(near(t.rx * 1280, t.ry * 720), 'round on the picture');
    assert.ok(near(t.ry, MARKS.tap), 'MARKS.tap of the shorter side');
    assert.deepEqual([t.x, t.y], [0.25, 0.5]);
    const d = dragRing(0.2, 0.3, 0.6, 0.5, 1000, 500);
    assert.ok(near(d.x, 0.4) && near(d.y, 0.4) && near(d.rx, 0.2) && near(d.ry, 0.1), JSON.stringify(d));
    assert.deepEqual(dragRing(0.6, 0.5, 0.2, 0.3, 1000, 500), d, 'either way round');
    // A drag along a line still gives a ring, never one too thin to see.
    const flat = dragRing(0.1, 0.5, 0.7, 0.5, 1000, 500);
    assert.ok(near(flat.ry * 500, MARKS.min * 500), `${flat.ry}`);
    assert.equal(isTap(3, 3), true);
    assert.equal(isTap(MARKS.slop, 0), false);
    assert.equal(MARKS.max, 3);
  });

  it('keeps a ring on the picture and within its sizes', () => {
    const c = clampRing({ x: -1, y: 2, rx: 5, ry: 0 }, 800, 400);
    assert.deepEqual([c.x, c.y, c.rx], [0, 1, MARKS.most]);
    assert.ok(near(c.ry * 400, MARKS.min * 400));
  });

  it('says where a ring is, in plain words', () => {
    assert.equal(ringPlace({ x: 0.1, y: 0.1 }), 'top left');
    assert.equal(ringPlace({ x: 0.1, y: 0.5 }), 'left of centre');
    assert.equal(ringPlace({ x: 0.5, y: 0.9 }), 'bottom middle');
    assert.equal(ringPlace({ x: 0.5, y: 0.5 }), 'in the middle');
    assert.equal(MARK_TEXT.ring(1, 'top left'), 'Ring 1, top left.');
  });

  it('the keys: Enter drops a ring in the middle, arrows move it, Shift+arrows size it, Tab goes round, Delete removes, Ctrl+Z undoes', () => {
    const W = 1000;
    const H = 500;
    let s = ringKey({ rings: [], sel: -1 }, 'Enter', {}, W, H);
    assert.equal(s.change, 'add');
    assert.equal(s.sel, 0);
    assert.deepEqual([s.rings[0].x, s.rings[0].y], [0.5, 0.5]);
    const r0 = s.rings[0];
    s = ringKey(s, 'ArrowRight', {}, W, H);
    assert.equal(s.change, 'move');
    assert.ok(near(s.rings[0].x, 0.5 + MARKS.step));
    s = ringKey(s, 'ArrowUp', {}, W, H);
    assert.ok(near(s.rings[0].y, 0.5 - MARKS.step));
    s = ringKey(s, 'ArrowRight', { shift: true }, W, H);
    assert.equal(s.change, 'size');
    assert.ok(near(s.rings[0].rx, r0.rx * (1 + MARKS.grow)), 'Shift+Right wider');
    assert.ok(near(s.rings[0].ry, r0.ry), 'and no taller');
    s = ringKey(s, 'ArrowDown', { shift: true }, W, H);
    assert.ok(near(s.rings[0].ry, r0.ry / (1 + MARKS.grow)), 'Shift+Down shorter');
    // Two more, then a fourth is refused.
    s = ringKey(s, ' ', {}, W, H);
    s = ringKey(s, 'Enter', {}, W, H);
    assert.equal(s.rings.length, 3);
    assert.equal(s.sel, 2);
    const full = ringKey(s, 'Enter', {}, W, H);
    assert.equal(full.change, 'full');
    assert.equal(full.rings.length, 3);
    // Tab goes round the rings, then lets the key go on (no trap); Shift+Tab back.
    let t = ringKey({ ...s, sel: 0 }, 'Tab', {}, W, H);
    assert.deepEqual([t.change, t.sel], ['select', 1]);
    t = ringKey(t, 'Tab', {}, W, H);
    assert.equal(t.sel, 2);
    assert.equal(ringKey(t, 'Tab', {}, W, H).handled, false, 'after the last ring, Tab leaves');
    assert.equal(ringKey({ ...s, sel: 0 }, 'Tab', { shift: true }, W, H).handled, false, 'before the first, Shift+Tab leaves');
    assert.equal(ringKey({ rings: [], sel: -1 }, 'Tab', {}, W, H).handled, false, 'no rings: Tab passes');
    const del = ringKey({ ...s, sel: 1 }, 'Delete', {}, W, H);
    assert.deepEqual([del.change, del.rings.length, del.sel], ['remove', 2, 1]);
    assert.equal(ringKey({ ...s, sel: 2 }, 'Backspace', {}, W, H).sel, 1);
    assert.equal(ringKey(s, 'z', { ctrl: true }, W, H).change, 'undo');
    assert.equal(ringKey(s, 'Z', { meta: true }, W, H).change, 'undo');
    assert.equal(ringKey(s, 'a', {}, W, H).handled, false);
    assert.equal(ringKey({ rings: [], sel: -1 }, 'ArrowLeft', {}, W, H).handled, false, 'no ring to move');
    // A ring moved to the edge stays on the picture.
    let edge = { rings: [tapRing(0.99, 0.5, W, H)], sel: 0 };
    for (let i = 0; i < 5; i++) edge = ringKey(edge, 'ArrowRight', {}, W, H);
    assert.equal(edge.rings[0].x, 1);
  });

  it('the words are plain, with no em dashes', () => {
    for (const v of Object.values(MARK_TEXT)) assert.doesNotMatch(typeof v === 'function' ? v(2, 'top left') : v, /—/);
    assert.equal(MARK_TEXT.help, 'Drag around the problem to circle it, or tap to drop a ring. Up to 3.');
    assert.equal(MARK_TEXT.helpKeys, 'Keys: arrows move it, Shift+arrows size it.');
    assert.equal(MARK_TEXT.title, 'Circle the spot');
    assert.equal(MARK_TEXT.count(2), '2 of 3');
  });
});

describe('G808: the rings drawn into the picture', () => {
  it('changes the pixels where the ring is (red, with a white edge) and nowhere else', () => {
    const W = 200;
    const H = 120;
    const base = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) base.set([10 + (i % 7), 120, 60, 255], i * 4);
    const data = base.slice();
    const ring = { x: 0.5, y: 0.5, rx: 0.25, ry: 0.3 };
    const painted = paintRings(data, W, H, [ring]);
    assert.ok(painted > 100, `${painted} pixels`);
    const { core, edge } = ringStroke(W, H);
    const outer = core / 2 + edge + 1.5;
    const cx = ring.x * W;
    const cy = ring.y * H;
    const rx = ring.rx * W;
    const ry = ring.ry * H;
    const inside = (px, py, ax, ay) => ((px - cx) / ax) ** 2 + ((py - cy) / ay) ** 2 <= 1;
    let changed = 0;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const i = (py * W + px) * 4;
        if (data[i] === base[i] && data[i + 1] === base[i + 1] && data[i + 2] === base[i + 2]) continue;
        changed += 1;
        const x = px + 0.5;
        const y = py + 0.5;
        assert.ok(inside(x, y, rx + outer, ry + outer) && !inside(x, y, rx - outer, ry - outer), `pixel ${px},${py} changed off the ring`);
      }
    }
    assert.ok(changed > 100);
    const at = (px, py) => Array.from(data.slice((py * W + px) * 4, (py * W + px) * 4 + 3));
    const red = [1, 3, 5].map((i) => parseInt(MARK_COLOURS.ring.slice(i, i + 2), 16));
    assert.deepEqual(at(Math.floor(cx + rx), Math.floor(cy)), red, 'on the ring: red');
    assert.deepEqual(at(Math.floor(cx), Math.floor(cy - ry)), red, 'at its top too');
    const white = at(Math.floor(cx + rx) + Math.floor(core / 2) + 1, Math.floor(cy));
    assert.ok(white.every((c) => c > 200), `its white edge outside: ${white}`);
    assert.deepEqual(at(Math.floor(cx), Math.floor(cy)), Array.from(base.slice((Math.floor(cy) * W + Math.floor(cx)) * 4, (Math.floor(cy) * W + Math.floor(cx)) * 4 + 3)), 'the middle untouched');
    // No rings: nothing at all.
    const none = base.slice();
    assert.equal(paintRings(none, W, H, []), 0);
    assert.deepEqual(none, base);
  });

  it('a mark book keeps the picture, draws a marked copy for Send and the thumbnail, and lets it go', async () => {
    const pic = { url: JPEG('pic'), width: 1280, height: 720 };
    const baked = [];
    let changes = 0;
    const book = createMarkBook({ bake: async (p, rings) => { baked.push([p, rings]); return { url: JPEG(`marked ${rings.length}`), width: p.width, height: p.height }; }, onChange: () => { changes += 1; } });
    assert.equal(book.url(pic), pic.url);
    assert.equal(book.shown(pic), pic);
    const h = book.holder(pic);
    h.save({ rings: [tapRing(0.5, 0.5, 1280, 720)], history: [[]] });
    await book.settled();
    assert.equal(baked.length, 1);
    assert.equal(baked[0][0], pic, 'drawn from the picture itself');
    assert.equal(book.url(pic), JPEG('marked 1'));
    assert.equal(book.shown(pic).url, JPEG('marked 1'));
    assert.equal(pic.url, JPEG('pic'), 'the picture is kept');
    assert.equal(book.count(pic), 1);
    assert.equal(book.holder(pic).history.length, 1, 'Undo survives a reopen');
    // The same rings again draw nothing.
    book.holder(pic).save({ rings: book.rings(pic), history: [] });
    await book.settled();
    assert.equal(baked.length, 1);
    book.holder(pic).save({ rings: [], history: [[tapRing(0.5, 0.5, 1280, 720)]] });
    assert.equal(book.url(pic), pic.url, 'cleared: the picture as it was');
    assert.equal(book.count(pic), 0);
    assert.equal(book.holder(pic).history.length, 1, 'and Undo can bring the ring back');
    book.holder(pic).save({ rings: [], history: [] });
    assert.equal(book.drop(pic), false, 'nothing left to keep');
    assert.ok(changes >= 2);
  });
});

describe('G808: marking in the big picture view', () => {
  function stage(saved = []) {
    const doc = fakeDoc();
    const page = new Node('body', doc);
    doc.documentElement.append(page);
    const host = new Node('div', doc);
    page.append(host);
    const mark = { rings: [], history: [], save: (s) => saved.push(s) };
    const box = openLightbox({ doc, host, src: 'blob:pic', width: 1280, height: 720, mark, win: fakeWin(1024, 768) });
    return { doc, host, box, saved, layer: byData(box.root, 'pictureMarksLayer'), bar: byData(box.root, 'pictureMarks') };
  }

  it('shows the bar under the picture, marking on: Circle the spot, Circle, N of 3, Undo, Clear, Done and the help line', () => {
    const { box, bar, layer } = stage();
    assert.ok('markable' in box.root.dataset && 'marking' in box.root.dataset);
    assert.equal(bar.hidden, false);
    assert.equal(bar.getAttribute('role'), 'group');
    assert.equal(bar.getAttribute('aria-label'), MARK_TEXT.title);
    const circle = byData(bar, 'pictureMarksCircle');
    assert.equal(circle.getAttribute('aria-pressed'), 'true');
    assert.equal(byData(bar, 'pictureMarksCount').textContent, '0 of 3');
    assert.equal(byData(bar, 'pictureMarksUndo').disabled, true);
    assert.equal(byData(bar, 'pictureMarksClear').disabled, true);
    assert.match(bar.textContent, /Circle the spot.*Circle.*0 of 3.*Undo.*Clear.*Done.*Drag around the problem to circle it, or tap to drop a ring\. Up to 3\. Keys: arrows move it, Shift\+arrows size it\./);
    assert.equal(layer.getAttribute('role'), 'application');
    assert.equal(layer.getAttribute('tabindex'), '0');
    assert.equal(layer.getAttribute('viewBox'), '0 0 1280 720');
    assert.equal(box.zoomable, false, 'no zoom while marking');
    // Circle off: the picture is a picture again (zoom), the layer leaves the keys.
    circle.click();
    assert.equal(circle.getAttribute('aria-pressed'), 'false');
    assert.ok(!('marking' in box.root.dataset));
    assert.equal(layer.getAttribute('tabindex'), null);
    assert.equal(box.zoomable, true);
  });

  it('a drag draws a ring, a tap drops one, up to 3; Undo and Clear; Done hands them back and closes', () => {
    const { box, layer, bar, saved } = stage();
    press(layer, [10, 10], [60, 40]);
    let rings = box.marks.rings;
    assert.equal(rings.length, 1);
    const want = dragRing(0.1, 0.2, 0.6, 0.8, 1280, 720);
    for (const k of ['x', 'y', 'rx', 'ry']) assert.ok(near(rings[0][k], want[k], 1e-4), `${k}: ${rings[0][k]} ${want[k]}`);
    press(layer, [80, 25]);
    rings = box.marks.rings;
    assert.equal(rings.length, 2);
    assert.ok(near(rings[1].x, 0.8, 1e-4) && near(rings[1].ry, MARKS.tap, 1e-4), 'a tap: a ring of the set size where it landed');
    assert.equal(layer.dataset.count, '2');
    assert.equal(layer.children.filter((g) => 'pictureMark' in g.dataset).length, 2);
    assert.equal(byData(bar, 'pictureMarksCount').textContent, '2 of 3');
    assert.equal(byData(bar, 'pictureMarksLive').textContent, 'Ring 2, right of centre.');
    press(layer, [50, 25]);
    press(layer, [20, 25]);
    assert.equal(box.marks.rings.length, 3, 'a fourth is refused');
    assert.equal(byData(bar, 'pictureMarksLive').textContent, MARK_TEXT.full);
    byData(bar, 'pictureMarksUndo').click();
    assert.equal(box.marks.rings.length, 2);
    byData(bar, 'pictureMarksClear').click();
    assert.equal(box.marks.rings.length, 0);
    byData(bar, 'pictureMarksUndo').click();
    assert.equal(box.marks.rings.length, 2, 'Clear can be undone');
    byData(bar, 'pictureMarksDone').click();
    assert.equal(box.open, false);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].rings.length, 2);
    assert.equal(saved[0].history.length, 2, 'the undo list goes with them');
  });

  it('the keys on the picture: Enter, arrows, Shift+arrows, Tab between rings and on to the buttons, Delete; Esc keeps the rings', () => {
    const { doc, box, layer, bar, saved } = stage();
    layer.focus();
    fire(layer, 'keydown', { key: 'Enter' });
    fire(layer, 'keydown', { key: 'Enter' });
    assert.equal(box.marks.rings.length, 2);
    assert.equal(box.marks.selected, 1);
    const ev = fire(layer, 'keydown', { key: 'ArrowLeft' });
    assert.equal(ev.stopped, true, 'the arrow is the ring\'s, not the gallery\'s or the game\'s');
    assert.ok(near(box.marks.rings[1].x, 0.5 - MARKS.step));
    fire(layer, 'keydown', { key: 'ArrowUp', shiftKey: true });
    assert.ok(box.marks.rings[1].ry > box.marks.rings[0].ry);
    assert.equal(byData(bar, 'pictureMarksLive').textContent, 'Ring 2, in the middle.');
    // A run of moves of one ring is one Undo step.
    fire(layer, 'keydown', { key: 'ArrowLeft' });
    fire(layer, 'keydown', { key: 'ArrowLeft' });
    fire(layer, 'keydown', { key: 'z', ctrlKey: true });
    assert.ok(near(box.marks.rings[1].x, 0.5 - MARKS.step), 'back to before the run');
    // Tab: after the last ring, on to Circle (the dialog's own round of buttons).
    fire(layer, 'keydown', { key: 'Tab' });
    assert.equal(doc.activeElement, byData(bar, 'pictureMarksCircle'));
    layer.focus();
    fire(layer, 'keydown', { key: 'Delete' });
    assert.equal(box.marks.rings.length, 1);
    fire(layer, 'keydown', { key: 'Escape' });
    assert.equal(box.open, false);
    assert.equal(saved.at(-1).rings.length, 1, 'Esc keeps the rings');
  });

  it('a picture opened without `mark` has no bar and no layer focus, as before', () => {
    const doc = fakeDoc();
    const host = new Node('div', doc);
    doc.documentElement.append(host);
    const box = openLightbox({ doc, host, src: 'x', width: 1280, height: 720, win: fakeWin() });
    assert.equal(box.marks, null);
    assert.equal(byData(box.root, 'pictureMarks'), null);
    assert.ok(!('markable' in box.root.dataset));
  });
});

describe('G808: the report window', () => {
  function mount() {
    const doc = fakeDoc();
    const page = new Node('body', doc);
    doc.documentElement.append(page);
    const host = new Node('div', doc);
    page.append(host);
    const calls = [];
    const baked = [];
    const api = {
      list: async () => ({ tickets: [] }), unread: async () => ({ unread: 0 }), thread: async () => ({}), reply: async () => ({}), close: async () => ({}),
      create: async (message, context, picture = null) => { calls.push(picture); return { status: 'sent', id: 1, ticket: { id: 1, status: 'open', subject: message } }; },
    };
    const world = { url: JPEG('world'), width: 1280, height: 600 };
    const ui = { url: JPEG('ui'), width: 1280, height: 662 };
    const bake = async (pic, rings) => { baked.push({ pic, rings }); return { url: JPEG(`${pic === ui ? 'ui' : 'world'} with ${rings.length}`), width: pic.width, height: pic.height }; };
    const sheet = mountReportsSheet({ doc, host, api, capture: ({ ui: withUi }) => (withUi ? ui : world), now: () => 0, uiIdle: 10, bake });
    return { doc, host, sheet, calls, baked, world, ui, preview: byData(host, 'reportsPicturePreview'), tag: byData(host, 'reportsThumbMarks'), uiBox: byId(host, 'reports-picture-ui'), text: byId(host, 'bug-report-text'), status: byData(host, 'bugReportStatus') };
  }
  const lightbox = (m) => byData(m.host, 'pictureLightbox');
  const shown = (m) => m.preview.children[0]?.getAttribute('src');

  it('Done draws the rings into the picture with the UI; the thumbnail shows them, the big view keeps the picture, Send sends the marked one', async () => {
    const m = mount();
    m.sheet.open('new');
    await waitFor(() => m.preview.dataset.which === 'ui');
    const plain = shown(m);
    fire(m.preview, 'click', { button: 0 });
    await waitFor(() => lightbox(m));
    const layer = byData(lightbox(m), 'pictureMarksLayer');
    assert.equal(layer.getAttribute('viewBox'), '0 0 1280 662');
    press(layer, [30, 20]);
    byData(lightbox(m), 'pictureMarksDone').click();
    assert.equal(lightbox(m), null);
    await waitFor(() => shown(m) !== plain);
    assert.equal(m.baked.length, 1);
    assert.equal(m.baked[0].pic, m.ui, 'drawn on the picture with the UI, the one that goes');
    assert.equal(m.tag.hidden, false);
    assert.equal(m.tag.textContent, '1 mark');
    // Opened again: the picture itself, its ring over it, still to change.
    fire(m.preview, 'click', { button: 0 });
    await waitFor(() => lightbox(m));
    assert.equal(byData(lightbox(m), 'pictureLightboxImg').getAttribute('src'), plain, 'the original, not the marked copy');
    assert.equal(byData(lightbox(m), 'pictureMarksLayer').dataset.count, '1');
    press(byData(lightbox(m), 'pictureMarksLayer'), [70, 30]);
    byData(lightbox(m), 'pictureMarksDone').click();
    await waitFor(() => m.tag.textContent === '2 marks');
    m.text.value = 'The sign floats';
    await m.sheet.send();
    assert.equal(m.calls.length, 1);
    assert.equal(m.calls[0], JPEG('ui with 2'), 'Send sends the picture with its rings');
  });

  it('Clear and Undo still work after the big view is opened again', async () => {
    const m = mount();
    m.sheet.open('new');
    await waitFor(() => m.preview.dataset.which === 'ui');
    const plain = shown(m);
    fire(m.preview, 'click', { button: 0 });
    await waitFor(() => lightbox(m));
    press(byData(lightbox(m), 'pictureMarksLayer'), [30, 20]);
    byData(lightbox(m), 'pictureMarksDone').click();
    await waitFor(() => !m.tag.hidden);
    fire(m.preview, 'click', { button: 0 });
    await waitFor(() => lightbox(m));
    byData(lightbox(m), 'pictureMarksClear').click();
    byData(lightbox(m), 'pictureMarksDone').click();
    await waitFor(() => m.tag.hidden);
    assert.equal(shown(m), plain, 'cleared: the picture as it was');
    fire(m.preview, 'click', { button: 0 });
    await waitFor(() => lightbox(m));
    const undo = byData(lightbox(m), 'pictureMarksUndo');
    assert.equal(undo.disabled, false, 'the undo list came back with the picture');
    undo.click();
    assert.equal(byData(lightbox(m), 'pictureMarksLayer').dataset.count, '1');
    byData(lightbox(m), 'pictureMarksDone').click();
    await waitFor(() => !m.tag.hidden);
  });

  it('opened while the picture with the UI is still to come, it is drawn first, so the rings land on the picture that goes', async () => {
    const m = mount();
    m.sheet.open('new');
    await waitFor(() => m.preview.dataset.which === 'world');
    m.text.value = 'a';
    fire(m.text, 'input');
    fire(m.preview, 'click', { button: 0 });
    await waitFor(() => lightbox(m));
    assert.equal(m.preview.dataset.which, 'ui');
    assert.equal(byData(lightbox(m), 'pictureMarksLayer').getAttribute('viewBox'), '0 0 1280 662');
  });

  it('turning Include the game\'s UI off or on after marking clears the rings, with a short line saying so', async () => {
    const m = mount();
    m.sheet.open('new');
    await waitFor(() => m.preview.dataset.which === 'ui');
    fire(m.preview, 'click', { button: 0 });
    await waitFor(() => lightbox(m));
    press(byData(lightbox(m), 'pictureMarksLayer'), [30, 20]);
    byData(lightbox(m), 'pictureMarksDone').click();
    await waitFor(() => !m.tag.hidden);
    m.uiBox.checked = false;
    fire(m.uiBox, 'change');
    assert.equal(m.status.textContent, MARK_TEXT.uiCleared);
    assert.doesNotMatch(MARK_TEXT.uiCleared, /—/);
    await waitFor(() => m.preview.dataset.which === 'world');
    assert.equal(m.tag.hidden, true);
    // Back on: the picture with the UI comes back without its rings.
    m.uiBox.checked = true;
    fire(m.uiBox, 'change');
    await waitFor(() => m.preview.dataset.which === 'ui');
    assert.equal(m.tag.hidden, true);
    m.text.value = 'The sign floats';
    await m.sheet.send();
    assert.equal(m.calls[0], m.ui.url, 'the picture with the UI, no rings');
    // No rings, no line.
    const n = mount();
    n.sheet.open('new');
    await waitFor(() => n.preview.dataset.which === 'ui');
    n.uiBox.checked = false;
    fire(n.uiBox, 'change');
    assert.equal(n.status.textContent, '');
  });
});

describe('G808: wiring and styles', () => {
  it('the phone companion\'s photos get the rings from the shared lightbox, and send the marked ones', () => {
    const js = read('public/js/phone/companion.js');
    assert.match(js, /import\('\.\.\/ui\/picture-marks\.js\?v=[0-9a-f]{8}'\)/, 'loaded with the lightbox, not with the page');
    assert.match(js, /mark: book \? book\.holder\(p\) : null/);
    assert.match(js, /urls: \(\) => photos\.map\(\(p\) => \(book \? book\.url\(p\) : p\.url\)\)/);
    assert.equal((js.match(/= (?:photo|picker)\.urls\(\);/g) || []).length, 2, 'a new report and a reply');
  });

  it('both skins and the phone style the bar; Classic restyles the same elements; reduced motion stops its fade', () => {
    const feature = read('public/js/features/bug-report-feature.js');
    for (const sel of ['.picture-lightbox-frame', '.picture-marks-layer', '.picture-marks {', '.picture-marks-btn', '.reports-thumb-marks', '.picture-marks-layer:focus-visible']) assert.ok(feature.includes(sel), sel);
    assert.match(feature, /@media \(prefers-reduced-motion: reduce\) \{ \.picture-marks \{ animation: none; \} \}/);
    const classic = read('public/css/classic.css');
    for (const sel of ['.picture-marks {', '.picture-marks-btn {', '.picture-marks-btn.is-go', '.picture-marks-layer {', '.reports-thumb-marks']) assert.ok(classic.includes(`:root[data-ui="classic"] #bug-report-panel ${sel}`), sel);
    assert.doesNotMatch(classic, /Glitch/);
    const phone = read('public/play/phone/phone.css');
    for (const sel of ['.picture-marks {', '.picture-marks-layer {', '.pc-photo-marks']) assert.ok(phone.includes(sel), sel);
  });

  it('is registered as the remake\'s own invention, with Austin\'s ruling', () => {
    const reg = JSON.parse(read('tools/inventions/inventions.json'));
    const e = reg.entries.find((x) => x.id === 'report-picture-rings');
    assert.ok(e);
    assert.equal(e.status, 'kept');
    assert.equal(e.kind, 'UI');
    assert.match(e.ruling, /^Austin 2026-11-22: build option A, circle the spot/);
    assert.deepEqual(e.rows, ['G808']);
  });
});
