/**
 * G976: on a phone the notices sit over the avatar, and the quoin's amount (+25 iMG, a canvas burst,
 * AnnouncementController.as doQuoinGot 890-902) rose behind toasts opened at the same moment. The
 * canvas draws under every notice, so while the amount overlaps them the notices fade under it
 * (notify-view setUnderSpeech, the rule speech already has, G269).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { wordsOverNotices } from '../public/js/notify.js?v=c9d79ec5';

const root = join(import.meta.dirname, '..');

describe('G976: a quoin amount over the notices fades them', () => {
  const notices = [{ left: 15, top: 180, right: 400, bottom: 260 }];
  it('words inside the notice box count, words clear of it do not', () => {
    assert.equal(wordsOverNotices([{ x: 200, y: 230, width: 60, height: 50 }], notices), true);
    assert.equal(wordsOverNotices([{ x: 200, y: 300, width: 60, height: 50 }], notices), false);
    assert.equal(wordsOverNotices([], notices), false);
    assert.equal(wordsOverNotices([{ x: 200, y: 230, width: 60, height: 50 }], []), false);
  });

  it('game.js: each quoin burst is tracked and joins speech in fading the notices', () => {
    const src = readFileSync(join(root, 'public', 'game.js'), 'utf8');
    assert.match(src, /quoinGotNodes\.push\(drawn\.node\)/);
    assert.match(src, /notifyView\?\.setUnderSpeech\(speechBubbles\.some\(\(b\) => b\._speechFx\?\.overNotices\) \|\| quoinGotOverNotices\(\)\)/);
    assert.match(src, /wordsOverNotices\(quoinGotNodes\.map\(\(n\) => n\.getBounds\(\)\), notifyZoneGlobalBoxes\(\)\)/);
  });
});
