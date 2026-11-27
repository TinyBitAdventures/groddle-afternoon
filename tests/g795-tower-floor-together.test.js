// G795 (chat 2026-11-14): friends help build a Tower floor once its owner has started it at the
// Workbench. In Glitch a floor was a Workbench job (GSJS items/tower_expander.js configureJob and
// offerJobs, quests/job_tower_floor_3..9.js, quest type 5) and items/include/jobs.js has no owner
// check for putting items or work into a job, while the Tower's other verbs were the owner's
// (furniture_tower_chassis.js pols_is_owner). Online the floor is a project the realtime server
// keeps for everyone on the floor under construction (home_projects.go kind "tower"), made from
// the site's word on the owner's save (src/HomeStreet.php towers); a visitor rides to that floor and
// its Workbench opens the shared project; what they give leaves their ledger as a street project's
// give does; the owner is told when the floor is built.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TOWER_JOBS, createTowerState, elevatorStops, finishSharedExpansion, floorJobFor, readTowerFloorWire, startExpansion, towerFloorClass, towerFloorProject, towerFloorWire } from '../public/js/home-tower.js?v=a7fc0cce';
import { normalizeTowers } from '../public/js/home-street-mp.js?v=2af2d58f';
import { projectTable } from '../tools/build-realtime-projects.mjs';
import { SITE_DIR, sitePath, serverPath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = HAS_PHP;
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';

describe('G795: the floor as a shared project (js/home-tower.js)', () => {
  it('the realtime server\'s id names the owner and the floor being built, base 36', () => {
    assert.equal(towerFloorWire(7, 2), 't7-3');
    assert.equal(towerFloorWire(1000, 8), 'trs-9');
    assert.equal(towerFloorWire(7, 9), '', 'a Tower of nine floors builds no more');
    assert.equal(towerFloorWire(0, 2), '');
    assert.deepEqual(readTowerFloorWire('t7-3'), { owner: 7, floor: 3 });
    assert.deepEqual(readTowerFloorWire('trs-9'), { owner: 1000, floor: 9 });
    for (const bad of ['t7-2', 't7-a', 'h7-3', 't-3', '']) assert.equal(readTowerFloorWire(bad), null, bad);
  });

  it('a floor\'s class is the solo Workbench\'s rows, type 5, and pays nothing (job_tower_floor_N.js onComplete)', () => {
    for (let n = 3; n <= 9; n++) {
      const id = `job_tower_floor_${n}`;
      const cls = towerFloorClass(id);
      assert.equal(cls.type, 5);
      assert.equal(cls.title, `Tower Floor ${n}`);
      assert.deepEqual(cls.rewards, {});
      assert.deepEqual(cls.requirements.map((r) => [r.id, r.num, r.baseCost, String(r.bucket)]), TOWER_JOBS[id].requirements.map((r) => [r.id, r.num, r.baseCost, String(r.bucket)]));
      assert.ok(cls.requirements.every((r) => typeof r.bucket === 'string'), 'buckets as the street-jobs catalog keeps them');
    }
    assert.equal(towerFloorClass('job_cult_tower'), null, 'building the Tower itself stays the owner\'s');
    const job = towerFloorProject(2, 't7-3');
    assert.equal(job.kind, 'restore', 'a type 5 home project, as a restoration');
    assert.equal(job.wire, 't7-3');
    assert.deepEqual(job.phases.map((p) => p.classTsid), ['job_tower_floor_3']);
    assert.equal(job.divisor, 1, 'the source amounts, as solo');
    assert.ok(job.classes.job_tower_floor_3);
    assert.equal(towerFloorProject(9, 't7-a'), null);
  });

  it('the server\'s word adds the floor once, and only the floor it names', () => {
    const st = createTowerState({ built: true, floors: 2 });
    assert.equal(finishSharedExpansion(st, 3).ok, false, 'not building');
    startExpansion(st);
    st.expansion = { r1706: 3 };
    assert.equal(finishSharedExpansion(st, 4).ok, false, 'another floor');
    assert.deepEqual(finishSharedExpansion(st, 3), { ok: true, floors: 3 });
    assert.equal(st.expanding, false);
    assert.deepEqual(st.expansion, {});
    assert.equal(finishSharedExpansion(st, 3).ok, false, 'twice is once');
    assert.equal(st.floors, 3);
  });

  it('the site\'s towers are read with care (js/home-street-mp.js normalizeTowers)', () => {
    assert.deepEqual(normalizeTowers([{ job: 't7-3', floor: 3, token: 'x.y' }, { job: 't7-3', floor: 4, token: 'x' }, { job: 'h7-c-1', floor: 3, token: 'x' }, { job: 't7-3', floor: 3 }, null]), [{ job: 't7-3', owner: 7, floor: 3, token: 'x.y' }]);
    assert.deepEqual(normalizeTowers('nope'), []);
  });
});

describe('G795: the game wiring', () => {
  it('a visitor rides to the floor under construction and finds its Workbench', () => {
    const n = read('public/js/features/neighbours-mp-feature.js');
    assert.match(n, /function towerStops\(tw\) \{\s*return elevatorStops\(tw\);\s*\}/, 'every stop, the floor going up too');
    assert.match(n, /if \(spots\.workbench\) t\.bench = engine\.register\(\{ classId: CLASS_BENCH,/);
    assert.match(n, /if \(target\.classId === CLASS_BENCH\) return \[\{ id: 'construct', label: 'construct', tooltip: 'Construct a new floor'/);
    assert.match(n, /engine\.query\?\.\('towerFloorVisit', \{ owner: visit\.owner, name: visit\.name, target \}, engine\)/);
    assert.match(n, /const x = clampToExpansion\(p\.x\);/, 'on the planks, as the owner');
    const st = createTowerState({ built: true, floors: 2 });
    startExpansion(st);
    assert.deepEqual(elevatorStops(st).map((r) => r.construction), [false, false, true]);
    const h = read('public/js/features/homes-feature.js');
    assert.match(h, /const construction = v\.tower\.built && v\.tower\.expanding && asked === v\.tower\.floors;/);
    assert.match(h, /const workbench = construction \? drawTowerBench\(eng, \{ groundY: GROUND_Y \}\) : null;/);
  });

  it('the owner\'s Workbench opens the shared floor online; starting a floor stays the owner\'s and solo is unchanged', () => {
    const t = read('public/js/features/home-tower-feature.js');
    assert.match(t, /if \(engine\.mode === 'multiplayer' && tower\.expanding && engine\.query\?\.\('towerFloorOwn', engine\)\) return true;\s*openPanel\(engine, 'project'\);/);
    assert.match(t, /finishShared: \(engine, floor\) => finishShared\(engine, floor\)/);
    const m = read('public/js/features/home-street-mp-feature.js');
    assert.match(m, /own\.towers = normalizeTowers\(street\?\.towers\);\s*sendTokens\(own\.towers\);/);
    assert.match(m, /client\.on\('msg:home_tower_floor'/);
    assert.match(m, /towerApi\.finishShared\(engine, parsed\.floor\);/);
    assert.match(m, /client\.send\('project_ack', \{ id \}\)/);
    // No visitor verb starts a floor: only construct, on a floor already going up.
    assert.doesNotMatch(read('public/js/features/neighbours-mp-feature.js'), /startExpansion|beginExpansion/);
    const j = read('public/js/features/street-jobs-feature.js');
    assert.match(j, /if \(catalog\.classes && !catalog\.classes\[cls\] && def\?\.requirements\) catalog\.classes\[cls\] = def;/);
  });

  it('the realtime server\'s table carries each floor\'s class at divisor 1 (tools/build-realtime-projects.mjs)', () => {
    const t = projectTable();
    for (const id of Object.keys(TOWER_JOBS).filter((k) => k.startsWith('job_tower_floor_'))) {
      const row = t.classes[`${id}/1`];
      assert.ok(row, id);
      assert.deepEqual(row.reqs.map((q) => [q.id, q.need, q.cost]), TOWER_JOBS[id].requirements.map((r) => [r.id, r.num, r.baseCost]), id);
      assert.deepEqual(row.rewards, {});
    }
    assert.equal(floorJobFor(2), 'job_tower_floor_3');
  });

  it('the server repo\'s data/projects.json is current with it', { skip: skipWithoutServer }, () => {
    const have = JSON.parse(readFileSync(serverPath('data', 'projects.json'), 'utf8'));
    assert.ok(have.classes['job_tower_floor_9/1']);
    assert.equal(spawnSync(process.execPath, [join(root, 'tools/build-realtime-projects.mjs'), '--check'], { cwd: root }).status, 0);
  });
});

describe('G795: the site signs the floor (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  it('towers rides with restores, signed for the caller, home_tower', () => {
    const php = readFileSync(sitePath('src/HomeStreet.php'), 'utf8');
    assert.match(php, /'towers' => \$this->towers\(\$theirs, \$me, \$owner\),/);
    assert.match(php, /RealtimeTicket::sign\(\['k' => 'home_tower', 'sub' => \$me, 'o' => \$owner, 'job' => \$row\['job'\], 'floor' => \$row\['floor'\], 'got' => \(object\) \$row\['got'\],/);
    assert.match(php, /\$state\?->systems\?->features\?->\{'home-tower'\}/);
  });

  it('only a built Tower building its next floor, and what was put in as whole counts (php)', { skip: (!hasPhp && 'no php') || noEngine }, () => {
    const out = JSON.parse(execFileSync(PHP, [join(root, 'tests/fixtures/minn-accounts/home-tower.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    assert.deepEqual(out.building, { job: towerFloorWire(7, 2), floor: 3, got: { r1706: 5, r1707: 12 } });
    assert.equal(out.big.job, towerFloorWire(1000, 8));
    for (const k of ['notExpanding', 'notBuilt', 'tallest', 'noOwner', 'none']) assert.equal(out[k], null, k);
  });
});
