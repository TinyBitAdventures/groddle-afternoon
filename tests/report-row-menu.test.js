// REPORTSMENU (Austin 2026-11-12: "we should add a right click context menu on these for quicker
// close/management actions"): each row of the Reports list opens the shared context menu
// (js/ui/report-row-menu.js on js/ui/context-menu.js): right-click, a long press, Shift+F10 or the
// Menu key; Open, Add a message (Reopen when closed), Close report, Mark as read or unread, Copy
// link. The site's player routes (groddle-afternoon-site src/Tickets.php) gain POST tickets/{id}/unread.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPORT_MENU_TEXT, reportLink, reportMenuRows } from '../public/js/ui/report-row-menu.js?v=bad71076';
import { createReportsApi, reportFromHash } from '../public/js/reports.js?v=fa6c662a';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const ids = (t) => reportMenuRows(t).map((r) => r.id);

describe('REPORTSMENU: the rows a report\'s menu shows', () => {
  it('only what a player may do with their report, by its status and read mark', () => {
    assert.deepEqual(ids({ status: 'open', lastAuthor: 'player', unread: false }), ['open', 'reply', 'close', 'copy']);
    assert.deepEqual(ids({ status: 'answered', lastAuthor: 'admin', unread: true }), ['open', 'reply', 'close', 'read', 'copy']);
    assert.deepEqual(ids({ status: 'answered', lastAuthor: 'admin', unread: false }), ['open', 'reply', 'close', 'unread', 'copy']);
    assert.deepEqual(ids({ status: 'working', lastAuthor: 'player', unread: false }), ['open', 'reply', 'close', 'copy']);
    // Closed: Reopen (at the reply box: a message is how a player opens it again), never Close.
    assert.deepEqual(ids({ status: 'closed', lastAuthor: 'admin', unread: false }), ['open', 'reopen', 'unread', 'copy']);
    assert.deepEqual(ids({ status: 'closed', lastAuthor: 'player', unread: false }), ['open', 'reopen', 'copy']);
    // Open, Add a message and Reopen hand focus to the thread they open.
    for (const r of reportMenuRows({ status: 'closed', lastAuthor: 'admin' })) assert.equal(r.focusBack === false, ['open', 'reopen'].includes(r.id), r.id);
    for (const [k, v] of Object.entries(REPORT_MENU_TEXT)) {
      const s = typeof v === 'function' ? v('https://x/#report=1') : v;
      assert.doesNotMatch(s, /[—–]|Glitch/, k);
    }
  });

  it('Copy link is the page\'s address with #report=<id>, the hash the game opens', () => {
    const loc = { origin: 'https://groddle.example', pathname: '/play/online/', search: '?x=1', hash: '#report=4' };
    const url = reportLink(42, loc);
    assert.equal(url, 'https://groddle.example/play/online/#report=42');
    assert.equal(reportFromHash(new URL(url).hash), 42);
    assert.equal(reportLink(0, loc), '');
    assert.equal(reportLink('x', loc), '');
  });

  it('the call: POST tickets/{id}/unread', async () => {
    const seen = [];
    const fetch = async (url, init) => { seen.push([String(url), init.method]); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ticket: { id: 7 }, unread: 1 }) }; };
    const r = await createReportsApi({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'abcdef1234' }).markUnread(7);
    assert.equal(r.unread, 1);
    assert.match(seen[0][0], /groddle\/v1\/tickets\/7\/unread$/);
    assert.equal(seen[0][1], 'POST');
  });

  it('the wiring: the sheet binds the menu on its list, the feature passes its QA data and follows the hash', () => {
    const sheet = read('public/js/ui/reports-sheet.js');
    assert.match(sheet, /const rowMenu = bindReportRowMenu\(\{\n    doc,\n    host: panel,\n    list,/);
    assert.match(sheet, /'aria-haspopup': 'menu', 'aria-keyshortcuts': 'Shift\+F10'/);
    const feature = read('public/js/features/bug-report-feature.js');
    assert.match(feature, /setData: \(k, v\) => engine\.setData\?\.\(k, v\),/);
    assert.match(feature, /globalThis\.addEventListener\?\.\('hashchange', openLinked\);/);
    const mod = read('public/js/ui/report-row-menu.js');
    // The shared menu, inside the Reports window, focus back to the row whichever way it opened.
    assert.match(mod, /createContextMenu\(\{ doc, host, id: 'report-row-menu'/);
    assert.match(mod, /keys: true,\n      opener: btn,\n      findOpener: \(\) => rowFor\(id\),/);
    assert.match(mod, /longPress: true,/);
  });

  it('the site: the unread route reads the report through mine() and touches only the player\'s mark', { skip: skipWithoutSite }, () => {
    const php = readFileSync(sitePath('src/Tickets.php'), 'utf8');
    const route = php.slice(php.indexOf("'/groddle/v1/tickets/{id:\\d+}/unread'"), php.indexOf('private function thread('));
    assert.match(route, /policy: new Policy\(Access::SignedIn\)\)\]\s*public function markUnread\(Request \$request, string \$id\): Response/);
    assert.match(route, /\$row = \$this->mine\(\$me, \(int\) \$id\);/);
    assert.match(route, /\$store->markUnreadForPlayer\(\(int\) \$row\['id'\]\);/);
    const store = readFileSync(sitePath('src/TicketStore.php'), 'utf8');
    const fn = store.slice(store.indexOf('public function markUnreadForPlayer('), store.indexOf('// —— Reading ——'));
    assert.match(fn, /SET player_read_at = DATE_SUB\(last_message_at, INTERVAL 1 SECOND\) WHERE id = \? AND last_author_role = 'admin'"/);
    assert.doesNotMatch(fn, /admin_read_at/, 'Edit until read rests on the administrators\' mark');
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

/**
 * In Chrome, both skins: the game's stylesheets, the real Reports feature (its sheet, CSS and
 * menu) on a fake engine, the site's routes answered by a stub. Screenshots go to
 * REPORT_MENU_SHOTS=<dir> when set.
 */
describe('REPORTSMENU in Chrome (both skins)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'report-row-menu test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  const page = (skin) => `<!doctype html><html data-ui="${skin}"><head>
<link rel="stylesheet" href="/style.css">${skin === 'classic' ? '<link rel="stylesheet" href="/css/classic.css">' : ''}
<style>body{margin:0}#game-root{position:relative;width:1000px;height:700px;overflow:hidden;background:#7a9}</style></head>
<body><div id="wrap"><div class="top-actions"></div><div id="game-root"></div></div></body></html>`;

  async function run(skin) {
    const shots = process.env.REPORT_MENU_SHOTS || '';
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 1000, height: 700 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(String(e)));
    await tab.goto(`${base}/style.css`);
    await tab.setContent(page(skin), { waitUntil: 'load' });
    await tab.evaluate(async () => {
      const at = '2026-11-12T08:00:00Z';
      const tickets = [
        { id: 11, status: 'answered', subject: 'Sample with an attachement', createdAt: at, updatedAt: at, lastMessageAt: at, lastAuthor: 'admin', unread: true, adminReplied: true },
        { id: 12, status: 'open', subject: 'The pig froze', createdAt: at, updatedAt: at, lastMessageAt: at, lastAuthor: 'player', unread: false, adminReplied: false },
        { id: 13, status: 'closed', subject: 'Testing', createdAt: at, updatedAt: at, lastMessageAt: at, lastAuthor: 'admin', unread: false, adminReplied: true },
      ];
      window.calls = [];
      const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const thread = (t) => ({ ticket: t, messages: [{ id: 1, author: 'player', body: 'Words', at, edited: null }, { id: 2, author: 'admin', body: 'Thanks', at, edited: null }], picture: null, editable: false });
      window.fetch = async (url, init = {}) => {
        const u = String(url);
        const m = /tickets(?:\/(\d+))?(?:\/(\w+))?$/.exec(u);
        if (!m) return new Response('abcdef1234');
        const method = init.method || 'GET';
        window.calls.push(`${method} ${m[0]}`);
        const t = tickets.find((x) => x.id === Number(m[1]));
        if (!m[1] && m[2] === undefined) return json({ tickets, unread: tickets.filter((x) => x.unread).length });
        if (m[0] === 'tickets/unread') return json({ unread: tickets.filter((x) => x.unread).length });
        if (method === 'GET') { t.unread = false; return json(thread(t)); }
        if (m[2] === 'close') { t.status = 'closed'; return json(thread(t)); }
        if (m[2] === 'unread') { if (t.lastAuthor === 'admin') t.unread = true; return json({ ticket: t, unread: tickets.filter((x) => x.unread).length }); }
        return json({});
      };
      const data = {};
      window.qaData = data;
      const engine = { mode: 'multiplayer', started: true, setData: (k, v) => { data[k] = v; }, toast: () => {}, player: { x: 0, y: 0 } };
      const { bugReportFeature } = await import('/js/features/bug-report-feature.js');
      bugReportFeature.onTick(0, 0, engine);
      window.groddleBugReport.open('list');
      for (let i = 0; i < 50 && document.querySelectorAll('#bug-report-panel .reports-row').length < 3; i++) await new Promise((r) => setTimeout(r, 20));
    });
    const settle = () => tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40)))));
    const rowSel = (id) => `#bug-report-panel [data-ticket="${id}"] .reports-row-btn`;
    const menuState = () => tab.evaluate(() => {
      const m = document.getElementById('report-row-menu');
      if (!m || m.hidden) return { open: false, owner: window.qaData.contextMenu || '' };
      const b = m.getBoundingClientRect();
      const p = document.querySelector('#bug-report-panel .reports-card').getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {
        open: true,
        owner: window.qaData.contextMenu,
        reportMenu: window.qaData.reportMenu,
        rows: [...m.querySelectorAll('.vm-row')].map((r) => r.dataset.reportRow),
        labels: [...m.querySelectorAll('.vm-row .vm-label')].map((r) => r.textContent),
        title: m.querySelector('.ctx-title')?.textContent,
        onTop: m.contains(top),
        inPanel: m.parentElement?.id === 'bug-report-panel',
        inside: b.left >= 0 && b.top >= 0 && b.right <= 1000 && b.bottom <= 700,
        bg: getComputedStyle(m).backgroundColor,
        width: b.width,
        focused: document.activeElement?.dataset?.reportRow || '',
        cardTop: p.top,
      };
    });
    const focusedTicket = () => tab.evaluate(() => document.activeElement?.closest?.('.reports-row')?.dataset?.ticket || document.activeElement?.id || document.activeElement?.tagName);
    const out = {};

    // Right-click on a row: the menu at the pointer, over the window, the report's rows.
    const box = await tab.locator(rowSel(11)).boundingBox();
    await tab.mouse.click(box.x + 60, box.y + 12, { button: 'right' });
    await settle();
    out.right = await menuState();
    if (shots) await tab.screenshot({ path: join(shots, `report-row-menu-${skin}-right-click.png`) });
    // Esc closes only the menu; focus goes back to the row (the window keeps the keys).
    await tab.keyboard.press('Escape');
    await settle();
    out.afterEsc = { menu: (await menuState()).open, sheet: await tab.evaluate(() => window.groddleBugReport.state), focus: await focusedTicket() };

    // Keys: Shift+F10 on a focused row, Down, Enter on Close report.
    await tab.focus(rowSel(12));
    await tab.keyboard.press('Shift+F10');
    await settle();
    out.keys = await menuState();
    if (shots) await tab.screenshot({ path: join(shots, `report-row-menu-${skin}-keys.png`) });
    await tab.keyboard.press('ArrowDown');
    out.keysDown = (await menuState()).focused;
    await tab.keyboard.press('ArrowDown');
    await tab.keyboard.press('Enter');
    await settle();
    out.closed = await tab.evaluate(() => ({ chip: document.querySelector('#bug-report-panel [data-ticket="12"] .reports-chip')?.dataset.status, calls: window.calls.filter((c) => c.startsWith('POST')), status: document.querySelector('[data-bug-report-status]').textContent }));
    out.closedFocus = await focusedTicket();

    // Arrows move between rows in the list.
    await tab.focus(rowSel(11));
    await tab.keyboard.press('ArrowDown');
    out.listDown = await focusedTicket();

    // Mark as read (11 has an unread reply), then Mark as unread on it again.
    await tab.focus(rowSel(11));
    await tab.keyboard.press('ContextMenu');
    await settle();
    out.readRows = (await menuState()).rows;
    await tab.click('#report-row-menu [data-report-row="read"]');
    await settle();
    out.read = await tab.evaluate(() => ({ unread: document.querySelector('#bug-report-panel [data-ticket="11"]').dataset.unread || '', badge: window.qaData.reportsUnread, view: window.groddleBugReport.view }));
    await tab.click(rowSel(11), { button: 'right' });
    await settle();
    await tab.click('#report-row-menu [data-report-row="unread"]');
    await settle();
    out.unread = await tab.evaluate(() => ({ unread: document.querySelector('#bug-report-panel [data-ticket="11"]').dataset.unread || '', badge: window.qaData.reportsUnread, last: window.calls.at(-1) }));

    // Copy link.
    await tab.click(rowSel(13), { button: 'right' });
    await settle();
    out.closedRows = await menuState();
    await tab.click('#report-row-menu [data-report-row="copy"]');
    await settle();
    out.copied = await tab.evaluate(() => navigator.clipboard.readText());

    // Long press on touch opens it too.
    await tab.evaluate(async () => {
      const b = document.querySelector('#bug-report-panel [data-ticket="13"] .reports-row-btn');
      const r = b.getBoundingClientRect();
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: r.left + 20, clientY: r.top + 10 }));
      await new Promise((res) => setTimeout(res, 650));
    });
    out.longPress = (await menuState()).owner;

    // Reopen: the closed report at its reply box, with the line that says how.
    await tab.click('#report-row-menu [data-report-row="reopen"]');
    for (let i = 0; i < 20 && (await tab.evaluate(() => document.activeElement?.id)) !== 'reports-reply-text'; i++) await settle();
    out.reopen = await tab.evaluate(() => ({ view: window.groddleBugReport.view, focus: document.activeElement?.id, status: document.querySelector('[data-bug-report-status]').textContent, menu: window.qaData.contextMenu }));
    await ctx.close();
    out.errors = errors;
    return out;
  }

  for (const skin of ['modern', 'classic']) {
    it(`${skin}: right-click, keys, long press, and each action`, { timeout: 120_000 }, async () => {
      const r = await run(skin);
      assert.deepEqual(r.errors, []);
      assert.equal(r.right.open, true);
      assert.equal(r.right.owner, 'report:11');
      assert.equal(r.right.reportMenu, '11');
      assert.equal(r.right.title, 'Sample with an attachement');
      assert.deepEqual(r.right.rows, ['open', 'reply', 'close', 'read', 'copy']);
      assert.deepEqual(r.right.labels, ['Open', 'Add a message', 'Close report', 'Mark as read', 'Copy link']);
      assert.ok(r.right.inPanel && r.right.onTop && r.right.inside, 'inside the Reports window, on top, in sight');
      assert.notEqual(r.right.bg, 'rgba(0, 0, 0, 0)', 'the skin draws its card');
      assert.deepEqual(r.afterEsc, { menu: false, sheet: 'open', focus: '11' });
      assert.equal(r.keys.owner, 'report:12');
      assert.equal(r.keys.focused, 'open', 'the keys start on the first row');
      assert.equal(r.keysDown, 'reply');
      assert.equal(r.closed.chip, 'closed');
      assert.deepEqual(r.closed.calls, ['POST tickets/12/close']);
      assert.equal(r.closed.status, 'Report closed.');
      assert.equal(r.closedFocus, '12', 'focus stays on the row through the redraw');
      assert.equal(r.listDown, '12');
      assert.deepEqual(r.readRows, ['open', 'reply', 'close', 'read', 'copy']);
      assert.deepEqual(r.read, { unread: '', badge: '0', view: 'list' });
      assert.deepEqual(r.unread, { unread: '1', badge: '1', last: 'POST tickets/11/unread' });
      assert.deepEqual(r.closedRows.rows, ['open', 'reopen', 'unread', 'copy']);
      assert.match(r.copied, /^http:\/\/127\.0\.0\.1:\d+\/style\.css#report=13$/);
      assert.equal(r.longPress, 'report:13');
      assert.deepEqual(r.reopen, { view: 'thread', focus: 'reports-reply-text', status: REPORT_MENU_TEXT.reopenHint, menu: '' });
    });
  }
});
