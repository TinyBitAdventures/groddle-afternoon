// Open panels that show pack counts follow the pack (player report 2026-11-01: the street
// project panel kept "you have 2 · Add 2" after two more Heavy Gas were made).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packStamp } from '../public/js/inventory.js?v=2bd5b93e';
import { bindToolInventory, createToolConditionState, getToolCondition, repairToolCondition, setToolRemaining, useToolCondition } from '../public/js/tools.js?v=5f482998';
import { createPackRow } from '../public/js/ui/pack-row.js?v=64e4a567';
import { FakeEl, page } from './social-fake-dom.js';

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

  it('changes with a tool\'s wear, a break and a repair, though no count moves (Austin 2026-11-01)', () => {
    const inv = { hoe: 2, plank: 3 };
    const pc = { currants: 10, energy: 90 };
    const tools = bindToolInventory(createToolConditionState(), inv);
    getToolCondition(tools, 'hoe');
    const fresh = packStamp(inv, pc, tools);
    useToolCondition(tools, 'hoe', 1);
    const worn = packStamp(inv, pc, tools);
    assert.notEqual(worn, fresh);
    setToolRemaining(tools, 'hoe', 0, { copy: 1 });
    assert.notEqual(packStamp(inv, pc, tools), worn, 'the second hoe breaking');
    setToolRemaining(tools, 'hoe', 50, { copy: 0 });
    setToolRemaining(tools, 'hoe', 50, { copy: 1 });
    assert.equal(packStamp(inv, pc, tools), fresh, 'repaired back to new');
    assert.equal(packStamp(inv, pc, null), packStamp(inv, pc), 'no tool state, counts only');
  });
});

describe('the open bag follows a repair (Austin 2026-11-01: its wear bar changed only after a close and open)', () => {
  const game = read('game.js');
  const fnSrc = (name) => {
    const at = game.indexOf(`function ${name}(`);
    return game.slice(at, game.indexOf('\n}\n', at) + 2);
  };
  // game.js packRowSignature, run with the real wear (js/tools.js).
  const signatureWith = (toolState) => new Function('getToolCondition', 'toolState', 'packNamed',
    `${fnSrc('packRowSignature')}\nreturn packRowSignature;`)(getToolCondition, toolState, () => null);

  it('the tray is keyed on its stacks\' own row signature and draws the same entries', () => {
    const fn = fnSrc('renderOpenBagRow');
    assert.match(fn, /sig: JSON\.stringify\(\[box\.key, box\.label, box\.capacity, packRowSignature\(entries, rowOpts\)\]\)/);
    assert.match(fn, /if \(tray\?\.slots\) renderPackRow\(tray\.slots, entries, rowOpts\);/);
    // The row signature carries each tool's wear and break.
    assert.match(fnSrc('packRowSignature'), /c\.tracked \? \[c\.remaining, c\.broken\] : 0/);
  });

  it('a repair, a use and a break with the bag open redraw its tray; nothing else does', () => {
    const inv = { hoe: 1, cherry: 4, tinkertool: 1 };
    const tools = bindToolInventory(createToolConditionState(), inv);
    setToolRemaining(tools, 'hoe', 3);
    const packRowSignature = signatureWith(tools);
    const rowOpts = { emptyCount: 14, fillEmpty: true, ghost: true, container: 'bag_bigger_gray' };
    const entries = [
      { classTsid: 'cherry', count: 4, container: 'bag_bigger_gray', index: 0, icon: 'cherry.webp' },
      { classTsid: 'hoe', count: 1, container: 'bag_bigger_gray', index: 1, icon: 'hoe.webp', isTool: true, copy: 0 },
    ];
    const { doc } = page();
    const band = new FakeEl('div');
    band.id = 'pack-bar';
    band.insertBefore = (n) => band.append(n);
    doc.body.append(band);
    const row = createPackRow({ document: doc });
    const tray = () => row.drawTray({ key: 'bag_bigger_gray', label: 'Bigger Gray Bag', icon: '', used: 2, capacity: 16, cells: 3,
      sig: JSON.stringify(['bag_bigger_gray', 'Bigger Gray Bag', 16, packRowSignature(entries, rowOpts)]) });
    assert.ok(tray().slots, 'opening draws it');
    assert.equal(tray().slots, null, 'the same stacks keep it as it is');
    const repaired = repairToolCondition(tools, 'hoe', { energy: 100 }, { learned: ['tinkering_1'], hasTinkertool: true });
    assert.equal(repaired.ok, true, repaired.msg);
    assert.equal(getToolCondition(tools, 'hoe').remaining, 50);
    assert.ok(tray().slots, 'the repair redraws it');
    assert.equal(tray().slots, null);
    useToolCondition(tools, 'hoe', 1);
    assert.ok(tray().slots, 'a use with the bag open redraws it');
    setToolRemaining(tools, 'hoe', 0);
    assert.ok(tray().slots, 'a break redraws it');
    assert.equal(tray().slots, null);
  });

  it('a stack being dragged keeps its button: the pack waits for the drop or the drag\'s end', () => {
    const bar = fnSrc('renderPackBar');
    assert.match(bar, /if \(packDrag \|\| vendorDragTsid\) \{\s+packBarHeld = true;\s+return;/);
    assert.match(game, /if \(packBarHeld\) renderPackBar\(\);\n      \}\);/);
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
    // One stamp for every panel, with the tools' wear in it.
    assert.match(fn, /const stamp = packStamp\(inv, pc, toolState\);/);
  });
  it('each panel keeps the stamp it was drawn with', () => {
    for (const [name, key] of [['renderMakePanel', 'make'], ['renderVendorList', 'vendor'], ['renderShrinePanel', 'shrine']]) {
      const body = game.slice(game.indexOf(`function ${name}()`), game.indexOf(`function ${name}()`) + 1200);
      assert.match(body, new RegExp(`packPanelStamps\\.${key} = packStamp\\(inv, pc, toolState\\)`), name);
    }
  });
  it('the street project panel redraws its rows on packChanged', () => {
    const src = read('js/features/street-jobs-feature.js');
    assert.match(src, /packChanged\(engine\) \{\s*if \(panel && !panel\.hidden\) renderPanel\(engine\);/);
  });
});
