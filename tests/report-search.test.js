// Ticket 58 (Friendly, 2026-11-03): Include the game's UI showed ticked, greyed, while Attach a
// picture was unticked; and a search box over your own reports.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mountReportsSheet, PICTURE_WAIT_MS } from '../public/js/ui/reports-sheet.js?v=b1c361d4';
import { REPORT_FILTER_MIN, REPORT_TEXT, matchesReport } from '../public/js/reports.js?v=aae32361';

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

function mount(capture, opts = {}, tickets = []) {
  const doc = fakeDoc();
  const host = new Node('div', doc);
  const calls = [];
  const api = {
    list: async () => ({ tickets }), unread: async () => ({ unread: 0 }), thread: async () => ({}), reply: async () => ({}), close: async () => ({}),
    create: async (message, context, picture = null) => { calls.push([message, picture]); return { status: 'sent', id: 1, ticket: { id: 1, status: 'open', subject: message } }; },
  };
  const sheet = mountReportsSheet({ doc, host, api, capture, now: () => 0, ...opts });
  return { doc, host, sheet, calls };
}


const ticket = (id, subject, status = 'open') => ({ id, subject, status, lastAuthor: 'player', lastMessageAt: '2026-11-03T08:00:00Z', unread: false });
const rows = (host) => byData(host, 'reportsList').children.map((li) => Number(li.dataset.ticket));

describe('ticket 58: the UI tick follows the picture tick', () => {
  it('unticking Attach a picture shows Include the game\'s UI unticked and greyed; ticking it again brings the choice back', async () => {
    const { host, sheet } = mount(() => ({ url: JPEG(40), width: 1280, height: 628 }));
    sheet.open('new');
    await wait(150);
    const pic = byId(host, 'reports-picture');
    const ui = byId(host, 'reports-picture-ui');
    assert.equal(ui.checked, true);
    pic.checked = false;
    pic.dispatch('change');
    assert.equal(ui.disabled, true);
    assert.equal(ui.checked, false, 'it no longer shows ticked');
    pic.checked = true;
    pic.dispatch('change');
    assert.equal(ui.disabled, false);
    assert.equal(ui.checked, true, 'the UI choice comes back');
    // A choice of world only is kept across it too.
    ui.checked = false;
    ui.dispatch('change');
    pic.checked = false;
    pic.dispatch('change');
    pic.checked = true;
    pic.dispatch('change');
    assert.equal(ui.checked, false);
  });

  it('with the picture unticked the report goes without one', async () => {
    const { host, sheet, calls } = mount(() => ({ url: JPEG(40), width: 1280, height: 628 }));
    sheet.open('new');
    await wait(150);
    byId(host, 'reports-picture').checked = false;
    byId(host, 'reports-picture').dispatch('change');
    byId(host, 'bug-report-text').value = 'No picture';
    byData(host, 'bugReportSend').click();
    await wait(50);
    assert.deepEqual(calls, [['No picture', null]]);
  });
});

describe('ticket 58: search your reports', () => {
  it('matches every word in the subject or status, any case or accent, or the report number', () => {
    const t = ticket(58, 'could you add a keyword search to bug reports', 'answered');
    assert.equal(matchesReport(t, ''), true);
    assert.equal(matchesReport(t, 'KEYWORD bug'), true);
    assert.equal(matchesReport(t, 'keyword pick'), false);
    assert.equal(matchesReport(t, 'answered'), true);
    assert.equal(matchesReport(t, '#58'), true);
    assert.equal(matchesReport(t, '5'), false);
    assert.equal(matchesReport(ticket(1, 'Café door'), 'cafe'), true);
    for (const k of ['filterLabel', 'filterPlaceholder', 'filterNone']) assert.doesNotMatch(REPORT_TEXT[k], /—|Glitch/, k);
  });

  it('shows the box once you have a few reports, and filters the list as you type', async () => {
    const few = [ticket(1, 'A pig floats'), ticket(2, 'Broken pick still mines')];
    const small = mount(() => null, {}, few);
    small.sheet.open('list');
    await wait(20);
    assert.equal(byId(small.host, 'reports-filter').hidden, true, `hidden under ${REPORT_FILTER_MIN} reports`);
    const many = [ticket(1, 'A pig floats'), ticket(2, 'Broken pick still mines'), ticket(3, 'Map: under construction streets'), ticket(4, 'Pick icon not broken', 'closed'), ticket(5, 'Stars behind the door')];
    const { host, sheet } = mount(() => null, {}, many);
    sheet.open('list');
    await wait(20);
    const box = byId(host, 'reports-filter');
    assert.equal(box.hidden, false);
    assert.deepEqual(rows(host), [1, 2, 3, 4, 5]);
    box.value = 'pick';
    box.dispatch('input');
    assert.deepEqual(rows(host), [2, 4]);
    assert.equal(byData(host, 'bugReportStatus').textContent, '2 of 5 reports');
    box.value = 'pick closed';
    box.dispatch('input');
    assert.deepEqual(rows(host), [4]);
    box.value = 'dragon';
    box.dispatch('input');
    assert.deepEqual(rows(host), []);
    assert.equal(byData(host, 'reportsNoMatch').hidden, false);
    box.value = '';
    box.dispatch('input');
    assert.deepEqual(rows(host), [1, 2, 3, 4, 5]);
    assert.equal(byData(host, 'reportsNoMatch').hidden, true);
  });
});
