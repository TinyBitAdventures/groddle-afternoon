/**
 * Report #691: "not able to drop emblems in my house ... 'you don't have enough of that item' and then
 * the emblem pops back into my inventory. I was able to drop a stack of meat."
 *
 * The site's ledger credited at most 4 shrine emblems a UTC day; up to 4 more waited in the pack
 * outside the ledger until a later day's count, and a drop of a waiting one was refused as "short".
 * Austin's ruling (2026-11-25, G1299): no emblem limit, as Glitch (items/emblem_alph.js 73 dropped
 * them freely, with no daily count). The site's LedgerMath earned() now credits every emblem the
 * save's shrine record gained, and an emblem the old count left waiting is credited by the next
 * save write.
 *
 * What the report also exposed stays for the classes the ledger still holds back (Gameshow
 * Tickets, beads, artifact pieces, #246's level-up currants): the last save write's held goods are
 * remembered for the day (LedgerMath WAIT_DAY), and a drop, gift, trade, sale, letter or home
 * machine asks Ledger::waitingFor before it says "short": the answer is why "waiting", with words
 * that name the item and say when it clears (the next 00:00 UTC, when the day's first write credits
 * it) and clears. Those limits are ours.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/r691-emblem-wait.test.js
 * (the database part needs a php with mysqli and a MariaDB, as tests/g560-shared-pickup.test.js)
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DROP_TEXT, dropRefusalText, nextUtcDay, untilText, waitingText } from '../public/js/drops-mp.js?v=6a16d73d';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hasPhp = HAS_PHP;
const skip = skipWithoutSite || (!hasPhp && 'no php');

/** One PHP snippet against the site's LedgerMath, its input on STDIN. */
function php(body, input) {
  const code = `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $a = json_decode(stream_get_contents(STDIN), true);
    ${body}`;
  return JSON.parse(String(execFileSync(PHP, ['-r', code], { input: JSON.stringify(input) })));
}

const GIANTS = ['grendaline', 'mab', 'friendly', 'lem', 'pot', 'cosma', 'spriggan', 'zille'];

/** A save write's entries: the pack and the shrine record. */
const entriesOf = (inv, emblems, donations = 50) => ({
  playerState: JSON.stringify({
    version: 7, inventory: inv, player: { currants: 0, xp: 5000, level: 5 },
    systems: { quests: { completed: [] }, achievements: { unlocked: [] }, shrines: { emblems, favor: {}, donations }, features: {} },
  }),
});
const CHECK = 'echo json_encode(LedgerMath::check($a[0], $a[1], [], $a[2], 0.0, 50000.0, Economy::shared(), null, fn (): int => 0));';

describe('#691: a day of 8 shrine claims (the player\'s, read on live)', { skip }, () => {
  let r;
  let t;
  before(() => {
    const inv = Object.fromEntries(GIANTS.map((g) => [`emblem_${g}`, 1]));
    const credited = { base: { base: 1 }, base905: { base905: 1 }, level: { level: 5 }, mark: { base: 1, base905: 1, donations: 50, ...Object.fromEntries(GIANTS.map((g) => [`emblem:${g}`, 4])) } };
    r = php(CHECK, [{ items: {}, currants: 0 }, credited, entriesOf(inv, Object.fromEntries(GIANTS.map((g) => [g, 5])))]);
    // A class the ledger still holds back: six Gameshow Tickets from six donations, TICKET_DAILY (4) credited.
    t = php(CHECK, [{ items: {}, currants: 0 }, credited, entriesOf({ gameshow_ticket: 6 }, {}, 56)]);
  });

  it('G1299: an emblem never waits; all eight are credited, none taken back', () => {
    const after = r.after.items || {};
    assert.deepEqual(GIANTS.filter((g) => after[`emblem_${g}`] === 1).sort(), [...GIANTS].sort(), JSON.stringify(after));
    assert.deepEqual(Object.keys(r.held.items || {}), [], JSON.stringify(r.held));
    assert.deepEqual(r.reconciled.clamped.items, [], 'nothing clamped');
    assert.deepEqual(r.rows.filter(([kind]) => kind === 'waitday'), [], 'no waiting rows');
  });

  it('the limits it did not change: tickets past today\'s count wait in the pack, and the write remembers them (WAIT_DAY)', () => {
    assert.deepEqual(t.after.items, { gameshow_ticket: 4 });
    assert.deepEqual(t.held.items, { gameshow_ticket: 2 });
    assert.deepEqual(t.reconciled.clamped.items, [], 'nothing clamped');
    assert.deepEqual(t.rows.filter(([kind]) => kind === 'waitday'), [['waitday', 'gameshow_ticket', 2]], JSON.stringify(t.rows));
  });

  it('the site no longer has an emblem count', () => {
    assert.doesNotMatch(readFileSync(join(SITE_DIR, 'src/LedgerMath.php'), 'utf8'), /EMBLEM_DAILY|EMBLEM_WAIT/);
  });

  it('a class that no longer waits gets its row back to 0, an unchanged one gets none', () => {
    const rows = php('echo json_encode(LedgerMath::waitRows($a[0], $a[1]));', [{ emblem_mab: 1, emblem_pot: 1, $: 500 }, { items: { emblem_pot: 1, gameshow_ticket: 2 }, currants: 0 }]);
    assert.deepEqual(rows.sort(), [['waitday', '$', 0], ['waitday', 'emblem_mab', 0], ['waitday', 'gameshow_ticket', 2]].sort());
  });

  it('WAIT_DAY is a daily kind (it lapses at 00:00 UTC, when the day\'s first write credits what waited)', () => {
    assert.equal(php("echo json_encode(in_array(LedgerMath::WAIT_DAY, LedgerMath::DAILY_KINDS, true) && strlen(LedgerMath::WAIT_DAY) <= 8);", []), true);
  });
});

describe('#691: the words', () => {
  const NOW = Date.UTC(2026, 10, 25, 21, 0, 0);

  it('name the item, say it is past today\'s limit and when it clears; plain, no em dashes', () => {
    const one = waitingText({ one: 'Gameshow Ticket', n: 1, now: NOW });
    assert.equal(one, "This Gameshow Ticket is past today's limit, so it isn't counted yet. You can drop it after midnight UTC (in about 3 hours).");
    assert.equal(waitingText({ one: 'Gameshow Ticket', many: 'Gameshow Tickets', n: 3, k: 3, verb: 'give', now: NOW }), "These 3 Gameshow Tickets are past today's limit, so they aren't counted yet. You can give them after midnight UTC (in about 3 hours).");
    assert.equal(waitingText({ one: 'Gameshow Ticket', many: 'Gameshow Tickets', n: 3, k: 1, verb: 'sell', now: NOW }), "1 of these Gameshow Tickets is past today's limit, so it isn't counted yet. You can sell it after midnight UTC (in about 3 hours).");
    assert.equal(waitingText({ currants: true, n: 2000, k: 1500, verb: 'send', now: NOW }), "1,500 of your currants are past today's limit, so they aren't counted yet. You can send them after midnight UTC (in about 3 hours).");
    for (const t of [one]) assert.doesNotMatch(t, /—|–/);
  });

  it('count down to the next 00:00 UTC', () => {
    assert.equal(nextUtcDay(NOW), Date.UTC(2026, 10, 26));
    assert.equal(nextUtcDay(Date.UTC(2026, 10, 26)), Date.UTC(2026, 10, 27), 'at midnight the next one');
    assert.equal(untilText(25 * 60000), 'in 25 minutes');
    assert.equal(untilText(30 * 1000), 'in 1 minute');
    assert.equal(untilText(60 * 60000), 'in about 1 hour');
    assert.equal(untilText(3 * 3600000 + 40 * 60000), 'in about 4 hours');
  });

  it('a waiting drop shows the site\'s words; without them, the drop\'s own say the same', () => {
    const site = "This Gameshow Ticket is past today's limit, so it isn't counted yet. You can drop it after midnight UTC (in about 3 hours).";
    assert.equal(dropRefusalText({ why: 'waiting', text: site }, 'HOUSE_7'), site);
    assert.equal(dropRefusalText({ why: 'waiting' }, 'HOUSE_7', { n: 1, one: 'Gameshow Ticket', many: 'Gameshow Tickets' }, NOW), site);
    assert.equal(dropRefusalText({ why: 'waiting', clears: Date.UTC(2026, 10, 25, 21, 25) / 1000 }, 'HOUSE_7', { n: 1, one: 'Gameshow Ticket' }, NOW), "This Gameshow Ticket is past today's limit, so it isn't counted yet. You can drop it after midnight UTC (in 25 minutes).");
    assert.equal(dropRefusalText({ why: 'short', text: "You don't have enough of that item." }, 'HOUSE_7', { n: 1, one: 'Meat' }), "You don't have enough of that item.");
    assert.equal(dropRefusalText({ why: 'full' }, 'HOUSE_7'), DROP_TEXT.full('house'));
  });

  it('the feature passes the drop\'s names, and a waiting refusal keeps the item in the pack like any other', () => {
    const src = readFileSync(join(root, 'public/js/features/drops-mp-feature.js'), 'utf8');
    assert.match(src, /else tell\(dropRefusalText\(msg, client\.street \|\| street, d \? \{ n: d\.n, one: itemLabel\(d\.c\), many: itemLabel\(d\.c, 2\) \} : null\)\);/);
    // Only these refusals drop it as the player's own; "waiting" is not one of them, so the pack keeps it.
    assert.match(src, /if \(d && \['type', 'off', 'private'\]\.includes\(String\(msg\.why\)\)\) dropOwn\(d\);/);
  });

  it('the site\'s words are the game\'s (LedgerMath::waitingText = drops-mp.js waitingText)', { skip }, () => {
    const cases = [
      ['artifact_necklace_onyx_piece', 1, 1, 'drop', NOW], ['gameshow_ticket', 3, 3, 'give', NOW], ['gameshow_ticket', 3, 2, 'trade', NOW + 9000000], ['$', 2000, 1500, 'send', NOW + 10500000],
    ];
    const site = php('$e = Economy::shared(); echo json_encode(array_map(fn ($x) => LedgerMath::waitingText($e, $x[0], $x[1], $x[2], $x[3], intdiv($x[4], 1000), LedgerMath::nextDay(intdiv($x[4], 1000))), $a));', cases);
    const names = php('$e = Economy::shared(); echo json_encode(array_map(fn ($c) => [$e->name($c, 1), $e->name($c, 2)], $a));', cases.map(([c]) => c));
    cases.forEach(([c, n, k, verb, now], i) => {
      assert.equal(site[i], waitingText({ one: names[i][0], many: names[i][1], n, k, verb, now, currants: c === '$' }), `${c} ${n}/${k}`);
    });
  });
});

/** The database to make the throwaway one on: GRODDLE_TEST_MYSQL, else the local groddle.localhost's wp-config. */
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

const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const db = mysql();
// A PHP that has mysqli as a module only (Arch's) gets it loaded.
const phpArgs = hasPhp && spawnSync(PHP, ['-r', 'exit(class_exists("mysqli") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=mysqli'] : [];
const reachable = db && hasPhp && spawnSync(PHP, [...phpArgs, '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skip
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('#691: on the site\'s ledger (LedgerDrop, Ledger::settle, Ledger::waitingFor)', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [...phpArgs, join(root, 'tests/fixtures/drops/ledger-drop-waiting.php'), engineDir, SITE_DIR, 'run', db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_wait_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('G1299: the write credited all eight emblems and the day\'s four tickets, and remembered the two tickets waiting', () => {
    assert.deepEqual(r.credited.sort(), [...GIANTS].sort());
    assert.deepEqual(r.waits, []);
    assert.equal(r.tickets, 4);
    const day = new Date(r.now * 1000).toISOString().slice(0, 10);
    assert.deepEqual(r.waitRows, { [`${day}:gameshow_ticket`]: 2 });
  });

  it('#691: every emblem drops, and the meat', () => {
    assert.deepEqual(r.dropEmblems, Object.fromEntries(GIANTS.map((g) => [g, 'settled'])));
    assert.deepEqual(r.dropMeat, { status: 'settled' });
  });

  it('tickets past today\'s count are refused as waiting, named, with when they clear', () => {
    assert.equal(r.dropWaiting.status, 'refused');
    assert.equal(r.dropWaiting.why, 'waiting', JSON.stringify(r.dropWaiting));
    assert.equal(r.dropWaiting.c, 'gameshow_ticket');
    assert.equal(r.dropWaiting.clears, nextUtcDay(r.now * 1000) / 1000);
    assert.equal(r.dropWaiting.text, "2 of these Gameshow Tickets are past today's limit, so they aren't counted yet. You can drop them after midnight UTC (in about 3 hours).");
    assert.deepEqual(r.dropWaitingAgain, r.dropWaiting, 'asked again, the same answer');
  });

  it('more than the pack holds is still a plain short', () => {
    assert.equal(r.dropMore.why, 'short');
    assert.equal(r.dropMoreMeat.why, 'short');
  });

  it('a trade or a gift of waiting tickets carries the waiting answer, in its own verb', () => {
    assert.equal(r.trade.status, 'refused');
    assert.equal(r.trade.waiting?.why, 'waiting', JSON.stringify(r.trade));
    assert.match(r.trade.waiting.text, /You can trade them after midnight UTC/);
    assert.match(r.gift.waiting?.text || '', /You can give them after midnight UTC/);
  });

  it('after midnight UTC the old row says nothing, and the day\'s first write credits them so they drop', () => {
    assert.equal(r.nextDay, null);
    assert.deepEqual(r.dropTomorrow, { status: 'settled' });
  });

  it('G1299: an emblem the old count left waiting is credited by the next save write, with nothing newly earned', () => {
    assert.equal(r.oldBefore.why, 'waiting', 'before the write: the state players have now');
    assert.deepEqual(r.oldLedgerBefore, { emblem_mab: 1 });
    assert.deepEqual(r.oldClamped, { items: [], currants: 0 }, JSON.stringify(r.oldClamped));
    assert.deepEqual(r.oldLedgerAfter, { emblem_mab: 2 });
    const day = new Date(r.now * 1000).toISOString().slice(0, 10);
    assert.deepEqual(r.oldWaitRows, { [`${day}:emblem_mab`]: 0 }, 'its wait is cleared');
    assert.deepEqual(r.oldAfter, { status: 'settled' });
  });
});
