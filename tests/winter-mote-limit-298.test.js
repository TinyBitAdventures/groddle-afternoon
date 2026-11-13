/**
 * #298 (G701): on Winter Walk at the daily quoin limit the motes refused without a word (as a
 * quoin does in Glitch, items/quoin.js 159) and the "0/15 motes" count looked broken. The rule
 * stays (Glitch's); the first mote refused in a walk says why, and the count says so beside it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WINTER_MOTE_LIMIT_NOTE,
  WINTER_MOTE_LIMIT_NOTICE,
  WINTER_MOTE_LIMIT_SHORT,
  createWinterWalkState,
  winterMoteCapped,
  winterMoteLimitNotice,
} from '../public/js/winter-walk.js?v=a5c63b75';
import { QUEST_PLATE_CARDS, compactCount } from '../public/js/quest-plate.js?v=a0240f13';
import { quoinLimitPrompt } from '../public/js/quoins.js?v=61be601c';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');
const markup = read('public/play/index.html');
const plate = read('public/js/features/quest-plate-feature.js');
const fn = (name) => {
  const at = game.indexOf(`function ${name}(`);
  assert.ok(at >= 0, name);
  return game.slice(at, game.indexOf('\n}\n', at));
};

describe('#298: Winter Walk motes at the daily quoin limit', () => {
  it('keeps Glitch\'s rule: iMG motes stop at the limit, a Qurazy does not', () => {
    const full = { collectedToday: 110, dailyLimit: 110 };
    assert.equal(winterMoteCapped('xp', full), true);
    assert.equal(winterMoteCapped('qurazy', full), false);
    assert.equal(winterMoteCapped('xp', { collectedToday: 109, dailyLimit: 110 }), false);
  });

  it('says why once per walk, in the limit prompt\'s own words', () => {
    const walk = createWinterWalkState({ now: 0 });
    assert.equal(winterMoteLimitNotice(walk), WINTER_MOTE_LIMIT_NOTICE);
    assert.equal(winterMoteLimitNotice(walk), '');
    assert.equal(winterMoteLimitNotice(createWinterWalkState({ now: 1 })), WINTER_MOTE_LIMIT_NOTICE);
    const limitWords = quoinLimitPrompt().text.replace(/^Wowza! /, '').replace(/\.$/, '');
    assert.ok(WINTER_MOTE_LIMIT_NOTICE.startsWith(limitWords), WINTER_MOTE_LIMIT_NOTICE);
    assert.doesNotMatch(WINTER_MOTE_LIMIT_NOTICE + WINTER_MOTE_LIMIT_NOTE, /—/);
  });

  it('the pickup shows the notice and still refuses', () => {
    const body = fn('collectWinterWalkMote');
    assert.match(body, /if \(winterMoteCapped\(entry\.kind, quoinState\)\) \{\s+const notice = winterMoteLimitNotice\(winterWalkState\);\s+if \(notice\) toast\(notice, \d+\);\s+return false;/);
  });

  it('the count says so beside it, on the card and in the pill', () => {
    const tag = /<p data-winter-mote-cap data-short="([^"]+)" hidden>([^<]+)<\/p>/.exec(markup);
    assert.ok(tag, 'the card holds the note, hidden until the limit');
    assert.equal(tag[1], WINTER_MOTE_LIMIT_SHORT);
    assert.equal(tag[2], WINTER_MOTE_LIMIT_NOTE);
    const hud = fn('renderWinterWalkHud');
    assert.match(hud, /winterMoteCapped\('mote', quoinState\) && progress\.collected < progress\.total/);
    const card = QUEST_PLATE_CARDS.find((c) => c.id === 'winter-walk-hud');
    assert.equal(card.countNote, '[data-winter-mote-cap]');
    assert.match(plate, /const short = note && !note\.hidden \? note\.dataset\.short \|\| '' : '';/);
    assert.match(plate, /compactCount\(read\(card, cfg\.count\)\?\.textContent, short \? '' : cfg\.unit\)/);
    assert.match(plate, /if \(html && short\) html \+= ` · \$\{escapeHtml\(short\)\}`;/);
    assert.equal(compactCount('0 / 15', card.unit), '0/15 motes');
    assert.equal(`${compactCount('0 / 15', '')} · ${WINTER_MOTE_LIMIT_SHORT}`, '0/15 · limit');
  });
});
