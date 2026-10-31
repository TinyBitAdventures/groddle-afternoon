/**
 * Every quest the remake offers that waits for a talk with its end NPC can be handed in: that NPC
 * stands on a street the remake built, a route reaches it, and the quest's text names where.
 *
 * Austin 2026-10-31 (live v0.6.0): "there doesn't appear to be a gardening vendor on the Northwest
 * Passage so this quest isn't doable". Meet the Merchants (vendor_ping_pong_part1-4) kept its 2010
 * street names (in 2012 only the admin /testquest granted it, GSJS main.js 2358-2371), while the
 * remake stands its vendors where the archived location objects put them (street-ecology.json
 * `vendors`): no Gardening Vendor on Northwest Passage (its vendor is the Kitchen Tools street
 * spirit), no Ti Street, no vendor in the Thicket. build-quests.mjs TEXT_OVERRIDES points each part
 * at the nearest archived stand, and vendor-npcs-feature.js routes the map there.
 *
 * Quests with end NPCs that are not held for a talk turn in by themselves once complete
 * (quest-offers.js heldForNpcTurnIn), so they need no NPC to stand anywhere.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getQuestCatalog, loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { classifyQuests, heldForNpcTurnIn } from '../public/js/quest-offers.js?v=dbfa83c4';
import { vendorStreetsFor } from '../public/js/vendor-npcs.js?v=616c0568';
import { findRoute, routeGraph, ROUTE_SOURCES } from '../public/js/map-routes.js?v=5090dbb7';
import { MERCHANT_ROUTE_SOURCE, routeHeldQuests } from '../public/js/features/vendor-npcs-feature.js?v=21fabd8c';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const json = (p) => JSON.parse(readFileSync(join(PUBLIC, p), 'utf8'));
const ECOLOGY = json('assets/content/street-ecology.json');
const INDEX = json('assets/streets/index.json');
const GRAPH = routeGraph(json('assets/content/signpost-graph.json'));
const label = (tsid) => INDEX.streets[tsid]?.label || INDEX.streets[`G${tsid.slice(1)}`]?.label || tsid;
const plain = (html) => String(html || '').replace(/<[^>]+>/g, '');

/** Quests the remake can offer (solo or custom, with a giver it has) whose end NPC must be talked to. */
function heldQuests() {
  const { solo, custom } = classifyQuests();
  return [...solo, ...custom]
    .filter((row) => row.reachable)
    .map((row) => getQuestCatalog()[row.classTsid])
    .filter((def) => (def.endNpcs || []).length && heldForNpcTurnIn(def));
}

describe('quests handed in by talking to an NPC', () => {
  before(() => loadContentCatalogsFromDir(join(PUBLIC, 'assets/content')));

  it('are the four parts of Meet the Merchants', () => {
    assert.deepEqual(heldQuests().map((d) => d.classTsid).sort(), ['vendor_ping_pong_part1', 'vendor_ping_pong_part2', 'vendor_ping_pong_part3', 'vendor_ping_pong_part4']);
  });

  it('each end NPC stands on a built street a route reaches from the first street', () => {
    for (const def of heldQuests()) {
      const streets = vendorStreetsFor(ECOLOGY, def.endNpcs);
      assert.ok(streets.length, `${def.classTsid}: ${def.endNpcs} stands nowhere`);
      for (const tsid of streets) assert.ok(INDEX.streets[tsid], `${def.classTsid}: ${tsid} is not built`);
      const route = findRoute(GRAPH.graph, INDEX.default, streets, { locked: GRAPH.locked });
      assert.ok(route, `${def.classTsid}: no route from ${label(INDEX.default)} to ${streets.map(label)}`);
    }
  });

  it('each quest\'s text names a street where its NPC stands, or whose door leads to it', () => {
    for (const def of heldQuests()) {
      const stands = new Set(vendorStreetsFor(ECOLOGY, def.endNpcs));
      const named = Object.entries(INDEX.streets).filter(([, s]) => plain(def.desc).includes(s.label)).map(([tsid]) => tsid);
      const ok = named.filter((tsid) => stands.has(tsid) || (GRAPH.doors[tsid] || []).some((to) => stands.has(to)));
      assert.ok(ok.length, `${def.classTsid}: "${plain(def.desc)}" names ${named.map(label).join(', ') || 'no street'}; its NPC stands on ${[...stands].map(label).join(', ')}`);
      // The 2010 places the archive never stood a vendor on.
      assert.doesNotMatch(def.desc + def.offer, /Ti Street|Northwest Passage|the <b>Thicket<\/b>/, def.classTsid);
    }
  });

  it('accepting a part (or holding one from before) sets a map route to its vendor', () => {
    const calls = [];
    let current = null;
    const engine = {
      questState: { active: { vendor_ping_pong_part1: { classTsid: 'vendor_ping_pong_part1', progress: {} } } },
      query: (name, action, opts) => {
        calls.push([name, action, opts]);
        if (action === 'get') return current;
        current = opts;
        return { ok: true };
      },
    };
    routeHeldQuests(engine, ECOLOGY);
    const set = calls.find((c) => c[1] === 'set')[2];
    assert.equal(set.source, MERCHANT_ROUTE_SOURCE);
    assert.equal(set.quest, 'vendor_ping_pong_part1');
    assert.ok(set.to.includes('GCR101UN0NJ1QPQ'), 'Middle Arbor is a destination');
    assert.deepEqual(findRoute(GRAPH.graph, 'GLI23D3LDHD1FQA', set.to).map(label).at(-1), 'Middle Arbor');
    // Once a session: a route cleared by the player stays cleared; a route already set is kept.
    calls.length = 0;
    current = null;
    routeHeldQuests(engine, ECOLOGY);
    assert.equal(calls.length, 0);
    engine.questState.active.vendor_ping_pong_part2 = { classTsid: 'vendor_ping_pong_part2', progress: {} };
    current = { source: 'player' };
    routeHeldQuests(engine, ECOLOGY);
    assert.deepEqual(calls.map((c) => c[1]), ['get']);
    assert.ok(ROUTE_SOURCES.some((r) => r.id === MERCHANT_ROUTE_SOURCE && r.playable));
  });
});
