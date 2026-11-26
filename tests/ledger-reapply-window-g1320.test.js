/**
 * G1320 (root R50, report #670's reopen): "keep this window's game" (MultiplayerSave takeover) puts back
 * into the kept copy the trades applied since that copy was last saved (groddle-afternoon-site
 * src/Ledger.php reapply). It looked back at most a day (Ledger::PENDING_FOR), so a copy older than that
 * (a second device, or a window left open overnight) lost what the other copy or the site applied since:
 * a Still put back on its owner's floor (HouseFloors catchUpBack), a gift or a trade. The write's check
 * then took the loss as the player's, out of the ledger too: players saw a Still and an Emotional Bear
 * vanish twice. Now the window starts at the copy's own last save (the page's confirmedAt, sent as
 * `since`, js/save-store.js), however long ago; trades applied before it are in the copy already.
 *
 * - The takeover's ledger steps on a throwaway MariaDB database: tests/fixtures/ledger-reapply/window.php
 *   (a copy saved 30 h ago kept over one that took an Emotional Bear for an Apple 25 h ago).
 * - The read stays bounded: this character's trades since then, through (a_id, a_applied_at) and
 *   (b_id, b_applied_at) keys on groddle_trades (minn.json).
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/ledger-reapply-window-g1320.test.js (MariaDB as
 * tests/r670-still-house-floors.test.js finds it).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { PHP as PHP_BIN } from './php.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A PHP with mysqli (the FrankenPHP wrapper's php -v fails: tests that need PHP skip there). */
function php() {
  for (const cmd of [[PHP_BIN], [PHP_BIN, '-d', 'extension=mysqli']]) {
    if (spawnSync(cmd[0], [...cmd.slice(1), '-r', 'exit(function_exists("mysqli_report") ? 0 : 1);']).status === 0) return cmd;
  }
  return null;
}
const PHP = php();

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
const reachable = db && PHP && spawnSync(PHP[0], [...PHP.slice(1), '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!PHP && 'no php with mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('G1320 a copy older than a day kept over the stored save keeps what was applied since', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP[0], [...PHP.slice(1), join(root, 'tests/fixtures/ledger-reapply/window.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 120000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_reapply_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('before the takeover: both trades settled, the other copy holds the Bear, the ledger agrees', () => {
    assert.deepEqual([r.old, r.bear], ['settled', 'settled']);
    assert.deepEqual(r.writeB, { items: [], currants: 0 });
    assert.deepEqual(r.ledgerBefore, { apple: 1, cherry: 1, emotional_bear: 1 });
  });

  it('the copy saved 30 h ago gets the Bear traded 25 h ago, and the Apple it gave stays gone', () => {
    assert.deepEqual(r.kept.pack, { apple: 1, cherry: 1, emotional_bear: 1 }, 'a day back only: the Bear vanished and the Apple came back');
    assert.deepEqual(r.kept.applied, ['t-g1320-bear']);
    assert.deepEqual(r.kept.clamped, { items: [], currants: 0 });
    assert.deepEqual(r.kept.ledger, { apple: 1, cherry: 1, emotional_bear: 1 }, 'the write never takes the Bear out of the ledger');
  });

  it('a trade applied before the copy was saved is never applied twice, though its id left the copy\'s list', () => {
    assert.equal(r.kept.pack.cherry, 1);
  });

  it('a copy that names no time (since 0) looks back a day, as before', () => {
    assert.deepEqual(r.noSince.pack, { apple: 2, cherry: 1 });
  });

  it('groddle_trades has the keys the read goes through', () => {
    assert.ok(r.keys.includes('a_applied') && r.keys.includes('b_applied'), JSON.stringify(r.keys));
  });
});

describe('G1320 the takeover passes the copy\'s own time and the read is per character', { skip: skipWithoutSite }, () => {
  const read = (f) => readFileSync(join(SITE_DIR, f), 'utf8');
  it('MultiplayerSave hands reapply the copy\'s since (never later than the stored save)', () => {
    assert.match(read('src/MultiplayerSave.php'), /\$ledger->reapply\(\$user, \$entries, Ledger::takeoverSince\(is_int\(\$since\) \? \$since : 0, /);
  });
  it('reapply has no fixed day floor when the copy names its time', () => {
    const src = read('src/Ledger.php');
    const fn = src.slice(src.indexOf('public function reapply('), src.indexOf('public static function givesUnpriced('));
    assert.doesNotMatch(fn, /max\(\$since - 2, \$now - self::PENDING_FOR\)/);
    assert.match(fn, /a_id = \? AND a_applied_at >= \?/);
    assert.match(fn, /b_id = \? AND b_applied_at >= \?/);
  });
  it('minn.json declares the (id, applied_at) keys', () => {
    const t = JSON.parse(read('minn.json')).tables.groddle_trades;
    assert.ok(t.includes('KEY a_applied (a_id,a_applied_at)'));
    assert.ok(t.includes('KEY b_applied (b_id,b_applied_at)'));
  });
});
