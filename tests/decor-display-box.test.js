/**
 * DECOPOLISH (Austin 2026-11-02, Decoration Mode): "Doesn't look like I can place items on these
 * storage boxes." Things dragged onto his two wall Storage Display Boxes fell to the floor under them.
 *
 * The original (GSJS items/bag_furniture_sdb.js, glitch-client):
 * - nothing rests on a box: getFurnitureBaseGeo 1033-1041 returns plats null, and none of its 47
 *   styles in catalog_furniture has a plat;
 * - it shows one kind of thing inside it (getExtraConfig 909-930: the class's iconic state 34 px
 *   wide, centred 26 px over the stage bottom), stocked by verbs.deposit 610-800, a drop target
 *   (is_drop_target, drop_tip "Deposit", drop_ok_code: not a bag, a trophy, furniture or no_bag,
 *   and its own kind or an empty box), from the pack or from the room (valid_items 668-708);
 * - the client kept drops onto boxes in Decoration Mode (DragVO.as findDragTargetForStack 133-138).
 *
 * Run: node --test tests/decor-display-box.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHomeDecorState, DISPLAY_TEXT, displayDeposit, displayRefusal, surfaceHeight } from '../public/js/home-decor.js?v=06be9c65';
import { FURNITURE_UPGRADES } from '../public/js/furniture-upgrades-data.js?v=ced89b64';
import { basePlats } from '../tools/furniture-upgrades/build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const homes = read('public/js/features/homes-feature.js');

function room() {
  const state = createHomeDecorState({});
  state.placed.length = 0;
  state.placed.push(
    { id: 8, classTsid: 'bag_furniture_sdb', slot: 'wall', x: 767, y: 524, facingRight: true, z: 8, on: null },
    { id: 9, classTsid: 'bag_furniture_sdb', slot: 'wall', x: 848, y: 525, facingRight: true, z: 9, on: null },
  );
  return state;
}

describe('a Storage Display Box takes things, as the original did', () => {
  it('nothing rests on top of one: no plats in the source, no surface here', () => {
    const gsjs = join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS/items/bag_furniture_sdb.js');
    let src = '';
    try {
      src = readFileSync(gsjs, 'utf8');
    } catch {}
    if (src) {
      assert.match(src, /function getFurnitureBaseGeo\(\)[\s\S]{0,200}'plats': null,/);
      assert.equal(basePlats('bag_furniture_sdb'), null);
      assert.match(src, /"drop_tip"\t\t\t: "Deposit"/);
    }
    assert.equal(surfaceHeight('bag_furniture_sdb'), 0);
    for (const row of Object.values(FURNITURE_UPGRADES.bag_furniture_sdb.upgrades)) assert.equal(row.platY, undefined, row.name);
  });

  it('takes its own kind or anything into an empty box; refuses furniture, bags, tools and quest things', () => {
    const state = room();
    const [a, b] = state.placed;
    assert.equal(displayRefusal(a, 'plain_bubble'), null);
    const inv = { plain_bubble: 4, grain: 6 };
    assert.deepEqual(displayDeposit(state, inv, 8, 'plain_bubble', 4).display, { classTsid: 'plain_bubble', count: 4 });
    assert.equal(inv.plain_bubble, 0);
    assert.deepEqual(displayRefusal(a, 'grain'), { reason: 'other_class', msg: DISPLAY_TEXT.otherClass });
    assert.equal(displayDeposit(state, inv, 8, 'grain', 6).reason, 'other_class');
    assert.equal(inv.grain, 6, 'a refusal takes nothing');
    assert.equal(displayRefusal(b, 'grain'), null);
    for (const meta of [{ tool: true }, { bag: true }, { blocked: true }]) assert.equal(displayRefusal(b, 'grain', meta).reason, 'bad_item');
    assert.equal(displayRefusal(b, 'furniture_chair').reason, 'bad_item');
    assert.equal(displayRefusal({ classTsid: 'furniture_shelf' }, 'grain').reason, 'not_box');
    assert.doesNotMatch(`${DISPLAY_TEXT.dropTip}${DISPLAY_TEXT.otherClass}${DISPLAY_TEXT.badItem}`, /—|Glitch/);
  });

  it('in Decoration Mode a pack stack dropped on a box goes in it, lit while it is over the box', () => {
    const wire = homes.slice(homes.indexOf('function wirePackDrag('), homes.indexOf('function startPackDrag('));
    const over = wire.slice(wire.indexOf("canvas.addEventListener('dragover'"), wire.indexOf("canvas.addEventListener('dragleave'"));
    assert.match(over, /const hit = displayDropAt\(toRoom\(worldPoint\(engine, e\)\), packDrag\.classTsid\);\s+drawDisplayTarget\(engine, hit\);\s+drawPackMarker\(engine, hit \? null : packDropTarget\(engine, e\)\);/);
    const drop = wire.slice(wire.indexOf("canvas.addEventListener('drop'"), wire.indexOf("document.addEventListener('dragend'"));
    assert.match(drop, /if \(hit\) \{[\s\S]{0,80}const res = depositInBox\(engine, hit\.box, was\.classTsid, was\.count\);/);
    assert.ok(drop.indexOf('depositInBox') < drop.indexOf('dropPackStackAt'), 'the box before the floor under it');
    assert.match(homes, /const tip = new PIXI\.Text\(\{ text: ok \? DISPLAY_TEXT\.dropTip : hit\.refusal\.msg/);
  });

  it('a stack set down in the room dragged onto a box goes in by its own Pick up, then the deposit (the ledger sees moves only)', () => {
    const end = homes.slice(homes.indexOf('function endStackDrag('));
    assert.match(end.slice(0, 1200), /if \(hit\) return stackIntoBox\(engine, was\.id, hit\);\s+return moveStack\(engine, was\.id, p\);/);
    const fn = homes.slice(homes.indexOf('function stackIntoBox('), homes.indexOf('function stackPop('));
    assert.match(fn, /engine\.pickUpDroppedStack\?\.\(id\)/);
    assert.match(fn, /depositInBox\(engine, hit\.box, cls, got\)/);
    assert.doesNotMatch(fn, /removeItem|addItem|inv\[cls\] [-+]?=/);
  });

  it('shows what it holds where the original did (26 px over the stage bottom, the art 12 px under it)', () => {
    assert.match(homes, /export const SDB_ITEM_DY = -26;/);
    assert.match(homes, /export const SDB_BASE_FOOT = -12;/);
    assert.match(homes, /icon\.y = displayIconY\(item, upgradeId\);/);
    const base = JSON.parse(read('tools/furniture-upgrades/base.json'));
    if (base.bag_furniture_sdb) assert.equal(base.bag_furniture_sdb.foot, -12);
  });

  it('the Display list follows the same rule as the drop', () => {
    const fn = homes.slice(homes.indexOf('function displayableItems('));
    assert.match(fn.slice(0, 400), /!displayRefusal\(box, cls, displayMeta\(cls\)\)/);
  });
});

/**
 * #314 (CoffeeSnob: a Wine of the Dead in a Storage Display Box looked squashed): the shown icon was
 * forced to 34 x 34, so the 15 x 48 bottle became a blob. bag_furniture_sdb.js getExtraConfig 926
 * gives it `width: 34`, and the client's ItemIconView fits an icon into that box by its longer
 * side (ItemIconView.as 315-321), keeping its shape.
 */
describe('#314 the shown item keeps its shape', async () => {
  const { displayIconScale, SDB_ITEM_WH } = await import('../public/js/features/homes-feature.js?v=968d4c42');
  it('fits the longer side into 34 px', () => {
    assert.equal(SDB_ITEM_WH, 34);
    const wine = displayIconScale(15, 48);
    assert.equal(Math.round(48 * wine), 34);
    assert.ok(Math.abs(15 * wine - 10.625) < 1e-9);
    const cheese = displayIconScale(56, 46);
    assert.equal(Math.round(56 * cheese), 34);
    assert.equal(displayIconScale(0, 0), 1);
  });
  it('sets a scale, never width and height apart, and fits an icon that loads late', () => {
    const at = homes.indexOf("icon.label = 'sdb-icon'");
    const body = homes.slice(homes.lastIndexOf('if (item.display?.classTsid)', at), at);
    assert.doesNotMatch(body, /icon\.(width|height) =/);
    assert.match(body, /icon\.scale\.set\(displayIconScale\(icon\.texture\.width, icon\.texture\.height\)\)/);
    assert.match(body, /onLoaded\(icon\.texture, fit\)/);
  });
});
