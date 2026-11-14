/**
 * #313 (The Catface, Mr. Block's Playroom): a conversation card sat in the middle of the screen,
 * over the room's middle while Mr. Block talked. Glitch drew a thing's conversation as a bubble
 * over the thing (ChoicesDialog.as 833-880, getPtForLIV 921-947); js/speaker-card.js puts the card
 * over the speaker's head, else beside it, else under it, and leaves it centred without one.
 * Run: node --test tests/speaker-card.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeCardBySpeaker, SPEAKER_CARD_GAP, SPEAKER_CARD_MARGIN } from '../public/js/speaker-card.js?v=94220469';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const view = { x: 0, y: 0, w: 1280, h: 680 };
const card = { w: 520, h: 270 };
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const cardRect = (s) => ({ left: s.x, top: s.y, right: s.x + card.w, bottom: s.y + card.h });

describe('#313 placeCardBySpeaker', () => {
  it('puts the card over a speaker with room above, centred on it', () => {
    const speaker = { left: 600, top: 380, right: 740, bottom: 520 };
    const s = placeCardBySpeaker({ view, card, speaker });
    assert.equal(s.how, 'above');
    assert.equal(s.y + card.h, speaker.top - SPEAKER_CARD_GAP);
    assert.equal(s.x, 670 - card.w / 2);
    assert.ok(!overlaps(cardRect(s), speaker));
  });

  it('keeps an above card inside the view at the edges', () => {
    const s = placeCardBySpeaker({ view, card, speaker: { left: 1200, top: 400, right: 1280, bottom: 520 } });
    assert.equal(s.how, 'above');
    assert.equal(s.x, view.w - SPEAKER_CARD_MARGIN - card.w);
  });

  it("goes beside a high speaker, on the side with more room (Mr. Block hovering at the view's right edge)", () => {
    const speaker = { left: 1170, top: 155, right: 1280, bottom: 315 };
    const s = placeCardBySpeaker({ view, card, speaker });
    assert.equal(s.how, 'beside');
    assert.equal(s.x, speaker.left - SPEAKER_CARD_GAP - card.w);
    assert.ok(!overlaps(cardRect(s), speaker));
    const left = placeCardBySpeaker({ view, card, speaker: { left: 0, top: 155, right: 110, bottom: 315 } });
    assert.equal(left.x, 110 + SPEAKER_CARD_GAP);
  });

  it('goes under when neither above nor beside fits, and stays centred (null) when nothing does', () => {
    const narrow = { x: 0, y: 0, w: 402, h: 620 };
    const small = { w: 370, h: 200 };
    const under = placeCardBySpeaker({ view: narrow, card: small, speaker: { left: 150, top: 40, right: 260, bottom: 180 } });
    assert.equal(under.how, 'below');
    assert.equal(under.y, 180 + SPEAKER_CARD_GAP);
    assert.equal(placeCardBySpeaker({ view: narrow, card: small, speaker: { left: 100, top: 150, right: 300, bottom: 500 } }), null);
  });

  it('leaves the card centred for a speaker out of the view, or none', () => {
    assert.equal(placeCardBySpeaker({ view, card, speaker: { left: 1400, top: 300, right: 1500, bottom: 400 } }), null);
    assert.equal(placeCardBySpeaker({ view, card, speaker: null }), null);
  });
});

describe('#313 wiring', () => {
  const game = read('public/game.js');
  it("every one of Mr. Block's Four Letter Words dialogues names him as the speaker", () => {
    const calls = game.split('openScriptedQuestDialogue({').slice(1).filter((c) => c.slice(0, 80).includes("title: 'Mr. Block'"));
    assert.equal(calls.length, 5);
    for (const c of calls) assert.match(c.slice(0, 120), /speaker: fourLetterMrBlock,/);
  });
  it('the quest card places itself by its speaker, plain looks only', () => {
    assert.match(game, /placeDialogueBySpeaker\(modal, look === 'plain' && !inLog \? speakerRectIn\(questDialogueState\.speaker, modal\) : null\)/);
    assert.match(game, /speakerRectIn: \(target, el\) => speakerRectIn\(target, el\)/);
  });
  it("a quest room's conversation takes the room target its title names (Mr. Block in Child's Play and Word Up)", () => {
    const qi = read('public/js/features/quest-instances-feature.js');
    assert.match(qi, /speaker: opts\.speaker \?\? c\.targets\.find\(\(t\) => opts\.title && t\.label === opts\.title\)/);
    assert.match(qi, /placeDialogueBySpeaker\(dialog\.modal, look === 'plain'/);
  });
  it('style.css takes the card out of the centring only while placed', () => {
    assert.match(read('public/style.css'), /\.quest-dialogue\[data-speaker-place\] \.quest-dialogue-card \{\s*position: absolute;\s*left: var\(--speaker-card-x, 0\);\s*top: var\(--speaker-card-y, 0\);/);
  });
});
