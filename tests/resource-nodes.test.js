/** Harvestable world resource nodes (GSJS-derived, pure module). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RESOURCE_NODE_CATALOG,
  RESOURCE_NODE_CLASS_IDS,
  RESOURCE_ITEM_DEFS,
  FIREFLY_JAR_MAX,
  FIREFLY_JAR_SHEETS,
  createResourceNode,
  tickResourceNode,
  harvestResourceNode,
  resourceNodeVerbs,
  resourceNodeStatusLabel,
  resourceNodeFrame,
  isResourceNodeHarvestable,
  normalizeResourceNode,
  normalizeResourceNodes,
  createFireflyJarState,
  normalizeFireflyJarState,
  resolveResourceSkillPackage,
  ensureResourceItems,
  starterResourceTools,
  resourceVendorOffers,
  resourceSpritePaths,
  resourceItemIds,
  sheetFrameRect,
} from '../public/js/resource-nodes.js?v=g414-1';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=catalog-unified-7';
import {
  TOOL_CONDITION_CATALOG,
  createToolConditionState,
  getToolCondition,
  setToolRemaining,
} from '../public/js/tools.js?v=woodcutting-test-8';
import {
  setStreetEcologyCatalog,
  ecologyForStreet,
  populationForStreet,
  RESOURCE_NODE_CLASSES,
} from '../public/js/street-ecology.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(__dirname, '../public');
const NOW = 1_800_000_000_000;
const DAY = '2026-01-01';

/** Deterministic rng: returns the given values in order, then repeats the last. */
function seq(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function pngSize(relPath) {
  const buf = readFileSync(join(publicRoot, relPath));
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${relPath} PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function snapshot(...objects) {
  return JSON.stringify(objects);
}

function ctxBase(extra = {}) {
  return { now: NOW, dayKey: DAY, rng: seq(0.5), ...extra };
}

describe('resource node catalog', () => {
  it('covers the ten archived world resource classes with verbs, stock and source citations', () => {
    assert.deepEqual(RESOURCE_NODE_CLASS_IDS, [
      'npc_firefly', 'npc_salmon', 'mortar_barnacle', 'ice_knob', 'jellisac',
      'dirt_pile', 'peat_1', 'paper_tree', 'npc_sloth', 'dust_trap',
    ]);
    for (const def of Object.values(RESOURCE_NODE_CATALOG)) {
      assert.ok(def.label && def.labelPlural, def.classTsid);
      assert.match(def.source, /\.js/, def.classTsid);
      assert.ok(def.verbs.length >= 1, def.classTsid);
      assert.ok(['grow', 'respawn', 'tend', 'session'].includes(def.stock.model), def.classTsid);
      for (const verb of def.verbs) {
        assert.ok(verb.id && verb.label, `${def.classTsid} verb`);
        assert.ok(Array.isArray(verb.tools), `${def.classTsid}.${verb.id} tools`);
        for (const key of ['durationMs', 'energy', 'mood', 'xp', 'toolWear']) {
          assert.equal(typeof verb[key], 'number', `${def.classTsid}.${verb.id}.${key}`);
        }
        assert.ok(Array.isArray(verb.yields), `${def.classTsid}.${verb.id} yields`);
      }
    }
    assert.deepEqual(
      Object.fromEntries(Object.values(RESOURCE_NODE_CATALOG).map((d) => [d.classTsid, d.verbs.map((v) => v.id)])),
      {
        npc_firefly: ['open'],
        npc_salmon: ['pocket'],
        mortar_barnacle: ['scrape'],
        ice_knob: ['scrape'],
        jellisac: ['scoop'],
        dirt_pile: ['dig'],
        peat_1: ['harvest'],
        paper_tree: ['harvest', 'water', 'pet'],
        npc_sloth: ['knock', 'feed'],
        dust_trap: ['trigger'],
      }
    );
  });

  it('records measured frame grids that match every sheet on disk', () => {
    const paths = resourceSpritePaths();
    assert.ok(paths.length >= 60, String(paths.length));
    const sheets = [
      ...Object.values(RESOURCE_NODE_CATALOG).flatMap((d) => Object.values(d.sprite?.sheets || {})),
      ...Object.values(FIREFLY_JAR_SHEETS).flatMap((byState) => Object.values(byState)),
    ];
    for (const s of sheets) {
      assert.ok(s.path.startsWith('assets/sprites/resources/'), s.path);
      assert.ok(existsSync(join(publicRoot, s.path)), s.path);
      const { w, h } = pngSize(s.path);
      assert.equal(w, s.frameWidth * s.cols, `${s.path} width`);
      assert.equal(h, s.frameHeight * s.rows, `${s.path} height`);
      assert.ok(s.frameCount <= s.cols * s.rows && s.frameCount >= 1, s.path);
    }
    assert.equal(RESOURCE_NODE_CATALOG.npc_sloth.art, 'vector');
    assert.match(RESOURCE_NODE_CATALOG.npc_sloth.vector.draw, /bandana/);
    for (const def of Object.values(RESOURCE_NODE_CATALOG)) {
      if (def.art === 'raster') assert.ok(def.sprite.sheets[def.sprite.defaultSheet], def.classTsid);
    }
    assert.deepEqual(sheetFrameRect(RESOURCE_NODE_CATALOG.dirt_pile.sprite.sheets.dirt1, 10), {
      x: 390, y: 142, w: 195, h: 71, index: 10,
    });
  });

  it('ships an icon for every yield, tool, broken tool and dust-trap drop', () => {
    for (const id of resourceItemIds()) {
      assert.ok(existsSync(join(publicRoot, `assets/sprites/icons/${id}.png`)), id);
    }
    for (const id of ['scraper', 'super_scraper', 'shovel', 'ace_of_spades']) {
      assert.ok(existsSync(join(publicRoot, `assets/sprites/icons/${id}_broken.png`)), `${id}_broken`);
    }
    for (const def of Object.values(RESOURCE_NODE_CATALOG)) {
      for (const verb of def.verbs) {
        for (const tool of verb.tools) {
          if (tool === 'irrigator_9000') continue;
          assert.ok(existsSync(join(publicRoot, `assets/sprites/icons/${tool}.png`)), tool);
        }
      }
    }
  });

  it('registers tools and yields in the shared item catalog with GSJS metadata', () => {
    ensureResourceItems();
    assert.equal(ITEM_CATALOG.scraper.isTool, true);
    assert.equal(ITEM_CATALOG.scraper.baseCost, 300);
    assert.equal(ITEM_CATALOG.super_scraper.baseCost, 2000);
    assert.equal(ITEM_CATALOG.shovel.isTool, true);
    assert.equal(ITEM_CATALOG.firefly_jar.isTool, true);
    assert.equal(ITEM_CATALOG.salmon.label, 'Pocket Salmon');
    assert.equal(ITEM_CATALOG.salmon.stackMax, 40);
    assert.equal(ITEM_CATALOG.peat.label, 'Block of Peat');
    assert.equal(ITEM_CATALOG.paper.stackMax, 250);
    assert.equal(ITEM_CATALOG.gem_diamond.label, 'Walloping Big Diamond');
    assert.deepEqual(starterResourceTools(), { scraper: 1, shovel: 1, firefly_jar: 1 });
    assert.deepEqual(
      resourceVendorOffers().map((o) => [o.classTsid, o.buyPrice]),
      [['scraper', 300], ['super_scraper', 2000], ['shovel', 300], ['ace_of_spades', 3000], ['firefly_jar', 100]]
    );
    for (const id of Object.keys(RESOURCE_ITEM_DEFS)) assert.ok(ITEM_CATALOG[id], id);
  });

  it('adds GSJS tool capacities to tools.js', () => {
    assert.equal(TOOL_CONDITION_CATALOG.scraper.capacity, 50);
    assert.equal(TOOL_CONDITION_CATALOG.super_scraper.capacity, 250);
    assert.equal(TOOL_CONDITION_CATALOG.shovel.capacity, 100);
    assert.equal(TOOL_CONDITION_CATALOG.ace_of_spades.capacity, 500);
    assert.equal(TOOL_CONDITION_CATALOG.ace_of_spades.baseCost, 3000);
  });

  it('resolves skill packages by highest learned rank and img upgrades', () => {
    assert.equal(resolveResourceSkillPackage('dig_dirt_pile', []).energy_cost, 6);
    const sa4 = resolveResourceSkillPackage('dig_dirt_pile', ['soil_appreciation_1', 'soil_appreciation_4']);
    assert.equal(sa4.skill, 'soil_appreciation_4');
    assert.equal(sa4.duration, 2000);
    assert.equal(sa4.bonus_amount, 4);
    const scrape = resolveResourceSkillPackage('scraping', [], ['barnacle_scraping_drop_1', 'barnacle_scraping_speed_1']);
    assert.equal(scrape.duration, 2000, 'two rank-0 upgrades both apply');
    assert.equal(scrape.drop_chance, 6);
    const hands = resolveResourceSkillPackage('jellisac_scooping', ['jellisac_hands_1'], ['jellisac_hands_speed_1']);
    assert.equal(hands.duration, 1000);
    assert.equal(hands.energy_cost, 5);
  });
});

describe('scraping: Mortar Barnacle and Ice Nubbin', () => {
  it('scrapes a ready barnacle with a scraper, wears the tool, and regrows 30-180 s per stage', () => {
    const node = createResourceNode('mortar_barnacle', { seed: 'a' });
    const inv = { scraper: 1 };
    const pc = { energy: 50, imagination: 0, xp: 0 };
    const toolState = createToolConditionState();
    const r = harvestResourceNode(node, inv, pc, ctxBase({ toolState, rng: seq(0) }));
    assert.equal(r.ok, true, r.message);
    assert.equal(r.verbId, 'scrape');
    assert.deepEqual(r.outputs, [{ classTsid: 'barnacle', qty: 1 }]);
    assert.deepEqual(r.costs, { energy: 2, mood: 0, xp: 2, toolWear: 1 });
    assert.equal(r.durationMs, 4000);
    assert.equal(r.toolUsed, 'scraper');
    assert.equal(inv.barnacle, 1);
    assert.equal(pc.energy, 48);
    assert.equal(pc.imagination, 2);
    assert.equal(getToolCondition(toolState, 'scraper').remaining, 49);
    assert.equal(node.units, 1);
    assert.equal(node.regrowAt, NOW + 30000);
    assert.equal(isResourceNodeHarvestable(node), false);
    assert.equal(resourceNodeFrame(node, NOW).frameIndex, 0);

    const again = harvestResourceNode(node, inv, pc, ctxBase());
    assert.equal(again.ok, false);
    assert.equal(again.reason, 'not_ready');
    assert.equal(again.message, 'This barnacle is not ready yet!');

    assert.equal(tickResourceNode(node, NOW + 29999, seq(0)), false);
    assert.equal(tickResourceNode(node, NOW + 30000 + 30000 + 30000, seq(0)), true);
    assert.equal(node.units, 4);
    assert.equal(node.regrowAt, 0);
    assert.equal(resourceNodeFrame(node).frameIndex, 3);
  });

  it('prefers a Super Scraper and rolls the exact Ice Nubbin amount table', () => {
    const inv = { scraper: 1, super_scraper: 1 };
    const pc = { energy: 50 };
    const toolState = createToolConditionState();
    const one = harvestResourceNode(createResourceNode('ice_knob'), inv, pc, ctxBase({ toolState, rng: seq(0.48) }));
    assert.equal(one.toolUsed, 'super_scraper');
    assert.deepEqual(one.outputs, [{ classTsid: 'ice', qty: 1 }]);
    assert.deepEqual(one.costs, { energy: 4, mood: 0, xp: 3, toolWear: 2 });
    assert.deepEqual(one.achievementCounters, [{ counter: 'ice:ice_received', amount: 1 }]);
    assert.equal(getToolCondition(toolState, 'super_scraper').remaining, 248);
    const two = harvestResourceNode(createResourceNode('ice_knob'), inv, pc, ctxBase({ rng: seq(0.6) }));
    assert.equal(two.outputs[0].qty, 2);
    const three = harvestResourceNode(createResourceNode('ice_knob'), inv, pc, ctxBase({ rng: seq(0.95) }));
    assert.equal(three.outputs[0].qty, 3);
    const upgraded = harvestResourceNode(createResourceNode('ice_knob'), inv, pc, ctxBase({ rng: seq(0.95), upgrades: ['ice_scraping_yield'] }));
    assert.equal(upgraded.outputs[0].qty, 5);
    assert.equal(inv.ice, 11);
  });

  it('fails atomically without a scraper, with a broken scraper, or without enough energy', () => {
    const node = createResourceNode('mortar_barnacle');
    const pc = { energy: 50, imagination: 0 };
    const empty = {};
    const toolState = createToolConditionState();
    const before = snapshot(node, empty, pc, toolState);
    const none = harvestResourceNode(node, empty, pc, ctxBase({ toolState }));
    assert.equal(none.ok, false);
    assert.equal(none.reason, 'no_tool');
    assert.equal(none.message, "You'll need a working scraper first.");
    assert.equal(snapshot(node, empty, pc, toolState), before);

    const inv = { scraper: 1 };
    setToolRemaining(toolState, 'scraper', 0);
    const before2 = snapshot(node, inv, pc, toolState);
    const broken = harvestResourceNode(node, inv, pc, ctxBase({ toolState }));
    assert.equal(broken.reason, 'broken_tool');
    assert.match(broken.message, /Scraper has become broken/);
    assert.equal(snapshot(node, inv, pc, toolState), before2);

    // A working second scraper is used when the first is broken.
    inv.super_scraper = 1;
    setToolRemaining(toolState, 'super_scraper', 0);
    setToolRemaining(toolState, 'scraper', 10);
    const fallback = harvestResourceNode(node, inv, pc, ctxBase({ toolState }));
    assert.equal(fallback.ok, true);
    assert.equal(fallback.toolUsed, 'scraper');

    const tired = { energy: 2 };
    const node2 = createResourceNode('mortar_barnacle');
    const before3 = snapshot(node2, inv, tired, toolState);
    const lowEnergy = harvestResourceNode(node2, inv, tired, ctxBase({ toolState }));
    assert.equal(lowEnergy.reason, 'energy', 'GSJS needs energy > energy_cost');
    assert.equal(snapshot(node2, inv, tired, toolState), before3);
  });
});

describe('Jellisac Growth', () => {
  it('scoops by hand, honors Jellisac Hands, super harvests, and regrows every 5 min', () => {
    const node = createResourceNode('jellisac');
    const inv = {};
    const pc = { energy: 40, imagination: 0 };
    const plain = harvestResourceNode(node, inv, pc, ctxBase());
    assert.equal(plain.ok, true);
    assert.equal(plain.verbId, 'scoop');
    assert.deepEqual(plain.costs, { energy: 6, mood: 0, xp: 1, toolWear: 0 });
    assert.equal(plain.durationMs, 4000);
    assert.equal(inv.jellisac_clump, 1);
    assert.equal(node.units, 1);
    assert.equal(node.regrowAt, NOW + 300000);
    tickResourceNode(node, NOW + 4 * 300000);
    assert.equal(node.units, 5);

    const skilled = harvestResourceNode(node, inv, pc, ctxBase({ skills: ['jellisac_hands_1'], rng: seq(0.01, 0) }));
    assert.equal(skilled.durationMs, 2000);
    assert.deepEqual(skilled.costs, { energy: 5, mood: 0, xp: 3, toolWear: 0 });
    assert.deepEqual(skilled.superHarvest, { classTsid: 'jellisac_clump', qty: 3 });
    assert.equal(inv.jellisac_clump, 5);
    assert.match(skilled.msgs.join(' '), /Super Harvest/);
  });
});

describe('Dirt Pile and Peat Bog (shovels)', () => {
  it('digs earth, rolls loam by Soil Appreciation rank, and caps digs per game day', () => {
    const node = createResourceNode('dirt_pile', { seed: 'x' });
    assert.ok(['dirt1', 'dirt2'].includes(node.variant));
    const inv = { shovel: 1 };
    const pc = { energy: 100, imagination: 0 };
    const toolState = createToolConditionState();
    const first = harvestResourceNode(node, inv, pc, ctxBase({ toolState }));
    assert.equal(first.ok, true);
    assert.deepEqual(first.outputs, [{ classTsid: 'earth', qty: 2 }]);
    assert.deepEqual(first.costs, { energy: 6, mood: 0, xp: 0, toolWear: 2 });
    assert.equal(first.durationMs, 6000);
    assert.equal(node.units, 10);
    assert.equal(resourceNodeFrame(node).frameIndex, 1);
    assert.equal(getToolCondition(toolState, 'shovel').remaining, 98);

    const loam = harvestResourceNode(node, inv, pc, ctxBase({ skills: ['soil_appreciation_4'], rng: seq(0.05, 0.5) }));
    assert.deepEqual(loam.outputs, [{ classTsid: 'loam', qty: 4 }]);
    assert.equal(loam.costs.energy, 3);
    assert.equal(loam.costs.xp, 4);

    const third = harvestResourceNode(node, inv, pc, ctxBase({ skills: ['soil_appreciation_4'], rng: seq(0.99) }));
    assert.deepEqual(third.outputs, [{ classTsid: 'earth', qty: 4 }]);

    const before = snapshot(node, inv, pc);
    const capped = harvestResourceNode(node, inv, pc, ctxBase());
    assert.equal(capped.reason, 'daily_limit');
    assert.equal(capped.message, "You've dug this dirt pile enough for today.");
    assert.equal(snapshot(node, inv, pc), before);
    assert.equal(harvestResourceNode(node, inv, pc, ctxBase({ upgrades: ['soil_appreciation_dirt_pile_1'] })).ok, true);
    assert.equal(harvestResourceNode(node, inv, pc, ctxBase({ dayKey: '2026-01-02' })).ok, true, 'new game day');
  });

  it('stops digging at dirt_state 1 and refills one step every 5 minutes', () => {
    const node = createResourceNode('dirt_pile', { units: 2 });
    const inv = { ace_of_spades: 1 };
    const pc = { energy: 100 };
    const r = harvestResourceNode(node, inv, pc, ctxBase());
    assert.equal(r.toolUsed, 'ace_of_spades');
    assert.equal(node.units, 1);
    assert.equal(resourceNodeFrame(node).frameIndex, 10);
    const empty = harvestResourceNode(node, inv, pc, ctxBase({ dayKey: 'other' }));
    assert.equal(empty.reason, 'not_ready');
    tickResourceNode(node, NOW + 300000);
    assert.equal(node.units, 2);
  });

  it('harvests peat once per bog per game day, with Bog Specialization and upgrades', () => {
    const node = createResourceNode('peat_3');
    assert.equal(node.classTsid, 'peat_1');
    assert.equal(node.variant, 'peat3');
    const inv = { shovel: 1 };
    const pc = { energy: 100, imagination: 0 };
    const r = harvestResourceNode(node, inv, pc, ctxBase({ rng: seq(0) }));
    assert.equal(r.ok, true);
    assert.equal(r.verbId, 'harvest');
    assert.deepEqual(r.outputs, [{ classTsid: 'peat', qty: 3 }]);
    assert.deepEqual(r.costs, { energy: 10, mood: 0, xp: 2, toolWear: 2 });
    assert.equal(r.durationMs, 8000);
    assert.equal(node.units, 3);
    assert.equal(node.regrowAt, NOW + 120000);
    assert.equal(resourceNodeFrame(node).frameIndex, 1);
    const twice = harvestResourceNode(node, inv, pc, ctxBase());
    assert.equal(twice.reason, 'daily_limit');
    assert.equal(twice.message, "You can't harvest this peat more than once per game day.");

    const bog = createResourceNode('peat_1');
    const skilled = harvestResourceNode(bog, inv, pc, ctxBase({
      skills: ['bogspecialization_1'],
      upgrades: ['bogspecialization_more_peat', 'bog_specialization_dig_peat_bog_twice'],
    }));
    assert.deepEqual(skilled.outputs, [{ classTsid: 'peat', qty: 5 }]);
    assert.deepEqual(skilled.costs, { energy: 5, mood: 0, xp: 5, toolWear: 1 });
    assert.equal(skilled.durationMs, 3000);
    assert.equal(harvestResourceNode(bog, inv, pc, ctxBase({ upgrades: ['bog_specialization_dig_peat_bog_twice'] })).ok, true);

    const dry = createResourceNode('peat_1', { units: 0 });
    assert.equal(harvestResourceNode(dry, inv, pc, ctxBase()).message, 'No more peat here!');
    assert.equal(resourceNodeFrame(dry).frameIndex, 4);
  });
});

describe('Paper Tree', () => {
  it('harvests 5 paper once per day and refills 9 after water + pet', () => {
    const node = createResourceNode('paper_tree');
    assert.equal(node.units, 21);
    const inv = {};
    const pc = { energy: 10, imagination: 0 };
    const r = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'harvest' }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.outputs, [{ classTsid: 'paper', qty: 5 }]);
    assert.equal(r.durationMs, 2500);
    assert.equal(r.costs.energy, 0);
    assert.equal(node.units, 16);
    assert.equal(harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'harvest' })).reason, 'daily_limit');

    const noCan = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'water' }));
    assert.equal(noCan.reason, 'no_tool');
    assert.equal(noCan.message, 'You need a working watering can.');

    inv.watering_can = 1;
    const frame = resourceNodeFrame(node);
    assert.equal(frame.sheetKey, 'petTrueWaterTrue');
    assert.equal(frame.frameIndex, 16);
    const water = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'water' }));
    assert.equal(water.ok, true);
    assert.equal(water.costs.xp, 5);
    assert.equal(water.durationMs, 2000);
    assert.equal(harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'water' })).reason, 'not_wanted');
    const pet = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'pet' }));
    assert.equal(pet.ok, true);
    assert.equal(pet.paperAdded, 5, 'capped at max_paper 21');
    assert.equal(node.units, 21);
    assert.equal(pc.imagination, 10);
    assert.equal(resourceNodeFrame(node).sheetKey, 'petFalseWaterFalse');
    tickResourceNode(node, NOW + 6 * 60 * 1000);
    assert.equal(node.watered, false);
    assert.equal(node.petted, false);
  });
});

describe('Salmon and Fireflies', () => {
  it('pockets a salmon for 4 energy, sometimes a boot, then respawns', () => {
    const node = createResourceNode('npc_salmon');
    const inv = {};
    const pc = { energy: 10 };
    const r = harvestResourceNode(node, inv, pc, ctxBase({ rng: seq(0.5) }));
    assert.equal(r.ok, true);
    assert.equal(r.verbId, 'pocket');
    assert.deepEqual(r.outputs, [{ classTsid: 'salmon', qty: 1 }]);
    assert.equal(pc.energy, 6);
    assert.equal(node.depleted, true);
    assert.equal(resourceNodeFrame(node, NOW).hidden, true);
    assert.equal(harvestResourceNode(node, inv, pc, ctxBase()).reason, 'depleted');
    assert.equal(tickResourceNode(node, NOW + 9999), false);
    assert.equal(tickResourceNode(node, NOW + 10000), true);
    assert.equal(node.depleted, false);
    const boot = harvestResourceNode(node, inv, pc, ctxBase({ rng: seq(0.05) }));
    assert.deepEqual(boot.outputs, [{ classTsid: 'boot', qty: 1 }]);
    assert.equal(boot.message, 'Huh, looked like a fish at first.');
    assert.equal(inv.boot, 1);
  });

  it('fills a Firefly Jar by whistling, gated by the achievement, jar and energy', () => {
    const node = createResourceNode('npc_firefly', { seed: 'ff' });
    assert.ok(['fullPath', 'halfPath', 'smallPath'].includes(node.variant));
    const pc = { energy: 100, imagination: 0 };
    const inv = { firefly_jar: 1 };
    const jar = createFireflyJarState();

    const noAch = harvestResourceNode(node, inv, pc, ctxBase({ jar }));
    assert.equal(noAch.reason, 'achievement');
    const noJar = harvestResourceNode(node, {}, pc, ctxBase({ jar, achievements: ['firefly_whistling'] }));
    assert.equal(noJar.reason, 'no_tool');
    const tired = { energy: 20 };
    const before = snapshot(node, inv, tired, jar);
    const lowEnergy = harvestResourceNode(node, inv, tired, ctxBase({ jar, achievements: ['firefly_whistling'] }));
    assert.equal(lowEnergy.reason, 'energy');
    assert.equal(snapshot(node, inv, tired, jar), before);

    const swarm = Array.from({ length: 8 }, (_, i) => createResourceNode('npc_firefly', { seed: i }));
    const r = harvestResourceNode(node, inv, pc, ctxBase({ jar, achievements: ['firefly_whistling'], nearby: swarm }));
    assert.equal(r.ok, true);
    assert.equal(r.verbId, 'open');
    assert.equal(r.fireflies, FIREFLY_JAR_MAX);
    assert.equal(jar.flies, 7);
    assert.equal(r.jarFull, true);
    assert.equal(r.costs.energy, 5 + 5 * 6, '5 to open + 5 per tick from the 2nd');
    assert.equal(r.costs.xp, 25, 'full jar +25 iMG');
    assert.equal(pc.energy, 65);
    assert.equal(r.durationMs, 8000);
    assert.equal(node.depleted, true);
    assert.equal(swarm.filter((n) => n.depleted).length, 6);
    assert.deepEqual(r.achievementCounters, [
      { counter: 'firefly_jar:fireflies_caught', amount: 7 },
      { counter: 'firefly_jar:full', amount: 1 },
    ]);
    const full = harvestResourceNode(swarm[7], inv, pc, ctxBase({ jar, achievements: ['firefly_whistling'] }));
    assert.equal(full.reason, 'jar_full');
    assert.deepEqual(normalizeFireflyJarState({ num_flies: 99 }), { flies: 7 });
  });

  it('stops whistling when energy falls to 10', () => {
    const jar = { flies: 0 };
    const pc = { energy: 26 };
    const swarm = Array.from({ length: 6 }, (_, i) => createResourceNode('npc_firefly', { seed: i }));
    const r = harvestResourceNode(swarm[0], { firefly_jar: 1 }, pc, ctxBase({
      jar, achievements: ['firefly_whistling'], nearby: swarm.slice(1),
    }));
    // 26 - 5 = 21 -> catch 1 (21) -> catch 2 (16) -> catch 3 (11) -> catch 4 (6) -> stop
    assert.equal(r.fireflies, 4);
    assert.equal(pc.energy, 6);
    assert.equal(jar.flies, 4);
  });
});

describe('Sloth', () => {
  it('requires Animal Kinship 3, a knock, and Metal Rods; spits 7-10 snails per rod', () => {
    const node = createResourceNode('npc_sloth');
    const inv = { metal_rod: 9 };
    const pc = { energy: 50 };
    const before = snapshot(node, inv, pc);
    const noSkill = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'knock' }));
    assert.equal(noSkill.reason, 'skill');
    assert.match(noSkill.message, /Animal Kinship 3/);
    assert.equal(snapshot(node, inv, pc), before);

    const skills = ['animalkinship_3'];
    assert.deepEqual(resourceNodeVerbs(node, inv, pc, ctxBase({ skills })).map((v) => v.id), ['knock']);
    const hidden = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'feed', skills }));
    assert.equal(hidden.reason, 'hidden');
    assert.equal(harvestResourceNode(node, {}, pc, ctxBase({ verbId: 'knock', skills })).reason, 'no_input');

    const knock = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'knock', skills }));
    assert.equal(knock.ok, true);
    assert.equal(node.out, true);
    assert.equal(inv.metal_rod, 9, 'knocking does not consume a rod');
    assert.deepEqual(resourceNodeVerbs(node, inv, pc, ctxBase({ skills })).map((v) => v.id), ['feed']);

    const feed = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'feed', skills, rng: seq(0.99) }));
    assert.equal(feed.ok, true);
    assert.deepEqual(feed.outputs, [{ classTsid: 'snail', qty: 10 }]);
    assert.equal(inv.metal_rod, 8);
    assert.equal(inv.snail, 10);
    assert.ok(feed.durationMs > 2000);
    assert.equal(resourceNodeFrame(node, NOW + 1).state, 'eating');
    assert.equal(harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'feed', skills, now: NOW + 1 })).reason, 'busy');

    let t = NOW;
    for (let i = 2; i <= 8; i += 1) {
      t = node.busyUntil;
      const r = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'feed', skills, now: t, rng: seq(0) }));
      assert.equal(r.ok, true, `feed ${i}: ${r.message}`);
      assert.equal(r.outputs[0].qty, 7);
    }
    assert.equal(node.units, 0);
    tickResourceNode(node, node.busyUntil);
    assert.equal(node.out, false, 'hides after the 8th rod');
    const tooSoon = harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'knock', skills, now: node.lastMetalizeAt + 1000 }));
    assert.equal(tooSoon.reason, 'full');
    tickResourceNode(node, node.lastMetalizeAt + 3 * 60 * 1000);
    assert.equal(node.units, 8);
    assert.equal(harvestResourceNode(node, inv, pc, ctxBase({ verbId: 'knock', skills, now: node.lastMetalizeAt + 3 * 60 * 1000 })).ok, true);
  });
});

describe('Dust Trap', () => {
  it('triggers on collision for organelle time or a drop-table item, then resets', () => {
    const node = createResourceNode('dust_trap', { now: NOW - 60000 });
    assert.deepEqual(resourceNodeVerbs(node, {}, {}, ctxBase()), [], 'no menu verb');
    const inv = {};
    const organelle = harvestResourceNode(node, inv, {}, ctxBase({ rng: seq(0.1) }));
    assert.equal(organelle.ok, true);
    assert.equal(organelle.verbId, 'trigger');
    assert.equal(organelle.baqalaSeconds, 10);
    assert.deepEqual(organelle.outputs, []);
    assert.equal(organelle.resetMs, 180000, '2 x 60 s clamps up to 180 s');
    assert.equal(node.respawnAt, NOW + 180000 + 1250);
    assert.equal(resourceNodeFrame(node, NOW + 100).sheetKey, 'smackDown');
    assert.equal(resourceNodeFrame(node, NOW + 5000).sheetKey, 'down');
    assert.equal(resourceNodeFrame(node, node.respawnAt - 500).sheetKey, 'up');
    assert.equal(harvestResourceNode(node, inv, {}, ctxBase()).reason, 'depleted');
    tickResourceNode(node, node.respawnAt);
    assert.equal(node.depleted, false);
    assert.equal(resourceNodeFrame(node, node.respawnAt).sheetKey, 'idle');

    // Ready for 1000 s -> reset 2000 s; roll 0.5 -> drop table; randInt(0,100) of 0.99 -> 100 -> extremely hallowed powder.
    const later = node.readySince + 1000 * 1000;
    const drop = harvestResourceNode(node, inv, {}, ctxBase({ now: later, rng: seq(0.5, 0.999) }));
    assert.deepEqual(drop.outputs, [{ classTsid: 'extremely_hallowed_shrine_powder', qty: 1 }]);
    assert.equal(drop.resetMs, 2000 * 1000);
    const paper = harvestResourceNode(createResourceNode('dust_trap'), inv, {}, ctxBase({ rng: seq(0.5, 0) }));
    assert.deepEqual(paper.outputs, [{ classTsid: 'paper', qty: 2 }]);
  });
});

describe('verbs, status and persistence', () => {
  it('lists verbs with disabled reasons instead of hiding them', () => {
    const node = createResourceNode('mortar_barnacle');
    const verbs = resourceNodeVerbs(node, {}, { energy: 50 }, ctxBase());
    assert.equal(verbs.length, 1);
    assert.equal(verbs[0].enabled, false);
    assert.equal(verbs[0].reason, 'no_tool');
    const ok = resourceNodeVerbs(node, { scraper: 1 }, { energy: 50 }, ctxBase());
    assert.equal(ok[0].enabled, true);
    assert.equal(ok[0].tool, 'scraper');
    assert.equal(ok[0].costs.energy, 2);
    assert.equal(resourceNodeStatusLabel(node, NOW), 'Ready to harvest');
    assert.equal(resourceNodeStatusLabel(createResourceNode('peat_1'), NOW), '4 harvests left');
    assert.match(resourceNodeStatusLabel(createResourceNode('paper_tree'), NOW), /21 paper · wants water and petting/);
    assert.equal(resourceNodeStatusLabel(createResourceNode('npc_sloth'), NOW), 'Hiding in the branches');
  });

  it('round-trips every node class through JSON + normalizeResourceNode', () => {
    const inv = { scraper: 1, shovel: 1, firefly_jar: 1, metal_rod: 3, watering_can: 1 };
    const pc = { energy: 100 };
    const ctx = ctxBase({ skills: ['animalkinship_3'], achievements: ['firefly_whistling'], jar: { flies: 0 } });
    const nodes = RESOURCE_NODE_CLASS_IDS.map((id) => createResourceNode(id, { seed: id, now: NOW }));
    for (const node of nodes) {
      if (node.classTsid === 'npc_sloth') harvestResourceNode(node, inv, pc, { ...ctx, verbId: 'knock' });
      harvestResourceNode(node, inv, pc, { ...ctx, verbId: node.classTsid === 'npc_sloth' ? 'feed' : undefined });
      if (node.classTsid === 'paper_tree') harvestResourceNode(node, inv, pc, { ...ctx, verbId: 'water' });
    }
    const restored = normalizeResourceNodes(JSON.parse(JSON.stringify(nodes)));
    assert.equal(restored.length, nodes.length);
    for (let i = 0; i < nodes.length; i += 1) {
      assert.deepEqual(restored[i], JSON.parse(JSON.stringify(nodes[i])), nodes[i].classTsid);
    }
  });

  it('sanitizes damaged saves and drops unknown classes', () => {
    assert.equal(normalizeResourceNode({ classTsid: 'not_a_node' }), null);
    assert.equal(normalizeResourceNode(null), null);
    const peat = normalizeResourceNode({ classTsid: 'peat_2', units: 99, dailyCounts: { harvest: 'x', bogus: 4 } });
    assert.equal(peat.classTsid, 'peat_1');
    assert.equal(peat.variant, 'peat2');
    assert.equal(peat.units, 4);
    assert.deepEqual(peat.dailyCounts, {});
    const barnacle = normalizeResourceNode({ classTsid: 'mortar_barnacle', units: -5, variant: 'blister99' });
    assert.equal(barnacle.units, 1);
    assert.equal(barnacle.variant, 'blister1');
    const salmon = normalizeResourceNode({ classTsid: 'npc_salmon', depleted: true, units: 1, respawnAt: 'soon' });
    assert.equal(salmon.depleted, true);
    assert.equal(salmon.units, 0);
    assert.equal(salmon.respawnAt, 0);
    tickResourceNode(salmon, NOW);
    assert.equal(salmon.depleted, false, 'a lost respawn timer heals on the next tick');
    const grow = normalizeResourceNode({ classTsid: 'jellisac', units: 2 });
    assert.equal(grow.regrowAt, 0);
    tickResourceNode(grow, NOW, seq(0));
    assert.equal(grow.regrowAt, NOW + 300000, 'a lost regrow timer is rescheduled');
  });
});

describe('street ecology resource counts', () => {
  const catalog = JSON.parse(readFileSync(join(publicRoot, 'assets/content/street-ecology.json'), 'utf8'));
  setStreetEcologyCatalog(catalog);

  it('carries every archived resource node count through the generated catalog', () => {
    const totals = {};
    for (const row of Object.values(catalog.streets)) {
      for (const id of RESOURCE_NODE_CLASSES) totals[id] = (totals[id] || 0) + (row.counts[id] || 0);
    }
    assert.deepEqual(totals, {
      npc_firefly: 938,
      npc_salmon: 890,
      mortar_barnacle: 451,
      dust_trap: 387,
      ice_knob: 310,
      jellisac: 261,
      dirt_pile: 251,
      peat_1: 179,
      npc_sloth: 84,
      paper_tree: 37,
    });
    for (const id of RESOURCE_NODE_CLASSES) assert.ok(RESOURCE_NODE_CATALOG[id], id);
  });

  it('recovers Seldom Squish fireflies, barnacles, jellisacs and peat', () => {
    const row = ecologyForStreet('GLI57G8I2HI1CSO');
    assert.equal(row.sourceTsid, 'LLI57G8I2HI1CSO');
    assert.equal(row.counts.npc_firefly, 36);
    assert.equal(row.counts.mortar_barnacle, 3);
    assert.equal(row.counts.jellisac, 9);
    assert.equal(row.counts.peat_1, 1);
    const pop = populationForStreet('GLI57G8I2HI1CSO', row);
    assert.deepEqual(pop.resourceCounts, { npc_firefly: 36, mortar_barnacle: 3, jellisac: 9, peat_1: 1 });
    assert.equal(pop.resourceNodeClasses.filter((id) => id === 'npc_firefly').length, 12, 'render cap');
    assert.equal(pop.resourceNodeClasses.filter((id) => id === 'jellisac').length, 6, 'render cap');
    assert.equal(pop.resourceNodeClasses.filter((id) => id === 'mortar_barnacle').length, 3);
    for (const id of pop.resourceNodeClasses) createResourceNode(id);
  });

  it('recovers salmon, ice, sloth, dirt, paper tree and dust trap streets', () => {
    assert.equal(ecologyForStreet('GA9QTSIOV4F31QH').counts.npc_salmon, 17);
    assert.equal(ecologyForStreet('GHF468KKJGD3IMD').counts.ice_knob, 9);
    const gaare = ecologyForStreet('GA512IH5226256P');
    assert.equal(gaare.counts.npc_sloth, 1);
    assert.equal(gaare.counts.dirt_pile, 2);
    const via = populationForStreet('GA510IHD1F426DS', ecologyForStreet('GA510IHD1F426DS'));
    assert.deepEqual(via.resourceCounts, { dust_trap: 2, dirt_pile: 1, paper_tree: 1 });
    assert.deepEqual(via.resourceNodeClasses, ['dust_trap', 'dust_trap', 'dirt_pile', 'paper_tree']);
    const empty = populationForStreet('GIFPV9EMLT72DP4', ecologyForStreet('GIFPV9EMLT72DP4'));
    assert.deepEqual(empty.resourceNodeClasses, []);
    assert.deepEqual(populationForStreet('nowhere', null).resourceNodeClasses, []);
  });
});
