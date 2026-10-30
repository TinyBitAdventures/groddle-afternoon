/**
 * Depleted cultivations become restorable protos (G56): home-cultivation.js
 * depletion / restore rules, the Restore project through js/street-jobs.js
 * (kind 'restore', source amounts, lifespan-scaled reward), the catalog's
 * `restorations`, the proto art and the homes-feature helpers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LIFESPAN_STEP,
  MAX_LIFE_STEPS,
  addWear,
  countCultivations,
  createCultivationState,
  cultivate,
  cultivationCost,
  cultivationDef,
  depleteCultivation,
  lifespanLeft,
  lifespanMultiplier,
  liveItems,
  maxWear,
  normalizeCultivationState,
  restoreCultivation,
  restoreJobId,
  restoreRewardMultiplier,
  usesLeft,
} from '../public/js/home-cultivation.js';
import {
  cancelJob,
  contributeItems,
  hireWork,
  jobInProgress,
  jobStatus,
  normalizeStreetJobState,
  phaseIsComplete,
  phaseRequirements,
  settlePhase,
} from '../public/js/street-jobs.js';
import { PROTO_DEPLETED_ART } from '../public/js/home-proto-art.js';
import { CULTIVATION_CLASSES } from '../public/js/homes-catalog.js';
import {
  cultivationNodes,
  nodeKeyMap,
  qaWearOpts,
  rekeyRocks,
  rockItems,
  soilKeyMap,
} from '../public/js/features/homes-feature.js?v=g463-2';

const root = join(import.meta.dirname, '..', 'public');
const catalog = JSON.parse(readFileSync(join(root, 'assets/content/street-jobs.json'), 'utf8'));
const rich = () => ({ level: 60, imagination: 1_000_000 });

function yardWith(protoClass, rx = 600) {
  const state = createCultivationState({ yardRight: 4 });
  const res = cultivate(state, rich(), protoClass, rx, { now: 1, rng: () => 0 });
  assert.equal(res.ok, true, res.msg);
  return { state, item: res.item };
}

/** The restore job homes-feature registers for a proto. */
function restoreJob(item) {
  const rest = catalog.restorations[item.protoClass];
  return {
    kind: 'restore',
    title: catalog.classes[rest.phases[0].classTsid].title,
    label: rest.label,
    street: '',
    connecting: [],
    phases: rest.phases,
    divisor: 1,
    rewardMultiplier: restoreRewardMultiplier(item),
  };
}

describe('cultivation depletion and restore rules', () => {
  it('a worn-out item becomes its proto in place and takes no more wear', () => {
    const { state, item } = yardWith('proto_metal_rock');
    const max = maxWear(item);
    assert.equal(max, CULTIVATION_CLASSES.proto_metal_rock.maxWear);
    assert.equal(addWear(state, item.id, max).depleted, true);
    const out = depleteCultivation(state, item.id);
    assert.equal(out.ok, true);
    assert.equal(item.depleted, true);
    assert.equal(item.cycle, 1);
    assert.equal(out.jobId, 'home-proto-1-1');
    assert.equal(restoreJobId(item), 'home-proto-1-1');
    assert.equal(state.items.length, 1, 'the proto stays in the yard');
    assert.equal(addWear(state, item.id, 1).ok, false, 'addWear: no wear once depleted');
    assert.equal(lifespanLeft(item), 0);
    assert.equal(usesLeft(item), 0);
    assert.deepEqual(liveItems(state.items), []);
    assert.equal(depleteCultivation(state, item.id).ok, false);
  });

  it('protos still count toward the cultivation cost (cultivation_count_items counts proto_class)', () => {
    const { state, item } = yardWith('proto_peat');
    const before = cultivationCost(state, 'proto_peat');
    depleteCultivation(state, item.id);
    assert.equal(countCultivations(state), 1);
    assert.equal(cultivationCost(state, 'proto_peat'), before);
  });

  it('each restore adds 0.05 to the lifespan, capped at 2.0 (setMaxWearMultiplier)', () => {
    const { state, item } = yardWith('proto_beryl_rock');
    const base = CULTIVATION_CLASSES.proto_beryl_rock.maxWear;
    const seen = [];
    for (let i = 0; i < 25; i += 1) {
      depleteCultivation(state, item.id);
      const reward = restoreRewardMultiplier(item);
      const out = restoreCultivation(state, item.id, { now: 5, rng: () => 0.99 });
      assert.equal(out.ok, true);
      assert.equal(out.before, reward, 'the restore pays the proto multiplier');
      seen.push(out.after);
    }
    assert.equal(seen[0], 1 + LIFESPAN_STEP);
    assert.equal(seen[1], 1 + 2 * LIFESPAN_STEP);
    assert.equal(Math.max(...seen), 2);
    assert.equal(item.lifeSteps, MAX_LIFE_STEPS);
    assert.equal(maxWear(item), base * 2);
    assert.equal(item.endClass, 'rock_beryl_3', 'choose_one picks a new end item');
    assert.equal(item.wear, 0);
    assert.equal(item.depleted, undefined);
    assert.equal(item.cycle, 25, 'every depletion is a new proto (new project id)');
  });

  it('times_restored: 1 + (multiplier - 1) / .05 once the same player restored it before', () => {
    const { state, item } = yardWith('proto_dirt_pile');
    depleteCultivation(state, item.id);
    const first = restoreCultivation(state, item.id);
    assert.equal(first.times, 0, 'the first restore has no restorer yet');
    assert.equal(item.restorer, true);
    for (let n = 2; n <= 5; n += 1) {
      depleteCultivation(state, item.id);
      const out = restoreCultivation(state, item.id);
      assert.equal(out.times, n);
      // achievements_set: the counter jumps straight to 2 on the second restore.
      assert.equal(out.timesGain, n === 2 ? 2 : 1);
    }
    assert.equal(state.timesRestored, 5, 'Loyal Tender (5)');
  });

  it('Wine of the Dead: the proto restores without the +0.05 and without a restorer', () => {
    const { state, item } = yardWith('proto_patch');
    depleteCultivation(state, item.id);
    restoreCultivation(state, item.id);
    assert.equal(lifespanMultiplier(item), 1.05);
    depleteCultivation(state, item.id, { wotd: true });
    assert.equal(item.wotd, true);
    const out = restoreCultivation(state, item.id);
    assert.equal(out.after, 1.05);
    assert.equal(out.times, 0);
    assert.equal(item.wotd, undefined);
    assert.equal(item.restorer, undefined);
  });

  it('a garden loses its plots when it wears out (a restore plants garden_new)', () => {
    const { state, item } = yardWith('proto_crop_garden_small');
    state.gardens[item.id] = { plots: [1, 2, 3] };
    depleteCultivation(state, item.id);
    assert.equal(state.gardens[item.id], undefined);
  });

  it('the QA wear cap and the lifespan multiplier compose', () => {
    const { state, item } = yardWith('proto_peat');
    item.lifeSteps = 4;
    assert.equal(maxWear(item, { maxWear: 1 }), 1.2);
    assert.equal(usesLeft(item, { maxWear: 1 }), 2);
    assert.equal(addWear(state, item.id, 1, { maxWear: 1 }).depleted, false);
    assert.equal(addWear(state, item.id, 1, { maxWear: 1 }).depleted, true);
    assert.deepEqual(qaWearOpts('3'), { maxWear: 3 });
    assert.deepEqual(qaWearOpts(null), {});
    assert.deepEqual(qaWearOpts('x'), {});
  });

  it('saves round-trip; old saves (no restore fields) stay as they were', () => {
    const old = { items: [{ id: 3, protoClass: 'proto_metal_rock', endClass: 'rock_metal_2', rx: 700, placedAt: 9, wear: 4 }], nextId: 4 };
    const norm = normalizeCultivationState(old);
    assert.deepEqual(norm.items[0], old.items[0]);
    assert.equal(norm.timesRestored, 0);
    const { state, item } = yardWith('proto_metal_rock');
    depleteCultivation(state, item.id, { wotd: true });
    const back = normalizeCultivationState(JSON.parse(JSON.stringify(state)));
    assert.equal(back.items[0].depleted, true);
    assert.equal(back.items[0].wotd, true);
    assert.equal(back.items[0].cycle, 1);
    const hostile = normalizeCultivationState({ items: [{ id: 1, protoClass: 'proto_peat', lifeSteps: 999, depleted: 'yes', cycle: -4 }] });
    assert.equal(hostile.items[0].lifeSteps, MAX_LIFE_STEPS);
    assert.equal(hostile.items[0].depleted, undefined);
    assert.equal(hostile.items[0].cycle, undefined);
  });
});

describe('restore projects (job type 5) in the street-jobs rules', () => {
  it('the catalog carries every cultivation proto with its source job class', () => {
    const want = Object.keys(CULTIVATION_CLASSES).sort();
    assert.deepEqual(Object.keys(catalog.restorations).sort(), want);
    assert.equal(catalog.counts.restorations, want.length);
    assert.equal(catalog.counts.playableRestorations, want.length);
    // items/proto_beryl_rock.js classProps job_class_id
    assert.equal(catalog.restorations.proto_beryl_rock.phases[0].classTsid, 'job_cult_beryl_rock_2');
    assert.equal(catalog.restorations.proto_crop_garden_large.phases[0].classTsid, 'job_cult_crop_garden_large_4');
    assert.equal(catalog.restorations.proto_peat.phases[0].classTsid, 'job_cult_peat_bog_2');
    for (const rest of Object.values(catalog.restorations)) {
      for (const p of rest.phases) {
        assert.equal(catalog.classes[p.classTsid].type, 5, p.classTsid);
        assert.equal(p.delaySeconds, 60, 'setJobData delay_seconds');
      }
      assert.equal(rest.blockers, undefined, `${rest.label} needs ${rest.blockers}`);
    }
    assert.deepEqual(catalog.restorations.proto_metal_rock.endItems, ['rock_metal_1', 'rock_metal_2', 'rock_metal_3']);
  });

  it('runs at the source amounts and pays class xp x share x the proto multiplier', () => {
    const { state: yard, item } = yardWith('proto_metal_rock');
    depleteCultivation(yard, item.id);
    item.lifeSteps = 3; // three earlier restores: 1.15
    const jobId = restoreJobId(item);
    const cat = { ...catalog, jobs: { ...catalog.jobs, [jobId]: restoreJob(item) } };
    const state = normalizeStreetJobState({});
    assert.equal(jobStatus(state, cat, jobId).status, 'open');
    const reqs = phaseRequirements(state, cat, jobId);
    // job_cult_metal_rock_2: 2 plain_crystal, 20 Fancy Pick work, 3 krazy_salts.
    assert.deepEqual(reqs.map((r) => [r.type, r.classId, r.need]), [
      ['item', 'plain_crystal', 2],
      ['work', 'fancy_pick', 20],
      ['item', 'krazy_salts', 3],
    ]);
    const inv = { plain_crystal: 2, krazy_salts: 3 };
    const pc = { currants: 1e6, energy: 100 };
    assert.equal(jobInProgress(state, jobId), false);
    assert.equal(contributeItems(state, cat, jobId, 'plain_crystal', 2, inv).ok, true);
    assert.equal(jobInProgress(state, jobId), true);
    assert.equal(hireWork(state, cat, jobId, reqs[1].id, { inv, pc, learned: [] }).ok, true);
    assert.equal(contributeItems(state, cat, jobId, 'krazy_salts', 3, inv).ok, true);
    assert.equal(phaseIsComplete(state, cat, jobId), true);
    const out = settlePhase(state, cat, jobId, 50);
    assert.equal(out.finalPhase, true);
    assert.equal(out.rewards.xp, Math.round(600 * 1.15));
    assert.deepEqual(state.streetDone, {}, 'a restore sets no street cooldown');
    assert.equal(jobStatus(state, cat, jobId).status, 'done');
  });

  it('Wine of the Dead cancels a started project and loses what was put in', () => {
    const { item } = yardWith('proto_dirt_pile');
    item.depleted = true;
    item.cycle = 1;
    const jobId = restoreJobId(item);
    const cat = { ...catalog, jobs: { ...catalog.jobs, [jobId]: restoreJob(item) } };
    const state = normalizeStreetJobState({});
    assert.equal(cancelJob(state, jobId), false, 'nothing to cancel yet');
    assert.equal(contributeItems(state, cat, jobId, 'earth', 10, { earth: 10 }).ok, true);
    assert.equal(cancelJob(state, jobId), true);
    assert.equal(jobInProgress(state, jobId), false);
    assert.equal(phaseRequirements(state, cat, jobId).every((r) => r.got === 0), true);
  });

  it('public-street protos stay excluded with their own reason', () => {
    const reason = Object.keys(catalog.counts.excludedJobs).find((k) => k.startsWith('public-street cultivation proto'));
    assert.ok(reason);
    assert.equal(catalog.counts.excludedJobs[reason], 51);
  });
});

describe('proto art and the yard bookkeeping', () => {
  it('ships the depleted frame of every cultivation proto', () => {
    for (const protoClass of Object.keys(CULTIVATION_CLASSES)) {
      const art = PROTO_DEPLETED_ART[protoClass];
      assert.ok(art, protoClass);
      const [file, ox, oy, w, h] = art;
      assert.ok(existsSync(join(root, 'assets/sprites/cultivation/proto', file)), file);
      assert.ok(w > 20 && h > 10 && ox > 0 && ox < w && oy > 0, protoClass);
    }
  });

  it('protos own no nodes, plots or rock slots, and the others keep theirs', () => {
    const state = createCultivationState({ yardRight: 6 });
    const a = cultivate(state, rich(), 'proto_metal_rock', 500, { rng: () => 0 }).item;
    const b = cultivate(state, rich(), 'proto_beryl_rock', 800, { rng: () => 0 }).item;
    const p = cultivate(state, rich(), 'proto_patch', 1100, { rng: () => 0 }).item;
    const peat = cultivate(state, rich(), 'proto_peat', 1400, { rng: () => 0 }).item;
    const beforeRocks = rockItems(state.items).map((r) => r.id);
    depleteCultivation(state, a.id);
    depleteCultivation(state, p.id);
    assert.deepEqual(rockItems(state.items).map((r) => r.id), [b.id]);
    assert.deepEqual(cultivationNodes(a), []);
    assert.equal(soilKeyMap(state.items).has(p.id), false);
    assert.deepEqual(nodeKeyMap(state.items).get(peat.id), ['peat_1:0']);
    const rocks = rekeyRocks([{ classId: 'rock_metal_1' }, { classId: 'rock_beryl_1' }], beforeRocks, rockItems(state.items).map((r) => r.id));
    assert.deepEqual(rocks, [{ classId: 'rock_beryl_1' }]);
    restoreCultivation(state, a.id);
    const after = rekeyRocks(rocks, [b.id], rockItems(state.items).map((r) => r.id));
    assert.deepEqual(after, [null, { classId: 'rock_beryl_1' }], 'the restored rock starts fresh in its own slot');
    assert.equal(cultivationDef(a.protoClass).kind, 'rock');
  });
});
