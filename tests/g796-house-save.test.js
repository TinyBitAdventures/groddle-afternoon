/**
 * G796 (Austin 2026-11-22: build all ten, free, move saves onto the originals): the house on the
 * home street is Glitch's furniture_chassis, one of ten houses with a choice per part, from the
 * CC0 SWFs (tools/house-art/build.mjs), customized with the house's Customize verb
 * (furniture_chassis.js verbs.customize; the client's ChassisManager / ConfiggerUI), free.
 * This file: saves move onto the original houses (js/homes.js, the migration).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_FROM_HOME_STYLE, defaultHouseConfig } from '../public/js/home-house.js?v=3c88c47c';
import { createHomeState, imagineHome, normalizeHomeState } from '../public/js/homes.js?v=4f4ade68';

describe('saves move onto the original houses (migration)', () => {
  it('a home from before G796 takes the original its style\'s door-deco house moves to, facing left', () => {
    assert.deepEqual(HOUSE_FROM_HOME_STYLE, { meadow: 'cottage', firebog: 'firebog', uralia: 'hominid' });
    for (const [style, chassis] of Object.entries(HOUSE_FROM_HOME_STYLE)) {
      const home = normalizeHomeState({ owned: true, style, visits: 4 });
      assert.equal(home.house.chassis, chassis, style);
      assert.deepEqual(home.house.config, defaultHouseConfig(chassis));
      assert.equal(home.house.facingRight, false);
      assert.equal(home.style, style, 'the style stays (music, first street and yard looks)');
    }
  });

  it('a house already chosen is kept through the save and its normalizing', async () => {
    const seed = { owned: true, style: 'meadow', house: { chassis: 'bone', config: { skull: 3 }, facingRight: true } };
    const home = normalizeHomeState(seed);
    assert.equal(home.house.chassis, 'bone');
    assert.equal(home.house.config.skull, 3);
    assert.equal(home.house.facingRight, true);
    // A stored save is normalized on load (player-save normalizeSystemsSnapshot), so it moves there.
    const { normalizeSystemsSnapshot } = await import('../public/js/player-save.js?v=e68db82d');
    assert.equal(normalizeSystemsSnapshot({ home: { owned: true, style: 'uralia' } }).home.house.chassis, 'hominid');
    assert.equal(normalizeSystemsSnapshot({ home: seed }).home.house.chassis, 'bone');
  });
});
