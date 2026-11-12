// Read by the team (Austin 2026-11-12): players asked whether we see their reports and replies. Your
// Reports list and a report's thread say "Read by the team" with the time once an administrator has
// opened the report after your latest message (the site's readByTeamAt, groddle-afternoon-site
// src/TicketStore.php). Only while you wrote last: an answer is its own news, so the two never show
// together; a new message from you clears it until an administrator opens the report again.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=09d79e45';
import { REPORT_TEXT, matchesReport, readByTeamAt, readByTeamWords, readWhen } from '../public/js/reports.js?v=fa6c662a';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hasPhp = spawnSync('php', ['-v']).status === 0;
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';

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
const byData = (r, k) => r.all().find((n) => k in n.dataset);
// A local noon, and a read mark at 2:14 PM the same day.
const NOW = new Date(2026, 10, 12, 16, 0, 0).getTime();
const READ = new Date(2026, 10, 12, 14, 14, 0).toISOString();
const t = (id, status, lastAuthor, readAt, extra = {}) => ({ id, subject: `Report ${id}`, status, lastAuthor, lastMessageAt: '2026-11-12T08:00:00Z', unread: false, adminReplied: false, readByTeamAt: readAt, ...extra });

describe('Read by the team on your reports', () => {
  it('readByTeamAt: the site\'s mark only while you wrote last, any status but Answered', () => {
    assert.equal(readByTeamAt(t(1, 'open', 'player', READ)), READ);
    assert.equal(readByTeamAt(t(2, 'closed', 'player', READ)), READ, 'closing a report never hides it from the team');
    assert.equal(readByTeamAt(t(3, 'working', 'player', READ)), READ);
    assert.equal(readByTeamAt(t(4, 'open', 'player', null)), '', 'not opened since your message');
    assert.equal(readByTeamAt(t(5, 'answered', 'admin', READ)), '', 'an answer says it: never both');
    assert.equal(readByTeamAt(t(6, 'closed', 'admin', READ)), '', 'an administrator wrote last');
    assert.equal(readByTeamAt(t(7, 'open', 'player', 'soon')), '', 'not a time');
    assert.equal(readByTeamAt({ id: 8, status: 'open', lastAuthor: 'player' }), '', 'an older site without the field');
    assert.equal(readByTeamAt(null), '');
  });

  it('the words: the clock time today, else the date (the year only when not this one)', () => {
    assert.match(readWhen(READ, NOW), /^\d{1,2}:14/);
    assert.equal(readByTeamWords(t(1, 'open', 'player', READ), NOW), `Read by the team · ${readWhen(READ, NOW)}`);
    const earlier = new Date(2026, 10, 3, 9, 0, 0).toISOString();
    assert.equal(readWhen(earlier, NOW), new Date(earlier).toLocaleDateString([], { month: 'short', day: 'numeric' }));
    const lastYear = new Date(2025, 11, 30, 9, 0, 0).toISOString();
    assert.match(readWhen(lastYear, NOW), /2025/);
    assert.equal(readByTeamWords(t(2, 'answered', 'admin', READ), NOW), '');
    assert.equal(matchesReport(t(1, 'open', 'player', READ), 'read by the team'), true, 'the search finds the words');
    assert.equal(matchesReport(t(2, 'open', 'player', null), 'read'), false);
    for (const k of ['readByTeam', 'readByTeamHint']) assert.doesNotMatch(REPORT_TEXT[k], /[—–]|Glitch/, k);
  });

  it('the list draws it in the row\'s line, says it to screen readers, and the thread under the newest message', async () => {
    const doc = fakeDoc();
    const host = new Node('div', doc);
    const tickets = [t(1, 'open', 'player', READ), t(2, 'open', 'player', null), t(3, 'answered', 'admin', READ, { adminReplied: true }), t(4, 'closed', 'player', READ, { adminReplied: true })];
    const threads = {
      1: { ticket: tickets[0], messages: [{ id: 1, author: 'player', body: 'Pigs float', at: '2026-11-12T08:00:00Z', edited: null }], picture: null, editable: false },
      2: { ticket: tickets[1], messages: [{ id: 2, author: 'player', body: 'Hi', at: '2026-11-12T08:00:00Z', edited: null }], picture: null, editable: true },
    };
    const api = { list: async () => ({ tickets }), unread: async () => ({ unread: 0 }), thread: async (id) => threads[id], reply: async () => ({}), close: async () => ({}), create: async () => ({}) };
    const sheet = mountReportsSheet({ doc, host, api, capture: () => null, now: () => NOW });
    sheet.open('list');
    await wait(20);
    const rows = byData(host, 'reportsList').children;
    const marked = Object.fromEntries(rows.map((li) => [li.dataset.ticket, li.all().some((n) => 'reportsRead' in n.dataset)]));
    assert.deepEqual(marked, { 1: true, 2: false, 3: false, 4: true });
    const row1 = rows.find((li) => li.dataset.ticket === '1');
    const mark = row1.all().find((n) => 'reportsRead' in n.dataset);
    assert.equal(mark.tagName, 'TIME');
    assert.equal(mark.getAttribute('datetime'), READ);
    assert.equal(mark.textContent, readByTeamWords(tickets[0], NOW));
    assert.equal(mark.getAttribute('title'), REPORT_TEXT.readByTeamHint);
    assert.ok(mark.parentNode.className.includes('reports-line'), 'quiet, in the row\'s second line');
    assert.match(row1.children[0].getAttribute('aria-label'), /Open, Read by the team · /);
    const row4 = rows.find((li) => li.dataset.ticket === '4');
    assert.match(row4.children[0].getAttribute('aria-label'), /Closed, Has a reply, Read by the team/, 'you wrote back after an answer and it was read');

    row1.children[0].click();
    await wait(20);
    const note = byData(host, 'reportsThreadRead');
    assert.equal(note.hidden, false);
    assert.equal(note.textContent, readByTeamWords(tickets[0], NOW));
    rows.find((li) => li.dataset.ticket === '2').children[0].click();
    await wait(20);
    assert.equal(byData(host, 'reportsThreadRead').textContent, '', 'not opened yet: no words');
  });

  it('styled in Modern (the feature\'s sheet CSS) and Classic, with tokens only', () => {
    const modern = readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8');
    for (const sel of ['.reports-read {', '.reports-read-note {']) {
      const rule = modern.split('\n').find((l) => l.includes(sel));
      assert.ok(rule && rule.startsWith('[data-ui="modern"] #bug-report-panel'), sel);
      assert.doesNotMatch(rule, /#[0-9a-f]{3,6}\b|rgb|\d+px/i, sel);
    }
    const classic = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
    for (const sel of ['.reports-read {', '.reports-read-note {']) {
      const rule = classic.split('\n').find((l) => l.includes(sel));
      assert.ok(rule && rule.startsWith(':root[data-ui="classic"] #bug-report-panel'), sel);
      assert.ok(classic.indexOf(rule) > classic.indexOf('/* == TICKETS =='), 'with the other Reports rules');
      assert.doesNotMatch(rule, /#[0-9a-f]{3,6}\b|rgb/i, sel);
    }
  });

  it('the site: the summary carries readByTeamAt, and an administrator opening it again keeps the first time', { skip: skipWithoutSite }, () => {
    const store = readFileSync(sitePath('src/TicketStore.php'), 'utf8');
    const summary = store.slice(store.indexOf('public static function summary('), store.indexOf('public static function messagesOut('));
    assert.match(summary, /'readByTeamAt' => self::readByTeamAt\(\$row\),/);
    const mark = store.slice(store.indexOf('public function markRead('), store.indexOf('public function markUnreadForPlayer('));
    assert.match(mark, /SET admin_read_at = IF\(admin_read_at IS NOT NULL AND admin_read_at >= last_message_at, admin_read_at, \?\) WHERE id = \?/);
    assert.match(mark, /SET player_read_at = \? WHERE id = \?/);
    // The player's routes all answer with the summary: the list and the thread.
    const php = readFileSync(sitePath('src/Tickets.php'), 'utf8');
    assert.match(php, /readByTeamAt: time\|null/);
    assert.match(php, /'ticket' => TicketStore::summary\(\$row, TicketStore::PLAYER\)/);
    assert.match(php, /TicketStore::summary\(\$r, TicketStore::PLAYER\), \$store->listFor\(\$me->id\)/);
    // The console's open (and /groddle-check, the same route) is the administrators' read.
    assert.match(readFileSync(sitePath('src/AdminTickets.php'), 'utf8'), /markRead\(\(int\) \$row\['id'\], TicketStore::ADMIN, time\(\)\)/);
    const fn = store.slice(store.indexOf('public static function readByTeamAt('), store.indexOf('Writing', store.indexOf('public static function readByTeamAt(')) - 6);
    assert.match(fn, /\(\$row\['last_author_role'\] \?\? ''\) !== self::PLAYER/);
    for (const part of [fn, mark, summary]) assert.doesNotMatch(part, /[—–]/);
  });

  it('the site: readByTeamAt from the read marks (php)', { skip: skipWithoutSite || (!hasPhp && 'no php') || noEngine }, () => {
    const out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/tickets.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    assert.deepEqual(out.readByTeam, {
      neverOpened: null,
      openedAfter: '2026-10-30T12:05:00Z',
      sameSecond: '2026-10-30T12:00:00Z',
      openedBeforeNewMessage: null,
      adminWroteLast: null,
      closedStillShows: '2026-10-30T12:05:00Z',
      summary: '2026-10-30T12:05:00Z',
      summaryNone: null,
    });
  });
});
