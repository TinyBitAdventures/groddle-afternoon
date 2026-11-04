import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getVerbsFor, runVerb } from '../public/content.js?v=1b8245ab';
import { createAnimalState, listAnimalFeedOptions } from '../public/js/animals.js?v=4ffbf838';
import { makePickTile, pickGridCols, pickGridStep } from '../public/js/ui/verb-menu.js?v=6cc4df84';

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

  // Player report 2026-11-02: the verb menu's Feed what? was a text list, and How many's Back
  // showed the panel's picture grid instead. The original drew the target items as pictures in
  // the interaction menu (InteractionMenu.as 425-436, 474-610) and its count step in the same menu.
  it('lays the picture level out as the original did (one row up to 7, then a grid)', () => {
    assert.deepEqual([1, 3, 7, 8, 11, 16, 30].map(pickGridCols), [1, 3, 7, 6, 7, 8, 9]);
    // 11 tiles in 7 columns: rows 0-6 and 7-10.
    assert.equal(pickGridStep(0, 11, 7, 'right'), 1);
    assert.equal(pickGridStep(6, 11, 7, 'right'), 0, 'right at the row end wraps to its start');
    assert.equal(pickGridStep(10, 11, 7, 'right'), 7, 'right past the last tile wraps to the last row start');
    assert.equal(pickGridStep(0, 11, 7, 'left'), 6, 'left at the row start wraps to its end');
    assert.equal(pickGridStep(7, 11, 7, 'left'), 10, 'a short last row wraps to its own last tile');
    assert.equal(pickGridStep(2, 11, 7, 'down'), 9);
    assert.equal(pickGridStep(5, 11, 7, 'down'), -1, 'no tile under it: Back');
    assert.equal(pickGridStep(9, 11, 7, 'up'), 2);
    assert.equal(pickGridStep(3, 11, 7, 'up'), -1, 'up off the top row: Back');
  });

  it('draws a choice as its picture with the pack count, the name for the tooltip and screen readers', () => {
    const el = () => ({ dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; } });
    const doc = { createElement: () => el() };
    const tile = makePickTile(doc, { key: '2', label: 'Grain', have: 15, icon: 'assets/sprites/icons/grain.png', food: 'grain', verb: 'feed:grain', verbLabel: 'Feed' });
    assert.match(tile.className, /\bvm-row\b/);
    assert.match(tile.className, /\bvm-pick\b/);
    assert.equal(tile.title, 'Grain');
    assert.equal(tile.getAttribute('aria-label'), 'Feed Grain, 15 in your pack');
    assert.equal(tile.dataset.vmTip, 'Grain (you have 15)', 'the client desc line, InteractionMenu.as 1906-1916');
    assert.equal(tile.dataset.food, 'grain');
    assert.equal(tile.dataset.verb, 'feed:grain');
    assert.match(tile.innerHTML, /<img class="vm-pick-icon" src="assets\/sprites\/icons\/grain\.png" alt=""/);
    assert.match(tile.innerHTML, /<span class="count" aria-hidden="true">15<\/span>/);
    assert.doesNotMatch(tile.innerHTML, /Grain/, 'no name drawn on the button (label = \'\')');
    const one = makePickTile(doc, { label: 'Apple', have: 1, icon: 'a.png' });
    assert.doesNotMatch(one.innerHTML, /class="count"/, 'one of a thing shows no count, as in the pack');
    assert.match(one.className, /is-single/);
  });

  it('the verb menu level draws pictures, and How many Back returns to it', () => {
    const game = readFileSync(join(publicDir, 'game.js'), 'utf8');
    const css = readFileSync(join(publicDir, 'style.css'), 'utf8');
    const classic = readFileSync(join(publicDir, 'css/classic.css'), 'utf8');
    assert.match(game, /const tile = makePickTile\(document, \{/);
    assert.match(game, /grid\.className = 'vm-picks';/);
    assert.doesNotMatch(game, /count: `×\$\{food\.have\}`/, 'no text row per food any more');
    // Back from How many: the picked-in-the-menu case goes back to the menu's pictures.
    assert.match(game, /feedPickerFromMenu = pick \? \(verb \|\| \{ id: verbId \}\) : null;/);
    assert.match(game, /getElementById\('feed-picker-qty-back'\)\?\.addEventListener\('click', \(\) => feedPickerQtyBack\(\)\)/);
    assert.match(game, /activeElement\?\.id === 'feed-picker-qty-back'\) feedPickerQtyBack\(\);/);
    assert.match(game, /function feedPickerQtyBack\(\) \{[\s\S]*?closeFeedPicker\('back'\);[\s\S]*?backToVerbPickLevel\(target, verb, food\)/);
    assert.match(game, /function backToVerbPickLevel\(target, verb, food\) \{[\s\S]*?openVerbPickLevel\(target, verb, null, food\)/);
    // engine.openPicker (a pack baby's Feed, the husbandry demos) still opens the panel's own grid.
    assert.match(game, /openPicker: \(target, verb\) => openFeedPicker\(target, verb\),/);
    // Both skins draw the tiles.
    assert.match(css, /\[data-ui="modern"\] #verb-menu \.vm-picks \{[\s\S]*?grid-template-columns: repeat\(var\(--vm-pick-cols, 4\), 50px\)/);
    assert.match(css, /\[data-ui="modern"\] #verb-menu \.vm-row\.vm-pick \{/);
    assert.match(classic, /:root\[data-ui="classic"\] #verb-menu \.vm-picks \{[\s\S]*?repeat\(var\(--vm-pick-cols, 4\), calc\(50 \* var\(--cu\)\)\)/);
    assert.match(classic, /:root\[data-ui="classic"\] #verb-menu \.verb-choice\.vm-pick \{/);
  });
});
