/**
 * G346: street projects between real players. The pure half of the shared
 * Job Board (js/street-jobs-mp.js), the server's table
 * (tools/build-realtime-projects.mjs -> groddle-afternoon-server
 * data/projects.json), the site's ledger side (src/LedgerMath.php applied
 * ids for project records, src/LedgerProject.php) and the guards that keep
 * solo as it was. The server's rules have their own tests
 * (groddle-afternoon-server projects_test.go).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { projectTable } from '../tools/build-realtime-projects.mjs';
import {
  APPLIED_KEEP,
  applyWorld,
  isSharedJob,
  listsFrom,
  localTime,
  markContributed,
  migrateToShared,
  phaseShare,
  remember,
  rewardParts,
  rewardPlan,
  rowFromServer,
  sharedSlice,
  topLine,
} from '../public/js/street-jobs-mp.js';
import {
  isJobBuilt,
  jobStatus,
  normalizeStreetJobState,
  phaseBaseCost,
  phaseRequirements,
  roadClosure,
  soloNeed,
} from '../public/js/street-jobs.js';

const root = join(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-jobs.json'), 'utf8'));
const feature = readFileSync(join(root, 'public/js/features/street-jobs-feature.js'), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;

const JOB = '62'; // Build Lowland Slough from GLI57DI72HI153U: one phase
const CLS = 'job_standard4_for_new_streets';
const def = catalog.classes[CLS];

describe('the server table (tools/build-realtime-projects.mjs)', () => {
  it('is current (node tools/build-realtime-projects.mjs)', { skip: skipWithoutServer }, () => {
    execFileSync(process.execPath, ['tools/build-realtime-projects.mjs', '--check'], { cwd: root });
  });

  it('carries every street build and upgrade with the board amounts, and no restorations', () => {
    const t = projectTable(catalog);
    const kinds = Object.values(catalog.jobs).filter((j) => j.kind === 'street' || j.kind === 'upgrade').length;
    // Group halls (G331, tests/g331-halls-mp.test.js) come from catalog.halls.
    const halls = Object.keys(catalog.halls?.jobs || {}).length;
    assert.equal(Object.keys(t.jobs).length, kinds + halls);
    assert.ok(Object.values(t.jobs).every((j) => j.kind === 'street' || j.kind === 'upgrade' || j.kind === 'hall'));
    const job = t.jobs[JOB];
    assert.deepEqual(job.offer, ['GLI57DI72HI153U']);
    assert.equal(job.street, catalog.jobs[JOB].street);
    const cls = t.classes[`${CLS}/50`];
    for (const r of def.requirements) {
      const q = cls.reqs.find((x) => x.id === r.id);
      assert.equal(q.need, soloNeed(r.num), r.id);
      assert.equal(q.cost, r.baseCost, r.id);
    }
    // quest.js getWinners: performance_cutoff 10 here (performance_percent 0).
    assert.equal(cls.cut, 10);
    assert.equal(cls.pct, 0);
    assert.deepEqual(cls.perf.drops, ['street_creation_rewards_a', 'street_creation_trophies']);
    assert.ok(t.drops.street_creation_trophies.length > 0);
    assert.equal(t.cooldownMs, 30 * 60 * 1000);
  });
});

describe('the shared board (js/street-jobs-mp.js)', () => {
  it('shares street builds and upgrades only', () => {
    assert.equal(isSharedJob(catalog, JOB), true);
    const up = Object.keys(catalog.jobs).find((id) => catalog.jobs[id].kind === 'upgrade');
    assert.equal(isSharedJob(catalog, up), true);
    assert.equal(isSharedJob({ jobs: { r: { kind: 'restore' } } }, 'r'), false);
  });

  it('turns a server row into the board row, on the page clock', () => {
    const row = rowFromServer({ phase: 0, got: { r133: 10 }, held: { r134: 5 }, mine: { [CLS]: 40 }, started: 5000, ready: 0, done: 0, top: [{ id: 1, name: 'Ada', cost: 40 }], count: 1 }, 1000);
    assert.equal(row.startedAt, 4000);
    assert.equal(row.readyAt, 0);
    assert.deepEqual(row.got, { r133: 10 });
    assert.deepEqual(row.held, { r134: 5 });
    assert.equal(localTime(0, 5), 0);
    const state = normalizeStreetJobState({ initialized: true });
    state.jobs[JOB] = row;
    const reqs = phaseRequirements(state, catalog, JOB);
    assert.equal(reqs.find((r) => r.id === 'r133').done, true);
    assert.equal(jobStatus(state, catalog, JOB, Date.now()).status, 'active');
  });

  it('a finished project opens its road for everyone who hears of it', () => {
    const state = normalizeStreetJobState({ initialized: true });
    const to = catalog.jobs[JOB].street;
    assert.ok(roadClosure(state, catalog, to, [to]));
    applyWorld(state, catalog, { built: { [JOB]: { at: 9000, option: '' } }, rest: { GLI57DI72HI153U: 9000 } }, 0);
    assert.equal(isJobBuilt(state, catalog, JOB), true);
    assert.equal(roadClosure(state, catalog, to, [to]), null);
    assert.equal(state.streetDone.GLI57DI72HI153U, 9000);
  });

  it('a save from before the shared board keeps the roads it built and drops the rest', () => {
    const state = normalizeStreetJobState({ initialized: true, jobs: { [JOB]: { doneAt: 5, phase: 0 }, 66: { phase: 0, got: { r1: 2 }, startedAt: 3 }, home: { phase: 0 } }, streetDone: { X: 1 } });
    assert.equal(migrateToShared(state, catalog), true);
    assert.deepEqual(Object.keys(state.jobs), ['home']);
    assert.ok(state.grandfathered.includes(catalog.jobs[JOB].street));
    assert.deepEqual(state.streetDone, {});
    assert.equal(isJobBuilt(state, catalog, JOB), true);
  });

  it('saves no shared rows, and keeps the applied ids', () => {
    const state = normalizeStreetJobState({ initialized: true });
    state.jobs[JOB] = rowFromServer({ got: { r133: 1 } });
    state.jobs.home = { phase: 0, got: {}, mine: {}, hired: {} };
    const lists = { applied: ['job-g-abc-1'], rewarded: [] };
    const slice = sharedSlice(state, catalog, lists);
    assert.deepEqual(Object.keys(slice.jobs), ['home']);
    assert.deepEqual(slice.applied, ['job-g-abc-1']);
    assert.deepEqual(listsFrom(slice), { applied: ['job-g-abc-1'], rewarded: [] });
    assert.deepEqual(listsFrom({ applied: ['party-1', 'job-g-x', '<b>'] }).applied, ['job-g-x']);
    // The restored slice keeps the player's own state (normalize ignores the lists).
    assert.equal(normalizeStreetJobState(slice).jobs.home.phase, 0);
    const many = [];
    for (let i = 0; i < APPLIED_KEEP + 5; i += 1) remember(many, `job-g-a-${i}`);
    assert.equal(many.length, APPLIED_KEEP);
    assert.equal(many[0], 'job-g-a-5');
  });

  it('counts a distinct phase once for the contribution badges', () => {
    const state = normalizeStreetJobState({});
    assert.deepEqual(markContributed(state, JOB, CLS), { newPhase: true, distinctPhases: 1 });
    assert.deepEqual(markContributed(state, JOB, CLS), { newPhase: false, distinctPhases: 1 });
  });

  it('words the top contributors and your share by base cost (quest.js getTotalBasecost)', () => {
    const total = phaseBaseCost(def, 50);
    const row = rowFromServer({ mine: { [CLS]: Math.round(total * 0.25) }, top: [{ id: 2, name: 'Bo', cost: Math.round(total * 0.75) }, { id: 1, name: 'Ada', cost: Math.round(total * 0.25) }], count: 3 });
    assert.equal(topLine(row, def, 50), 'Bo 75%, Ada 25% and 1 more');
    assert.ok(Math.abs(phaseShare(row, CLS, def, 50) - 0.25) < 0.001);
  });

  it('applies a reward once, without the ledger part the site already put in', () => {
    const msg = { id: 'job-r-62-0-x-1', rewards: { xp: 354, currants: 0, mood: 118, energy: 118, favor: [{ giant: 'all', points: 6 }] }, performance: { xp: 200, mood: 100, energy: 50, currants: 1000, items: [{ c: 'gem_diamond', n: 1 }] } };
    assert.deepEqual(rewardPlan(msg, { applied: [], rewarded: [] }), { skip: false, ledger: true });
    // A load applied the stored save's part (Ledger::catchUp lists the id as applied): the rest is still owed.
    assert.deepEqual(rewardPlan(msg, { applied: [msg.id], rewarded: [] }), { skip: false, ledger: false });
    assert.deepEqual(rewardPlan(msg, { applied: [msg.id], rewarded: [msg.id] }), { skip: true });
    const all = rewardParts(msg);
    assert.equal(all.performance.currants, 1000);
    assert.deepEqual(all.performance.items, [{ classTsid: 'gem_diamond', count: 1 }]);
    const rest = rewardParts(msg, { ledger: false });
    assert.equal(rest.rewards.xp, 354);
    assert.equal(rest.performance.currants, 0);
    assert.deepEqual(rest.performance.items, []);
  });
});

describe('the feature keeps solo as it was', () => {
  it('gates every shared path on multiplayer', () => {
    assert.match(feature, /const shared = \(jobId\) => mpMode && Boolean\(catalog\) && isSharedJob\(catalog, jobId\);/);
    assert.match(feature, /mpMode = engine\?\.mode === 'multiplayer';/);
    assert.match(feature, /function doGive\(engine, jobId, classId, n\) \{\n  if \(shared\(jobId\)\) return mpGive/);
    assert.match(feature, /function doHire\(engine, jobId, rid\) \{\n  if \(shared\(jobId\)\) return false;/);
    assert.match(feature, /if \(check\.canHire && !shared\(jobId\)\)/);
    assert.match(feature, /if \(shared\(jobId\)\) return;\n  if \(!phaseIsComplete/);
    // Solo saves what it always did.
    assert.match(feature, /if \(mpMode\) return catalog \? sharedSlice\(state, catalog, mpLists\) : \{ \.\.\.state, \.\.\.mpLists \};\n    return state;/);
  });
});

describe('the site ledger counts project records (src/LedgerMath.php)', () => {
  const skip = skipWithoutSite || !hasPhp;
  const php = (code, input) => JSON.parse(String(execFileSync('php', ['-r', `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $in = json_decode(stream_get_contents(STDIN), true);
    ${code}`], { input: JSON.stringify(input) })));
  const entries = (features) => ({ playerState: JSON.stringify({ inventory: { ginger: 3 }, player: { currants: 50 }, systems: { features } }) });

  it('reads applied ids from the trade slice and the Job Board slice', { skip }, () => {
    const out = php('echo json_encode(LedgerMath::applied($in));', entries({ trade: { applied: ['k1-2'] }, 'street-jobs': { applied: ['job-g-a-1'] } }));
    assert.deepEqual(out, ['k1-2', 'job-g-a-1']);
  });

  it('a load applies a project record into the Job Board slice, once', { skip }, () => {
    const out = php(`
      $e = LedgerMath::applyTrade($in, 'job-g-a-1', ['items' => ['ginger' => 2], 'currants' => 0], ['items' => [], 'currants' => 0]);
      $e = LedgerMath::applyTrade($e, 'job-g-a-1', ['items' => ['ginger' => 2], 'currants' => 0], ['items' => [], 'currants' => 0]);
      $e = LedgerMath::applyTrade($e, 'job-r-62-0-x-1', ['items' => [], 'currants' => 0], ['items' => ['gem_diamond' => 1], 'currants' => 1000]);
      echo $e['playerState'];`, entries({}));
    assert.equal(out.inventory.ginger, 1);
    assert.equal(out.inventory.gem_diamond, 1);
    assert.equal(out.player.currants, 1050);
    assert.deepEqual(out.systems.features['street-jobs'].applied, ['job-g-a-1', 'job-r-62-0-x-1']);
    assert.equal(out.systems.features.trade, undefined);
  });

  it('LedgerProject takes ids the server makes, and the service route checks the signature', { skip: skipWithoutSite }, () => {
    const src = readFileSync(join(SITE_DIR, 'src/LedgerProject.php'), 'utf8');
    assert.match(src, /preg_match\('\/\^job-\[gr\]-\[a-z0-9-\]\{1,34\}\$\/', \$id\)/);
    const service = readFileSync(join(SITE_DIR, 'src/LedgerService.php'), 'utf8');
    assert.match(service, /public function project\(Request \$request\): Response\n    \{\n        \$this->signed\(\$request, self::PROJECT\);/);
  });
});
