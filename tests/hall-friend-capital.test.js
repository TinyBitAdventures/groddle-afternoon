/**
 * The Bureaucratic Hall's bureaucrats (the lizards) said "<b>friend</b>! We will be with you as soon as
 * possible. Now please go and wait." in solo, a lower-case word starting the line. The GSJS line is
 * "<b>"+this.greeting.label+"</b>! We will be with you as soon as possible. Now please go and wait."
 * (items/npc_bureaucrat.js 425): Glitch put the player's name there, which starts with a capital. Solo
 * has no name, so we say "friend" (js/pc-label.js SOLO_PC_LABEL); at the start of a sentence it is now
 * "Friend", as the calls to the counter ("{pc_label}! Your turn!", npc_bureaucrat.js) are. The GSJS
 * words are kept as written; a player's own name online is kept as they wrote it.
 * Run: node --test tests/hall-friend-capital.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HALL_TEXT, fillHallText } from '../public/js/bureaucratic-hall.js?fresh=hall-friend-capital';

describe('solo "friend" starting a bureaucrat\'s sentence is "Friend"', () => {
  it('the greeting', () => {
    assert.equal(HALL_TEXT.greeting('friend'), '<b>Friend</b>! We will be with you as soon as possible. Now please go and wait.');
    assert.equal(HALL_TEXT.greeting('Ada'), '<b>Ada</b>! We will be with you as soon as possible. Now please go and wait.');
    assert.equal(HALL_TEXT.greeting('zed'), '<b>zed</b>! We will be with you as soon as possible. Now please go and wait.', 'a player name is kept as written');
  });

  it('the calls to the counter: capital at a sentence start, as written mid-sentence', () => {
    assert.equal(fillHallText('{pc_label}! Your turn!', { pcLabel: 'friend' }), 'Friend! Your turn!');
    assert.equal(fillHallText('Ready for you now, {pc_label}!', { pcLabel: 'friend' }), 'Ready for you now, friend!');
    assert.equal(fillHallText('Who’s Next? {pc_label}? Is {pc_label} here?', { pcLabel: 'friend' }), 'Who’s Next? Friend? Is friend here?');
    assert.equal(fillHallText('{pc_label}! Come and speak to me now, if you please. Time is currants, {pc_label}!', { pcLabel: 'friend' }), 'Friend! Come and speak to me now, if you please. Time is currants, friend!');
    assert.equal(fillHallText('{pc_label}! Your turn!', { pcLabel: 'zed' }), 'zed! Your turn!');
  });

  it('mid-sentence lines keep "friend"', () => {
    assert.match(HALL_TEXT.goAway('friend'), /^Go away, <b>friend<\/b>, /);
  });
});
