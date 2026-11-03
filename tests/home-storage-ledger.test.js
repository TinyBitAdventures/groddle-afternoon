/**
 * Ticket 51 (G404): buying from a Storage Display Box and a key-holder's
 * cabinet moves go through the site's ledger (groddle-afternoon-site
 * src/LedgerBoxes.php) in one transaction, read the price and the stock from
 * the stored box, settle once per op, cannot overdraw or sell what is not
 * there, refuse a player the owner blocks, and work with the owner offline:
 * the owner's save takes each purchase out of that very box when it loads
 * (Ledger::catchUp). The source is GSJS items/bag_furniture_sdb.js sellItem
 * 1139-1278 and collect_currants 804-853.
 *
 * tests/fixtures/home-storage/ledger-boxes.php runs the site's classes on a
 * MariaDB database it makes for the run (test_groddle_boxes_<hex>) and drops;
 * two buyers race for the last plum in two processes. The database is the
 * local Cove one by default (GRODDLE_TEST_MYSQL="host user password"
 * overrides); without the site, the engine, php or a database it skips.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/home-storage-ledger.test.js
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

describe('a Storage Display Box sells through the ledger (LedgerBoxes)', { skip }, () => {
  let r;
  before(() => {
    const out = execFileSync('php', [join(root, 'tests/fixtures/home-storage/ledger-boxes.php'), engine, SITE_DIR, 'run', db.host, db.user, db.pass], { timeout: 90000 }).toString();
    r = JSON.parse(out);
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_boxes_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('the owner prices only a box with something in it; a visitor sees the price and the stock', () => {
    assert.deepEqual(r.price, { chair: 'groddle_box_here', missing: 'groddle_box_here', set: null, plum: null });
    assert.deepEqual(r.shown, [{ uid: 4, class: 'apple', price: 12, stock: 10 }, { uid: 6, class: 'plum', price: 5, stock: 1 }]);
    // The ledger counted the cabinet's 3 apples and the box's 10 as the owner's.
    assert.equal(r.seeded[7].items.apple, 13);
  });

  it('a purchase moves the currants and the things between the two ledgers, and the currants wait on the box', () => {
    assert.deepEqual(r.buy, { status: 'settled', class: 'apple', uid: 4, n: 5, price: 12, total: 60, stock: 5 });
    assert.equal(r.afterBuy[9].currants, 40);
    assert.equal(r.afterBuy[9].items.apple, 5);
    assert.equal(r.afterBuy[7].items.apple, 8);
    assert.equal(r.afterBuy[7].currants, 0, 'the owner is paid only when they collect');
  });

  it('settles once per op: asked again it answers the same and nothing moves', () => {
    assert.equal(r.again.status, 'settled');
    assert.equal(r.again.again, true);
    assert.equal(r.again.n, 5);
    assert.equal(r.againTrades, 0);
    assert.deepEqual(r.afterAgain, r.afterBuy);
    assert.equal(r.someoneElsesOp.status, 'refused', 'another buyer cannot claim an op');
  });

  it('refuses an overdraw, a price that is not the box\'s (either way), zero, a blocked buyer and the owner, moving nothing', () => {
    assert.equal(r.overdraw.why, 'short');
    assert.equal(r.overdraw.text, "Sorry, you can't afford that.");
    for (const k of ['underpay', 'overpay']) {
      assert.equal(r[k].why, 'price', k);
      assert.equal(r[k].text, 'Oops, the price appears to have changed underneath you. Please try your purchase again.');
    }
    assert.equal(r.zero.text, "You can't buy a negative/zero amount of things!");
    assert.equal(r.blocked.why, 'blocked');
    assert.equal(r.own.why, 'own');
    assert.deepEqual(r.afterRefusals, r.afterBuy);
  });

  it('cuts a count to what is left, then the sold-out box stops selling', () => {
    assert.equal(r.moreThanStock.status, 'settled');
    assert.equal(r.moreThanStock.n, 5);
    assert.equal(r.moreThanStock.total, 60);
    assert.equal(r.moreThanStock.stock, 0);
    assert.equal(r.soldOut.text, 'Oops, that store is no longer selling.');
    assert.equal(r.afterSoldOut[10].currants, 940);
    const box = r.mine.boxes.find((b) => b.uid === 4);
    assert.deepEqual(box, { uid: 4, class: 'apple', price: 12, selling: false, income: 120, stock: 0 });
    assert.equal(r.mine.ops.length, 2, 'the owner\'s side of both purchases waits for their save');
    assert.ok(r.mine.ops.every((o) => /^sdb-[0-9a-f]{16}-o$/.test(o.op) && o.kind === 'buy'));
  });

  it('is atomic: a request that dies part way leaves no trace', () => {
    assert.equal(r.rolledBack, true);
  });

  it('two buyers of the last one at once: one gets it, the other is told it is gone', () => {
    const settled = r.race.filter((x) => x.status === 'settled');
    const refused = r.race.filter((x) => x.status === 'refused');
    assert.equal(settled.length, 1, JSON.stringify(r.race));
    assert.equal(refused.length, 1, JSON.stringify(r.race));
    assert.equal(r.afterRace[7].items.plum, undefined, 'the owner has none left');
    assert.equal((r.afterRace[9].items.plum || 0) + (r.afterRace[10].items.plum || 0), 1, 'and exactly one buyer has it');
  });

  it('the owner, offline all along, loads: each purchase came out of that very box, and the save matches the ledger', () => {
    assert.equal(r.caughtUp.changed, true);
    assert.equal(r.caughtUp.boxes[4], null);
    assert.equal(r.caughtUp.boxes[6], null);
    assert.equal(r.caughtUp.applied.length, 3);
    assert.deepEqual(r.ownerWrite.clamped, { items: [], currants: 0 });
    assert.deepEqual(r.ownerWrite.pendingAfter, []);
    assert.equal(r.holdings.items.apple, 3, 'the cabinet\'s apples are still the owner\'s');
  });

  it('collect_currants pays the box\'s income once per collection', () => {
    assert.equal(r.collect.status, 'collected');
    assert.equal(r.collect.currants, 120);
    assert.match(r.collect.credit, /^sdbc-[0-9a-f]{16}$/);
    assert.deepEqual({ ...r.collectAgain, status: 'collected' }, r.collect, 'asked again: the same answer');
    assert.equal(r.collectAgain.status, 'done');
    assert.equal(r.collectNothing, null);
    assert.equal(r.collectNotYours, null);
    assert.equal(r.afterCollect[7].currants, 120);
  });

  it('a key-holder takes from and puts into the cabinet; nobody else can, nor a blocked key-holder, nor with tools', () => {
    const c = r.cabinet;
    assert.equal(c.noKey.why, 'key');
    assert.equal(c.blocked.why, 'blocked');
    assert.equal(c.take.status, 'settled');
    assert.equal(c.take.n, 2);
    assert.deepEqual(c.take.contents[0], { classTsid: 'apple', count: 1 });
    assert.equal(c.takeAgain.again, true);
    assert.equal(c.takeTooMany.n, 1, 'cut to what the slot holds');
    assert.equal(c.tool.why, 'tool');
    assert.equal(c.put.status, 'settled');
    assert.deepEqual(c.put.contents[2], { classTsid: 'cherry', count: 4 });
    assert.equal(c.putMore.why, 'short', 'only what their ledger holds');
    assert.equal(c.notCabinet.status, 'refused');
    assert.equal(r.afterCabinet[11].items.apple, 3);
    assert.equal(r.afterCabinet[11].items.cherry, 1);
    assert.equal(r.afterCabinet[7].items.apple, undefined);
    assert.equal(r.afterCabinet[7].items.cherry, 4);
    assert.deepEqual(r.cabinetCaughtUp.filter(Boolean), [{ classTsid: 'cherry', count: 4 }], 'the owner\'s load moved the very stacks');
  });
});
