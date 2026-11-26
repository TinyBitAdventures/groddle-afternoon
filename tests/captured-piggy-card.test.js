/**
 * Sibling audit B2 (2026-11-21): after a Herdkeeping capture, that street's loading card said
 * "3 Piggies" while 2 walked there, on every visit for the location cooldown (about 67 hours).
 * game.js spawns the street's Piggies with the street and the card counts the street's targets as
 * soon as enterStreet returns (streetTripTo details, then kept per street in homeToSeen); the
 * captured Piggy was taken off only on husbandry's first tick, after the card, and that tick threw
 * on an undefined clock, so it stayed on the street too. Now it goes as the street is entered.
 * Run: node --test tests/captured-piggy-card.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { animalHusbandryFeature } from '../public/js/features/animal-husbandry-feature.js?v=412e0f21';
import { HERDKEEPING } from '../public/js/animal-husbandry.js?v=c66fc912';

const piggy = (state = {}) => ({ classId: 'npc_piggy', label: 'Piggy', state, sprite: { visible: true, destroyed: false } });
const engineWith = (interactables, mode = 'solo') => ({
  mode,
  streetTsid: 'LA5101HF7F429V',
  street: { tsid: 'LA5101HF7F429V' },
  interactables,
  transientInstance: () => false,
});

describe('B2 a captured Piggy is off the street before the loading card counts it', () => {
  it('solo: the captured Piggy is gone on arrival, the others stay', () => {
    const caught = piggy({ capturedAt: Date.now() - 60_000 });
    const others = [piggy(), piggy()];
    const engine = engineWith([caught, ...others]);
    animalHusbandryFeature.onStreetEnter(engine.street, engine);
    // What the card counts (game.js details: interactables right after enterStreet returns).
    const counted = engine.interactables.filter((t) => t.classId === 'npc_piggy');
    assert.equal(counted.length, 2, 'the card counts the two that walk there');
    assert.ok(!engine.interactables.includes(caught));
    assert.equal(caught.sprite.visible, false);
  });

  it('a capture older than the location cooldown is back', () => {
    const old = piggy({ capturedAt: Date.now() - HERDKEEPING.locationCooldownMs - 1000 });
    const engine = engineWith([old, piggy()]);
    animalHusbandryFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.interactables.length, 2);
  });

  it('online a street Piggy\'s leaving is the realtime server\'s (G605): nothing is taken here', () => {
    const caught = piggy({ capturedAt: Date.now() - 60_000 });
    const engine = engineWith([caught, piggy()], 'multiplayer');
    animalHusbandryFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.interactables.length, 2);
  });
});
