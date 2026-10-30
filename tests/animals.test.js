import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAnimalState,
  ensureAnimalState,
  listAnimalFeedOptions,
  feedAnimal,
  resetAnimalDay,
  animalStatusLabel,
} from '../public/js/animals.js?v=g454-1';
import { getVerbsFor, runVerb } from '../public/content.js?v=g454-1';
import { actionDurationFor, actionLabelFor, ACTION_DURATION_MS } from '../public/js/action-timing.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('Animal Kinship daily care', () => {
  it('builds pack-backed feed choices and consumes exactly the selected food', () => {
    const state = createAnimalState('npc_piggy');
    const inv = { apple: 2, cherry: 0, grain: 3, plank: 4 };
    assert.deepEqual(
      listAnimalFeedOptions('npc_piggy', inv).map((row) => row.classTsid),
      ['apple', 'grain']
    );
    const fed = feedAnimal('npc_piggy', state, inv, 'apple');
    assert.equal(fed.ok, true);
    assert.equal(inv.apple, 1);
    assert.equal(inv.plank, 4);
    assert.equal(state.fed, true);
    assert.equal(state.hunger, 0);
    assert.match(animalStatusLabel('npc_piggy', state), /fed/i);
  });

  it('requires love before nibbling and enforces one pet/nibble per game day', () => {
    const target = { classId: 'npc_piggy', state: createAnimalState('npc_piggy') };
    const inv = { apple: 1, meat: 0 };
    const pc = { energy: 80, mood: 70, imagination: 0, xp: 0 };

    let verbs = getVerbsFor(target, { pc, inv });
    assert.equal(verbs.find((verb) => verb.id === 'pet').enabled, true);
    assert.equal(verbs.find((verb) => verb.id === 'nibble').enabled, false);
    const feed = verbs.filter((verb) => verb.id === 'feed');
    assert.equal(feed.length, 1);
    assert.equal(feed[0].enabled, true);
    assert.match(feed[0].tooltip, /1 eligible pack item/);

    const blockedNibble = runVerb(target, 'nibble', { pc, inv });
    assert.equal(blockedNibble.ok, false);
    assert.equal(pc.energy, 80);
    assert.equal(inv.meat, 0);

    const pet = runVerb(target, 'pet', { pc, inv, rng: () => 0.5 });
    assert.equal(pet.ok, true);
    const energyAfterPet = pc.energy;
    assert.equal(runVerb(target, 'pet', { pc, inv }).ok, false);
    assert.equal(pc.energy, energyAfterPet);

    verbs = getVerbsFor(target, { pc, inv });
    assert.equal(verbs.find((verb) => verb.id === 'nibble').enabled, true);
    assert.equal(runVerb(target, 'nibble', { pc, inv, rng: () => 0.5 }).ok, true);
    assert.equal(inv.meat, 1);
    const energyAfterNibble = pc.energy;
    assert.equal(runVerb(target, 'nibble', { pc, inv }).ok, false);
    assert.equal(pc.energy, energyAfterNibble);
    assert.equal(inv.meat, 1);
  });

  it('reports feed deltas, honors stat caps, and resets care at new day', () => {
    const target = { classId: 'npc_piggy', state: createAnimalState('npc_piggy', { petted: true }) };
    const inv = { apple: 1 };
    const pc = { energy: 50, mood: 99, imagination: 0, xp: 0 };
    const result = runVerb(target, 'feed:apple', { pc, inv });
    assert.equal(result.ok, true);
    assert.deepEqual(result.effects.items, { apple: -1 });
    // npc_animal feed: no mood; +2 XP because an Apple (base cost 5) fed a hungry piggy.
    assert.equal(result.effects.mood, 0);
    assert.equal(result.effects.img, 2);
    assert.match(result.effects.activityLine, /-1 Apple/);
    assert.equal(inv.apple, 0);

    target.state.nibbled = true;
    resetAnimalDay('npc_piggy', target.state);
    assert.equal(target.state.petted, false);
    assert.equal(target.state.nibbled, false);
    assert.equal(target.state.fed, false);
    assert.equal(target.state.feedCount, 1);
  });

  it('limits chicken squeezing and resets butterflies for another care cycle', () => {
    const chicken = { classId: 'npc_chicken', state: createAnimalState('npc_chicken') };
    const inv = { grain: 0 };
    const pc = { energy: 40, mood: 40, imagination: 0, xp: 0 };
    assert.equal(runVerb(chicken, 'squeeze', { pc, inv, rng: () => 0.5 }).ok, true);
    const grainAfter = inv.grain;
    assert.equal(runVerb(chicken, 'squeeze', { pc, inv }).ok, false);
    assert.equal(inv.grain, grainAfter);
    resetAnimalDay('npc_chicken', chicken.state);
    assert.equal(chicken.state.squeezedToday, 0);
    assert.equal(getVerbsFor(chicken, { pc, inv }).find((v) => v.id === 'squeeze').enabled, true);

    const butterfly = ensureAnimalState('npc_butterfly', { massaged: true, milked: true });
    resetAnimalDay('npc_butterfly', butterfly);
    assert.equal(butterfly.massaged, false);
    assert.equal(butterfly.milked, false);
    assert.equal(butterfly.massageUsesToday, 0);
    assert.equal(butterfly.milkUsesToday, 0);
  });

  it('times target-item feed verbs as a committed feeding action', () => {
    assert.equal(actionDurationFor('npc_piggy', 'feed:apple'), ACTION_DURATION_MS.feed);
    assert.equal(actionLabelFor('feed:apple', 'Piggy'), 'Feeding Piggy…');
  });

  it('wires session-stable animal state and new-day reset into the world', () => {
    const game = readFileSync(join(here, '../public/game.js'), 'utf8');
    assert.match(game, /animalStateCache/);
    assert.match(game, /animalStateFor\('npc_piggy'/);
    assert.match(game, /resetAllAnimalsForNewDay\(\)/);
    assert.match(game, /result\.animalChanged/);
    assert.match(game, /bootParams\.has\('fresh'\) \? null/);
  });
});
