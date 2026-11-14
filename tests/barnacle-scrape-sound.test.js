/**
 * #310 (The Catface, Squatter's Quag): the scrape sound came only after the scrape was done. In
 * Glitch the skill package announced the Scraper's class sound when the scrape began and stopped it
 * when it ended (players/inc_skill_packages.js 388, 424; mortar_barnacle.js 347 runSkillPackage
 * with the scraper as tool_item), and the barnacle's own BARNACLE_IS_RELEASED played at the end
 * (mortar_barnacle.js 296; ice_knob.js 320 ICE_CUBE for ice).
 * Run: node --test tests/barnacle-scrape-sound.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { actionLoopFor } from '../public/js/sound-moments.js?v=ac6375de';
import { sfxFor } from '../public/js/features/resource-nodes-feature.js?v=214ac1c9';

describe('#310 scraping sounds from the start', () => {
  it('the Scraper sound loops for the whole scrape of a barnacle or an ice knob', () => {
    assert.equal(actionLoopFor('mortar_barnacle', 'scrape').key, 'SCRAPER');
    assert.equal(actionLoopFor('ice_knob', 'scrape').key, 'SCRAPER');
    assert.equal(actionLoopFor('npc_piggy', 'scrape'), null);
  });
  it("the end plays the node's own sound, not the Scraper a second time", () => {
    assert.equal(sfxFor({ ok: true, classTsid: 'mortar_barnacle', verbId: 'scrape' }), 'BARNACLE_IS_RELEASED');
    assert.equal(sfxFor({ ok: true, classTsid: 'ice_knob', verbId: 'scrape' }), 'ICE_CUBE');
  });
});

/**
 * Digging a Dirt Pile and cutting Peat run the same package with a Shovel or an Ace of Spades as
 * tool_item (dirt_pile.js 211-220, peat_1.js 345-367): the Shovel sounds while they run and nothing
 * plays at the end (onDigComplete dirt_pile.js 293-487, onHarvestComplete peat_1.js 233-316 announce no sound).
 */
describe('digging and peat sound from the start, as scraping', () => {
  it('the Shovel loops while a Dirt Pile is dug or Peat is cut', () => {
    assert.equal(actionLoopFor('dirt_pile', 'dig').key, 'SHOVEL');
    for (const peat of ['peat_1', 'peat_2', 'peat_3']) assert.equal(actionLoopFor(peat, 'harvest').key, 'SHOVEL', peat);
    // A crop's harvest is not a peat cut.
    assert.equal(actionLoopFor('trant_fruit', 'harvest'), null);
  });
  it('no end sound where Glitch had none', () => {
    assert.equal(sfxFor({ ok: true, classTsid: 'dirt_pile', verbId: 'dig' }), null);
    assert.equal(sfxFor({ ok: true, classTsid: 'peat_1', verbId: 'harvest' }), null);
    // Others keep theirs.
    assert.equal(sfxFor({ ok: true, classTsid: 'paper_tree', verbId: 'harvest' }), 'PAPER_TREE');
    assert.equal(sfxFor({ ok: true, classTsid: 'jellisac', verbId: 'scoop' }), 'SCOOPED_JELLISAC');
  });
});
