/**
 * #579: "Batterflies are not listed on the street contents summary that pops up when changing
 * streets ... some summaries do list them" (Level 1 West, a Batterfly in view). The loading card's
 * Home to: is built when the street is (game.js loadingCardDetails over its targets and the
 * features' pendingTargets), and replaces the early list from the street's data, which named them
 * (homeToTargets). The Batterflies spawn on the feature's first tick, once their sheets load, so
 * the built list left them out (and the next visit's card showed that list). The animals left on a
 * street (a released Piggy, the back yard's) spawn on that tick too. Glitch's card counted every
 * item on the street (location.js getLoadingInfo). The husbandry feature now names them in
 * pendingTargets until they are spawned; Piggies, Chickens and Butterflies are spawned with the
 * street, Fireflies and Salmon are resource nodes with their own pendingTargets (#478).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=58aafb61';
import { animalHusbandryFeature, husbandryPendingRows } from '../public/js/features/animal-husbandry-feature.js?v=34d7bd7a';
import { homeToFeatures, streetFeaturesFromTargets } from '../public/js/exploration.js?v=8f19e25d';

const pub = join(import.meta.dirname, '../public');
const LEVEL_1_WEST = 'GHH110KCF411NK6';

before(() => {
  setStreetEcologyCatalog(JSON.parse(readFileSync(join(pub, 'assets/content/street-ecology.json'), 'utf8')));
});

function fakeEngine(tsid, { points = [{ x: 100, y: 50 }, { x: 900, y: 60 }], slot = {}, transient = false } = {}) {
  const slots = { [tsid]: slot };
  return {
    streetTsid: tsid,
    street: { tsid },
    placement: (key) => (key === 'batterfly' ? points : []),
    streetSlot: (_id, t = tsid) => (slots[t] ||= {}),
    transientInstance: () => transient,
  };
}

describe('#579 the loading card counts the Batterflies before they spawn', () => {
  it('names one Batterfly per placed point, up to the street\'s count, and the animals left there', () => {
    assert.deepEqual(husbandryPendingRows({ batterflies: 2, points: [{ x: 1 }, { x: 2 }, { x: 3 }] }).map((r) => r.classId), ['npc_batterfly', 'npc_batterfly']);
    assert.equal(husbandryPendingRows({ batterflies: 3, points: [{ x: 1 }, {}] }).length, 1, 'a point with no place spawns none');
    assert.deepEqual(husbandryPendingRows({ animals: [{ classId: 'npc_piggy' }, { classId: 'npc_chicken' }, { classId: 'bogus' }] }).map((r) => r.classId), ['npc_piggy', 'npc_chicken']);
    assert.deepEqual(husbandryPendingRows(), []);
  });

  it('Level 1 West: its two Batterflies are in the built card\'s Home to: before the first tick', () => {
    const engine = fakeEngine(LEVEL_1_WEST);
    animalHusbandryFeature.onStreetEnter(engine);
    const pending = animalHusbandryFeature.pendingTargets(engine);
    assert.deepEqual(pending.map((r) => r.classId), ['npc_batterfly', 'npc_batterfly']);
    const card = homeToFeatures(streetFeaturesFromTargets([{ classId: 'npc_piggy' }, ...pending]));
    assert.ok(card.some((line) => /<b>2 Batterflies<\/b>/.test(line)), card.join(' | '));
  });

  it('a street with no Batterflies, or a quest copy, names none', () => {
    assert.deepEqual(animalHusbandryFeature.pendingTargets(fakeEngine('GLI2V0UN7RD1T2J')), []);
    assert.deepEqual(animalHusbandryFeature.pendingTargets(fakeEngine(LEVEL_1_WEST, { transient: true })), []);
    assert.deepEqual(animalHusbandryFeature.pendingTargets(null), []);
  });

  it('an animal left on a street is named too', () => {
    const engine = fakeEngine('GLI2V0UN7RD1T2J', { slot: { animals: [{ classId: 'npc_piggy', x: 400 }] } });
    assert.deepEqual(animalHusbandryFeature.pendingTargets(engine).map((r) => r.classId), ['npc_piggy']);
  });

  it('game.js builds the card from the targets and every feature\'s pendingTargets', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /loadingCardDetails\(\{\s*targets: \[\.\.\.interactables, \.\.\.features\.collect\('pendingTargets', engine\)\]/);
  });
});
