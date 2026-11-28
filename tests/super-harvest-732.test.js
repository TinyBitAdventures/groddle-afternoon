/**
 * #732: a Jellisac Super Harvest gave its 3 bonus clumps and its "Super Harvest!" line, but no
 * rainbow and no RAINBOW_SUPERHARVEST. Glitch showed the arc for it (jellisac.js 183-196:
 * pc.show_rainbow('rainbow_superharvest', 1000), whose sound is RAINBOW_SUPERHARVEST,
 * players/player.js 3013-3065), and the max_luck buff forced the bonus (jellisac.js 183).
 * Every resource node's result goes through applyResult, which now hands any Super Harvest
 * output to the engine's one Super Harvest effect (game.js showSuperHarvestFx).
 * Run: node --test tests/super-harvest-732.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResourceNode, harvestResourceNode } from '../public/js/resource-nodes.js?v=c2eb46b1';
import { announceSuperHarvest, sfxFor } from '../public/js/features/resource-nodes-feature.js?v=1c2c7f81';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const ctx = (extra = {}) => ({ now: 1, dayKey: 'd1', rng: () => 0.5, skills: ['jellisac_hands_1'], ...extra });
const scoop = (extra) => harvestResourceNode(createResourceNode('jellisac'), {}, { energy: 50 }, ctx(extra));

describe('#732 a Jellisac Super Harvest shows its rainbow', () => {
  it('the result hands its bonus to the engine Super Harvest effect', () => {
    const r = scoop({ rng: () => 0.05 });
    assert.ok(r.superHarvest, 'a Super Harvest');
    const calls = [];
    const shown = announceSuperHarvest({ superHarvest: (...a) => calls.push(a) }, r);
    assert.equal(shown, true);
    assert.deepEqual(calls, [['jellisac_clump', 3]]);
  });

  it('no Super Harvest, no rainbow', () => {
    const calls = [];
    const r = scoop({ rng: () => 0.9 });
    assert.equal(r.superHarvest, undefined);
    assert.equal(announceSuperHarvest({ superHarvest: (...a) => calls.push(a) }, r), false);
    assert.equal(announceSuperHarvest({ superHarvest: (...a) => calls.push(a) }, { ok: false }), false);
    assert.deepEqual(calls, []);
  });

  it('the scoop keeps its own sound; RAINBOW_SUPERHARVEST comes with the arc', () => {
    assert.equal(sfxFor(scoop({ rng: () => 0.05 })), 'SCOOPED_JELLISAC');
  });

  it('Max Luck forces the bonus, even on a scoop that brought a drop (jellisac.js 183)', () => {
    assert.equal(scoop({ rng: () => 0.9 }).superHarvest, undefined);
    assert.deepEqual(scoop({ rng: () => 0.9, maxLuck: true }).superHarvest, { classTsid: 'jellisac_clump', qty: 3 });
    assert.ok(scoop({ rng: () => 0.9, maxLuck: true, rollDrop: () => true }).superHarvest);
    // Without the Jellisac Hands package there is no multiplier, so no bonus even with Max Luck.
    assert.equal(scoop({ skills: [], maxLuck: true }).superHarvest, undefined);
  });

  it('applyResult announces it, the verb context carries Max Luck, and the engine shows the arc', () => {
    const feature = read('public/js/features/resource-nodes-feature.js');
    const apply = feature.slice(feature.indexOf('function applyResult('), feature.indexOf('export function slothsChewing'));
    assert.match(apply, /announceSuperHarvest\(engine, result\)/);
    const verbCtx = feature.slice(feature.indexOf('function verbContext('), feature.indexOf('export function fireflyTouches'));
    assert.match(verbCtx, /maxLuck: Boolean\(engine\.hasBuff\?\.\('max_luck'\)\)/);
    const game = read('public/game.js');
    const engineObj = game.slice(game.indexOf('\nconst engine = {'));
    assert.match(engineObj, /\n  superHarvest: \(itemClassTsid, amount\) => showSuperHarvestFx\(itemClassTsid, amount\)/);
  });
});
