/**
 * G1224 (report #655; Austin 2026-11-24: "move the old floor drops to the shared floor, as Glitch").
 * Before shared house floors (G1190) every drop in a house stayed in its owner's save, and after it
 * those old stacks read as the owner's locked decor. In Glitch a stack on a house's floor was anyone's
 * once its dropper walked away (GameServerJS items/include/takeable.js 29-44, 157-213); only one the
 * owner set on a furniture plat was locked (house_lock, 33-36, 179-198).
 *
 * The site's HouseFloors moves each save's floor stacks there (no `on`, not marked `decor`) to the
 * shared floor once, on the owner's first load, as drops of the owner's already applied: the ledger
 * and the save lose them in one transaction. tests/fixtures/drops/house-floors.php runs it on a
 * throwaway MariaDB with a big house (116 stacks, as the busiest live ones): moved once, a second run,
 * a window kept over the old copy (Ledger::reapply), the next writes, a pickup, then a revert.
 * The realtime server's side (finding the moved stacks when someone joins) is drops_test.go
 * TestJoiningAHouseFindsStacksTheSiteMovedThere.
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

/** A PHP with mysqli: the one on PATH, else one that loads the module. */
function php() {
  for (const cmd of [[PHP_BIN], [PHP_BIN, '-d', 'extension=mysqli']]) {
    if (spawnSync(cmd[0], [...cmd.slice(1), '-r', 'exit(function_exists("mysqli_report") ? 0 : 1);']).status === 0) return cmd;
  }
  return null;
}

const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const PHP = php();
const db = mysql();
const reachable = db && PHP && spawnSync(PHP[0], [...PHP.slice(1), '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!PHP && 'no php with mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('a big house\'s old floor drops move to the shared floor once (HouseFloors)', { skip: skipDb }, () => {
  let r;
  before(() => {
    const out = execFileSync(PHP[0], [...PHP.slice(1), join(root, 'tests/fixtures/drops/house-floors.php'), engineDir, SITE_DIR, 'run', db.host, db.user, db.pass], { timeout: 120000 }).toString();
    r = JSON.parse(out);
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_floors_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('every floor stack moves; what is on furniture, a Decoration Mode placement, a note, a full bag and unlike tools stay', () => {
    assert.equal(r.plan.moves, 100);
    assert.deepEqual(r.plan.kept, { furniture: 8, decor: 1, note: 1, bag: 1, wear: 1 });
    assert.deepEqual(r.apply, { moved: 100 });
    assert.deepEqual(r.after.left, { RH_HOME_INT: 12, RH_HOME_EXT: 1 }, 'the Tower floor emptied, the home street untouched');
    assert.equal(r.after.ground, 100);
    assert.deepEqual([r.after.groundHouse, r.after.groundTower], [97, 3]);
    assert.equal(r.after.pickWear, 55, 'a tool keeps its wear');
  });

  it('nothing is made or lost: the ledger, the save and the floor add up, and the move is already applied', () => {
    for (const c of Object.keys(r.before.ledger)) {
      assert.equal((r.after.ledger[c] || 0) + (r.after.onGround[c] || 0), r.before.ledger[c], c);
    }
    assert.deepEqual(r.after.holdings, r.after.ledger);
    assert.equal(r.after.unapplied, 0, 'no drop for the game to take out of the pack');
    assert.equal(r.after.pending, 0);
    assert.equal(r.after.version, 2);
    assert.equal(r.after.writer, '', 'a window open on the old copy is asked before it writes again');
  });

  it('once: a second run or load moves nothing more', () => {
    assert.deepEqual(r.again, { moved: 0 });
    assert.equal(r.againLoad, false);
    assert.equal(r.againTrades, 0);
    assert.equal(r.againGround, 100);
  });

  it('a window kept over the moved copy loses the same rows from its floor, never its pack, and writes clean', () => {
    assert.deepEqual(r.takeover.left, r.after.left);
    assert.deepEqual(r.takeover.pack, { apple: 2 });
    assert.deepEqual(r.takeover.holdings, r.after.ledger);
    assert.deepEqual(r.takeoverWrite, { items: [], currants: 0 });
    assert.deepEqual(r.ownerWrite, { items: [], currants: 0 });
  });

  it('put back while unconfirmed: what is still on the ground returns to the save; a stack picked up since stays picked up', () => {
    assert.equal(r.visitorTake.status, 'settled');
    assert.deepEqual(r.revert, { back: 99, gone: 1, done: true });
    assert.equal(r.reverted.ground, 0);
    assert.deepEqual(r.reverted.holdings, r.reverted.ledger);
    assert.equal(r.reverted.ledger.apple + r.reverted.visitor.apple, r.before.ledger.apple);
    assert.deepEqual(r.reverted.write, { items: [], currants: 0 });
    assert.deepEqual(r.revertAgain, { back: 0, gone: 0, done: false });
  });
});

describe('where the move runs', { skip: skipWithoutSite }, () => {
  const read = (f) => readFileSync(join(SITE_DIR, f), 'utf8');
  it('on the owner\'s load, inside the save\'s transaction, and a kept copy\'s catch-up takes the row off its floor', () => {
    assert.match(read('src/MultiplayerSave.php'), /HouseFloors::onLoad\(\$db, \$ledger, \(int\) \$user, \$caught\['entries'\], time\(\)\)/);
    assert.match(read('src/Ledger.php'), /\(\$move = HouseFloors::moveOf\(\$this->db, \$user, \$p\['trade'\]\)\) !== null => HouseFloors::catchUp\(\$entries, \$move\)/);
    assert.ok(JSON.parse(read('minn.json')).tables.groddle_house_floors, 'the table that marks each save moved, with its backup');
  });
});
