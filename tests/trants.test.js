/**
 * Trant harvest math (extracted from GSJS).
 * Run: node --test tests/trants.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setTrantTables,
  resolveArborologyPackage,
  fruitCapacityAt,
  createTrantState,
  canHarvestTrant,
  harvestTrant,
  resolveSuperHarvest,
  resetTrantDay,
  refillFruit,
  tendTrant,
  MATURITY_LABELS,
  ARBOROLOGY_HARVEST,
  TRANT_META,
  trantHarvestResponse,
} from '../public/js/trants.js';
import { getVerbsFor, runVerb } from '../public/content.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../public');

describe('trant harvest (GSJS-extracted)', () => {
  before(() => {
    const tables = JSON.parse(readFileSync(join(root, 'assets/content/trants.json'), 'utf8'));
    setTrantTables(tables);
  });

  it('loads production tables for all six living trants', () => {
    for (const id of [
      'trant_egg',
      'trant_fruit',
      'trant_bean',
      'trant_bubble',
      'trant_spice',
      'trant_gas',
    ]) {
      assert.ok(fruitCapacityAt(id, 7, 8) > 0, id);
      // include/trants.js updateFruitCap: fruitCapMap[maturity - 1][health - 1].
      const tables = JSON.parse(readFileSync(join(root, 'assets/content/trants.json'), 'utf8'));
      const map = (tables[id] || tables.trants?.[id])?.fruitCapMap;
      if (map) {
        assert.equal(fruitCapacityAt(id, 7, 8), map[6][7], id);
        assert.equal(fruitCapacityAt(id, 10, 10), map[9][9], id);
        assert.equal(fruitCapacityAt(id, 0, 5), 0, id);
      }
    }
  });

  it('Arborology packages match catalog_skill_packages.js', () => {
    assert.equal(resolveArborologyPackage([]).bonusAmount, 3);
    assert.equal(resolveArborologyPackage([]).intervalLimit, 1);
    assert.equal(resolveArborologyPackage([]).durationMs, 5000);
    assert.equal(resolveArborologyPackage(['gardening_1']).bonusAmount, 6);
    assert.equal(resolveArborologyPackage(['gardening_1']).durationMs, 2000);
    assert.equal(resolveArborologyPackage(['gardening_2']).intervalLimit, 2);
    assert.equal(resolveArborologyPackage(['gardening_3']).bonusAmount, 12);
    assert.equal(resolveArborologyPackage(['gardening_5']).energyCost, 2);
  });

  it('egg plant maturity 7 health 8 has positive capacity from tables', () => {
    const cap = fruitCapacityAt('trant_egg', 7, 8);
    // fruitCapMap[7][8] for egg — from extracted JSON
    assert.ok(cap >= 40, `cap ${cap}`);
  });

  it('cannot harvest empty or too-small trees', () => {
    const small = createTrantState('trant_egg', { maturity: 2, health: 8, fruitCount: 10 });
    const arbor = ARBOROLOGY_HARVEST.no_skill;
    assert.equal(canHarvestTrant(small, arbor).ok, false);
    const empty = createTrantState('trant_egg', { maturity: 7, health: 8, fruitCount: 0 });
    assert.equal(canHarvestTrant(empty, arbor).ok, false);
  });

  it('no_skill harvest takes 3; gardening_1 takes 6', () => {
    const s = createTrantState('trant_fruit', { maturity: 7, health: 8 });
    s.fruitCount = 100;
    const r0 = harvestTrant(s, { learned: [] }, { rng: () => 0.99 });
    assert.equal(r0.ok, true);
    assert.equal(r0.baseAmount, 3);

    const s2 = createTrantState('trant_fruit', { maturity: 7, health: 8 });
    s2.fruitCount = 100;
    const r1 = harvestTrant(s2, { learned: ['gardening_1'] }, { rng: () => 0.99 });
    assert.equal(r1.baseAmount, 6);
  });

  it('enforces daily interval_limit (1 without Arborology II)', () => {
    const s = createTrantState('trant_egg', { maturity: 7, health: 8 });
    s.fruitCount = 50;
    const r1 = harvestTrant(s, { learned: [] }, { rng: () => 0.99 });
    assert.equal(r1.ok, true);
    const r2 = harvestTrant(s, { learned: [] }, { rng: () => 0.99 });
    assert.equal(r2.ok, false);
  });

  it('Arborology II allows 2 harvests per day', () => {
    const s = createTrantState('trant_egg', { maturity: 7, health: 8 });
    s.fruitCount = 100;
    assert.equal(harvestTrant(s, { learned: ['gardening_2'] }, { rng: () => 0.99 }).ok, true);
    assert.equal(harvestTrant(s, { learned: ['gardening_2'] }, { rng: () => 0.99 }).ok, true);
    assert.equal(harvestTrant(s, { learned: ['gardening_2'] }, { rng: () => 0.99 }).ok, false);
  });

  it('type-specific super harvest is 4× when upgrade owned and rng hits', () => {
    const sh = resolveSuperHarvest(['gardening_harvest_egg'], 'egg_plain');
    assert.equal(sh.multiplier, 4);
    const s = createTrantState('trant_egg', { maturity: 7, health: 8 });
    s.fruitCount = 200;
    const r = harvestTrant(
      s,
      { learned: ['gardening_1'], imaginationUpgrades: ['gardening_harvest_egg'] },
      { rng: () => 0.01 }
    );
    assert.equal(r.ok, true);
    assert.ok(r.superHarvest);
    assert.ok(r.amount > r.baseAmount);
  });

  it('creates the super bonus separately without draining it from the tree', () => {
    const s = createTrantState('trant_bean', { maturity: 7, health: 8, fruitCount: 50 });
    const r = harvestTrant(
      s,
      { learned: [], imaginationUpgrades: ['gardening_harvest_bean'] },
      { rng: () => 0 }
    );
    assert.equal(r.baseAmount, 3);
    assert.equal(r.superAmount, 9);
    assert.equal(r.amount, 12);
    assert.equal(s.fruitCount, 47, 'only the ordinary three beans leave the tree');
  });

  it('ports skill-tier tree talkback for every living species', () => {
    for (const classTsid of Object.keys(TRANT_META)) {
      assert.ok(trantHarvestResponse(classTsid, { rank: -1 }, 1), classTsid);
      assert.ok(trantHarvestResponse(classTsid, { rank: 3 }, 1), classTsid);
      assert.ok(trantHarvestResponse(classTsid, { rank: 5 }, 1), classTsid);
    }
    assert.equal(
      trantHarvestResponse('trant_bean', { rank: -1 }, 3),
      'Two bean, or not two bean?…'
    );
    const gas = createTrantState('trant_gas', { maturity: 7, health: 8, fruitCount: 50 });
    const rankFive = harvestTrant(gas, { learned: ['gardening_5'] }, { rng: () => 0.99 });
    assert.equal(rankFive.arbor.rank, 5);
    assert.equal(rankFive.reaction, "Yeah, man, take all you want. I'm cool.");
  });

  it('maturity labels cover hole through XL', () => {
    assert.equal(MATURITY_LABELS[0], 'hole');
    assert.equal(MATURITY_LABELS[1], 'sprout');
    assert.equal(MATURITY_LABELS[10], 'extra large');
  });

  it('resetTrantDay clears harvests and tend flags', () => {
    const s = createTrantState('trant_egg', { maturity: 7, health: 8 });
    s.harvestsToday = 2;
    s.petted = true;
    s.watered = true;
    resetTrantDay(s);
    assert.equal(s.harvestsToday, 0);
    assert.equal(s.petted, false);
    assert.equal(s.watered, false);
  });

  it('refillFruit partial fills toward capacity without shrinking', () => {
    const s = createTrantState('trant_fruit', { maturity: 7, health: 8, fruitCount: 5 });
    const cap = s.fruitCapacity;
    assert.ok(cap > 5);
    refillFruit(s, 0.5);
    assert.ok(s.fruitCount >= Math.floor(cap * 0.5));
    assert.ok(s.fruitCount <= cap);
    const mid = s.fruitCount;
    refillFruit(s, 0.3); // lower fraction must not reduce fruit
    assert.equal(s.fruitCount, mid);
  });

  it('tendTrant marks pet/water and bumps health once both land', () => {
    const s = createTrantState('trant_egg', { maturity: 7, health: 5 });
    tendTrant(s, 'pet');
    assert.equal(s.petted, true);
    assert.equal(s.health, 5);
    tendTrant(s, 'water');
    assert.equal(s.watered, true);
    assert.equal(s.health, 6);
  });

  it('content verbs: harvest uses Arborology + invents eggs/cherries', () => {
    const egg = {
      classId: 'trant_egg',
      state: createTrantState('trant_egg', { maturity: 7, health: 8, fruitCount: 50 }),
    };
    const pc = { energy: 50, mood: 50, imagination: 100 };
    const inv = {};
    const verbs = getVerbsFor(egg, { pc, inv, learned: [] });
    const h = verbs.find((v) => v.id === 'harvest');
    assert.ok(h);
    assert.equal(h.enabled, true);
    assert.equal(h.energy, ARBOROLOGY_HARVEST.no_skill.energyCost);
    assert.equal(h.durationMs, 5000);

    const r = runVerb(egg, 'harvest', {
      pc,
      inv,
      learned: [],
      rng: () => 0.99,
    });
    assert.equal(r.ok, true);
    assert.equal(inv.egg_plain, 3);
    assert.equal(egg.state.harvestsToday, 1);
    assert.equal(r.speech.speaker, 'Egg Plant');
    assert.ok(r.speech.text);

    // Second harvest same day blocked without gardening_2
    const r2 = runVerb(egg, 'harvest', { pc, inv, learned: [], rng: () => 0.99 });
    assert.equal(r2.ok, false);

    // Arborology II allows second harvest after day reset
    resetTrantDay(egg.state);
    refillFruit(egg.state, 1);
    const r3 = runVerb(egg, 'harvest', {
      pc,
      inv,
      learned: ['gardening_2'],
      rng: () => 0.99,
    });
    assert.equal(r3.ok, true);
    assert.equal(inv.egg_plain, 3 + 6); // gardening_2 bonusAmount 6
  });

  it('content verbs: fruit tree harvest gives cherries', () => {
    const tree = {
      classId: 'trant_fruit',
      state: createTrantState('trant_fruit', { maturity: 7, health: 8, fruitCount: 40 }),
    };
    const pc = { energy: 40, mood: 40, imagination: 0 };
    const inv = {};
    const r = runVerb(tree, 'harvest', {
      pc,
      inv,
      learned: ['gardening_1'],
      rng: () => 0.99,
    });
    assert.equal(r.ok, true);
    assert.equal(inv.cherry, 6);
  });

  it('TRANT_META covers six living classes', () => {
    assert.equal(Object.keys(TRANT_META).length, 6);
    assert.equal(TRANT_META.trant_fruit.fruitClass, 'cherry');
    assert.equal(TRANT_META.trant_egg.fruitClass, 'egg_plain');
  });

  it('ships one complete, non-empty source cell for every living trant maturity', () => {
    const png = (relative) => {
      const bytes = readFileSync(join(root, relative));
      return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        bytes: bytes.length,
      };
    };
    const cells = {
      trant_fruit: [271, 249],
      trant_egg: [296, 278],
      trant_bean: [198, 270],
      trant_bubble: [167, 277],
      trant_gas: [276, 258],
      trant_spice: [318, 250],
    };
    for (const [classTsid, [width, height]] of Object.entries(cells)) {
      for (const maturity of [1, 3, 5, 7, 10]) {
        const result = png(`assets/sprites/trants/frames/${classTsid}_m${maturity}.png`);
        assert.deepEqual(
          { width: result.width, height: result.height },
          { width, height },
          `${classTsid} maturity ${maturity} must be one exact source-sheet cell`
        );
        assert.ok(result.bytes > 2500, `${classTsid} maturity ${maturity} must not be blank`);
      }
    }
    const build = readFileSync(join(root, '../build-trant-frames.sh'), 'utf8');
    assert.ok(build.includes('last populated'));
    const cropTable = {
      fruit: ['271 249 1 0 3', '271 249 3 0 3', '271 249 5 2 10', '271 249 7 10 3', '271 249 10 14 3'],
      egg: ['296 278 1 2 0', '296 278 3 1 1', '296 278 5 0 6', '296 278 7 0 11', '296 278 10 10 4'],
      bean: ['198 270 1 3 1', '198 270 3 3 1', '198 270 5 0 10', '198 270 7 3 11', '198 270 10 2 13'],
      bubble: ['167 277 1 3 1', '167 277 3 4 1', '167 277 5 0 12', '167 277 7 23 2', '167 277 10 18 3'],
      gas: ['276 258 1 0 3', '276 258 3 0 3', '276 258 5 2 7', '276 258 7 2 14', '276 258 10 10 3'],
      spice: ['318 250 1 0 3', '318 250 3 0 3', '318 250 5 2 14', '318 250 7 8 4', '318 250 10 10 5'],
    };
    for (const [species, rows] of Object.entries(cropTable)) {
      for (const row of rows) {
        assert.match(build, new RegExp(`^${species} ${row}$`, 'm'));
      }
    }
  });

  it('wires timed harvest animation, rainbow super FX, deterministic QA, and mute-by-default', () => {
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    const content = readFileSync(join(root, 'content.js'), 'utf8');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(content, /durationMs:\s*arbor\.durationMs/);
    assert.match(game, /playTrantHarvestAnimation\(target, durationMs\)/);
    assert.match(game, /function showSuperHarvestFx/);
    assert.match(game, /SUPER HARVEST!/);
    assert.match(game, /data(?:set)?\.superHarvestFx|dataset\.superHarvestFx/);
    assert.match(game, /bootParams\.has\('harvestdemo'\)/);
    assert.match(game, /harvestrank/);
    assert.match(game, /harvestsuper/);
    assert.match(game, /harvestroll/);
    assert.match(game, /dataset\.trantHarvestYield/);
    assert.match(game, /TRANT_FRAME_VERSION = 'all-species-cell-2'/);
    assert.match(html, /game\.js\?v=official-ecology-1/);
    assert.match(game, /muted:\s*true/);
  });
});
