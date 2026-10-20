/**
 * "The Last Feat" acceptance and GSJS incantation-chain rules.
 * Run: node --test tests/feats.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INCANTATION_LINES,
  createFeatState,
  featStatus,
  incantationStepForMessage,
  normalizeFeatSnapshot,
  normalizeFeatState,
  submitIncantation,
} from '../public/js/feats.js?v=incantations-1';

const publicRoot = join(import.meta.dirname, '..', 'public');

describe('Incantations of Absurdity Feat', () => {
  it('recognizes the three source-authored phrases case-insensitively within chat', () => {
    assert.equal(incantationStepForMessage('This game is absolutely preposterous!'), 1);
    assert.equal(incantationStepForMessage('well, I AGREE WHOLEHEARTEDLY.'), 2);
    assert.equal(incantationStepForMessage('And yet, I will really miss it'), 3);
    assert.equal(incantationStepForMessage('This is ordinary local chat.'), 0);
  });

  it('scores 1, 2, and 3 points for three different Glitches in order', () => {
    const state = createFeatState();
    const first = submitIncantation(state, INCANTATION_LINES[0].phrase, 'Ur', 100);
    const second = submitIncantation(state, INCANTATION_LINES[1].phrase, 'Amp', 200);
    const third = submitIncantation(state, INCANTATION_LINES[2].phrase, 'Bumbishfish', 300);
    assert.deepEqual(
      [first.points, second.points, third.points],
      [1, 2, 3]
    );
    assert.equal(first.firstContribution, true);
    assert.equal(second.firstContribution, false);
    assert.equal(third.chainCompleted, true);
    assert.deepEqual(third.chainParticipants, ['Ur', 'Amp', 'Bumbishfish']);
    assert.deepEqual(featStatus(state), {
      title: "The First Glimmer of the Giants' Awakening",
      totalPoints: 6,
      personalPoints: 1,
      contributions: 1,
      chainsCompleted: 1,
      nextStep: 1,
      currentPoints: 0,
      nextLine: INCANTATION_LINES[0],
      participants: [],
    });
  });

  it('breaks an active chain on unrelated chat, an out-of-order line, or a repeated participant', () => {
    for (const [message, participant, reason] of [
      ['What a nice tree.', 'Amp', 'other-chat'],
      [INCANTATION_LINES[2].phrase, 'Amp', 'out-of-order'],
      [INCANTATION_LINES[1].phrase, 'Ur', 'same-participant'],
    ]) {
      const state = createFeatState();
      submitIncantation(state, INCANTATION_LINES[0].phrase, 'Ur', 100);
      const result = submitIncantation(state, message, participant, 200);
      assert.equal(result.broken, true, reason);
      assert.equal(result.reason, reason);
      assert.equal(result.activityLine, 'Oops! The incantation chain has been broken!');
      assert.equal(state.nextStep, 1);
      assert.deepEqual(state.participants, []);
    }
  });

  it('does not start or announce a break for ordinary chat without an active chain', () => {
    const state = createFeatState();
    const result = submitIncantation(state, 'Hello, Groddle!', 'Ur');
    assert.equal(result.ok, false);
    assert.equal(result.broken, false);
    assert.equal(result.reason, 'not-incantation');
  });

  it('repairs and persists the durable contribution snapshot without a transient chain leak', () => {
    assert.deepEqual(normalizeFeatState({
      totalPoints: 12.9,
      personalPoints: 3,
      contributions: 1,
      chainsCompleted: 2,
      nextStep: 3,
      participants: ['Amp', 'Amp', 'Bumbishfish', '<bad>'],
      activeSince: 44,
      ignored: true,
    }), {
      featId: 'makeup_feat_redux',
      totalPoints: 12,
      personalPoints: 3,
      contributions: 1,
      chainsCompleted: 2,
      nextStep: 3,
      participants: ['Amp', 'Bumbishfish'],
      activeSince: 44,
    });
    assert.deepEqual(normalizeFeatSnapshot({
      totalPoints: 12,
      personalPoints: 3,
      contributions: 1,
      chainsCompleted: 2,
      nextStep: 3,
      participants: ['Amp', 'Bumbishfish'],
      activeSince: 44,
    }), {
      featId: 'makeup_feat_redux',
      totalPoints: 12,
      personalPoints: 3,
      contributions: 1,
      chainsCompleted: 2,
      nextStep: 1,
      participants: [],
      activeSince: 0,
    });
  });
});

describe('Feat client integration', () => {
  it('ships the recovered client Feat badge and local chat panel wiring', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'index.html'), 'utf8');
    const css = readFileSync(join(publicRoot, 'style.css'), 'utf8');
    assert.match(game, /submitIncantation\(featState, text, participant/);
    assert.match(game, /'feats:contributed'/);
    assert.match(game, /badge-icons\.json\?v=catalog-art-2/);
    assert.match(game, /finishAssistedFeatChain/);
    assert.match(game, /updateLocalChatDockPosition/);
    assert.match(html, /id="feat-panel"/);
    assert.match(html, /id="local-chat-input"/);
    assert.match(css, /\.local-chat-dock/);
    assert.match(css, /--pack-live-height/);
    const png = readFileSync(join(publicRoot, 'assets/sprites/feat_badge_small.png'));
    assert.equal(png.readUInt32BE(16), 30);
    assert.equal(png.readUInt32BE(20), 25);
    const badgeMap = JSON.parse(
      readFileSync(join(publicRoot, 'assets/content/badge-icons.json'), 'utf8')
    );
    assert.equal(badgeMap.feat_first, 'assets/badges/feat_first.png');
    const badge = readFileSync(join(publicRoot, badgeMap.feat_first));
    assert.equal(badge.readUInt32BE(16), 180);
    assert.equal(badge.readUInt32BE(20), 180);
  });
});
