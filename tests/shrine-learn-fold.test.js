/**
 * #377 (Austin 2026-11-15): the shrine's Learn Faster? box folds. Closed it is one line, its title and
 * the favor it would spend.
 * #565 (G1080 item 4): whether it opens unfolded follows Glitch: "check favor" opened ShrineDialog,
 * whose spend section was the window; "donate" opened ShrineDonateDialog, which had none. So it opens
 * unfolded from check favor and folded from donate (a phone the same); the player's fold holds while
 * the window is open, and nothing is kept past it.
 * Run: node --test tests/shrine-learn-fold.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { learnFasterOpen, learnFasterSummary } from '../public/js/shrines.js?v=4ff3e019';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const GSJS = join(PUBLIC, '../../glitch-GameServerJS');
const CLIENT = join(PUBLIC, '../../glitch-client/com/tinyspeck/engine/port');

describe('#377 the Learn Faster fold', () => {
  it('opens unfolded from check favor, folded from donate or a dropped item (#565, as Glitch)', () => {
    assert.equal(learnFasterOpen({ via: 'check_favor' }), true);
    assert.equal(learnFasterOpen({ via: 'donate_to' }), false);
    assert.equal(learnFasterOpen({ via: '' }), false);
    assert.equal(learnFasterOpen(), false);
    // #377 (Austin's ruling): on a phone it starts folded whatever the verb, check favor included.
    assert.equal(learnFasterOpen({ via: 'check_favor', phone: true }), false);
    assert.equal(learnFasterOpen({ via: 'donate_to', phone: true }), false);
    assert.equal(learnFasterOpen({ via: 'check_favor', phone: false }), true);
    if (existsSync(GSJS)) {
      const shrine = readFileSync(join(GSJS, 'items/npc_shrine_mab.js'), 'utf8');
      assert.match(shrine, /verbs\.check_favor = \{[\s\S]*?"tooltip"\s*: "View & spend favor points"/);
    }
    if (existsSync(CLIENT)) {
      assert.doesNotMatch(readFileSync(join(CLIENT, 'ShrineDonateDialog.as'), 'utf8'), /spend_bt|speed_up/, 'the donate window had no spend');
      assert.match(readFileSync(join(CLIENT, 'ShrineDialog.as'), 'utf8'), /spend_bt\.label = 'Spend '\+spend_points\+' favor points'/);
    }
  });

  it('sums up the favor it would spend, or why not, in a few words', () => {
    assert.equal(learnFasterSummary({ ok: true, spendPoints: 250 }), 'Spend 250 favor');
    assert.equal(learnFasterSummary({ ok: false, reason: 'not_learning' }), 'Not learning a skill');
    assert.equal(learnFasterSummary({ ok: false, reason: 'no_favor' }), 'No favor yet');
    assert.equal(learnFasterSummary({ ok: false, reason: 'max_acceleration' }), 'Learning at full speed');
    assert.equal(learnFasterSummary({ ok: false, reason: 'unknown_giant' }), "Can't spend now");
  });

  it('the shrine panel draws the toggle; the verb sets it and the fold holds only while the window is open', () => {
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function renderShrineLearnFaster('), game.indexOf('function confirmShrineFavorSpend('));
    assert.match(fn, /const open = shrineLearnOpen;/);
    assert.match(fn, /shrineLearnOpen = next;/);
    assert.match(fn, /data-shrine-learn-toggle/);
    assert.match(fn, /aria-expanded="\$\{open\}"/);
    assert.doesNotMatch(game, /learn-faster-pref|sessionStorage[^\n]*learnFaster/);
    assert.ok(!existsSync(join(PUBLIC, 'js/ui/learn-faster-pref.js')));
    assert.match(game, /openShrinePanel\(target, \{ via: verbId \}\);/);
    assert.match(game, /shrineLearnOpen = learnFasterOpen\(\{ via, phone: TOUCH_PHONE \}\);/);
    // Back from the spend's confirm (cancelled, failed or done) it opens on the spend again.
    assert.equal((game.match(/openShrinePanel\(target, \{ via: 'check_favor' \}\)/g) || []).length, 3);
    const css = readFileSync(join(PUBLIC, 'style.css'), 'utf8');
    assert.match(css, /\.shrine-learn\[data-collapsed\] > :not\(\.shrine-learn-head\) \{ display: none; \}/);
    assert.match(css, /\.shrine-learn:not\(\[data-collapsed\]\) \.shrine-learn-sum \{ display: none; \}/);
  });
});
