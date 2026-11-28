/**
 * G1334 (root R4): un-expanding a house gave back Glitch's parts set (inc_homes.js 2611-2630), the
 * site ledger had no credit for it, so a new character's refund was taken back ("Your pack was
 * corrected") while a long-time player's full budget kept it. A never-expanded house could be
 * un-expanded for a free refund, and the 6-7 expand / un-expand loop paid about 820 a round.
 * Siblings: taking a machine apart (the parts came back with nothing to offset them), and picking
 * up a Garden Gnome, an Icon or a Note Pole.
 *
 * Austin 2026-11-27: "refund only what the player spent". The game gives back what that expansion
 * took (home-decor.js unexpandRefund); the site banks what building took and lets it stand when it
 * comes apart, never more (LedgerMath built).
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/g1334-built-refunds.test.js
 * (the site part needs a php with mysqli and a MariaDB, as tests/r754-butler-card-waiting.test.js;
 * makes and drops test_groddle_1334_<hex> only)
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
import { createHomeDecorState, normalizeHomeDecorState, quoteInteriorUnexpand, unexpandInterior } from '../public/js/home-decor.js?v=325d9a13';
import { createFloorsState, floorCount, expandHouseFloors, quoteHouseUnexpand, unexpandHouseFloors, wallExpandItems } from '../public/js/home-floors.js?v=b50aae87';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A second floor as wide as the ground floor (as addFloor makes one). */
function addUpper(fs, ground) {
  fs.upper.push(createHomeDecorState({ wallSegments: ground.wallSegments }));
  assert.equal(floorCount(fs), 1 + fs.upper.length);
}
const ENGINE = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');

describe('G1334 game: un-expanding gives back what that expansion took', () => {
  it('a house never expanded (7 segments) un-expands to 6 for nothing', () => {
    const s = createHomeDecorState({});
    assert.equal(s.wallSegments, 7);
    assert.deepEqual(quoteInteriorUnexpand(s).items, {});
    const inv = {};
    assert.equal(unexpandInterior(s, inv).ok, true);
    assert.deepEqual(inv, {});
  });

  it('expand / un-expand loops end with the pack as it began (one and two floors, from 6 and from 7)', () => {
    for (const [two, from] of [[false, 7], [false, 6], [true, 7], [true, 6]]) {
      const fs = createFloorsState();
      const ground = createHomeDecorState({ wallSegments: from });
      if (two) addUpper(fs, ground);
      const start = { wall_segment: 20, grade_aa_earth_block: 20, girder: 20 };
      const inv = { ...start };
      for (let i = 0; i < 5; i += 1) {
        assert.equal(expandHouseFloors(fs, ground, inv).ok, true);
        assert.equal(expandHouseFloors(fs, ground, inv).ok, true);
        assert.equal(unexpandHouseFloors(fs, ground, inv).ok, true);
        assert.equal(unexpandHouseFloors(fs, ground, inv).ok, true);
      }
      assert.equal(ground.wallSegments, from);
      assert.deepEqual(inv, start, `${two ? 2 : 1} floors from ${from}`);
    }
  });

  it('a two-floor expansion gives back its Wall Segments and Urth Block, once; the record survives a reload', () => {
    const fs = createFloorsState();
    let ground = createHomeDecorState({});
    addUpper(fs, ground);
    const inv = { wall_segment: 2, grade_aa_earth_block: 1 };
    assert.equal(expandHouseFloors(fs, ground, inv).ok, true);
    ground = normalizeHomeDecorState(JSON.parse(JSON.stringify(ground)));
    assert.deepEqual(ground.paid, { 8: { wall_segment: 2, grade_aa_earth_block: 1 } });
    assert.deepEqual(quoteHouseUnexpand(fs, ground).items, { wall_segment: 2, grade_aa_earth_block: 1 });
    const back = {};
    assert.equal(unexpandHouseFloors(fs, ground, back).ok, true);
    assert.deepEqual(back, { wall_segment: 2, grade_aa_earth_block: 1 });
    assert.equal(ground.paid, undefined, 'the record goes with the segment');
  });

  it('a segment expanded before this (past seven, no record) gives back one Wall Segment', () => {
    const s = createHomeDecorState({ wallSegments: 9 });
    const inv = {};
    assert.equal(unexpandInterior(s, inv).ok, true);
    assert.deepEqual(inv, { wall_segment: 1 });
  });
});

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

describe('G1334 site: what comes back from something built stands, never more than was spent', { skip }, () => {
  let r;
  const w = (k, i) => r[k].writes[i];
  const none = (k, i) => assert.deepEqual(w(k, i).clamped.items, [], `${k} write ${i}: ${w(k, i).text}`);
  before(() => {
    r = JSON.parse(execFileSync(PHP, [...phpArgs, join(root, 'tests/fixtures/ledger-refund/g1334-built-refunds.php'), ENGINE, SITE_DIR, db.host, db.user, db.pass], { timeout: 90000 }).toString());
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true, 'throwaway database dropped');
  });

  it('a new character un-expands its two-floor house and keeps the 2 Wall Segments and Urth Block, outside the budget', () => {
    assert.equal(r.house.seeded, 'new');
    none('house', 1);
    none('house', 2);
    assert.deepEqual(w('house', 2).items, { grade_aa_earth_block: 1, wall_segment: 2 });
    assert.equal(w('house', 2).budget, w('house', 1).budget);
  });

  it('a long-time player\'s house expanded before this gives back one Wall Segment a segment, outside the budget', () => {
    assert.equal(r.legacy.seeded, 'migrated');
    none('legacy', 1);
    assert.equal(w('legacy', 1).budget, w('legacy', 0).budget);
  });

  it('a house never expanded gets nothing free: a Wall Segment the save shows is paid from the budget like any find', () => {
    assert.ok(w('never', 1).budget < w('never', 0).budget || w('never', 1).clamped.items.wall_segment === 1, JSON.stringify(r.never));
  });

  it('expand / un-expand three times nets zero; the old game\'s Glitch parts set after it is not free', () => {
    const start = w('loop', 0);
    for (let i = 1; i <= 7; i += 1) {
      none('loop', i);
      assert.equal(w('loop', i).budget, start.budget, `write ${i}`);
    }
    assert.deepEqual(w('loop', 6).items, start.items);
    assert.ok(w('loop', 8).budget < start.budget || Object.keys(w('loop', 8).clamped.items).length > 0, JSON.stringify(w('loop', 8)));
  });

  it('a machine taken apart gives back its stand and parts, outside the budget (FAILED before: the budget paid 5,175)', () => {
    for (let i = 1; i <= 4; i += 1) none('machine', i);
    assert.equal(w('machine', 4).budget, w('machine', 0).budget);
    assert.deepEqual(w('machine', 4).items, w('machine', 0).items);
  });

  it('a machine nobody paid parts for gives nothing free', () => {
    assert.ok(w('forged', 1).budget < w('forged', 0).budget || Object.keys(w('forged', 1).clamped.items).length > 0);
  });

  it('a Garden Gnome, an Icon and a Note Pole picked up again are moves (G948 already counts them where they stand)', () => {
    for (const k of ['gnome', 'icon', 'pole']) {
      none(k, 1);
      none(k, 2);
      assert.equal(w(k, 2).budget, w(k, 0).budget, k);
      assert.deepEqual(w(k, 2).items, w(k, 0).items, k);
    }
  });

  it('a note posted on a Note Pole comes back with the pole, outside the budget', () => {
    for (const k of ['poleNote']) {
      none(k, 1);
      none(k, 2);
      assert.equal(w(k, 2).budget, w(k, 0).budget, k);
      assert.deepEqual(w(k, 2).items, w(k, 0).items, k);
    }
  });

  it('the site\'s Wall Segment costs are the game\'s (wallExpandItems)', () => {
    assert.ok(r.wallCost, 'LedgerMath::wallCost');
    for (const [key, items] of Object.entries(r.wallCost)) {
      const [f, inner] = key.split(':').map(Number);
      assert.deepEqual(items, wallExpandItems(f, inner), key);
    }
  });
});
