import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wholeStatAmounts, wholeEffects } from '../public/js/stat-text.js?v=f96d8fd3';

describe('stat text', () => {
  it('rounds fractional stat amounts in messages', () => {
    assert.equal(wholeStatAmounts('You collected a energy quoin. +2.299999999999983 energy.'), 'You collected a energy quoin. +2 energy.');
    assert.equal(wholeStatAmounts('You eat. −1.6 mood, +3.5 energy'), 'You eat. −2 mood, +4 energy');
  });

  it('leaves whole amounts and other numbers alone', () => {
    assert.equal(wholeStatAmounts('You harvest a Gas Plant. -5 energy, +3 Vapour.'), 'You harvest a Gas Plant. -5 energy, +3 Vapour.');
    assert.equal(wholeStatAmounts('Version 1.5 of the map'), 'Version 1.5 of the map');
  });

  it('rounds fractional effect fields only', () => {
    assert.deepEqual(wholeEffects({ energy: 2.3000000001, mood: -1, item: 'grain' }), { energy: 2, mood: -1, item: 'grain' });
  });
});
