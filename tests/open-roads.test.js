/**
 * The open-road rule (root R11, register G1075): one rule for the Map, the Projects tab, travel and
 * the realtime server's featured project.
 *
 * Report #566 (2026-11-20): the featured project was Parsin's Trail SE in Baqala, whose board street
 * was built but stood in a pocket no open road joined to the world (the server's pick checked one
 * neighbour). In chat the same evening the Map showed Parsin's Trail SW open for one player while his
 * Projects tab listed it as under way, and a friend saw it closed: a street you have stood on stays
 * open for you alone (state.grandfathered), and nothing said so.
 *
 * js/open-roads.js is the rule; groddle-afternoon-server openroads.go is its mirror, and
 * testdata/open-roads.json in that repo holds cases both answer (its openroads_test.go replays the
 * same file). Glitch locked a street being built for the whole world (locations/inc_jobs.js
 * jobs_modify_connections 530-622); the per-player layer is the remake's (ticket 50).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { builtForEveryone, closedForEveryone, exemptForEveryone, freeWays, keptForYou, openWorld, projectReachable } from '../public/js/open-roads.js?v=2e03b0a6';
import { closedStreets, isJobBuilt, jobStatus, normalizeStreetJobState } from '../public/js/street-jobs.js?v=76471e42';
import { projectEntry, PROJECTS_TEXT } from '../public/js/projects-tracker.js?v=78916eff';
import { TELEPORTERS } from '../public/js/hidden-floors.js?v=023336cb';
import { WINTRY_PORTAL_TELEPORTERS } from '../public/js/wintry-portal.js?v=1437deda';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/** A case's jobs as the game's catalog has them (built: built from the start). */
function catalogOf(c) {
  const jobs = {};
  for (const [id, j] of Object.entries(c.jobs)) {
    jobs[id] = { kind: j.kind, street: j.street, connecting: j.connecting || [], builtFromStart: Boolean(j.built), phases: [{ classTsid: 'c1' }] };
  }
  return { jobs, byStreet: {} };
}
const rowsOf = (c) => Object.fromEntries((c.done || []).map((id) => [id, { doneAt: 1 }]));

describe('testdata/open-roads.json: the game answers as the server does', { skip: skipWithoutServer }, () => {
  const cases = skipWithoutServer ? [] : JSON.parse(readFileSync(serverPath('testdata', 'open-roads.json'), 'utf8')).cases;

  it('has the cases', () => assert.ok(cases.length >= 3));

  it('works out the server\'s exempt flag (a subway street, a road from the start)', () => {
    for (const c of cases) {
      for (const [id, j] of Object.entries(c.jobs)) {
        assert.equal(exemptForEveryone(catalogOf(c).jobs[id], { starters: [c.start] }), Boolean(j.exempt), `${c.name}: job ${id}`);
      }
    }
  });

  it('closes the same streets, walks the same open world and reaches the same projects', () => {
    for (const c of cases) {
      const catalog = catalogOf(c);
      const closed = closedForEveryone(catalog, rowsOf(c), { starters: [c.start] });
      assert.deepEqual(closed, c.closed, `${c.name}: closed`);
      const reach = openWorld(c.roads, { closed, starter: c.start, free: c.free });
      assert.deepEqual([...reach].sort(), c.reach, `${c.name}: open world`);
      const reachable = Object.entries(c.jobs)
        .filter(([id, j]) => !builtForEveryone(catalog.jobs[id], rowsOf(c)[id], { starters: [c.start] }) && projectReachable(j, j.offer, reach))
        .map(([id]) => id)
        .sort();
      assert.deepEqual(reachable, c.reachable, `${c.name}: reachable projects`);
      assert.ok(!c.featured || reachable.includes(c.featured), `${c.name}: the featured project is reachable`);
    }
  });

  it('a street one player has stood on opens for that player only', () => {
    const c = cases.find((x) => x.kept?.length);
    const catalog = catalogOf(c);
    const state = normalizeStreetJobState({ grandfathered: c.kept, jobs: rowsOf(c) });
    const opts = { exemptFrom: [c.start] };
    // Open for you: the Map, signposts and routes (closedStreets) leave it out.
    for (const t of c.kept) assert.ok(!closedStreets(state, catalog, opts).includes(t), t);
    // Still closed for everyone, still the world's to build (the Projects tab, the server).
    assert.deepEqual(closedForEveryone(catalog, state.jobs, { starters: [c.start] }), c.closed);
    const gx = Object.keys(catalog.jobs).find((id) => catalog.jobs[id].street === 'GX');
    assert.equal(jobStatus(state, catalog, gx, 0, { ...opts, sharedWorld: true }).status, 'open');
    assert.equal(keptForYou(state, catalog, 'GX', { starters: [c.start] }), true);
    // A kept street the world has built is simply open.
    assert.equal(keptForYou(state, catalog, 'GB', { starters: [c.start] }), false);
  });
});

describe('the game\'s callers use the rule', () => {
  const catalog = readJson('public/assets/content/street-jobs.json');
  const index = readJson('public/assets/streets/index.json');

  it('isJobBuilt\'s world answer is builtForEveryone for every street project', () => {
    const state = normalizeStreetJobState({});
    let n = 0;
    for (const [id, job] of Object.entries(catalog.jobs)) {
      if (job.kind !== 'street') continue;
      n += 1;
      assert.equal(isJobBuilt(state, catalog, id, { exemptFrom: [index.default], mine: false }), builtForEveryone(job, null, { starters: [index.default] }), id);
    }
    assert.ok(n > 600, `${n} street projects`);
  });

  it('the Projects tab says when a project\'s road is open only for you', () => {
    const id = Object.keys(catalog.jobs).find((k) => catalog.jobs[k].kind === 'street' && !builtForEveryone(catalog.jobs[k], null, { starters: [index.default] }));
    const job = catalog.jobs[id];
    const state = normalizeStreetJobState({ grandfathered: [job.street] });
    const opts = { exemptFrom: [index.default], sharedWorld: true };
    const e = projectEntry(state, catalog, id, { phase: 0, got: {}, mine: {} }, { now: 0, opts });
    assert.equal(e.finished, false);
    assert.equal(e.keptForYou, true);
    assert.equal(projectEntry(normalizeStreetJobState({}), catalog, id, { phase: 0, got: {}, mine: {} }, { now: 0, opts }).keptForYou, false);
    assert.match(PROJECTS_TEXT.keptForYou, /open for you/);
    assert.doesNotMatch(PROJECTS_TEXT.keptForYou, /[—–]/);
    // Solo: a kept street counts as built (nobody else to build it), so no line.
    assert.equal(projectEntry(state, catalog, id, { phase: 0, got: {}, mine: {} }, { now: 0, opts: { exemptFrom: [index.default] } }).keptForYou, false);
  });
});

describe('the server walks the game\'s roads (data/projects.json)', { skip: skipWithoutServer }, () => {
  it('carries the starter street, the roads and the free ways the game walks, and the same closed streets', () => {
    const data = JSON.parse(readFileSync(serverPath('data', 'projects.json'), 'utf8'));
    const catalog = readJson('public/assets/content/street-jobs.json');
    const index = readJson('public/assets/streets/index.json');
    const graph = readJson('public/assets/content/signpost-graph.json');
    assert.equal(data.start, index.default);
    // A new world: the projects built from the start are done.
    const rows = Object.fromEntries(Object.entries(catalog.jobs).filter(([, j]) => j.builtFromStart).map(([id]) => [id, { doneAt: 1 }]));
    const closed = closedForEveryone(catalog, rows, { starters: [index.default] });
    // projects_featured.go closedStreets over the table's flags.
    const serverClosed = [...new Set(Object.values(data.jobs).filter((j) => j.kind === 'street' && !j.built && !j.exempt).map((j) => j.street))].sort();
    assert.deepEqual(serverClosed, closed);
    const free = freeWays([...TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS]);
    const game = openWorld(graph, { closed, starter: index.default, free });
    const server = openWorld(data.roads, { closed, starter: data.start, free: data.free });
    assert.deepEqual([...server].sort(), [...game].sort());
    assert.ok(game.size > 20 && game.has(index.default), `${game.size} streets in a new world's open world`);
  });
});
