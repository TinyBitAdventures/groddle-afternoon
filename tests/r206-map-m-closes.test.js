/**
 * Report #206 follow-up (live, Dr Flavius): with the Map open, M blinked it shut and straight open
 * again. The Map's branch closed it on M (TSMainView.as mKeyHandler 733-741, toggleHubMapDialog),
 * then asked panelSwapOpener, which saw the Map shut and opened it. M (and G) now stop at the close;
 * another window's key still opens that window in the Map's place.
 * Run: node --test tests/r206-map-m-closes.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const game = readFileSync(join(import.meta.dirname, '..', 'public', 'game.js'), 'utf8');
const start = game.indexOf('    if (isMapOpen()) {\n      // G254: M closes it too');
const branch = game.slice(start, game.indexOf('\n    }\n', start) + 7);
const swapFn = game.slice(game.indexOf('function panelSwapOpener('), game.indexOf('function renderFeatPanel('));

/** Runs the Map's key branch against a fake Map and fake windows; returns what happened. */
function press(key) {
  const log = [];
  let mapOpen = true;
  const env = {
    isMapOpen: () => mapOpen,
    closeMap: () => { mapOpen = false; log.push('close'); },
    openMap: () => { mapOpen = true; log.push('open'); },
    openQuestPanel: () => log.push('quests'),
    isQuestOpen: () => false,
    isPlainKey: (e, k) => e.key === k || e.key === k.toUpperCase(),
    zoomKeyAction: () => null,
    mapZoom: null,
    keys: new Set(),
    document: { body: { classList: { contains: () => false } } },
  };
  const names = Object.keys(env);
  const body = `${swapFn}\nreturn function onKey(e) {\n${branch}\n};`;
  // Every other opener the swap names is a no-op here.
  const stubs = ['isAchieveOpen', 'openAchievePanel', 'isFeatOpen', 'openFeatPanel', 'isSkillsOpen', 'openSkillsPanel', 'isBuffsOpen', 'openBuffsPanel', 'isMakeOpen', 'openMakePanel', 'isProjectsOpen', 'features', 'engine'];
  const fn = new Function(...names, ...stubs, body)(...names.map((n) => env[n]), ...stubs.map(() => () => true));
  fn({ key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} });
  return { log, mapOpen };
}

describe('report #206: M closes the open Map and leaves it closed', () => {
  it('found the Map branch', () => {
    assert.ok(start > 0 && branch.includes('closeMap();'));
  });

  for (const key of ['m', 'M', 'g', 'G']) {
    it(`${key} closes it once`, () => {
      assert.deepEqual(press(key), { log: ['close'], mapOpen: false });
    });
  }

  it('Q still opens the Quests in its place', () => {
    assert.deepEqual(press('q').log, ['quests']);
  });
});
