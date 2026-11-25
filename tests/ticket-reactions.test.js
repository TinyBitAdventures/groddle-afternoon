/**
 * Reactions on bug report messages (Austin 2026-11-18: "In bug reports can we add a similar emoji
 * response, like we have in live chat? Both for users and on console."). The game: js/reports.js
 * (the rules and api.react), js/ui/reports-sheet.js (the chips and picker under each message, drawn by
 * the chat's js/ui/reaction-strip.js). The site (groddle-afternoon-site, skipped without it):
 * minn.json's table, src/TicketReactions.php, the routes in Tickets.php and AdminTickets.php, the
 * console's chips (console/console.js) and the QA cleanup (tools/qa/smoke-cleanup.mjs). The rules run
 * on a throwaway MariaDB database (tests/fixtures/ticket-reactions/ticket-reactions.php).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { reactionsJson } from '../tools/build-reactions.mjs';
import { NAMES_SHOWN, REACTIONS } from '../public/js/chat-reactions.js?v=38460172';
import { REPORT_TEXT, createReportsApi } from '../public/js/reports.js?v=e861d5aa';
import { parseReportReactionKey, reactorOf, reportReactionKey, reportReactions } from '../public/js/report-reactions.js?v=69462240';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=92486673';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const NOW = Date.parse('2026-11-18T12:00:00Z');
const flush = () => new Promise((r) => setImmediate(r));

// —— A small DOM: enough for the sheet and the chat's reaction strip ——
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
    this.style = {};
    const self = this;
    const set = () => new Set(self.className.split(/\s+/).filter(Boolean));
    this.classList = {
      add(c) { const s = set(); s.add(c); self.className = [...s].join(' '); },
      remove(c) { const s = set(); s.delete(c); self.className = [...s].join(' '); },
      toggle(c, on) { const s = set(); if (on ?? !s.has(c)) s.add(c); else s.delete(c); self.className = [...s].join(' '); },
      contains(c) { return set().has(c); },
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
  removeAttribute(k) { delete this.attrs[k]; }
  append(...nodes) { for (const n of nodes) { if (typeof n === 'string') this.children.push(Object.assign(new FakeNode('#text', this.ownerDocument), { _text: n })); else { n.parentNode?.children && n.parentNode !== this && n.parentNode.removeChild(n); n.parentNode = this; this.children.push(n); } } }
  replaceChildren(...nodes) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...nodes); }
  removeChild(n) { this.children = this.children.filter((c) => c !== n); n.parentNode = null; return n; }
  insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }
  remove() { this.parentNode?.removeChild(this); }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { const s = this.parentNode?.children || []; return s[s.indexOf(this) + 1] || null; }
  get lastElementChild() { return this.children.at(-1) || null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.isRoot === true; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  contains(n) { return this.all().includes(n); }
  addEventListener(kind, fn) { (this.listeners[kind] ||= []).push(fn); }
  dispatch(kind, ev = {}) { for (const fn of this.listeners[kind] || []) fn({ target: this, button: 0, detail: 1, preventDefault() {}, stopPropagation() {}, ...ev }); }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, top: 100, right: 300, bottom: 120, width: 300, height: 20 }; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  find(pred) { return this.all().find(pred) || null; }
  findAll(pred) { return this.all().filter(pred); }
  querySelector() { return null; }
  querySelectorAll(sel) { const m = /^\[data-([a-z-]+)\]$/.exec(sel); if (!m) return []; const k = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()); return this.findAll((n) => k in n.dataset); }
}
function fakeDoc() {
  const doc = { activeElement: null, listeners: {} };
  doc.createElement = (t) => new FakeNode(t, doc);
  doc.createTextNode = (t) => Object.assign(new FakeNode('#text', doc), { _text: String(t) });
  doc.addEventListener = (k, fn) => { (doc.listeners[k] ||= []).push(fn); };
  doc.removeEventListener = (k, fn) => { doc.listeners[k] = (doc.listeners[k] || []).filter((f) => f !== fn); };
  return doc;
}

const by = (id, name, you = false) => ({ id, name, you });

describe('reactions on a report message: the game\'s rules (js/report-reactions.js, js/reports.js)', () => {
  it('a message\'s key, read back; nothing without both ids', () => {
    assert.equal(reportReactionKey(7, 21), 't:7:21');
    assert.deepEqual(parseReportReactionKey('t:7:21'), { ticket: 7, message: 21 });
    for (const bad of [reportReactionKey(0, 21), reportReactionKey(7, 0), reportReactionKey('x', 2)]) assert.equal(bad, '');
    for (const rk of ['', 'l:5', 'im:3:4', 't:7', 't:a:b', 't:7:21:1']) assert.equal(parseReportReactionKey(rk), null, rk);
  });

  it('the site\'s reactions read as the chat\'s chips: its order, known keys only, you found by the site\'s mark', () => {
    const raw = [{ e: 'heart', by: [by(1, 'Austin')], mine: false }, { e: 'someday', by: [by(9, 'Ada', true)] }, { e: 'like', by: [by(9, 'Ada', true), by(1, 'Austin')], mine: true }];
    assert.deepEqual(reportReactions(raw), [{ key: 'like', by: [{ id: 9, name: 'Ada' }, { id: 1, name: 'Austin' }] }, { key: 'heart', by: [{ id: 1, name: 'Austin' }] }]);
    assert.equal(reactorOf([{ reactions: raw }]), 9);
    assert.equal(reactorOf([{ reactions: [{ e: 'like', by: [by(1, 'Austin')] }] }, {}]), 0, 'nobody marked you: none of them are yours');
    assert.equal(reactorOf(undefined), 0);
  });

  it('api.react names the route, signed in, and sends the reaction with on or off', async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, method: init.method, nonce: init.headers['X-WP-Nonce'], body: init.body });
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ message: 21, reactions: [] }) };
    };
    const api = createReportsApi({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'abcdef1234' });
    await api.react(7, 21, 'hi', true);
    await api.react(7, 21, 'hi', 0);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace('https://groddle.localhost/wp-json/groddle/v1/', '')}`), ['POST tickets/7/messages/21/reactions', 'POST tickets/7/messages/21/reactions']);
    assert.deepEqual(calls.map((c) => JSON.parse(c.body)), [{ e: 'hi', on: true }, { e: 'hi', on: false }]);
    assert.ok(calls.every((c) => c.nonce === 'abcdef1234'));
    assert.ok(!/[—–]/.test(REPORT_TEXT.reactFailed));
  });
});

describe('reactions on a report message: the Reports sheet', () => {
  const ticket = { id: 7, status: 'answered', subject: 'Pigs float', lastAuthor: 'admin', lastMessageAt: new Date(NOW - 60000).toISOString(), unread: false };
  const thread = () => [
    { id: 20, author: 'player', body: 'The pig floats.', at: new Date(NOW - 3600000).toISOString(), reactions: [] },
    { id: 21, author: 'admin', body: 'Thanks, looking.', at: new Date(NOW - 60000).toISOString(), reactions: [{ e: 'heart', by: [by(1, 'Austin')], mine: false }] },
  ];
  function setup(messages = thread()) {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    host.isRoot = true;
    const calls = [];
    const data = {};
    const api = {
      list: async () => ({ tickets: [{ ...ticket }], unread: 0 }),
      unread: async () => ({ unread: 0 }),
      thread: async () => ({ ticket: { ...ticket }, messages }),
      react: async (id, message, e, on) => {
        calls.push([id, message, e, on]);
        const m = messages.find((x) => x.id === message);
        const list = (m.reactions || []).map((r) => ({ ...r, by: [...r.by] }));
        let r = list.find((x) => x.e === e);
        if (on && !r) list.push((r = { e, by: [], mine: false }));
        if (r) {
          r.by = r.by.filter((b) => b.id !== 9);
          if (on) r.by.push(by(9, 'Ada', true));
          r.mine = on;
        }
        return { message, reactions: list.filter((x) => x.by.length) };
      },
    };
    const sheet = mountReportsSheet({ doc, host, api, now: () => NOW, setData: (k, v) => { data[k] = v; } });
    return { doc, host, sheet, calls, data, api };
  }
  const rowOf = (host, id) => host.find((n) => n.dataset.reportsMsgReact === String(id));

  it('each message has the chat\'s add button and its chips, the administrator\'s heart among them', async () => {
    const { host, sheet } = setup();
    sheet.open('list');
    await flush();
    await sheet.openTicket(7);
    await flush();
    const mine = rowOf(host, 20);
    const theirs = rowOf(host, 21);
    assert.ok(mine && theirs, 'a row under each message');
    assert.equal(mine.parentNode.dataset.author, 'player');
    const addMine = mine.find((n) => n.className === 'react-add');
    const addTheirs = theirs.find((n) => n.className === 'react-add');
    assert.equal(addMine.getAttribute('aria-label'), 'React to your message');
    assert.equal(addTheirs.getAttribute('aria-label'), 'React to Administrator\'s message');
    const strip = theirs.find((n) => n.className === 'react-strip');
    assert.equal(strip.hidden, false);
    const heart = strip.children[0];
    assert.equal(heart.dataset.reactChip, 'heart');
    assert.equal(heart.getAttribute('aria-pressed'), 'false');
    assert.equal(heart.dataset.reactWho, 'Heart: Austin');
    assert.equal(heart.textContent, '❤️1');
    assert.equal(mine.find((n) => n.className === 'react-strip').hidden, true, 'no chips yet: none drawn');
  });

  it('the picker opens inside the window with the eight; a pick sends it and the chips come back from the site, yours pressed', async () => {
    const { host, sheet, calls, data } = setup();
    sheet.open('list');
    await flush();
    await sheet.openTicket(7);
    await flush();
    const panel = host.find((n) => n.id === 'bug-report-panel');
    rowOf(host, 21).find((n) => n.className === 'react-add').click();
    const picker = panel.find((n) => 'reactPicker' in n.dataset);
    assert.ok(picker, 'the picker is in the Reports window (over it, keys kept in it)');
    assert.deepEqual(picker.children.map((b) => b.dataset.reactPick), REACTIONS.map((r) => r.key));
    picker.children.find((b) => b.dataset.reactPick === 'heart').click();
    await flush();
    await flush();
    assert.deepEqual(calls, [[7, 21, 'heart', true]]);
    assert.equal(data.reportReact, 'heart:on:done');
    const heart = rowOf(host, 21).find((n) => n.dataset.reactChip === 'heart');
    assert.equal(heart.textContent, '❤️2');
    assert.equal(heart.getAttribute('aria-pressed'), 'true');
    assert.equal(heart.dataset.reactWho, 'Heart: You and Austin');
    // A click on your chip takes it off.
    heart.click();
    await flush();
    await flush();
    assert.deepEqual(calls.at(-1), [7, 21, 'heart', false]);
    assert.equal(rowOf(host, 21).find((n) => n.dataset.reactChip === 'heart').getAttribute('aria-pressed'), 'false');
  });

  it('a site from before reactions sends none: no button, nothing to press', async () => {
    const { host, sheet } = setup([{ id: 20, author: 'player', body: 'Old site.', at: new Date(NOW).toISOString() }]);
    sheet.open('list');
    await flush();
    await sheet.openTicket(7);
    await flush();
    assert.equal(rowOf(host, 20), null);
    assert.equal(host.find((n) => n.className === 'react-add'), null);
  });

  it('a refused reaction says the site\'s words in the window, and the chips stay as they were', async () => {
    const { host, sheet, data, api } = setup();
    api.react = async () => { throw Object.assign(new Error('slow'), { status: 429, code: 'groddle_ticket_react_slow', data: { message: 'Slow down a little with the reactions.' } }); };
    sheet.open('list');
    await flush();
    await sheet.openTicket(7);
    await flush();
    rowOf(host, 21).find((n) => n.dataset.reactChip === 'heart').click();
    await flush();
    await flush();
    assert.equal(data.reportReact, 'heart:on:failed');
    assert.ok(host.find((n) => n.textContent === 'Slow down a little with the reactions.' && n.children.length === 0));
    assert.equal(rowOf(host, 21).find((n) => n.dataset.reactChip === 'heart').textContent, '❤️1');
  });
});

describe('reactions on a report message: the CSS and the shared set', () => {
  it('the chips sit under the words in both skins, chips first, the add button after and in sight', () => {
    const css = read('public/js/features/bug-report-feature.js');
    assert.match(css, /#bug-report-panel \.reports-msg-react \{ display: flex; flex-wrap: wrap;/);
    assert.match(css, /#bug-report-panel \.reports-msg-react > \.react-add \{ order: 1; margin-left: 0; opacity: 0\.6; \}/);
    // The chips' own look is the chat's (style.css .react-chip, css/classic.css :root[data-ui="classic"] .react-chip).
    assert.match(read('public/style.css'), /\.react-chip \{/);
    assert.match(read('public/css/classic.css'), /:root\[data-ui="classic"\] \.react-chip \{/);
  });

  it('the set is the chat\'s, from one place: data/reactions.json is what tools/build-reactions.mjs writes', { skip: skipWithoutSite }, () => {
    assert.equal(readFileSync(sitePath('data/reactions.json'), 'utf8'), reactionsJson(), 'run node tools/build-reactions.mjs');
    const json = JSON.parse(readFileSync(sitePath('data/reactions.json'), 'utf8'));
    assert.deepEqual(json.reactions.map((r) => r.key), ['like', 'heart', 'laugh', 'wow', 'sad', 'tada', 'thanks', 'hi']);
    assert.equal(json.namesShown, NAMES_SHOWN);
    // The site reads it (CommunityText::reactions) and never lists the keys itself.
    const php = readFileSync(sitePath('src/TicketReactions.php'), 'utf8');
    assert.match(php, /CommunityText::isReaction\(\$key\)/);
    assert.match(php, /array_keys\(CommunityText::reactions\(\)\)/);
    for (const r of REACTIONS) assert.doesNotMatch(php, new RegExp(`'${r.key}'`), `no hand copy of ${r.key}`);
    const page = readFileSync(sitePath('src/AdminConsolePage.php'), 'utf8');
    assert.match(page, /data-reactions="' \. Html::attr\(self::reactionsJson\(\)\)/);
    assert.match(page, /foreach \(CommunityText::reactions\(\) as \$key => \[\$glyph, \$label, \$art\]\)/);
    const consoleJs = readFileSync(sitePath('console/console.js'), 'utf8');
    for (const r of REACTIONS.filter((x) => x.glyph)) assert.ok(!consoleJs.includes(r.glyph), `the console has no copy of ${r.key}`);
  });
});

describe('reactions on a report message: the site (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');

  it('declares its table additively: one row a person a reaction a message, by ticket for the cleanup', () => {
    const t = JSON.parse(src('minn.json')).tables.groddle_ticket_message_reactions;
    assert.deepEqual(t, [
      'message_id bigint(20) unsigned NOT NULL',
      'ticket_id bigint(20) unsigned NOT NULL',
      'user_id bigint(20) unsigned NOT NULL',
      "role varchar(8) NOT NULL DEFAULT 'player'",
      'reaction varchar(12) NOT NULL',
      'created_at datetime NOT NULL',
      'PRIMARY KEY  (message_id,user_id,reaction)',
      'KEY ticket_id (ticket_id)',
      'KEY user_id (user_id,created_at)',
    ]);
    assert.match(src('src/TicketReactions.php'), /public const TABLE = 'groddle_ticket_message_reactions';/);
  });

  it('the player reacts only in their own report (mine()), an administrator anywhere (manage_options), and neither is a reply', () => {
    const player = src('src/Tickets.php');
    const route = player.slice(player.indexOf("'/groddle/v1/tickets/{id:\\d+}/messages/{message:\\d+}/reactions'"), player.indexOf('private function pictures('));
    assert.match(route, /policy: new Policy\(Access::SignedIn\)/);
    assert.match(route, /\$row = \$this->mine\(\$me, \(int\) \$id\);/);
    assert.match(route, /->toggle\(\(int\) \$row\['id'\], \(int\) \$message, \$me->id, TicketStore::PLAYER,/);
    const admin = src('src/AdminTickets.php');
    const aroute = admin.slice(admin.indexOf("'/groddle/v1/admin/tickets/{id:\\d+}/messages/{message:\\d+}/reactions'"), admin.indexOf("'/groddle/v1/admin/tickets/migrate'"));
    assert.match(aroute, /policy: new Policy\(Access::Cap, self::ADMIN\)/);
    assert.match(aroute, /->toggle\(\(int\) \$row\['id'\], \(int\) \$message, \$admin->id, TicketStore::ADMIN,/);
    // No email, no activity line, no status, read mark or message: nothing but the reaction row.
    const store = src('src/TicketReactions.php');
    const code = (text) => text.split('\n').filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join('\n');
    for (const text of [route, aroute, store]) {
      assert.doesNotMatch(code(text), /mail\(|recordAction|setStatus|markRead|->add\(|last_message_at|UPDATE /);
    }
  });

  it('the QA cleanup takes a throwaway\'s reactions (their user_id) and every reaction on their reports (by ticket)', async () => {
    const { cleanupStatements, ID_COLUMN_REGEXP } = await import('../tools/qa/smoke-cleanup.mjs');
    const sql = cleanupStatements({ ids: [61], emails: [], cols: [['wp_groddle_ticket_message_reactions', 'user_id'], ['wp_groddle_tickets', 'player_user_id']], like: 'zz-smoke-1234-%@groddle.localhost', minId: 54 });
    assert.equal(sql[1], 'DELETE r FROM wp_groddle_ticket_message_reactions r JOIN wp_groddle_tickets t ON t.id = r.ticket_id WHERE t.player_user_id IN (61);');
    assert.ok(sql.includes('DELETE FROM wp_groddle_ticket_message_reactions WHERE user_id IN (61);'));
    assert.ok(sql.indexOf(sql[1]) < sql.indexOf('DELETE FROM wp_groddle_tickets WHERE player_user_id IN (61);'));
    assert.ok(new RegExp(ID_COLUMN_REGEXP).test('user_id'));
  });

  it('the console: the set from the page, who reacted in the chat\'s words', async () => {
    const mod = await import(pathToFileURL(sitePath('console/console.js')).href);
    const set = mod.reactionSet(readFileSync(sitePath('data/reactions.json'), 'utf8').replace(/^[\s\S]*"reactions": /, '').replace(/\}\s*$/, ''));
    assert.deepEqual(set.map((r) => r.key), REACTIONS.map((r) => r.key));
    assert.equal(set.find((r) => r.key === 'hi').art, '/assets/sprites/hi-signs/hi_hi_1@3x.webp');
    assert.deepEqual(mod.reactionSet('nonsense'), []);
    assert.deepEqual(mod.reactionSet('[{"key":"BAD"},{"key":"like","glyph":"👍","label":"Thumbs up"}]'), [{ key: 'like', glyph: '👍', label: 'Thumbs up', art: '' }]);
    const like = { key: 'like', label: 'Thumbs up' };
    assert.equal(mod.reactionTip(like, [by(9, 'Ada'), by(1, 'Austin', true)]), 'Thumbs up: You and Ada');
    assert.equal(mod.reactionTip(like, [by(9, 'Ada')]), 'Thumbs up: Ada');
    assert.equal(mod.reactionTip(like, []), 'Thumbs up');
    assert.equal(mod.reactionTip(like, Array.from({ length: 10 }, (_, i) => by(i + 2, `P${i}`))), 'Thumbs up: P0, P1, P2, P3, P4, P5, P6 and 3 others');
    assert.equal(mod.REACTION_NAMES, NAMES_SHOWN);
    const js = src('console/console.js');
    assert.match(js, /api\.call\(`admin\/tickets\/\$\{ticket\}\/messages\/\$\{message\}\/reactions`, \{ method: 'POST', body: \{ e: key, on \} \}\)/);
    assert.match(js, /reactionRow\(t\.id, m\)\)\)\);/);
    assert.match(src('console/console.css'), /\.console-msg-reactions \{ display: flex;/);
  });
});

// —— The rules on a throwaway database ——
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = HAS_PHP;
function mysql() {
  const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, 'utf8');
  const def = (k) => text.match(new RegExp(`define\\(\\s*'${k}',\\s*'([^']*)'`))?.[1];
  const host = def('DB_HOST');
  const user = def('DB_USER');
  return host && user ? { host, user, pass: def('DB_PASSWORD') || '' } : null;
}
const db = mysql();
const reachable = db && hasPhp && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('reactions on a report message: the rules on a throwaway database', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [join(import.meta.dirname, 'fixtures/ticket-reactions/ticket-reactions.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_reactions_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('the player reacts on any message of their own report, once a reaction, and takes it off', () => {
    const [first, second] = r.messageIds;
    assert.deepEqual(r.player.like, { status: 200, body: { message: second, reactions: [{ e: 'like', by: [{ id: 910, name: 'Ada', you: true }], mine: true }] } });
    assert.deepEqual(r.player.again, r.player.like, 'twice on is still one');
    assert.equal(r.player.hi.body.message, first);
    assert.deepEqual(r.off, { status: 200, body: { message: first, reactions: [] } });
    assert.deepEqual(r.offAgain, r.off);
  });

  it('never on anyone else\'s report, a message of another report, a key outside the set, or signed out', () => {
    assert.deepEqual(r.player.otherReport, { status: 404, code: 'groddle_ticket_missing' });
    assert.deepEqual(r.player.notTheirs, { status: 404, code: 'groddle_ticket_missing' });
    assert.deepEqual(r.player.messageOfAnother, { status: 404, code: 'groddle_ticket_message_missing' });
    assert.deepEqual(r.player.badKey, { status: 400, code: 'groddle_ticket_reaction' });
    assert.deepEqual(r.player.notString, { status: 400, code: 'groddle_ticket_reaction' });
    assert.deepEqual(r.player.signedOut, { status: 401, code: 'groddle_feedback_signed_out' });
  });

  it('an administrator reacts on any message, named by their display name ("Administrator" when that is only their username)', () => {
    assert.deepEqual(r.admin.heart.body.reactions.find((x) => x.e === 'heart'), { e: 'heart', by: [{ id: 900, name: 'Zz Staffer', you: true }], mine: true });
    // Oldest first; reactions in the same second (created_at is whole seconds) tie by user id, so the set is what holds.
    assert.deepEqual(r.admin.helper.body.reactions[0].by.map((b) => b.name).sort(), ['Ada', 'Administrator', 'Zz Staffer']);
    assert.equal(r.admin.beas.status, 200, 'any player\'s report');
    assert.deepEqual(r.admin.missingTicket, { status: 404, code: 'groddle_ticket_missing' });
    assert.deepEqual(r.admin.messageOfAnother, { status: 404, code: 'groddle_ticket_message_missing' });
    assert.deepEqual(r.adminName, { own: 'Austin', login: 'Administrator', loginCase: 'Administrator', empty: 'Administrator', email: 'Administrator' });
  });

  it('a reaction is no news: no email, no activity line, no message, the reports\' status, read marks and lastMessageAt as they were', () => {
    assert.deepEqual(r.after, r.before);
    assert.deepEqual(r.after.counts, { messages: 4, actions: 0, mailSends: 0 });
    assert.equal(r.rows.length, 5);
    assert.deepEqual([...new Set(r.rows.map((x) => x.role))].sort(), ['admin', 'player']);
  });

  it('both threads carry each message\'s reactions: counts and who, "you" for the one asking', () => {
    const [, second] = r.messageIds;
    const p = r.playerThread.body.messages.find((m) => m.id === second).reactions;
    const a = r.adminThread.body.messages.find((m) => m.id === second).reactions;
    assert.deepEqual(p.map((x) => [x.e, x.by.length, x.mine]), [['like', 3, true], ['heart', 1, false]]);
    assert.deepEqual(a.map((x) => [x.e, x.by.length, x.mine]), [['like', 3, true], ['heart', 1, true]]);
    assert.deepEqual(p[0].by.filter((b) => b.you).map((b) => b.name), ['Ada']);
    assert.deepEqual(a[0].by.filter((b) => b.you).map((b) => b.name), ['Zz Staffer']);
    for (const m of r.playerThread.body.messages) assert.ok(Array.isArray(m.reactions));
    assert.deepEqual(r.unknownKeyKeptOut, [{ e: 'tada', by: [{ id: 910, name: 'Ada', you: true }], mine: true }]);
  });
});
