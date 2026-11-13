/**
 * Player report 37 (2026-11-02, Windows Chrome, 1536x702): in quest places "a big explanation
 * rectangle at the top blocks some of the picture, and blocks the top of menus that come from my
 * items". On Storyland a narration notice also peeked out under the card (Austin, 2000x1336).
 *
 * The original had no such card (GSJS players/inc_instances.js 317-357: an "Are you stuck?" prompt
 * after the instance's exit_delay; timed rooms drew bare overlay_counter text, quests/letter_block_3.js
 * 260-332). The remake keeps its clock, progress and Leave on one line in the street nameplate's place
 * (js/quest-plate.js, features/quest-plate-feature.js); the step or story line shows once as a caption
 * under it; the pill opens the room's card; every menu sits over all of it.
 * Run: node --test tests/quest-plate.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTokens } from './css-tokens.js';

import { DOT_DONE, QUEST_PLATE_CARDS, captionMs, compactCount, dotCount, nextCaption, tidy } from '../public/js/quest-plate.js?v=a0240f13';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const markup = read('public/play/index.html');
const qi = read('public/js/features/quest-instances-feature.js');
const feature = read('public/js/features/quest-plate-feature.js');
const css = resolveTokens(read('public/style.css'));
const classic = read('public/css/classic.css');
const game = read('public/game.js');

/** The markup of a card: index.html's section, or the quest rooms' bar (quest-instances-feature buildChrome). */
function cardMarkup(id) {
  if (id === 'quest-instance-hud') return qi.slice(qi.indexOf("const bar = el('section', { id: 'quest-instance-hud'"), qi.indexOf('host.appendChild(bar);'));
  const at = markup.indexOf(`<section id="${id}"`);
  assert.ok(at >= 0, `${id} in play/index.html`);
  return markup.slice(at, markup.indexOf('</section>', at));
}

/** The first `sel {` rule's z-index in the resolved sheet. */
function z(sel, sheet = css) {
  for (let at = sheet.indexOf(`${sel} {`); at >= 0; at = sheet.indexOf(`${sel} {`, at + 1)) {
    const m = sheet.slice(at, sheet.indexOf('}', at)).match(/z-index: (-?\d+)/);
    if (m) return Number(m[1]);
  }
  return assert.fail(`${sel} has no z-index`);
}

describe('37: the quest pill and its caption', () => {
  it('captions stay longer for longer text, 3.5 to 10 seconds', () => {
    assert.equal(captionMs('Go.'), 3500);
    assert.ok(captionMs('Act V: press its Wall Button (1/3).') > 3500);
    assert.ok(captionMs('After seeing what joy sharing the stars brought, the greedy street spirit was greedy no more.') > captionMs('Act V: press its Wall Button (1/3).'));
    assert.equal(captionMs('x'.repeat(400)), 10000);
  });

  it('counts are compact in the pill', () => {
    assert.equal(compactCount('0 / 12', 'motes'), '0/12 motes');
    assert.equal(compactCount('0/6 WORDS'), '0/6 words');
    assert.equal(compactCount('  3 / 15 moments '), '3/15 moments');
    assert.equal(compactCount(''), '');
    assert.equal(tidy(' a \n b '), 'a b');
  });

  it('progress dots count the done ones', () => {
    assert.deepEqual(dotCount([{ classes: ['is-done'] }, { classes: [] }, { classes: ['x', DOT_DONE[0]] }]), { done: 2, total: 3 });
  });

  it('one caption at a time: the step when it changes, else the story line; the step on arrival', () => {
    assert.equal(nextCaption(null, { step: 'Follow the bird.', line: '' }, { first: true }), 'Follow the bird.');
    assert.equal(nextCaption({ step: 'A', line: 'x' }, { step: 'A', line: 'x' }), '');
    assert.equal(nextCaption({ step: 'A', line: 'x' }, { step: 'B', line: 'y' }), 'B');
    assert.equal(nextCaption({ step: 'A', line: 'x' }, { step: 'A', line: 'y' }), 'y');
  });

  it('every card it folds has the parts it reads', () => {
    const attr = (sel) => {
      const id = sel.match(/#([\w-]+)/);
      if (id) return `id="${id[1]}"`;
      const data = sel.match(/\[([\w-]+)\]/);
      if (data) return data[1];
      const cls = sel.match(/\.([\w-]+)/);
      return cls[1];
    };
    for (const cfg of QUEST_PLATE_CARDS) {
      const html = cardMarkup(cfg.id);
      for (const part of ['title', 'stage', 'icon', 'timer', 'leave', 'step', 'line', 'count', 'progress', 'dots']) {
        if (!cfg[part]) continue;
        assert.ok(html.includes(attr(cfg[part])), `${cfg.id} ${part} ${cfg[part]}`);
      }
      assert.ok(cfg.title && cfg.leave && cfg.step, `${cfg.id} names its title, Leave and step`);
    }
  });

  it('the timed games keep their own boards (the original showed race scores the whole time)', () => {
    const ids = QUEST_PLATE_CARDS.map((c) => c.id);
    for (const id of ['race-hud', 'hog-haul-hud', 'hog-mp-hud', 'crowns-hud', 'mayhem-hud']) assert.ok(!ids.includes(id), id);
  });

  it('menus, tooltips and windows sit over the pill, its caption, the opened card and the rooms\' card', () => {
    const quest = z('.quest-caption');
    assert.equal(quest, Number(resolveTokens('var(--z-quest-hud)')));
    assert.ok(quest < z('.pack-popover'), 'the pack popover');
    assert.ok(quest < Number(resolveTokens('var(--z-panel)')), 'panels and the pack');
    assert.ok(quest < Number(resolveTokens('var(--z-notice)')), 'the verb menu, tooltips');
    assert.match(read('public/style.css'), /#game-root \.qp-card\.qp-open \{[^}]*z-index: var\(--z-quest-hud\) !important;/);
    assert.match(read('public/style.css'), /#game-root \.qp-card:not\(\.qp-open\) \{ display: none !important; \}/);
    // The rooms' card itself (when the nameplate is hidden and it stays) is on the same layer, no longer --z-dialog + 9.
    assert.match(qi, /\.qi-hud\{position:absolute;z-index:var\(--z-quest-hud\);/);
    // Its renderHud keeps the pill's classes.
    assert.match(qi, /\['qp-card', 'qp-open'\]\.filter\(\(c\) => hud\.bar\.classList\.contains\(c\)\)/);
  });

  it('the pill is the nameplate: same place, its street parts step aside; Classic keeps "Current location"', () => {
    assert.match(read('public/style.css'), /\.street-nameplate\.is-quest > :not\(\.quest-plate\) \{ display: none !important; \}/);
    assert.match(feature, /getElementById\('street-nameplate'\)/);
    assert.match(classic, /\.street-nameplate\.is-quest > #street-name \{ display: block !important; \}/);
    assert.match(classic, /\.street-nameplate\.is-quest > \.quest-plate:not\(\[hidden\]\) \{\n  display: flex !important;\n  position: fixed;/);
  });

  it('Escape and a click elsewhere close the opened card; Leave is the card\'s own', () => {
    assert.match(feature, /e\.key !== 'Escape'/);
    assert.match(feature, /addEventListener\('pointerdown'/);
    assert.match(feature, /adopted\.card\.querySelector\(adopted\.cfg\.leave\)/);
  });

  it('the caption waits under a conversation and keeps the notices under it', () => {
    assert.match(feature, /if \(modalUp\(\)\) \{/);
    assert.match(feature, /reserveZone\?\.\(CAPTION_ZONE, \{ left, top/);
  });

  it('Storyland: the act\'s line goes to the log, not a notice stacked under the pill', () => {
    assert.match(game, /notify\.log\(`\$\{GREEDY_ACTS\[result\.actIndex\]\.title\}: \$\{result\.line\}`\);/);
    assert.doesNotMatch(game, /pushActivity\(`\$\{GREEDY_ACTS\[result\.actIndex\]\.title\}: \$\{result\.line\}`\)/);
  });

  it('is a registered feature', () => {
    assert.match(read('public/js/features/index.js'), /import \{ questPlateFeature \} from '\.\/quest-plate-feature\.js\?v=[0-9a-f]{8}'; FEATURES\.push\(questPlateFeature\);/);
  });
});
