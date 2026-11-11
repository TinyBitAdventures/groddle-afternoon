/**
 * Report #206: with one window open (Make, Quests, the Map...), another window's key opens it in
 * that one's place, as its top-bar button does (TSMainView.as 733-870: each key toggled its own
 * dialog whatever else was open). A window's own key still closes it, and a modal panel keeps its keys.
 * Run: node --test tests/r206-panel-swap-keys.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const game = readFileSync(join(import.meta.dirname, '..', 'public', 'game.js'), 'utf8');
const fn = game.slice(game.indexOf('function panelSwapOpener('), game.indexOf('function renderFeatPanel('));

describe('report #206: window keys swap windows', () => {
  it('maps each window key to its opener, never the window already open', () => {
    for (const [key, open, opener] of [
      ["isPlainKey\\(e, 'm'\\)\\) && !isMapOpen\\(\\)", '', 'openMap\\(\\)'],
      ["\\(e\\.key === 'q' \\|\\| e\\.key === 'Q'\\) && !isQuestOpen\\(\\)", '', 'openQuestPanel\\(\\)'],
      ["\\(e\\.key === 'b' \\|\\| e\\.key === 'B'\\) && !isAchieveOpen\\(\\)", '', 'openAchievePanel\\(\\)'],
      ["\\(e\\.key === 'h' \\|\\| e\\.key === 'H'\\) && !isFeatOpen\\(\\)", '', 'openFeatPanel\\(\\)'],
      ["isPlainKey\\(e, 'k'\\) && !isSkillsOpen\\(\\)", '', 'openSkillsPanel\\(\\)'],
      ["\\(e\\.key === 'y' \\|\\| e\\.key === 'Y'\\) && !isBuffsOpen\\(\\)", '', 'openBuffsPanel\\(\\)'],
      ["isPlainKey\\(e, 'n'\\) && !isMakeOpen\\(\\)", '', 'openMakePanel\\(\\)'],
      ["isPlainKey\\(e, 'p'\\) && !isProjectsOpen\\(\\)", '', "features\\.query\\('projectsPanel', 'open', engine\\)"],
    ]) {
      assert.match(fn, new RegExp(`${key}${open}[\\s\\S]{0,140}${opener}`));
    }
    assert.match(fn, /if \(e\.repeat \|\| e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) return null;/);
  });

  it('runs from the Map and from a side sheet or store, not from a modal panel', () => {
    assert.match(game, /const swapFromMap = panelSwapOpener\(e\);\s*if \(swapFromMap\) \{\s*e\.preventDefault\(\);\s*keys\.delete\(e\.key\);\s*swapFromMap\(\);\s*\}\s*return;/);
    assert.match(game, /const swapTo = isMailboxOpen\(\) \|\| isHomePanelOpen\(\) \|\| isGardenOpen\(\) \|\| isAvatarOpen\(\) \|\| isShrineOpen\(\) \? null : panelSwapOpener\(e\);\s*if \(swapTo\) \{[\s\S]{0,80}swapTo\(\);\s*return;\s*\}\s*if \(e\.key === 'q' \|\| e\.key === 'Q'\) closeQuestPanel\(\);/);
  });
});
