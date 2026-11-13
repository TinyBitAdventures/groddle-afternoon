/**
 * The console's Ledger tab (G335 E0, glitch-audit research/coverage/g335-slice2-plan.md section 3; Austin 2026-11-13):
 * a read-only watch of what each character's ledger credited, clamped and sent out a UTC day, flagged past the
 * honest maxima (groddle-afternoon-site src/LedgerWatch.php). Fixture rows go in, flags come out; the save writes'
 * credit rows are made by the site's own LedgerMath::credits, as Ledger::write logs them, so the shapes match.
 *
 * The plan's two-player check: A plays honestly through a day, B forges 20 quests and 5 levels in one save. Only B
 * is flagged.
 *
 * The PHP runs through the php CLI.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || (!hasPhp && 'needs the php CLI');

/**
 * Runs the watch in PHP. writes: save writes [{user, at, entries}] credited in order (each character's first write
 * marks an empty save as done, as a new character's would); log and trades: raw table rows. Returns the report.
 */
function watch({ writes = [], log = [], trades = [], context = {}, since = '2026-11-13', today = '2026-11-13', days = 1 } = {}) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'Ledger', 'Characters', 'LedgerWatch'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath, LedgerWatch};
    $in = json_decode(stream_get_contents(STDIN), true);
    $e = Economy::shared();
    $acc = [];
    $credited = [];
    foreach ($in['writes'] as $w) {
      $u = (int) $w['user'];
      $cr = $credited[$u] ?? [];
      if (!isset($cr['base'])) {
        foreach (LedgerMath::baseline([], $e) as [$k, $r, $n]) $cr[$k][$r] = $n;
      }
      $c = LedgerMath::credits($w['entries'], $cr, $e);
      foreach ($c['rows'] as [$k, $r, $n]) $cr[$k][$r] = $n;
      $credited[$u] = $cr;
      if ($c['detail'] !== []) {
        $detail = $c['detail'] + ['goods' => ['items' => (object) $c['goods']['items'], 'currants' => $c['goods']['currants']]];
        LedgerWatch::foldLog($acc, ['user_id' => $u, 'at' => $w['at'], 'kind' => 'credit', 'detail' => json_encode($detail)], $e);
      }
    }
    foreach ($in['log'] as $r) LedgerWatch::foldLog($acc, $r + ['detail' => json_encode($r['d'])], $e);
    foreach ($in['trades'] as $t) LedgerWatch::foldTrade($acc, $t, $e);
    $ctx = $in['context'];
    foreach (['names', 'ledger', 'created'] as $k) $ctx[$k] = array_combine(array_map('intval', array_keys($ctx[$k] ?? [])), array_values($ctx[$k] ?? []));
    echo json_encode(LedgerWatch::report($acc, $ctx, $in['since'], $in['today'], $in['days']));`;
  const input = JSON.stringify({ writes, log, trades, context, since, today, days });
  return JSON.parse(String(execFileSync('php', ['-r', code], { input })));
}

/** One PHP expression's value (the watch's constants and helpers). */
function phpValue(expr) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'Ledger', 'Characters', 'LedgerWatch'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath, Ledger, LedgerWatch};
    echo json_encode(${expr});`;
  return JSON.parse(String(execFileSync('php', ['-r', code])));
}

const economy = () => JSON.parse(readFileSync(sitePath('data', 'economy.json'), 'utf8'));

/** A multiplayer save's entries with the markers LedgerMath::markers reads. */
function save({ level = 1, quests = [], badges = [] } = {}) {
  const xpTable = economy().credits.xp;
  const xp = level > 1 ? xpTable[level - 2] : 0;
  return {
    playerState: JSON.stringify({ version: 7, inventory: {}, player: { currants: 0, level, xp, energy: 50, mood: 50 }, systems: { quests: { completed: quests }, achievements: { unlocked: badges }, features: {} }, world: {} }),
  };
}

const at = (h, m = 0) => `2026-11-13 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
const kinds = (flags) => flags.map((f) => f.kind).sort();

describe('the Ledger tab flags only what is past the honest maxima (LedgerWatch)', { skip }, () => {
  const questIds = () => Object.entries(economy().credits.quests).filter(([, q]) => q.c > 0 && !q.i).map(([id]) => id);

  it('the plan\'s two players: A plays honestly, B forges 20 quests and 5 levels; only B is flagged', () => {
    const ids = questIds();
    const honest = ids.slice(0, 4);
    const forged = ids.slice(4, 24);
    const A = 101; const B = 102;
    const writes = [
      // A: a quest at a time, a level at a time, through the day.
      { user: A, at: at(9), entries: save({ level: 2, quests: honest.slice(0, 1) }) },
      { user: A, at: at(10), entries: save({ level: 3, quests: honest.slice(0, 2) }) },
      { user: A, at: at(12), entries: save({ level: 3, quests: honest.slice(0, 3) }) },
      { user: A, at: at(13), entries: save({ level: 4, quests: honest.slice(0, 3) }) },
      { user: A, at: at(15), entries: save({ level: 4, quests: honest }) },
      // B: one save names 20 completed quests and level 6 (xp to match).
      { user: B, at: at(14), entries: save({ level: 6, quests: forged }) },
    ];
    const log = [
      // Both connected a while (the realtime server's rows: receipts, connected seconds and the refill they gave).
      { user_id: A, at: at(16), kind: 'credit', d: { server: { quoin: 9, take: 4, online: 360 }, got: { items: { plank: 6 }, currants: 40 }, late: 0, online_s: 21600, refill: 36000 } },
      { user_id: B, at: at(14, 30), kind: 'credit', d: { server: { online: 30 }, got: { items: {}, currants: 0 }, late: 0, online_s: 1800, refill: 3000 } },
    ];
    // A sells B ten apples for 50 currants.
    const trades = [{ trade_id: 'tr-1', a_id: A, b_id: B, a_gave: JSON.stringify({ items: [{ c: 'apple', n: 10 }], currants: 0 }), b_gave: JSON.stringify({ items: [], currants: 50 }), created_at: at(15, 30) }];
    const r = watch({ writes, log, trades, context: { names: { [A]: 'Ada', [B]: 'Bram' }, ledger: { [A]: { budget: 50000, seeded: 'new' }, [B]: { budget: 8000, seeded: 'new' } }, created: { [A]: '2026-11-01', [B]: '2026-11-01' } } });

    assert.deepEqual(r.characters.map((c) => c.player.name), ['Bram', 'Ada'], 'the flagged character first');
    const [b, a] = r.characters;
    assert.deepEqual(kinds(a.flags), []);
    assert.deepEqual(kinds(a.days[0].flags), [], 'A is not flagged');
    assert.equal(a.flagged, 0);
    assert.deepEqual(kinds(b.days[0].flags), ['level_jump', 'quests_day', 'quests_write']);
    assert.equal(b.flagged, 3);

    const ad = a.days[0];
    assert.equal(ad.day, '2026-11-13');
    assert.deepEqual(ad.credits.quests.n, 4);
    assert.equal(ad.credits.quests.write, 1);
    assert.deepEqual([ad.credits.levels.gained, ad.credits.levels.jump, ad.credits.levels.paid], [3, 1, 3]);
    const lv = economy().credits.levels;
    assert.equal(ad.credits.levels.currants, lv['2'] + lv['3'] + lv['4']);
    assert.deepEqual(ad.budget, { refill: 36000, online_s: 21600, late: 0 });
    assert.equal(ad.credits.server.n, 13, 'quoins and takes, not the online events');
    assert.deepEqual(ad.outbound.trade, { gave: 10 * economy().items.apple.v, got: 50 });
    assert.equal(b.days[0].outbound.trade.gave, 50);

    const bd = b.days[0];
    assert.equal(bd.credits.quests.n, 20);
    assert.equal(bd.credits.quests.write, 20);
    assert.deepEqual([bd.credits.levels.gained, bd.credits.levels.jump], [5, 5]);
    const text = bd.flags.map((f) => f.text).join(' ');
    assert.match(text, /20 quests credited this day; honest play tops out near 12\./);
    assert.match(text, /5 levels in one save; one save of honest play carries at most 3\./);
    assert.doesNotMatch(text, /—/, 'no em-dashes');
  });

  it('a held connection, clamps and the budget drawn over the range', () => {
    const r = watch({
      days: 2, since: '2026-11-12',
      log: [
        { user_id: 7, at: '2026-11-12 23:59:00', kind: 'credit', d: { server: { online: 1380 }, got: { items: {}, currants: 0 }, late: 0, online_s: 82800, refill: 50000 } },
        { user_id: 7, at: at(8), kind: 'clamp', d: { clamped: { items: {}, currants: 1000 }, budget: 0, kept: 0, made: {}, repeats: 2, last: { clamped: { items: {}, currants: 500 } } } },
        { user_id: 8, at: at(8), kind: 'credit', d: { server: { online: 60 }, got: { items: {}, currants: 0 }, late: 0, online_s: 3600, refill: 6000 } },
        { user_id: 9, at: at(8), kind: 'credit', d: { trade: 'tr-x', applied: 'on load' } },
      ],
      context: { ledger: { 7: { budget: 100, seeded: 'new' }, 8: { budget: 0, seeded: 'new' } } },
    });
    const by = Object.fromEntries(r.characters.map((c) => [c.player.id, c]));
    const held = by[7].days.find((d) => d.day === '2026-11-12');
    assert.deepEqual(kinds(held.flags), ['online_day']);
    assert.match(held.flags[0].text, /^Connected 23\.0 hours this day \(budget refilled 50,000\)/);
    const clamped = by[7].days.find((d) => d.day === '2026-11-13');
    assert.deepEqual(clamped.clamps, { n: 3, value: 1500 }, 'repeats counted, the first and last clamp valued');
    assert.match(clamped.flags[0].text, /^Clamped 3 times \(at least 1,500 of value taken back\)/);
    assert.equal(by[7].drawn, 49900, 'refilled less the budget now');
    assert.deepEqual(kinds(by[7].flags), [], '49,900 over 1,380 minutes is 36 a minute, inside honest play');
    assert.equal(by[8].drawn, 6000);
    assert.deepEqual(kinds(by[8].flags), ['drawn_minute'], '6,000 in 60 minutes');
    assert.match(by[8].flags[0].text, /^The budget paid at least 6,000 in these 2 days, 100\.0 a connected minute; honest play draws at most 38\.7\./);
    assert.equal(by[9].days[0].credits.value, 0, 'applying a settled trade credits nothing');
    assert.equal(by[9].player.name, '#9');
  });

  it('a new character sending out more than its day brought in', () => {
    const mail = (id, user, gave, got) => ({ trade_id: id, a_id: user, b_id: 0, a_gave: JSON.stringify(gave), b_gave: JSON.stringify(got), created_at: at(11) });
    const trades = [
      mail('mail-00000000000000a1-s', 5, { items: [], currants: 20000 }, { items: [], currants: 0 }),
      mail('mail-00000000000000a2-s', 6, { items: [], currants: 20000 }, { items: [], currants: 0 }),
      mail('mail-00000000000000a3-c', 4, { items: [], currants: 0 }, { items: [], currants: 40000 }),
      mail('auc-00000000000000b1-l', 6, { items: { apple: 3 }, currants: 0 }, { items: {}, currants: 0 }),
      { trade_id: 'starter-bags-5', a_id: 5, b_id: 0, a_gave: '{}', b_gave: JSON.stringify({ items: { apple: 1 }, currants: 0 }), created_at: at(11) },
    ];
    const r = watch({ trades, context: { created: { 5: '2026-11-12', 6: '2026-10-01', 4: '2026-10-01' } } });
    const by = Object.fromEntries(r.characters.map((c) => [c.player.id, c]));
    assert.deepEqual(kinds(by[5].days[0].flags), ['outbound_new']);
    assert.match(by[5].days[0].flags[0].text, /^Sent 20,000 of value to other characters \(net\) in its first 3 days, more than the day brought in \(0\) plus a new character's start \(5,000\)\.$/);
    assert.deepEqual(kinds(by[6].days[0].flags), [], 'an older character sends what it likes');
    assert.deepEqual(by[6].days[0].outbound.auction, { gave: 3 * economy().items.apple.v, got: 0 }, 'items as a map');
    assert.equal(by[4].days[0].outbound.net, -40000);
    assert.equal(by[5].days[0].outbound.mail.gave, 20000, 'a starter bag is not outbound');
  });

  it('reads a range of 1 to 14 days, 7 when asked anything else', () => {
    assert.deepEqual(phpValue("array_map(fn ($v) => LedgerWatch::days($v), ['1', '14', '15', '0', 'x', null, '3'])"), [1, 14, 7, 7, 7, 7, 3]);
  });
});

describe('the honest maxima come from the data and the ledger\'s own caps', { skip }, () => {
  it('level-ups a day are the measured LEVELS_DAILY', () => {
    assert.equal(phpValue('LedgerWatch::LEVELS_DAY'), phpValue('LedgerMath::LEVELS_DAILY'));
    assert.equal(phpValue('LedgerWatch::LEVELS_DAY'), 12);
  });

  it('one save carries at most the levels the biggest quest xp crosses, plus 1', () => {
    const quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));
    const credited = Object.keys(economy().credits.quests);
    const most = Math.max(...credited.map((id) => Number(quests[id]?.rewards?.xp) || 0)) * (economy().credits.buff + 0.1);
    const xp = [0, ...economy().credits.xp];
    const levelFor = (v) => xp.filter((need) => v >= need).length;
    let jump = 0;
    for (let l = 1; l < xp.length; l++) jump = Math.max(jump, levelFor(xp[l - 1] + most) - l);
    assert.equal(jump, 2);
    assert.equal(phpValue('LedgerWatch::LEVEL_JUMP'), jump + 1);
  });

  it('the budget figures are the ledger\'s', () => {
    assert.equal(phpValue('LedgerWatch::DRAWN_PER_MINUTE'), 38.7);
    assert.ok(phpValue('LedgerWatch::DRAWN_PER_MINUTE') < phpValue('Ledger::RATE'));
    assert.ok(phpValue('LedgerWatch::ONLINE_HOURS_DAY') < 24);
    const maxima = phpValue('LedgerWatch::maxima()');
    assert.deepEqual(maxima.map((m) => m.key), ['quests_day', 'quests_write', 'levels_day', 'level_jump', 'online_day', 'drawn_minute', 'new_days']);
    for (const m of maxima) assert.doesNotMatch(m.words, /—/);
  });
});

describe('the route is read only, for administrators, with indexes added and nothing else', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath('src', f), 'utf8');
  it('admin/ledger is manage_options only and registered', () => {
    const w = src('LedgerWatch.php');
    assert.match(w, /#\[Route\(Method::Get, '\/groddle\/v1\/admin\/ledger', policy: new Policy\(Access::Cap, self::ADMIN\)\)\]/);
    assert.match(w, /private const ADMIN = 'manage_options';/);
    assert.doesNotMatch(w, /\b(INSERT|UPDATE|DELETE|REPLACE)\b\s/, 'reads only');
    assert.doesNotMatch(w, /->execute\(/);
    assert.doesNotMatch(w, /\u2014/, 'no em-dashes');
    assert.match(src('Extension.php'), /new LedgerWatch\(\$minn\), new Analytics\(\$minn\)/);
  });

  it('the log and trades gain a time index', () => {
    const minn = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(minn.tables.groddle_ledger_log.includes('KEY at (at)'));
    assert.ok(minn.tables.groddle_trades.includes('KEY created_at (created_at)'));
  });
});

describe('the console carries the Ledger tab (console/ledger.js)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath('src', f), 'utf8');
  it('the page has the tab, its panel and its own asset key', () => {
    const page = src('AdminConsolePage.php');
    assert.match(page, /<button type="button" role="tab" id="console-tab-ledger" aria-controls="console-ledger" aria-selected="false" tabindex="-1" data-console-tab="ledger">Ledger<\/button>/);
    assert.match(page, /id="console-ledger" role="tabpanel" aria-labelledby="console-tab-ledger" data-console-tabpanel="ledger" hidden/);
    assert.match(page, /ledger\.js\?v=" \. self::LEDGER_ASSET_KEY/);
    assert.match(page, /ledger\.css\?v=" \. self::LEDGER_ASSET_KEY/);
    const key = (f) => /from '\.\/charts\.js\?v=([^']+)'/.exec(readFileSync(sitePath('console', f), 'utf8'))?.[1];
    assert.equal(key('ledger.js'), key('server.js'), 'one chart kit key');
    assert.match(readFileSync(sitePath('console', 'ledger.css'), 'utf8'), /\.console-tabs \[data-console-tab="ledger"\] \{ --tab-hue: var\(--cx-hue-\d\); --tab-glyph:/);
  });

  it('draws a day of the report in its columns', { skip }, async () => {
    const { dayCells, hours } = await import(pathToFileURL(sitePath('console', 'ledger.js')).href);
    const ids = Object.entries(economy().credits.quests).filter(([, q]) => q.c > 0 && !q.i).map(([id]) => id).slice(0, 20);
    const r = watch({ writes: [{ user: 3, at: at(14), entries: save({ level: 6, quests: ids }) }] });
    const cells = dayCells(r.characters[0].days[0]);
    assert.equal(cells.length, 9);
    assert.match(cells[1].text, /^20 · /);
    assert.match(cells[1].title, /at most 20 in one save$/);
    assert.match(cells[3].text, /^\+5 · /);
    assert.equal(cells[8].text, '–');
    assert.equal(hours(5400), '1.5 h');
    assert.equal(hours(0), '–');
    for (const f of ['ledger.js', 'ledger.css']) assert.doesNotMatch(readFileSync(sitePath('console', f), 'utf8'), /\u2014/, f);
  });
});
