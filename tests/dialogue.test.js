import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DIALOGUE_SOURCE,
  dialoguePool,
  hasDialogue,
  nextDialogue,
  formatSpokenLine,
} from '../public/js/dialogue.js';
import { runVerb } from '../public/content.js?v=g369-1';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test.describe('official world dialogue pools', () => {
  test('ships varied CC0 lines for animals, all six living trants, and street spirits', () => {
    assert.equal(DIALOGUE_SOURCE, 'tinyspeck/glitch-GameServerJS CC0');
    for (const classId of [
      'npc_piggy',
      'npc_chicken',
      'npc_butterfly',
      'trant_fruit',
      'trant_egg',
      'trant_bean',
      'trant_bubble',
      'trant_gas',
      'trant_spice',
      'street_spirit_groceries',
    ]) {
      assert.ok(dialoguePool(classId).length >= 3, `${classId} should have a dialogue chain`);
      assert.equal(hasDialogue(classId), true);
    }
  });

  test('advances deterministically, records a scalar turn, and loops cleanly', () => {
    const state = {};
    const pool = dialoguePool('npc_piggy');
    const first = nextDialogue('npc_piggy', state);
    const second = nextDialogue('npc_piggy', state);
    assert.equal(first.text, pool[0]);
    assert.equal(second.text, pool[1]);
    assert.equal(first.speaker, 'Piggy');
    assert.equal(state.dialogueTurn, 2);
    for (let i = 2; i < pool.length; i += 1) nextDialogue('npc_piggy', state);
    assert.equal(nextDialogue('npc_piggy', state).text, pool[0]);
  });

  test('normalizes every vendor class to the shared Groddle spirit story', () => {
    const state = { dialogueTurn: 1 };
    const spoken = nextDialogue('street_spirit_gardening', state, { speaker: 'Gardening Goods Vendor' });
    assert.equal(spoken.key, 'street_spirit');
    assert.equal(spoken.speaker, 'Gardening Goods Vendor');
    assert.equal(spoken.text, dialoguePool('street_spirit')[1]);
    assert.equal(state.dialogueTurn, 2);
  });

  test('supports dynamic fallback speech and readable activity formatting', () => {
    const speech = nextDialogue('wood_tree', {}, { speaker: 'Tree', fallback: 'The rings remember.' });
    assert.equal(speech.text, 'The rings remember.');
    assert.equal(formatSpokenLine(speech), 'Tree: “The rings remember.”');
    assert.equal(nextDialogue('unknown', {}), null);
  });

  test('Talk to returns bubble metadata and advances the target itself', () => {
    const target = { classId: 'npc_chicken', state: {} };
    const ctx = {
      pc: { energy: 100, mood: 50, imagination: 0, xp: 0 },
      inv: {},
      skills: { learned: [] },
    };
    const first = runVerb(target, 'talk_to', ctx);
    const second = runVerb(target, 'talk_to', ctx);
    assert.equal(first.ok, true);
    assert.equal(first.speech.speaker, 'Chicken');
    assert.notEqual(first.speech.text, second.speech.text);
    assert.match(first.msgs[0], /^Chicken: “/);
    assert.equal(target.state.dialogueTurn, 2);
  });
});

test.describe('target-following speech-bubble client integration', () => {
  test('wraps, follows, replaces, fades, and clears world-space bubbles', () => {
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    assert.match(game, /function showSpeechBubble\(target, speech\)/);
    assert.match(game, /wordWrap: true/);
    assert.match(game, /wordWrapWidth: 246/);
    assert.match(game, /function positionSpeechBubble\(bubble\)/);
  assert.match(game, /meta\?\.target\?\.sprite/);
    assert.match(game, /updateSpeechBubbles\(dt\)/);
    assert.match(game, /clearSpeechBubbles\(\)/);
    assert.match(game, /SPEECH_REACTION_VERBS/);
    assert.match(game, /rendered in a wrapped speech bubble/);
  });

  test('exposes deterministic QA and persists scalar dialogue turns through world state', () => {
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    const save = fs.readFileSync(path.join(root, 'public/js/player-save.js'), 'utf8');
    assert.match(game, /dialoguedemo/);
    assert.match(game, /dialogueturn/);
    assert.match(game, /bootParams\.has\('dialogueturn'\)/);
    assert.match(game, /dataset\.lastSpeech/);
    assert.match(game, /dataset\.speechBubbles/);
    assert.match(save, /state: cleanScalarRecord\(row\?\.state\)/);
  });
});
