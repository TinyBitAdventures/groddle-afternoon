// Open panels that show pack counts follow the pack (player report 2026-11-01: the street
// project panel kept "you have 2 · Add 2" after two more Heavy Gas were made).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packStamp } from '../public/js/inventory.js?v=91ee49cd';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('pack stamp', () => {
  it('changes with any count, the currants or whole energy, and ignores empty slots', () => {
    const inv = { heavy_gas: 2, plank: 0, beryl: 50 };
    const pc = { currants: 414, energy: 41.6 };
    const a = packStamp(inv, pc);
    assert.equal(packStamp({ ...inv }, { ...pc }), a);
    assert.notEqual(packStamp({ ...inv, heavy_gas: 4 }, pc), a);
    assert.notEqual(packStamp({ ...inv, cherry: 1 }, pc), a);
    assert.equal(packStamp({ ...inv, cherry: 0 }, pc), a);
    assert.notEqual(packStamp(inv, { ...pc, currants: 400 }), a);
    assert.notEqual(packStamp(inv, { ...pc, energy: 26 }), a);
    assert.equal(packStamp(inv, { ...pc, energy: 41.1 }), a);
    assert.equal(typeof packStamp(null, null), 'string');
  });
});

describe('panels redraw when the pack changes', () => {
  const game = read('game.js');
  it('updateHud runs the refresher, which redraws Make, vendor, shrine and tells the features', () => {
    const hud = game.slice(game.indexOf('function updateHud() {'));
    assert.match(hud.slice(0, hud.indexOf('\nfunction ', 10)), /refreshPackPanels\(\);/);
    const fn = game.slice(game.indexOf('function refreshPackPanels()'), game.indexOf('function updateHud() {'));
    for (const re of [/renderMakePanel\(\)/, /renderVendorList\(\)/, /renderShrinePanel\(\)/, /features\.collect\('packChanged', engine\)/]) assert.match(fn, re);
    // Never mid-craft, over a Make result or under the caret.
    assert.match(fn, /!activeCraftSession/);
    assert.match(fn, /make-result/);
    assert.match(fn, /typingIn\('make-panel'\)/);
  });
  it('each panel keeps the stamp it was drawn with', () => {
    for (const [name, key] of [['renderMakePanel', 'make'], ['renderVendorList', 'vendor'], ['renderShrinePanel', 'shrine']]) {
      const body = game.slice(game.indexOf(`function ${name}()`), game.indexOf(`function ${name}()`) + 1200);
      assert.match(body, new RegExp(`packPanelStamps\\.${key} = packStamp\\(inv, pc\\)`), name);
    }
  });
  it('the street project panel redraws its rows on packChanged', () => {
    const src = read('js/features/street-jobs-feature.js');
    assert.match(src, /packChanged\(engine\) \{\s*if \(panel && !panel\.hidden\) renderPanel\(engine\);/);
  });
});
