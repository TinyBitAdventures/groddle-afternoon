/**
 * TICKETS (2026-10-30): bug reports as threads between a player and the
 * administrators. The game: js/reports.js (the rules and the groddle/v1/tickets
 * calls), js/ui/reports-sheet.js (the Reports sheet), features/bug-report-feature.js
 * (the bug icon, its unread badge and polling), css/classic.css (the 2012 window).
 * The site (groddle-afternoon-site, skipped without it): minn.json's two tables,
 * src/TicketStore.php, Tickets.php (the player's routes), AdminTickets.php (the
 * console's), TicketMigration.php + bin/migrate-bug-reports.php (the old posts),
 * PlayerMail::ticketReply, and the console's Reports tab (console/console.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { REPORT_MAX, REPORT_TEXT, STATUS_WORDS, UNREAD_POLL_MS, createReportsApi, refusalWords, reportFromHash, ticketLine, unreadCount, whenWords } from '../public/js/reports.js?v=g483-1';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=g483-1';
import { BUG_TEXT, badgeFor, bugReportFeature } from '../public/js/features/bug-report-feature.js?v=g483-1';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';
const flush = () => new Promise((r) => setImmediate(r));
const NOW = Date.parse('2026-10-30T12:00:00Z');

// —— A small DOM, enough for the sheet ——
class FakeNode {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.dataset = {};
    this.parentNode = null;
    this._text = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.className = '';
    const self = this;
    this.classList = {
      toggle(c, on) { const set = new Set(self.className.split(/\s+/).filter(Boolean)); if (on) set.add(c); else set.delete(c); self.className = [...set].join(' '); },
      contains(c) { return self.className.split(/\s+/).includes(c); },
    };
  }
  setAttribute(k, v) {
    if (k === 'hidden') { this.hidden = true; return; }
    if (k === 'class') { this.className = String(v); return; }
    if (k === 'id') this.id = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    this.attrs[k] = String(v);
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  append(...nodes) { for (const n of nodes) { if (typeof n === 'string') this.children.push(Object.assign(new FakeNode('#text', this.ownerDocument), { _text: n })); else { n.parentNode = this; this.children.push(n); } } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  get lastElementChild() { return this.children.at(-1) || null; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(kind, fn) { (this.listeners[kind] ||= []).push(fn); }
  dispatch(kind, ev = {}) { for (const fn of this.listeners[kind] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() {}
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  find(pred) { return this.all().find(pred) || null; }
  findAll(pred) { return this.all().filter(pred); }
  querySelector(sel) {
    const m = /^\[data-ticket="(\d+)"\] button$/.exec(sel);
    if (m) return this.find((n) => n.dataset.ticket === m[1])?.children[0] || null;
    return null;
  }
}
function fakeDoc() {
  const doc = { activeElement: null };
  doc.createElement = (t) => new FakeNode(t, doc);
  doc.createTextNode = (t) => Object.assign(new FakeNode('#text', doc), { _text: String(t) });
  return doc;
}
const byData = (rootNode, key) => rootNode.find((n) => key in n.dataset);
const byId = (rootNode, id) => rootNode.find((n) => n.id === id);

function fakeApi({ tickets = [], threads = {} } = {}) {
  const calls = [];
  return {
    calls,
    list: async () => { calls.push(['list']); return { tickets: tickets.map((t) => ({ ...t })), unread: unreadCount(tickets) }; },
    unread: async () => { calls.push(['unread']); return { unread: unreadCount(tickets) }; },
    thread: async (id) => {
      calls.push(['thread', id]);
      const t = tickets.find((x) => x.id === id);
      t.unread = false;
      return { ticket: { ...t }, messages: threads[id] || [] };
    },
    create: async (message, context) => { calls.push(['create', message, context]); const t = { id: 99, status: 'open', subject: message.split('\n')[0], lastAuthor: 'player', lastMessageAt: new Date(NOW).toISOString(), unread: false }; tickets.unshift(t); return { status: 'sent', id: 99, ticket: t }; },
    reply: async (id, message) => {
      calls.push(['reply', id, message]);
      const t = tickets.find((x) => x.id === id);
      Object.assign(t, { status: 'open', lastAuthor: 'player' });
      (threads[id] ||= []).push({ id: 50, author: 'player', body: message, at: new Date(NOW).toISOString() });
      return { ticket: { ...t }, messages: threads[id] };
    },
    close: async (id) => { calls.push(['close', id]); const t = tickets.find((x) => x.id === id); t.status = 'closed'; return { ticket: { ...t }, messages: threads[id] || [] }; },
  };
}

describe('the rules (js/reports.js)', () => {
  it('counts unread replies and reads a reply email\'s link', () => {
    assert.equal(unreadCount([{ unread: true }, { unread: false }, { unread: true }, null]), 2);
    assert.equal(unreadCount(undefined), 0);
    assert.equal(reportFromHash('#report=42'), 42);
    for (const h of ['', '#report=', '#report=4x', '#reports', '#report=1234567890123']) assert.equal(reportFromHash(h), 0, h);
  });

  it('says when in plain words, and who wrote last', () => {
    const ago = (s) => new Date(NOW - s * 1000).toISOString();
    assert.equal(whenWords(ago(20), NOW), 'just now');
    assert.equal(whenWords(ago(5 * 60), NOW), '5 min ago');
    assert.equal(whenWords(ago(3 * 3600), NOW), '3 h ago');
    assert.equal(whenWords(ago(30 * 3600), NOW), 'yesterday');
    assert.equal(whenWords(ago(4 * 86400), NOW), '4 days ago');
    assert.equal(whenWords('nonsense', NOW), '');
    assert.equal(ticketLine({ lastAuthor: 'admin', lastMessageAt: ago(120) }, NOW), 'Administrator replied 2 min ago');
    assert.equal(ticketLine({ lastAuthor: 'player', lastMessageAt: ago(120) }, NOW), 'You wrote 2 min ago');
  });

  it('keeps the original form\'s words and the site\'s limits, with no em dashes', () => {
    assert.equal(BUG_TEXT.title, 'Thanks for reporting a bug!');
    assert.equal(BUG_TEXT.label, 'Please describe the problem you are having:');
    assert.equal(REPORT_MAX, 2000);
    assert.equal(UNREAD_POLL_MS, 60000);
    const words = [...Object.values(REPORT_TEXT).map((v) => (typeof v === 'function' ? `${v(1)} ${v(3)}` : v)), ...Object.values(STATUS_WORDS)];
    for (const w of words) assert.ok(!/[—–]/.test(w), `no em dash: ${w}`);
    assert.equal(refusalWords({ data: { message: 'Too many.' } }), 'Too many.');
    assert.equal(refusalWords(new Error('x')), REPORT_TEXT.failed);
  });

  it('the bug icon\'s badge: hidden at none, a count, 9+ past nine, and the tip says so', () => {
    assert.deepEqual(badgeFor(0), { hidden: true, text: '0', tip: 'Report a bug' });
    assert.deepEqual(badgeFor(1), { hidden: false, text: '1', tip: 'Report a bug (1 new reply)' });
    assert.deepEqual(badgeFor(12), { hidden: false, text: '9+', tip: 'Report a bug (12 new replies)' });
  });
});

describe('the ticket calls (createReportsApi)', () => {
  it('names each route and method, signed in with the session nonce', async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, method: init.method, nonce: init.headers['X-WP-Nonce'], body: init.body });
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ok: 1 }) };
    };
    const api = createReportsApi({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'abcdef1234' });
    await api.list();
    await api.unread();
    await api.thread(7);
    await api.create('It broke', { street: 'GA5' });
    await api.reply(7, 'More');
    await api.close(7);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace('https://groddle.localhost/wp-json/groddle/v1/', '')}`), ['GET tickets', 'GET tickets/unread', 'GET tickets/7', 'POST tickets', 'POST tickets/7/messages', 'POST tickets/7/close']);
    assert.ok(calls.every((c) => c.nonce === 'abcdef1234'));
    assert.deepEqual(JSON.parse(calls[3].body), { message: 'It broke', context: { street: 'GA5' } });
    assert.deepEqual(JSON.parse(calls[4].body), { message: 'More' });
  });

  it('fetches a fresh nonce once when the old one went stale, and throws the site\'s refusal', async () => {
    let n = 0;
    const fetch = async (url, init) => {
      if (url.includes('admin-ajax')) return { ok: true, text: async () => '0123456789' };
      n += 1;
      if (n === 1) return { status: 403, ok: false, headers: { get: () => null }, json: async () => ({ code: 'rest_cookie_invalid_nonce' }) };
      if (init.headers['X-WP-Nonce'] !== '0123456789') throw new Error('old nonce reused');
      return { status: 404, ok: false, headers: { get: () => null }, json: async () => ({ code: 'groddle_ticket_missing', message: 'That report is not one of yours.' }) };
    };
    const api = createReportsApi({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'ffffffffff' });
    await assert.rejects(api.thread(5), (err) => err.status === 404 && err.code === 'groddle_ticket_missing' && refusalWords(err) === 'That report is not one of yours.');
  });
});

describe('the Reports sheet (js/ui/reports-sheet.js)', () => {
  const tickets = () => [
    { id: 3, status: 'answered', subject: 'Pigs float', lastAuthor: 'admin', lastMessageAt: new Date(NOW - 60000).toISOString(), unread: true },
    { id: 2, status: 'closed', subject: 'Old one', lastAuthor: 'player', lastMessageAt: new Date(NOW - 86400000 * 3).toISOString(), unread: false },
  ];

  it('lists your reports with their status and a dot for a new reply, and publishes the hooks', async () => {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    const states = [];
    const api = fakeApi({ tickets: tickets() });
    const sheet = mountReportsSheet({ doc, host, api, onState: (s) => states.push(s), now: () => NOW });
    const panel = byId(host, 'bug-report-panel');
    assert.ok(panel.hidden, 'starts closed');
    assert.equal(panel.className, 'reports-panel ui-sheet ui-sheet-center');
    assert.equal(panel.getAttribute('role'), 'dialog');
    sheet.open('list');
    await flush();
    assert.equal(panel.hidden, false);
    const rows = host.findAll((n) => n.dataset.ticket);
    assert.deepEqual(rows.map((r) => r.dataset.ticket), ['3', '2']);
    assert.equal(rows[0].dataset.unread, '1');
    assert.equal(rows[1].dataset.unread, undefined);
    assert.ok(rows[0].find((n) => n.className === 'reports-dot'));
    assert.ok(rows[0].find((n) => n.className === 'reports-chip is-answered' && n.textContent === 'Answered'));
    assert.ok(rows[0].textContent.includes('Administrator replied 1 min ago'));
    assert.deepEqual(states.at(-1), { state: 'open', view: 'list', unread: 1, ticket: 0, last: '2 reports' });
  });

  it('a thread sets what people wrote as text, marks it read and replies; a reply opens a closed report again', async () => {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    const states = [];
    const api = fakeApi({ tickets: tickets(), threads: { 2: [{ id: 1, author: 'player', body: '<img src=x onerror=alert(1)>', at: new Date(NOW - 86400000 * 3).toISOString() }], 3: [{ id: 4, author: 'admin', body: 'Fixed, thanks!', at: new Date(NOW).toISOString() }] } });
    const sheet = mountReportsSheet({ doc, host, api, onState: (s) => states.push(s), now: () => NOW });
    sheet.open('list');
    await flush();
    await sheet.openTicket(3);
    await flush();
    assert.equal(byId(host, 'bug-report-panel').dataset.reportsView, 'thread');
    assert.equal(states.at(-1).unread, 0, 'read now: the badge goes');
    const msgs = byData(host, 'reportsMessages');
    assert.equal(msgs.children[0].dataset.author, 'admin');
    assert.ok(msgs.children[0].textContent.startsWith('Administrator'));

    await sheet.openTicket(2);
    await flush();
    const body = byData(host, 'reportsMessages').children[0].children[1];
    assert.equal(body.textContent, '<img src=x onerror=alert(1)>', 'kept as text');
    assert.equal(body.children.length, 0, 'never parsed into elements');
    assert.equal(byData(host, 'reportsCloseTicket').hidden, true, 'a closed report offers no Close');
    const reply = byId(host, 'reports-reply-text');
    byData(host, 'reportsSendReply').click();
    await flush();
    assert.equal(states.at(-1).last, REPORT_TEXT.replyEmpty);
    reply.value = '  Still broken  ';
    byData(host, 'reportsSendReply').click();
    await flush();
    await flush();
    assert.deepEqual(api.calls.find((c) => c[0] === 'reply'), ['reply', 2, 'Still broken']);
    assert.equal(byData(host, 'reportsThreadStatus').dataset.status, 'open');
    assert.equal(byData(host, 'reportsCloseTicket').hidden, false);
    byData(host, 'reportsCloseTicket').click();
    await flush();
    assert.deepEqual(api.calls.at(-1), ['close', 2]);
    assert.equal(byData(host, 'reportsThreadStatus').dataset.status, 'closed');
  });

  it('New report is the original form, sent with what the game knew; Esc closes and hands focus back', async () => {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    const opener = new FakeNode('button', doc);
    const toasts = [];
    const api = fakeApi({ tickets: [] });
    const sheet = mountReportsSheet({ doc, host, api, context: () => ({ street: 'GA5101HF7F429V5' }), toast: (t) => toasts.push(t), opener: () => opener, now: () => NOW });
    sheet.open('new');
    await flush();
    const panel = byId(host, 'bug-report-panel');
    assert.equal(panel.dataset.reportsView, 'new');
    const text = byId(host, 'bug-report-text');
    assert.ok(text && 'bugReportText' in text.dataset);
    assert.ok(host.find((n) => n.textContent === 'Thanks for reporting a bug!' && n.className === 'reports-new-title'));
    text.value = 'The pig floated\nup and away';
    byData(host, 'bugReportSend').click();
    await flush();
    await flush();
    assert.deepEqual(api.calls.find((c) => c[0] === 'create'), ['create', 'The pig floated\nup and away', { street: 'GA5101HF7F429V5' }]);
    assert.deepEqual(toasts, [REPORT_TEXT.sent]);
    assert.equal(panel.dataset.reportsView, 'list');
    assert.equal(host.findAll((n) => n.dataset.ticket)[0].dataset.ticket, '99');
    panel.dispatch('keydown', { key: 'Escape' });
    assert.equal(panel.hidden, true);
    assert.equal(doc.activeElement, opener);
    assert.equal(sheet.state, 'closed');
  });

  it('keys typed in the sheet never reach the world', () => {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    const sheet = mountReportsSheet({ doc, host, api: fakeApi(), now: () => NOW });
    sheet.open('new');
    let stopped = 0;
    byId(host, 'bug-report-panel').dispatch('keydown', { key: 'a', stopPropagation: () => { stopped += 1; } });
    assert.equal(stopped, 1);
  });

  it('draws nothing in solo (solo has no account)', () => {
    const before = globalThis.groddleBugReport;
    const e = { mode: 'solo', started: true };
    bugReportFeature.init(e);
    bugReportFeature.onTick(16, 0, e);
    assert.equal(globalThis.groddleBugReport, before);
  });
});

describe('the game wiring', () => {
  it('the feature mounts the sheet in the panel shell and polls the badge; game.js hands features the shell', () => {
    const f = read('public/js/features/bug-report-feature.js');
    assert.match(f, /engine\.panelShell\?\.add\?\.\(\{ id: 'bug-report-panel', kind: 'center'/);
    assert.match(f, /setInterval\(poll, UNREAD_POLL_MS\)/);
    assert.match(f, /if \(sheet\.state !== 'closed' \|\| document\.hidden/);
    assert.match(f, /reportFromHash\(globalThis\.location\?\.hash\)/);
    assert.match(f, /if \(engine\?\.mode !== 'multiplayer'\) return;/);
    assert.match(read('public/game.js'), /get panelShell\(\) \{\n    return panelShell;\n  \},/);
  });

  it('Classic restyles the sheet in place as a 2012 window, every rule under the classic root', () => {
    const css = read('public/css/classic.css');
    const block = css.slice(css.indexOf('/* == TICKETS =='));
    assert.ok(block.length > 200);
    for (const sel of ['#bug-report-panel .reports-card', '#bug-report-panel .reports-head h2', '#bug-report-panel .ui-sheet-x', '#bug-report-panel .reports-body', '#bug-report-panel .reports-foot', '#bug-btn .bug-unread']) assert.ok(block.includes(sel), sel);
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '').match(/[^{}]+\{/g) || [];
    // Split each selector list at its top-level commas (not those inside :is()).
    const split = (sel) => { const out = ['']; let depth = 0; for (const ch of sel) { if (ch === '(') depth += 1; if (ch === ')') depth -= 1; if (ch === ',' && depth === 0) out.push(''); else out[out.length - 1] += ch; } return out; };
    for (const r of rules) for (const s of split(r.slice(0, -1))) if (s.trim()) assert.match(s.trim(), /^:root\[data-ui="classic"\]/, s.trim());
  });
});

describe('the site (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');

  it('declares the two tables additively, with the indexes asked for', () => {
    const m = JSON.parse(src('minn.json'));
    const t = m.tables.groddle_tickets;
    const msg = m.tables.groddle_ticket_messages;
    for (const col of ['id', 'player_user_id', 'status', 'subject', 'created_at', 'updated_at', 'last_message_at', 'last_author_role', 'player_read_at', 'admin_read_at', 'context', 'legacy_post_id']) assert.ok(t.some((l) => l.startsWith(`${col} `)), col);
    assert.ok(t.includes('KEY player_updated (player_user_id,updated_at)'));
    assert.ok(t.includes('KEY status_updated (status,updated_at)'));
    assert.ok(t.includes('UNIQUE KEY legacy_post_id (legacy_post_id)'), 'a post becomes one ticket, even twice run');
    for (const col of ['id', 'ticket_id', 'author_user_id', 'author_role', 'body', 'created_at']) assert.ok(msg.some((l) => l.startsWith(`${col} `)), col);
    assert.ok(msg.includes('KEY ticket_id (ticket_id,id)'));
    assert.ok(m.types.some((x) => x.slug === 'groddle_feedback'), 'the old posts stay listed');
  });

  it('a player reaches only their own tickets: every route that names one reads it through mine()', () => {
    const php = src('src/Tickets.php');
    const routes = [...php.matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(Access::(\w+)\)\)\]\s*public function (\w+)\(([^)]*)\): Response\s*\{([\s\S]*?)\n    \}/g)];
    assert.deepEqual(routes.map((r) => `${r[1]} ${r[2]}`), ['Get /groddle/v1/tickets', 'Get /groddle/v1/tickets/unread', 'Get /groddle/v1/tickets/{id:\\d+}', 'Post /groddle/v1/tickets', 'Post /groddle/v1/tickets/{id:\\d+}/messages', 'Post /groddle/v1/tickets/{id:\\d+}/close']);
    for (const r of routes) {
      assert.equal(r[3], 'SignedIn', r[2]);
      if (r[2].includes('{id')) assert.match(r[6], /\$row = \$this->mine\(\$me, \(int\) \$id\);/, `${r[2]} goes through mine()`);
      assert.doesNotMatch(r[6], /->find\(\(int\) \$id\)/, `${r[2]} never reads a ticket by id alone`);
    }
    const store = src('src/TicketStore.php');
    assert.match(store, /WHERE id = \? AND player_user_id = \?', \[\$ticket, \$player\]/);
    assert.match(store, /WHERE player_user_id = \? ORDER BY updated_at DESC/);
    assert.match(php, /throw new RestError\('groddle_ticket_missing', 'That report is not one of yours\.', 404\)/);
    // The old route files a ticket too, so games built before the sheet keep working.
    assert.match(src('src/BugReports.php'), /#\[Route\(Method::Post, '\/groddle\/v1\/feedback', policy: new Policy\(Access::SignedIn\)\)\]\s*public function send\(Request \$request\): Response\s*\{\s*return \(new Tickets\(\$this->minn\)\)->create\(\$request\);/);
  });

  it('keeps the report\'s limits: length, rate, and the reply limit', () => {
    const php = src('src/Tickets.php');
    const bug = src('src/BugReports.php');
    assert.match(bug, /MAX_MESSAGE = 2000;/);
    assert.match(bug, /PER_WINDOW = 3;/);
    assert.match(bug, /PER_DAY = 20;/);
    assert.match(php, /openedSince\(\$me->id, BugReports::WINDOW, \$now\) >= BugReports::PER_WINDOW \|\| \$store->openedSince\(\$me->id, 86400, \$now\) >= BugReports::PER_DAY/);
    assert.match(php, /writtenSince\(\$me->id, BugReports::WINDOW, \$now\) >= self::REPLY_PER_WINDOW/);
    assert.match(php, /BugReports::context\(/);
  });

  it('the console\'s routes are manage_options only, and each action is logged', () => {
    const php = src('src/AdminTickets.php');
    const routes = [...php.matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(([^)]*)\)\)\]/g)];
    assert.equal(routes.length, 6);
    for (const r of routes) assert.equal(r[3], 'Access::Cap, self::ADMIN', r[2]);
    assert.match(php, /private const ADMIN = 'manage_options';/);
    for (const kind of ['reply', 'close', 'reopen', 'migrate']) assert.match(php, new RegExp(`AdminConsole::recordAction\\(\\$this->minn->db, \\$admin->id, [^,]+, '${kind}'`), kind);
    assert.match(src('src/Extension.php'), /new Tickets\(\$minn\)/);
    assert.match(src('src/Extension.php'), /new AdminTickets\(\$minn\)/);
  });

  it('an administrator\'s reply emails the player once until they read it, within the site\'s mail ceiling', () => {
    const php = src('src/AdminTickets.php');
    assert.match(php, /\$waiting = TicketStore::unreadFor\(\$row, TicketStore::PLAYER\);/);
    assert.match(php, /\$delivery = \$waiting \? 'unread' : \$this->mail\(/);
    assert.match(php, /overHourCap\(\$now, 'report reply'\)/);
    assert.match(php, /\$limits->record\(MailLimits::REPLY,/);
    assert.match(src('src/MailLimits.php'), /public const REPLY = 'reply';/);
    // The character's name or display name, never the username.
    assert.doesNotMatch(php.slice(php.indexOf('private function mail(')), /user_login/);
    // The migration emails nobody.
    assert.doesNotMatch(src('src/TicketMigration.php'), /mail\(/);
  });

  it('the console has a Reports tab: list, thread, reply, close and reopen, and the old reports\' button', async () => {
    const page = src('src/AdminConsolePage.php');
    for (const hook of ['data-console-tab="reports"', 'data-console-tickets', 'data-console-thread', 'data-console-reply', 'data-console-thread-close', 'data-console-thread-reopen', 'data-console-migrate', 'data-console-ticket-filter']) assert.ok(page.includes(hook), hook);
    assert.match(page, /ASSET_KEY = 'g483-1'/);
    const js = src('console/console.js');
    for (const route of ["admin/tickets?status=", "admin/tickets/${id}", "admin/tickets/${tickets.open}/reply", "admin/tickets/${tickets.open}/${kind}", "admin/tickets/migrate"]) assert.ok(js.includes(route), route);
    assert.match(js, /el\('p', \{ class: 'console-msg-body', text: m\.body \}\)/, 'messages set as text');
    const mod = await import(pathToFileURL(sitePath('console/console.js')).href);
    assert.deepEqual(mod.contextRows({ street: 'GA5', streetName: 'Hechey Track', x: '1', y: '', errors: ['boom', ''] }), [['Street', 'Hechey Track'], ['Street id', 'GA5'], ['x', '1'], ['Error 1', 'boom']]);
    assert.equal(mod.logWords({ kind: 'reply', player: { name: 'Ada' }, detail: { subject: 'Pigs' }, delivery: 'mailed' }), 'replied to Ada\'s report “Pigs” (emailed)');
    assert.equal(mod.logWords({ kind: 'migrate', player: { id: 0 }, detail: { made: 10 }, delivery: 'stored' }), 'brought in 10 old bug reports as tickets');
    for (const w of Object.values(mod.TICKET_STATUS)) assert.ok(!/—/.test(w));
  });

  it('the rules, the old posts and the email (php)', { skip: (!hasPhp && 'no php') || noEngine }, () => {
    const out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/tickets.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    assert.deepEqual(out.subject, { short: 'Pigs float', long: `${'a'.repeat(59)}…`, longLen: 60, spaces: 'a b' });
    assert.deepEqual(out.statusAfter, ['open', 'answered']);
    assert.deepEqual(out.unread, { adminWroteNeverRead: true, adminWroteReadBefore: true, adminWroteReadAfter: false, playerWroteForPlayer: false, playerWroteForAdmin: true, playerWroteAdminRead: false });
    assert.deepEqual(out.clean, { control: 'ab\nc', badUtf8: 'ok ?( there', cut: 2000 });
    // An old post: the words (entities read back, <br> a line, paragraphs a blank line apart), the Details as the context.
    assert.equal(out.migration.message, 'The pig & the <b>butterfly</b> froze.\nThen the street went dark.\n\nSecond paragraph.');
    assert.deepEqual(out.migration.context, { street: 'GA5101HF7F429V5', streetName: 'Hechey Track', x: '120', y: '-30', build: 'g465-1', page: '/play/online/', agent: 'Test/1.0', screen: '1280x800', errors: ['TypeError: boom <here>', 'second'] });
    assert.equal(out.migration.bareMessage, 'Only words');
    assert.equal(out.migration.bareContext.street, 'LIF12PMQ5121D68', 'meta fills what the Details lack');
    assert.deepEqual(out.migration.bareContext.errors, ['From meta']);
    assert.equal(out.migration.titleMessage, 'Title only', 'the title without its "<character>: "');
    // The email: escaped, by character name, the thread's link.
    const html = out.mail.html;
    assert.equal(out.mail.subject, 'A reply to your Groddle Afternoon bug report');
    assert.ok(html.includes('Hi <strong>Zz &lt;b&gt;Ada&lt;/b&gt;</strong>,'));
    assert.ok(html.includes('The &lt;i&gt;pig&lt;/i&gt; froze'));
    assert.ok(html.includes('Thanks!<br>\n&lt;script&gt;alert(1)&lt;/script&gt; &amp; fixed.'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('href="https://groddle.example/play/online/#report=7"'));
    assert.ok(!/—/.test(html), 'no em dashes');
    assert.ok(out.mail.headers.includes('Content-Type: text/html; charset=UTF-8'));
  });

  it('the migration is a WP-CLI file Austin can run once at release (safe again)', () => {
    const cli = src('bin/migrate-bug-reports.php');
    assert.match(cli, /new Groddle\\Minn\\TicketMigration\(\$db\)/);
    assert.match(cli, /dry-run/);
    const mig = src('src/TicketMigration.php');
    assert.match(mig, /legacy_post_id/);
    assert.match(mig, /\$store->open\(\(int\) \$row\['post_author'\], \$message, \$context, \$at, \$id\)/);
    assert.match(src('src/TicketStore.php'), /'INSERT ' \. \(\$legacyPost !== null \? 'IGNORE ' : ''\)/);
    assert.doesNotMatch(mig, /UPDATE [^']*posts|DELETE/i, 'the posts stay as they are');
  });
});
