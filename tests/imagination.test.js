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
  filterOwnedUpgrades,
  ownedKinds,
  ownedUpgradeList,
  upgradeKind,
  UPGRADE_KINDS,
  purchaseCard,
  remakeMovementMultipliers,
  reshuffleCardCost,
  reshuffleHand,
  resurrectionCardCost,
  upgradeStatus,
} from '../public/js/imagination.js?v=1bdfd77c';
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

describe('a gold card in Firefox (report #163)', () => {
  it('the sparkle over a gold card has no blend mode, so the card can show its back', () => {
    // In Firefox a mix-blend-mode inside a face of the flipping card stops backface-visibility: the
    // front showed mirrored over the back and took the click meant for Get Upgrade. Gold cards
    // (Trade Channelling) are the only ones with the sparkle. Checked in Firefox 141 before and after.
    const css = readFileSync(join(import.meta.dirname, '..', 'public/js/features/imagination-feature.js'), 'utf8');
    const sparkle = css.match(/\.img-sparkle\{[^}]*\}/)?.[0] || '';
    assert.ok(sparkle.includes('animation:img-sparkle'));
    assert.doesNotMatch(sparkle, /mix-blend-mode/);
    assert.doesNotMatch(css, /mix-blend-mode/, 'nothing in the Upgrades window blends');
  });
});

describe('imagination hand', () => {
  it('a once-only card you already own leaves the hand (report #163)', () => {
    const state = createImaginationState();
    state.hand = [{ class_tsid: 'trade_channel', amount: 0, cost: 200 }, null, null];
    // Not owned: it stays where it was dealt.
    dealHand(state, { level: 20, owned: POST_TUTORIAL }, seeded(3));
    assert.equal(state.hand[0].class_tsid, 'trade_channel');
    // Owned: it could never be bought (purchaseCard refuses), so the slot is dealt again.
    const owned = [...POST_TUTORIAL, 'trade_channel'];
    assert.equal(purchaseCard(state, owned, { imagination: 999 }, 0, { level: 20, owned }).reason, 'You already have that upgrade.');
    dealHand(state, { level: 20, owned }, seeded(3));
    assert.ok(state.hand.every(Boolean));
    assert.ok(!state.hand.some((c) => c.class_tsid === 'trade_channel'));
  });

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
// The title had the same trouble: white with a shadow on the band the card whitens. The client
// darkens it too (ImgCardUI.as 296-297: colorize(0), alpha .5, on a white .3 band, 316-319); the
// remake darkens it and lightens the band enough for 4.5:1 on the dark grey card as well.
describe('unaffordable card price and title (ticket 75)', () => {
  const src = readFileSync(join(publicRoot, 'js/features/imagination-feature.js'), 'utf8');
  const css = resolveTokens(/const PANEL_CSS = `([\s\S]*?)`;/.exec(src)[1]);
  const declsOf = (re) => {
    const rule = re.exec(css);
    return rule ? Object.fromEntries(rule[1].split(';').map((d) => d.split(/:(.*)/s).map((x) => x.trim())).filter((d) => d[0])) : null;
  };
  const parts = {
    price: declsOf(/\.img-card\.poor \.img-front \.img-cost\{([^}]*)\}/),
    title: declsOf(/\.img-card\.poor \.img-front \.img-title\{([^}]*)\}/),
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = ([r, g, b, a], under) => [r, g, b].map((v, i) => v * a + under[i] * (1 - a));
  const contrast = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05);

  for (const [name, decls] of Object.entries(parts)) {
    it(`the ${name} is dark text with no blurred shadow, like the client`, () => {
      assert.ok(decls, `the poor ${name} rule is in PANEL_CSS`);
      assert.equal(decls['text-shadow'], 'none');
      assert.equal(decls.filter, undefined);
      assert.equal(decls.opacity, undefined);
      const text = parseColour(decls.color);
      const chip = parseColour(decls.background);
      assert.ok(text && chip, `${decls.color} / ${decls.background}`);
      assert.ok(lum(text) < 0.05 && lum(chip) > 0.8, 'dark on light');
    });

    it(`the ${name} reads at 4.5:1 or better on every card background the deck uses`, () => {
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
  }

  it('an affordable title stays light on a dark band, so the dark title still says "not affordable"', () => {
    const plain = declsOf(/\.img-front \.img-title\{([^}]*)\}/);
    assert.ok(plain);
    assert.ok(lum(parseColour(plain.color)) > 0.8, plain.color);
    assert.ok(lum(parseColour(plain.background)) < 0.05, plain.background);
    assert.ok(lum(parseColour(parts.title.color)) < 0.05);
  });
});

describe('report 135: search and a kind filter on Your upgrades', () => {
  const rows = [
    { id: 'a', name: 'Walk Speed I', desc: 'Walk a bit faster', kind: 'Moving and jumping' },
    { id: 'b', name: 'Energy Tank +60', desc: 'More to spend', kind: 'Stats and handy extras' },
    { id: 'c', name: 'Twinsies', desc: 'More energy from food', kind: 'Rewards and prices' },
  ];

  it('searches name and text, any case, every word', () => {
    assert.deepEqual(filterOwnedUpgrades(rows, { query: 'ENERGY' }).map((r) => r.id), ['b', 'c']);
    assert.deepEqual(filterOwnedUpgrades(rows, { query: 'walk faster' }).map((r) => r.id), ['a']);
    assert.deepEqual(filterOwnedUpgrades(rows, { query: '  ' }).map((r) => r.id), ['a', 'b', 'c']);
    assert.deepEqual(filterOwnedUpgrades(rows, { query: 'zzz' }), []);
  });

  it('filters by kind, with the search', () => {
    assert.deepEqual(filterOwnedUpgrades(rows, { kind: 'Rewards and prices' }).map((r) => r.id), ['c']);
    assert.deepEqual(filterOwnedUpgrades(rows, { query: 'energy', kind: 'Stats and handy extras' }).map((r) => r.id), ['b']);
    assert.deepEqual(ownedKinds(rows).map((k) => k.kind), ['Moving and jumping', 'Rewards and prices', 'Stats and handy extras']);
  });

  it('is the Encyclopedia\'s one grouping', () => {
    assert.equal(upgradeKind({ config: { suit: 'clock' } }), UPGRADE_KINDS.clock);
    assert.equal(upgradeKind({ config: { pattern: 'skill' } }), UPGRADE_KINDS.skill);
    assert.equal(upgradeKind({ config: {} }), UPGRADE_KINDS.upgrade);
    const tool = readFileSync(join(publicRoot, '../tools/encyclopedia/imagination.mjs'), 'utf8');
    assert.match(tool, /const groupOf = upgradeKind;/);
    assert.doesNotMatch(tool, /GROUP_OF/);
  });

  it('the search box keeps its keys: X is a letter, Esc still closes, an open kind list takes its own Esc', () => {
    const src = readFileSync(join(publicRoot, 'js/features/imagination-feature.js'), 'utf8');
    assert.match(src, /closest\?\.\('\.img-owned-bar'\) && \(e\.key !== 'Escape' \|\| e\.target\.getAttribute\('aria-expanded'\) === 'true'\)\) return;/);
    assert.match(src, /e\.key === 'Escape' \|\| \(!typing && \(e\.key === 'x' \|\| e\.key === 'X'\)\)/);
    assert.match(src, /'No upgrades match that\.'/);
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    assert.match(game, /e\.target\?\.matches\?\.\('input, textarea, select, \[contenteditable="true"\]'\)/);
  });
});
