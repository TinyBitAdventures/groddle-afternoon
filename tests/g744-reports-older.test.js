/**
 * #744: a player with 234 reports saw 200 in the game's Reports list and thought the older ones were
 * deleted. They were kept; the site's list (groddle-afternoon-site src/TicketStore.php listFor) had
 * LIMIT LIST_MAX (200) with no paging. Austin 2026-11-27: GET groddle/v1/tickets takes an offset
 * (digits only, like admin/tickets) and says whether more exist, the same order on every page; the
 * Reports window (js/ui/reports-sheet.js, js/reports.js) shows Older reports at the end of the list,
 * which loads the next page and adds it. Both looks, phone and computer.
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/g744-reports-older.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { REPORT_TEXT, appendReports, createReportsApi, listPath, sortReports } from '../public/js/reports.js?v=3c805cc4';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=b5216c90';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = 200;

class Node {
  constructor(tag, doc) { Object.assign(this, { tagName: String(tag).toUpperCase(), ownerDocument: doc, children: [], attrs: {}, listeners: {}, dataset: {}, hidden: false, disabled: false, value: '', className: '', _text: '', parentNode: null }); const self = this; this.classList = { toggle(c, on) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); if (on) s.add(c); else s.delete(c); self.className = [...s].join(' '); }, contains: (c) => self.className.split(/\s+/).includes(c) }; }
  setAttribute(k, v) { if (k === 'hidden') { this.hidden = true; return; } if (k === 'class') { this.className = String(v); return; } if (k === 'id') this.id = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  append(...ns) { for (const n of ns) { if (typeof n !== 'string') { n.parentNode = this; this.children.push(n); } } }
  replaceChildren(...ns) { this.children = []; this.append(...ns); }
  get lastElementChild() { return this.children.at(-1) || null; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  dispatch(k, ev = {}) { for (const fn of this.listeners[k] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  closest(sel) { const c = sel.replace(/^\./, ''); for (let n = this; n; n = n.parentNode) if (n.className?.split?.(/\s+/).includes(c)) return n; return null; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  querySelector(sel) {
    const m = /^\[data-ticket="(\d+)"\] (?:\.reports-row-btn|button)$/.exec(sel);
    return m ? this.all().find((n) => n.dataset.ticket === m[1])?.children[0] || null : null;
  }
  querySelectorAll() { return this.all().filter((n) => n.className === 'reports-row-btn'); }
}
function fakeDoc() {
  const doc = { activeElement: null };
  doc.createElement = (t) => new Node(t, doc);
  doc.createTextNode = (t) => Object.assign(new Node('#text', doc), { _text: String(t) });
  return doc;
}
const byData = (r, k) => r.all().find((n) => k in n.dataset);

/** A player's reports as the site orders them (open before closed, the newest news first in each), ids n down to 1. */
function reports(n) {
  const out = [];
  for (let i = n; i >= 1; i--) out.push({ id: i, status: i % 5 === 0 ? 'closed' : 'open', subject: `Report ${i}`, lastAuthor: 'player', lastMessageAt: new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString(), updatedAt: new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString(), unread: false });
  return sortReports(out);
}
/** The site's GET tickets?offset=: PAGE rows from offset and whether more exist; paged: false is a site from before paging. */
function pagedApi(all, { paged = true } = {}) {
  const calls = [];
  return {
    calls,
    list: async (offset = 0) => {
      calls.push(offset);
      if (!paged) return { tickets: all.slice(0, PAGE).map((t) => ({ ...t })), unread: 0 };
      return { tickets: all.slice(offset, offset + PAGE).map((t) => ({ ...t })), unread: 0, more: all.length > offset + PAGE };
    },
    unread: async () => ({ unread: 0 }),
    thread: async (id) => ({ ticket: all.find((t) => t.id === id), messages: [], picture: null, editable: false }),
  };
}

describe('the list in pages (js/reports.js)', () => {
  it('asks GET tickets plain for the first page and with the offset after it', async () => {
    assert.equal(listPath(), 'tickets');
    assert.equal(listPath(0), 'tickets');
    assert.equal(listPath(200), 'tickets?offset=200');
    assert.equal(listPath(-5), 'tickets');
    assert.equal(listPath('x'), 'tickets');
    const urls = [];
    const fetch = async (url) => { urls.push(url); return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ tickets: [], more: false }) }; };
    const api = createReportsApi({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'abcdef1234' });
    await api.list();
    await api.list(200);
    assert.deepEqual(urls.map((u) => u.replace('https://groddle.localhost/wp-json/groddle/v1/', '')), ['tickets', 'tickets?offset=200']);
  });

  it('adds a later page after the rows here, each report once', () => {
    const here = [{ id: 9 }, { id: 8 }];
    assert.deepEqual(appendReports(here, [{ id: 8 }, { id: 7 }, null, { id: 6 }]).map((t) => t.id), [9, 8, 7, 6]);
    assert.deepEqual(here.map((t) => t.id), [9, 8], 'never in place');
    assert.deepEqual(appendReports(null, undefined), []);
  });

  it('names the button and its lines plainly, with no em dashes', () => {
    assert.equal(REPORT_TEXT.older, 'Older reports');
    assert.equal(REPORT_TEXT.metaMore(200), '200 reports so far, more at the end of the list');
    for (const w of [REPORT_TEXT.older, REPORT_TEXT.olderLoading, REPORT_TEXT.olderFailed, REPORT_TEXT.metaMore(200)]) assert.ok(!/[—–]/.test(w), w);
  });
});

describe('Older reports in the Reports window (js/ui/reports-sheet.js)', () => {
  it('234 reports: 200 first, Older reports at the end loads the other 34 after them', async () => {
    const doc = fakeDoc();
    const host = new Node('div', doc);
    const all = reports(234);
    const api = pagedApi(all);
    const states = [];
    const sheet = mountReportsSheet({ doc, host, api, onState: (s) => states.push(s), capture: () => null });
    sheet.open('list');
    await wait(20);
    const list = byData(host, 'reportsList');
    const older = byData(host, 'reportsOlder');
    assert.equal(list.children.length, 200);
    assert.equal(sheet.more, true);
    assert.equal(older.hidden, false, 'shown while the site has more');
    assert.equal(older.textContent, 'Older reports');
    assert.equal(older.tagName, 'BUTTON');
    const panel = older.parentNode;
    assert.equal(panel.children.at(-1), older, 'at the end of the list');
    assert.equal(states.at(-1).last, '200 reports so far, more at the end of the list');
    older.click();
    await wait(20);
    assert.deepEqual(api.calls, [0, 200]);
    assert.equal(list.children.length, 234, 'every report reachable');
    assert.deepEqual(list.children.map((li) => Number(li.dataset.ticket)), all.map((t) => t.id), 'the same order as one long list');
    assert.equal(older.hidden, true, 'no more to load');
    assert.equal(sheet.more, false);
    assert.equal(states.at(-1).last, '234 reports');
    assert.equal(doc.activeElement, list.children[200].children[0], 'the focus goes to the first new row');
    // A refresh (back from a thread, a sent report) asks for as many rows as were loaded.
    await sheet.refresh();
    assert.deepEqual(api.calls, [0, 200, 0, 200]);
    assert.equal(list.children.length, 234, 'the older ones stay');
  });

  it('a third page: the button stays until the last one, in any tab', async () => {
    const doc = fakeDoc();
    const host = new Node('div', doc);
    const api = pagedApi(reports(450));
    const sheet = mountReportsSheet({ doc, host, api, capture: () => null });
    sheet.open('list');
    await wait(20);
    byData(host, 'reportsTabs').children.find((b) => b.dataset.reportsTab === 'closed').click();
    const older = byData(host, 'reportsOlder');
    assert.equal(older.hidden, false, 'older reports can be in any tab');
    await sheet.loadOlder();
    assert.equal(older.hidden, false);
    await sheet.loadOlder();
    assert.deepEqual(api.calls, [0, 200, 400]);
    assert.equal(older.hidden, true);
    assert.equal(byData(host, 'reportsList').children.length, 90, 'every closed one of 450');
  });

  it('a site from before paging (no more) shows no button; a failed page says so and keeps the button', async () => {
    const doc = fakeDoc();
    const host = new Node('div', doc);
    const sheet = mountReportsSheet({ doc, host, api: pagedApi(reports(234), { paged: false }), capture: () => null });
    sheet.open('list');
    await wait(20);
    assert.equal(byData(host, 'reportsOlder').hidden, true);

    const doc2 = fakeDoc();
    const host2 = new Node('div', doc2);
    const api = pagedApi(reports(234));
    const first = api.list;
    api.list = async (offset = 0) => { if (offset) throw Object.assign(new Error('offline'), { status: 0, code: 'offline', data: {} }); return first(offset); };
    const states = [];
    const sheet2 = mountReportsSheet({ doc: doc2, host: host2, api, onState: (s) => states.push(s), capture: () => null });
    sheet2.open('list');
    await wait(20);
    await sheet2.loadOlder();
    const older = byData(host2, 'reportsOlder');
    assert.equal(older.hidden, false);
    assert.equal(older.disabled, false);
    assert.equal(byData(host2, 'reportsList').children.length, 200);
    assert.equal(states.at(-1).last, 'Your older reports did not load. Try again in a moment.');
  });
});

describe('Older reports looks right in both skins (css)', () => {
  it('Modern and Classic centre it after the list, a finger\'s height on a phone', () => {
    const modern = read('public/js/features/bug-report-feature.js').match(/const STYLE = `([\s\S]*?)`;/)[1];
    assert.match(modern, /\[data-ui="modern"\] #bug-report-panel \.reports-older \{ align-self: center;/);
    assert.match(modern, /@media \(max-width: 600px\), \(pointer: coarse\) \{ \[data-ui="modern"\] #bug-report-panel \.reports-older \{ min-height: 40px; \} \}/);
    const classic = read('public/css/classic.css');
    assert.match(classic, /:root\[data-ui="classic"\] #bug-report-panel \.reports-older \{ display: block; margin: [^}]*auto/);
    assert.match(classic, /@media \(max-width: 600px\), \(pointer: coarse\) \{ :root\[data-ui="classic"\] #bug-report-panel \.reports-older \{ min-height: 40px; \} \}/);
  });
});

// —— The site: GET tickets?offset= ——
describe('the player\'s list pages on the site (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (p) => readFileSync(sitePath(p), 'utf8');

  it('TicketStore::listFor pages by offset in the same order and says whether more exist', () => {
    const store = src('src/TicketStore.php');
    const fn = store.slice(store.indexOf('public function listFor('), store.indexOf('public function unreadCount('));
    assert.match(fn, /public function listFor\(int \$player, int \$offset = 0\): array/);
    assert.match(fn, /\$offset = max\(0, \$offset\);/);
    assert.match(fn, /ORDER BY player_unread DESC, FIELD\(status, 'answered', 'open', 'working', 'closed'\), updated_at DESC, id DESC LIMIT " \. \(self::LIST_MAX \+ 1\) \. ' OFFSET ' \. \$offset, \[\$player\]\);/);
    assert.match(fn, /return \['rows' => array_slice\(\$rows, 0, self::LIST_MAX\), 'more' => count\(\$rows\) > self::LIST_MAX\];/);
  });

  it('GET tickets takes a digits-only offset, like admin/tickets, and gives more', () => {
    const php = src('src/Tickets.php');
    const index = php.slice(php.indexOf('public function index('), php.indexOf('public function unread('));
    assert.match(index, /\$offset = \(string\) \(\$request->query\('offset'\) \?\? '0'\);\s*if \(!ctype_digit\(\$offset\) \|\| strlen\(\$offset\) > 9\) \{\s*throw new RestError\('groddle_ticket_offset', '[^']+', 400\);/);
    assert.match(index, /\$store->listFor\(\$me->id, \(int\) \$offset\)/);
    assert.match(index, /'more' => \$page\['more'\]/);
    assert.match(php, /GET {2}tickets\?offset=n {8}\{"tickets":\[Summary\],"unread":n,"more":bool\}/);
  });
});

const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
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
const reachable = db && HAS_PHP && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('GET tickets?offset= on a throwaway database (206 reports)', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [join(root, 'tests/fixtures/console-reports/console-reports.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 120000 }).toString());
  });

  it('ran and dropped its database', () => {
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true);
  });

  it('every report in two pages, the order of one long list, more on the first only', () => {
    const p = r.player;
    assert.equal(p.order.length, 206);
    assert.equal(p.first.ids.length, 200);
    assert.equal(p.first.more, true);
    assert.deepEqual(p.zero, p.first, 'offset 0 is the first page');
    assert.equal(p.second.ids.length, 6);
    assert.equal(p.second.more, false);
    assert.deepEqual([...p.first.ids, ...p.second.ids], p.order);
    assert.deepEqual(p.first.ids.slice(0, 2).sort(), p.unreadIds.slice().sort(), 'unread first, as before');
    assert.equal(p.order.at(-1), p.closedId, 'closed last');
    assert.deepEqual(p.past, { ids: [], more: false, unread: 2 });
    assert.equal(p.first.unread, 2);
    assert.equal(p.second.unread, 2, 'every report\'s unread, not the page\'s');
    assert.deepEqual(p.ada.ids.sort(), [r.ids.ada, r.ids.hat].sort(), 'only your own');
    assert.equal(p.ada.more, false);
  });

  it('refuses an offset that is not digits, before the store is asked', () => {
    for (const [k, a] of Object.entries(r.player.bad)) assert.deepEqual(a, { status: 400, code: 'groddle_ticket_offset' }, k);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

/** In Chrome: the real feature's window with 234 reports, Modern and Classic, a phone and a computer. */
describe('Older reports in Chrome (both skins, phone and computer)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'g744 reports older test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  const page = (skin, w, h) => `<!doctype html><html data-ui="${skin}"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/style.css">${skin === 'classic' ? '<link rel="stylesheet" href="/css/classic.css">' : ''}
<style>body{margin:0}.top-actions{position:absolute;top:0;right:0;height:0;overflow:hidden}#wrap>#game-root{position:relative;flex:none;width:${w}px;height:${h}px;overflow:hidden;background:#7a9}</style></head>
<body><div id="wrap"><div class="top-actions"></div><div id="game-root"></div></div></body></html>`;

  async function run(skin, phone) {
    const [w, h] = phone ? [402, 812] : [1000, 700];
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { hasTouch: true, isMobile: true, deviceScaleFactor: 3 } : {}) });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(String(e)));
    await tab.goto(`${base}/style.css`);
    await tab.setContent(page(skin, w, h), { waitUntil: 'load' });
    await tab.evaluate(async () => {
      const all = [];
      for (let i = 234; i >= 1; i--) {
        const at = new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString();
        all.push({ id: i, status: i % 5 === 0 ? 'closed' : 'open', subject: `Report ${i}`, createdAt: at, updatedAt: at, lastMessageAt: at, lastAuthor: 'player', unread: false, adminReplied: false });
      }
      // The site's order: open before closed, the newest news first in each.
      all.sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || b.id - a.id);
      window.asked = [];
      const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      window.fetch = async (url) => {
        const u = new URL(String(url), location.href);
        if (!u.pathname.endsWith('/tickets')) return u.pathname.endsWith('/tickets/unread') ? json({ unread: 0 }) : new Response('abcdef1234');
        const offset = Number(u.searchParams.get('offset') || 0);
        window.asked.push(offset);
        return json({ tickets: all.slice(offset, offset + 200), unread: 0, more: all.length > offset + 200 });
      };
      const engine = { mode: 'multiplayer', started: true, setData: () => {}, toast: () => {}, player: { x: 0, y: 0 } };
      const { bugReportFeature } = await import('/js/features/bug-report-feature.js');
      bugReportFeature.onTick(0, 0, engine);
      window.groddleBugReport.open('list');
      for (let i = 0; i < 100 && document.querySelectorAll('#bug-report-panel .reports-row').length < 200; i++) await new Promise((r) => setTimeout(r, 20));
    });
    const sel = '#bug-report-panel [data-reports-older]';
    await tab.locator(sel).scrollIntoViewIfNeeded();
    const look = () => tab.evaluate((s) => {
      const b = document.querySelector(s);
      const r = b.getBoundingClientRect();
      const card = document.querySelector('#bug-report-panel .reports-card').getBoundingClientRect();
      const list = document.querySelector('#bug-report-panel [data-reports-list]').getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { shown: !b.hidden && r.height > 0, h: r.height, w: r.width, inCard: r.left >= card.left && r.right <= card.right && r.top >= card.top && r.bottom <= card.bottom, below: r.top >= list.bottom - 1, centred: Math.abs((r.left + r.right) / 2 - (list.left + list.right) / 2) < 4, onTop: b.contains(top), text: b.textContent, pageWide: document.documentElement.scrollWidth <= innerWidth };
    }, sel);
    const out = { before: await look() };
    const shots = process.env.REPORT_OLDER_SHOTS || '';
    if (shots) await tab.screenshot({ path: join(shots, `g744-older-${skin}-${phone ? 'phone' : 'computer'}.png`) });
    await (phone ? tab.locator(sel).tap() : tab.locator(sel).click());
    await tab.waitForFunction(() => document.querySelectorAll('#bug-report-panel .reports-row').length === 234, null, { timeout: 5000 });
    out.after = await tab.evaluate(() => ({ rows: document.querySelectorAll('#bug-report-panel .reports-row').length, last: document.querySelector('#bug-report-panel .reports-row:last-child')?.dataset.ticket, hidden: document.querySelector('#bug-report-panel [data-reports-older]').hidden, focus: document.activeElement?.closest?.('.reports-row')?.dataset?.ticket || '', asked: window.asked }));
    out.errors = errors;
    await ctx.close();
    return out;
  }

  for (const skin of ['modern', 'classic']) {
    for (const phone of [false, true]) {
      it(`${skin} on a ${phone ? 'phone (402x812)' : 'computer'}: Older reports after the list, then all 234`, async () => {
        const out = await run(skin, phone);
        assert.deepEqual(out.errors, []);
        const b = out.before;
        assert.equal(b.shown, true);
        assert.equal(b.text, 'Older reports');
        assert.ok(b.inCard && b.onTop && b.below && b.centred && b.pageWide, JSON.stringify(b));
        if (phone) assert.ok(b.h >= 40, `a finger's height: ${b.h}`);
        // The 201st in the site's order (the 13th closed one, 170) has the focus; the last is the oldest closed (5).
        assert.deepEqual(out.after, { rows: 234, last: '5', hidden: true, focus: '170', asked: [0, 200] });
      });
    }
  }
});
