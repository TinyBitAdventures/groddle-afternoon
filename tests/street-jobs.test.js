/** Street projects ("jobs"): catalog build + pure rules (js/street-jobs.js). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SOLO_DIVISOR,
  WORK_UNIT_MS,
  STREET_JOB_COOLDOWN_MS,
  CONTRIBUTION_BADGES,
  normalizeStreetJobState,
  initializeStreetJobs,
  soloNeed,
  phaseRequirements,
  currentReqGroup,
  jobStatus,
  streetJobs,
  streetHasOpenProject,
  contributeItems,
  contributeCurrants,
  workCheck,
  applyWorkUnit,
  hireQuote,
  hireWork,
  phaseIsComplete,
  settlePhase,
  rollDropTable,
  roadClosure,
  closedStreets,
  chooseOption,
  appliedUpgrade,
  upgradeFeatures,
  upgradeEcologyEntry,
  contributionBadgesReached,
  jobText,
  plainText,
  TROPHY_PIECES,
  planStreetTrophies,
} from '../public/js/street-jobs.js?v=03e90891';
import { streetJobsFeature } from '../public/js/features/street-jobs-feature.js?v=40616538';
import { createAchievementState, applyAchievementProgress } from '../public/js/achievements.js?v=e4e5edd0';
import { applyRewards } from '../public/js/quests.js?v=40c71a37';
import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { addItem, countItem } from '../public/js/inventory.js?v=f49c8998';
import { obtainableItems } from '../tools/job-obtainable.mjs';
import { TROPHY_WHERE_TEXT } from '../public/js/home-trophies.js?v=2020b29b';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const catalog = JSON.parse(readFileSync(join(root, 'assets/content/street-jobs.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(root, 'assets/streets/index.json'), 'utf8'));
const HECHEY = 'GLI2V0UN7RD1T2J';

/** Fill every open requirement of the current phase by contributing for real. */
function finishCurrentPhase(state, jobId, now = 1000) {
  const inv = {};
  const pc = { currants: 1e9, energy: 100 };
  let guard = 50;
  while (!phaseIsComplete(state, catalog, jobId) && guard-- > 0) {
    for (const r of phaseRequirements(state, catalog, jobId).filter((x) => x.open)) {
      if (r.type === 'item') {
        inv[r.classId] = r.need - r.got;
        assert.equal(contributeItems(state, catalog, jobId, r.classId, r.need, inv, now).ok, true);
      } else if (r.type === 'currants') {
        assert.equal(contributeCurrants(state, catalog, jobId, r.need, pc, now).ok, true);
      } else {
        assert.equal(hireWork(state, catalog, jobId, r.id, { inv, pc, learned: [] }, now).ok, true);
      }
    }
  }
  return { inv, pc };
}

describe('street jobs catalog', () => {
  it('keeps the source counts and only playable, attached jobs', () => {
    assert.equal(catalog.counts.classes, 200);
    assert.equal(catalog.counts.sourceJobs, 909);
    assert.equal(catalog.counts.playableJobs, Object.keys(catalog.jobs).length);
    assert.equal(catalog.counts.streetJobs + catalog.counts.upgradeJobs, catalog.counts.playableJobs);
    assert.equal(catalog.counts.upgradeJobs, 5);
    assert.ok(catalog.counts.streetJobs >= 200);
    for (const [id, job] of Object.entries(catalog.jobs)) {
      assert.ok(index.streets[job.street], `${id} builds an imported street`);
      for (const p of job.phases) assert.ok(catalog.classes[p.classTsid], `${id} phase ${p.classTsid}`);
      if (job.kind === 'street') {
        assert.ok(job.connecting.length > 0);
        for (const t of job.connecting) assert.ok(catalog.byStreet[t].includes(id));
      }
    }
    for (const [tsid, ids] of Object.entries(catalog.byStreet)) {
      assert.ok(index.streets[tsid], `${tsid} offering street imported`);
      for (const id of ids) assert.ok(catalog.jobs[id]);
    }
  });

  it('reads job phases, delays, and source requirement fields from GSJS', () => {
    const grand = catalog.jobs['1'];
    assert.equal(grand.label, 'Grand Mile');
    assert.deepEqual(grand.connecting, [HECHEY]);
    const def = catalog.classes.job_standard1_for_new_streets;
    const dullite = def.requirements.find((r) => r.classId === 'dullite');
    assert.equal(dullite.num, 800);
    assert.equal(dullite.baseCost, 4);
    const water = def.requirements.find((r) => r.id === 'r47');
    assert.deepEqual([water.type, water.group, water.energy, water.wear, water.skill], ['work', 2, 3, 1, 'light_green_thumb_1']);
    assert.deepEqual(def.rewards, { xp: 12000, currants: 10000, mood: 10000, energy: 5000, favor: [{ giant: 'all', points: 100 }] });
    assert.deepEqual(def.performance.dropTables, ['street_creation_rewards_a', 'street_creation_trophies']);
    const tumble = catalog.jobs['377'];
    assert.deepEqual(tumble.phases.map((p) => p.delaySeconds), [0, 1200, 1200, 1200]);
    assert.equal(tumble.phases[0].label, 'Currants!');
  });

  it('every item a playable phase asks for is obtainable in the remake', async () => {
    const { items } = await obtainableItems();
    for (const def of Object.values(catalog.classes)) {
      for (const r of def.requirements) if (r.type === 'item') assert.ok(items.has(r.classId), `${r.classId} obtainable`);
    }
  });

  it('recovers the performance drop tables and reward item art', () => {
    const trophies = catalog.drops.street_creation_trophies.drops;
    assert.equal(trophies.at(-1)[0], 100);
    assert.equal(trophies.length, 20);
    assert.deepEqual(catalog.drops.street_creation_rewards_a.drops[0], [15, [{ class_id: 'gem_diamond', count: 1 }]]);
    for (const family of ['wood', 'earth', 'rock', 'dirt']) {
      for (const suffix of ['', '_piece1', '_piece2', '_piece3', '_piece4', '_piece5']) {
        const id = `trophy_street_creator_${family}${suffix}`;
        assert.ok(catalog.items[id]?.label, id);
        assert.ok(existsSync(join(root, `assets/sprites/icons/${id}.webp`)), `${id} icon`);
      }
    }
    assert.ok(existsSync(join(root, 'assets/sprites/street-jobs/sign_stake.webp')));
  });

  it('offers the next upgrade level only, with the source tree options', () => {
    const up = catalog.upgrades.GCR10NQRPKJ16H6;
    assert.equal(up.current.name, 'Misty Clearing');
    assert.deepEqual(up.options.map((o) => o.name), ['Piggy & Patch Place', 'Sunset Shrooms']);
    assert.ok(catalog.counts.excludedJobs['already upgraded to level 3 in the source'] > 0);
  });
});

describe('street jobs rules', () => {
  it('divides source amounts by the solo divisor, never below one', () => {
    assert.equal(SOLO_DIVISOR, 50);
    assert.equal(WORK_UNIT_MS, 1500);
    assert.equal(soloNeed(800), 16);
    assert.equal(soloNeed(250), 5);
    assert.equal(soloNeed(1), 1);
    assert.equal(soloNeed(0), 1);
  });

  it('normalizes hostile saves', () => {
    const s = normalizeStreetJobState({ jobs: { '1': { phase: -3, got: { r4: 'x' } }, 'bad id!': 5 }, phaseWins: -2, grandfathered: 'nope' });
    assert.equal(s.jobs['1'].phase, 0);
    assert.equal(s.jobs['1'].got.r4, 0);
    assert.equal(s.phaseWins, 0);
    assert.deepEqual(s.grandfathered, []);
    assert.ok(s.jobs.badid);
  });

  it('gates group 2 behind group 1 in a bucket (getCurrentReqGroup)', () => {
    const state = normalizeStreetJobState({});
    const reqs = phaseRequirements(state, catalog, '1');
    const water = reqs.find((r) => r.id === 'r47');
    assert.equal(water.open, false);
    assert.equal(currentReqGroup(reqs, '1'), 1);
    const inv = {};
    for (const r of reqs.filter((x) => x.bucket === '1' && x.group === 1)) {
      inv[r.classId] = 999;
      contributeItems(state, catalog, '1', r.classId, 999, inv, 0);
    }
    const after = phaseRequirements(state, catalog, '1').find((r) => r.id === 'r47');
    assert.equal(after.open, true);
  });

  it('takes only what an open requirement still needs and records base cost', () => {
    const state = normalizeStreetJobState({});
    const inv = { dullite: 40 };
    const res = contributeItems(state, catalog, '1', 'dullite', 40, inv, 5);
    assert.equal(res.ok, true);
    assert.equal(res.amount, 16);
    assert.equal(inv.dullite, 24);
    assert.equal(res.baseCost, 16 * 4);
    assert.equal(state.jobs['1'].mine.job_standard1_for_new_streets, 64);
    assert.equal(state.jobs['1'].startedAt, 5);
    assert.equal(contributeItems(state, catalog, '1', 'dullite', 1, inv, 5).ok, false);
    assert.equal(contributeItems(state, catalog, '1', 'apple', 1, { apple: 3 }, 5).ok, false);
  });

  it('report 290: an item asked for in two buckets goes to the row you chose', () => {
    // The Jethimadh Tower's last phase (job 256, job_tower_ph4): Urth Blocks in bucket 1 (r662) and bucket 2 (r669), both open.
    const at4 = () => normalizeStreetJobState({ jobs: { 256: { phase: 3, startedAt: 1, got: { r660: 1e9, r666: 1e9 } } } });
    const urth = (state) => Object.fromEntries(phaseRequirements(state, catalog, '256').filter((r) => r.classId === 'grade_aa_earth_block').map((r) => [r.id, [r.got, r.open]]));
    const state = at4();
    assert.deepEqual(urth(state), { r662: [0, true], r669: [0, true] });
    const inv = { grade_aa_earth_block: 4 };
    // Solo amounts, as in his picture: 4 on the first row, 2 on the second.
    const res = contributeItems(state, catalog, '256', 'grade_aa_earth_block', 1, inv, 5, 'r669');
    assert.equal(res.ok, true);
    assert.equal(res.req.id, 'r669');
    assert.deepEqual(urth(state), { r662: [0, true], r669: [1, true] });
    // No row named: the first open one, as GSJS inc_item did.
    assert.equal(contributeItems(state, catalog, '256', 'grade_aa_earth_block', 1, inv, 5).req.id, 'r662');
    assert.deepEqual(urth(state), { r662: [1, true], r669: [1, true] });
    // A row that is done or not open takes nothing; the item does not spill into another row.
    const full = at4();
    contributeItems(full, catalog, '256', 'grade_aa_earth_block', 99, { grade_aa_earth_block: 99 }, 5, 'r669');
    const bag = { grade_aa_earth_block: 5 };
    assert.equal(contributeItems(full, catalog, '256', 'grade_aa_earth_block', 5, bag, 5, 'r669').ok, false);
    assert.equal(bag.grade_aa_earth_block, 5);
    assert.equal(contributeItems(full, catalog, '256', 'grade_aa_earth_block', 1, bag, 5, 'r661').ok, false);
  });

  it('report 290: currants go to the currants row you chose', () => {
    const state = normalizeStreetJobState({ jobs: { 256: { phase: 3, startedAt: 1 } } });
    const pc = { currants: 50 };
    assert.equal(contributeCurrants(state, catalog, '256', 30, pc, 5, 'r666').req.id, 'r666');
    assert.equal(state.jobs['256'].got.r666, 30);
    assert.equal(state.jobs['256'].got.r660 || 0, 0);
    assert.equal(contributeCurrants(state, catalog, '256', 20, pc, 5).req.id, 'r660');
  });

  it('report 294: online, a street you have stood on stays open for you but its project is still open to build', () => {
    // Yan Jaggery (job 262), featured at 63% on the server while this player had it grandfathered.
    const YAN = 'GCR29V8S4Q12IF4';
    const state = normalizeStreetJobState({ grandfathered: [YAN], jobs: { 262: { phase: 2, startedAt: 1, got: { r1: 1 } } } });
    assert.equal(jobStatus(state, catalog, '262', 10 ** 13).status, 'built'); // solo: unchanged
    assert.equal(jobStatus(state, catalog, '262', 10 ** 13, { sharedWorld: true }).status, 'active');
    assert.equal(closedStreets(state, catalog, { sharedWorld: true }).includes(YAN), false); // the road stays open for you
    assert.equal(roadClosure(state, catalog, YAN, [YAN], { sharedWorld: true }), null);
    const done = normalizeStreetJobState({ grandfathered: [YAN], jobs: { 262: { phase: 3, doneAt: 5 } } });
    assert.equal(jobStatus(done, catalog, '262', 10 ** 13, { sharedWorld: true }).status, 'done');
    const other = normalizeStreetJobState({});
    assert.equal(closedStreets(other, catalog, { sharedWorld: true }).includes(YAN), true);
  });

  it('runs work units with source energy and wear, and stops at the energy floor', () => {
    const state = normalizeStreetJobState({});
    const reqs = phaseRequirements(state, catalog, '1');
    const inv = { watering_can: 1 };
    for (const r of reqs.filter((x) => x.type === 'item')) {
      inv[r.classId] = 999;
      contributeItems(state, catalog, '1', r.classId, 999, inv, 0);
    }
    const wear = [];
    const pc = { energy: 7, currants: 0 };
    const ctx = { inv, pc, learned: ['light_green_thumb_1'], useTool: (t, w) => wear.push([t, w]) };
    const one = applyWorkUnit(state, catalog, '1', 'r47', ctx, 0);
    assert.equal(one.ok, true);
    assert.equal(pc.energy, 4);
    assert.deepEqual(wear, [['watering_can', 1]]);
    // 4 energy left, unit costs 3: the source stops when energy <= unit cost? 4 > 3 so one more.
    assert.equal(applyWorkUnit(state, catalog, '1', 'r47', ctx, 0).ok, true);
    const stop = applyWorkUnit(state, catalog, '1', 'r47', ctx, 0);
    assert.equal(stop.ok, false);
    assert.match(stop.msg, /enough energy/);
    assert.equal(stop.canHire, false);
  });

  it('hires a hand only for work you cannot do, at base_cost per unit', () => {
    const state = normalizeStreetJobState({});
    const inv = {};
    for (const r of phaseRequirements(state, catalog, '1').filter((x) => x.type === 'item')) {
      inv[r.classId] = 999;
      contributeItems(state, catalog, '1', r.classId, 999, inv, 0);
    }
    const quote = hireQuote(state, catalog, '1', 'r47');
    assert.equal(quote.units, soloNeed(300));
    assert.equal(quote.cost, soloNeed(300) * 6);
    const skilled = { inv: { watering_can: 1 }, pc: { currants: 999, energy: 100 }, learned: ['light_green_thumb_1'] };
    assert.equal(workCheck(state, catalog, '1', 'r47', skilled).ok, true);
    assert.equal(hireWork(state, catalog, '1', 'r47', skilled).ok, false);
    const noSkill = { inv: { watering_can: 1 }, pc: { currants: quote.cost, energy: 100 }, learned: [] };
    const res = hireWork(state, catalog, '1', 'r47', noSkill, 0);
    assert.equal(res.ok, true);
    assert.equal(noSkill.pc.currants, 0);
    assert.equal(phaseRequirements(state, catalog, '1').find((r) => r.id === 'r47').done, true);
  });

  it('pays the share formula divided by the divisor, plus unscaled performance rewards', () => {
    const state = normalizeStreetJobState({ initialized: true });
    finishCurrentPhase(state, '1');
    const rolls = [0.05, 0, 0.99, 0];
    const out = settlePhase(state, catalog, '1', 2000, () => rolls.shift() ?? 0);
    assert.equal(out.ok, true);
    assert.equal(out.participation, 100);
    assert.deepEqual(out.rewards, { xp: 240, currants: 200, mood: 200, energy: 100, favor: [{ giant: 'all', points: 2 }] });
    assert.equal(out.performance.xp, 100);
    assert.equal(out.performance.mood, 50);
    assert.deepEqual(out.performance.items, [
      { classTsid: 'gem_diamond', count: 1 },
      { classTsid: 'trophy_street_creator_wood_piece5', count: 1 },
    ]);
    assert.equal(out.finalPhase, true);
    assert.equal(out.jobDone, true);
    assert.equal(state.jobs['1'].doneAt, 2000);
    assert.equal(state.streetDone[HECHEY], 2000);
  });

  it('holds the next phase for its delay and the street for 30 minutes after a job', () => {
    const state = normalizeStreetJobState({ initialized: true });
    finishCurrentPhase(state, '377');
    const out = settlePhase(state, catalog, '377', 10_000, () => 0.5);
    assert.equal(out.finalPhase, false);
    assert.equal(out.readyAt, 10_000 + 1200 * 1000);
    assert.equal(jobStatus(state, catalog, '377', 20_000).status, 'delayed');
    assert.equal(jobStatus(state, catalog, '377', 10_000 + 1200 * 1000).status, 'active');
    // Cooldown: a finished street project rests its offering street.
    const s2 = normalizeStreetJobState({ initialized: true });
    const [street, ids] = Object.entries(catalog.byStreet).find(([, list]) => list.length > 1 && list.every((id) => catalog.jobs[id].kind === 'street' && catalog.jobs[id].phases.length === 1));
    finishCurrentPhase(s2, ids[0]);
    settlePhase(s2, catalog, ids[0], 50_000, () => 0.5);
    assert.equal(jobStatus(s2, catalog, ids[1], 50_000 + 60_000, { street }).status, 'cooldown');
    assert.equal(jobStatus(s2, catalog, ids[1], 50_000 + STREET_JOB_COOLDOWN_MS, { street }).status, 'open');
    assert.equal(streetJobs(s2, catalog, street, 50_000 + 60_000)[0].status, 'cooldown');
  });

  it('closes the road into an unbuilt street until its project is done', () => {
    const state = normalizeStreetJobState({});
    initializeStreetJobs(state, [HECHEY]);
    const job = catalog.jobs['377'];
    const from = job.connecting[0];
    const roads = [`L${job.street.slice(1)}`, 'GXXXX'];
    assert.ok(roadClosure(state, catalog, job.street, roads));
    assert.equal(roadClosure(state, catalog, job.street, ['GXXXX']), null, 'map travel stays open');
    assert.ok(closedStreets(state, catalog).includes(job.street));
    assert.equal(streetHasOpenProject(state, catalog, from), true);
    // Starter street roads are exempt, so Hechey offers no board.
    assert.equal(roadClosure(state, catalog, 'GLI1BQA9PUH16A0', ['GLI1BQA9PUH16A0'], { exemptFrom: [HECHEY] }), null);
    assert.equal(streetHasOpenProject(state, catalog, HECHEY, Date.now(), { exemptFrom: [HECHEY] }), false);
    // Grandfathered (visited before the feature) streets count as built.
    const old = normalizeStreetJobState({});
    initializeStreetJobs(old, [job.street]);
    assert.equal(roadClosure(old, catalog, job.street, roads), null);
    assert.equal(initializeStreetJobs(old, ['GZZZ']), false, 'only once per save');
  });

  it('applies the chosen upgrade option as a clean ecology improvement', () => {
    const state = normalizeStreetJobState({ initialized: true });
    assert.equal(chooseOption(state, catalog, '53', '15'), true);
    assert.equal(chooseOption(state, catalog, '53', 'nope'), false);
    finishCurrentPhase(state, '53');
    const out = settlePhase(state, catalog, '53', 1, () => 0.5);
    assert.equal(out.option.name, 'Piggy & Patch Place');
    assert.equal(appliedUpgrade(state, catalog, 'GCR10NQRPKJ16H6').name, 'Piggy & Patch Place');
    const f = upgradeFeatures(out.option);
    assert.deepEqual(f, { giantId: 'ti', moreAnimals: true, piggies: true, rocks: false, flora: ['flowers'] });
    const entry = upgradeEcologyEntry({ counts: { trant_fruit: 2, street_spirit: 1 }, giantId: 'friendly' }, out.option);
    assert.equal(entry.giantId, 'ti');
    assert.equal(entry.counts.npc_piggy, 3);
    assert.equal(entry.counts.npc_chicken, 1);
    assert.equal(entry.counts.trant_fruit, 2);
    const mining = upgradeFeatures({ desc: 'Some mining rocks. Shrine to Pot.' });
    assert.equal(mining.rocks, true);
    assert.equal(mining.giantId, 'pot');
  });

  it('rolls cumulative drop tables and reaches contribution badges at source thresholds', () => {
    const table = { drops: [[15, [{ class_id: 'a', count: 1 }]], [100, [{ currants: 5 }]]] };
    assert.deepEqual(rollDropTable(table, () => 0.14), { class_id: 'a', count: 1 });
    assert.deepEqual(rollDropTable(table, () => 0.15), { currants: 5 });
    assert.deepEqual(CONTRIBUTION_BADGES.map(([, n]) => n), [5, 17, 53, 137, 253]);
    assert.deepEqual(contributionBadgesReached(5), ['interested_party']);
    assert.deepEqual(contributionBadgesReached(6), []);
  });

  it('expands source text templates', () => {
    assert.equal(jobText('Build {job_location}: {job_participation}%', { location: 'X', participation: 100 }), 'Build X: 100%');
    assert.equal(plainText('<b>Hi</b><br>there<split butt_txt="OK" />Bye'), 'Hi\nthere\n\nBye');
  });
});

describe('street project phase names', () => {
  it('fill {job_location} in phase titles shown in the panel and phase-complete text', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public/js/features/street-jobs-feature.js'), 'utf8');
    // js/street-jobs.js phaseName fills it (jobText) and decodes the markup (tests/job-text-placeholders.test.js).
    assert.match(src, /function phaseTitle\(job, phase, def\)[\s\S]{0,120}phaseName\(/);
    // Every phase/def title reaches the UI through phaseTitle, never raw.
    assert.doesNotMatch(src, /\$\{[^}]*(phase\.label|def\.title)[^}]*\}/);
  });
});

describe('report 97: the Street Creator Trophies', () => {
  const gsjs = join(root, '../../glitch-GameServerJS');
  const GIANT_IDS = ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille'];
  const rock = [1, 2, 3, 4, 5].map((n) => `trophy_street_creator_rock_piece${n}`);

  it('the source: five distinct pieces held at once, consumed for the trophy; a project rolls one at random', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    for (const family of ['rock', 'dirt', 'earth', 'wood']) {
      const src = readFileSync(join(gsjs, `achievements/collection_street_creator_${family}.js`), 'utf8');
      assert.match(src, /var collection_type\t= 2;/);
      assert.match(src, /pc\.stats_add_xp\(round_to_5\(1000 \* multiplier\), true\);/);
      assert.match(src, /pc\.stats_add_favor_points\("all", round_to_5\(30 \* multiplier\)\);/);
      assert.match(src, new RegExp(`pc\\.createItemFromFamiliar\\("trophy_street_creator_${family}", 1\\);`));
      for (let n = 1; n <= 5; n++) assert.match(src, new RegExp(`group\\t: "in_inventory",\\n\\t\\tlabel\\t: "trophy_street_creator_${family}_piece${n}"`));
    }
    const ach = readFileSync(join(gsjs, 'players/inc_achievements.js'), 'utf8');
    assert.match(ach, /if \(achievement\.collection_type == 2\) this\.items_destroy\(condition\.label, condition\.value\);/);
    assert.match(ach, /if \(this\.countItemClass\(data\.label\) < intval\(data\.value\)\)\{/);
    assert.match(readFileSync(join(gsjs, 'players/inc_items.js'), 'utf8'), /var achievements_to_check = this\.achievements_get_from_counter\('in_inventory', stack\.class_id\);/);
    // One roll per performance reward: repeats were possible in the original too.
    assert.match(readFileSync(join(gsjs, 'quests/job_standard5_for_new_streets.js'), 'utf8'), /var items = pc\.runDropTable\("street_creation_trophies"\);/);
    assert.match(readFileSync(join(gsjs, 'players/inc_skill_packages.js'), 'utf8'), /var chance = \/\*this\.buffs_has\('max_luck'\) \? 0 : \*\/ randInt\(0, 100\);/);
  });

  it('the piece says what it is for', () => {
    for (const cls of TROPHY_PIECES.filter((c) => c.includes('_rock_'))) {
      assert.equal(catalog.items[cls].desc, 'One fifth of a trophy celebrating top street-creators. Four more pieces similar to it, and one mighty Rock Trophy would be born.');
    }
    assert.equal(TROPHY_PIECES.length, 20);
  });

  it('planStreetTrophies: an unlocked badge takes one of each piece held, once a family', () => {
    const held = { trophy_street_creator_rock_piece1: 2, trophy_street_creator_rock_piece3: 1 };
    const countOf = (c) => held[c] || 0;
    assert.deepEqual(planStreetTrophies({ trophiesGranted: [] }, [], countOf), []);
    assert.deepEqual(planStreetTrophies({ trophiesGranted: [] }, ['collection_street_creator_rock'], countOf), [
      { family: 'rock', badge: 'collection_street_creator_rock', trophy: 'trophy_street_creator_rock', take: ['trophy_street_creator_rock_piece1', 'trophy_street_creator_rock_piece3'] },
    ]);
    assert.deepEqual(planStreetTrophies({ trophiesGranted: ['rock'] }, ['collection_street_creator_rock'], countOf), []);
  });

  it("applyRewards: 'all' favor goes to every Giant (stats_add_favor_points)", () => {
    const pc = { giantFavor: {} };
    applyRewards(pc, { favor: { giant: 'all', points: 30 } });
    assert.deepEqual(Object.keys(pc.giantFavor).sort(), GIANT_IDS);
    assert.ok(Object.values(pc.giantFavor).every((v) => v === 30));
    // The badge and quest cards say so, not "+30 All favor".
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    assert.equal(game.split("giant === 'all' ? 'favor with every Giant'").length - 1, 2);
  });

  it('a save already holding all five completes the badge on load: pieces go, the trophy comes, once', async () => {
    resetContentCatalogs();
    await loadContentCatalogsFromDir(join(root, 'assets/content'));
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(readFileSync(join(root, String(url).split('?')[0]), 'utf8')) });
    try {
      const achieve = createAchievementState();
      const pc = { level: 10, xp: 0, imagination: 0, giantFavor: {}, energy: 50, mood: 50 };
      const log = [];
      const engine = {
        mode: 'multiplayer',
        streetTsid: HECHEY,
        inv: {},
        pc,
        param: () => null,
        setData() {},
        save() {},
        updateHud() {},
        refreshPack() {},
        pushActivity: (t) => log.push(t),
        get unlockedAchievements() {
          return achieve.unlocked;
        },
        achievement: (counter, n = 1) => applyAchievementProgress(achieve, counter, n, pc),
      };
      // Online, the rewards came through the ledger into the stored save: no gain event ever ran.
      for (const cls of rock) addItem(engine.inv, cls, 1);
      addItem(engine.inv, 'trophy_street_creator_earth_piece2', 1);
      streetJobsFeature.init(engine);
      streetJobsFeature.restore({}, engine);
      for (let i = 0; i < 200 && !streetJobsFeature._state().catalog; i++) await new Promise((r) => setTimeout(r, 10));
      streetJobsFeature.onTick(16, 10_000, engine);
      assert.ok(achieve.unlocked.includes('collection_street_creator_rock'));
      assert.equal(achieve.unlocked.includes('collection_street_creator_earth'), false);
      assert.deepEqual(rock.map((c) => countItem(engine.inv, c)), [0, 0, 0, 0, 0], 'one of each piece destroyed (collection_type 2)');
      assert.equal(countItem(engine.inv, 'trophy_street_creator_rock'), 1);
      assert.equal(countItem(engine.inv, 'trophy_street_creator_earth_piece2'), 1);
      assert.equal(pc.imagination, 1000);
      assert.deepEqual(Object.keys(pc.giantFavor).sort(), GIANT_IDS);
      assert.ok(Object.values(pc.giantFavor).every((v) => v === 30), '30 with every Giant');
      assert.deepEqual(log, [`Your five pieces became the Street Creator Rock Trophy! ${TROPHY_WHERE_TEXT}`]);
      // Five more pieces later (a trade): the badge is had, nothing more.
      for (const cls of rock) addItem(engine.inv, cls, 1);
      streetJobsFeature.onTick(16, 12_000, engine);
      assert.equal(countItem(engine.inv, 'trophy_street_creator_rock'), 1);
      assert.equal(countItem(engine.inv, rock[0]), 1);
      // The save keeps the family as given (online too: sharedSlice keeps it), so a reload gives nothing again.
      const slice = JSON.parse(JSON.stringify(streetJobsFeature.save()));
      assert.deepEqual(slice.trophiesGranted, ['rock']);
      streetJobsFeature.restore(slice, engine);
      streetJobsFeature.onTick(16, 14_000, engine);
      assert.equal(countItem(engine.inv, 'trophy_street_creator_rock'), 1);
      // Four earth pieces: nothing; the fifth arrives (a gift) and the next look completes it.
      for (const n of [1, 3, 4]) addItem(engine.inv, `trophy_street_creator_earth_piece${n}`, 1);
      streetJobsFeature.onTick(16, 16_000, engine);
      assert.equal(achieve.unlocked.includes('collection_street_creator_earth'), false);
      addItem(engine.inv, 'trophy_street_creator_earth_piece5', 1);
      streetJobsFeature.onTick(16, 18_000, engine);
      assert.ok(achieve.unlocked.includes('collection_street_creator_earth'));
      assert.equal(countItem(engine.inv, 'trophy_street_creator_earth'), 1);
      assert.equal(countItem(engine.inv, 'trophy_street_creator_earth_piece5'), 0);
      // Report 99, a guard: the badge and the trophy but no record of giving it, the trophy standing
      // at home or in the pack: recorded, no second, and the pieces stay.
      achieve.unlocked.push('collection_street_creator_wood', 'collection_street_creator_dirt');
      engine.query = (hook, cls) => (hook === 'homeFurnitureHeld' && cls === 'trophy_street_creator_wood' ? 1 : 0);
      addItem(engine.inv, 'trophy_street_creator_wood_piece1', 1);
      addItem(engine.inv, 'trophy_street_creator_dirt', 1);
      streetJobsFeature.onTick(16, 20_000, engine);
      assert.equal(countItem(engine.inv, 'trophy_street_creator_wood'), 0);
      assert.equal(countItem(engine.inv, 'trophy_street_creator_wood_piece1'), 1);
      assert.equal(countItem(engine.inv, 'trophy_street_creator_dirt'), 1);
      assert.ok(['wood', 'dirt'].every((f) => streetJobsFeature.save().trophiesGranted.includes(f)));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
