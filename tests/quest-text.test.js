/**
 * Quest copy cleanup (js/quests.js cleanQuestMarkup / parseQuestConversation).
 * Run: node --test tests/quest-text.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuestMarkup, parseQuestConversation, setQuestPlayerLabel } from '../public/js/quests.js';

describe('quest copy', () => {
  it('fills {pc_label} with the player label', () => {
    assert.equal(cleanQuestMarkup('Did you enjoy yourself, {pc_label}?'), 'Did you enjoy yourself, friend?');
    const beats = parseQuestConversation('Hi {pc_label}!<split butt_txt="Hi." />Bye, {pc_label}.');
    assert.deepEqual(beats.map((b) => b.text), ['Hi friend!', 'Bye, friend.']);
    setQuestPlayerLabel('Bumbishfish');
    assert.equal(cleanQuestMarkup('{pc_label}!'), 'Bumbishfish!');
    setQuestPlayerLabel('');
    assert.equal(cleanQuestMarkup('{pc_label}'), 'friend');
  });
});
