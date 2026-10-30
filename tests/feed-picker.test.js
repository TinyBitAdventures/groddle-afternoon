import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getVerbsFor, runVerb } from '../public/content.js?v=e2372a6b';
import { createAnimalState, listAnimalFeedOptions } from '../public/js/animals.js?v=e857d0af';

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
    const pigFeed = getVerbsFor(piggy, { pc: player(), inv: { plank: 3 } }).find((verb) => verb.id === 'feed');
    assert.equal(pigFeed.enabled, false);
    assert.match(pigFeed.reason, /don't have anything/i);
  });

  it('chickens have no Feed (npc_chicken.js has no feed verb; Austin, desk FEED, G280)', () => {
    const chicken = { classId: 'npc_chicken', state: createAnimalState('npc_chicken') };
    const verbs = getVerbsFor(chicken, { pc: player(), inv: { grain: 4, corn: 1 } });
    assert.equal(verbs.some((verb) => verb.id === 'feed' || verb.id.startsWith('feed:')), false);
    const inv = { grain: 4, corn: 1 };
    const result = runVerb(chicken, 'feed:corn', { pc: player(), inv });
    assert.notEqual(result?.ok, true);
    assert.deepEqual(inv, { grain: 4, corn: 1 });
  });

  it('builds a stable eligible-item model and consumes only the chosen stack', () => {
    const inv = { apple: 2, grain: 4, corn: 1, meat: 9 };
    const options = listAnimalFeedOptions('npc_piggy', inv).map((food) => food.classTsid);
    assert.deepEqual(options.slice(0, 3), ['apple', 'grain', 'corn']);
    const target = { classId: 'npc_piggy', state: createAnimalState('npc_piggy') };
    const result = runVerb(target, 'feed:corn', { pc: player(), inv });
    assert.equal(result.ok, true);
    assert.equal(inv.corn, 0);
    assert.equal(inv.grain, 4);
    assert.equal(inv.meat, 9);
  });

  it('ships the compact Feed what dialog with item-grid semantics', () => {
    const html = readFileSync(join(publicDir, 'play/index.html'), 'utf8');
    const css = readFileSync(join(publicDir, 'style.css'), 'utf8');
    assert.match(html, /id="feed-picker"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(html, /id="feed-picker-title"[^>]*>Feed what\?</);
    assert.match(html, /id="feed-picker-grid"[^>]*role="listbox"/);
    assert.match(css, /\.feed-picker-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4/);
    assert.match(css, /\.feed-picker-choice\.is-selected/);
  });

  it('wires mouse, keyboard, exact item ids, timing, and deterministic QA state', () => {
    const game = readFileSync(join(publicDir, 'game.js'), 'utf8');
    assert.match(game, /function openFeedPicker\(target, verb = null, pick = ''\)/);
    assert.match(game, /if \(pick\) return chooseFeedPickerItem\(pick\);/);
    assert.match(game, /listAnimalFeedOptions\(target\.classId, inv\)/);
    assert.match(game, /id: counted \? `\$\{verbId\}:\$\{classTsid\}:\$\{count\}` : `\$\{verbId\}:\$\{classTsid\}`/);
    assert.match(game, /ArrowLeft'[\s\S]*ArrowRight'[\s\S]*ArrowUp'[\s\S]*ArrowDown'/);
    assert.match(game, /e\.key === 'Enter' \|\| e\.key === ' '/);
    assert.match(game, /chooseFeedPickerItem\(selected\.dataset\.food\)/);
    assert.match(game, /dataset\.feedPickerOptions/);
    assert.match(game, /dataset\.feedPickerResult = result\.ok \? 'success' : 'failed'/);
    // VERBS: Feed (and every picker verb) is the verb menu's second level of the stacks it takes.
    assert.match(game, /const picks = v\.id === 'feed' \|\| Boolean\(v\.picker\);/);
    assert.match(game, /if \(picks\) openVerbPickLevel\(target, v, e\.currentTarget\);/);
    assert.match(game, /openFeedPicker\(target, level\.verb, food\.classTsid\);/);
  });
});
