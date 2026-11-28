/**
 * Austin 2026-11-15 (screenshots): the route to Middle Arbor from Groddle Forest Junction was drawn straight
 * through that signpost's crossed arm. Middle Arbor is itself still being built (street-jobs.json job 2), and
 * findRoute let a closed street end a route (G780 only preferred an open one of several). Glitch hid a closed
 * street's arms (inc_jobs.js jobs_modify_connections) and made it not_a_destination (location.js 2915-2935):
 * routes never use a closed connection, never end on a closed street, and say "No road there yet"; the vendor
 * finder (G774) and every other "nearest of several" takes the nearest open street it can reach.
 * Run: node --test tests/routes-closed-arm.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTE_TEXT, createRouteState, findRoute, planRoute } from '../public/js/map-routes.js?v=084dc311';
import { streetGraph } from '../public/js/street-graph.js?v=92206051';
import { VENDOR_FINDER_TEXT, vendorFinderRows, vendorRowWhere } from '../public/js/vendor-finder.js?v=7fbfc51d';

const root = join(import.meta.dirname, '..');
const graph = JSON.parse(readFileSync(join(root, 'public/assets/content/signpost-graph.json'), 'utf8')).streets;
const JUNCTION = 'GLI3272LOTD1B1F'; // Groddle Forest Junction
const ARBOR = 'GCR101UN0NJ1QPQ'; // Middle Arbor, a street project
const BEYOND = 'GLIF3AQTOFE19OR'; // Middle Arbor's other neighbour
const KALLA = 'GIF13QL5IG02UAI'; // Kalla Chase, another Gardening Tools vendor

describe('routes go round closed streets and their arms', () => {
  it('Middle Arbor still being built: no route through the crossed arm, and the Map says so', () => {
    assert.ok(graph[JUNCTION].includes(ARBOR), 'the junction has an arm to Middle Arbor');
    assert.equal(findRoute(streetGraph(graph, { closed: [ARBOR] }), JUNCTION, ARBOR), null);
    const res = planRoute(createRouteState(), streetGraph(graph, { closed: [ARBOR] }), { from: JUNCTION, to: ARBOR });
    assert.equal(res.ok, false);
    assert.equal(res.error, ROUTE_TEXT.noRoad);
    assert.equal(ROUTE_TEXT.noRoad, 'No road there yet');
    assert.equal(res.closed, ARBOR);
    // Built, it is a route like any other.
    assert.deepEqual(findRoute(graph, JUNCTION, ARBOR), [JUNCTION, ARBOR]);
  });

  it('a street beyond a closed one goes round it, never through the closed arm', () => {
    const path = findRoute(streetGraph(graph, { closed: [ARBOR] }), JUNCTION, BEYOND);
    assert.ok(path, 'there is another way');
    assert.equal(path.includes(ARBOR), false);
    assert.equal(findRoute(graph, JUNCTION, BEYOND)?.includes(ARBOR), true, 'open, the arm is the short way');
  });

  it('the vendor finder takes the nearest open street it can reach, else "No road there yet"', () => {
    const find = (streets) => {
      const p = findRoute(streetGraph(graph, { closed: [ARBOR] }), JUNCTION, streets);
      return p ? { destination: p.at(-1), hops: p.length - 1 } : null;
    };
    const kinds = [{ key: 'gardening_tools', label: 'Gardening Tools Vendor', streets: [ARBOR, KALLA] }, { key: 'only_closed', label: 'X', streets: [ARBOR] }];
    const rows = vendorFinderRows(kinds, { here: JUNCTION, find });
    const tools = rows.find((r) => r.key === 'gardening_tools');
    assert.equal(tools.destination, KALLA);
    assert.ok(tools.hops > 1);
    assert.equal(vendorRowWhere(rows.find((r) => r.key === 'only_closed')), VENDOR_FINDER_TEXT.noWay);
    assert.equal(planRoute(createRouteState(), streetGraph(graph, { closed: [ARBOR] }), { from: JUNCTION, to: [ARBOR, KALLA] }).route.destination, KALLA);
  });
});
