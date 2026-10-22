import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  EMOTIONAL_BEAR_ACTIONS,
  EMOTIONAL_BEAR_COMPANIONS,
  createEmotionalBearState,
  emotionalBearActionQuote,
  emotionalBearIcon,
  emotionalBearIconState,
  emotionalBearUpgradeQuote,
  listEmotionalBearActions,
  normalizeEmotionalBearState,
  performEmotionalBearAction,
  upgradeEmotionalBear,
} from '../public/js/emotional-bear.js?v=emotional-bear-1';

const publicRoot = join(import.meta.dirname, '..', 'public');

describe('source-authored Emotional Bear', () => {
  it('starts plain and preserves the four original visual states', () => {
    const plain = createEmotionalBearState();
    assert.equal(emotionalBearIconState(plain), 'plain');
    assert.equal(emotionalBearIcon(plain), 'assets/sprites/emotional-bear/iconic_plain.png');
    assert.equal(emotionalBearIconState(createEmotionalBearState({ upgrades: ['kiss'] })), 'kiss');
    assert.equal(emotionalBearIconState(createEmotionalBearState({ upgrades: ['moon'] })), 'moon');
    assert.equal(
      emotionalBearIconState(createEmotionalBearState({ upgrades: ['moon', 'kiss'] })),
      'moon_kiss'
    );
  });

  it('consumes Lips and Moon exactly once and exposes the unlocked emotes', () => {
    const state = createEmotionalBearState();
    const inventory = { lips: 1, moon: 1 };
    assert.equal(emotionalBearUpgradeQuote(state, inventory, 'kiss').ok, true);
    assert.equal(upgradeEmotionalBear(state, inventory, 'kiss').ok, true);
    assert.equal(inventory.lips, 0);
    assert.equal(emotionalBearIconState(state), 'kiss');
    assert.equal(upgradeEmotionalBear(state, inventory, 'kiss').reason, 'already_upgraded');
    assert.equal(upgradeEmotionalBear(state, inventory, 'moon').ok, true);
    assert.equal(inventory.moon, 0);
    assert.deepEqual(state.upgrades, ['kiss', 'moon']);
    assert.equal(emotionalBearIconState(state), 'moon_kiss');
  });

  it('preserves the original social energy and mood economy', () => {
    const state = createEmotionalBearState({ upgrades: ['kiss', 'moon'] });
    const pc = { energy: 50, mood: 40 };

    const hug = performEmotionalBearAction(state, pc, 'hug', 'Amp');
    assert.equal(hug.ok, true);
    assert.deepEqual(hug.effects, { energy: -5, mood: 2 });
    assert.deepEqual(hug.targetEffects, { mood: 2 });
    assert.equal(pc.energy, 45);
    assert.equal(pc.mood, 42);
    assert.equal(state.companionMood.Amp, 72);

    const highFive = performEmotionalBearAction(state, pc, 'high_five', 'Bumbishfish');
    assert.equal(highFive.ok, true);
    assert.deepEqual(highFive.effects, { energy: -10 });
    assert.equal(state.companionMood.Bumbishfish, 80);

    const kiss = performEmotionalBearAction(state, pc, 'kiss', 'Lily Linguistic');
    assert.equal(kiss.ok, true);
    assert.equal(kiss.durationMs, 3000);
    const moon = performEmotionalBearAction(state, pc, 'moon', 'Lily Linguistic');
    assert.equal(moon.ok, true);
    assert.equal(moon.durationMs, 6000);
    assert.equal(state.totalEmotes, 4);
  });

  it('requires more energy than the cost and blocks race outbursts', () => {
    const state = createEmotionalBearState();
    assert.equal(
      emotionalBearActionQuote(state, { energy: 5 }, 'hug', 'Amp').reason,
      'energy'
    );
    assert.equal(
      emotionalBearActionQuote(state, { energy: 6 }, 'hug', 'Amp').ok,
      true
    );
    assert.equal(
      emotionalBearActionQuote(state, { energy: 99 }, 'hug', 'Amp', { inRace: true }).reason,
      'race'
    );
    assert.equal(
      emotionalBearActionQuote(state, { energy: 99 }, 'kiss', 'Amp').reason,
      'missing_upgrade'
    );
    assert.equal(
      emotionalBearActionQuote(state, { energy: 99 }, 'hug', 'Not A Player').reason,
      'target'
    );
  });

  it('anthropomorphizes for up to 20 mood once per game day', () => {
    const state = createEmotionalBearState();
    const pc = { energy: 20, mood: 88 };
    const first = performEmotionalBearAction(
      state,
      pc,
      'anthropomorphize',
      '',
      { dayKey: '16-07-25' }
    );
    assert.equal(first.ok, true);
    assert.deepEqual(first.effects, { mood: 12 });
    assert.equal(pc.mood, 100);
    assert.equal(
      performEmotionalBearAction(
        state,
        pc,
        'anthropomorphize',
        '',
        { dayKey: '16-07-25' }
      ).reason,
      'daily_limit'
    );
    assert.equal(
      performEmotionalBearAction(
        state,
        pc,
        'anthropomorphize',
        '',
        { dayKey: '16-07-26' }
      ).ok,
      true
    );
  });

  it('tracks distinct companion interactions and sanitizes old saves', () => {
    const state = createEmotionalBearState();
    const pc = { energy: 100, mood: 10 };
    assert.equal(performEmotionalBearAction(state, pc, 'hug', 'Amp').uniqueTarget, true);
    assert.equal(performEmotionalBearAction(state, pc, 'hug', 'Amp').uniqueTarget, false);
    assert.equal(performEmotionalBearAction(state, pc, 'hug', 'Bumbishfish').uniqueTarget, true);
    assert.equal(state.interactions.hug.Amp, 2);
    assert.equal(state.interactions.hug.Bumbishfish, 1);

    const cleaned = normalizeEmotionalBearState({
      upgrades: ['kiss', 'kiss', 'bad'],
      anthropomorphizedDay: '<bad day>',
      companionMood: { Amp: 999, Hacker: 50 },
      interactions: { hug: { Amp: 3.8, Hacker: 99 }, hack: { Amp: 5 } },
      totalEmotes: -10,
    });
    assert.deepEqual(cleaned.upgrades, ['kiss']);
    assert.equal(cleaned.anthropomorphizedDay, 'badday');
    assert.equal(cleaned.companionMood.Amp, 100);
    assert.deepEqual(cleaned.interactions.hug, { Amp: 3 });
    assert.equal(cleaned.totalEmotes, 0);
  });

  it('publishes the original action table and target roster', () => {
    assert.deepEqual(EMOTIONAL_BEAR_COMPANIONS, ['Amp', 'Bumbishfish', 'Lily Linguistic']);
    assert.equal(EMOTIONAL_BEAR_ACTIONS.hug.energy, 5);
    assert.equal(EMOTIONAL_BEAR_ACTIONS.hug.selfMood, 2);
    assert.equal(EMOTIONAL_BEAR_ACTIONS.high_five.targetMood, 10);
    assert.equal(EMOTIONAL_BEAR_ACTIONS.kiss.upgrade, 'kiss');
    assert.equal(EMOTIONAL_BEAR_ACTIONS.moon.upgrade, 'moon');
    const rows = listEmotionalBearActions(
      createEmotionalBearState(),
      { energy: 100 },
      { dayKey: 'day-1' }
    );
    assert.deepEqual(
      rows.filter((row) => row.available).map((row) => row.id),
      ['hug', 'high_five', 'anthropomorphize']
    );
  });

  it('ships clean OGA states, animation atlases, pack controls, and deterministic QA', () => {
    const assetRoot = join(publicRoot, 'assets', 'sprites', 'emotional-bear');
    for (const file of [
      'iconic_plain.png',
      'iconic_kiss.png',
      'iconic_moon.png',
      'iconic_moon_kiss.png',
      'hug.webp',
      'high-five.webp',
      'kiss.webp',
      'moon.webp',
    ]) {
      const path = join(assetRoot, file);
      assert.equal(existsSync(path), true, file);
      assert.ok(statSync(path).size > 100, file);
    }
    for (const file of ['lips.png', 'moon.png', 'emotional_bear.png']) {
      assert.equal(existsSync(join(publicRoot, 'assets', 'sprites', 'icons', file)), true, file);
    }
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    const css = readFileSync(join(publicRoot, 'style.css'), 'utf8');
    assert.match(game, /openEmotionalBearPicker/);
    assert.match(game, /upgradePackedEmotionalBear/);
    assert.match(game, /beardemo/);
    assert.match(html, /id="emotional-bear-picker"/);
    assert.match(html, /id="emotional-bear-fx"/);
    assert.match(css, /\.emotional-bear-target/);
    assert.match(css, /\.pack-bear-state/);
  });
});
