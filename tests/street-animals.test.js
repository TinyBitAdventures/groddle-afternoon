/**
 * Street Piggies, Chickens and Batterflies come back where the original had
 * them, from the same live glitch.com street pages as the Butterflies
 * (tools/ecology/animal-census.json; tests/street-butterflies.test.js) and the
 * snapshot's own items, at the original's street cleanup caps
 * (locations/inc_admin.js admin_clean_street: 3 Piggies, 2 Chickens a street;
 * Batterflies have none). A street with no evidence has none.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { populationForStreet, setStreetEcologyCatalog, RENDER_ANIMAL_CAPS, STREET_ANIMAL_CAPS } from '../public/js/street-ecology.js?v=3c1d4c06';
import { batterflyCountForStreet } from '../public/js/animal-husbandry.js?v=7194f0f1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const census = new Map(JSON.parse(readFileSync(join(root, 'tools/ecology/animal-census.json'), 'utf8')).streets.map((r) => [r.tsid, r]));
const index = JSON.parse(readFileSync(join(root, 'public/assets/streets/index.json'), 'utf8'));
setStreetEcologyCatalog(catalog);

const STARTER = index.default;
const pop = (tsid) => populationForStreet(tsid, catalog.streets[tsid], { starter: tsid === STARTER });
const CLASSES = Object.freeze([
  ['npc_piggy', 'piggies', STREET_ANIMAL_CAPS.piggies],
  ['npc_chicken', 'chickens', STREET_ANIMAL_CAPS.chickens],
  ['npc_batterfly', 'batterflies', Infinity],
]);
/** Rows the original's cleanup never touched: the starter, and instanced locations (their row carries `caps`). */
const uncleaned = (tsid) => tsid === STARTER || !!catalog.streets[tsid]?.caps;

describe('street Piggies, Chickens and Batterflies from the live street pages', () => {
  for (const [classTsid, field, cap] of CLASSES) {
    it(`${field}: every street with evidence has them, at the cap, with its sources`, () => {
      const map = catalog[field];
      assert.ok(Object.keys(map).length >= (field === 'batterflies' ? 60 : 400), `${field}: ${Object.keys(map).length}`);
      for (const [tsid, ev] of Object.entries(map)) {
        const row = census.get(tsid);
        const page = row?.[field] || 0;
        assert.equal(ev.count, Math.max(page, ev.snapshot || 0), `${field} ${tsid}`);
        if (page) assert.deepEqual(ev.wayback, row.captures.filter((c) => c[field] > 0).map((c) => c.wayback), tsid);
        const want = Math.min(ev.count, uncleaned(tsid) ? RENDER_ANIMAL_CAPS[classTsid] || cap : cap);
        assert.equal(catalog.streets[tsid].counts[classTsid], want, `${field} ${catalog.streets[tsid].label}`);
      }
    });

    it(`${field}: no evidence, none`, () => {
      for (const [tsid, row] of Object.entries(catalog.streets)) {
        if (row.interior || !row.counts?.[classTsid]) continue;
        assert.ok(catalog[field][tsid], `${row.label} lists ${field} with no evidence`);
      }
    });
  }

  it('shows at most 3 Piggies and 2 Chickens on a cleaned street', () => {
    for (const tsid of Object.keys(catalog.streets)) {
      if (uncleaned(tsid) || catalog.streets[tsid].interior) continue;
      const p = pop(tsid);
      assert.ok(p.piggies <= 3 && p.chickens <= 2, `${catalog.streets[tsid].label}: ${p.piggies}, ${p.chickens}`);
    }
  });

  it('keeps the starter its own 6 Piggies and its Chickens, and The Great Hog Haul its 6 Piggies', () => {
    const starter = pop(STARTER);
    assert.deepEqual([starter.piggies, starter.chickens, starter.butterflies, starter.flyingButterflies], [6, 3, 0, 4]);
    // Hechey Track's page (August 2012): 6 Piggies, 7 Chickens.
    assert.deepEqual([catalog.piggies[STARTER].count, catalog.chickens[STARTER].count], [6, 7]);
    assert.equal(pop('GHVJQH26ERF3VMJ').piggies, 6);
  });

  it('places Batterflies by the census: 60 streets, Churni Sanctum 4', () => {
    const streets = Object.keys(index.streets).filter((tsid) => batterflyCountForStreet({ tsid }) > 0);
    assert.equal(streets.length, 60);
    assert.equal(batterflyCountForStreet({ tsid: 'GA9114MS8B32FB2' }), 4);
  });

  it('leaves enough animals for the Animal Kinship quests in most regions', () => {
    const byHub = {};
    let qrazy = 0;
    for (const tsid of Object.keys(index.streets)) {
      const p = pop(tsid);
      const hub = index.streets[tsid].hubName;
      byHub[hub] ||= { piggies: 0, chickens: 0 };
      byHub[hub].piggies += p.piggies;
      byHub[hub].chickens += p.chickens;
      // Animal Qrazy: 2 Chickens, 3 Piggies and 2 Butterflies in one snap.
      if (p.chickens >= 2 && p.piggies >= 3 && p.butterflies + p.flyingButterflies >= 2) qrazy += 1;
    }
    const total = (k) => Object.values(byHub).reduce((a, h) => a + h[k], 0);
    // Pet 6 Piggies; 13 Meat from 13 Piggies in one game day.
    assert.ok(Object.values(byHub).filter((h) => h.piggies >= 13).length >= 20, JSON.stringify(byHub));
    assert.ok(byHub['Groddle Forest'].piggies >= 13 && byHub['Groddle Meadow'].piggies >= 13);
    assert.ok(Object.values(byHub).filter((h) => h.chickens >= 10).length >= 30);
    assert.ok(total('piggies') >= 1000 && total('chickens') >= 1400, `${total('piggies')} ${total('chickens')}`);
    assert.ok(qrazy >= 100, String(qrazy));
  });
});
