// Ticket 58 (Friendly, 2026-11-03): Include the game's UI showed ticked, greyed, while Attach a
// picture was unticked; and a search box over your own reports. Ticket 115 (Friendly, 2026-11-06):
// tabs by status with counts and a red count of new replies, and unread then answered/open first.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mountReportsSheet, PICTURE_WAIT_MS } from '../public/js/ui/reports-sheet.js?v=2c01d19d';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPORT_FILTER_MIN, REPORT_TABS, REPORT_TEXT, STATUS_ORDER, STATUS_WORDS, matchesReport, sortReports, tabCounts, tabLabel } from '../public/js/reports.js?v=df024080';

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
  dispatch(k, ev = {}) { for (const fn of this.listeners[k] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
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
    // Ticket 115: a closed report goes after the open ones (js/reports.js sortReports).
    assert.deepEqual(rows(host), [1, 2, 3, 5, 4]);
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
    assert.deepEqual(rows(host), [1, 2, 3, 5, 4]);
    assert.equal(byData(host, 'reportsNoMatch').hidden, true);
  });
});

describe('ticket 115: tabs by status, and what needs you first', () => {
  const t = (id, status, { unread = false, at = '2026-11-03T08:00:00Z' } = {}) => ({ id, subject: `Report ${id}`, status, lastAuthor: unread ? 'admin' : 'player', lastMessageAt: at, updatedAt: at, unread });
  const mix = () => [
    t(1, 'closed', { at: '2026-11-06T09:00:00Z' }),
    t(2, 'open', { at: '2026-11-05T09:00:00Z' }),
    t(3, 'answered', { at: '2026-11-01T09:00:00Z' }),
    t(4, 'working', { at: '2026-11-06T08:00:00Z' }),
    t(5, 'answered', { unread: true, at: '2026-11-02T09:00:00Z' }),
    t(6, 'open', { at: '2026-11-06T07:00:00Z' }),
    t(7, 'closed', { unread: true, at: '2026-10-30T09:00:00Z' }),
  ];
  const tabsOf = (host) => byData(host, 'reportsTabs');
  const tab = (host, id) => byId(host, `reports-tab-${id}`);

  it('the tabs are All and every status the site keeps, named as the chips name them', () => {
    assert.deepEqual(REPORT_TABS, ['all', 'open', 'answered', 'working', 'closed']);
    assert.deepEqual([...REPORT_TABS.slice(1)].sort(), Object.keys(STATUS_WORDS).sort());
    assert.deepEqual(REPORT_TABS.map(tabLabel), ['All', 'Open', 'Answered', 'Working on it', 'Closed']);
    assert.deepEqual([...STATUS_ORDER].sort(), Object.keys(STATUS_WORDS).sort());
    for (const k of ['tabsLabel', 'tabAll', 'tabNone']) assert.doesNotMatch(REPORT_TEXT[k], /—|Glitch/, k);
    assert.equal(REPORT_TEXT.tabUnread(1), '1 new reply');
    assert.equal(REPORT_TEXT.tabUnread(3), '3 new replies');
  });

  it('sortReports: a reply you have not read first, then answered, open, working on it, closed, newest first in each', () => {
    const list = mix();
    const before = list.map((x) => x.id);
    assert.deepEqual(sortReports(list).map((x) => x.id), [5, 7, 3, 6, 2, 4, 1]);
    assert.deepEqual(list.map((x) => x.id), before, 'never sorted in place');
    // Ties keep the order the site sent.
    assert.deepEqual(sortReports([t(9, 'open'), t(8, 'open')]).map((x) => x.id), [9, 8]);
    assert.deepEqual(sortReports(null), []);
  });

  it('tabCounts: how many each tab holds and how many hold a new reply', () => {
    assert.deepEqual(tabCounts(mix()), {
      all: { count: 7, unread: 2 },
      open: { count: 2, unread: 0 },
      answered: { count: 2, unread: 1 },
      working: { count: 1, unread: 0 },
      closed: { count: 2, unread: 1 },
    });
  });

  it('the sheet draws the tabs with counts and a red count, and All lists what needs you first', async () => {
    const empty = mount(() => null, {}, []);
    empty.sheet.open('list');
    await wait(20);
    assert.equal(tabsOf(empty.host).hidden, true, 'no tabs before your first report');
    const { host, sheet } = mount(() => null, {}, mix());
    sheet.open('list');
    await wait(20);
    const bar = tabsOf(host);
    assert.equal(bar.hidden, false);
    assert.equal(bar.getAttribute('role'), 'tablist');
    assert.equal(bar.getAttribute('aria-label'), REPORT_TEXT.tabsLabel);
    assert.deepEqual(bar.children.map((b) => b.dataset.reportsTab), REPORT_TABS);
    assert.deepEqual(bar.children.map((b) => [b.dataset.count, b.dataset.unread]), [['7', '2'], ['2', '0'], ['2', '1'], ['1', '0'], ['2', '1']]);
    for (const b of bar.children) {
      assert.equal(b.getAttribute('role'), 'tab');
      assert.equal(b.getAttribute('aria-controls'), 'reports-tabpanel');
    }
    assert.equal(tab(host, 'all').getAttribute('aria-label'), 'All, 7 reports, 2 new replies');
    assert.equal(tab(host, 'working').getAttribute('aria-label'), 'Working on it, 1 report');
    const dot = (id) => tab(host, id).all().find((n) => n.className === 'reports-tab-dot');
    assert.equal(dot('answered').textContent, '1');
    assert.equal(dot('all').textContent, '2');
    assert.equal(dot('open'), undefined, 'no dot on a tab without a new reply');
    // All, in order: unread first, then answered, open, working, closed.
    assert.deepEqual(rows(host), [5, 7, 3, 6, 2, 4, 1]);
    assert.equal(byData(host, 'reportsTabpanel').getAttribute('role'), 'tabpanel');
    assert.equal(byData(host, 'reportsTabpanel').getAttribute('aria-labelledby'), 'reports-tab-all');
  });

  it('a tab shows its reports; arrow keys, Home and End move between the tabs with one in the Tab order', async () => {
    const { doc, host, sheet } = mount(() => null, {}, mix());
    sheet.open('list');
    await wait(20);
    const sel = () => REPORT_TABS.filter((id) => tab(host, id).getAttribute('aria-selected') === 'true');
    const order = () => REPORT_TABS.filter((id) => tab(host, id).getAttribute('tabindex') === '0');
    assert.deepEqual([sel(), order()], [['all'], ['all']]);
    tab(host, 'closed').click();
    assert.deepEqual(rows(host), [7, 1]);
    assert.deepEqual([sel(), order()], [['closed'], ['closed']]);
    assert.equal(byData(host, 'bugReportStatus').textContent, '2 of 7 reports');
    assert.equal(byData(host, 'reportsTabpanel').getAttribute('aria-labelledby'), 'reports-tab-closed');
    const key = (k) => { let stopped = false; tabsOf(host).dispatch('keydown', { key: k, preventDefault() { stopped = true; } }); return stopped; };
    assert.equal(key('ArrowRight'), true);
    assert.deepEqual(sel(), ['all'], 'Right from the last tab goes round to All');
    assert.equal(doc.activeElement, tab(host, 'all'));
    key('ArrowRight');
    assert.deepEqual(sel(), ['open']);
    assert.deepEqual(rows(host), [6, 2]);
    key('ArrowLeft');
    key('ArrowLeft');
    assert.deepEqual(sel(), ['closed'], 'Left from All goes round to Closed');
    key('Home');
    assert.deepEqual(sel(), ['all']);
    key('End');
    assert.deepEqual(sel(), ['closed']);
    assert.equal(doc.activeElement, tab(host, 'closed'));
    assert.equal(key('a'), false, 'other keys are left alone');
    // The search looks inside the tab.
    tab(host, 'answered').click();
    const box = byId(host, 'reports-filter');
    box.value = 'report 3';
    box.dispatch('input');
    assert.deepEqual(rows(host), [3]);
    box.value = '';
    box.dispatch('input');
    // A tab with nothing in it says so.
    const few = mount(() => null, {}, [t(1, 'open')]);
    few.sheet.open('list');
    await wait(20);
    tab(few.host, 'working').click();
    assert.deepEqual(rows(few.host), []);
    assert.equal(byData(few.host, 'reportsTabEmpty').hidden, false);
    assert.equal(byData(few.host, 'reportsTabEmpty').textContent, REPORT_TEXT.tabNone);
    tab(few.host, 'open').click();
    assert.equal(byData(few.host, 'reportsTabEmpty').hidden, true);
  });

  it('a report you send shows in the list whichever tab was open', async () => {
    const { host, sheet } = mount(() => null, {}, [t(1, 'closed')]);
    sheet.open('list');
    await wait(20);
    tab(host, 'closed').click();
    sheet.open('new');
    await wait(150);
    byId(host, 'reports-picture').checked = false;
    byId(host, 'reports-picture').dispatch('change');
    byId(host, 'bug-report-text').value = 'Pigs float';
    byData(host, 'bugReportSend').click();
    await wait(50);
    assert.equal(tab(host, 'all').getAttribute('aria-selected'), 'true');
    assert.ok(rows(host).includes(1));
  });

  it('Modern and Classic style the tabs and their red count from tokens', () => {
    const root = join(import.meta.dirname, '..');
    const feature = readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8');
    const classic = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
    for (const k of ['reports-tabs', 'reports-tab', 'reports-tab-count', 'reports-tab-dot']) {
      assert.match(feature, new RegExp(`\\[data-ui="modern"\\] #bug-report-panel \\.${k} \\{`), `Modern ${k}`);
      assert.match(classic, new RegExp(`:root\\[data-ui="classic"\\] #bug-report-panel \\.${k} \\{`), `Classic ${k}`);
    }
    assert.match(feature, /\.reports-tab\[aria-selected="true"\] \{/);
    assert.match(classic, /\.reports-tab\[aria-selected="true"\] \{/);
    assert.match(feature, /\.reports-tab-dot \{[^}]*background: var\(--danger\)/);
    assert.match(classic, /\.reports-tab-dot \{[^}]*background: var\(--c-classic-unread\)/);
  });
});
