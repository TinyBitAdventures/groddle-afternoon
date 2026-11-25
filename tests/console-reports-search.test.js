/**
 * The console's Reports tab, 2026-11-24 (Austin): a search over every report, a management menu on
 * each report and on the open one, and the team left off the testers boards. The site
 * (groddle-afternoon-site, skipped without it): GET admin/tickets?q= (src/AdminTickets.php index,
 * src/TicketStore.php listAll: parameterised LIKE on the ticket and message tables, paged like the
 * list), console/console.js (the search box, reportMenuFor through the player menu's showMenu),
 * src/Team.php (an administrator's characters, by capability and login), src/ReportCredits.php,
 * src/AdminReportCredits.php and src/ContributeCredits.php (the boards without the team). The routes
 * run on a throwaway MariaDB database (tests/fixtures/console-reports/console-reports.php).
 * Nothing here is visible to players.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HAS_SITE, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const src = (p) => readFileSync(sitePath(p), 'utf8');

describe('the Reports search and menu in the console (console/console.js)', { skip: skipWithoutSite }, async () => {
  const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};

  it('makes a search plain, and asks admin/tickets with it, the status still on', () => {
    assert.equal(mod.REPORT_Q_MAX, 100);
    assert.equal(mod.reportQuery('  pig \n\t floats  '), 'pig floats');
    assert.equal(mod.reportQuery('x'.repeat(150)).length, 100);
    assert.equal(mod.reportQuery(null), '');
    assert.equal(mod.ticketsParams({ status: 'open', q: ' the pig ', offset: 200 }), 'status=open&q=the%20pig&offset=200');
    assert.equal(mod.ticketsParams({ status: 'all', q: '50% & #12' }), 'status=all&q=50%25%20%26%20%2312');
    assert.equal(mod.ticketsParams({ status: 'closed', q: '   ' }), 'status=closed', 'a blank search is no search');
  });

  it('keeps the search in the address like the other deep links: #reports?q=', () => {
    assert.equal(mod.reportsHash('the pig'), '#reports?q=the%20pig');
    assert.equal(mod.reportsHash(''), '#reports');
    assert.equal(mod.reportsHashQuery('#reports?q=the%20pig'), 'the pig');
    assert.equal(mod.reportsHashQuery('#reports?q=a+b'), 'a b');
    assert.equal(mod.reportsHashQuery('#reports'), '');
    assert.equal(mod.reportsHashQuery('#reports?q=%E0%A4%A'), '', 'a broken address is no search');
    assert.equal(mod.reportsHashQuery('#report=12'), null);
    assert.equal(mod.reportsHashQuery('#credits'), null);
  });

  it('marks what matched, letter case aside, and counts the matches', () => {
    assert.deepEqual(mod.highlightParts('The Pig and the pig', 'pig'), [['The ', false], ['Pig', true], [' and the ', false], ['pig', true]]);
    assert.deepEqual(mod.highlightParts('50% (a.b)', '(a.b)'), [['50% ', false], ['(a.b)', true]], 'the search is text, not a pattern');
    assert.deepEqual(mod.highlightParts('Nothing', ''), [['Nothing', false]]);
    assert.deepEqual(mod.highlightParts('pig', 'pig'), [['pig', true]]);
    assert.equal(mod.searchStatus({ q: 'pig', total: 3 }), '3 reports match “pig”.');
    assert.equal(mod.searchStatus({ q: 'pig', total: 1 }), '1 report matches “pig”.');
    assert.equal(mod.searchStatus({ q: 'pig', total: 0, status: 'closed' }), 'No report matches “pig”. Closed only.');
    assert.equal(mod.searchStatus({ q: '' , total: 9 }), '');
    assert.equal(mod.matchLine({ subject: 'Hat gone', match: 'My hat is gone and more' }, 'hat'), '', 'the subject already shows it');
    assert.equal(mod.matchLine({ subject: 'Pig', match: 'on Hechey Track too' }, 'hechey'), 'on Hechey Track too');
    assert.equal(mod.matchLine({ subject: 'Pig' }, 'hechey'), '');
  });

  it('offers each report the actions that fit, with no new routes and nothing that emails', () => {
    const ids = (t, o) => mod.reportMenuFor(t, o).map((m) => m.id);
    const ada = { id: 7, status: 'open', unread: true, player: { id: 910, name: 'Ada' } };
    assert.deepEqual(ids(ada), ['open', 'reply', 'working', 'close', 'credit', 'player', 'copy', 'read']);
    assert.deepEqual(ids({ ...ada, unread: false }, { open: true }), ['reply', 'working', 'close', 'credit', 'player', 'copy'], 'the open report: no Open, read already');
    assert.deepEqual(ids({ ...ada, status: 'working' }), ['open', 'reply', 'unworking', 'close', 'credit', 'player', 'copy', 'read']);
    const closed = mod.reportMenuFor({ ...ada, status: 'closed', unread: false });
    assert.deepEqual(closed.map((m) => m.id), ['open', 'reply', 'working', 'reopen', 'credit', 'player', 'copy']);
    assert.equal(closed.find((m) => m.id === 'working').enabled, false);
    assert.equal(closed.find((m) => m.id === 'working').reason, 'Reopen it first.');
    assert.equal(mod.reportMenuFor(ada).find((m) => m.id === 'player').label, 'Ada: player menu…');
    assert.equal(mod.reportLink(12, 'https://groddle.localhost'), 'https://groddle.localhost/console/reports/12/');
    for (const m of mod.reportMenuFor(ada)) assert.doesNotMatch(m.label, /[—–]/);
    const js = src('console/console.js');
    const pick = js.slice(js.indexOf('function reportPick('), js.indexOf('const head = $(\'[data-console-thread-body] .console-thread-head\');')).replace(/\/\/.*$/gm, '');
    // Only the routes the open report's buttons already use; Reply only opens the box (Send reply emails, with Don't email).
    const routes = [...pick.matchAll(/api\.call\(`([^`]+)`/g)].map((m) => m[1]);
    assert.deepEqual(routes, ['admin/tickets/${t.id}']);
    assert.match(js, /api\.call\(`admin\/tickets\/\$\{t\.id\}\/\$\{path\}`, \{ method: 'POST'/);
    assert.match(pick, /reportStatus\(t, 'working', \{ working: kind === 'working' \}\)/);
    assert.match(pick, /reportStatus\(t, kind\)/);
    assert.doesNotMatch(pick, /\/reply|email/);
  });

  it('reuses the player menu: one showMenu for both, at the pointer or the button, Shift+F10 and the Menu key', () => {
    const js = src('console/console.js');
    assert.equal(js.match(/role: 'menu'/g).length, 1, 'one menu');
    assert.match(js, /function openMenu\(p, opener, at\) \{[\s\S]{0,600}showMenu\(\{ label: `Actions for \$\{p\.name\}`/);
    assert.match(js, /function openReportMenu\(t, opener, at\) \{\s*showMenu\(\{ label: `Actions for report #\$\{t\.id\}`/);
    // The list's rows: the menu button, right-click at the pointer, Shift+F10 or the Menu key.
    const list = js.slice(js.indexOf('function renderTickets()'), js.indexOf('$(\'[data-console-tickets-empty]\').hidden'));
    assert.match(list, /oncontextmenu: \(e\) => \{ e\.preventDefault\(\); openReportMenu\(t, btn, \{ x: e\.clientX, y: e\.clientY \}\); \}/);
    assert.match(list, /\(e\.shiftKey && e\.key === 'F10'\) \|\| e\.key === 'ContextMenu'/);
    assert.match(list, /'aria-haspopup': 'menu', 'aria-label': `Actions for report #\$\{t\.id\}`/);
    // The open report: its ⋯ button, and right-click or Shift+F10 on its head.
    assert.match(js, /more\.addEventListener\('click', \(\) => \{ if \(shown\(\)\) openReportMenu\(shown\(\), more, null\); \}\);/);
    assert.match(js, /head\.addEventListener\('contextmenu'/);
    const page = src('src/AdminConsolePage.php');
    assert.match(page, /<button type="button" class="console-menu-btn" aria-haspopup="menu" aria-label="More for this report" data-console-thread-menu>⋯<\/button>/);
    assert.match(page, /<p class="console-hint">Right-click a report, or use its menu button, Shift\+F10 or the Menu key\.<\/p>/);
  });

  it('the search box: typed with a pause, Enter at once, the count under it, the hash kept', () => {
    const page = src('src/AdminConsolePage.php');
    assert.match(page, /<form class="console-search console-ticket-search" data-console-ticket-search role="search">\s*<label for="console-ticket-q" class="console-sr">Search reports<\/label>\s*<input id="console-ticket-q" name="q" type="search" autocomplete="off" spellcheck="false" placeholder="Words, player or #number" maxlength="100" \/>/);
    assert.match(page, /data-console-ticket-search-status aria-live="polite" hidden/);
    assert.match(page, /#reports\?q=<words> a search/);
    const js = src('console/console.js');
    assert.equal(mod.REPORT_SEARCH_MS, 300);
    assert.match(js, /searchTimer = setTimeout\(\(\) => setSearch\(ticketSearch\.q\.value\), REPORT_SEARCH_MS\);/);
    // Since 2026-11-25 the search is in the Reports address (/console/reports/?q=), changed as it is typed (tests/console-routes.test.js).
    assert.match(js, /if \(hash\) go\(\{ tab: 'reports', q: query \}, \{ push: false \}\);/);
    assert.equal(mod.consoleRoute('/console/reports/', '?q=the%20pig').q, 'the pig');
    assert.match(js, /el\('b', \{\}, \.\.\.marked\(t\.subject \|\| '\(no words\)'\)\)/);
    assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML/, 'marks are elements, words are text');
    assert.match(src('console/console.css'), /\.console-ticketlist mark \{/);
  });

  it('marks an administrator\'s reports Admin in Not scored yet and the scored list', () => {
    const js = src('console/console.js');
    assert.match(js, /t\.player\?\.admin \? el\('span', \{ class: 'console-tag', text: 'Admin', title: COPY\.adminReport \}\)/);
    assert.match(js, /c\.player\?\.admin \? el\('span', \{ class: 'console-tag', text: 'Admin', title: COPY\.adminReport \}\)/);
    assert.equal(mod.COPY.adminReport, 'An administrator\'s report: it can be scored, and never counts on the testers boards.');
  });

  it('the route takes q through the store, plain and parameterised', () => {
    const php = src('src/AdminTickets.php');
    const index = php.slice(php.indexOf('public function index('), php.indexOf('public function show('));
    assert.match(index, /\$q = TicketStore::searchQuery\(\$request->query\('q'\) \?\? ''\);/);
    assert.match(index, /'q' => \$q,/);
    const store = src('src/TicketStore.php');
    const search = store.slice(store.indexOf('private function searchSql('), store.indexOf('/** The longest search'));
    assert.doesNotMatch(search, /\$q\b(?!\))/, 'the words only ever go in as arguments');
    assert.match(search, /'subject LIKE \?'/);
    assert.match(search, /m\.body LIKE \?/);
    assert.match(store, /return '%' \. addcslashes\(\$q, '\\\\%_'\) \. '%';/);
    assert.match(store, /public const SEARCH_MAX = 100;/);
  });
});

// —— The routes on a throwaway database ——
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = spawnSync('php', ['-v']).status === 0;
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
const reachable = db && hasPhp && spawnSync('php', ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!hasPhp && 'no php')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the search and the boards on a throwaway database', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync('php', [join(import.meta.dirname, 'fixtures/console-reports/console-reports.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 120000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_console_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('finds a report by its subject, any message\'s words, the player\'s name or its number, letter case aside', () => {
    const s = r.search;
    const id = r.ids;
    assert.deepEqual(s.subject.ids, [id.ada]);
    assert.deepEqual(s.message.ids, [id.ada], 'a later message');
    assert.match(s.message.matches[id.ada], /Hechey Track/);
    assert.deepEqual(s.caseless.ids, [id.hat]);
    assert.equal(s.player.total, 1 + 205, 'every one of Bea\'s');
    assert.equal(s.player.ids.length, 200, 'a page at a time');
    assert.deepEqual(s.display.ids, [id.cyd], 'no character name: the display name');
    assert.deepEqual(s.hashId.ids, [id.hat]);
    assert.deepEqual(s.bareId.ids, [id.hat]);
    assert.equal(s.hashId.q, `#${id.hat}`);
  });

  it('takes % and _ as themselves, and quotes and backslashes as text', () => {
    const s = r.search;
    assert.deepEqual(s.percent.ids, [r.ids.ada]);
    assert.deepEqual(s.percentOnly.ids, [r.ids.ada], 'not every report');
    assert.deepEqual(s.underscore.ids, [r.ids.milk], 'not every report');
    assert.deepEqual(s.quote.ids, []);
    assert.equal(r.like, '%50\\%\\_a\\\\b%');
    assert.deepEqual(r.searchId, [12, 12, null, null, null]);
  });

  it('keeps the status filter on top, makes the words plain and pages a search like the list', () => {
    const s = r.search;
    assert.deepEqual(s.statusMiss.ids, []);
    assert.deepEqual(s.statusHit.ids, [r.ids.hat]);
    assert.equal(s.spaces.q, 'pig floats');
    assert.deepEqual(s.spaces.ids, [r.ids.ada]);
    assert.equal(s.long.q.length, 100);
    assert.deepEqual([s.page1.ids.length, s.page1.total, s.page1.more], [200, 205, true]);
    assert.deepEqual([s.page2.ids.length, s.page2.total, s.page2.more], [5, 205, false]);
    assert.equal(new Set([...s.page1.ids, ...s.page2.ids]).size, 205, 'no report on both pages');
    assert.deepEqual([s.none.total, s.none.q, s.notText.total], [214, '', 214], 'no search: every report, as before');
    assert.deepEqual(s.subject.counts, s.none.counts, 'the status counts stay every report\'s');
  });

  it('cuts the matching message to a short line around the words', () => {
    assert.match(r.excerpt.middle, /^…word word .*the needle sits here .*tail…$/);
    assert.ok(r.excerpt.middle.length <= 122);
    assert.equal(r.excerpt.start, 'Needle first, then more words.');
    assert.equal(r.excerpt.absent, 'Nothing to find here.');
  });

  it('knows the team by capability: an administrator, and every character of an administrator\'s login', () => {
    assert.deepEqual(r.team, [900, 905]);
    const staff = r.search.teamRows;
    assert.deepEqual(staff.ids, [r.ids.aeghorWaiting, r.ids.aeghor]);
    for (const id of staff.ids) assert.deepEqual(staff.players[id], { id: 900, name: 'Aeghor', admin: true });
    assert.equal(r.search.ednoreRow.players[r.ids.ednore].admin, true, 'an extra character of the login, with a player\'s role');
    assert.equal(r.search.subject.players[r.ids.ada].admin, false);
  });

  it('scores the team\'s reports and keeps them, but leaves them off both boards and the totals that rank', () => {
    assert.deepEqual(r.scored, { ada: 200, bea: 200, aeghor: 200, ednore: 200, review: 200 });
    assert.equal(r.kept, 5);
    const team = r.totals.filter((t) => t.admin).map((t) => t.id);
    assert.deepEqual(team, [900, 905]);
    assert.deepEqual(r.rank, [910, 911], 'Aeghor\'s 5 points would top it');
    assert.deepEqual(r.contribute, [910, 911], 'the Contribute page\'s board');
    assert.deepEqual(r.console.board, [910, 911], 'the console\'s Credits board');
  });

  it('lists the team\'s reports in Not scored yet, marked admin; the review account stays out as before', () => {
    assert.deepEqual(r.console.unscored, [{ id: r.ids.aeghorWaiting, player: 900, admin: true }]);
    const scored = Object.fromEntries(r.console.credits.map((c) => [c.ticket, c.admin]));
    assert.equal(scored[r.ids.aeghor], true);
    assert.equal(scored[r.ids.ednore], true);
    assert.equal(scored[r.ids.hat], false);
  });
});
