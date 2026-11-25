/**
 * G1249 (#669): a machine on an upper floor of the house goes through the site's ledger as one on
 * the ground floor does. Glitch's house was one location, every floor of it, so a machine stood and
 * ran upstairs (machine_stand.js canDrop 770-794 refuses only near another, near the ends and in an
 * instance). tests/fixtures/home-machines/ledger-machines.php posts the realtime server's signed
 * acts to groddle-afternoon-site src/HomeMachines.php on a MariaDB database it makes for the run
 * (test_groddle_machines_<hex>) and drops: set down on "house:1", run (the Planks leave the
 * ledger once, asked again nothing moves), collected (the Boards arrive), refuelled, seen by a
 * visitor's game with its place, picked up; the ground floor's machine stays where it is; G1303:
 * a place measured from where the player stands ("from"). The
 * database is the local Cove one by default (GRODDLE_TEST_MYSQL="host user password" overrides);
 * without the site, the engine, php with mysqli or a database it skips.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/home-machines-ledger.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = spawnSync('php', ['-v']).status === 0;

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

const db = mysql();
const reachable = db && hasPhp && spawnSync('php', ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skip = skipWithoutSite
  || (!hasPhp && 'no php')
  || (!existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('G1249: a machine on an upper floor of the house, through the ledger (HomeMachines)', { skip }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/home-machines/ledger-machines.php'), engine, SITE_DIR, db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_machines_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('sets one down on the second floor; the ground floor is a place of its own; a floor the house lacks is not', () => {
    assert.deepEqual([r.placeUp.status, r.placeUp.machine.place, r.placeUp.machine.rx], ['settled', 'house:1', 400]);
    assert.deepEqual([r.placeGround.status, r.placeGround.machine.place], ['settled', 'house'], 'the same x below: another room');
    assert.deepEqual([r.placeThird.status, r.placeThird.why], ['refused', 'here'], 'a two-floor house has no third floor');
    assert.equal(r.placeNear.why, 'near', '200 px from the second floor\'s machine (machine_stand.js canDrop)');
    assert.deepEqual([r.badPlace.http, r.badPlace.code], [400, 'groddle_machine_invalid']);
  });

  it('runs: the Planks leave the ledger once, the Boards come back when it is done, the tank pays', () => {
    assert.deepEqual(r.seeded[7], { fuel_cell: 2, plank: 20 });
    assert.equal(r.use.status, 'settled');
    assert.deepEqual(r.use.receipt.gave.items, [{ c: 'plank', n: 8 }]);
    assert.deepEqual(r.afterUse[7], { fuel_cell: 2, plank: 12 });
    assert.equal(r.useAgain.status, 'settled', 'the same op asked again');
    assert.deepEqual(r.afterUseAgain, r.afterUse, 'counts once');
    assert.deepEqual([r.fromBelow.status, r.fromBelow.why], ['refused', 'gone'], 'nobody acts on it from the ground floor');
    assert.deepEqual(r.collect.receipt.got.items, [{ c: 'board', n: 2 }]);
    assert.deepEqual(r.afterCollect[7], { board: 2, fuel_cell: 2, plank: 12 });
    assert.equal(r.collect.machine.fuel, 48);
    assert.equal(r.refuel.cells, 1);
    assert.deepEqual(r.afterRefuel[7], { board: 2, fuel_cell: 1, plank: 12 });
    assert.deepEqual(r.rowUp, { place: 'house:1', rx: 400, fuel: 98, status: 'placed', job: null });
    assert.deepEqual(r.afterRefuel[9], { plank: 8 }, 'the visitor\'s ledger is untouched');
  });

  it('a game asking for the home\'s machines is told each one\'s floor; an uninvited visitor is told none (G1018)', () => {
    assert.deepEqual([...r.seen].sort((a, b) => a[0].localeCompare(b[0])), [['ground', 'house', 400], ['up', 'house:1', 400]]);
    assert.deepEqual(r.uninvited, [], 'the house is for whoever may enter it');
  });

  it('picks it up from the second floor, tank and all; the ground floor\'s stays where it is', () => {
    assert.equal(r.take.status, 'settled');
    assert.deepEqual([r.take.taken.class, r.take.taken.fuel], ['woodworker', 98]);
    assert.equal(r.rowUpAfter.status, 'taken');
    assert.deepEqual(r.rowGround, { place: 'house', rx: 400, fuel: 50, status: 'placed', job: null });
  });

  it('G1303 (#669): the 200 px is from where the player stands, the machine where it was let go', () => {
    assert.deepEqual([r.fromNear.status, r.fromNear.why], ['refused', 'near'], 'standing 120 px from the one at 400, letting go 200 px from it');
    assert.deepEqual([r.noFrom.status, r.noFrom.why], ['refused', 'near'], 'no from: standing where it goes, 110 px from it');
    assert.deepEqual([r.badFrom.status, r.badFrom.why], ['refused', 'here'], 'a from that is not one');
    assert.equal(r.fromFar.status, 'settled', 'standing 210 px from it, let go 110 px from it');
    assert.deepEqual(r.rowNear, { place: 'house', rx: 290, fuel: 50, status: 'placed', job: null });
  });
});
