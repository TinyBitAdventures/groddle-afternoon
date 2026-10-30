/** Resource-node feature module: the browser-free parts (placement, persistence, starter kit). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESOURCE_FEATURE_ID,
  RESOURCE_GROUP_PREFIX,
  RESOURCE_MAIN_VERB,
  RESOURCE_PLACEMENT_CLEARANCE,
  SLOTH_ART,
  menuVerbId,
  migrateResourceStarterKit,
  normalizeResourceFeatureSlice,
  prepareStreetResourceNodes,
  resourceDemoKit,
  resourceNodesFeature,
  resourcePlacementGroups,
  resourceSpawnPlan,
  rulesVerbId,
  surfaceNear,
  verbTooltip,
} from '../public/js/features/resource-nodes-feature.js?v=cf3bfa90';
import {
  RESOURCE_NODE_CATALOG,
  RESOURCE_NODE_CLASS_IDS,
  createResourceNode,
} from '../public/js/resource-nodes.js?v=3d618d6a';
import { createFeatureHost, normalizeFeatureSlices } from '../public/js/feature-host.js?v=e4f648b1';
import { populationForStreet, planStreetPlacements } from '../public/js/street-ecology.js?v=dbcefe18';
import { STORE_CATALOG } from '../public/js/store-catalog.js?v=79d4de8a';

const population = (classes) => ({ resourceNodeClasses: classes });

describe('resource node placement groups', () => {
  it('requests one planner group per class with that class count and clearance', () => {
    const groups = resourcePlacementGroups(population([
      'npc_firefly', 'npc_firefly', 'npc_firefly', 'mortar_barnacle', 'peat_1', 'npc_sloth',
    ]));
    assert.deepEqual(groups, [
      { key: `${RESOURCE_GROUP_PREFIX}npc_firefly`, count: 3, clearance: RESOURCE_PLACEMENT_CLEARANCE.npc_firefly },
      { key: `${RESOURCE_GROUP_PREFIX}mortar_barnacle`, count: 1, clearance: RESOURCE_PLACEMENT_CLEARANCE.mortar_barnacle },
      { key: `${RESOURCE_GROUP_PREFIX}peat_1`, count: 1, clearance: RESOURCE_PLACEMENT_CLEARANCE.peat_1 },
      { key: `${RESOURCE_GROUP_PREFIX}npc_sloth`, count: 1, clearance: RESOURCE_PLACEMENT_CLEARANCE.npc_sloth },
    ]);
  });

  it('folds peat variants into peat_1 and ignores unknown or missing classes', () => {
    assert.deepEqual(resourcePlacementGroups(population(['peat_2', 'peat_3', 'npc_piggy'])), [
      { key: `${RESOURCE_GROUP_PREFIX}peat_1`, count: 2, clearance: RESOURCE_PLACEMENT_CLEARANCE.peat_1 },
    ]);
    assert.deepEqual(resourcePlacementGroups(null), []);
    assert.deepEqual(resourcePlacementGroups({}), []);
  });

  it('has a clearance and an autoplay verb for every catalog class', () => {
    for (const classTsid of RESOURCE_NODE_CLASS_IDS) {
      assert.ok(RESOURCE_PLACEMENT_CLEARANCE[classTsid] > 0, classTsid);
      const verbs = RESOURCE_NODE_CATALOG[classTsid].verbs.map((verb) => verb.id);
      assert.ok(verbs.includes(RESOURCE_MAIN_VERB[classTsid]), classTsid);
    }
  });

  it('seats real street populations on real platforms through the shared planner', () => {
    // Empty Via 6 carries dust traps, a dirt pile and a paper tree in the source.
    const pop = populationForStreet('GA510IHD1F426DS', {
      counts: { dust_trap: 2, dirt_pile: 1, paper_tree: 1, npc_firefly: 3 },
    });
    const platforms = [
      { x1: 0, y1: 900, x2: 3000, y2: 900 },
      { x1: 600, y1: 700, x2: 1400, y2: 700 },
    ];
    const plan = planStreetPlacements(platforms, [
      { key: 'player', count: 1, clearance: 190 },
      ...resourcePlacementGroups(pop),
    ], { worldW: 3000, seed: 'GA510IHD1F426DS' });
    const spawns = resourceSpawnPlan(pop, (key) => plan.groups[key] || []);
    assert.equal(spawns.length, 7);
    assert.deepEqual(
      spawns.map((s) => s.key),
      ['npc_firefly:0', 'npc_firefly:1', 'npc_firefly:2', 'dust_trap:0', 'dust_trap:1', 'dirt_pile:0', 'paper_tree:0']
    );
    for (const spawn of spawns) assert.ok(spawn.y === 900 || spawn.y === 700, `${spawn.key} on a platform`);
  });

  it('drops planned classes the planner could not seat', () => {
    const spawns = resourceSpawnPlan(population(['jellisac', 'jellisac']), () => [{ x: 10, y: 20 }]);
    assert.deepEqual(spawns, [{ key: 'jellisac:0', classTsid: 'jellisac', x: 10, y: 20 }]);
  });

  it('snaps demo nodes to the platform surface near the avatar', () => {
    const platforms = [
      { x1: 0, y1: 800, x2: 1000, y2: 800 },
      { x1: 0, y1: 500, x2: 1000, y2: 500 },
      { x1: 400, y1: 760, x2: 600, y2: 860 },
    ];
    assert.equal(surfaceNear(platforms, 200, 800), 800);
    assert.equal(surfaceNear(platforms, 500, 790), 800);
    assert.equal(surfaceNear([], 200, 812), 812);
  });
});

describe('resource node street slots', () => {
  it('creates fresh nodes keyed by class and index, then reuses the same objects', () => {
    const slot = {};
    const plan = [
      { key: 'mortar_barnacle:0', classTsid: 'mortar_barnacle', x: 100, y: 800 },
      { key: 'peat_1:0', classTsid: 'peat_1', x: 400, y: 800 },
    ];
    const first = prepareStreetResourceNodes(slot, plan, { tsid: 'GTEST', now: 1000 });
    assert.equal(first.length, 2);
    assert.equal(slot.nodes['mortar_barnacle:0'], first[0].node);
    assert.equal(first[0].node.units, 4);
    first[0].node.units = 1;
    first[0].node.regrowAt = 99_000;
    const saved = JSON.parse(JSON.stringify(slot));
    const second = prepareStreetResourceNodes(saved, plan, { tsid: 'GTEST', now: 2000 });
    assert.equal(second[0].node.units, 1);
    assert.equal(second[0].node.regrowAt, 99_000);
    assert.equal(saved.nodes['mortar_barnacle:0'], second[0].node);
  });

  it('replaces corrupt or mismatched saved rows and keeps the variant stable', () => {
    const slot = {
      nodes: {
        'dirt_pile:0': { classTsid: 'peat_1', units: 2 },
        'jellisac:0': 'garbage',
        'paper_tree:0': { classTsid: 'paper_tree', units: 99, watered: true, petted: 'yes' },
      },
    };
    const plan = [
      { key: 'dirt_pile:0', classTsid: 'dirt_pile', x: 0, y: 0 },
      { key: 'jellisac:0', classTsid: 'jellisac', x: 0, y: 0 },
      { key: 'paper_tree:0', classTsid: 'paper_tree', x: 0, y: 0 },
    ];
    const rows = prepareStreetResourceNodes(slot, plan, { tsid: 'GTEST' });
    assert.equal(rows[0].node.classTsid, 'dirt_pile');
    assert.equal(rows[0].node.units, 11);
    assert.equal(rows[1].node.classTsid, 'jellisac');
    assert.equal(rows[2].node.units, 21);
    assert.equal(rows[2].node.watered, true);
    assert.equal(rows[2].node.petted, false);
    const again = prepareStreetResourceNodes({}, plan, { tsid: 'GTEST' });
    assert.equal(again[0].node.variant, rows[0].node.variant);
  });

  it('survives the player-save feature-slice normalizer', () => {
    const slot = {};
    prepareStreetResourceNodes(slot, [
      { key: 'npc_sloth:0', classTsid: 'npc_sloth', x: 0, y: 0 },
    ], { tsid: 'GTEST' });
    const kept = normalizeFeatureSlices({ [RESOURCE_FEATURE_ID]: slot });
    assert.equal(kept[RESOURCE_FEATURE_ID].nodes['npc_sloth:0'].classTsid, 'npc_sloth');
  });
});

describe('resource feature save slice', () => {
  it('normalizes the Firefly Jar and starter kit flag', () => {
    assert.deepEqual(normalizeResourceFeatureSlice(undefined), { jar: { flies: 0 }, starterKit: false });
    assert.deepEqual(
      normalizeResourceFeatureSlice({ jar: { flies: 99 }, starterKit: true }),
      { jar: { flies: 7 }, starterKit: true }
    );
    assert.deepEqual(
      normalizeResourceFeatureSlice({ jar: { num_flies: '3' }, starterKit: 'yes' }),
      { jar: { flies: 3 }, starterKit: false }
    );
  });

  it('round-trips through the feature host save and restore', () => {
    const host = createFeatureHost([resourceNodesFeature]);
    const engine = { inv: {} };
    host.restore({ [RESOURCE_FEATURE_ID]: { jar: { flies: 5 }, starterKit: true } }, engine);
    const saved = host.save();
    assert.deepEqual(saved[RESOURCE_FEATURE_ID], { jar: { flies: 5 }, starterKit: true });
    assert.deepEqual(engine.inv, {});
  });
});

describe('resource starter kit migration', () => {
  it('grants a Scraper, Shovel and Firefly Jar once to a pack that never had them', () => {
    const inv = { apple: 2 };
    const state = { starterKit: false };
    assert.deepEqual(migrateResourceStarterKit(inv, state).sort(), ['firefly_jar', 'scraper', 'shovel']);
    assert.deepEqual(inv, { apple: 2, scraper: 1, shovel: 1, firefly_jar: 1 });
    assert.equal(state.starterKit, true);
    delete inv.scraper;
    assert.deepEqual(migrateResourceStarterKit(inv, state), []);
    assert.equal(inv.scraper, undefined);
  });

  it('preserves deliberate zeroes and existing stacks', () => {
    const inv = { scraper: 0, shovel: 2 };
    const state = { starterKit: false };
    assert.deepEqual(migrateResourceStarterKit(inv, state), ['firefly_jar']);
    assert.deepEqual(inv, { scraper: 0, shovel: 2, firefly_jar: 1 });
  });

  it('migrates an existing save on restore, but not one already migrated', () => {
    const host = createFeatureHost([resourceNodesFeature]);
    const legacy = { inv: { hatchet: 1 } };
    host.restore({}, legacy);
    assert.deepEqual(legacy.inv, { hatchet: 1, scraper: 1, shovel: 1, firefly_jar: 1 });
    assert.equal(host.save()[RESOURCE_FEATURE_ID].starterKit, true);
    const sold = { inv: { hatchet: 1 } };
    host.restore({ [RESOURCE_FEATURE_ID]: { starterKit: true } }, sold);
    assert.deepEqual(sold.inv, { hatchet: 1 });
  });

  it('can buy every starter tool from a source street-spirit store', () => {
    const sellers = (classTsid) => STORE_CATALOG
      .filter((store) => store.offers.some((offer) => offer.classTsid === classTsid))
      .map((store) => store.key);
    assert.deepEqual(sellers('scraper').sort(), ['alchemical', 'hardware', 'tools']);
    assert.deepEqual(sellers('shovel').sort(), ['gardening', 'hardware', 'tools']);
    assert.deepEqual(sellers('firefly_jar'), ['alchemical']);
    // The source stores never stocked the premium tools.
    assert.deepEqual(sellers('super_scraper'), []);
    assert.deepEqual(sellers('ace_of_spades'), []);
  });
});

describe('resource QA and menu helpers', () => {
  it('kits each demo node with the tool or rods its main verb needs', () => {
    assert.deepEqual(resourceDemoKit('mortar_barnacle').items, { scraper: 1 });
    assert.deepEqual(resourceDemoKit('peat_3').items, { shovel: 1 });
    assert.equal(resourceDemoKit('peat_3').classTsid, 'peat_1');
    assert.deepEqual(resourceDemoKit('paper_tree').items, { watering_can: 1 });
    assert.deepEqual(resourceDemoKit('npc_firefly').items, { firefly_jar: 1 });
    const sloth = resourceDemoKit('npc_sloth');
    assert.deepEqual(sloth.items, { metal_rod: 3 });
    assert.equal(sloth.skill, 'animalkinship_3');
    assert.equal(sloth.verb, 'knock');
    assert.equal(resourceDemoKit('nope'), null);
  });

  it('keeps the Sloth feed verb away from the animal food picker', () => {
    assert.equal(menuVerbId('feed'), 'feed_rod');
    assert.equal(rulesVerbId('feed_rod'), 'feed');
    assert.equal(menuVerbId('scrape'), 'scrape');
    assert.equal(rulesVerbId('knock'), 'knock');
  });

  it('fills GSJS tooltip templates and drops the Flash drag hint', () => {
    assert.equal(
      verbTooltip({ tooltip: 'Or, drag scraper to barnacle. Costs $energy_cost energy and takes $seconds seconds', durationMs: 4000, costs: { energy: 2 } }),
      'Costs 2 energy and takes 4 seconds'
    );
    assert.equal(verbTooltip({ tooltip: 'Give love', durationMs: 2000 }), 'Give love');
  });

  it('draws the Sloth as self-contained SVG', () => {
    for (const svg of [SLOTH_ART.tree(), SLOTH_ART.hidden(), SLOTH_ART.body('idle'), SLOTH_ART.body('eating', 'chew')]) {
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      assert.doesNotMatch(svg, /undefined|NaN|<image|href=/);
    }
    assert.match(SLOTH_ART.body('eating', 'open'), /url\(#rod\)/);
  });

  it('owns only its own targets in the feature host', () => {
    const host = createFeatureHost([resourceNodesFeature]);
    assert.equal(host.verbsFor({ featureId: 'hell' }, {}), null);
    assert.deepEqual(host.verbsFor({ featureId: RESOURCE_FEATURE_ID, classId: 'mortar_barnacle' }, {}), []);
    assert.ok(createResourceNode('mortar_barnacle'));
  });
});
