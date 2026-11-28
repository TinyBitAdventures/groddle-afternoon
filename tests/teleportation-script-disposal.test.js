/**
 * G1233 (#657): a Teleportation Script you don't want, an old smudged one too, can be sold to any
 * vendor or given to any shrine, as in Glitch: items/teleportation_script.js has only the tags
 * teleportation_script, no_rube and bureaucracy (no no_vendor, no no_donate), base_cost 5, and the
 * takeable drop and give. Glitch had no burn, shred or trash verb for any item.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addItem, createInventory, ensureItem } from '../public/js/inventory.js?v=3be7988a';
import { SCRIPT_CLASS, SCRIPT_ITEM } from '../public/js/teleportation.js?v=cbbc673f';
import { vendorSellValue } from '../public/js/vendor.js?v=7a07f478';
import { createShrineState, quoteShrineDonation } from '../public/js/shrines.js?v=b063e857';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '..', 'glitch-GameServerJS', 'items', 'teleportation_script.js');

describe('Teleportation Scripts can be sold and donated (#657)', () => {
  ensureItem(SCRIPT_CLASS, { ...SCRIPT_ITEM });

  it('a vendor buys one at its base cost of 5', () => {
    assert.equal(SCRIPT_ITEM.baseCost, 5);
    assert.notEqual(SCRIPT_ITEM.sellable, false);
    const { unit } = vendorSellValue(SCRIPT_CLASS, 1);
    assert.ok(unit > 0, `sells for ${unit}`);
  });

  it('a shrine takes one', () => {
    assert.notEqual(SCRIPT_ITEM.donatable, false);
    const inv = createInventory();
    addItem(inv, SCRIPT_CLASS, 1);
    const q = quoteShrineDonation(createShrineState(), 'alph', inv, SCRIPT_CLASS, 1, { xp: 1000 });
    assert.notEqual(q.reason, 'not_donatable');
    assert.notEqual(q.reason, 'no_donate');
  });

  it('matches GSJS: no no_vendor or no_donate tag on the script', { skip: !existsSync(gsjs) && 'needs glitch-GameServerJS' }, () => {
    const src = readFileSync(gsjs, 'utf8');
    assert.match(src, /var base_cost = 5;/);
    assert.doesNotMatch(src, /"no_vendor"|"no_donate"/);
  });
});
