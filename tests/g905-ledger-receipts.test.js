/**
 * G905 (#436, #438, #439): what a write made from the realtime server's outcomes it never showed as
 * themselves (groddle-afternoon-site src/LedgerMath.php check, fromPool with $pool false, run
 * through the php CLI on made-up fixture saves). Chunks mined from a shared rock (a receipt) and
 * smelted or crushed before the save was written show only as Plain Metal or elements: the receipt
 * covered no gain and the budget paid for the ingots. Now the unused receipts stand for what a
 * transform made of them, and are used up; more than the receipts make is still taken back.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const hasPhp = HAS_PHP;
const skip = skipWithoutSite || !hasPhp;

function check(ledger, entries, budget, receipts) {
  const code = `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $a = json_decode(stream_get_contents(STDIN), true);
    $credited = ['base' => ['base' => 1], 'level' => ['level' => 5], 'mark' => ['base' => 1, 'base905' => 1]];
    echo json_encode(LedgerMath::check($a[0], $credited, [], $a[1], (float) $a[2], 50000.0, Economy::shared(), $a[3], fn (): int => 0, 1763319600));`;
  const out = execFileSync(PHP, ['-r', code], { input: JSON.stringify([ledger, entries, budget, receipts]) });
  return JSON.parse(String(out), (k, v) => (Array.isArray(v) && !v.length && ['items', 'made', 'runs', 'capped', 'detail', 'held', 'spent'].includes(k) ? {} : v));
}

const counts = (items = {}, currants = 0) => ({ items, currants });
const save = (inv) => ({ playerState: JSON.stringify({ version: 7, inventory: inv, player: { currants: 0, xp: 5000, level: 5 }, systems: { quests: { completed: [] }, achievements: { unlocked: [] } } }) });

describe('G905: a write\'s transforms may use the realtime server\'s receipts it did not show', { skip }, () => {
  it('Metal Rock mined from a shared rock and smelted in the same write: the ingots stand, the receipt is used', () => {
    const r = check(counts(), save({ plain_metal: 10 }), 0, counts({ metal_rock: 50 }));
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, { plain_metal: 10 });
    assert.deepEqual(r.inputs, counts({ metal_rock: 50 }));
    assert.deepEqual(r.credits.detail['made from receipts'], { plain_metal: 10 });
  });

  it('Sparkly mined and crushed: the elements stand from the chunks the server gave', () => {
    const r = check(counts(), save({ element_blue: 8, element_green: 2, element_red: 10, element_shiny: 12 }), 0, counts({ sparkly: 2 }));
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.inputs, counts({ sparkly: 2 }));
  });

  it('a receipt the save shows as itself is covered as before and makes nothing', () => {
    const r = check(counts(), save({ metal_rock: 50 }), 0, counts({ metal_rock: 50 }));
    assert.deepEqual(r.allowed, counts({ metal_rock: 50 }));
    assert.deepEqual(r.inputs, counts());
  });

  it('more ingots than the receipts make are taken back', () => {
    const r = check(counts(), save({ plain_metal: 13 }), 0, counts({ metal_rock: 50 }));
    assert.deepEqual(r.after.items, { plain_metal: 10 });
    assert.deepEqual(r.reconciled.clamped, counts({ plain_metal: 3 }));
  });

  it('no receipt, no help: a pile of ingots from nowhere goes through the budget', () => {
    assert.deepEqual(check(counts(), save({ plain_metal: 5 }), 0, null).reconciled.clamped, counts({ plain_metal: 5 }));
  });
});
