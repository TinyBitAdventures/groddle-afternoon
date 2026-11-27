/**
 * #547: in the Activity window a made item's line ("+3 Butterfly Butter") coloured "+3 Butterfly"
 * green and left "Butter" black: colorizeAmounts took one word of the unit. An item's or a
 * Giant's name (it starts with a capital) is coloured whole; a stat stays one word.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { colorizeAmounts } from '../public/js/notify-view.js?v=ebba6fd4';

const gains = (html) => [...html.matchAll(/<span class="act-(gain|loss)">([^<]*)<\/span>/g)].map((m) => `${m[1]}:${m[2]}`);

describe('#547 colorizeAmounts colours a whole item name', () => {
  it('a made item of two words, and the ingredients it used', () => {
    assert.deepEqual(
      gains(colorizeAmounts('You made Butterfly Butter. +3 Butterfly Butter, -6 Butterfly Milk, -2 energy, +4 iMG.')),
      ['gain:+3 Butterfly Butter', 'loss:-6 Butterfly Milk', 'loss:-2 energy', 'gain:+4 iMG']
    );
  });

  it('three words, a name with "of" in it, and a Giant\'s favor', () => {
    assert.deepEqual(gains(colorizeAmounts('+2 Stinky Cheese, -1 Pinch of Salt, +5 Humbaba favor')), [
      'gain:+2 Stinky Cheese',
      'loss:-1 Pinch of Salt',
      'gain:+5 Humbaba favor',
    ]);
    assert.deepEqual(gains(colorizeAmounts('+1 Fancy Pick Of Doom')), ['gain:+1 Fancy Pick Of Doom']);
  });

  it('a stat stays one word, and what follows a name is not taken', () => {
    assert.deepEqual(gains(colorizeAmounts('+3 mood Then -1 energy')), ['gain:+3 mood', 'loss:-1 energy']);
    assert.deepEqual(gains(colorizeAmounts('+1 favor with every Giant')), ['gain:+1 favor']);
    assert.deepEqual(gains(colorizeAmounts('+1 Bean Tree.')), ['gain:+1 Bean Tree']);
    assert.deepEqual(gains(colorizeAmounts('+2 Cherries and more')), ['gain:+2 Cherries']);
  });
});
