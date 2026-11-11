/**
 * The console's Analytics tab (Austin 2026-11-11: "players over time, active players per day, pageviews and even
 * quirky things like trees harvested, mines mined, piggies nibbled, butterflies milked ... Lightweight, keep all
 * history"). Three repos meet here:
 *
 * - The game's public/site/theme.js sends one pageview beacon a page load (POST /wp-json/groddle/v1/hit, the path
 *   only), never from an administrator's browser, an automated one, the console or Minn Admin.
 * - The realtime server (groddle-afternoon-server tally.go) counts the world's acts that land, a number a UTC day
 *   for everyone together, and rides them on its play-time batches ("counts").
 * - The site (groddle-afternoon-site src/Analytics.php, PlayTime.php, AdminConsole.php admin/analytics, the
 *   console's Analytics tab) keeps daily counts forever and draws them.
 *
 * The PHP runs through the php CLI.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { SITE_DIR, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || (!hasPhp && 'needs the php CLI');

function php(op, args) {
  const code = `
    foreach (['PlayTime', 'Analytics'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{PlayTime, Analytics};
    $in = json_decode(stream_get_contents(STDIN), true);
    $a = $in['args'];
    $out = match ($in['op']) {
      'section' => array_map(fn ($p) => Analytics::section($p), $a),
      'bot' => array_map(fn ($u) => Analytics::isBot($u), $a),
      'qa' => array_map(fn ($p) => Analytics::isQa($p[0], $p[1]), $a),
      'counts' => PlayTime::counts($a[0], $a[1]),
      'peaks' => Analytics::peaksOf($a[0], $a[1], $a[2]),
      'shape' => Analytics::shape(...$a),
      'unit' => [Analytics::unit($a[0], $a[1]), Analytics::bucketOf($a[2], 'week'), Analytics::bucketOf($a[2], 'month')],
      'consts' => ['key' => PlayTime::TALLY_KEY, 'counters' => Analytics::COUNTERS, 'caps' => [Analytics::HIT_BYTES, Analytics::PAGEVIEWS_DAY_MAX, Analytics::SECTIONS_DAY_MAX]],
    };
    echo json_encode($out);`;
  return JSON.parse(String(execFileSync('php', ['-r', code], { input: JSON.stringify({ op, args }) })));
}

/** Runs public/site/theme.js with a stub page; returns the beacons it sent. */
function runTheme({ stored = {}, path = '/encyclopedia/items/apple/', webdriver = false, beacon = true, prerendering = false } = {}) {
  const sent = [];
  const listeners = {};
  const noop = () => {};
  const document = {
    readyState: 'complete', prerendering,
    documentElement: { setAttribute: noop, removeAttribute: noop },
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null,
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const navigator = { webdriver, ...(beacon ? { sendBeacon: (url, body) => { sent.push({ url, body }); return true; } } : {}) };
  const store = new Map(Object.entries(stored));
  const context = {
    document, navigator,
    location: { pathname: path, search: '?q=secret', hash: '#x' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    addEventListener: noop, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ admin: false }) }),
  };
  context.window = context;
  vm.runInNewContext(read('public/site/theme.js'), context);
  return { sent, listeners };
}

describe('the pageview beacon (site/theme.js)', () => {
  it('sends the path and nothing else, once, as a beacon', () => {
    const { sent } = runTheme();
    assert.deepEqual(sent, [{ url: '/wp-json/groddle/v1/hit', body: JSON.stringify({ p: '/encyclopedia/items/apple/' }) }], 'no query, no hash, no id');
  });

  it('stays quiet for an administrator\'s browser, an automated one, the console and Minn Admin, and without beacons', () => {
    assert.equal(runTheme({ stored: { 'groddle-console': '1' } }).sent.length, 0);
    assert.equal(runTheme({ webdriver: true }).sent.length, 0);
    assert.equal(runTheme({ path: '/console/' }).sent.length, 0);
    assert.equal(runTheme({ path: '/minn-admin/content' }).sent.length, 0);
    assert.equal(runTheme({ beacon: false }).sent.length, 0);
  });

  it('a prerendered page counts when it is shown', () => {
    const { sent, listeners } = runTheme({ prerendering: true });
    assert.equal(sent.length, 0);
    listeners.prerenderingchange();
    assert.equal(sent.length, 1);
  });
});

describe('the site counts pageviews by section, never a person (Analytics::section, isBot)', { skip }, () => {
  it('cuts a path to its section', () => {
    assert.deepEqual(php('section', ['/', '/index.html', '/encyclopedia/items/apple/', '/encyclopedia/', '/Players/123/', '/changelog/a-note/?x=1#y', '/chat/', '/wp-login.php', '/console/', '/minn-admin/x', '/play/online/', '/%E2%9C%93/']),
      ['home', 'home', 'encyclopedia/items', 'encyclopedia', 'players', 'changelog', 'chat', null, null, null, null, 'other']);
  });

  it('a crawler or a script counts nothing; a browser does', () => {
    assert.deepEqual(php('bot', ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'curl/8.4', 'python-requests/2', '', null, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15']),
      [true, true, true, true, true, false]);
  });

  it('caps a beacon and a day', () => {
    const [bytes, day, sections] = php('consts', []).caps;
    assert.ok(bytes <= 1024 && day >= 10000 && sections <= 100);
  });

  it('a test script\'s account is not a player', () => {
    assert.deepEqual(php('qa', [['zz-a1@groddle.localhost', 'Ada'], ['ada@example.com', 'Zz Smoke A1'], ['ada@example.com', 'zzchatfix'], ['ada@example.com', 'Ada']]), [true, true, true, false]);
  });
});

describe('the world\'s tallies ride the play-time batches (PlayTime::counts, the server\'s tally.go)', { skip }, () => {
  const now = Date.UTC(2026, 10, 11, 12) / 1000;
  it('takes days and keys of the server\'s shape, whole counts from 1', () => {
    const got = php('counts', [{ '2026-11-11': { 'pig:nibble': 3, 'Bad Key': 1, 'rock:mine': 0, 'quoin:xp': '2', 'tree:harvest': 1.5 }, '2026-02-30': { 'a:b': 1 }, '2025-01-01': { 'a:b': 1 }, '2026-11-13': { 'a:b': 1 }, x: 1 }, now]);
    assert.deepEqual(got, { '2026-11-11': { 'pig:nibble': 3 } });
    assert.deepEqual(php('counts', [null, now]), []);
  });

  it('the server and the site agree on a key\'s shape', { skip: skipWithoutServer }, () => {
    const go = readFileSync(serverPath('tally.go'), 'utf8');
    const goRe = /tallyKeyRe = regexp\.MustCompile\(`([^`]+)`\)/.exec(go)?.[1];
    assert.equal(`/${goRe}/`, php('consts', []).key);
    // Every counter the tab shows names keys the server sends.
    for (const c of php('consts', []).counters) {
      for (const k of c.keys) assert.match(k.replace(/:\*$/, ':x'), new RegExp(goRe), `${c.label}: ${k}`);
    }
    for (const hook of ['objects.go', 'gardens.go', 'quoins.go']) assert.match(readFileSync(serverPath(hook), 'utf8'), /tallyLocked\(/, hook);
    assert.match(readFileSync(serverPath('playtime.go'), 'utf8'), /Counts\s+playCounts\s+`json:"counts,omitempty"`/);
  });
});

describe('the report (Analytics::shape, peaksOf)', { skip }, () => {
  it('each UTC day\'s most players online from health rows', () => {
    const t0 = Date.UTC(2026, 10, 10) / 1000;
    const got = php('peaks', [['t', 'p', 'pa'], [[t0, 3, 1], [t0 + 3600, 7, 2], [t0 + 86400, 2, 1], [t0 + 90000, null, null]], 600]);
    assert.deepEqual(got, { '2026-11-10': { p: 7, at: t0 + 3600 }, '2026-11-11': { p: 2, at: t0 + 86400 } });
    assert.deepEqual(php('peaks', [['t', 'p'], [[t0, 3]], 2 * 86400]), [], 'buckets longer than a day say nothing about a day');
  });

  it('buckets a day up to 120 days, then weeks from Monday, then months', () => {
    assert.deepEqual(php('unit', ['2026-08-01', '2026-11-11', '2026-11-11']), ['day', '2026-11-09', '2026-11-01']);
    assert.equal(php('unit', ['2025-11-12', '2026-11-11', '2026-11-11'])[0], 'week');
    assert.equal(php('unit', ['2023-01-01', '2026-11-11', '2026-11-11'])[0], 'month');
  });

  it('players over time, active players from the first day counted, pages, tallies and records', () => {
    const rows = [
      { day: '2026-11-10', metric: 'active', k: '', value: 4 }, { day: '2026-11-10', metric: 'active_new', k: '', value: 1 },
      { day: '2026-11-11', metric: 'active', k: '', value: 6 }, { day: '2026-11-11', metric: 'wau', k: '', value: 8 },
      { day: '2026-11-11', metric: 'pageviews', k: '', value: 30 }, { day: '2026-11-11', metric: 'pageviews', k: 'chat', value: 20 },
      { day: '2026-11-11', metric: 'pageviews', k: 'home', value: 10 }, { day: '2026-11-11', metric: 'play_seconds', k: '', value: 7200 },
    ];
    const tallies = [
      { day: '2026-11-01', k: 'pig:nibble', value: 412 }, { day: '2026-11-11', k: 'pig:nibble', value: 5 },
      { day: '2026-11-11', k: 'quoin:xp', value: 2 }, { day: '2026-11-11', k: 'quoin:mood', value: 3 },
    ];
    const firsts = { active: '2026-11-10', active_new: '2026-11-10', pageviews: '2026-11-11', tally: '2026-11-01', wau: '2026-11-11', play_seconds: '2026-11-11' };
    const bests = [{ day: '2026-11-10', metric: 'active', value: 4 }, { day: '2026-11-11', metric: 'active', value: 6 }, { day: '2026-11-11', metric: 'pageviews', value: 30 }];
    const r = php('shape', ['30d', '2026-11-08', '2026-11-11', ['2026-10-01', '2026-11-09', '2026-11-11', '2026-11-11'], rows, tallies, firsts, { week: 9, month: 12 }, bests]);
    assert.deepEqual(r.days, ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']);
    assert.deepEqual(r.series.signups, [0, 1, 0, 2]);
    assert.deepEqual(r.series.players, [1, 2, 2, 4], 'the running total starts with the players from before the range');
    assert.deepEqual(r.series.active, [null, null, 4, 6], 'nothing known before the first day counted');
    assert.deepEqual(r.series.returning, [null, null, 3, 6]);
    assert.deepEqual(r.series.pageviews, [null, null, null, 30]);
    assert.deepEqual(r.pages, [{ section: 'chat', views: 20, today: 20 }, { section: 'home', views: 10, today: 10 }]);
    assert.deepEqual(r.totals, { players: 4, signups_today: 2, active_today: 6, active_week: 9, active_month: 12, pageviews_today: 30, pageviews_range: 30, play_today: 7200, peak_today: null });
    const nibbled = r.counters.find((c) => c.key === 'piggies_nibbled');
    assert.deepEqual(nibbled, { key: 'piggies_nibbled', label: 'Piggies nibbled', today: 5, total: 417, series: [0, 0, 0, 5], record: { n: 412, day: '2026-11-01' } });
    assert.equal(r.counters.find((c) => c.key === 'quoins_grabbed').today, 5, 'quoin:* takes every quoin type');
    assert.deepEqual(r.records.active, { n: 6, day: '2026-11-11' });
    assert.equal(r.records.peak, null);
    assert.deepEqual(r.records.signups, { n: 2, day: '2026-11-11' });
  });
});

describe('the console carries the tab, the route and the tables', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath('src', f), 'utf8');
  it('admin/analytics is for administrators and in the docblock; the beacon route is public and signs nothing in', () => {
    const ac = src('AdminConsole.php');
    assert.match(ac, /Route\(Method::Get, '\/groddle\/v1\/admin\/analytics', policy: new Policy\(Access::Cap, self::ADMIN\)\)/);
    assert.match(ac, /\* {3}GET {2}admin\/analytics\?range=30d\|90d\|365d\|all/);
    const an = src('Analytics.php');
    assert.match(an, /Route\(Method::Post, '\/groddle\/v1\/hit', policy: new Policy\(Access::Public\)\)/);
    assert.doesNotMatch(an, /remoteAddress|REMOTE_ADDR|setcookie|withCookie|im_lines/, 'no address, no cookie, nothing of IMs');
    assert.match(src('Extension.php'), /new Analytics\(\$minn\), new GoogleSignIn\(\$minn\)\);/);
    assert.match(src('PlayTime.php'), /Analytics::fromBatch\(\$db, \$batch, \$now\);/);
  });

  it('the tables are declared, keyed by day', () => {
    const minn = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(minn.tables.groddle_analytics_daily.includes('PRIMARY KEY  (day,metric,k)'));
    assert.ok(minn.tables.groddle_analytics_seen.includes('PRIMARY KEY  (day,user_id)'));
  });

  it('the page has the tab and its panel, and both chart tabs share the chart kit at one key', () => {
    const page = src('AdminConsolePage.php');
    assert.match(page, /data-console-tab="analytics">Analytics<\/button>/);
    assert.match(page, /data-console-tabpanel="analytics"/);
    assert.match(page, /analytics\.js\?v=" \. self::ANALYTICS_ASSET_KEY/);
    const key = (f) => /from '\.\/charts\.js\?v=([^']+)'/.exec(readFileSync(sitePath('console', f), 'utf8'))?.[1];
    assert.ok(key('server.js'));
    assert.equal(key('analytics.js'), key('server.js'));
  });
});
