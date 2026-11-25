/**
 * G905 (#436, #438, #439): timed production across save writes (groddle-afternoon-site
 * src/LedgerMath.php check, poolOf, fromPool, poolRows, run through the php CLI on made-up fixture
 * saves). A Community Machine Room's machine takes a job's ingredients when it starts and hands the
 * output over on Collect (js/features/machine-rooms-feature.js startJob / collect), and a seed
 * planted gives its crop when picked: the inputs leave in one write and the output comes in a later
 * one. The spent inputs of a timed transform (economy.json w) wait in the ledger's pool, and the
 * later write's output stands against them with no budget. Output beyond what the inputs make is
 * still taken back, inputs sold for their value leave nothing in the pool, and the pool forgets
 * after POOL_HOURS.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const hasPhp = HAS_PHP;
const skip = skipWithoutSite || !hasPhp;

function check(ledger, credited, entries, budget, now) {
  const code = `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $a = json_decode(stream_get_contents(STDIN), true);
    echo json_encode(LedgerMath::check($a[0], $a[1], [], $a[2], (float) $a[3], 50000.0, Economy::shared(), null, fn (): int => 0, (int) $a[4]));`;
  const out = execFileSync(PHP, ['-r', code], { input: JSON.stringify([ledger, credited, entries, budget, now]) });
  return JSON.parse(String(out), (k, v) => (Array.isArray(v) && !v.length && ['items', 'made', 'runs', 'capped', 'detail', 'held', 'spent'].includes(k) ? {} : v));
}

const ECON = skip ? { items: {}, transforms: [] } : JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
const POOL_HOURS = skip ? 0 : Number(/POOL_HOURS = (\d+);/.exec(readFileSync(join(SITE_DIR, 'src/LedgerMath.php'), 'utf8'))[1]);
const counts = (items = {}, currants = 0) => ({ items, currants });
const save = (inv, currants = 0) => ({ playerState: JSON.stringify({ version: 7, inventory: inv, player: { currants, xp: 5000, level: 5 }, systems: { quests: { completed: [] }, achievements: { unlocked: [] } } }) });
const credited = (extra = {}) => ({ base: { base: 1 }, level: { level: 5 }, mark: { base: 1, base905: 1 }, ...extra });
const poolRows = (r) => r.rows.filter((x) => x[0] === 'pool');
const poolFrom = (r) => ({ pool: Object.fromEntries(poolRows(r).map(([, ref, n]) => [ref, n])) });

// 2026-11-16 19:00 UTC, the hour stamp "2026111619"; the collect an hour later.
const T0 = Date.UTC(2026, 10, 16, 19, 5) / 1000;
const T1 = T0 + 3600;
const H0 = '2026111619';

describe('G905: timed production stands against the inputs an earlier write spent', { skip }, () => {
  it('the data marks the machines\' recipes and the garden seeds as timed', () => {
    const by = Object.fromEntries(ECON.transforms.map((t) => [t.s, t]));
    for (const s of ['recipe:girder', 'recipe:beam', 'recipe:wood_post', 'recipe:board', 'recipe:fuel_cell', 'recipe:grade_aa_earth_block', 'garden:seed_cucumber', 'garden:seed_corn', 'garden:seed_parsnip', 'garden:seed_potato']) {
      assert.equal(by[s]?.w, 1, s);
    }
    assert.equal(by['recipe:plain_metal'].w, undefined, 'the Smelter makes in your hands: same write');
  });

  it('a Metal Machine job: the ingredients leave in one write and wait in the pool', () => {
    const r = check(counts({ plain_metal: 12, molybdenum: 8 }), credited(), save({}), 0, T0);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.reconciled.spent, { molybdenum: 8, plain_metal: 12 });
    assert.deepEqual(poolRows(r), [['pool', `molybdenum@${H0}`, 8], ['pool', `plain_metal@${H0}`, 12]]);
  });

  it('the Girder collected a later write stands with no budget, and the inputs are used up', () => {
    const w1 = check(counts({ plain_metal: 12, molybdenum: 8 }), credited(), save({}), 0, T0);
    const r = check(w1.after, credited(poolFrom(w1)), save({ girder: 1 }), 0, T1);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { girder: 1 });
    assert.deepEqual(r.credits.detail.timed, { girder: 1 });
    assert.deepEqual(poolRows(r), [['pool', `molybdenum@${H0}`, 0], ['pool', `plain_metal@${H0}`, 0]]);
  });

  it('a forged collect beyond the inputs is still taken back', () => {
    const w1 = check(counts({ plain_metal: 12, molybdenum: 8 }), credited(), save({}), 0, T0);
    const r = check(w1.after, credited(poolFrom(w1)), save({ girder: 3 }), 0, T1);
    assert.deepEqual(r.after.items, { girder: 1 });
    assert.deepEqual(r.reconciled.clamped, counts({ girder: 2 }));
  });

  it('a chain across three writes (Planks to Boards to Wood Posts) stands from the first write\'s Planks', () => {
    // W1 loads 64 Planks (16 Boards); W2 collects the Boards and loads them at once (no change seen); W3 collects 4 Posts.
    const w1 = check(counts({ plank: 64 }), credited(), save({}), 0, T0);
    const r = check(w1.after, credited(poolFrom(w1)), save({ wood_post: 4 }), 0, T1);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { wood_post: 4 });
  });

  it('inputs sold for their value leave nothing in the pool, so a later Girder goes through the budget', () => {
    const value = 12 * ECON.items.plain_metal.v + 8 * ECON.items.molybdenum.v;
    const w1 = check(counts({ plain_metal: 12, molybdenum: 8 }), credited(), save({}, value), 0, T0);
    assert.deepEqual(w1.after.currants, value);
    assert.deepEqual(poolRows(w1), []);
    const r = check(w1.after, credited(poolFrom(w1)), save({ girder: 1 }, value), 0, T1);
    assert.deepEqual(r.reconciled.clamped, counts({ girder: 1 }));
  });

  it('a loss nothing timed takes (food eaten) never enters the pool', () => {
    const r = check(counts({ cherry: 20 }), credited(), save({}), 0, T0);
    assert.deepEqual(poolRows(r), []);
  });

  it('seeds planted in one write and the crop picked in a later one stand, a Super Harvest too', () => {
    const w1 = check(counts({ seed_cucumber: 2, seed_corn: 1 }), credited(), save({}), 0, T0);
    // One seed stands for the most one plot gives (a Super Harvest); an ordinary pick is less.
    const crop = ECON.transforms.find((t) => t.s === 'garden:seed_cucumber').o.cucumber;
    const big = ECON.transforms.find((t) => t.s === 'garden:seed_corn').o.corn;
    const r = check(w1.after, credited(poolFrom(w1)), save({ cucumber: 2 * crop, corn: big }), 0, T1);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { corn: big, cucumber: 2 * crop });
    const forged = check(w1.after, credited(poolFrom(w1)), save({ corn: big + 5 }), 0, T1);
    assert.deepEqual(forged.reconciled.clamped, counts({ corn: 5 }));
  });

  it('a failed job\'s ingredients collected back stand as themselves', () => {
    const w1 = check(counts({ plain_metal: 12, molybdenum: 8 }), credited(), save({}), 0, T0);
    const r = check(w1.after, credited(poolFrom(w1)), save({ plain_metal: 12, molybdenum: 8 }), 0, T1);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { molybdenum: 8, plain_metal: 12 });
  });

  it('spent inputs are forgotten after POOL_HOURS', () => {
    const w1 = check(counts({ plain_metal: 12, molybdenum: 8 }), credited(), save({}), 0, T0);
    const late = T0 + (POOL_HOURS + 1) * 3600;
    const r = check(w1.after, credited(poolFrom(w1)), save({ girder: 1 }), 0, late);
    assert.deepEqual(r.reconciled.clamped, counts({ girder: 1 }));
    assert.deepEqual(poolRows(r), [['pool', `molybdenum@${H0}`, 0], ['pool', `plain_metal@${H0}`, 0]]);
  });

  it('a write that spends and collects at once keeps the rest for later, oldest used first', () => {
    const w1 = check(counts({ plank: 8 }), credited(), save({}), 0, T0);
    // An hour later: collects 2 Boards (8 Planks' worth) and loads 4 more Planks.
    const r = check(LedgerMathAdd(w1.after, { plank: 4 }), credited(poolFrom(w1)), save({ board: 2 }), 0, T1);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(poolRows(r), [['pool', `plank@${H0}`, 0], ['pool', 'plank@2026111620', 4]]);
  });
});

function LedgerMathAdd(ledger, items) {
  const out = { items: { ...ledger.items }, currants: ledger.currants };
  for (const [c, n] of Object.entries(items)) out.items[c] = (out.items[c] || 0) + n;
  return out;
}
