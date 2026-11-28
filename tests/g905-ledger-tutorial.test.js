/**
 * G905 (#438): the tutorial's and the practice streets' gifts are credited once per character by the
 * save's own record (groddle-afternoon-site src/LedgerMath.php tutorial, tutorialGate, tutorialRows,
 * markBaseline905, run through the php CLI on made-up fixture saves). A new player's budget went on
 * the tutorial's handouts and then the island's Musicblock, the practice streets' tools and food and
 * the first apples were taken back with a budget near 0. Now each set the record opens (the newxp
 * stage, flags and first skill, the skill quest, the Funpickle's award) stands with no budget, each
 * class at most its fixed count, once; a second helping, or a set the record does not open, goes
 * through the budget.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { PRACTICE_TOOLS, TRAINING2_DRINKS, TRAINING2_FOOD } from '../public/js/newxp.js?v=eedf8fe3';
import { EZ_FOOD, EZ_KNIFE_AND_BOARD, SOIL_TOOLS } from '../public/js/practice-streets.js?v=557238c1';
import { AWARD_ITEM } from '../public/js/funpickle.js?v=95796317';
import { MUSICBLOCK_ENDGAME_GIFT, START_STREET_MUSICBLOCKS } from '../public/js/musicblocks.js?v=e4c81eb7';
import { musicblocksFeature } from '../public/js/features/musicblocks-feature.js?v=83d62f31';
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

const counts = (items = {}, currants = 0) => ({ items, currants });
function save({ inv = {}, newxp = null, active = {}, completed = [], funpickle = null, musicblocks = null } = {}) {
  const features = {};
  if (newxp) features.newxp = { v: 1, ...newxp };
  if (funpickle) features.funpickle = funpickle;
  if (musicblocks) features.musicblocks = musicblocks;
  return { playerState: JSON.stringify({ version: 7, inventory: inv, player: { currants: 0, xp: 300, level: 1 }, systems: { quests: { active, completed }, achievements: { unlocked: [] }, features } }) };
}
const credited = (tut = {}) => ({ base: { base: 1 }, level: { level: 1 }, mark: { base: 1, base905: 1 }, tut });
const tutRows = (r) => r.rows.filter((x) => x[0] === 'tut');

// A new player on the island after the Animal Kinship practice, then on EZ Cookin' and Soil Appreciation: the clamp rows' kinds.
const ISLAND = { status: 'active', stage: 'island', skill: 'animalkinship_1', flags: ['musicblock', 'gst'], musicblock: 'musicblock_x_shiny_04' };
const PICKED = { musicblock_x_shiny_04: 1, cherry: 4, bean_plain: 3, meat: 7, milk_butterfly: 2, butterfly_lotion: 1, knife_and_board: 1, hoe: 1, shovel: 1 };

const sum = (rows) => rows.reduce((m, r) => ({ ...m, [r.classTsid]: (m[r.classTsid] || 0) + r.count }), {});

describe('G905: the tutorial\'s gifts stand once per character by the save\'s record', { skip }, () => {
  it('the fixed sets match what the game hands out', () => {
    const code = `require ${JSON.stringify(SITE_DIR)} . '/src/LedgerMath.php'; echo json_encode(Groddle\\Minn\\LedgerMath::TUTORIAL_SETS);`;
    const sets = JSON.parse(String(execFileSync(PHP, ['-r', code])));
    assert.deepEqual(sets.training2.items, sum([...TRAINING2_FOOD, ...TRAINING2_DRINKS]));
    assert.deepEqual(sets.ezc.items, { ...sum([EZ_KNIFE_AND_BOARD, ...EZ_FOOD]) });
    assert.deepEqual(sets.soil.items, sum(SOIL_TOOLS));
    assert.equal(sets.ak.items[PRACTICE_TOOLS.animalkinship_1.classTsid], 1);
    assert.equal(sets.lgt.items[PRACTICE_TOOLS.light_green_thumb_1.classTsid], 1);
    assert.deepEqual(sets.funpickle.items, { [AWARD_ITEM]: 1 });
    // G938: the start street's block (its class from the record) and the 25-tune GNG gift.
    assert.deepEqual(sets.startblock, { gate: 'startblock', items: { startblock: 1 } });
    assert.deepEqual(sets.musicblockgift, { gate: 'musicblockgift', items: { [MUSICBLOCK_ENDGAME_GIFT]: 1 } });
    const re = String(execFileSync(PHP, ['-r', `require ${JSON.stringify(SITE_DIR)} . '/src/LedgerMath.php'; echo Groddle\\Minn\\LedgerMath::START_BLOCK_CLASS;`]));
    const pattern = new RegExp(re.slice(1, -1));
    const all = ['b_brown', 'd_blue', 'd_green', 'd_red', 'x_shiny'].flatMap((s) => [1, 2, 3, 4, 5].map((n) => `musicblock_${s}_0${n}`));
    assert.deepEqual(all.filter((c) => pattern.test(c)), [...START_STREET_MUSICBLOCKS].sort());
  });

  it('a new player\'s island Musicblock, practice tools, food and first harvests stand with no budget', () => {
    const r = php('check', [counts(), credited(), save({ inv: PICKED, newxp: ISLAND, active: { ezcooking_1: {}, soilappreciation_1: {} } }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts());
    assert.deepEqual(r.after.items, PICKED);
    assert.deepEqual(r.credits.detail.tutorial, PICKED);
    const rows = Object.fromEntries(tutRows(r).map(([, ref, n]) => [ref, n]));
    assert.equal(rows['islandblock:musicblock'], 1);
    assert.equal(rows['ak:meat'], 4, 'the Animal Kinship street\'s meat first');
    assert.equal(rows['ezc:meat'], 3, 'then EZ Cookin\'s');
    assert.equal(rows['soil:hoe'], 1);
  });

  it('each class only once per character: a second Hoe, or more than the set gives, goes through the budget', () => {
    const r = php('check', [counts(), credited({ 'soil:hoe': 1, 'soil:shovel': 1 }), save({ inv: { hoe: 1, shovel: 1, cherry: 10 }, newxp: ISLAND, active: { soilappreciation_1: {} } }), 0]);
    assert.deepEqual(r.after.items, { cherry: 6 });
    assert.deepEqual(r.reconciled.clamped, counts({ cherry: 4, hoe: 1, shovel: 1 }));
  });

  it('a set the record does not open gives nothing: no quest, no tutorial, a skipped tutorial', () => {
    const r = php('check', [counts(), credited(), save({ inv: { hoe: 1, knife_and_board: 1, musicblock_x_shiny_04: 1 }, newxp: { status: 'skipped', stage: 'clouds', musicblock: 'musicblock_x_shiny_04', flags: [] } }), 0]);
    assert.deepEqual(r.after.items, {});
    // The Musicblock never picked up on the island (no flag) waits as a rare find (G905's wait); the tools are taken back.
    assert.deepEqual(r.reconciled.held, { musicblock_x_shiny_04: 1 });
    assert.deepEqual(r.reconciled.clamped.items, { hoe: 1, knife_and_board: 1 });
  });

  it('the island Musicblock is only the class the record names', () => {
    const r = php('check', [counts(), credited(), save({ inv: { musicblock_d_blue_05: 1, musicblock_x_shiny_04: 1 }, newxp: ISLAND }), 0]);
    assert.deepEqual(r.after.items, { musicblock_x_shiny_04: 1 });
  });

  it('the Funpickle\'s Musicblock stands once its award is on the record', () => {
    const r = php('check', [counts(), credited(), save({ inv: { musicblock_goodnight_groddle: 1 }, funpickle: { givenAward: true } }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts());
    const no = php('check', [counts(), credited(), save({ inv: { musicblock_goodnight_groddle: 1 }, funpickle: { givenAward: false } }), 0]);
    assert.deepEqual(no.reconciled.clamped, counts({ musicblock_goodnight_groddle: 1 }));
  });

  it('G938: the start street\'s Musicblock stands once its class is on the record, and only that class', () => {
    // The game's own record: the slice musicblocks-feature saves.
    musicblocksFeature._reset();
    musicblocksFeature.restore({ startBlock: { tsid: 'GLI2V0UN7RD1T2J', classTsid: 'musicblock_d_red_01' } });
    const record = musicblocksFeature.save();
    const r = php('check', [counts(), credited(), save({ inv: { musicblock_d_red_01: 1, musicblock_d_blue_05: 1 }, musicblocks: record }), 0]);
    assert.deepEqual(r.credits.detail.tutorial, { musicblock_d_red_01: 1 });
    assert.equal(Object.fromEntries(tutRows(r).map(([, ref, n]) => [ref, n]))['startblock:startblock'], 1);
    assert.ok(!('musicblock_d_red_01' in (r.reconciled.clamped.items || {})));
    // Once per character: a second one goes through the budget (a rare find, so it waits).
    const again = php('check', [counts(), credited({ 'startblock:startblock': 1 }), save({ inv: { musicblock_d_red_01: 1 }, musicblocks: record }), 0]);
    assert.equal(again.credits.detail.tutorial?.musicblock_d_red_01, undefined);
    // No record, or a class the start street never lays (a brown block, SB-1): nothing credited.
    for (const classTsid of [null, 'musicblock_b_brown_02', 'musicblock_sb_secret_01']) {
      const no = php('check', [counts(), credited(), save({ inv: { musicblock_b_brown_02: 1 }, musicblocks: { startBlock: classTsid ? { tsid: 'GLI2V0UN7RD1T2J', classTsid } : null, gift: false } }), 0]);
      assert.equal(no.credits.detail.tutorial?.musicblock_b_brown_02, undefined, String(classTsid));
    }
  });

  it('G938: the 25-tune GNG gift stands once it is on the record', () => {
    const r = php('check', [counts(), credited(), save({ inv: { [MUSICBLOCK_ENDGAME_GIFT]: 1 }, musicblocks: { startBlock: null, gift: true } }), 0]);
    assert.deepEqual(r.reconciled.clamped, counts());
    const no = php('check', [counts(), credited(), save({ inv: { [MUSICBLOCK_ENDGAME_GIFT]: 1 }, musicblocks: { startBlock: null, gift: false } }), 0]);
    assert.deepEqual(no.reconciled.clamped, counts({ [MUSICBLOCK_ENDGAME_GIFT]: 1 }));
  });

  it('an older character\'s finished sets are marked without paying; a set under way stays open', () => {
    const rows = php('baseline', [save({ newxp: { status: 'done', stage: 'done', skill: 'ezcooking_1' }, completed: ['soilappreciation_1'], active: { animalkinship_1: {} } })]);
    const refs = rows.filter((x) => x[0] === 'tut').map((x) => x[1]);
    assert.ok(refs.includes('island:cherry') && refs.includes('ezc:knife_and_board') && refs.includes('soil:hoe'));
    assert.ok(!refs.some((x) => x.startsWith('ak:')), 'the quest under way is not marked');
    assert.ok(!refs.some((x) => x.startsWith('funpickle:')));
  });
});
