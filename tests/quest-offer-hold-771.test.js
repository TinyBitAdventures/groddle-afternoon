/**
 * #771 (R58): a new player on Gentle Island was offered Pot Luck quests during the tutorial.
 * game.js asked holdQuestOffers through the feature host's first-answer lookup; quest-offers-feature
 * (4th in features/index.js) answered false on every normal page, so newxp's hold (and the holds of
 * the features after it) were never read. Glitch queued every offer until the intro was done
 * (players/inc_quests.js 622-624). Now "no opinion" is null, and the hold asks every feature
 * (features.held).
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';
import { FEATURES } from '../public/js/features/index.js?v=3c85d4c4';
import { newxpFeature, __newxpTest } from '../public/js/features/newxp-feature.js?v=17e1d76c';
import { questOffersFeature } from '../public/js/features/quest-offers-feature.js?v=7ced7fa2';
import { GENTLE_ISLAND } from '../public/js/newxp.js?v=abbf0ed6';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const savedNewxp = __newxpTest.save;
after(() => { __newxpTest.save = savedNewxp; });

const islandEngine = () => ({
  started: true,
  mode: 'multiplayer',
  data: {},
  param: () => null,
  setData() {},
  streetTsid: GENTLE_ISLAND.surveyors_stroll,
  inScene: () => false,
  query: () => null,
});

describe('#771 quest offers wait for the tutorial', () => {
  it('the hold the game asks is true on Gentle Island while the tutorial runs', () => {
    __newxpTest.save = { status: 'active', stage: 'island', island: 'arrive' };
    const engine = islandEngine();
    assert.equal(newxpFeature.holdQuestOffers(engine), true, 'newxp alone holds');
    assert.ok(FEATURES.includes(newxpFeature), 'the same module instance the game loads');
    const host = createFeatureHost(FEATURES);
    assert.equal(host.held('holdQuestOffers', engine), true);
    // The first-answer lookup no longer stops at quest-offers' "no opinion" either.
    assert.equal(host.query('holdQuestOffers', engine), true);
  });

  it('game.js asks every feature\'s hold, not the first answer', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /questOffersHeld: \(\) => startHeld\(\) \|\| features\.held\('holdQuestOffers', engine\)/);
    const feast = readFileSync(join(root, 'public/js/features/pot-luck-feast-feature.js'), 'utf8');
    assert.doesNotMatch(feast, /query\?\.\('holdQuestOffers'/, 'Pot Luck asks the same composed hold');
  });

  it('quest-offers has no opinion (null) on a normal page and holds a draft play-test', () => {
    assert.equal(questOffersFeature.holdQuestOffers({ param: () => null }), null);
    assert.equal(questOffersFeature.holdQuestOffers({ param: (k) => (k === 'draft' ? 'z1' : null) }), true);
    assert.equal(questOffersFeature.holdQuestOffers({ param: (k) => (k === 'draft' ? 'z1' : k === 'questoffer' ? 'now' : null) }), null);
  });

  it('held() is true when any feature holds, whatever an earlier one answers', () => {
    const host = createFeatureHost([
      { id: 'a', holdQuestOffers: () => false },
      { id: 'b', holdQuestOffers: () => null },
      { id: 'c', holdQuestOffers: () => true },
    ]);
    assert.equal(host.held('holdQuestOffers', {}), true);
    assert.equal(createFeatureHost([{ id: 'a', holdQuestOffers: () => false }, { id: 'b' }]).held('holdQuestOffers', {}), false);
  });

  it('R58: no hold-type answer is a plain false on a fresh normal page (no opinion is null)', () => {
    __newxpTest.save = { status: 'done', stage: 'done' };
    const engine = { ...islandEngine(), mode: 'solo', streetTsid: 'LA5101HF7F429V5' };
    const holds = new Set();
    for (const f of FEATURES) for (const k of Object.keys(f)) if (/^hold[A-Z]/.test(k) && typeof f[k] === 'function') holds.add(k);
    assert.ok(holds.has('holdQuestOffers'));
    for (const hook of holds) {
      for (const f of FEATURES) {
        if (typeof f[hook] !== 'function') continue;
        let out;
        try { out = f[hook](engine); } catch { continue; }
        assert.ok(out === true || out == null, `${f.id}.${hook} answered ${JSON.stringify(out)}`);
      }
    }
  });
});
