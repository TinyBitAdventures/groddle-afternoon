/**
 * Austin 2026-11-03: Hazy Gate 3 (job 524), the one road into Xalanga from Yellow Yawning, is
 * built in every new world, solo and the shared online world; every other project stays closed.
 * Its own board stands on Ramble Way 4, inside Xalanga, so nobody could ever have built it.
 * The list is data (tools/street-jobs-built-from-start.json), read by build-street-jobs.mjs
 * (job.builtFromStart, js/street-jobs.js isJobBuilt) and tools/build-realtime-projects.mjs (the
 * server's data/projects.json "built", projects.go buildFromStart). Glitch's admins opened a
 * street by unlocking it and left its job alone (locations/inc_admin.js admin_jobs_set_unlocked
 * 431-439), so a save with the project under way keeps what it holds and pays nothing out.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { closedStreets, initializeStreetJobs, isJobBuilt, jobStatus, normalizeStreetJobState, roadClosure, streetHasOpenProject } from '../public/js/street-jobs.js?v=7381e03e';
import { projectTable } from '../tools/build-realtime-projects.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const catalog = JSON.parse(read('public/assets/content/street-jobs.json'));
const index = JSON.parse(read('public/assets/streets/index.json'));
const HOME = index.default;
const opts = { exemptFrom: [HOME] };
const list = JSON.parse(read('tools/street-jobs-built-from-start.json')).jobs;
const HAZY = catalog.jobs['524'];
const yellow = Object.keys(index.streets).find((t) => index.streets[t].label === 'Yellow Yawning');
const fresh = () => {
  const s = normalizeStreetJobState({});
  initializeStreetJobs(s, [HOME]);
  return s;
};

describe('Hazy Gate 3 stands from the start (tools/street-jobs-built-from-start.json)', () => {
  it('the list holds just job 524, and the catalog carries it', () => {
    assert.deepEqual(Object.keys(list), ['524']);
    assert.equal(HAZY.label, 'Hazy Gate 3');
    assert.equal(HAZY.hub, 'Xalanga');
    assert.equal(HAZY.builtFromStart, list['524']);
    assert.deepEqual(Object.entries(catalog.jobs).filter(([, j]) => j.builtFromStart).map(([id]) => id), ['524']);
    assert.match(read('build-street-jobs.mjs'), /tools\/street-jobs-built-from-start\.json/);
  });

  it('a fresh world has its road open from Yellow Yawning, and every other project closed', () => {
    const state = fresh();
    assert.equal(isJobBuilt(state, catalog, '524', opts), true);
    assert.equal(jobStatus(state, catalog, '524', 0, opts).status, 'built');
    assert.equal(roadClosure(state, catalog, HAZY.street, [HAZY.street], opts), null);
    const shut = new Set(closedStreets(state, catalog, opts));
    assert.equal(shut.has(HAZY.street), false);
    assert.equal(shut.size, 672, 'the other street projects stay closed');
    // Its board (Ramble Way 4) offers nothing.
    assert.equal(streetHasOpenProject(state, catalog, HAZY.connecting[0], 0, opts), false);
    assert.ok(yellow, 'Yellow Yawning is a street');
  });

  it('a save with it under way gets it built on load and keeps its row (nothing paid, nothing taken)', () => {
    const saved = { initialized: true, grandfathered: [HOME], jobs: { 524: { phase: 0, got: { r1: 2 }, startedAt: 5 } } };
    const state = normalizeStreetJobState(JSON.parse(JSON.stringify(saved)));
    const row = JSON.stringify(state.jobs['524']);
    assert.equal(jobStatus(state, catalog, '524', 10, opts).status, 'built');
    assert.equal(JSON.stringify(state.jobs['524']), row, 'the row is as it was');
    assert.equal(jobStatus(normalizeStreetJobState(JSON.parse(JSON.stringify(state))), catalog, '524', 10, opts).status, 'built', 'again: the same');
  });

  it('the realtime server\'s table marks it built', () => {
    const t = projectTable(catalog);
    assert.equal(t.jobs['524'].built, true);
    assert.deepEqual(Object.keys(t.jobs).filter((id) => t.jobs[id].built), ['524']);
  });

  it('the server repo has the table and marks it done on start', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(readFileSync(serverPath('data', 'projects.json'), 'utf8'));
    assert.equal(data.jobs['524'].built, true);
    assert.match(readFileSync(serverPath('projects.go'), 'utf8'), /func \(m \*projects\) buildFromStart\(\) \[\]string/);
  });
});
