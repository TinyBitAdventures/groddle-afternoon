/**
 * Official Piggy/Chicken Animal Kinship packages and live verb integration.
 * Run: node --test tests/animal-kinship.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANIMAL_KINSHIP_PACKAGES,
  highestAnimalKinshipRank,
  resolveAnimalKinshipPackage,
  ensureAnimalKinshipState,
  quoteAnimalKinship,
  performAnimalKinship,
  resetAnimalKinshipDay,
} from '../public/js/animal-kinship.js?v=g403-1';
import { createAnimalState, animalStatusLabel } from '../public/js/animals.js?v=g403-1';
import { getVerbsFor, runVerb } from '../public/content.js?v=g403-1';
import { createToolConditionState, getToolCondition, setToolRemaining } from '../public/js/tools.js?v=woodcutting-test-8';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../public');

function pc(seed = {}) {
  return { energy: 100, mood: 40, imagination: 0, xp: 0, ...seed };
}

describe('official Animal Kinship package tables', () => {
  it('ports all eight no-skill/rank profiles for each video-facing action', () => {
    assert.deepEqual(Object.keys(ANIMAL_KINSHIP_PACKAGES).sort(), [
      'npc_butterfly:massage',
      'npc_butterfly:milk',
      'npc_chicken:squeeze',
      'npc_piggy:nibble',
      'npc_piggy:pet',
    ]);
    for (const table of Object.values(ANIMAL_KINSHIP_PACKAGES)) assert.equal(table.length, 8);

    assert.deepEqual(
      ANIMAL_KINSHIP_PACKAGES['npc_butterfly:massage'].map((row) => [
        row.intervalLimit, row.durationMs, row.energyCost, row.moodBonus, row.xpBonus,
        row.bonusAmount, row.bonusMultiplier, row.bonusChance, row.toolWear,
      ]),
      [
        [1, 3000, 10, 1, 1, 1, 0, 0, 1],
        [1, 1000, 10, 1, 2, 1, 0, 0, 1],
        [1, 1000, 5, 2, 2, 1, 0, 0, 1],
        [1, 1000, 5, 2, 2, 1, 0, 0, 1],
        [2, 1000, 5, 2, 5, 1, 5, 0.20, 1],
        [2, 1000, 5, 2, 5, 0, 5, 0.20, 0],
        [2, 1000, 5, 5, 10, 0, 5, 0.30, 0],
        [2, 1000, 5, 5, 10, 0, 5, 0.30, 0],
      ]
    );
    assert.deepEqual(
      ANIMAL_KINSHIP_PACKAGES['npc_butterfly:milk'].map((row) => [
        row.intervalLimit, row.durationMs, row.energyCost, row.moodBonus, row.xpBonus,
        row.bonusAmount, row.bonusMultiplier, row.bonusChance,
      ]),
      [
        [1, 5000, 10, 1, 1, 1, 0, 0],
        [1, 3000, 5, 1, 1, 1, 0, 0],
        [1, 3000, 5, 1, 1, 2, 0, 0],
        [1, 2000, 5, 1, 2, 2, 2, 0.08],
        [1, 0, 5, 1, 2, 3, 2, 0.09],
        [1, 0, 5, 2, 2, 3, 3, 0.10],
        [2, 0, 5, 2, 5, 4, 3, 0.12],
        [2, 0, 5, 5, 10, 5, 3, 0.15],
      ]
    );

    assert.deepEqual(
      ANIMAL_KINSHIP_PACKAGES['npc_piggy:pet'].map((row) => [
        row.intervalLimit, row.durationMs, row.successRate, row.energyCost, row.moodBonus, row.xpBonus,
      ]),
      [
        [1, 4000, 90, 4, 1, 0],
        [1, 3000, 100, 4, 1, 1],
        [1, 2000, 100, 4, 1, 1],
        [1, 0, 100, 2, 2, 2],
        [2, 0, 100, 2, 2, 2],
        [2, 0, 100, 2, 2, 5],
        [2, 0, 100, 2, 4, 10],
        [2, 0, 100, 2, 4, 10],
      ]
    );
    assert.deepEqual(
      ANIMAL_KINSHIP_PACKAGES['npc_piggy:nibble'].map((row) => [
        row.intervalLimit, row.durationMs, row.energyCost, row.xpBonus, row.bonusAmount,
        row.bonusMultiplier, row.bonusChance,
      ]),
      [
        [1, 5000, 5, 0, 1, 0, 0],
        [1, 4000, 2, 0, 1, 0, 0],
        [1, 3000, 2, 1, 2, 0, 0],
        [1, 2000, 2, 2, 2, 2, 0.06],
        [1, 2000, 2, 2, 3, 2, 0.06],
        [1, 0, 2, 5, 3, 2, 0.09],
        [2, 0, 2, 5, 3, 3, 0.10],
        [2, 0, 2, 10, 4, 3, 0.12],
      ]
    );
    assert.deepEqual(
      ANIMAL_KINSHIP_PACKAGES['npc_chicken:squeeze'].map((row) => [
        row.intervalLimit, row.durationMs, row.successRate, row.energyCost, row.bonusAmount,
      ]),
      [
        [1, 3000, 60, 1, 1],
        [2, 2000, 100, 1, 1],
        [3, 2000, 100, 1, 1],
        [3, 0, 100, 2, 2],
        [4, 0, 100, 2, 3],
        [4, 0, 100, 2, 4],
        [5, 0, 100, 2, 4],
        [5, 0, 100, 2, 5],
      ]
    );
  });

  it('selects the highest learned rank, including non-contiguous repaired saves', () => {
    assert.equal(highestAnimalKinshipRank([]), 0);
    assert.equal(highestAnimalKinshipRank(['animalkinship_1', 'animalkinship_4']), 4);
    assert.equal(resolveAnimalKinshipPackage('npc_piggy', 'pet', ['animalkinship_4']).rank, 4);
    assert.equal(resolveAnimalKinshipPackage('npc_piggy', 'dance', []), null);
  });
});

describe('atomic package execution and daily limits', () => {
  it('a no-skill miss spends nothing and leaves the daily use open', () => {
    const state = createAnimalState('npc_piggy');
    const player = pc();
    const inv = {};
    const result = performAnimalKinship(state, 'npc_piggy', 'pet', {
      pc: player,
      inv,
      learned: [],
      rng: () => 0.95,
    });
    assert.equal(result.ok, false);
    assert.equal(result.attempted, true);
    assert.equal(result.reason, 'success_rate');
    assert.equal(player.energy, 100);
    assert.equal(player.mood, 40);
    assert.equal(state.petUsesToday, 0);
    assert.equal(quoteAnimalKinship(state, 'npc_piggy', 'pet', { pc: player, learned: [] }).ok, true);
  });

  it('rank 4 permits two instant Piggy pets with exact costs/rewards', () => {
    const state = createAnimalState('npc_piggy');
    const player = pc();
    const ctx = { pc: player, inv: {}, learned: ['animalkinship_4'], rng: () => 0.5 };
    const quote = quoteAnimalKinship(state, 'npc_piggy', 'pet', ctx);
    assert.equal(quote.profile.durationMs, 0);
    assert.equal(quote.profile.intervalLimit, 2);
    assert.equal(performAnimalKinship(state, 'npc_piggy', 'pet', ctx).ok, true);
    assert.equal(performAnimalKinship(state, 'npc_piggy', 'pet', ctx).ok, true);
    assert.equal(player.energy, 96);
    assert.equal(player.mood, 44);
    assert.equal(player.xp, 4);
    assert.equal(state.petUsesToday, 2);
    assert.equal(quoteAnimalKinship(state, 'npc_piggy', 'pet', ctx).reason, 'daily_limit');
  });

  it('rank 6 bypasses pet-before-nibble and can trigger the official super harvest', () => {
    const state = createAnimalState('npc_piggy');
    const player = pc();
    const inv = {};
    const result = performAnimalKinship(state, 'npc_piggy', 'nibble', {
      pc: player,
      inv,
      learned: ['animalkinship_6'],
      rng: () => 0.05,
    });
    assert.equal(result.ok, true);
    assert.equal(result.superHarvest, true);
    assert.equal(result.itemCount, 9);
    assert.equal(inv.meat, 9);
    assert.equal(player.energy, 98);
    assert.equal(player.mood, 42);
    // 5 iMG at 42% mood: the mood bonus is x0.75 (G148).
    assert.equal(player.xp, 4);
    assert.equal(state.nibbleUsesToday, 1);
  });

  it('rank 7 allows five Chicken squeezes, then resets cleanly next game day', () => {
    const state = createAnimalState('npc_chicken');
    const player = pc();
    const inv = {};
    const ctx = { pc: player, inv, learned: ['animalkinship_7'], rng: () => 0.5 };
    for (let i = 0; i < 5; i += 1) assert.equal(performAnimalKinship(state, 'npc_chicken', 'squeeze', ctx).ok, true);
    assert.equal(inv.grain, 25);
    assert.equal(state.squeezeUsesToday, 5);
    assert.equal(quoteAnimalKinship(state, 'npc_chicken', 'squeeze', ctx).reason, 'daily_limit');
    assert.match(animalStatusLabel('npc_chicken', state), /5× today/);
    resetAnimalKinshipDay('npc_chicken', state);
    assert.equal(state.squeezeUsesToday, 0);
    assert.equal(quoteAnimalKinship(state, 'npc_chicken', 'squeeze', ctx).ok, true);
  });

  it('uses one point from the official five-use Lotion tube for a no-skill massage', () => {
    const state = createAnimalState('npc_butterfly');
    const player = pc();
    const inv = { butterfly_lotion: 2 };
    const tools = createToolConditionState();
    const ctx = { pc: player, inv, tools, learned: [], rng: () => 0.5 };
    const quote = quoteAnimalKinship(state, 'npc_butterfly', 'massage', ctx);
    assert.equal(quote.ok, true);
    assert.equal(quote.profile.durationMs, 3000);
    const result = performAnimalKinship(state, 'npc_butterfly', 'massage', ctx);
    assert.equal(result.ok, true);
    assert.equal(player.energy, 90);
    assert.equal(player.mood, 41);
    assert.equal(player.xp, 1);
    assert.equal(inv.butterfly_lotion, 2);
    assert.equal(getToolCondition(tools, 'butterfly_lotion').remaining, 4);
    assert.equal(state.massageUsesToday, 1);
    assert.equal(quoteAnimalKinship(state, 'npc_butterfly', 'massage', ctx).reason, 'daily_limit');
  });

  it('depletes a Lotion tube atomically and loads the next five-use tube', () => {
    const state = createAnimalState('npc_butterfly');
    const player = pc();
    const inv = { butterfly_lotion: 2 };
    const tools = createToolConditionState();
    setToolRemaining(tools, 'butterfly_lotion', 1);
    const result = performAnimalKinship(state, 'npc_butterfly', 'massage', {
      pc: player,
      inv,
      tools,
      learned: ['animalkinship_4'],
      rng: () => 0.5,
    });
    assert.equal(result.ok, true);
    assert.equal(result.toolUse.broke, true);
    assert.equal(result.toolUse.replacementLoaded, true);
    assert.equal(inv.butterfly_lotion, 1);
    assert.equal(result.effects.items.butterfly_lotion, -1);
    assert.equal(getToolCondition(tools, 'butterfly_lotion').remaining, 5);
  });

  it('rank 5 massages without Lotion and rank 6 milks without a warmup', () => {
    const rank5State = createAnimalState('npc_butterfly');
    const rank5 = { pc: pc(), inv: { butterfly_lotion: 0 }, tools: createToolConditionState(), learned: ['animalkinship_5'], rng: () => 0.5 };
    assert.equal(quoteAnimalKinship(rank5State, 'npc_butterfly', 'massage', rank5).ok, true);
    assert.equal(performAnimalKinship(rank5State, 'npc_butterfly', 'massage', rank5).ok, true);
    assert.equal(rank5.inv.butterfly_lotion, 0);

    const rank6State = createAnimalState('npc_butterfly');
    const rank6 = { pc: pc(), inv: {}, tools: createToolConditionState(), learned: ['animalkinship_6'], rng: () => 0.5 };
    assert.equal(quoteAnimalKinship(rank6State, 'npc_butterfly', 'milk', rank6).ok, true);
    assert.equal(performAnimalKinship(rank6State, 'npc_butterfly', 'milk', rank6).itemCount, 4);
    assert.equal(performAnimalKinship(rank6State, 'npc_butterfly', 'milk', rank6).itemCount, 4);
    assert.equal(rank6.inv.milk_butterfly, 8);
    assert.equal(quoteAnimalKinship(rank6State, 'npc_butterfly', 'milk', rank6).reason, 'daily_limit');
  });

  it('rank 7 produces the official fifteen-Milk super harvest', () => {
    const state = createAnimalState('npc_butterfly');
    const player = pc();
    const inv = {};
    const result = performAnimalKinship(state, 'npc_butterfly', 'milk', {
      pc: player,
      inv,
      tools: createToolConditionState(),
      learned: ['animalkinship_7'],
      rng: () => 0.1,
    });
    assert.equal(result.ok, true);
    assert.equal(result.superHarvest, true);
    assert.equal(result.itemCount, 15);
    assert.equal(inv.milk_butterfly, 15);
    assert.equal(player.energy, 95);
    assert.equal(player.mood, 45);
    // 10 iMG at 45% mood: x0.75 (G148).
    assert.equal(player.xp, 8);
  });

  it('migrates old boolean/count saves without losing care history', () => {
    const pig = ensureAnimalKinshipState('npc_piggy', { petted: true, nibbled: true });
    assert.equal(pig.petUsesToday, 1);
    assert.equal(pig.nibbleUsesToday, 1);
    const chicken = ensureAnimalKinshipState('npc_chicken', { squeezedToday: 2 });
    assert.equal(chicken.squeezeUsesToday, 2);
    const butterfly = ensureAnimalKinshipState('npc_butterfly', { massaged: true, milked: true });
    assert.equal(butterfly.massageUsesToday, 1);
    assert.equal(butterfly.milkUsesToday, 1);
  });
});

describe('verb and live-client integration', () => {
  it('previews exact rank timing, then yields the exact rank-2 Meat amount', () => {
    const target = { classId: 'npc_piggy', state: {} };
    const player = pc();
    const inv = {};
    const skills = { learned: ['animalkinship_2'] };
    let verbs = getVerbsFor(target, { pc: player, inv, skills });
    assert.equal(verbs.find((row) => row.id === 'pet').durationMs, 2000);
    assert.equal(verbs.find((row) => row.id === 'nibble').enabled, false);
    assert.match(verbs.find((row) => row.id === 'nibble').reason, /love first/i);

    assert.equal(runVerb(target, 'pet', { pc: player, inv, skills, rng: () => 0.5 }).ok, true);
    verbs = getVerbsFor(target, { pc: player, inv, skills });
    assert.equal(verbs.find((row) => row.id === 'nibble').durationMs, 3000);
    const nibble = runVerb(target, 'nibble', { pc: player, inv, skills, rng: () => 0.5 });
    assert.equal(nibble.ok, true);
    assert.equal(nibble.animalKinship.itemCount, 2);
    assert.equal(inv.meat, 2);
    assert.match(nibble.effects.activityLine, /\+2 Meat/);
  });

  it('previews Butterfly rank gates and commits exact massage then milk rewards', () => {
    const target = { classId: 'npc_butterfly', state: createAnimalState('npc_butterfly') };
    const player = pc();
    const inv = { butterfly_lotion: 1 };
    const tools = createToolConditionState();
    const skills = { learned: ['animalkinship_2'] };
    let verbs = getVerbsFor(target, { pc: player, inv, tools, skills });
    assert.equal(verbs.find((row) => row.id === 'milk').enabled, false);
    assert.equal(verbs.find((row) => row.id === 'massage').durationMs, 1000);
    assert.match(verbs.find((row) => row.id === 'massage').tooltip, /1\/5/);

    const massage = runVerb(target, 'massage', { pc: player, inv, tools, skills, rng: () => 0.5 });
    assert.equal(massage.ok, true);
    assert.equal(massage.animalKinship.rank, 2);
    assert.equal(getToolCondition(tools, 'butterfly_lotion').remaining, 4);
    verbs = getVerbsFor(target, { pc: player, inv, tools, skills });
    assert.equal(verbs.find((row) => row.id === 'milk').enabled, true);
    assert.equal(verbs.find((row) => row.id === 'milk').durationMs, 3000);
    const milk = runVerb(target, 'milk', { pc: player, inv, tools, skills, rng: () => 0.5 });
    assert.equal(milk.ok, true);
    assert.equal(milk.animalKinship.itemCount, 2);
    assert.equal(inv.milk_butterfly, 2);
    assert.match(milk.effects.activityLine, /\+2 Butterfly Milk/);
  });

  it('ships deterministic rank/failure QA, result attributes, and fresh cache wiring', () => {
    const game = readFileSync(join(publicDir, 'game.js'), 'utf8');
    const content = readFileSync(join(publicDir, 'content.js'), 'utf8');
    const html = readFileSync(join(publicDir, 'play/index.html'), 'utf8');
    assert.match(game, /bootParams\.has\('animaldemo'\)/);
    assert.match(game, /bootParams\.get\('animalrank'\)/);
    assert.match(game, /bootParams\.get\('animalroll'\)|get\('animalroll'\)/);
    assert.match(game, /dataset\.animalKinshipResult/);
    assert.match(game, /dataset\.animalKinshipYield/);
    assert.match(game, /recentInteractionTarget = target/);
    assert.match(game, /recentInteractionUntil = Date\.now\(\) \+ 6000/);
    assert.match(game, /dataset\.recentInteractionTarget/);
    assert.match(game, /spr\.playPet\(durationMs\)/);
    assert.match(game, /actionFrames\.length \/ \(60 \* \(durationMs \/ 1000\)\)/);
    assert.match(game, /playButterflyCareAnimation/);
    assert.match(game, /dataset\.butterflyLotionRemaining/);
    assert.match(game, /dataset\.butterflyCareAnimation/);
    assert.match(content, /quoteAnimalKinship/);
    assert.match(content, /performAnimalKinship/);
    assert.match(html, /game\.js\?v=official-ecology-1/);
  });
});
