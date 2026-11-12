/**
 * An Apple eats as Glitch's did: items/apple.js base_cost 5 x energy_factor 1
 * (include/food.js 214) = 5 energy and no mood, then the Apple a Day buff
 * (apple.js 252, catalog_buffs.js well_fed_energy) adds 5 more at 30 s.
 * Run: node --test tests/apple-glitch-numbers.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInventory, getItemUseInfo, registerItemUse, useItem } from '../public/js/inventory.js?v=2bd5b93e';
import { consumeBuffFor } from '../public/js/buff-triggers.js?v=a3093922';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('apple', () => {
  it('previews and applies 5 energy, no mood', () => {
    assert.deepEqual(getItemUseInfo('apple').effects, { energy: 5 });
    const inv = createInventory({ apple: 1 });
    const pc = { energy: 40, mood: 40 };
    const used = useItem(inv, pc, 'apple');
    assert.equal(used.ok, true);
    assert.equal(pc.energy, 45);
    assert.equal(pc.mood, 40);
  });

  it('the GSJS item import may refresh it and agrees', () => {
    const items = JSON.parse(readFileSync(join(root, 'public/assets/content/making-items.json'), 'utf8')).items;
    assert.equal(items.apple.use.energy, 5);
    assert.equal(items.apple.use.mood, undefined);
    registerItemUse('apple', items.apple.use, { label: 'Apple' });
    assert.deepEqual(getItemUseInfo('apple').effects, { energy: 5 });
  });

  it('eating one starts Apple a Day', () => {
    assert.equal(consumeBuffFor('apple:eat')?.buff, 'well_fed_energy');
  });
});
