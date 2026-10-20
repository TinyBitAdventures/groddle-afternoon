import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getVerbsFor, runVerb } from '../public/content.js?v=feed-picker-test-1';
import { createAnimalState, listAnimalFeedOptions } from '../public/js/animals.js?v=feed-picker-test-1';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../public');

function player() {
  return { energy: 80, mood: 70, imagination: 0, xp: 0 };
}

describe('original-style target-item feed picker', () => {
  it('exposes one Feed verb instead of flattening every food into the verb list', () => {
    const target = { classId: 'npc_piggy', state: createAnimalState('npc_piggy') };
    const verbs = getVerbsFor(target, { pc: player(), inv: { apple: 2, grain: 3, bun: 1 } });
    const feeds = verbs.filter((verb) => verb.id === 'feed' || verb.id.startsWith('feed:'));
    assert.equal(feeds.length, 1);
    assert.equal(feeds[0].id, 'feed');
    assert.equal(feeds[0].enabled, true);
    assert.match(feeds[0].tooltip, /3 eligible pack items/);
  });

  it('keeps Feed visible but disabled when the pack has no eligible food', () => {
    const piggy = { classId: 'npc_piggy', state: createAnimalState('npc_piggy') };
    const chicken = { classId: 'npc_chicken', state: createAnimalState('npc_chicken') };
    const pigFeed = getVerbsFor(piggy, { pc: player(), inv: { meat: 3 } }).find((verb) => verb.id === 'feed');
    const chickenFeed = getVerbsFor(chicken, { pc: player(), inv: { apple: 2 } }).find((verb) => verb.id === 'feed');
    assert.equal(pigFeed.enabled, false);
    assert.match(pigFeed.reason, /don't have anything/i);
    assert.equal(chickenFeed.enabled, false);
  });

  it('builds a stable eligible-item model and consumes only the chosen stack', () => {
    const inv = { apple: 2, grain: 4, corn: 1, meat: 9 };
    assert.deepEqual(
      listAnimalFeedOptions('npc_chicken', inv).map((food) => food.classTsid),
      ['grain', 'corn']
    );
    const target = { classId: 'npc_chicken', state: createAnimalState('npc_chicken') };
    const result = runVerb(target, 'feed:corn', { pc: player(), inv });
    assert.equal(result.ok, true);
    assert.equal(inv.corn, 0);
    assert.equal(inv.grain, 4);
    assert.equal(inv.meat, 9);
  });

  it('ships the compact Feed what dialog with item-grid semantics', () => {
    const html = readFileSync(join(publicDir, 'index.html'), 'utf8');
    const css = readFileSync(join(publicDir, 'style.css'), 'utf8');
    assert.match(html, /id="feed-picker"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(html, /id="feed-picker-title"[^>]*>Feed what\?</);
    assert.match(html, /id="feed-picker-grid"[^>]*role="listbox"/);
    assert.match(css, /\.feed-picker-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4/);
    assert.match(css, /\.feed-picker-choice\.is-selected/);
  });

  it('wires mouse, keyboard, exact item ids, timing, and deterministic QA state', () => {
    const game = readFileSync(join(publicDir, 'game.js'), 'utf8');
    assert.match(game, /function openFeedPicker\(target\)/);
    assert.match(game, /listAnimalFeedOptions\(target\.classId, inv\)/);
    assert.match(game, /id: `feed:\$\{classTsid\}`/);
    assert.match(game, /ArrowLeft'[\s\S]*ArrowRight'[\s\S]*ArrowUp'[\s\S]*ArrowDown'/);
    assert.match(game, /e\.key === 'Enter' \|\| e\.key === ' '/);
    assert.match(game, /chooseFeedPickerItem\(selected\.dataset\.food\)/);
    assert.match(game, /dataset\.feedPickerOptions/);
    assert.match(game, /dataset\.feedPickerResult = result\.ok \? 'success' : 'failed'/);
    assert.match(game, /if \(v\.id === 'feed'\) openFeedPicker\(target\)/);
  });
});
