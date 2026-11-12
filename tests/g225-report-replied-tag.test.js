// #225 (Friendly, 2026-11-12): in your Reports list, a report an administrator replied to keeps a
// Has a reply tag after it closes, so it reads apart from one closed with no reply. The site's
// player list (groddle-afternoon-site src/TicketStore.php listFor, find) carries adminReplied per row.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=d44d0493';
import { REPORT_TEXT, matchesReport, showsReplied } from '../public/js/reports.js?v=0985b56d';
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
const t = (id, status, adminReplied) => ({ id, subject: `Report ${id}`, status, lastAuthor: 'player', lastMessageAt: '2026-11-03T08:00:00Z', unread: false, adminReplied });

describe('#225: Has a reply on reports an administrator answered', () => {
  it('showsReplied: any status but Answered (its chip says so), only when the site says an administrator wrote', () => {
    assert.equal(showsReplied(t(1, 'closed', true)), true);
    assert.equal(showsReplied(t(2, 'closed', false)), false);
    assert.equal(showsReplied(t(3, 'open', true)), true, 'you wrote back after the answer');
    assert.equal(showsReplied(t(4, 'working', true)), true);
    assert.equal(showsReplied(t(5, 'answered', true)), false);
    assert.equal(showsReplied({ id: 6, status: 'closed' }), false, 'an older site without the flag: no tag');
    assert.equal(showsReplied(null), false);
    assert.equal(matchesReport(t(1, 'closed', true), 'has a reply'), true, 'the search finds the tag words');
    assert.equal(matchesReport(t(2, 'closed', false), 'reply'), false);
    for (const k of ['replied', 'repliedHint']) assert.doesNotMatch(REPORT_TEXT[k], /[—–]|Glitch/, k);
  });

  it('the list draws the tag on those rows only, and says it to screen readers', async () => {
    const doc = fakeDoc();
    const host = new Node('div', doc);
    const tickets = [t(1, 'closed', true), t(2, 'closed', false), t(3, 'answered', true), t(4, 'open', true)];
    const api = { list: async () => ({ tickets }), unread: async () => ({ unread: 0 }), thread: async () => ({}), reply: async () => ({}), close: async () => ({}), create: async () => ({}) };
    const sheet = mountReportsSheet({ doc, host, api, capture: () => null, now: () => 0 });
    sheet.open('list');
    await wait(20);
    const rows = byData(host, 'reportsList').children;
    const tagged = Object.fromEntries(rows.map((li) => [li.dataset.ticket, li.all().some((n) => 'reportsReplied' in n.dataset)]));
    assert.deepEqual(tagged, { 1: true, 2: false, 3: false, 4: true });
    const row1 = rows.find((li) => li.dataset.ticket === '1');
    const tag = row1.all().find((n) => 'reportsReplied' in n.dataset);
    assert.equal(tag.textContent, REPORT_TEXT.replied);
    assert.equal(tag.getAttribute('title'), REPORT_TEXT.repliedHint);
    assert.match(row1.children[0].getAttribute('aria-label'), /Closed, Has a reply$/);
  });

  it('styled in Modern (the feature\'s sheet CSS) and Classic, with tokens only', () => {
    const modern = readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8');
    const rule = modern.split('\n').find((l) => l.includes('.reports-replied {'));
    assert.ok(rule && rule.startsWith('[data-ui="modern"] #bug-report-panel'));
    assert.doesNotMatch(rule, /#[0-9a-f]{3,6}\b|rgb/i);
    const classic = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
    const crule = classic.split('\n').find((l) => l.includes('.reports-replied {'));
    assert.ok(crule && crule.startsWith(':root[data-ui="classic"] #bug-report-panel'));
    assert.ok(classic.indexOf(crule) > classic.indexOf('/* == TICKETS =='), 'with the other Reports rules');
  });

  it('the site: find and listFor add admin_replied, an administrator\'s message in the thread', { skip: skipWithoutSite }, () => {
    const store = readFileSync(sitePath('src/TicketStore.php'), 'utf8');
    const sql = store.slice(store.indexOf('private function adminRepliedSql('), store.indexOf('public function mine('));
    assert.match(sql, /EXISTS \(SELECT 1 FROM ' \. \$this->db->table\(self::MESSAGES\) \. ' m WHERE m\.ticket_id = ' \. \$this->db->table\(self::TABLE\) \. "\.id AND m\.author_role = 'admin'\)"/);
    const find = store.slice(store.indexOf('public function find('), store.indexOf('private function adminRepliedSql('));
    assert.match(find, /\$this->adminRepliedSql\(\) \. ' AS admin_replied FROM '/);
    const list = store.slice(store.indexOf('public function listFor('), store.indexOf('public function unreadCount('));
    assert.match(list, /\$this->adminRepliedSql\(\) \. ' AS admin_replied FROM '/);
    const summary = store.slice(store.indexOf('public static function summary('), store.indexOf('public static function messagesOut('));
    assert.match(summary, /'adminReplied' => !empty\(\$row\['admin_replied'\]\),/);
    assert.match(readFileSync(sitePath('src/Tickets.php'), 'utf8'), /adminReplied: an administrator wrote in it/);
  });

  it('the site: summary reads the column as a bool (php)', { skip: skipWithoutSite || (!hasPhp && 'no php') || noEngine }, () => {
    const out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/tickets.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    assert.deepEqual(out.adminReplied, { replied: true, none: false, missing: false });
  });
});
