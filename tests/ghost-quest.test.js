import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PHANTOM_QUEST_ID,
  REMEMBER_QUEST_ID,
  PHANTOM_HAUNT_COUNT,
  PHANTOM_FINALE_BEATS,
  PHANTOM_GIVE_HEART_ANIMATION_SPEED,
  PHANTOM_GIVE_HEART_DURATION_MS,
  PHANTOM_GIVE_HEART_FRAME_COUNT,
  PHANTOM_HEART_REVEAL_HOLD_MS,
  HEART_MEMORY_COOLDOWN_MS,
  choosePhantomHaunts,
  createGhostQuestState,
  ensureGhostQuestState,
  ghostEncounterAt,
  noticePhantom,
  phantomAnimationDurationMs,
  grantFadedHeart,
  rememberWithFadedHeart,
} from '../public/js/ghost-quest.js';
import { createQuestState, parseQuestConversation } from '../public/js/quests.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Notice the Unnoticeable authored quest', () => {
  it('paces the recorded final conversation before the heart handoff', () => {
    assert.deepEqual(
      PHANTOM_FINALE_BEATS.map((beat) => beat.response),
      ["Don't know what?", 'I could barely hear you.', 'Aw, shucks. It was nothing.', '?']
    );
    assert.match(PHANTOM_FINALE_BEATS[1].text, /screams were only whispers/);
    assert.match(PHANTOM_FINALE_BEATS[3].text, /remembered me/);
  });

  it('selects seven unique imported aliases from the official GSJS haunt list', () => {
    const available = [
      'GCRHITPKONL1T7J',
      'GLIF6R3R9GE1GQB',
      'GCR101SU5VL1P09',
      'GCR195Q63RK143M',
      'GCR13NMUQEM1A2R',
      'GA5DVVGJQQ5237U',
      'GA51B2OQAK623EF',
      'GLI2V0UN7RD1T2J',
    ];
    const selected = choosePhantomHaunts(available);
    assert.equal(selected.length, PHANTOM_HAUNT_COUNT);
    assert.equal(new Set(selected).size, PHANTOM_HAUNT_COUNT);
    assert.deepEqual(selected.slice(0, 2), ['GCRHITPKONL1T7J', 'GLIF6R3R9GE1GQB']);
  });

  it('records each haunting once and exposes the final encounter after seven', () => {
    const quests = createQuestState();
    quests.active[PHANTOM_QUEST_ID] = { progress: {}, startedAt: 1 };
    const streets = Array.from({ length: 7 }, (_, i) => `GHOST_STREET_${i}`);
    ensureGhostQuestState(quests, streets, { reset: true });

    for (let i = 0; i < streets.length; i += 1) {
      const encounter = ghostEncounterAt(quests, streets[i]);
      assert.equal(encounter.kind, 'echo');
      const result = noticePhantom(quests, streets[i]);
      assert.equal(result.ok, true);
      assert.equal(result.found, i + 1);
      assert.equal(noticePhantom(quests, streets[i]).reason, 'already_found');
    }

    assert.equal(ghostEncounterAt(quests, 'ANY_NEXT_STREET').kind, 'final');
  });

  it('grants exactly one Faded Heart only after the hunt is ready', () => {
    const quests = createQuestState();
    quests.active[PHANTOM_QUEST_ID] = { progress: {}, startedAt: 1 };
    quests.story.phantom = createGhostQuestState({
      hauntStreets: Array.from({ length: 7 }, (_, i) => `S${i}`),
      foundStreets: Array.from({ length: 7 }, (_, i) => `S${i}`),
    });
    const inv = {};
    assert.equal(grantFadedHeart(quests, inv).ok, true);
    assert.equal(inv.faded_heart, 1);
    assert.equal(grantFadedHeart(quests, inv).reason, 'already_granted');
    assert.equal(inv.faded_heart, 1);
  });

  it('plays the complete recovered heart handoff before opening completion pages', () => {
    assert.equal(PHANTOM_GIVE_HEART_FRAME_COUNT, 89);
    assert.equal(PHANTOM_GIVE_HEART_ANIMATION_SPEED, 0.32);
    assert.equal(PHANTOM_GIVE_HEART_DURATION_MS, 4635);
    assert.equal(
      phantomAnimationDurationMs(
        PHANTOM_GIVE_HEART_FRAME_COUNT,
        PHANTOM_GIVE_HEART_ANIMATION_SPEED
      ),
      PHANTOM_GIVE_HEART_DURATION_MS
    );
    assert.equal(PHANTOM_HEART_REVEAL_HOLD_MS, 700);

    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    const handoffStart = game.indexOf('function completePhantomHeartHandoff');
    const handoffEnd = game.indexOf('function handlePhantomInteraction', handoffStart);
    const handoff = game.slice(handoffStart, handoffEnd);
    assert.match(handoff, /ghostFinale = 'handoff'/);
    assert.match(handoff, /sprite\.onComplete = finishHandoff/);
    assert.match(handoff, /announceQuestCompletions\(updates\)/);
    const beforeFinish = handoff.slice(0, handoff.indexOf('const finishHandoff'));
    assert.doesNotMatch(beforeFinish, /updateHud\(\)/);
    assert.match(
      handoff,
      /const finishHandoff = \(\) => \{[\s\S]*announceQuestCompletions\(updates\)[\s\S]*sprite\.onComplete = finishHandoff/
    );
    assert.doesNotMatch(handoff, /3500/);
    assert.match(game, /holdProgressionAward = Boolean\(phantomTarget\?\.state\?\.handoff\)/);
    assert.match(handoff, /target\.state\.handoff = false/);

    const encounterStart = game.indexOf('function spawnPhantomQuestEncounter');
    const encounterEnd = game.indexOf(
      'function completePhantomHeartHandoff',
      encounterStart
    );
    const encounter = game.slice(encounterStart, encounterEnd);
    assert.match(encounter, /sprite\.onFrameChange/);
    assert.doesNotMatch(encounter, /The original echo settles/);
  });
});

describe('Remember the Rememberable', () => {
  it('counts one remembrance per street with the original 15-second cooldown', () => {
    const quests = createQuestState();
    quests.active[REMEMBER_QUEST_ID] = { progress: {}, startedAt: 1 };
    quests.story.phantom = createGhostQuestState({ heartGranted: true });
    const inv = { faded_heart: 1 };
    const first = rememberWithFadedHeart(quests, inv, 'STREET_A', 1_000);
    assert.equal(first.ok, true);
    assert.equal(first.remembered, 1);

    const cooling = rememberWithFadedHeart(quests, inv, 'STREET_B', 1_001);
    assert.equal(cooling.reason, 'cooldown');
    assert.equal(cooling.remainingMs, HEART_MEMORY_COOLDOWN_MS - 1);

    const duplicate = rememberWithFadedHeart(
      quests,
      inv,
      'STREET_A',
      1_000 + HEART_MEMORY_COOLDOWN_MS
    );
    assert.equal(duplicate.reason, 'already_remembered');

    const second = rememberWithFadedHeart(
      quests,
      inv,
      'STREET_B',
      1_000 + HEART_MEMORY_COOLDOWN_MS
    );
    assert.equal(second.ok, true);
    assert.equal(second.remembered, 2);
  });
});

describe('original quest conversation markup', () => {
  it('turns split tags into readable guide beats and response labels', () => {
    const beats = parseQuestConversation(
      'In the mood for a good ghost story?<split butt_txt="Always." />Be patient, kid.<split butt_txt="Go on." />Then look.'
    );
    assert.deepEqual(beats, [
      { text: 'In the mood for a good ghost story?', response: 'Always.' },
      { text: 'Be patient, kid.', response: 'Go on.' },
      { text: 'Then look.', response: '' },
    ]);
  });
});
