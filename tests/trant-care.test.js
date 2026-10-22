import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  TRANT_CARE_PACKAGES,
  highestLightGreenThumbRank,
  resolveTrantCarePackage,
  quoteTrantCare,
  performTrantCare,
} from '../public/js/trant-care.js?v=trant-care-test-1';
import {
  createTrantState,
  livingTrantPlanForStreet,
  LIVING_TRANT_CLASS_IDS,
  setTrantTables,
  trantStatusLabel,
} from '../public/js/trants.js?v=trant-care-2';
import {
  createToolConditionState,
  getToolCondition,
  setToolRemaining,
} from '../public/js/tools.js?v=trant-care-test-1';
import { getVerbsFor, runVerb } from '../public/content.js?v=trant-care-test-1';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
setTrantTables(JSON.parse(fs.readFileSync(path.join(publicDir, 'assets/content/trants.json'), 'utf8')));

function context(overrides = {}) {
  return {
    inv: { watering_can: 1 },
    pc: { energy: 100, mood: 50, imagination: 0, xp: 0 },
    tools: createToolConditionState(),
    skills: { learned: [] },
    ...overrides,
  };
}

test.describe('official Light Green Thumb care packages', () => {
  test('ports exact no-skill and rank-three watering values', () => {
    assert.deepEqual(TRANT_CARE_PACKAGES.living_water.no_skill, {
      rank: -1,
      durationMs: 4000,
      successRate: 90,
      energyCost: 5,
      moodBonus: 1,
      xpBonus: 1,
      toolWear: 2,
    });
    assert.deepEqual(TRANT_CARE_PACKAGES.living_water.light_green_thumb_3, {
      rank: 3,
      durationMs: 2000,
      successRate: 100,
      energyCost: 2,
      moodBonus: 2,
      xpBonus: 4,
      toolWear: 1,
    });
    assert.equal(TRANT_CARE_PACKAGES.wood_water.no_skill.energyCost, 3);
    assert.equal(TRANT_CARE_PACKAGES.wood_water.light_green_thumb_3.xpBonus, 6);
    assert.equal(TRANT_CARE_PACKAGES.wood_pet.no_skill.successRate, 80);
    assert.equal(TRANT_CARE_PACKAGES.living_pet.no_skill.successRate, 60);
  });

  test('uses the highest learned Light Green Thumb rank for both tree families', () => {
    assert.equal(highestLightGreenThumbRank([]), 'no_skill');
    assert.equal(
      highestLightGreenThumbRank(['light_green_thumb_1', 'light_green_thumb_3']),
      'light_green_thumb_3'
    );
    const living = resolveTrantCarePackage('trant_fruit', 'water', ['light_green_thumb_2']);
    const wood = resolveTrantCarePackage('wood_tree', 'water', ['light_green_thumb_2']);
    assert.equal(living.packageId, 'living_water');
    assert.equal(living.energyCost, 2);
    assert.equal(wood.packageId, 'wood_water');
    assert.equal(wood.moodBonus, 4);
  });

  test('requires a present, sufficiently healthy Watering Can without mutation', () => {
    const state = createTrantState('trant_fruit');
    const missing = context({ inv: {} });
    assert.equal(quoteTrantCare(state, 'trant_fruit', 'water', missing).reason, 'tool_missing');
    const broken = context();
    setToolRemaining(broken.tools, 'watering_can', 1);
    const before = structuredClone(broken);
    assert.equal(quoteTrantCare(state, 'trant_fruit', 'water', broken).reason, 'tool_broken');
    assert.deepEqual(broken, before);
  });

  test('successful rank-two watering spends exact metabolics and one tool point', () => {
    const state = createTrantState('trant_fruit', { health: 7 });
    const ctx = context({ skills: { learned: ['light_green_thumb_2'] } });
    const result = performTrantCare(state, 'trant_fruit', 'water', {
      ...ctx,
      learned: ctx.skills.learned,
      rng: () => 0.99,
    });
    assert.equal(result.ok, true);
    assert.equal(state.watered, true);
    // Not petted yet this period, so health holds (performTending).
    assert.equal(state.health, 7);
    assert.equal(ctx.pc.energy, 98);
    assert.equal(ctx.pc.mood, 52);
    assert.equal(ctx.pc.imagination, 2);
    assert.equal(ctx.pc.xp, 2);
    assert.equal(getToolCondition(ctx.tools, 'watering_can').remaining, 99);
    assert.match(trantStatusLabel(state), /watered/);
  });

  test('health rises once the tree is both petted and watered', () => {
    const state = createTrantState('trant_fruit', { health: 7 });
    const ctx = context({ skills: { learned: ['light_green_thumb_2'] } });
    const run = (kind) => performTrantCare(state, 'trant_fruit', kind, {
      ...ctx, learned: ctx.skills.learned, rng: () => 0.99,
    });
    assert.equal(run('pet').ok, true);
    assert.equal(state.health, 7);
    assert.equal(run('water').ok, true);
    assert.equal(state.health, 8);
  });

  test('a failed pet loses the mood bonus and spends nothing else', () => {
    const state = createTrantState('trant_fruit', { health: 6 });
    const ctx = context();
    const result = performTrantCare(state, 'trant_fruit', 'pet', { ...ctx, learned: [], rng: () => 0.95 });
    assert.equal(result.reason, 'failed');
    assert.equal(ctx.pc.energy, 100);
    assert.equal(ctx.pc.mood, 50 - result.profile.moodBonus);
    assert.equal(state.petted, false);
  });

  test('a no-skill failure spends nothing and leaves the daily gate open', () => {
    const state = createTrantState('trant_egg', { health: 6 });
    const ctx = context();
    const result = performTrantCare(state, 'trant_egg', 'water', {
      ...ctx,
      learned: [],
      rng: () => 0.95,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'failed');
    assert.equal(result.attempted, true);
    assert.equal(state.watered, false);
    assert.equal(state.health, 6);
    assert.equal(ctx.pc.energy, 100);
    assert.equal(getToolCondition(ctx.tools, 'watering_can').remaining, 100);
  });

  test('daily repeat and low-energy gates are atomic', () => {
    const daily = createTrantState('trant_bubble');
    daily.petted = true;
    const ctx = context();
    const before = structuredClone({ daily, ctx });
    assert.equal(performTrantCare(daily, 'trant_bubble', 'pet', ctx).reason, 'daily');
    assert.deepEqual({ daily, ctx }, before);

    const tired = createTrantState('trant_gas');
    const tiredCtx = context({ pc: { energy: 1, mood: 50, imagination: 0, xp: 0 } });
    assert.equal(performTrantCare(tired, 'trant_gas', 'water', tiredCtx).reason, 'energy');
    assert.equal(tiredCtx.pc.energy, 1);
    assert.equal(getToolCondition(tiredCtx.tools, 'watering_can').remaining, 100);
  });
});

test.describe('living-trant world and client integration', () => {
  test('distributes all six official living species in stable street plans', () => {
    assert.deepEqual(livingTrantPlanForStreet('LM411BNOGTUG2', 3), [
      'trant_fruit',
      'trant_egg',
      'trant_bean',
    ]);
    assert.deepEqual(
      livingTrantPlanForStreet('GA9TCL1H7LD37DC', 8),
      livingTrantPlanForStreet('GA9TCL1H7LD37DC', 8)
    );
    const found = new Set();
    for (let index = 0; index < 32; index += 1) {
      livingTrantPlanForStreet(`street-${index}`, 3).forEach((id) => found.add(id));
    }
    assert.deepEqual([...found].sort(), [...LIVING_TRANT_CLASS_IDS].sort());
  });

  test('verb menu previews rank timing/wear and commits through shared content', () => {
    const ctx = context({ skills: { learned: ['light_green_thumb_2'] } });
    const target = {
      classId: 'trant_fruit',
      label: 'Fruit Tree',
      state: createTrantState('trant_fruit', { health: 7 }),
    };
    const water = getVerbsFor(target, ctx).find((verb) => verb.id === 'water');
    assert.equal(water.enabled, true);
    assert.equal(water.energy, 2);
    assert.equal(water.durationMs, 2000);
    assert.match(water.tooltip, /Watering Can/);
    assert.match(water.tooltip, /1 condition/);
    const result = runVerb(target, 'water', { ...ctx, rng: () => 0.99 });
    assert.equal(result.ok, true);
    assert.equal(result.trantCareChanged, true);
    assert.equal(result.toolChanged, true);
    assert.equal(result.effects.energy, -2);
    assert.equal(result.effects.mood, 2);
    assert.equal(result.effects.xp, 2);
    assert.equal(getToolCondition(ctx.tools, 'watering_can').remaining, 99);
  });

  test('ships the official 10×3 Watering Can sheet and broken icon', () => {
    const png = (relative) => {
      const bytes = fs.readFileSync(path.join(publicDir, relative));
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    };
    assert.deepEqual(png('assets/sprites/tools/watering-can-tool.png'), { width: 910, height: 234 });
    assert.deepEqual(png('assets/sprites/icons/watering_can_broken.png'), { width: 64, height: 59 });
  });

  test('wires dynamic duration, cancellable animation, QA, condition, and mute default', () => {
    const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
    const html = fs.readFileSync(path.join(publicDir, 'play/index.html'), 'utf8');
    assert.match(game, /function playWateringCanAnimation\(target, durationMs = 0\)/);
    assert.match(game, /watering-can-tool\.png/);
    assert.match(game, /Number\.isFinite\(verb\.durationMs\)/);
    assert.match(game, /clearActionToolFx\('cancelled'\)/);
    assert.match(game, /caredemo/);
    assert.match(game, /wateringremaining/);
    assert.match(game, /bootParams\.has\('wateringremaining'\)/);
    assert.match(game, /livingTrantPlanForStreet\(currentStreetTsid/);
    assert.match(game, /getVerbsFor\(target, \{[\s\S]*?tools: toolState/);
    assert.match(game, /muted: loadMutedPreference\(\)/);
    assert.match(html, /game\.js\?v=official-ecology-1/);
  });
});
