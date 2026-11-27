/**
 * Report #754: leaving several Get Out of Hell Free Cards with a friend's Butler was refused "You don't
 * have that any more."; one card was accepted.
 *
 * The ledger credits at most 3 purchases of a repeatable imagination card a UTC day (LedgerMath
 * CARD_DAILY) and lets the rest wait in the pack outside it. ButlerParcels::take checked the ledger
 * alone and answered "short"; since #691 every other act asks Ledger::waitingFor first and answers
 * "waiting" with words saying when they clear. The Butler (and a key-holder's cabinet put,
 * LedgerBoxes::cabinetMove) now ask too. Glitch had no such count (bag_butler.js 3781 took the stack).
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/r754-butler-card-waiting.test.js
 * (needs a php with mysqli and a MariaDB, as tests/r691-emblem-wait.test.js; makes and drops
 * test_groddle_754_<hex> only)
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = SITE_DIR;
const ENGINE = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');

function mysql() {
  const env = process.env.GRODDLE_TEST_MYSQL;
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const src = readFileSync(cfg, 'utf8');
  const def = (k) => (src.match(new RegExp(`define\\(\\s*'${k}'\\s*,\\s*'([^']*)'`)) || [])[1];
  return def('DB_HOST') && def('DB_USER') ? { host: def('DB_HOST'), user: def('DB_USER'), pass: def('DB_PASSWORD') || '' } : null;
}

const db = mysql();
const phpArgs = HAS_PHP && spawnSync(PHP, ['-r', 'exit(class_exists("mysqli") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=mysqli'] : [];
const reachable = db && HAS_PHP && spawnSync(PHP, [...phpArgs, '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skip = skipWithoutSite || (!HAS_PHP && 'no php') || (!db && 'no database') || (!reachable && 'database not reachable') || (!existsSync(join(ENGINE, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)');

describe('#754: several waiting Get Out of Hell Free Cards left with a friend\'s Butler', { skip }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [...phpArgs, join(root, 'tests/fixtures/butler/butler-card-waiting.php'), ENGINE, SITE, db.host, db.user, db.pass], { timeout: 90000 }).toString());
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true, 'throwaway database dropped');
  });

  it('setup: 5 bought today, the ledger holds 3, 2 wait (CARD_DAILY), nothing clamped', () => {
    assert.equal(r.ledgerCards, 3);
    assert.equal(r.waitday, 2);
    assert.deepEqual(r.clamped.items, []);
    assert.equal(r.waitingFor5?.why, 'waiting', 'Ledger::waitingFor knows the 2 wait');
  });

  it('leaving all 5 says they are waiting (as drop/gift/trade/mail/auction do), not "You don\'t have that any more."', () => {
    assert.equal(r.leave5.why, 'waiting', JSON.stringify(r.leave5)); 
    assert.notEqual(r.leave5.text, "You don't have that any more.");
  });

  it('one card (within the ledger) is accepted, as the player found', () => {
    assert.equal(r.leave1.status, 'settled');
    assert.equal(r.ledgerCardsAfter, 2);
  });
});
