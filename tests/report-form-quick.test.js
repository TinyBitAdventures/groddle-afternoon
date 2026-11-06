// Player reports 2026-11-01 (tickets 21, 30, 32): a long reply is read in full, the report form
// takes typing at once with its picture drawn behind it, a blank picture is never sent, and the
// home Mailbox has the original's name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mountReportsSheet, PICTURE_WAIT_MS } from '../public/js/ui/reports-sheet.js?v=c847c05a';
import { blankPicture, leftOut } from '../public/js/features/bug-report-feature.js?v=23935bd3';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const JPEG = (n) => `data:image/jpeg;base64,${'A'.repeat(n)}`;

class Node {
  constructor(tag, doc) { Object.assign(this, { tagName: String(tag).toUpperCase(), ownerDocument: doc, children: [], attrs: {}, listeners: {}, dataset: {}, hidden: false, disabled: false, value: '', className: '', _text: '' }); const self = this; this.classList = { toggle() {}, contains: (c) => self.className.split(' ').includes(c) }; }
  setAttribute(k, v) { if (k === 'hidden') { this.hidden = true; return; } if (k === 'class') { this.className = String(v); return; } if (k === 'id') this.id = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...ns) { for (const n of ns) { if (typeof n !== 'string') { n.parentNode = this; this.children.push(n); } } }
  replaceChildren(...ns) { this.children = []; this.append(...ns); }
  get lastElementChild() { return this.children.at(-1) || null; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  dispatch(k) { for (const fn of this.listeners[k] || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  querySelector() { return null; }
}
function fakeDoc() {
  const doc = { activeElement: null };
  doc.createElement = (t) => new Node(t, doc);
  doc.createTextNode = (t) => Object.assign(new Node('#text', doc), { _text: String(t) });
  return doc;
}
const byId = (r, id) => r.all().find((n) => n.id === id);
const byData = (r, k) => r.all().find((n) => k in n.dataset);

function mount(capture, opts = {}) {
  const doc = fakeDoc();
  const host = new Node('div', doc);
  const calls = [];
  const api = {
    list: async () => ({ tickets: [] }), unread: async () => ({ unread: 0 }), thread: async () => ({}), reply: async () => ({}), close: async () => ({}),
    create: async (message, context, picture = null) => { calls.push([message, picture]); return { status: 'sent', id: 1, ticket: { id: 1, status: 'open', subject: message } }; },
  };
  const sheet = mountReportsSheet({ doc, host, api, capture, now: () => 0, ...opts });
  return { doc, host, sheet, calls };
}

describe('the report form is usable at once (ticket 30)', () => {
  it('opens with the box ready and both ticks usable; the pictures are drawn after, the world first', async () => {
    const asked = [];
    // Ticket 73: the one with the UI after a pause in typing (uiIdle, 1.5 s in the game).
    const { doc, host, sheet } = mount(({ ui }) => { asked.push(ui ? 'ui' : 'world'); return { url: JPEG(40), width: 1280, height: 628 }; }, { uiIdle: 20 });
    sheet.open('new');
    assert.deepEqual(asked, [], 'nothing is drawn as the form opens');
    assert.equal(byId(host, 'reports-picture').disabled, false);
    assert.equal(byId(host, 'reports-picture-ui').disabled, false);
    await wait(5);
    assert.equal(doc.activeElement, byId(host, 'bug-report-text'), 'the caret is in the box');
    await wait(200);
    assert.deepEqual(asked, ['world', 'ui']);
    assert.equal(byData(host, 'reportsPicturePreview').hidden, false);
    assert.ok(PICTURE_WAIT_MS >= 3000 && PICTURE_WAIT_MS <= 10000);
  });

  it('Send never waits long on a picture still drawing: it sends the world picture', async () => {
    const world = { url: JPEG(40), width: 1280, height: 628 };
    const { host, sheet, calls } = mount(({ ui }) => (ui ? new Promise(() => {}) : world), { pictureWait: 40 });
    sheet.open('new');
    await wait(120);
    assert.equal(byId(host, 'reports-picture-hint').textContent, 'Drawing the picture…');
    assert.equal(byId(host, 'reports-picture-ui').disabled, false, 'the UI tick works while it draws');
    byId(host, 'bug-report-text').value = 'Pigs float';
    byData(host, 'bugReportSend').click();
    await wait(120);
    assert.deepEqual(calls, [['Pigs float', world.url]]);
  });

  it('Send right away, before any picture: the world picture is drawn then and goes with it', async () => {
    const world = { url: JPEG(40), width: 1280, height: 628 };
    const { host, sheet, calls } = mount(({ ui }) => (ui ? null : world));
    sheet.open('new');
    byId(host, 'bug-report-text').value = 'Quick one';
    byData(host, 'bugReportSend').click();
    await wait(150);
    assert.deepEqual(calls, [['Quick one', world.url]]);
  });

  it('a UI picture that fails or comes out blank leaves the world picture, the UI tick off', async () => {
    const world = { url: JPEG(40), width: 1280, height: 628 };
    const { host, sheet } = mount(({ ui }) => (ui ? null : world), { uiIdle: 20 });
    sheet.open('new');
    await wait(200);
    assert.equal(byId(host, 'reports-picture-ui').checked, false);
    assert.equal(byId(host, 'reports-picture').checked, true);
    assert.equal(byData(host, 'reportsPicturePreview').dataset.which, 'world');
  });
});

describe('the picture with the UI is quick and never blank (tickets 30, 32)', () => {
  it('copies only what is drawn: closed windows and the Reports window are left out', () => {
    const win = { getComputedStyle: (n) => ({ display: n.display || 'block' }) };
    const el = (o) => ({ nodeType: 1, tagName: 'DIV', ...o });
    assert.equal(leftOut(el({ id: 'bug-report-panel' }), win), true);
    assert.equal(leftOut(el({ hidden: true }), win), true);
    assert.equal(leftOut(el({ display: 'none' }), win), true);
    assert.equal(leftOut(el({ tagName: 'TEMPLATE' }), win), true);
    assert.equal(leftOut(el({ id: 'pack' }), win), false);
    assert.equal(leftOut({ nodeType: 3 }, win), false, 'text is kept');
  });

  function canvasOf(pixel) {
    const data = new Uint8ClampedArray(48 * 24 * 4);
    for (let i = 0; i < 48 * 24; i++) data.set(pixel(i), i * 4);
    return { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data }) }) }) };
  }
  it('a white or one-colour picture is blank; a street is not', () => {
    const src = { width: 1280, height: 628 };
    assert.equal(blankPicture(src, canvasOf(() => [255, 255, 255, 255])), true, 'white (report 32)');
    assert.equal(blankPicture(src, canvasOf((i) => (i % 40 ? [250, 250, 250, 255] : [20, 90, 30, 255]))), true, 'nearly all white');
    assert.equal(blankPicture(src, canvasOf(() => [60, 120, 70, 255])), true, 'one colour');
    assert.equal(blankPicture(src, canvasOf((i) => [(i * 7) % 255, 120, (i * 3) % 255, 255])), false);
    assert.equal(blankPicture({ width: 0, height: 0 }, canvasOf(() => [0, 0, 0, 255])), true);
    assert.equal(blankPicture(src, { createElement: () => ({ getContext: () => { throw new Error('tainted'); } }) }), true);
  });

  it('draws the canvas in as a JPEG, caps WebKit\'s redraws and short-waits closed windows\' images', () => {
    const f = read('public/js/features/bug-report-feature.js');
    const fn = f.slice(f.indexOf('export async function capturePictureWithUi('), f.indexOf('const STYLE = `'));
    assert.match(fn, /world\.toDataURL\('image\/jpeg', 0\.92\)/);
    assert.match(fn, /filter: \(node\) => !leftOut\(node\)/);
    assert.match(fn, /context\.drawImageCount = Math\.min\(context\.drawImageCount, REDRAWS\)/);
    assert.match(fn, /timeout: 1500,[\s\S]*context\.timeout = 8000;/);
    assert.match(fn, /if \(!drawn \|\| blankPicture\(drawn, doc\)\) return null;/);
  });
});

describe('a long reply is read in full (ticket 21)', () => {
  it('the thread scrolls in the sheet body with a scrollbar you can see, every message at full height, in both skins', () => {
    const modern = read('public/js/features/bug-report-feature.js');
    const classic = read('public/css/classic.css');
    for (const [css, root] of [[modern, '\\[data-ui="modern"\\]'], [classic, ':root\\[data-ui="classic"\\]']]) {
      const rule = new RegExp(`${root} #bug-report-panel \\.reports-messages \\{([^}]*)\\}`).exec(css)?.[1] || '';
      assert.ok(rule, 'a messages rule');
      assert.doesNotMatch(rule, /overflow/, 'the list is not a scroller of its own');
      assert.match(rule, /flex: none/);
      assert.match(css, new RegExp(`${root} #bug-report-panel \\.reports-body::-webkit-scrollbar-thumb \\{`));
      assert.match(css, new RegExp(`${root} #bug-report-panel \\.reports-thread-view \\{ flex: 1 0 auto; \\}`));
    }
    const sheet = read('public/js/ui/reports-sheet.js');
    assert.match(sheet, /body\.scrollTop = Math\.max\(0, body\.scrollTop \+ last\.getBoundingClientRect\(\)\.top/, 'opens at the newest message\'s first line');
    assert.doesNotMatch(sheet, /scrollIntoView/);
  });
});

describe('the home Mailbox (ticket 30)', () => {
  it('is called Mailbox, as the original named it (npc_mailbox.js 3-5); "(1)" read as a count of mail', () => {
    assert.match(read('public/js/features/homes-feature.js'), /classId: 'npc_mailbox',\n\s+\/\/[^\n]*\n\s+label: 'Mailbox',/);
    for (const p of ['public/js/features/homes-feature.js', 'public/game.js', 'public/play/index.html', 'public/play/online/index.html']) {
      assert.doesNotMatch(read(p), /Mailbox \(1\)/, p);
    }
  });
});
