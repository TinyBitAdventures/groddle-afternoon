/**
 * G905 (#439): an Elemental Pouch's Shake is credited from the save's pouch record (groddle-afternoon-
 * site src/LedgerMath.php earned, marks, markBaseline905, run through the php CLI on made-up fixture
 * saves). A shake adds up to 12% of each element the pouch holds (js/elemental-pouch.js shakeElement;
 * GSJS bag_elemental_pouch.js doShake 669-690), hundreds of elements at once, which a drained budget
 * took back. Each shake the record gained stands with no budget, up to round(min(5,000, held) x the
 * card's best delta) per element, a few a day; no card, no new shake or a forged pile past that goes
 * through the budget.
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

function php(op, args) {
  const code = `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $in = json_decode(stream_get_contents(STDIN), true);
    $a = $in['args'];
    echo json_encode(match ($in['op']) {
      'check' => LedgerMath::check($a[0], $a[1], [], $a[2], (float) $a[3], 50000.0, Economy::shared(), null, fn (): int => 0, 1763319600),
      'baseline' => LedgerMath::markBaseline905($a[0]),
    });`;
  const out = execFileSync(PHP, ['-r', code], { input: JSON.stringify({ op, args }) });
  return JSON.parse(String(out), (k, v) => (Array.isArray(v) && !v.length && ['items', 'made', 'runs', 'capped', 'detail', 'held', 'spent'].includes(k) ? {} : v));
}

const SHAKE_DAILY = skip ? 0 : Number(/const SHAKE_DAILY = (\d+);/.exec(readFileSync(join(SITE_DIR, 'src/LedgerMath.php'), 'utf8'))[1]);
const counts = (items = {}, currants = 0) => ({ items, currants });
function save({ inv = {}, shakes = 0, cards = ['element_handling_bonus_2'] } = {}) {
  return { playerState: JSON.stringify({ version: 7, inventory: inv, player: { currants: 0, xp: 5000, level: 5, imaginationUpgrades: cards }, systems: { quests: { completed: [] }, achievements: { unlocked: [] }, features: { 'elemental-pouch': { version: 1, shakeDay: '', shakes } } } }) };
}
const credited = (mark = {}, markday = {}) => ({ base: { base: 1 }, level: { level: 5 }, mark: { base: 1, base905: 1, ...mark }, markday });
const HELD = { element_blue: 4060, element_shiny: 5500, bag_elemental_pouch: 1 };

describe('G905: the ledger credits an Elemental Shake from the pouch record', { skip }, () => {
  it('marks the pouch\'s shakes once for a character the G895 baseline already saw, without paying', () => {
    assert.deepEqual(php('baseline', [save({ shakes: 12 })]), [['mark', 'base905', 1], ['mark', 'shakes', 12]]);
  });

  it('a Super Elemental Shake (406 Blue, 550 Shiny: the clamp rows\' shape) stands with no budget', () => {
    const r = php('check', [counts(HELD), credited({ shakes: 3 }), save({ inv: { ...HELD, element_blue: 4466, element_shiny: 6050 }, shakes: 4 }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.credits.detail.earned, { element_blue: 406, element_shiny: 550 });
    assert.ok(r.rows.some((x) => x[0] === 'mark' && x[1] === 'shakes' && x[2] === 4));
    assert.ok(r.rows.some((x) => x[0] === 'markday' && x[1] === 'shake' && x[2] === 1));
  });

  it('more than the best delta of what was held is taken back', () => {
    // round(4060 x 0.12) = 487; a pouch slot holds 5,000, so Shiny allows round(5000 x 0.12) = 600.
    const r = php('check', [counts(HELD), credited({ shakes: 3 }), save({ inv: { ...HELD, element_blue: 5060, element_shiny: 6200 }, shakes: 4 }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts({ element_blue: 1000 - 487, element_shiny: 700 - 600 }));
  });

  it('with the plain card the delta is at most 6%', () => {
    const r = php('check', [counts(HELD), credited({ shakes: 3 }), save({ inv: { ...HELD, element_blue: 4466 }, shakes: 4, cards: ['element_handling_bonus_1'] }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts({ element_blue: 406 - 244 }));
  });

  it('no new shake on the record, or no card, and the elements go through the budget', () => {
    assert.deepEqual(php('check', [counts(HELD), credited({ shakes: 4 }), save({ inv: { ...HELD, element_blue: 4466 }, shakes: 4 }), 0]).reconciled.clamped, counts({ element_blue: 406 }));
    assert.deepEqual(php('check', [counts(HELD), credited({ shakes: 3 }), save({ inv: { ...HELD, element_blue: 4466 }, shakes: 4, cards: [] }), 0]).reconciled.clamped, counts({ element_blue: 406 }));
  });

  it('a forged record allows only the day\'s shakes', () => {
    const r = php('check', [counts(HELD), credited({ shakes: 3 }, { shake: SHAKE_DAILY }), save({ inv: { ...HELD, element_blue: 4466 }, shakes: 400 }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts({ element_blue: 406 }));
  });
});
