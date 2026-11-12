import assert from 'node:assert/strict';
import { imageSize } from '../tools/image-size.mjs';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PHANTOM_QUEST_ID,
  REMEMBER_QUEST_ID,
  PHANTOM_HAUNT_COUNT,
  PHANTOM_FINALE_BEATS,
  PHANTOM_APPEAR_ANIMATION_SPEED,
  PHANTOM_APPEAR_FRAME_COUNT,
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
  isPhantomHauntStreet,
} from '../public/js/ghost-quest.js?v=5f3cc133';
import { createQuestState, parseQuestConversation } from '../public/js/quests.js?v=2951073f';

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
    const selected = choosePhantomHaunts(available, { seed: 'one player' });
    assert.equal(selected.length, PHANTOM_HAUNT_COUNT);
    assert.equal(new Set(selected).size, PHANTOM_HAUNT_COUNT);
    // Seven official streets are present, so the one non-official street is never borrowed (#145).
    assert.equal(selected.includes('GLI2V0UN7RD1T2J'), false);
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
    // phantom_glitch.swf giveHeart is 76 frames at the SWF's 30 fps.
    assert.equal(PHANTOM_GIVE_HEART_FRAME_COUNT, 76);
    assert.equal(PHANTOM_GIVE_HEART_ANIMATION_SPEED, 0.5);
    assert.equal(PHANTOM_GIVE_HEART_DURATION_MS, 2533);
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

describe('Phantom Glitch sheets', () => {
  // The OGA sheets are 6 columns of 147x214 cells holding exactly the SWF's
  // appear (46) and giveHeart (76) frames; a 7x126 grid cut through heads.
  const pngSize = (file) => {
    const buf = fs.readFileSync(path.join(root, 'public', file));
    return { w: imageSize(buf).w, h: imageSize(buf).h };
  };
  const sheets = [
    ['phantomAppear', 'assets/sprites/quests/phantom-appear.webp', PHANTOM_APPEAR_FRAME_COUNT, 46],
    ['phantomGiveHeart', 'assets/sprites/quests/phantom-give-heart.webp', PHANTOM_GIVE_HEART_FRAME_COUNT, 76],
  ];

  it('slices the sheets on the grid the SWF frame counts fill', () => {
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    for (const [key, file, count, swfFrames] of sheets) {
      assert.equal(count, swfFrames);
      const def = new RegExp(`${key}: \\{\\s*url: '${file}',\\s*fw: (\\d+), fh: (\\d+), cols: (\\d+), rows: (\\d+), frameCount: (\\w+)`).exec(game);
      assert.ok(def, `${key} descriptor`);
      const [fw, fh, cols, rows] = def.slice(1, 5).map(Number);
      assert.deepEqual([fw, fh, cols], [147, 214, 6]);
      const { w, h } = pngSize(file);
      assert.equal(w, fw * cols);
      assert.equal(h, fh * rows);
      assert.equal(Math.ceil(count / cols), rows);
    }
    assert.equal(PHANTOM_APPEAR_ANIMATION_SPEED, 0.5);
  });

  it('has sharp 3x sheets rebuilt from the SWF', () => {
    const results = JSON.parse(fs.readFileSync(path.join(root, 'tools/vector-sprites/results.json'), 'utf8'));
    for (const [, file, count] of sheets) {
      const r = results[file];
      assert.equal(r.status, 'ok', file);
      assert.equal(r.cells, count);
      assert.equal(r.swfLabelFrames, count);
      assert.ok(r.score >= 0.9, `${file} score ${r.score}`);
      for (const f of r.parts ? r.parts.map((p) => p.hires) : [r.hires]) {
        assert.ok(fs.existsSync(path.join(root, 'public', f)), f);
      }
    }
  });
});

describe('Remember the Rememberable', () => {
  // faded_heart.js 66-73, 95-102; remember_ghosts_1.js 65-71.
  const HAUNT_A = 'LCRHITPKONL1T7J';
  const HAUNT_B = 'GLIF6R3R9GE1GQB';
  it('counts one remembrance per haunt street with the original 15-second cooldown', () => {
    const quests = createQuestState();
    quests.active[REMEMBER_QUEST_ID] = { progress: {}, startedAt: 1 };
    quests.story.phantom = createGhostQuestState({ heartGranted: true });
    const inv = { faded_heart: 1 };
    const first = rememberWithFadedHeart(quests, inv, HAUNT_A, 1_000);
    assert.equal(first.ok, true);
    assert.equal(first.counted, true);
    assert.equal(first.remembered, 1);

    const cooling = rememberWithFadedHeart(quests, inv, HAUNT_B, 1_001);
    assert.equal(cooling.reason, 'cooldown');
    assert.equal(cooling.remainingMs, HEART_MEMORY_COOLDOWN_MS - 1);

    // A street already remembered plays the memory again without counting.
    const again = rememberWithFadedHeart(quests, inv, HAUNT_A, 1_000 + HEART_MEMORY_COOLDOWN_MS);
    assert.equal(again.ok, true);
    assert.equal(again.counted, false);
    assert.equal(again.remembered, 1);

    const second = rememberWithFadedHeart(quests, inv, HAUNT_B, 1_000 + 2 * HEART_MEMORY_COOLDOWN_MS);
    assert.equal(second.ok, true);
    assert.equal(second.counted, true);
    assert.equal(second.remembered, 2);
  });

  it('works only on a haunt street, and still plays after the quest without counting', () => {
    const quests = createQuestState();
    quests.story.phantom = createGhostQuestState({ heartGranted: true, hauntStreets: ['GSTANDIN1'] });
    const inv = { faded_heart: 1 };
    assert.equal(rememberWithFadedHeart(quests, inv, 'STREET_A', 1_000).reason, 'not_haunt');
    assert.equal(isPhantomHauntStreet('GSTANDIN1', quests.story.phantom), true, "the player's own stand-in haunt counts");
    const after = rememberWithFadedHeart(quests, inv, HAUNT_A, 1_000);
    assert.equal(after.ok, true, 'no quest active: the memory still plays');
    assert.equal(after.counted, false);
    assert.equal(after.remembered, 0);
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    assert.doesNotMatch(game, /later ghost story/);
    assert.match(game, /You can't remember anything in connection with this place\./);
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
