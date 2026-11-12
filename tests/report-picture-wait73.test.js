// Ticket 73 (Safari 26.5): the report form said "Drawing the picture…" and would not take typing
// until the picture with the game's UI was drawn, and the picture could only be seen once the
// report was sent. Now only the world picture is drawn as the form opens, shown at once (bigger,
// its own shape) and opening in the picture lightbox; the one with the UI waits for a pause in
// typing or Send, and uses the canvas as the form found it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UI_IDLE_MS, mountReportsSheet, previewWhich } from '../public/js/ui/reports-sheet.js?v=120accc0';
import { REPORT_TEXT as T } from '../public/js/reports.js?v=342441b9';
import { capturePicture, captureFrame, standardStyleNames, viewRows } from '../public/js/features/bug-report-feature.js?v=5f2124b7';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Wait for what a step needs, not for a set time: a loaded machine runs 80 ms timers late (G535). */
const waitFor = async (ok, ms = 5000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(10);
  assert.ok(ok(), 'timed out waiting for the form');
};
const JPEG = (tag) => `data:image/jpeg;base64,${Buffer.from(`jpeg ${tag} ${'x'.repeat(30)}`).toString('base64')}`;

// —— A small DOM with bubbling, enough for the sheet and the lightbox ——
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
  const ev = { type: kind, target: node, button: 0, detail: 1, stopped: false, prevented: false, ...init };
  ev.stopPropagation = () => { ev.stopped = true; };
  ev.preventDefault = () => { ev.prevented = true; };
  for (let n = node; n && !ev.stopped; n = n.parentNode) for (const fn of n.listeners[kind] || []) fn(ev);
  return ev;
}
const byData = (r, k) => r.find((n) => k in n.dataset);
const byId = (r, id) => r.find((n) => n.id === id);

/** The sheet over a page, with a capture that logs what it was asked and what the status said then. */
function mount(capture, opts = {}) {
  const doc = fakeDoc();
  const page = new Node('body', doc);
  doc.documentElement.append(page);
  const host = new Node('div', doc);
  page.append(host);
  const calls = [];
  const asked = [];
  const api = {
    list: async () => ({ tickets: [] }), unread: async () => ({ unread: 0 }), thread: async () => ({}), reply: async () => ({}), close: async () => ({}),
    create: async (message, context, picture = null) => { calls.push([message, picture]); return { status: 'sent', id: 1, ticket: { id: 1, status: 'open', subject: message } }; },
  };
  let sheet = null;
  const logged = (o) => {
    asked.push({ ui: Boolean(o?.ui), world: o?.world || null, status: byData(host, 'bugReportStatus')?.textContent || '', hint: byId(host, 'reports-picture-hint')?.textContent || '' });
    return capture(o);
  };
  sheet = mountReportsSheet({ doc, host, api, capture: logged, now: () => 0, ...opts });
  return { doc, host, sheet, calls, asked, text: byId(host, 'bug-report-text'), preview: byData(host, 'reportsPicturePreview'), hint: byId(host, 'reports-picture-hint') };
}
const pictures = () => {
  const world = { url: JPEG('world'), width: 1280, height: 600, bytes: 40 };
  const ui = { url: JPEG('ui'), width: 1280, height: 662, bytes: 40, ui: true };
  return { world, ui, capture: ({ ui: withUi }) => (withUi ? ui : world) };
};
const shownSrc = (preview) => preview.children[0]?.getAttribute('src') || '';

describe('ticket 73: the report form never waits on the picture with the UI', () => {
  it('opens with only the world picture drawn, shown at once beside the drawing hint', async () => {
    const { world, capture } = pictures();
    const m = mount(capture, { uiIdle: 60000 });
    m.sheet.open('new');
    assert.deepEqual(m.asked, [], 'nothing is drawn as the form opens');
    await waitFor(() => m.preview.dataset.which === 'world');
    assert.deepEqual(m.asked.map((a) => a.ui), [false], 'the world picture only');
    assert.equal(m.preview.hidden, false, 'the world picture shows while the one with the UI is to come');
    assert.equal(m.preview.dataset.which, 'world');
    assert.equal(m.preview.tagName, 'A');
    assert.equal(shownSrc(m.preview), m.preview.getAttribute('href'));
    assert.match(m.preview.getAttribute('href'), /^blob:/, 'a blob: address, so a new tab can open it');
    assert.equal(m.preview.children[0].getAttribute('width'), String(world.width));
    assert.equal(m.hint.textContent, T.pictureDrawing);
    assert.equal(UI_IDLE_MS, 1500);
  });

  it('draws the one with the UI after a pause in typing, from the canvas the world picture read, then shows it', async () => {
    const { world, ui, capture } = pictures();
    const m = mount(capture, { uiIdle: 80 });
    m.sheet.open('new');
    await wait(90);
    // Typing: each key starts the wait again.
    for (let i = 0; i < 8; i++) {
      m.text.value += 'a';
      fire(m.text, 'input');
      await wait(30);
    }
    assert.deepEqual(m.asked.map((a) => a.ui), [false], 'not while typing');
    await wait(160);
    assert.deepEqual(m.asked.map((a) => a.ui), [false, true]);
    assert.equal(m.asked[1].world.url, world.url, 'the UI picture gets the world picture (its canvas) from the open');
    assert.equal(m.preview.dataset.which, 'ui');
    assert.equal(m.hint.textContent, T.pictureHintUi);
    m.text.value = 'Pigs float';
    m.sheet.send();
    await wait(60);
    assert.deepEqual(m.calls, [['Pigs float', ui.url]], 'the UI picture goes, not drawn again');
    assert.equal(m.asked.length, 2);
  });

  it('Send before a pause draws the one with the UI then, under Sending…, and sends it', async () => {
    const { ui, capture } = pictures();
    const m = mount(capture, { uiIdle: 10000 });
    m.sheet.open('new');
    await wait(90);
    m.text.value = 'Quick one';
    fire(m.text, 'input');
    byData(m.host, 'bugReportSend').click();
    await wait(80);
    assert.deepEqual(m.asked.map((a) => a.ui), [false, true]);
    assert.equal(m.asked[1].status, T.sending, 'the window says Sending… while it draws');
    assert.equal(m.asked[1].hint, T.pictureDrawing);
    assert.deepEqual(m.calls, [['Quick one', ui.url]]);
  });

  it('Send at once, before even the world picture: the world one first, then the UI one from it', async () => {
    const { world, ui, capture } = pictures();
    const m = mount(capture, { uiIdle: 10000 });
    m.sheet.open('new');
    m.text.value = 'At once';
    m.sheet.send();
    await wait(120);
    assert.deepEqual(m.asked.map((a) => a.ui), [false, true]);
    assert.equal(m.asked[1].world.url, world.url);
    assert.deepEqual(m.calls, [['At once', ui.url]]);
  });

  it('unticked choices still hold: without the UI the world goes and the UI one is never drawn; unticked, nothing', async () => {
    const { world, capture } = pictures();
    const m = mount(capture, { uiIdle: 40 });
    m.sheet.open('new');
    await waitFor(() => m.preview.dataset.which === 'world');
    const uiBox = byId(m.host, 'reports-picture-ui');
    uiBox.checked = false;
    fire(uiBox, 'change');
    await wait(100);
    assert.deepEqual(m.asked.map((a) => a.ui), [false], 'no picture with the UI once unticked');
    assert.equal(m.preview.dataset.which, 'world');
    assert.equal(m.hint.textContent, T.pictureHint);
    m.text.value = 'World only';
    m.sheet.send();
    await wait(40);
    assert.deepEqual(m.calls[0], ['World only', world.url]);
    // A second report, Attach unticked: no preview and nothing sent.
    m.sheet.open('new');
    await wait(80);
    const box = byId(m.host, 'reports-picture');
    box.checked = false;
    fire(box, 'change');
    assert.equal(m.preview.hidden, true);
    await wait(100);
    assert.equal(m.asked.filter((a) => a.ui).length, 0, 'unticked: the UI one waits, never drawn');
    m.text.value = 'No picture';
    m.sheet.send();
    await wait(40);
    assert.deepEqual(m.calls[1], ['No picture', null]);
  });

  it('a UI picture that cannot be drawn leaves the world one in the preview and in the report', async () => {
    const { world } = pictures();
    const m = mount(({ ui }) => (ui ? null : world), { uiIdle: 30 });
    m.sheet.open('new');
    await wait(150);
    assert.equal(byId(m.host, 'reports-picture-ui').checked, false);
    assert.equal(m.preview.dataset.which, 'world');
    m.text.value = 'x';
    m.sheet.send();
    await wait(40);
    assert.deepEqual(m.calls[0], ['x', world.url]);
  });

  it('the preview opens over the game in the picture lightbox; Esc closes only the picture and the caret goes back to the box', async () => {
    const { capture } = pictures();
    const m = mount(capture, { uiIdle: 10000 });
    m.sheet.open('new');
    await wait(90);
    // A pointer press, as focus-return.js records it.
    m.doc.__inputIntent = { last: 'pointer', pressed: new WeakMap([[m.preview, 'pointer']]) };
    const ev = fire(m.preview, 'click', { button: 0 });
    assert.equal(ev.prevented, true, 'not a browser tab');
    const lb = byData(m.host, 'pictureLightbox');
    assert.ok(lb, 'the lightbox is open');
    assert.equal(lb.parentNode, m.sheet.panel, 'inside the report window');
    assert.equal(lb.getAttribute('aria-label'), T.pictureLabel);
    assert.equal(byData(lb, 'pictureLightboxImg').getAttribute('src'), m.preview.getAttribute('href'));
    assert.equal(m.sheet.lightbox?.root, lb);
    fire(m.doc.activeElement, 'keydown', { key: 'Escape' });
    assert.equal(byData(m.host, 'pictureLightbox'), null);
    assert.equal(m.sheet.state, 'open', 'the report window stays open');
    assert.equal(m.doc.activeElement, m.text, 'back to typing');
    // Cmd-click is the browser's own new tab.
    const cmd = fire(m.preview, 'click', { button: 0, metaKey: true });
    assert.equal(cmd.prevented, false);
    assert.equal(byData(m.host, 'pictureLightbox'), null);
    // The lightbox goes with the window.
    fire(m.preview, 'click', { button: 0 });
    m.sheet.close();
    assert.equal(byData(m.host, 'pictureLightbox'), null);
  });

  it('the preview shows the chosen picture, or the world one while the UI one is to come', () => {
    assert.equal(previewWhich({ attach: true, want: 'ui', has: { world: true }, pending: true }), 'world');
    assert.equal(previewWhich({ attach: true, want: 'ui', has: { world: true, ui: true }, pending: false }), 'ui');
    assert.equal(previewWhich({ attach: true, want: 'world', has: { world: true, ui: true } }), 'world');
    assert.equal(previewWhich({ attach: false, want: 'ui', has: { world: true, ui: true } }), '');
    assert.equal(previewWhich({ attach: true, want: 'ui', has: {}, pending: true }), '');
    assert.equal(previewWhich({ attach: true, want: 'ui', has: { world: true }, pending: false }), '', 'a failed UI picture is the world choice, not this');
  });
});

describe('ticket 73: the canvas is read once per report', () => {
  const fakeCanvasDoc = () => {
    const drawn = [];
    return {
      drawn,
      createElement: () => {
        const c = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage: (...a) => drawn.push(a) }), toDataURL: () => JPEG('pic') };
        return c;
      },
    };
  };
  it('the world picture is the location view out of the one whole-canvas frame, which it keeps for the UI picture', () => {
    const frame = { width: 1440, height: 832 };
    const asked = [];
    const engine = { camera: { w: 1440, h: 745 }, snapshotCanvas: (o) => { asked.push(o); return frame; } };
    const doc = fakeCanvasDoc();
    const shot = capturePicture(engine, doc);
    assert.deepEqual(asked, [{ width: 1280 }], 'one read-back, at least the picture\'s width');
    assert.equal(shot.width, 1280);
    assert.equal(shot.height, Math.round(745 * 1280 / 1440), 'the location view only, not the strip under the pack');
    assert.deepEqual(doc.drawn[0].slice(1), [0, 0, 1440, 745, 0, 0, 1280, shot.height]);
    assert.equal(shot.frame, frame, 'the frame goes with it');
    assert.equal(Object.keys(shot).includes('frame'), false, 'not enumerable');
    assert.equal(capturePicture({ camera: { w: 1, h: 1 } }, doc), null, 'no renderer yet');
    assert.equal(capturePicture({ snapshotCanvas: () => { throw new Error('lost context'); } }, doc), null);
    assert.equal(captureFrame({ snapshotCanvas: () => ({ width: 0, height: 0 }) }, doc), null);
    assert.equal(viewRows(1440, 832, { w: 1440, h: 745 }), 745);
    assert.equal(viewRows(720, 416, { w: 1440, h: 745 }), 373);
    assert.equal(viewRows(1440, 832, null), 832);
    assert.equal(viewRows(1440, 700, { w: 1440, h: 745 }), 700);
  });

  it('the UI picture draws the frame from the open in place of the canvas, reading the canvas only without one', () => {
    const f = read('public/js/features/bug-report-feature.js');
    const fn = f.slice(f.indexOf('export async function capturePictureWithUi('), f.indexOf('const STYLE = `'));
    assert.match(fn, /capturePictureWithUi\(engine, doc = globalThis\.document, limits = REPORT_PICTURE, frame = null\)/);
    assert.match(fn, /let world = frame\?\.width && frame\?\.height \? frame : null;\n\s+if \(!world\) \{ try \{ world = engine\?\.snapshotCanvas\?\.\(\{ width: cssW \}\);/);
    assert.match(f, /capture: \(\{ ui = false, world = null \} = \{\}\) => \(ui \? capturePictureWithUi\(engine, document, REPORT_PICTURE, world\?\.frame\) : capturePicture\(engine\)\),/);
    // The "Enter: choose" prompt is left out of the one read-back, as snapshotView leaves it.
    assert.match(read('public/game.js'), /snapshotCanvas\(\{ width = VIEW_W \} = \{\}\) \{[\s\S]*?if \(prompt\) prompt\.visible = false;[\s\S]*?frame: new PIXI\.Rectangle\(0, 0, VIEW_W, VIEW_H\)[\s\S]*?finally \{\n\s+if \(prompt\) prompt\.visible = hint;/);
  });

  it('the page copy carries only the standard CSS properties: WebKit listed the 815 design tokens on every element', () => {
    const names = ['color', '--c-ink', 'display', '--space-2', 'font-family'];
    const win = { document: { documentElement: {} }, getComputedStyle: () => ({ length: names.length, item: (i) => names[i] }) };
    assert.deepEqual(standardStyleNames(win), ['color', 'display', 'font-family']);
    assert.equal(standardStyleNames({ document: { documentElement: {} }, getComputedStyle: () => ({ length: 1, item: () => 'top' }) }), standardStyleNames(win), 'read once per page');
    const f = read('public/js/features/bug-report-feature.js');
    const fn = f.slice(f.indexOf('export async function capturePictureWithUi('), f.indexOf('const STYLE = `'));
    assert.match(fn, /includeStyleProperties: standardStyleNames\(\),/);
    assert.doesNotMatch(fn, /font: false/, 'fonts stay embedded: without them WebKit draws the HUD in a wider font');
  });

  it('the preview is bigger and keeps the picture\'s shape, in both skins', () => {
    const modern = read('public/js/features/bug-report-feature.js');
    const classic = read('public/css/classic.css');
    const m = /\[data-ui="modern"\] #bug-report-panel \.reports-picture-thumb \{([^}]*)\}/.exec(modern)?.[1] || '';
    const c = /:root\[data-ui="classic"\] #bug-report-panel \.reports-picture-thumb \{([^}]*)\}/.exec(classic)?.[1] || '';
    for (const rule of [m, c]) {
      assert.ok(rule);
      assert.doesNotMatch(rule, /object-fit|max-height/, 'never cropped');
      assert.match(rule, /width: (216px|calc\(216 \* var\(--cu\)\))/);
      assert.match(rule, /cursor: zoom-in/);
    }
    assert.match(modern, /#bug-report-panel \.reports-picture-thumb img \{ display: block; width: 100%; height: auto; \}/);
    assert.match(classic, /#bug-report-panel \.reports-picture-thumb img \{ display: block; width: 100%; height: auto; \}/);
  });
});
