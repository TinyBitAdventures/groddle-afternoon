/**
 * G331: group halls between real players. The catalog's ten hall jobs
 * (build-street-jobs.mjs `halls`), the server's table
 * (tools/build-realtime-projects.mjs -> groddle-afternoon-server
 * data/projects.json, kind 'hall'), the pure half of the board
 * (js/street-jobs-mp.js mergeHalls, hallFromServer, HALL_TEXT), the site's
 * claim and ownership (src/LedgerHall.php) and the guards that keep solo as
 * it was. The server's rules have their own tests (group_halls_test.go).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { projectTable } from '../tools/build-realtime-projects.mjs';
import { HALL_TEXT, hallClock, hallFromServer, hoursText, isSharedJob, mergeHalls, rowFromServer } from '../public/js/street-jobs-mp.js';
import { jobStatus, normalizeStreetJobState, phaseRequirements, streetJobs } from '../public/js/street-jobs.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const fresh = () => JSON.parse(read('public/assets/content/street-jobs.json'));
const catalog = fresh();
const index = JSON.parse(read('public/assets/streets/index.json'));
const feature = read('public/js/features/street-jobs-feature.js');

// The inventory's ten lost group hall rows (research/coverage/inventory.sqlite, lost_why players).
const HALLS = {
  689: 'GLI32KHF0UD1AOK', 690: 'GCR10U5VHMK112O', 691: 'GLI334UG2UD1IKQ', 692: 'GLI32N0F1UD114O', 693: 'GCRVT5V0BDO1HLF',
  694: 'GCR10157DMK1L0G', 695: 'GCR13JCI5MK1EF4', 696: 'GCR13KDF9MK1QJK', 697: 'GLIF37ASJFE1AVQ', 698: 'GCR103UREMK11MT',
};

describe('the catalog (build-street-jobs.mjs halls)', () => {
  it('has the ten group hall jobs, each offered from its street in the world', () => {
    const jobs = catalog.halls.jobs;
    assert.deepEqual(Object.keys(jobs).sort(), Object.keys(HALLS).sort());
    for (const [id, street] of Object.entries(HALLS)) {
      const job = jobs[id];
      assert.equal(job.kind, 'hall', id);
      assert.deepEqual(job.connecting, [street], id);
      assert.ok(index.streets[street], `${street} is in the world`);
      assert.equal(job.title, 'Build a Group-owned Location'); // quest.js:176
      assert.equal(job.duration, 180, id); // job_group_*.js duration
      assert.deepEqual(job.claim.map((q) => [q.type, q.num]), [['currants', 10000]], id); // claim_reqs
      assert.equal(job.phases.length, 2, id);
      assert.equal(job.phases[0].label, 'Build a Group Location');
      assert.ok(job.phases.every((p) => catalog.halls.classes[p.classTsid]), id);
      assert.ok(!job.blockers, `${id} needs only items the remake has`);
      assert.deepEqual(catalog.halls.byStreet[street], [id]);
    }
    // Job 694's second phase is a street class: it inherits the claim (quest.js:1080-1086).
    assert.equal(jobs[694].phases[1].classTsid, 'job_street_ph2_07');
    assert.equal(catalog.halls.classes.job_group_ph1_01c.type, 3);
  });

  it('leaves the solo board as it was', () => {
    for (const id of Object.keys(HALLS)) assert.equal(catalog.jobs[id], undefined, id);
    for (const street of Object.values(HALLS)) assert.ok(!(catalog.byStreet[street] || []).some((id) => HALLS[id]), street);
    assert.equal(catalog.counts.playableJobs, Object.keys(catalog.jobs).length);
    assert.ok(!Object.keys(catalog.classes).some((id) => id.startsWith('job_group_')), 'no hall class on the solo board');
    // The feature merges them only in multiplayer.
    assert.match(feature, /if \(mpMode\) mergeHalls\(catalog\);/);
    assert.match(feature, /street-jobs\.json\?v=jobs-6/);
  });
});

describe('the server table (tools/build-realtime-projects.mjs)', () => {
  it('carries each hall with its claim at the remake amount and its minutes', () => {
    const t = projectTable(catalog);
    const halls = Object.entries(t.jobs).filter(([, j]) => j.kind === 'hall');
    assert.equal(halls.length, 10);
    const job = t.jobs[694];
    assert.equal(job.claim, 200); // 10,000 / 50
    assert.equal(job.minutes, 180);
    assert.deepEqual(job.offer, [HALLS[694]]);
    assert.deepEqual(job.phases, [{ c: 'job_group_ph1_01c', delay: 0 }, { c: 'job_street_ph2_07', delay: 300 }]);
    const cls = t.classes['job_group_ph1_01c/50'];
    assert.equal(cls.rewards.xp, 15000);
    assert.equal(cls.cut, 5);
    // applyPerformanceRewards (job_group_ph1_01c.js:203-235): the trophies' table first.
    assert.deepEqual(cls.perf.drops, ['street_creation_trophies', 'street_creation_rewards_a']);
  });

  it('the server has the hall rules', { skip: skipWithoutServer }, () => {
    assert.ok(existsSync(serverPath('group_halls.go')));
    const go = readFileSync(serverPath('group_halls.go'), 'utf8');
    assert.match(go, /r\.Handle\("project_claim"|project_claim/);
    assert.match(readFileSync(serverPath('projects.go'), 'utf8'), /r\.Handle\("project_claim", m\.claim\)/);
  });
});

describe('the shared board (js/street-jobs-mp.js)', () => {
  it('merges the halls onto the board once, and shares them', () => {
    const cat = fresh();
    assert.equal(mergeHalls(cat), true);
    assert.equal(mergeHalls(cat), false);
    assert.equal(cat.jobs[694].kind, 'hall');
    assert.ok(cat.byStreet[HALLS[694]].includes('694'));
    assert.equal(cat.byStreet[HALLS[694]].filter((id) => id === '694').length, 1);
    assert.ok(cat.classes.job_group_ph1_01c);
    assert.equal(isSharedJob(cat, '694'), true);
    assert.equal(isSharedJob(catalog, '694'), false, 'solo: not a job at all');
    // The board's rules read it like any project: open, two phases, the remake's amounts.
    const state = normalizeStreetJobState({});
    assert.equal(jobStatus(state, cat, '694').status, 'open');
    assert.ok(streetJobs(state, cat, HALLS[694]).some((r) => r.jobId === '694'));
    const reqs = phaseRequirements(state, cat, '694');
    assert.equal(reqs.find((r) => r.id === 'r1021').need, 2); // 100 Hard Bubbles / 50
  });

  it('reads the server row\'s claim', () => {
    const row = rowFromServer({ phase: 0, hall: { claim: 200, minutes: 180, claimed: true, by: { id: 7, name: 'Ada' }, group: { id: 12, name: 'Ada Pals' }, until: 11_000, owned: false } }, 1000);
    assert.deepEqual(row.hall, { claim: 200, minutes: 180, claimed: true, claiming: false, owned: false, until: 10_000, by: { id: 7, name: 'Ada' }, group: { id: 12, name: 'Ada Pals' } });
    assert.equal(rowFromServer({ phase: 0 }).hall, undefined, 'a street row has none');
    assert.equal(hallFromServer(null), null);
    assert.equal(hallClock(row.hall, 10_000 - 125 * 60_000), '2 hours 5 minutes left to finish this phase.');
    assert.equal(hallClock(row.hall, 10_000 - 30_000), '1 minute left to finish this phase.');
    assert.equal(hallClock({ claimed: true, until: 0 }), '');
  });

  it('words the claim as the client did', () => {
    assert.equal(hoursText(180), '3 hours');
    assert.equal(hoursText(60), '1 hour');
    assert.equal(hoursText(3), '3 minutes');
    // JobDialog.as:802-803.
    assert.equal(HALL_TEXT.confirm(180), 'Would you like to claim this project? I\'ll go ahead and give you 3 hours to finish it up. Can you hack it?');
    assert.equal(HALL_TEXT.claim, 'Claim this project!');
    for (const text of Object.values(HALL_TEXT)) {
      const s = typeof text === 'function' ? text('X') : text;
      assert.ok(!s.includes('—'), `no em-dash: ${s}`);
    }
  });
});

describe('the site (src/LedgerHall.php)', { skip: skipWithoutSite }, () => {
  it('takes signed calls only, registers, and keeps its table', () => {
    const php = readFileSync(sitePath('src/LedgerHall.php'), 'utf8');
    assert.match(php, /ROUTE = '\/groddle\/v1\/ledger\/hall'/);
    assert.match(php, /ServiceCall::verify\(/);
    assert.match(php, /groddle_service_unsigned/);
    // Membership, one hall a group and the currants in one transaction.
    assert.match(php, /Ledger::atomically/);
    assert.match(php, /Groups::MEMBERS/);
    assert.match(php, /status = 'built'/);
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new LedgerHall\(\$minn\)/);
    const minn = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(minn.tables.groddle_group_halls.some((c) => c.startsWith('PRIMARY KEY  (claim_id)')));
  });
});
