// #503: a Hoe's pack card and slot tooltip say whether aggressive hoeing is on and what a cleared
// plot wears, since Glitch showed the mode only through the verb it offered (hoe.js 70-126).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggressiveHoeingFeature, hoeModeNote } from '../public/js/features/aggressive-hoeing-feature.js?v=146ead82';
import { packSlotTip } from '../public/js/ui/pack-row.js?v=f5ef5f6c';

const CARD = ['hoeing_more_img_more_wear'];

describe('Hoe mode line (#503)', () => {
  it('says nothing without the Hoe Down card', () => {
    assert.equal(hoeModeNote({}, ['croppery_2'], []), '');
  });
  it('says on, with Croppery II\'s 4 wear a plot (garden.js 244-256)', () => {
    assert.equal(hoeModeNote({ aggressiveOff: false }, ['croppery_1', 'croppery_2'], CARD), 'Aggressive hoeing on · 4 wear a plot, more iMG');
  });
  it('says off, with the plain 1 wear a plot', () => {
    assert.equal(hoeModeNote({ aggressiveOff: true }, ['croppery_1', 'croppery_2'], CARD), 'Aggressive hoeing off · 1 wear a plot');
  });
  it('the feature answers only for hoes', () => {
    const engine = { pc: { aggressiveOff: false, imaginationUpgrades: CARD }, learnedSkills: ['croppery_1', 'croppery_2'] };
    assert.match(aggressiveHoeingFeature.packKindNote('hoe', engine), /^Aggressive hoeing on/);
    assert.equal(aggressiveHoeingFeature.packKindNote('watering_can', engine), '');
  });
  it('the slot tooltip carries the line', () => {
    const tip = packSlotTip({ label: 'Hoe', tool: true, note: 'Aggressive hoeing on · 4 wear a plot, more iMG' });
    assert.match(tip.sub, /Aggressive hoeing on · 4 wear a plot/);
  });
});
