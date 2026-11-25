/**
 * G905 (#436, #438, #439): a rare find the earning budget is short for waits in the save instead of
 * being taken back (groddle-afternoon-site src/LedgerMath.php reconcile and check, run through the
 * php CLI on made-up fixture saves). G895 let only a capped class wait (one only drop tables give);
 * most Musicblocks are also a quest's reward, so they carried no cap and were still taken. Now any
 * class a drop table gives (economy.json d, Economy::drop) waits, and what waited is paid first on
 * the next write. A forged pile still waits only up to CAPPED_HOLD_VALUE and the rest goes; an
 * ordinary gain is taken back as before.
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

function check(ledger, credited, entries, budget) {
  const code = `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $a = json_decode(stream_get_contents(STDIN), true);
    echo json_encode(LedgerMath::check($a[0], $a[1], [], $a[2], (float) $a[3], 50000.0, Economy::shared(), null, fn (): int => 0));`;
  const out = execFileSync(PHP, ['-r', code], { input: JSON.stringify([ledger, credited, entries, budget]) });
  return JSON.parse(String(out), (k, v) => (Array.isArray(v) && !v.length && ['items', 'made', 'runs', 'capped', 'detail', 'held'].includes(k) ? {} : v));
}

const ECON = skip ? { items: {} } : JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
const HOLD = skip ? 0 : Number(/CAPPED_HOLD_VALUE = ([\d.]+);/.exec(readFileSync(join(SITE_DIR, 'src/LedgerMath.php'), 'utf8'))[1]);
const counts = (items = {}, currants = 0) => ({ items, currants });
const save = (inv) => ({ playerState: JSON.stringify({ version: 7, inventory: inv, player: { currants: 0, xp: 5000, level: 5 }, systems: { quests: { completed: [] }, achievements: { unlocked: [] } } }) });
// The level the save shows is credited, so no level-up pays into these writes; the earned records are marked.
const credited = (extra = {}) => ({ base: { base: 1 }, level: { level: 5 }, mark: { base: 1, base905: 1 }, ...extra });
const rowsOf = (r, kind) => r.rows.filter((x) => x[0] === kind);

describe('G905: a rare find waits instead of being taken back', { skip }, () => {
  it('the data marks the uncapped Musicblocks, gems and Planks as drop classes, and nothing capped or ordinary', () => {
    for (const c of ['musicblock_x_shiny_04', 'musicblock_d_blue_05', 'musicblock_b_brown_05', 'musicblock_x_shiny_03', 'gem_diamond', 'gem_moonstone', 'gem_ruby']) assert.equal(ECON.items[c].d, 1, c);
    assert.equal(ECON.items.musicblock_d_blue_03.d, undefined, 'a capped class waits by its cap already');
    // Cheap drops, and the emblems the shrine record credits (G895), never wait this way.
    for (const c of ['beam', 'plank', 'apple', 'emblem_lem']) assert.equal(ECON.items[c].d, undefined, c);
  });

  it('a Musicblock XS-4 worth 540 with 514 in the budget (the clamp rows\' shape) waits, outside the ledger', () => {
    const r = check(counts(), credited(), save({ musicblock_x_shiny_04: 1 }), 514);
    assert.deepEqual(r.reconciled.clamped, counts(), 'nothing taken');
    assert.deepEqual(r.reconciled.held, { musicblock_x_shiny_04: 1 });
    assert.deepEqual(r.after.items, {}, 'not in the ledger, so it cannot be traded or mailed yet');
    assert.deepEqual(rowsOf(r, 'held'), [['held', 'musicblock_x_shiny_04', 1]]);
  });

  it('what waited is paid first on the next write, ahead of the cheap gains that drained the budget', () => {
    // 600 in the budget, the waiting block (540) and two new Pleasing Ambers (360): smallest first would pay
    // the ambers and starve the block again; the block that waited goes first, and the ambers wait in turn.
    const r = check(counts(), credited({ held: { musicblock_x_shiny_04: 1 } }), save({ musicblock_x_shiny_04: 1, gem_amber: 2 }), 600);
    assert.deepEqual(r.after.items, { musicblock_x_shiny_04: 1 });
    assert.deepEqual(r.reconciled.held, { gem_amber: 2 });
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(rowsOf(r, 'held'), [['held', 'musicblock_x_shiny_04', 0], ['held', 'gem_amber', 2]]);
  });

  it('a forged pile waits only up to the hold\'s value; the rest is taken back', () => {
    const pile = 300;
    const r = check(counts(), credited(), save({ musicblock_d_blue_05: pile }), 0);
    const v = ECON.items.musicblock_d_blue_05.v;
    assert.equal(r.reconciled.held.musicblock_d_blue_05, Math.floor(HOLD / v));
    assert.equal(r.reconciled.clamped.items.musicblock_d_blue_05, pile - Math.floor(HOLD / v));
  });

  it('one find worth more than the whole hold waits alone, and only one', () => {
    const c = Object.keys(ECON.items).find((k) => ECON.items[k].d && ECON.items[k].v > HOLD);
    assert.ok(c, 'a drop class worth more than the hold');
    const r = check(counts(), credited(), save({ [c]: 2 }), 0);
    assert.deepEqual(r.reconciled.held, { [c]: 1 });
    assert.deepEqual(r.reconciled.clamped.items, { [c]: 1 });
  });

  it('a Gameshow Ticket dropped while mining (#438) waits, within a capped class\'s day (dcap)', () => {
    const dcap = ECON.items.gameshow_ticket.dcap;
    assert.ok(ECON.items.gameshow_ticket.d === 1 && dcap > 0);
    const r = check(counts(), credited({ mark: { base: 1, base905: 1, donations: 10 } }), save({ gameshow_ticket: 1 }), 274);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.reconciled.held, { gameshow_ticket: 1 });
    // Its day used up: a ticket through the budget is taken back however full the budget is.
    const full = check(counts(), credited({ cap: { gameshow_ticket: dcap } }), save({ gameshow_ticket: 1 }), 100000);
    assert.deepEqual(full.reconciled.clamped, counts({ gameshow_ticket: 1 }));
    const paid = check(counts(), credited(), save({ gameshow_ticket: 1 }), 1000);
    assert.deepEqual(paid.after.items, { gameshow_ticket: 1 });
    assert.deepEqual(paid.rows.filter((x) => x[0] === 'cap'), [['cap', 'gameshow_ticket', 1]]);
  });

  it('a capped class still waits only within its day\'s cap, and an ordinary gain is taken back as before', () => {
    const cap = ECON.items.musicblock_d_blue_03.cap;
    const r = check(counts(), credited({ cap: { musicblock_d_blue_03: cap } }), save({ musicblock_d_blue_03: 1, beam: 1 }), 0);
    assert.deepEqual(r.reconciled.held, {});
    assert.deepEqual(r.reconciled.clamped.items, { beam: 1, musicblock_d_blue_03: 1 });
  });

  it('a waited capped class split in two still shares one day\'s cap', () => {
    const cap = ECON.items.musicblock_d_blue_03.cap;
    const r = check(counts(), credited({ held: { musicblock_d_blue_03: 2 }, cap: { musicblock_d_blue_03: cap - 3 } }), save({ musicblock_d_blue_03: 6 }), 100000);
    assert.deepEqual(r.after.items, { musicblock_d_blue_03: 3 });
    assert.deepEqual(r.reconciled.clamped.items, { musicblock_d_blue_03: 3 });
    assert.deepEqual(rowsOf(r, 'cap'), [['cap', 'musicblock_d_blue_03', cap]]);
  });
});
