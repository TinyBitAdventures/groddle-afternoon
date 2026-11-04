import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BRAIN_CAPACITY_LIMIT,
  CARD_ART_LAYERS,
  HAND_SIZE,
  IMAGINATION_UPGRADES,
  STARTER_UPGRADES,
  TUTORIAL_UPGRADES,
  JUMP_CARDS,
  TUTORIAL_CARDS_DEALT,
  IMAGINATION_SAVE_VERSION,
  migrateImaginationState,
  buildDeck,
  canFreeReshuffle,
  cardText,
  createImaginationState,
  dealHand,
  grantStarterUpgrades,
  grantUpgrade,
  imaginationPhysics,
  learnTimeReductions,
  normalizeImaginationState,
  optionTier,
  ownedUpgradeList,
  purchaseCard,
  remakeMovementMultipliers,
  reshuffleCardCost,
  reshuffleHand,
  resurrectionCardCost,
  upgradeStatus,
} from '../public/js/imagination.js?v=0cab36eb';
import { resolveTokens } from './css-tokens.js';
import { parseColour } from '../tools/tokens/colour.mjs';

const publicRoot = join(import.meta.dirname, '..', 'public');

/** Deterministic LCG so deals are reproducible. */
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** What a source player owned once out of the tutorial: all nine tutorial cards. */
const POST_TUTORIAL = [...TUTORIAL_UPGRADES];

describe('imagination catalog', () => {
  it('imports all 275 source cards with their art config', () => {
    assert.equal(Object.keys(IMAGINATION_UPGRADES).length, 275);
    const tank = IMAGINATION_UPGRADES.energy_tank;
    assert.equal(tank.name, 'Energy Tank +{amount}');
    assert.equal(tank.options['1000'].cost_per, 160);
    assert.deepEqual(IMAGINATION_UPGRADES.jump_triple_1.conditions, [{ type: 3, imagination_id: 'mappery' }]);
    assert.equal(IMAGINATION_UPGRADES.food_variety_bonus.chance, 100);
  });

  it('ships every card art layer the catalog references on the 230x310 frame', () => {
    for (const u of Object.values(IMAGINATION_UPGRADES)) {
      for (const field of ['bg', 'pattern', 'suit', 'art', 'icon']) {
        if (!u.config[field]) continue;
        const layer = `${field}_${u.config[field]}`;
        assert.ok(CARD_ART_LAYERS.includes(layer), layer);
        assert.ok(existsSync(join(publicRoot, 'assets/imagination/cards', `${layer}.svg`)), layer);
      }
    }
    assert.ok(CARD_ART_LAYERS.includes('bg_back'));
  });

  it('names the nine tutorial cards, and the seven starters (not High Jumper I or II)', () => {
    assert.deepEqual(TUTORIAL_UPGRADES, [
      'camera_mode', 'encyclopeddling', 'jump_1', 'jump_2', 'mappery',
      'skill_learning', 'walk_speed_1', 'walk_speed_2', 'zoomability',
    ]);
    assert.deepEqual(STARTER_UPGRADES, [
      'camera_mode', 'encyclopeddling', 'mappery',
      'skill_learning', 'walk_speed_1', 'walk_speed_2', 'zoomability',
    ]);
    assert.deepEqual(JUMP_CARDS, ['jump_1', 'jump_2']);
  });
});

describe('imagination eligibility', () => {
  it('checks level, upgrade, skill, badge, quest and energy conditions', () => {
    assert.equal(upgradeStatus('jump_triple_1', { owned: [] }).can_learn, false);
    assert.equal(upgradeStatus('jump_triple_1', { owned: ['mappery'] }).can_learn, true);
    assert.equal(upgradeStatus('jump_triple_2', { owned: ['jump_triple_1'], level: 9 }).can_learn, false);
    assert.equal(upgradeStatus('jump_triple_2', { owned: ['jump_triple_1'], level: 10 }).can_learn, true);
    assert.equal(upgradeStatus('mining_drop_1', { learned: ['mining_1'] }).can_learn, true);
    assert.equal(upgradeStatus('brain_capacity', { achievements: ['first_eleven_skills'] }).can_learn, true);
    assert.equal(upgradeStatus('icon_bestow_chance_2', { owned: ['icon_bestow_chance_1'], questsDone: [] }).can_learn, false);
    assert.equal(upgradeStatus('periodic_mood_loss_reduced_1', { maxEnergy: 599 }).can_learn, false);
    assert.equal(upgradeStatus('periodic_mood_loss_reduced_1', { maxEnergy: 600 }).can_learn, true);
  });

  it('keeps tutorial and secret cards out of the deck and owned cards out once', () => {
    assert.equal(upgradeStatus('walk_speed_1', {}).can_learn, false);
    assert.equal(upgradeStatus('jump_wall', { owned: ['jump_triple_2'] }).can_learn, false);
    assert.equal(upgradeStatus('mappery', { owned: ['mappery'], inTutorial: true }).can_learn, false);
    assert.equal(upgradeStatus('energy_tank', { owned: ['energy_tank'] }).can_learn, true);
  });
});

describe('imagination deck', () => {
  it('puts each eligible card in `chance` times', () => {
    const deck = buildDeck({ level: 3, owned: POST_TUTORIAL, maxEnergy: 100, quoinMultiplier: 1 });
    const count = (id) => deck.filter((c) => c.class_tsid === id).length;
    assert.equal(count('food_variety_bonus'), 100);
    assert.equal(count('jump_triple_1'), 10);
    assert.equal(count('trade_channel'), 255);
    assert.equal(count('walk_speed_1'), 0);
  });

  it('prices option tiers like imagination_get_deck', () => {
    assert.equal(optionTier(IMAGINATION_UPGRADES.energy_tank.options, 100).key, '100');
    assert.equal(optionTier(IMAGINATION_UPGRADES.energy_tank.options, 129).key, '100');
    assert.equal(optionTier(IMAGINATION_UPGRADES.energy_tank.options, 130).key, '130');
    assert.equal(optionTier(IMAGINATION_UPGRADES.energy_tank.options, 50).key, '100');
    const tanks = buildDeck({ maxEnergy: 100 }).filter((c) => c.class_tsid === 'energy_tank');
    assert.equal(tanks.length, 20);
    assert.deepEqual([...new Set(tanks.map((c) => `${c.amount}:${c.cost}`))], ['10:200', '20:400']);
    const brain = buildDeck({ achievements: ['first_eleven_skills'], brainCapacity: 20 })
      .filter((c) => c.class_tsid === 'brain_capacity');
    assert.deepEqual([...new Set(brain.map((c) => `${c.amount}:${c.cost}`))], ['1:400', '3:1140']);
    const quoin = buildDeck({ quoinMultiplier: 1 }).filter((c) => c.class_tsid === 'quoin_multiplier');
    assert.deepEqual([...new Set(quoin.map((c) => `${c.amount}:${c.cost}`))], ['0.25:50', '0.5:100']);
    assert.equal(buildDeck({ achievements: ['first_eleven_skills'], brainCapacity: BRAIN_CAPACITY_LIMIT })
      .some((c) => c.class_tsid === 'brain_capacity'), false);
  });

  it('prices keepable cards from level and energy', () => {
    assert.equal(reshuffleCardCost(5), 25);
    assert.equal(reshuffleCardCost(16), 110);
    assert.equal(reshuffleCardCost(99), 500);
    assert.equal(resurrectionCardCost(100), 20);
    assert.equal(resurrectionCardCost(800), 80);
    const deck = buildDeck({ level: 12, owned: POST_TUTORIAL });
    assert.equal(deck.find((c) => c.class_tsid === 'keepable_reshuffle').cost, 70);
  });
});

describe('imagination hand', () => {
  it('deals three cards without repeating a single-use card', () => {
    const state = createImaginationState();
    dealHand(state, { level: 20, owned: POST_TUTORIAL }, seeded(7));
    assert.equal(state.hand.length, HAND_SIZE);
    assert.ok(state.hand.every(Boolean));
    for (const card of state.hand) {
      if (IMAGINATION_UPGRADES[card.class_tsid].max_uses) {
        assert.equal(state.hand.filter((c) => c.class_tsid === card.class_tsid).length, 1);
      }
    }
  });

  it('buys a card, spends iMG only, and refills the slot', () => {
    const state = createImaginationState();
    state.hand = [{ class_tsid: 'jump_triple_1', amount: 0, cost: 100 }, null, null];
    const owned = [...POST_TUTORIAL];
    const wallet = { imagination: 150 };
    const result = purchaseCard(state, owned, wallet, 0, { level: 4, owned }, { rng: seeded(3), now: 1000 });
    assert.equal(result.ok, true);
    assert.equal(wallet.imagination, 50);
    assert.ok(owned.includes('jump_triple_1'));
    assert.ok(state.hand.every(Boolean));
    assert.ok(!state.hand.some((c) => c.class_tsid === 'jump_triple_1'));
    assert.deepEqual(state.history.at(-1), { class_tsid: 'jump_triple_1', cost: 100, amount: 0, when: 1000 });
  });

  it('refuses unaffordable and missing cards', () => {
    const state = createImaginationState();
    state.hand = [{ class_tsid: 'jump_triple_1', amount: 0, cost: 100 }, null, null];
    const wallet = { imagination: 99 };
    assert.equal(purchaseCard(state, [], wallet, 0).reason, 'Not enough imagination!');
    assert.equal(purchaseCard(state, [], wallet, 1).ok, false);
    assert.equal(wallet.imagination, 99);
  });

  it('adds option amounts to their stats and keeps them buyable', () => {
    const state = createImaginationState();
    const owned = [];
    const tank = grantUpgrade(state, owned, 'energy_tank', { amount: 20, cost: 400 });
    assert.equal(tank.energyTank, 20);
    assert.equal(state.energyTankBonus, 20);
    grantUpgrade(state, owned, 'brain_capacity', { amount: 3, cost: 1140 });
    assert.equal(state.brainCapacity, 23);
    assert.equal(grantUpgrade(state, owned, 'quoin_multiplier', { amount: 0.5 }).quoinMultiplier, 0.5);
    assert.equal(grantUpgrade(state, owned, 'energy_tank', { amount: 10 }).energyTank, 10);
    assert.equal(state.counts.energy_tank, 2);
    const list = ownedUpgradeList(state, owned);
    assert.equal(list.find((r) => r.id === 'energy_tank').name, 'Energy Tank +30');
  });

  it('allows one free re-deal per game day', () => {
    const state = createImaginationState();
    const ctx = { level: 10, owned: POST_TUTORIAL };
    dealHand(state, ctx, seeded(1));
    assert.equal(canFreeReshuffle(state, '2026-1'), true);
    assert.equal(reshuffleHand(state, ctx, { dayKey: '2026-1', rng: seeded(2) }).ok, true);
    assert.equal(reshuffleHand(state, ctx, { dayKey: '2026-1', rng: seeded(3) }).ok, false);
    assert.equal(reshuffleHand(state, ctx, { dayKey: '2026-1', free: false, rng: seeded(4) }).ok, true);
    assert.equal(reshuffleHand(state, ctx, { dayKey: '2026-2', rng: seeded(5) }).ok, true);
    assert.equal(state.shuffles, 3);
  });

  it('describes option cards with the source post script', () => {
    const text = cardText({ class_tsid: 'quoin_multiplier', amount: 0.25, cost: 50 }, { quoinMultiplier: 1 });
    assert.equal(text.name, 'Add 0.25 To Your Quoin Multiplier');
    assert.match(text.desc, /Your current Quoin Multiplier is 1\.00\. Buying this will make it 1\.25$/);
    const tank = cardText({ class_tsid: 'energy_tank', amount: 20, cost: 400 }, { maxEnergy: 100 });
    assert.equal(tank.name, 'Energy Tank +20');
    assert.match(tank.desc, /make it 120$/);
    assert.equal(cardText({ class_tsid: 'keepable_reshuffle', cost: 25 }).keepable, true);
  });

  it('normalizes saves and drops unknown cards', () => {
    const state = normalizeImaginationState({
      hand: [{ class_tsid: 'nope', cost: 3 }, { class_tsid: 'mappery', cost: '20' }],
      brainCapacity: 999,
      counts: { mappery: 1, bogus: 4 },
      starterGranted: true,
    });
    assert.deepEqual(state.hand, [null, { class_tsid: 'mappery', amount: 0, cost: 20 }, null]);
    assert.equal(state.brainCapacity, BRAIN_CAPACITY_LIMIT);
    assert.deepEqual(state.counts, { mappery: 1 });
    assert.equal(state.starterGranted, true);
  });
});

describe('imagination starters and physics', () => {
  it('grants the tutorial cards once', () => {
    const state = createImaginationState();
    const owned = ['jump_triple_1'];
    assert.equal(grantStarterUpgrades(state, owned).length, 7);
    assert.equal(grantStarterUpgrades(state, owned).length, 0);
    assert.equal(owned.length, 8);
    assert.equal(owned.includes('jump_1') || owned.includes('jump_2'), false);
    assert.equal(state.history.length, 0);
  });

  it('stacks walk and jump physics from the best owned tier', () => {
    assert.deepEqual(
      [imaginationPhysics([]).vx_max, imaginationPhysics([]).vy_jump],
      [0.4597, 0.7105]
    );
    const post = imaginationPhysics(POST_TUTORIAL);
    assert.equal(post.vx_max, 0.8268);
    assert.equal(post.vy_jump, 1);
    assert.equal(imaginationPhysics([...POST_TUTORIAL, 'walk_speed_4', 'walk_speed_3']).vx_max, 1.06);
    assert.equal(imaginationPhysics(['jump_triple_2']).multiplier_3_jump, 0.82);
  });

  it('scales remake movement relative to the post-tutorial baseline', () => {
    assert.deepEqual(remakeMovementMultipliers(POST_TUTORIAL), { speed: 1, jump: 1, gravity: 1 });
    // The jump follows the High Jumper cards (inc_physics.js 97-106, inc_data_imagination.js 3240-3337);
    // the walk never drops below Walk Speed II's pace.
    assert.deepEqual(remakeMovementMultipliers([]), { speed: 1, jump: 0.7105, gravity: 1 });
    assert.deepEqual(remakeMovementMultipliers(STARTER_UPGRADES), { speed: 1, jump: 0.7105, gravity: 1 });
    assert.equal(remakeMovementMultipliers([...STARTER_UPGRADES, 'jump_1']).jump, 0.907);
    assert.equal(remakeMovementMultipliers([...STARTER_UPGRADES, 'jump_1', 'jump_2']).jump, 1);
    assert.equal(remakeMovementMultipliers(['jump_2']).jump, 1);
    assert.equal(remakeMovementMultipliers([...STARTER_UPGRADES, 'jump_triple_3', 'jump_3']).jump, 1.05);
    const fast = remakeMovementMultipliers([...POST_TUTORIAL, 'walk_speed_3', 'jump_3']);
    assert.ok(Math.abs(fast.speed - 1 / 0.8268) < 1e-9);
    assert.equal(fast.jump, 1.05);
  });

  it('collects learning-speed reductions by category', () => {
    assert.deepEqual(learnTimeReductions(['learntime_alchemy_1', 'learntime_alchemy_3', 'learntime_animal_2']), { 6: 10, 14: 5 });
  });
});

// Ticket 75 (Friendly, Safari): the price on a card you cannot afford was pale pink (--c-red-90) with a
// dark 1.5 px blurred shadow, about 1-2.5:1 on the gold, green, yellow and blue cards, so it read as a
// smudge. The client darkens it instead (ImgCardUI.as 300-310: colorize(0), alpha .5, no drop shadow);
// the remake keeps that dark, unshadowed price and sets it on a light chip so it stays readable on
// the dark grey and red cards too, where black at half alpha would vanish.
describe('unaffordable card price (ticket 75)', () => {
  const src = readFileSync(join(publicRoot, 'js/features/imagination-feature.js'), 'utf8');
  const css = resolveTokens(/const PANEL_CSS = `([\s\S]*?)`;/.exec(src)[1]);
  const rule = /\.img-card\.poor \.img-front \.img-cost\{([^}]*)\}/.exec(css);
  const decls = Object.fromEntries((rule?.[1] || '').split(';').map((d) => d.split(/:(.*)/s).map((x) => x.trim())).filter((d) => d[0]));
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = ([r, g, b, a], under) => [r, g, b].map((v, i) => v * a + under[i] * (1 - a));
  const contrast = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05);

  it('is dark text with no blurred shadow, like the client', () => {
    assert.ok(rule, 'the poor price rule is in PANEL_CSS');
    assert.equal(decls['text-shadow'], 'none');
    assert.equal(decls.filter, undefined);
    assert.equal(decls.opacity, undefined);
    const text = parseColour(decls.color);
    const chip = parseColour(decls.background);
    assert.ok(text && chip, `${decls.color} / ${decls.background}`);
    assert.ok(lum(text) < 0.05 && lum(chip) > 0.8, 'dark on light');
  });

  it('reads at 4.5:1 or better on every card background the deck uses', () => {
    const text = parseColour(decls.color);
    const chip = parseColour(decls.background);
    const dir = join(publicRoot, 'assets/imagination/cards');
    const bgs = readdirSync(dir).filter((f) => /^bg_(?!back)\w+\.svg$/.test(f));
    assert.ok(bgs.length >= 10, bgs.join(' '));
    for (const f of bgs) {
      for (const [hex] of readFileSync(join(dir, f), 'utf8').matchAll(/#[0-9a-f]{6}\b/gi)) {
        const card = parseColour(hex);
        const under = over(chip, card);
        const ratio = contrast(over(text, under), under);
        assert.ok(ratio >= 4.5, `${f} ${hex}: ${ratio.toFixed(2)}`);
      }
    }
  });
});
