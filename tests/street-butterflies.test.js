/**
 * Street Butterflies come back only where the original had them: the live
 * glitch.com street pages' counts (tools/ecology/animal-census.json, every
 * archived street page's latest live capture plus an earlier sample) and the seven the late-2012 snapshot kept under
 * __MISSING_ITEMS__. build-street-ecology.mjs writes counts.npc_butterfly and
 * the evidence map `butterflies`; populationForStreet shows that many in all.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { butterflySplit, populationForStreet } from '../public/js/street-ecology.js?v=64dcdacc';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const census = JSON.parse(readFileSync(join(root, 'tools/ecology/animal-census.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(root, 'public/assets/streets/index.json'), 'utf8'));

/**
 * Streets the census lists that the catalog keeps indoors or builds from a
 * feature (no archived outdoor row): a machine room and a tower floor, one
 * butterfly each, most likely brought in by a player. They stay without.
 */
const outdoor = (tsid) => !!catalog.streets[tsid] && catalog.streets[tsid].interior !== true;

const shown = (tsid) => {
  const pop = populationForStreet(tsid, catalog.streets[tsid], { starter: tsid === index.default });
  return pop.butterflies + pop.flyingButterflies;
};

/** The seven snapshot butterflies (L-prefixed files, __MISSING_ITEMS__). */
const MISSING_ITEMS = Object.freeze({
  GCR103UREMK11MT: 4, // Fairgower Lane
  GLI23Q4NDHD11EK: 2, // Thicket
  GLIF3AQTOFE19OR: 1, // Hayden Seek Alley
});

describe('street Butterflies from the live street pages', () => {
  it('reads each capture\'s count from its own Featuring line', () => {
    for (const row of census.streets) {
      for (const capture of row.captures) {
        const n = (re) => Number(capture.features.match(re)?.[1] || 0);
        assert.equal(capture.butterflies, n(/(\d+) Butterfl(?:y|ies)\b/), `${row.label} ${capture.wayback}`);
        assert.equal(capture.batterflies, n(/(\d+) Batterfl(?:y|ies)\b/), `${row.label} ${capture.wayback}`);
        assert.equal(capture.piggies, n(/(\d+) Pigg(?:y|ies)\b/), `${row.label} ${capture.wayback}`);
        assert.equal(capture.chickens, n(/(\d+) Chickens?\b/), `${row.label} ${capture.wayback}`);
        assert.match(capture.url, new RegExp(`/locations/(?:[a-z-]+/)?L${row.tsid.slice(1)}/$`));
      }
      assert.equal(row.butterflies, Math.max(...row.captures.map((c) => c.butterflies)), row.label);
    }
  });

  it('puts every street the evidence lists into the catalog, at most 3', () => {
    const live = census.streets.filter((row) => row.butterflies > 0 && outdoor(row.tsid));
    assert.ok(live.length >= 700, String(live.length));
    // The census covers every street that has an archived page.
    assert.ok(census.streets.length >= 1100, String(census.streets.length));
    for (const row of live) {
      const count = Math.max(row.butterflies, MISSING_ITEMS[row.tsid] || 0);
      assert.equal(catalog.streets[row.tsid]?.counts?.npc_butterfly, Math.min(count, 3), row.label);
      assert.equal(catalog.butterflies[row.tsid]?.count, count, row.label);
      assert.deepEqual(
        catalog.butterflies[row.tsid].wayback,
        row.captures.filter((c) => c.butterflies > 0).map((c) => c.wayback),
        row.label
      );
      assert.equal(shown(row.tsid), Math.min(count, 3), row.label);
    }
    for (const [tsid, n] of Object.entries(MISSING_ITEMS)) {
      assert.equal(catalog.butterflies[tsid]?.missingItems, n, tsid);
    }
  });

  it('leaves every other street without them', () => {
    const evidence = new Set([
      ...census.streets.filter((row) => row.butterflies > 0 && outdoor(row.tsid)).map((row) => row.tsid),
      ...Object.keys(MISSING_ITEMS),
    ]);
    assert.deepEqual(Object.keys(catalog.butterflies).sort(), [...evidence].sort());
    assert.equal(catalog.butterflyStreetCount, evidence.size);
    for (const [tsid, row] of Object.entries(catalog.streets)) {
      if (evidence.has(tsid)) continue;
      assert.ok(!row.counts?.npc_butterfly, `${row.label} lists butterflies with no evidence`);
      if (tsid !== index.default) assert.equal(shown(tsid), 0, row.label);
    }
    // The starter keeps its onboarding pair either way (Hechey Track's pages list none).
    for (const row of census.streets.filter((r) => r.butterflies === 0 && !MISSING_ITEMS[r.tsid] && r.tsid !== index.default)) {
      assert.equal(shown(row.tsid), 0, `${row.label} was checked with none`);
    }
  });

  it('puts a street\'s count in the air, none resting on the ground, and keeps the starter\'s four (ticket 25)', () => {
    // npc_butterfly.js flyAround 886-969: a healthy Butterfly always flies in the 200 px above the
    // floor; only a rooked one lands (onRooked 1395-1404) and a sad one stops (flyAround returns).
    assert.deepEqual(butterflySplit(0), { butterflies: 0, flyingButterflies: 0 });
    assert.deepEqual(butterflySplit(1), { butterflies: 0, flyingButterflies: 1 });
    assert.deepEqual(butterflySplit(2), { butterflies: 0, flyingButterflies: 2 });
    assert.deepEqual(butterflySplit(3), { butterflies: 0, flyingButterflies: 3 });
    assert.deepEqual(butterflySplit(8), { butterflies: 0, flyingButterflies: 3 });
    const starter = populationForStreet(index.default, catalog.streets[index.default], { starter: true });
    assert.equal(starter.butterflies, 0);
    assert.equal(starter.flyingButterflies, 4);
  });

  it('leaves enough for Happy Endings For All! (massage 7, each once a game day) in every animal region', () => {
    // animalkinship_massage_butterflies counts distinct butterflies
    // (js/quest-offers.js butterflies_massaged, distinct: 'animal').
    const byHub = {};
    for (const tsid of Object.keys(index.streets)) {
      const n = shown(tsid);
      if (!n) continue;
      const hub = index.streets[tsid].hubName;
      byHub[hub] = (byHub[hub] || 0) + n;
    }
    const total = Object.values(byHub).reduce((a, b) => a + b, 0);
    assert.ok(total >= 13, `only ${total} street butterflies in the world`);
    // Every region the census gives butterflies has seven for the quest,
    // and most have the thirteen of Go Moloko Loco, Butterfly Style, except
    // the three where the pages list only a handful (2 to 5).
    const sparse = new Set(['Vortex of Random', 'Zhambu', 'Xalanga']);
    for (const [hub, n] of Object.entries(byHub)) {
      if (!sparse.has(hub)) assert.ok(n >= 7, `${hub}: ${n}`);
    }
    assert.ok(Object.values(byHub).filter((n) => n >= 13).length >= 30, JSON.stringify(byHub));
    assert.ok(Object.keys(byHub).length >= 30, JSON.stringify(byHub));
  });
});
