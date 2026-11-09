/**
 * The jump grows with the High Jumper cards, as in the source (Austin 2026-11-04).
 *
 * - players/inc_physics.js setDefaultPhysics 97-106: a new player's vy_jump is x0.7105 (69 px).
 * - inc_data_imagination.js 3240-3337: High Jumper I x0.907 (116 px, 3 iMG), II x1 (142 px, 6 iMG,
 *   needs Walk Speed I), III x1.05. I and II are tutorial cards (condition type 1).
 * - The remake gave every save I and II as starters and floored the jump at x1; now a new
 *   character buys them, in the tutorial or (outside it) from the normal hand.
 * - Saves from before (imagination slice without cardsVersion 2) keep the x1 jump: the
 *   migration records both cards as owned.
 * - The remake's own layouts built for the classic jump (feature-built scenes, quest runs) keep
 *   x1 for a player under it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  IMAGINATION_SAVE_VERSION,
  JUMP_CARDS,
  STARTER_UPGRADES,
  TUTORIAL_UPGRADES,
  buildDeck,
  createImaginationState,
  grantStarterUpgrades,
  migrateImaginationState,
  normalizeImaginationState,
  purchaseCard,
  remakeMovementMultipliers,
  upgradeStatus,
} from '../public/js/imagination.js?v=6adb7b9a';
import { isOfferedInRemake, isOfferedOnline } from '../public/js/imagination-remake.js?v=c37ad887';
import { imaginationFeature } from '../public/js/features/imagination-feature.js?v=7a2564e8';
import { NORMAL_BUFF, jumpApex } from '../public/js/avatar-step.js?v=e8e9581f';
import { reachStreet } from '../public/js/builder/reach-graph.js?v=f1b86aeb';
import { WINTER_WALK_START, WINTER_WALK_TSID } from '../public/js/winter-walk-streets.js?v=8607edd3';
import { SKIP_TUTORIAL_CARDS } from '../public/js/newxp.js?v=85922204';

const read = (rel) => readFileSync(join(import.meta.dirname, '..', 'public', rel), 'utf8');

function fakeEngine(owned = [], { scene = false, instance = false, claim = null, street = 'GIF1G7Q75312T8B', mode = 'solo' } = {}) {
  return {
    mode,
    streetTsid: street,
    pc: { imaginationUpgrades: [...owned], energy: 80, imagination: 100 },
    setData() {},
    param: () => null,
    inScene: () => scene,
    transientInstance: () => scene || instance,
    query: (hook) => (hook === 'classicJumpPlace' ? claim : null),
  };
}

describe('jump by card set', () => {
  const cases = [
    ['a new character (no cards)', [], 0.7105, 69],
    ['the solo starters (no High Jumper)', STARTER_UPGRADES, 0.7105, 69],
    ['High Jumper I', [...STARTER_UPGRADES, 'jump_1'], 0.907, 116],
    ['High Jumper II', [...STARTER_UPGRADES, 'jump_1', 'jump_2'], 1, 142],
    ['High Jumper III', [...TUTORIAL_UPGRADES, 'jump_triple_3', 'jump_3'], 1.05, 158],
  ];
  for (const [name, owned, mult, apex] of cases) {
    it(`${name}: x${mult}, a ${apex} px jump`, () => {
      const m = remakeMovementMultipliers(owned);
      assert.equal(m.jump, mult);
      assert.equal(m.speed, 1, 'the walk is untouched');
      assert.equal(Math.round(jumpApex(m.jump)), apex);
    });
  }
});

describe('High Jumper I and II are bought', () => {
  it('are not starters any more; the other seven tutorial cards are', () => {
    assert.deepEqual(JUMP_CARDS, ['jump_1', 'jump_2']);
    assert.equal(STARTER_UPGRADES.length, 7);
    for (const id of JUMP_CARDS) assert.equal(STARTER_UPGRADES.includes(id), false, id);
    const state = createImaginationState();
    const owned = [];
    grantStarterUpgrades(state, owned);
    assert.equal(owned.some((id) => JUMP_CARDS.includes(id)), false);
  });

  it('are dealt outside the tutorial, solo and online, with their source cost and chance', () => {
    for (const offerable of [isOfferedInRemake, isOfferedOnline]) {
      const deck = buildDeck({ level: 5, owned: [...STARTER_UPGRADES], offerable });
      const rows = (id) => deck.filter((c) => c.class_tsid === id);
      assert.equal(rows('jump_1').length, 10);
      assert.equal(rows('jump_1')[0].cost, 3);
      assert.equal(rows('jump_2').length, 10);
      assert.equal(rows('jump_2')[0].cost, 6);
      // The other tutorial cards stay out of the normal hand.
      assert.equal(rows('walk_speed_1').length + rows('mappery').length, 0);
    }
  });

  it('keep their other conditions: High Jumper II needs Walk Speed I; owned cards leave the deck', () => {
    assert.equal(upgradeStatus('jump_1', { owned: [] }).can_learn, true);
    assert.equal(upgradeStatus('jump_2', { owned: [] }).can_learn, false);
    assert.equal(upgradeStatus('jump_2', { owned: ['walk_speed_1'] }).can_learn, true);
    assert.equal(upgradeStatus('jump_1', { owned: ['jump_1'] }).can_learn, false);
    assert.equal(upgradeStatus('walk_speed_1', { owned: [] }).can_learn, false);
    const deck = buildDeck({ owned: [...TUTORIAL_UPGRADES], offerable: isOfferedInRemake });
    assert.equal(deck.some((c) => JUMP_CARDS.includes(c.class_tsid)), false);
  });

  it('buying I then II raises the jump to x0.907 then x1', () => {
    const state = createImaginationState();
    const owned = [...STARTER_UPGRADES];
    const wallet = { imagination: 9 };
    state.hand = [{ class_tsid: 'jump_1', amount: 0, cost: 3 }, null, null];
    const ctx = { owned, offerable: isOfferedInRemake };
    assert.equal(purchaseCard(state, owned, wallet, 0, ctx, { rng: () => 0 }).ok, true);
    assert.equal(wallet.imagination, 6);
    assert.equal(remakeMovementMultipliers(owned).jump, 0.907);
    state.hand = [{ class_tsid: 'jump_2', amount: 0, cost: 6 }, null, null];
    assert.equal(purchaseCard(state, owned, wallet, 0, ctx, { rng: () => 0 }).ok, true);
    assert.equal(wallet.imagination, 0);
    assert.equal(remakeMovementMultipliers(owned).jump, 1);
  });

  it('the card notes say what the cards do', () => {
    const src = read('js/imagination-remake.js');
    assert.match(src, /\[\/\^jump_1\$\/, 'live', 'A new player jumps about 69 px high; High Jumper I raises that to about 116 px\./);
    assert.match(src, /\[\/\^jump_2\$\/, 'live', 'The full jump, about 142 px high\./);
    assert.match(src, /a solo game that skips the tutorial is given it\.'\],\n\s*\[\/\^jump_2\$\//);
  });
});

describe('saves from before keep their jump', () => {
  it('a new slice is at the current version; a save without a version is version 1', () => {
    assert.equal(IMAGINATION_SAVE_VERSION, 2);
    assert.equal(createImaginationState().cardsVersion, 2);
    assert.equal(normalizeImaginationState(null).cardsVersion, 1);
    assert.equal(normalizeImaginationState({ starterGranted: true }).cardsVersion, 1);
    assert.equal(normalizeImaginationState({ cardsVersion: 2 }).cardsVersion, 2);
    assert.equal(normalizeImaginationState(JSON.parse(JSON.stringify(createImaginationState()))).cardsVersion, 2);
  });

  it('the migration records High Jumper I and II for a version 1 save, once, without history', () => {
    const state = normalizeImaginationState({ starterGranted: true });
    const owned = [...STARTER_UPGRADES];
    assert.deepEqual(migrateImaginationState(state, owned), ['jump_1', 'jump_2']);
    assert.equal(state.cardsVersion, 2);
    assert.equal(state.history.length, 0);
    assert.equal(remakeMovementMultipliers(owned).jump, 1);
    assert.deepEqual(migrateImaginationState(state, owned), []);
    // A save that already had one keeps it and gets the other.
    const partial = normalizeImaginationState({});
    const some = ['jump_1'];
    assert.deepEqual(migrateImaginationState(partial, some), ['jump_2']);
  });

  it('a version 2 save keeps what it bought and nothing more', () => {
    const state = normalizeImaginationState({ starterGranted: true, cardsVersion: 2 });
    const owned = [...STARTER_UPGRADES, 'jump_1'];
    assert.deepEqual(migrateImaginationState(state, owned), []);
    assert.equal(remakeMovementMultipliers(owned).jump, 0.907);
  });

  it('the feature: an old solo save, an old online save, a new save and a new player', () => {
    // Solo save from before the shop (no slice): starters and both jump cards.
    const oldSolo = fakeEngine([]);
    imaginationFeature.restore(undefined, oldSolo);
    assert.deepEqual([...oldSolo.pc.imaginationUpgrades].sort(), [...TUTORIAL_UPGRADES]);
    // Online save of a player who left the tutorial early, from before this change (handled, version 1).
    const oldOnline = fakeEngine(['walk_speed_1'], { mode: 'multiplayer' });
    imaginationFeature.restore({ starterGranted: true }, oldOnline);
    assert.deepEqual(oldOnline.pc.imaginationUpgrades, ['walk_speed_1', 'jump_1', 'jump_2']);
    assert.equal(imaginationFeature.physics(oldOnline).jump, 1);
    assert.equal(imaginationFeature.save().cardsVersion, 2, 'the next save writes version 2');
    // A save written after this change: nothing granted, the jump it bought.
    const newSave = fakeEngine([...STARTER_UPGRADES]);
    imaginationFeature.restore({ starterGranted: true, cardsVersion: 2 }, newSave);
    assert.deepEqual(newSave.pc.imaginationUpgrades, [...STARTER_UPGRADES]);
    assert.equal(imaginationFeature.physics(newSave).jump, 0.7105);
    // A solo game started as a new player (game.js startAsNewPlayer).
    const fresh = fakeEngine([]);
    imaginationFeature.startNewPlayer(fresh);
    assert.deepEqual(fresh.pc.imaginationUpgrades, []);
    assert.equal(imaginationFeature.physics(fresh).jump, 0.7105);
  });

  it('a fresh solo game is granted the seven starters, a new online player none (init)', () => {
    const src = read('js/features/imagination-feature.js');
    assert.match(src, /if \(engine\.newPlayer\) state\.starterGranted = true;\n\s*else grantStarterUpgrades\(state, owned\(engine\)\);/);
    assert.match(src, /grantStarterUpgrades\(state, owned\(engineRef\)\);\n.*\n\s*migrateImaginationState\(state, owned\(engineRef\)\);/);
    assert.match(read('game.js'), /features\.get\('imagination'\)\?\.startNewPlayer\(engine\);/);
  });
});

describe('places laid out for the classic jump', () => {
  it('a feature-built scene or a claimed place keeps x1 for a player under it', () => {
    imaginationFeature.restore({ starterGranted: true, cardsVersion: 2 }, fakeEngine([]));
    assert.equal(imaginationFeature.physics(fakeEngine([])).jump, 0.7105, 'a street');
    assert.equal(imaginationFeature.physics(fakeEngine([], { scene: true })).jump, 1, 'a scene');
    assert.equal(imaginationFeature.physics(fakeEngine([], { instance: true })).jump, 1, 'a private instance (Winter Walk, the Annex)');
    assert.equal(imaginationFeature.physics(fakeEngine([], { claim: true })).jump, 1, 'a quest run');
    assert.equal(imaginationFeature.physics(fakeEngine(['jump_1'], { scene: true })).jump, 1);
    // Better cards still count there.
    assert.equal(imaginationFeature.physics(fakeEngine(['jump_triple_3', 'jump_3'], { scene: true })).jump, 1.05);
    // The no-upgrade streets stay plain.
    assert.equal(imaginationFeature.physics(fakeEngine([], { street: 'GHFFV931FRF3TMS' })).jump, 1);
  });

  it('why: Winter Walk\'s pillars (95 px steps) are out of a 69 px jump, in reach of the classic one', () => {
    const walk = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'public/assets/streets', `${WINTER_WALK_TSID}.json`), 'utf8'));
    const [l, r] = [1000, 1900];
    const sub = {
      ...walk,
      bounds: { ...walk.bounds, l, r },
      layers: [],
      platforms: walk.platforms.filter((p) => p.x2 > l && p.x1 < r).map((p) => ({ ...p, x1: Math.max(l, p.x1), x2: Math.min(r, p.x2) })),
    };
    const from = [{ x: l + 60, y: WINTER_WALK_START.y - 4, from: 'left' }, { x: r - 60, y: WINTER_WALK_START.y - 4, from: 'right' }];
    const pillarsReached = (jump) => {
      const res = reachStreet(sub, from, { buff: { ...NORMAL_BUFF, jump } });
      return res.surfaces.filter((x) => String(x.line).startsWith('plat_ww_pillar')).every((x) => x.reached);
    };
    assert.equal(pillarsReached(1), true);
    assert.equal(pillarsReached(0.7105), false);
  });

  it('quest runs claim it; the tutorial scenes keep their own jump', () => {
    assert.match(read('js/features/quest-instances-feature.js'), /classicJumpPlace\(\) \{\n\s*return run \? true : null;/);
    // In a training level the imagination layer is x1, so the tutorial's own jump (newxp.js tutorialPhysics) is the jump.
    assert.match(read('js/features/newxp-feature.js'), /const ph = tutorialPhysics\(save\.upgrades\);/);
  });

});

describe('skipping the tutorial in solo gives the walk and jump cards (Austin 2026-11-04)', () => {
  const src = read('js/features/newxp-feature.js');

  it('the cards are Walk Speed I and II and High Jumper I and II', () => {
    assert.deepEqual([...SKIP_TUTORIAL_CARDS], ['walk_speed_1', 'walk_speed_2', 'jump_1', 'jump_2']);
  });

  it('both ways to skip give them: Skip to Ur on the start card and the tutorial pill\'s Skip tutorial', () => {
    assert.match(src, /data-nx-skipstart\]'\)\.addEventListener\('click', \(\) => \{\n\s*save\.status = 'skipped';\n\s*grantSkipCards\(engine\);/);
    assert.match(src, /async function skipTutorial\(engine\) \{\n\s*save\.status = 'skipped';\n\s*grantSkipCards\(engine\);/);
  });

  it('online is unchanged: never in multiplayer', () => {
    assert.match(src, /function grantSkipCards\(engine\) \{\n\s*if \(engine\?\.mode === 'multiplayer'\) return;\n\s*for \(const id of SKIP_TUTORIAL_CARDS\) engine\.query\?\.\('grantTutorialUpgrade', id, engine\);/);
  });

  it('recorded as owned the way the migration records them: no iMG spent, nothing in the history; the full jump', () => {
    for (const start of [[], [...STARTER_UPGRADES]]) {
      const engine = fakeEngine(start);
      imaginationFeature.restore({ starterGranted: true, cardsVersion: 2 }, engine);
      const before = engine.pc.imagination;
      for (const id of SKIP_TUTORIAL_CARDS) imaginationFeature.grantTutorialUpgrade(id, engine);
      for (const id of SKIP_TUTORIAL_CARDS) assert.ok(engine.pc.imaginationUpgrades.includes(id), id);
      assert.equal(engine.pc.imagination, before, 'no iMG spent');
      assert.equal(imaginationFeature.save().history.length, 0, 'no purchase history');
      assert.equal(imaginationFeature.physics(engine).jump, 1);
      assert.equal(imaginationFeature.physics(engine).speed, 1);
    }
  });
});
