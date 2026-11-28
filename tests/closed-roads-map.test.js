// Ticket 37 follow-up (mr granberry, 2026-11-02): a closed road said "Help build it at the project
// board on Y, or use the Map", and our reply said the Map could teleport you there. Nothing reaches a
// street still being built: you can only teleport to streets you have visited, and Glitch refused
// even that (players/inc_teleportation.js 219-223), hid its signpost arms and locked its doors
// (locations/inc_jobs.js jobs_modify_connections), and made it no destination on the Map
// (locations/location.js not_a_destination; InteractionMenuController.as 151-153, 206-208).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { closedRoadText, closedStreets, initializeStreetJobs, normalizeStreetJobState, roadClosure } from '../public/js/street-jobs.js?v=e175c7e5';
import { findRoute } from '../public/js/map-routes.js?v=084dc311';
import { streetGraph } from '../public/js/street-graph.js?v=92206051';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const catalog = JSON.parse(read('public/assets/content/street-jobs.json'));
const graph = JSON.parse(read('public/assets/content/signpost-graph.json')).streets;
const index = JSON.parse(read('public/assets/streets/index.json'));
const label = (t) => index.streets[t]?.label || t;
const client = join(root, '../glitch-client/com/tinyspeck/engine/control/InteractionMenuController.as');
const gsjs = join(root, '../glitch-GameServerJS');

const fresh = () => {
  const state = normalizeStreetJobState({});
  initializeStreetJobs(state, [index.default]);
  return state;
};
const opts = { exemptFrom: [index.default] };

describe('ticket 37: a road under construction says what is true', () => {
  const state = fresh();
  const shut = new Set(closedStreets(state, catalog, opts));
  const [jobId, job] = Object.entries(catalog.jobs).find(([, j]) => j.kind === 'street' && shut.has(j.street) && j.connecting.some((t) => !shut.has(t)));
  const closed = roadClosure(state, catalog, job.street, [job.street], opts);
  const open = job.connecting.find((t) => !shut.has(t));

  it('signposts and doors: build it at the board here, and the road opens when it is done', () => {
    assert.equal(closed.jobId, jobId);
    const here = closedRoadText(state, catalog, closed, { here: open, label, opts });
    assert.equal(here, `The road to ${job.label} is still under construction. Help build it at the project board here on ${label(open)}, and the road opens when the project is done.`);
    const away = closedRoadText(state, catalog, closed, { here: 'GNOWHERE', via: 'door', label, opts });
    assert.match(away, new RegExp(`at the project board on ${label(open)},`), 'away: the first offering street whose road is open');
  });

  it('teleports and the Map: no way in, and never "use the Map"', () => {
    const tp = closedRoadText(state, catalog, closed, { here: open, via: 'teleport', label, opts });
    assert.equal(tp, `${job.label} is still under construction, so you can't teleport there yet. Help build it at the project board here on ${label(open)}.`);
    assert.match(closedRoadText(state, catalog, closed, { via: 'map', label, opts }), /^Still under construction\. Help build it at the project board on /);
    for (const via of ['signpost', 'door', 'teleport', 'map']) {
      const text = closedRoadText(state, catalog, closed, { here: open, via, label, opts });
      assert.doesNotMatch(text, /Map|—/, via);
    }
    assert.equal(closedRoadText(state, catalog, null), '');
  });

  it('#566 (G1075): a route through it says "still under construction" once', () => {
    const help = closedRoadText(state, catalog, closed, { via: 'route', label, opts });
    assert.match(help, /^Help build it at the project board on /);
    const resting = fresh();
    const now = 10 ** 12;
    resting.streetDone[open] = now - 5 * 60_000;
    assert.match(closedRoadText(resting, catalog, closed, { via: 'route', label, opts, now }), /^\S.* opens for help in about 25 minutes\.$/);
    assert.doesNotMatch(closedRoadText(resting, catalog, closed, { via: 'route', label, opts, now }), /under construction/);
    // The three toasts (the Map's street menu, the Projects tab, the buddy list) add the route help.
    const feature = read('public/js/features/street-jobs-feature.js');
    assert.match(feature, /note: text\('map'\), road: text\('signpost'\), help: text\('route'\) \};/);
    for (const file of ['public/game.js', 'public/js/features/street-jobs-feature.js', 'public/js/features/buddies-feature.js']) {
      const src = read(file);
      assert.match(src, /which is still under construction\. \$\{through\.help\}`/, file);
      assert.doesNotMatch(src, /which is still under construction\. \$\{through\.note\}/, file);
    }
    const toast = `No open road leads to X yet: the way runs through ${job.label}, which is still under construction. ${help}`;
    assert.equal(toast.match(/under construction/gi).length, 1);
  });

  it('#339 (G761): while the street rests after a project, the sign says when it opens, not to help now', () => {
    const resting = fresh();
    const now = 10 ** 12;
    // inc_jobs.js jobs_get_available 457-461: 30 minutes after the offering street's last project.
    resting.streetDone[open] = now - 5 * 60_000;
    const sign = closedRoadText(resting, catalog, closed, { here: open, label, opts, now, giver: () => 'the Street Spirit' });
    assert.equal(sign, `The road to ${job.label} is still under construction. ${label(open)} just finished a project, so this one opens for help in about 25 minutes. The road opens when the project is done.`);
    assert.doesNotMatch(sign, /Help build it|Street Spirit/);
    assert.match(closedRoadText(resting, catalog, closed, { here: open, via: 'teleport', label, opts, now }), /can't teleport there yet\. .* opens for help in about 25 minutes\.$/);
    assert.match(closedRoadText(resting, catalog, closed, { via: 'map', label, opts, now }), /^Still under construction\. .* in about 25 minutes\.$/);
    // The rest over, it says to help again.
    assert.match(closedRoadText(resting, catalog, closed, { here: open, label, opts, now: now + 26 * 60_000 }), /Help build it at the project board here/);
    // Between steps (readyAt) it says so too.
    const between = fresh();
    between.jobs[jobId] = { ...(between.jobs[jobId] || {}), startedAt: now - 1000, readyAt: now + 90_000 };
    assert.match(closedRoadText(between, catalog, closed, { here: open, label, opts, now }), /resting between steps and opens for help again in about 2 minutes\./);
  });

  it('#339 (G761): online, the spirit gives once the server says it has a project (not only on arrival)', () => {
    const feature = read('public/js/features/street-jobs-feature.js');
    assert.match(feature, /const refresh = \(\) => \{\n\s+\/\/ #339[^\n]*\n\s+syncGiver\(engine\);/);
    assert.match(feature, /\} else syncGiver\(engine\);/);
    const body = feature.slice(feature.indexOf('function syncGiver('), feature.indexOf('function spawnGiver('));
    assert.match(body, /if \(want && !giver\) spawnGiver\(engine, spirit\);/);
    assert.match(body, /else if \(!want && giver\) \{\n\s+giver\.indicator\.destroy\(\);\n\s+giver = null;/);
  });

  it('a street beyond a closed road: the route goes round it, or the Map says which street is in the way', () => {
    // Austin 2026-11-15: a street still being built is no destination at all (location.js not_a_destination).
    assert.equal(findRoute(streetGraph(graph, { closed: [...shut] }), index.default, job.street), null, 'a closed destination is no route');
    const game = read('public/game.js');
    assert.match(game, /const building = here \? null : features\.query\('streetUnderConstruction', street\.tsid, engine\);/);
    assert.match(game, /label: 'Set as Destination',\n\s+tip: 'Get a guided path to this location',\n\s+disabled: here \|\| Boolean\(building\),\n\s+reason: here \? MAP_ALREADY_HERE : building \? building\.note : '',/);
    assert.match(game, /const through = res && res\.ok === false \? routeThroughConstruction\(res\.through\) : null;\n\s+if \(through\) toast\(`No open road leads to \$\{street\.label\} yet: the way runs through \$\{through\.label\}, which is still under construction\. \$\{through\.help\}`, 6000\);/);
  });

  it('the feature refuses signposts, doors, teleports and follows (#549) into it, and the Map menu asks it', () => {
    const feature = read('public/js/features/street-jobs-feature.js');
    assert.match(feature, /if \(!catalog \|\| !\['signpost', 'door', 'teleport', 'follow'\]\.includes\(via\)\) return null;/);
    assert.match(feature, /streetUnderConstruction\(tsid, engine\) \{/);
    assert.doesNotMatch(feature, /or use the Map/);
    assert.match(read('public/js/features/teleportation-feature.js'), /engine\.travelGate\(target\.tsid, \{ via: 'teleport', leavesQuestRoom: true \}\)/);
  });

  it('signposts to streets not in the game no longer say "not loaded yet"', () => {
    const game = read('public/game.js');
    assert.doesNotMatch(game, /That road is not loaded yet/);
    assert.equal((game.match(/toast\(ROAD_NOT_IN_GAME\)/g) || []).length, 2);
    assert.match(game, /const ROAD_NOT_IN_GAME = "That road leads somewhere that isn't in the game\. Pick another destination on the Map\.";/);
  });

  it('the source greys both Map entries and refuses the teleport', { skip: !(existsSync(client) && existsSync(gsjs)) && 'needs glitch-client and glitch-GameServerJS beside the repo' }, () => {
    const menu = readFileSync(client, 'utf8').split('\n');
    assert.match(menu[150], /else if \(street\.not_a_destination\) \{/);
    assert.match(menu[151], /This location does not allow navigation/);
    assert.match(menu[207], /This location does not allow teleportation/);
    const tp = readFileSync(join(gsjs, 'players/inc_teleportation.js'), 'utf8').split('\n');
    assert.match(tp[218], /loc\.jobs_is_street_locked\(\)/);
    assert.match(tp[221], /Your teleportation target is unavailable\./);
  });
});
