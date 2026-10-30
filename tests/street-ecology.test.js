/** Official location populations and collision-aware street placement. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setStreetEcologyCatalog,
  ecologyForStreet,
  populationForStreet,
  buildPlatformCandidates,
  planStreetPlacements,
  nearestPlacementGap,
  STREET_ECOLOGY_URL,
} from '../public/js/street-ecology.js?v=dbcefe18';
import {
  platformsScreen,
  platformYAt,
  streetWidth,
  worldToScreen,
} from '../public/js/street-model.js?v=606bae73';
import { giantForStreet } from '../public/js/shrines.js?v=01b185bc';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(__dirname, '../public');
const ecologyPath = join(publicRoot, 'assets/content/street-ecology.json');
const hecheyPath = join(publicRoot, 'assets/streets/GLI2V0UN7RD1T2J.json');
const catalog = JSON.parse(readFileSync(ecologyPath, 'utf8'));
const hechey = JSON.parse(readFileSync(hecheyPath, 'utf8'));
setStreetEcologyCatalog(catalog);

describe('Tiny Speck street ecology catalog', () => {
  it('ships a generated, source-attributed population for more than a thousand streets', () => {
    assert.ok(existsSync(ecologyPath));
    assert.match(catalog.source, /tinyspeck\/glitch-locations/i);
    assert.match(catalog.sourceSnapshot, /2012-12/i);
    assert.ok(catalog.streetCount >= 1000, String(catalog.streetCount));
    assert.equal(catalog.streetCount, Object.keys(catalog.streets).length);
    assert.equal(STREET_ECOLOGY_URL, 'assets/content/street-ecology.json?v=official-ecology-6');
  });

  it('recovers Hechey Track exact static animals, trants, vendor, shrine, and spawner', () => {
    const row = ecologyForStreet('GLI2V0UN7RD1T2J');
    assert.equal(row.sourceTsid, 'LLI2V0UN7RD1T2J');
    assert.equal(row.counts.npc_piggy, 6);
    assert.equal(row.counts.trant_fruit, 5);
    assert.equal(row.counts.trant_bubble, 2);
    assert.equal(row.counts.street_spirit, 1);
    assert.equal(row.giantId, 'mab');
    assert.equal(row.spawners, 1);
  });

  it('adds no animals for archived spawners (G44b)', () => {
    const pop = populationForStreet('GTESTSPAWNER01', {
      sourceTsid: 'LTESTSPAWNER01',
      counts: { trant_fruit: 2, npc_piggy: 1 },
      spawners: 4,
    });
    assert.equal(pop.piggies, 1);
    assert.equal(pop.chickens, 0);
    assert.equal(pop.butterflies, 0);
  });

  it('recovers Groddle Forest Junction as a different source-derived ecology', () => {
    const row = ecologyForStreet('GLI3272LOTD1B1F');
    assert.equal(row.sourceTsid, 'LLI3272LOTD1B1F');
    assert.equal(row.counts.trant_spice, 2);
    assert.equal(row.counts.trant_bean, 3);
    assert.equal(row.counts.trant_bubble, 1);
    assert.equal(row.counts.trant_gas, 1);
    assert.equal(row.counts.trant_fruit, 1);
    assert.equal(row.giantId, 'friendly');
    assert.equal(row.counts.npc_piggy || 0, 0);
  });

  it('keeps the source-empty Stoot memorial private and uncluttered', () => {
    const row = ecologyForStreet('GIFPV9EMLT72DP4');
    const population = populationForStreet('GIFPV9EMLT72DP4', row);
    assert.equal(row.sourceTsid, 'LIFPV9EMLT72DP4');
    assert.equal(row.empty, true);
    assert.equal(population.sourceEmpty, true);
    assert.equal(population.companions, false);
    assert.deepEqual(population.treeClasses, []);
    assert.deepEqual(population.rockClasses, []);
    assert.equal(population.piggies, 0);
    assert.equal(population.chickens, 0);
    assert.equal(population.butterflies, 0);
    assert.equal(population.gardens, 0);
    assert.equal(population.vendor, false);
    assert.equal(population.shrine, false);
    assert.equal(population.apples, 0);
    assert.equal(population.musicblocks, 0);
    assert.equal(population.quoins, 0);
  });

  it('resolves G/L aliases and honors an official shrine Giant over hub heuristics', () => {
    assert.equal(ecologyForStreet('LLI2V0UN7RD1T2J')?.giantId, 'mab');
    assert.equal(
      giantForStreet({ hubName: 'Groddle Forest', officialGiantId: 'mab' }).id,
      'mab'
    );
  });

  it('keeps the official starter ecology while adding only focused onboarding access', () => {
    const row = ecologyForStreet(hechey.tsid);
    const population = populationForStreet(hechey.tsid, row, { starter: true });
    assert.equal(population.source, 'tinyspeck-locations-xml');
    assert.equal(population.piggies, 6);
    assert.equal(population.treeClasses.filter((id) => id === 'trant_fruit').length, 5);
    assert.equal(population.treeClasses.filter((id) => id === 'trant_bubble').length, 2);
    assert.ok(population.treeClasses.includes('wood_tree'));
    assert.ok(population.chickens >= 2);
    assert.ok(population.butterflies >= 2);
    assert.equal(population.giantId, 'mab');
  });
});

describe('streets without ecology get only what their own file holds (Austin 2026-10-30)', () => {
  const index = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/index.json'), 'utf8'));
  const locationRoot = join(__dirname, '../../streets/mnt/stos/location_data');
  const EXIT = 'GA93VBH3H3D38HF'; // Gentle Island Exit: LA93VBH3H3D38HF.xml holds 4 Coins and a Qurazy marker
  const ANIMAL_OR_SCENERY = (p) => p.piggies + p.chickens + p.butterflies + p.flyingButterflies + p.treeClasses.length + p.rockClasses.length + p.gardens + Number(p.vendor) + Number(p.shrine);

  it('no street ever gets the invented playable fallback', () => {
    assert.doesNotMatch(readFileSync(join(publicRoot, 'js/street-ecology.js'), 'utf8'), /playable-fallback/);
    for (const tsid of Object.keys(index.streets)) {
      const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === index.default });
      assert.notEqual(pop.source, 'playable-fallback', tsid);
    }
  });

  it('a street with no row and no file is empty', () => {
    const pop = populationForStreet('GNOSUCHSTREET01', null);
    assert.equal(pop.source, 'no-archived-row');
    assert.equal(ANIMAL_OR_SCENERY(pop), 0);
    assert.deepEqual([pop.apples, pop.musicblocks, pop.quoins], [0, 0, 0]);
    // Penumbra (Puzzles) has no archived file and no feature row.
    const penumbra = populationForStreet('GIFM2QAIQ1C31JV', ecologyForStreet('GIFM2QAIQ1C31JV'));
    assert.equal(penumbra.source, 'no-archived-row');
    assert.equal(ANIMAL_OR_SCENERY(penumbra), 0);
  });

  it('the starter keeps its onboarding set even without its row', () => {
    const pop = populationForStreet(index.default, null, { starter: true });
    assert.equal(pop.source, 'starter-onboarding');
    assert.ok(pop.piggies >= 3 && pop.chickens >= 2 && pop.gardens >= 2 && pop.vendor && pop.shrine);
    assert.deepEqual(pop.treeClasses, ['trant_fruit', 'trant_egg', 'trant_bean', 'wood_tree']);
  });

  it('Gentle Island Exit has its 4 quoins and no egg plant, animals, garden, vendor or shrine', () => {
    const row = ecologyForStreet(EXIT);
    assert.deepEqual(row, { label: 'Gentle Island Exit', sourceTsid: 'LA93VBH3H3D38HF', counts: {}, exact: true, quoins: 4 });
    const pop = populationForStreet(EXIT, row);
    assert.equal(pop.source, 'tinyspeck-locations-xml');
    assert.equal(pop.exact, true);
    assert.equal(pop.interior, undefined, 'outdoors: seasons still dress it');
    assert.equal(pop.sourceEmpty, undefined);
    assert.ok(!pop.treeClasses.includes('trant_egg'));
    assert.equal(ANIMAL_OR_SCENERY(pop), 0);
    assert.deepEqual([pop.apples, pop.musicblocks, pop.quoins], [0, 0, 4]);
  });

  it('patch-only streets keep their patches and nothing else (Groddle Forest Junction, Old Groddle Forest)', () => {
    const row = ecologyForStreet('GLI1018LOKA18M6');
    assert.equal(row.exact, true);
    assert.deepEqual(catalog.soil.GLI1018LOKA18M6, { patch: 10 });
    assert.equal(ANIMAL_OR_SCENERY(populationForStreet('GLI1018LOKA18M6', row)), 0);
  });

  it('the builder writes a row for every street with an archived file', { skip: existsSync(locationRoot) ? false : 'needs ../streets (glitch-locations locations-xml.zip unzipped)' }, () => {
    const generator = readFileSync(join(__dirname, '../build-street-ecology.mjs'), 'utf8');
    assert.doesNotMatch(generator, /!ecology\.spawners\) continue;/);
    let withFile = 0;
    for (const [tsid] of Object.entries(index.streets)) {
      const file = ['L', 'G'].map((p) => join(locationRoot, `${p}${tsid.slice(1)}.xml`)).find((f) => existsSync(f));
      if (!file) continue;
      withFile += 1;
      const row = ecologyForStreet(tsid);
      assert.ok(row, `${tsid} has ${file} but no row`);
      if (!row.exact) continue;
      // An exact row is only for a file with nothing the ecology maps: its quoins are the file's own.
      const xml = readFileSync(file, 'utf8');
      const items = xml.match(/<objrefs id="items">([\s\S]*?)<\/objrefs>/)?.[1] || '';
      assert.equal(row.quoins, (items.match(/label="(?:Coin|Quoin)"/g) || []).length, tsid);
      assert.doesNotMatch(items, /label="(?:Piggy|Chicken|Butterfly|Fruit Tree|Egg Plant|Bean Tree|Bubble Tree|Spice Plant|Gas Plant|Wood Tree|Metal Rock|Dullite Rock|Beryl Rock|Sparkly Rock|Garden|Street Spirit|Spawner|spawner)"|Shrine (?:for|to) /, tsid);
    }
    assert.ok(withFile >= 1400, String(withFile));
    assert.equal(Object.values(catalog.streets).filter((r) => r.exact).length, 139);
  });
});

describe('one-pass platform placement', () => {
  const platforms = platformsScreen(hechey);
  const population = populationForStreet(
    hechey.tsid,
    ecologyForStreet(hechey.tsid),
    { starter: true }
  );
  const requests = [
    { key: 'player', count: 1, clearance: 190 },
    { key: 'trees', count: population.treeClasses.length, clearance: 135 },
    { key: 'gardens', count: population.gardens, clearance: 165 },
    { key: 'vendor', count: 1, clearance: 120 },
    { key: 'shrine', count: 1, clearance: 135 },
    { key: 'rocks', count: population.rockClasses.length, clearance: 74 },
    { key: 'piggies', count: population.piggies, clearance: 92 },
    { key: 'chickens', count: population.chickens, clearance: 86 },
    { key: 'butterflies', count: population.butterflies, clearance: 62 },
    { key: 'flyingButterflies', count: population.flyingButterflies, clearance: 58 },
    { key: 'apples', count: 4, clearance: 30 },
    { key: 'musicblocks', count: 1, clearance: 45 },
    { key: 'quoins', count: 8, clearance: 28 },
  ];
  const options = {
    worldW: streetWidth(hechey),
    seed: hechey.tsid,
    reserved: hechey.signposts.map((signpost, index) => ({
      ...worldToScreen(hechey, signpost.x, signpost.y),
      key: `signpost:${index}`,
      clearance: 100,
    })),
  };

  it('builds many distinct candidates directly on recovered platform segments', () => {
    const candidates = buildPlatformCandidates(platforms, options);
    assert.ok(candidates.length >= 60, String(candidates.length));
    assert.equal(new Set(candidates.map((point) => point.id)).size, candidates.length);
    for (const point of candidates) {
      const onPlatform = platforms.some((platform) => {
        const y = platformYAt(platform, point.x, 0.01);
        return y != null && Math.abs(y - point.y) < 0.01;
      });
      assert.ok(onPlatform, `candidate ${point.id} is not on a platform`);
    }
  });

  it('never places anything on an underside or ceiling line (pc_perm 1): the Meadow\'s Edge cave roof', () => {
    const meadow = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/GLID3PL336E1RN1.json'), 'utf8'));
    const lines = platformsScreen(meadow);
    const roof = lines.find((line) => line.id === '_pl1288206457409');
    assert.equal(roof.pcPerm, 1, 'platformsScreen keeps the source permeability');
    assert.equal(lines.find((line) => line.id === '_pl1282009625346').pcPerm, -1);
    const candidates = buildPlatformCandidates(lines, { worldW: streetWidth(meadow), seed: meadow.tsid });
    const ceilingIds = new Set(lines.filter((line) => line.pcPerm === 1).map((line) => line.id));
    assert.ok(ceilingIds.size >= 3);
    assert.deepEqual(candidates.filter((point) => ceilingIds.has(point.id.slice(0, point.id.lastIndexOf(':')))), []);
    // Every street: no candidate sits on a ceiling line.
    const index = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/index.json'), 'utf8'));
    const tsids = Object.keys(index.streets || index).filter((k) => /^G[A-Z0-9]{14}$/.test(k));
    let checked = 0;
    for (const tsid of tsids) {
      const file = join(publicRoot, `assets/streets/${tsid}.json`);
      if (!existsSync(file)) continue;
      const street = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(street.platforms)) continue;
      const all = platformsScreen(street);
      const ceilings = new Set(all.filter((line) => line.pcPerm === 1).map((line) => line.id));
      if (!ceilings.size) continue;
      const bad = buildPlatformCandidates(all, { worldW: streetWidth(street), seed: tsid })
        .filter((point) => ceilings.has(point.id.slice(0, point.id.lastIndexOf(':'))));
      assert.deepEqual(bad, [], tsid);
      checked += 1;
    }
    assert.ok(checked >= 50, `checked ${checked} streets with ceiling lines`);
  });

  it('is deterministic, fills every requested group, and keeps arrival clear', () => {
    const first = planStreetPlacements(platforms, requests, options);
    const second = planStreetPlacements(platforms, requests, options);
    assert.deepEqual(first, second);
    for (const request of requests) {
      assert.equal(first.groups[request.key].length, request.count, request.key);
    }
    const allIds = Object.values(first.groups).flat().map((point) => point.id);
    assert.equal(new Set(allIds).size, allIds.length);
    const majorGap = nearestPlacementGap(first, 'player', [
      'trees',
      'gardens',
      'vendor',
      'shrine',
      'rocks',
      'piggies',
      'chickens',
      'butterflies',
    ]);
    assert.ok(majorGap >= 180, `major arrival gap ${majorGap}`);
  });
});

describe('runtime wiring', () => {
  it('loads source ecology before entering and exposes deterministic QA evidence', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    const generator = readFileSync(join(__dirname, '../build-street-ecology.mjs'), 'utf8');
    assert.match(game, /loadStreetEcologyCatalog/);
    assert.match(game, /populationForStreet/);
    assert.match(game, /planStreetPlacements/);
    assert.match(game, /dataset\.ecologyPopulation/);
    assert.match(game, /dataset\.ecologyPlayerClearance/);
    assert.match(game, /officialGiantId/);
    assert.match(html, /game\.js\?v=[0-9a-f]{8}/);
    assert.match(generator, /locations-xml\.zip item references/);
  });
});
