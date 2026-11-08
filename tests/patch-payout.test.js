/**
 * G564 slice 3: the one-time hand-over of players' own street Patches (site src/PatchPayout.php,
 * the plan's section 10, option B from the live count): one winner per Patch for the realtime
 * server's seed file (patches_seed.go), every other planted plot refunded by mail (option A), and
 * the runner tools/patches/payout.mjs. The route itself runs against a real site in the lane's
 * local proof; here the pure rules run through PHP.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { HAS_SITE, SITE_DIR, sitePath } from '../tools/repos.mjs';
import { seedFile } from '../tools/patches/payout.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const PENTAL = 'GA9118S28492QCL';
const DOON = 'GLIF37ASJFE1AVQ';
const OLD_MAIN = 'GM4103L52ID23';

const tree = (classId, maturity, health, fruitCount, extra = {}) => ({
  classTsid: 'patch', kind: 'patch', stage: 'tree', since: 1000, seedling: null,
  tree: { classId, state: { classTsid: classId, maturity, health, fruitCount }, grownAt: extra.grownAt ?? 1000, lastCycleAt: extra.lastCycleAt ?? 2000, woodPetted: 0, woodWatered: 0 },
});
const seedling = (trantClass, beanClass, petted, plantedAt) => ({
  classTsid: 'patch', kind: 'patch', stage: 'seedling', since: plantedAt,
  seedling: { trantClass, beanClass, plantedAt, minAt: plantedAt + 300000, maxAt: plantedAt + 14400000, upgradeGrowLevel: 0, petted, petters: 1, growLevel: 0, thirdPetAt: petted >= 3 ? plantedAt + 6000 : 0 },
});
const save = (streets) => ({ world: { streets: Object.fromEntries(Object.entries(streets).map(([t, plots]) => [t, { features: { patches: { plots }, 'tree-death': {} } }])) } });

describe('the street Patches payout (site src/PatchPayout.php)', { skip: !HAS_SITE ? 'no site checkout' : !hasPhp ? 'no php' : false }, () => {
  const php = (body) => JSON.parse(execFileSync('php', ['-r', `foreach (['LedgerMath', 'Economy', 'LedgerMail', 'PatchPayout'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\PatchPayout as P; $d = P::data(); ${body}`]).toString());
  const arg = (v) => JSON.stringify(JSON.stringify(v));

  it('reads only planted plots on the shared streets, and every shared street with a slice', () => {
    const state = save({
      [PENTAL]: { 'patch:0': tree('trant_fruit', 2, 7, 0) },
      [OLD_MAIN]: { 'patch:0': { classTsid: 'patch', stage: 'clean' }, 'trant_spice_dead:0': { classTsid: 'trant_spice_dead', stage: 'dead', deadClass: 'trant_spice_dead' } },
      RH_HOME_EXT: { 'patch:0': tree('trant_gas', 10, 9, 39) },
    });
    const out = php(`echo json_encode(P::planted(json_decode(${arg(state)}), $d));`);
    assert.deepEqual(out.streets.sort(), [PENTAL, OLD_MAIN].sort(), 'a home is never a shared street');
    assert.equal(out.plots.length, 1);
    assert.deepEqual(out.plots[0].rank, [1, 2, 7, 0]);
    assert.equal(out.plots[0].street, PENTAL);
  });

  it('a lone planter wins; in a clash the most grown wins, then the one planted first, then the lower id', () => {
    const all = {
      500: { plots: [{ street: PENTAL, key: 'patch:0', rank: [1, 2, 7, 0], at: 5 }, { street: DOON, key: 'patch:0', rank: [0, 3, 0, 0], at: 9 }] },
      501: { plots: [{ street: PENTAL, key: 'patch:0', rank: [1, 4, 6, 0], at: 7 }, { street: OLD_MAIN, key: 'patch:1', rank: [0, 1, 0, 0], at: 3 }] },
      502: { plots: [{ street: OLD_MAIN, key: 'patch:1', rank: [0, 1, 0, 0], at: 3 }, { street: OLD_MAIN, key: 'patch:2', rank: [1, 9, 9, 9], at: 1 }, { street: OLD_MAIN, key: 'tree:0', rank: [1, 9, 9, 9], at: 1 }] },
      503: { plots: [{ street: OLD_MAIN, key: 'patch:2', rank: [0, 3, 0, 0], at: 0 }] },
    };
    const w = php(`echo json_encode(P::winners(json_decode(${arg(all)}, true)));`);
    assert.deepEqual(w, {
      [`${DOON}|patch:0`]: 500,
      [`${OLD_MAIN}|patch:1`]: 501, // the same growth, the same time: the lower id
      [`${OLD_MAIN}|patch:2`]: 502, // a tree beats a Seedling
      [`${PENTAL}|patch:0`]: 501, // maturity 4 beats maturity 2
    }, 'a tree:<i> plot is never won: the server keeps those itself');
  });

  it('a win is the server\'s seed entry; the rest is a bean plus the fruit or Planks on it', () => {
    const state = save({ [PENTAL]: { 'patch:0': tree('trant_fruit', 4, 8, 12, { grownAt: 111, lastCycleAt: 222 }) }, [DOON]: { 'patch:0': seedling('wood_tree', 'bean_wood', 3, 1794087385351) } });
    const out = php(`$p = P::planted(json_decode(${arg(state)}), $d)['plots']; echo json_encode([
      'seeds' => array_map(fn ($x) => P::seedEntry(500, $x), $p),
      'refunds' => array_map(fn ($x) => P::refund($x, $d), $p),
      'wood' => P::refund(['stage' => 'tree', 'tree' => 'wood_tree', 'grown' => ['maturity' => 4, 'fruit' => 0]], $d),
      'texts' => array_map(fn ($x) => P::winText($x, $d), $p),
    ]);`);
    const [fruit, wood] = out.seeds[0].street === PENTAL ? [out.seeds[0], out.seeds[1]] : [out.seeds[1], out.seeds[0]];
    assert.deepEqual(fruit, { id: `${PENTAL}|patch:0`, street: PENTAL, key: 'patch:0', user: 500, stage: 'tree', tree: 'trant_fruit', maturity: 4, health: 8, fruit: 12, grownAt: 111, cycleAt: 222, count: 0, woodPetted: 0, woodWatered: 0 });
    assert.equal(wood.stage, 'seedling');
    assert.equal(wood.petted, 3);
    assert.equal(wood.bean, 'bean_wood');
    assert.equal(wood.thirdAt, 1794087385351 + 6000);
    assert.ok(out.refunds.some((r) => r.bean_fruit === 1 && r.cherry === 12));
    assert.ok(out.refunds.some((r) => r.bean_wood === 1 && Object.keys(r).length === 1), 'a Seedling: only its bean');
    assert.deepEqual(out.wood, { bean_wood: 1, plank: 50 });
    assert.ok(out.texts.some((t) => t.includes('Your Fruit Tree on Pental Leave is now a shared Patch tree everyone on the street can tend.')));
    assert.ok(out.texts.some((t) => t.includes('Your Wood Tree Seedling on Doon Way is now a shared Seedling')));
  });

  it('the letters are plain, short, never say Glitch and have no em-dash', () => {
    const t = php(`echo json_encode([P::REFUND_TEXT, P::winText(['stage' => 'seedling', 'tree' => 'trant_bubble', 'street' => 'GLI1018LOKA18M6'], $d), P::winText(['stage' => 'tree', 'tree' => 'trant_spice', 'street' => '${OLD_MAIN}'], $d), P::WIN_SUBJECT, P::REFUND_SUBJECT]);`);
    for (const text of t) {
      assert.ok(text.length <= 300, text);
      assert.doesNotMatch(text, /[—–]|Glitch/, text);
    }
    assert.match(t[2], /^Good news: street Patches are now shared! Your Spice Plant on Old Main Street is now a shared Patch tree/);
  });

  it('the route is registered and administrators only', () => {
    const ext = readFileSync(sitePath('src', 'Extension.php'), 'utf8');
    assert.match(ext, /new PatchPayout\(\$minn\)/);
    const src = readFileSync(sitePath('src', 'PatchPayout.php'), 'utf8');
    assert.match(src, /'\/groddle\/v1\/admin\/patches\/payout'/);
    assert.match(src, /new Policy\(Access::Cap, 'manage_options'\)/);
    assert.match(src, /KIND = 'patches'/);
  });
});

describe('the runner (tools/patches/payout.mjs)', () => {
  it('writes the real run\'s winners as the server\'s seed file, never a dry run\'s', () => {
    const plots = [{ id: `${PENTAL}|patch:0`, street: PENTAL, key: 'patch:0', user: 500, stage: 'tree', tree: 'trant_fruit', maturity: 2 }];
    assert.deepEqual(JSON.parse(seedFile({ dry: false, seed: { v: 1, plots } })), { v: 1, plots });
    assert.throws(() => seedFile({ dry: true, seed: { v: 1, plots } }), /dry/);
    assert.throws(() => seedFile({ dry: false }), /seed/);
  });
});
