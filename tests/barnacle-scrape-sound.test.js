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
import { actionLoopFor } from '../public/js/sound-moments.js?v=d7ea4f12';
import { sfxFor } from '../public/js/features/resource-nodes-feature.js?v=a98a38eb';

describe('#310 scraping sounds from the start', () => {
  it('the Scraper sound loops for the whole scrape of a barnacle or an ice knob', () => {
    assert.equal(actionLoopFor('mortar_barnacle', 'scrape').key, 'SCRAPER');
    assert.equal(actionLoopFor('ice_knob', 'scrape').key, 'SCRAPER');
    assert.equal(actionLoopFor('npc_piggy', 'scrape'), null);
  });
  it("the end plays the node's own sound, not the Scraper a second time", () => {
    assert.equal(sfxFor({ ok: true, classTsid: 'mortar_barnacle', verbId: 'scrape' }), 'BARNACLE_IS_RELEASED');
    assert.equal(sfxFor({ ok: true, classTsid: 'ice_knob', verbId: 'scrape' }), 'ICE_CUBE');
    // Other packages keep their end sound (no change here).
    assert.equal(sfxFor({ ok: true, classTsid: 'dirt_pile', verbId: 'dig' }), 'SHOVEL');
  });
});
