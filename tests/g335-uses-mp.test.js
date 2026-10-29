/**
 * G335 slice 4 (Austin 2026-10-28): the earning budget refills from minutes
 * connected to the realtime server, never the wall clock; the characters
 * the site option groddle_ledger_start_empty names start at a new player's
 * zero; and Fertilidust, Fertilidust Lite, Tree Poison and its Antidote on
 * shared trees are confirmed and used through the site's ledger
 * (src/LedgerUse.php, the server's objects_uses.go) before anything grows or
 * dies. The PHP runs through the php CLI; the design is glitch-audit
 * research/coverage/g335-economy.md (section 8, slice 4 as built).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { powdersFeature } from '../public/js/features/powders-feature.js?v=g448-1';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || !hasPhp;
const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function php(op, args) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'LedgerCredits', 'Ledger', 'LedgerUse'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath, LedgerCredits, Ledger, LedgerUse};
    $in = json_decode(stream_get_contents(STDIN), true);
    $a = $in['args'];
    $out = match ($in['op']) {
      'step' => LedgerUse::step($a[0], $a[1], $a[2], $a[3]),
      'savedLeft' => LedgerUse::savedLeft($a[0], $a[1]),
      'catchUp' => LedgerUse::catchUp($a[0], ['trade' => $a[1], 'gave' => $a[2], 'got' => ['items' => [], 'currants' => 0]]),
      'isUse' => LedgerUse::isUse($a[0]),
      'onlineSeconds' => LedgerCredits::onlineSeconds($a[0], $a[1], $a[2], $a[3]),
      'event' => LedgerCredits::event($a[0], Economy::shared()),
      'onlineRefill' => Ledger::onlineRefill((float) $a[0], $a[1], (float) $a[2], (float) $a[3]),
      'startEmptyIds' => Ledger::startEmptyIds($a[0]),
      'seedFor' => Ledger::seedFor($a[0], $a[1], (float) $a[2]),
      'consts' => ['rate' => Ledger::RATE, 'new' => Ledger::NEW_BUDGET, 'most' => LedgerCredits::ONLINE_MOST, 'classes' => LedgerUse::CLASSES, 'why' => LedgerCredits::WHY],
    };
    echo json_encode($out);`;
  return JSON.parse(String(execFileSync('php', ['-r', code], { input: JSON.stringify({ op, args }) })));
}

/** A save's entries with this pack and these feature slices. */
function save(inv = {}, features = {}) {
  return { playerState: JSON.stringify({ version: 7, inventory: inv, player: { currants: 0 }, systems: { features } }) };
}

describe('connected minutes refill the budget, the wall clock does not (Ledger, LedgerCredits)', { skip }, () => {
  it('reads an online event the way credits.go writes it: an interval, no goods', () => {
    const ev = php('event', [{ id: 'cr-o-0a1b2c3d-1', user: 7, why: 'online', got: { items: [], currants: 0 }, at: 1800000060, from: 1800000000, to: 1800000060 }]);
    assert.deepEqual(ev, { id: 'cr-o-0a1b2c3d-1', user: 7, why: 'online', got: { items: [], currants: 0 }, at: 1800000060, from: 1800000000, to: 1800000060 });
    const bad = (over) => php('event', [{ id: 'cr-o-x-1', user: 7, why: 'online', got: {}, from: 1800000000, to: 1800000060, ...over }]);
    assert.equal(bad({ to: 1800000000 }), null, 'an empty interval');
    assert.equal(bad({ to: 1800000000 + 3601 }), null, 'longer than ONLINE_MOST');
    assert.equal(bad({ from: '1800000000' }), null, 'not a number');
    assert.ok(php('consts', []).why.includes('online'));
  });

  it('credits each connected second once: past the watermark, never past the site clock', () => {
    const now = 1800000100;
    assert.deepEqual(php('onlineSeconds', [1800000000, 1800000060, 0, now]), { secs: 60, to: 1800000060 });
    assert.deepEqual(php('onlineSeconds', [1800000000, 1800000060, 1800000060, now]), { secs: 0, to: 1800000060 }, 'a resend adds nothing');
    assert.deepEqual(php('onlineSeconds', [1800000030, 1800000090, 1800000060, now]), { secs: 30, to: 1800000090 }, 'an overlap counts only the new part');
    assert.deepEqual(php('onlineSeconds', [1800000000, 1800010000, 0, now]), { secs: 160, to: 1800000160 }, 'never past now + ONLINE_SKEW');
  });

  it('refills at the rate a minute, up to the capacity', () => {
    const { rate } = php('consts', []);
    assert.equal(php('onlineRefill', [0, 60, rate, 50000]), rate);
    assert.equal(php('onlineRefill', [100, 90, 100, 50000]), 250);
    assert.equal(php('onlineRefill', [49990, 600, 100, 50000]), 50000);
    assert.equal(php('onlineRefill', [10, 0, 100, 50000]), 10, 'no time, no refill');
  });

  it('the wall clock refills nothing (refilled keeps the budget as it stands)', () => {
    const src = readFileSync(join(SITE_DIR, 'src/Ledger.php'), 'utf8');
    const body = src.slice(src.indexOf('private function refilled('), src.indexOf('public static function onlineRefill('));
    assert.match(body, /return min\(\$this->capacity, max\(0\.0, \$budget\)\);/);
    assert.doesNotMatch(body, /\$now - \$at/);
  });
});

describe('users the deploy names start at a new player\'s zero (Ledger)', { skip }, () => {
  it('reads the option as a list of ids', () => {
    assert.deepEqual(php('startEmptyIds', ['1,54']), [1, 54]);
    assert.deepEqual(php('startEmptyIds', [' 1, 54 ,54,x,-3,0']), [1, 54]);
    assert.deepEqual(php('startEmptyIds', [null]), []);
    assert.deepEqual(php('startEmptyIds', ['']), []);
  });

  it('seeds them at zero with no budget, never from their saves', () => {
    const { new: fresh } = php('consts', []);
    assert.deepEqual(php('seedFor', [true, true, 50000]), { seeded: 'zeroing', budget: 0, fromSave: false });
    assert.deepEqual(php('seedFor', [true, false, 50000]), { seeded: 'zeroing', budget: 0, fromSave: false });
    assert.deepEqual(php('seedFor', [false, true, 50000]), { seeded: 'migrated', budget: 50000, fromSave: true });
    assert.deepEqual(php('seedFor', [false, false, 50000]), { seeded: 'new', budget: fresh, fromSave: false });
  });

  it('puts an already migrated ledger back to zero once, checks the next write with no budget, then gives a new player\'s budget', () => {
    const src = readFileSync(join(SITE_DIR, 'src/Ledger.php'), 'utf8');
    assert.match(src, /\(string\) \$row\['seeded'\] === 'migrated' && in_array\(\$user, \$this->startEmpty, true\)/);
    assert.match(src, /\$budget = \$zeroing \? 0\.0 :/);
    assert.match(src, /SET seeded = 'zeroed'/);
    assert.match(src, /const START_EMPTY_OPTION = 'groddle_ledger_start_empty';/);
  });

  it('the live deploy names users 1 and 54, and only there', () => {
    const deploy = read('tools/deploy/kinsta.sh');
    assert.match(deploy, /groddle_ledger_start_empty/);
    assert.match(deploy, /GRODDLE_LEDGER_START_EMPTY:-1,54/);
  });
});

describe('jars and bottles on shared trees are the ledger\'s (LedgerUse)', { skip }, () => {
  it('uses one of five charges, empties the fifth, refuses with none held', () => {
    assert.deepEqual(php('step', [1, null, null, 5]), { ok: true, left: 4, spent: false }, 'a full jar');
    assert.deepEqual(php('step', [1, 1, null, 5]), { ok: true, left: 0, spent: true }, 'the last charge');
    assert.deepEqual(php('step', [2, null, 2, 5]), { ok: true, left: 1, spent: false }, 'what the save says is left, the first time');
    assert.deepEqual(php('step', [2, 3, 1, 5]), { ok: true, left: 2, spent: false }, 'what the ledger kept wins');
    assert.deepEqual(php('step', [1, 9, null, 5]), { ok: true, left: 4, spent: false }, 'nonsense reads as a full one');
    assert.deepEqual(php('step', [0, 3, 3, 5]), { ok: false, left: 0, spent: false }, 'none held');
  });

  it('knows the four classes, five charges each, and where the game keeps the open one', () => {
    const { classes } = php('consts', []);
    assert.deepEqual(classes, {
      fertilidust: [5, 'powders', 'charges'],
      fertilidust_lite: [5, 'powders', 'charges'],
      potion_tree_poison: [5, 'tree-death', 'uses'],
      potion_tree_poison_antidote: [5, 'tree-death', 'uses'],
    });
    assert.equal(php('savedLeft', [save({}, { powders: { charges: { fertilidust: 3 } } }), 'fertilidust']), 3);
    assert.equal(php('savedLeft', [save({}, { 'tree-death': { uses: { potion_tree_poison: 2 } } }), 'potion_tree_poison']), 2);
    assert.equal(php('savedLeft', [save({}, { powders: { charges: { fertilidust: 5 } } }), 'fertilidust']), null, 'a full one is not named');
    assert.equal(php('savedLeft', [save(), 'fertilidust_lite']), null);
    assert.equal(php('isUse', ['use-0123456789abcdef']), true);
    assert.equal(php('isUse', ['party-0123456789abcdef']), false);
  });

  it('a load applies an emptied jar: out of the pack, its charges forgotten, the op applied', () => {
    const entries = save({ fertilidust: 2 }, { powders: { charges: { fertilidust: 1, fertilidust_lite: 2 } } });
    const out = JSON.parse(php('catchUp', [entries, 'use-0123456789abcdef', { items: { fertilidust: 1 }, currants: 0 }]).playerState);
    assert.equal(out.inventory.fertilidust, 1);
    assert.deepEqual(out.systems.features.powders.charges, { fertilidust_lite: 2 });
    assert.ok(out.systems.features.trade.applied.includes('use-0123456789abcdef'));
  });
});

describe('the game follows the ledger\'s word on a jar (powders-feature)', () => {
  beforeEach(() => powdersFeature._reset());

  /** A multiplayer street whose trees the server shares (sharedFertilize asks), with one jar. */
  function mpEngine(classTsid, asked = true) {
    const calls = { asked: [], receipts: [] };
    const trees = ['trant_fruit', 'trant_egg'].map((classId, i) => ({ classId, sprite: { x: i * 300 + 500, y: 400, destroyed: false }, state: { maturity: 3, health: 5 } }));
    const engine = {
      mode: 'multiplayer',
      inv: { [classTsid]: 1 },
      pc: { energy: 50, mood: 50, energyMax: 100, moodMax: 100 },
      player: { x: 500, y: 400 },
      interactables: trees,
      hasBuff: () => false,
      applyBuff: () => ({ ok: true }),
      removeBuff: () => {},
      achievement: () => {},
      playSound: () => {},
      pushActivity: () => {},
      toast: () => {},
      refreshPack: () => {},
      updateHud: () => {},
      save: () => {},
      setData: () => {},
      param: () => null,
      floatText: () => {},
      refreshTreeVisual: () => {},
      query(hook, ...args) {
        if (hook === 'sharedFertilize') return (calls.asked.push([args[0].length, args[1], args[3]]), asked ? true : null);
        if (hook === 'ledgerReceipt') return (calls.receipts.push(args[0]), true);
        return null;
      },
    };
    return { engine, calls, trees };
  }

  it('asks the server before the jar is used, and uses nothing until it answers', () => {
    const { engine, calls, trees } = mpEngine('fertilidust');
    powdersFeature.runPackVerb('fertilidust', 'disperse', engine);
    assert.deepEqual(calls.asked, [[2, false, 'fertilidust']]);
    assert.equal(powdersFeature._state().charges.fertilidust, undefined);
    assert.equal(engine.inv.fertilidust, 1);
    powdersFeature._flush(Date.now() + 3500);
    assert.equal(trees[0].state.maturity, 3, 'nothing grows before the go-ahead');
  });

  it('the go-ahead runs the verb with the charges the ledger left', () => {
    const { engine, calls, trees } = mpEngine('fertilidust');
    powdersFeature.runPackVerb('fertilidust', 'disperse', engine);
    assert.equal(powdersFeature.powderUseGranted('fertilidust', { op: 'use-0000000000000001', c: 'fertilidust', left: 2, spent: false }, engine), true);
    assert.equal(calls.asked.length, 1, 'not asked again');
    assert.equal(powdersFeature._state().charges.fertilidust, 2);
    powdersFeature._flush(Date.now() + 3500);
    assert.deepEqual(trees.map((t) => t.state.maturity), [4, 4]);
    assert.equal(calls.receipts.length, 0);
  });

  it('a jar the ledger emptied leaves the pack once, through the applied list', () => {
    const { engine, calls } = mpEngine('fertilidust_lite');
    powdersFeature.runPackVerb('fertilidust_lite', 'sprinkle', engine);
    assert.deepEqual(calls.asked, [[1, true, 'fertilidust_lite']]);
    powdersFeature.powderUseGranted('fertilidust_lite', { op: 'use-0000000000000002', c: 'fertilidust_lite', left: 0, spent: true }, engine);
    assert.deepEqual(calls.receipts, ['use-0000000000000002']);
    assert.equal(engine.inv.fertilidust_lite || 0, 0);
    assert.equal(powdersFeature._state().charges.fertilidust_lite, undefined);
  });

  it('trees that are only yours stay local: the jar runs at once, as in solo', () => {
    const { engine, calls } = mpEngine('fertilidust', false);
    powdersFeature.runPackVerb('fertilidust', 'disperse', engine);
    assert.equal(calls.asked.length, 1);
    assert.equal(powdersFeature._state().charges.fertilidust, 4);
  });

  it('a pour follows the ledger too (tree-death-feature bottleFromLedger)', () => {
    const src = read('public/js/features/tree-death-feature.js');
    assert.match(src, /if \(grant\.use\) bottleFromLedger\(engine, kind === 'poison' \? TREE_POISON : TREE_ANTIDOTE, grant\.use\);/);
    assert.match(src, /bottles\.uses\[potionClass\] = use\.spent \? 1 : Math\.min\(4, left\) \+ 1;/);
    assert.match(src, /if \(use\.spent\) engine\.query\?\.\('ledgerReceipt', String\(use\.op \|\| ''\), engine\);/);
  });
});
