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
import { createHomeDecorState, DISPLAY_TEXT, displayDeposit, displayRefusal, displayWithdraw, surfaceHeight } from '../public/js/home-decor.js?v=31f37d9b';
import { FURNITURE_UPGRADES } from '../public/js/furniture-upgrades-data.js?v=0b2cf3cc';
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
    // R9 (G967): Decoration Mode's drop is a target of the drop registry (js/drop-targets.js).
    const wire = homes.slice(homes.indexOf('const decorateTarget = (engine) => ({'), homes.indexOf('// --- #470:'));
    const over = wire.slice(wire.indexOf('  over(d, at) {'), wire.indexOf('  leave() {'));
    assert.match(over, /const hit = displayDropAt\(toRoom\(worldPoint\(engine, e\)\), packDrag\.classTsid\);\s+drawDisplayTarget\(engine, hit\);\s+drawPackMarker\(engine, hit \? null : packDropTarget\(engine, e\)\);/);
    const drop = wire.slice(wire.indexOf('  drop(d, at) {'), wire.indexOf('  end() {'));
    // #515: the dragged stack's own count, and that stack gives it (js/drag-stack.js).
    assert.match(drop, /if \(hit\) \{[\s\S]{0,80}const res = depositInBox\(engine, hit\.box, was\.classTsid, count, was\.ds\);/);
    assert.ok(drop.indexOf('depositInBox') < drop.indexOf('dropPackStackAt'), 'the box before the floor under it');
    assert.match(homes, /const tip = new PIXI\.Text\(\{ text: ok \? DISPLAY_TEXT\.dropTip : hit\.refusal\.msg/);
  });

  it('#470: outside Decorate a pack stack dropped on a box in your own house goes in it (bag_furniture_sdb.js 611-640)', () => {
    const wire = homes.slice(homes.indexOf('const boxTarget = (engine) => ({'), homes.indexOf('// --- G1192: outside Decorate'));
    const here = homes.slice(homes.indexOf('function boxDropHere('), homes.indexOf('function endBoxDrag('));
    assert.match(here, /mode === 'decorate'/, 'Decorate keeps its own drop');
    assert.match(here, /scene\.room !== 'interior'/);
    assert.match(here, /ctx\?\.inHome/, 'your own home only: a visit is a VISIT_ scene, never inHome');
    // R9 (G967): a target of the drop registry, so the touch lift reaches it too; a bag is no stack.
    assert.match(wire, /id: 'home-display-box',[\s\S]{0,200}st\.from === 'pack' && st\.cls && !st\.bag && boxDropHere\(engine\)/);
    assert.match(wire, /return hit \? \{ ok: !hit\.refusal \} : null;/, 'only a point over a box answers');
    const drop = wire.slice(wire.indexOf('  drop(d, at) {'));
    assert.match(drop, /if \(!hit\) return;[\s\S]{0,140}const res = depositInBox\(engine, hit\.box, was\.classTsid, draggedCount\(engine, was\.ds\) \|\| was\.count, was\.ds\);/);
    assert.doesNotMatch(wire, /dropPackStackAt/, 'only a drop over a box is taken');
    assert.match(homes.slice(homes.indexOf('function afterEnter('), homes.indexOf('function afterEnter(') + 300), /wireDropTargets\(engine\);/, 'wired when a home room is entered');
  });

  it('#473: a stack set down in the room dragged onto a box goes in whole from the floor, never through the pack (bag_furniture_sdb.js 718-741)', () => {
    const end = homes.slice(homes.indexOf('function endStackDrag('));
    assert.match(end.slice(0, 1200), /if \(hit\) return stackIntoBox\(engine, was\.id, hit\);\s+return moveStack\(engine, was\.id, p\);/);
    const fn = homes.slice(homes.indexOf('function stackIntoBox('), homes.indexOf('let stackCount = null;'));
    // The player's own plain stack: taken from the floor and deposited, the pack untouched.
    assert.match(fn, /if \(!row\.shared && !row\.contents\?\.length && !row\.name && engine\.takeDroppedStack\) \{\s+const taken = engine\.takeDroppedStack\(id\);/);
    assert.match(fn, /displayDeposit\(decor, \{ \[cls\]: taken\.count \}, hit\.box\.id, cls, taken\.count\)/);
    assert.ok(fn.indexOf('takeDroppedStack') < fn.indexOf('pickUpDroppedStack'), 'the pack only for a shared, bag or named stack');
    // A shared stack is the street's: its own Pick up first, then the deposit.
    assert.match(fn, /depositInBox\(engine, hit\.box, cls, got\)/);
    assert.doesNotMatch(fn, /removeItem|addItem|engine\.inv\[cls\] [-+]?=/);
    // The stack's canPickup still holds on the way (a Still mid-collect).
    const game = read('public/game.js');
    const take = game.slice(game.indexOf('  takeDroppedStack(id) {'), game.indexOf('  pickUpDroppedStack(id, count = Infinity) {'));
    assert.match(take, /features\.query\('groundPickupRefused', target, engine\)/);
  });

  it('#473: forty emblems on the floor all go in, whatever room the pack has (capacity 1000 stacks, stackmax 1)', async () => {
    const { createDroppedItemState, dropInventoryStack, pickupDroppedStack } = await import('../public/js/world-items.js?v=a5deb102');
    const state = room();
    const dropped = createDroppedItemState();
    const inv = { emblem_alph: 40 };
    dropInventoryStack(dropped, inv, 'RH_HOME_INT', 'emblem_alph', 40, { x: 500, y: 560 });
    assert.equal(inv.emblem_alph || 0, 0);
    delete inv.emblem_alph;
    const id = dropped.streets.RH_HOME_INT[0].id;
    // engine.takeDroppedStack: the whole stack off the floor into nothing (no pack), then the deposit.
    const taken = pickupDroppedStack(dropped, {}, 'RH_HOME_INT', id, Infinity);
    assert.equal(taken.count, 40);
    const res = displayDeposit(state, { emblem_alph: taken.count }, 8, 'emblem_alph', taken.count);
    assert.deepEqual(res.display, { classTsid: 'emblem_alph', count: 40 });
    assert.equal(dropped.streets.RH_HOME_INT, undefined, 'nothing left behind');
    assert.deepEqual(inv, {}, 'the pack never held them');
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
 * #314 (a player: a Wine of the Dead in a Storage Display Box looked squashed): the shown icon was
 * forced to 34 x 34, so the 15 x 48 bottle became a blob. bag_furniture_sdb.js getExtraConfig 926
 * gives it `width: 34`, and the client's ItemIconView fits an icon into that box by its longer
 * side (ItemIconView.as 315-321), keeping its shape.
 */
describe('#314 the shown item keeps its shape', async () => {
  const { displayIconScale, SDB_ITEM_WH } = await import('../public/js/features/homes-feature.js?v=9a298adc');
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

describe('G1204: Take out in Decoration Mode takes what fits the pack (bag_furniture_sdb.js remove 518-546)', () => {
  it('a part of what the box holds comes out, the rest stays in it', () => {
    const state = room();
    const inv = { plain_bubble: 9 };
    displayDeposit(state, inv, 8, 'plain_bubble', 9);
    const out = displayWithdraw(state, inv, 8, 4);
    assert.deepEqual([out.ok, out.qty], [true, 4]);
    assert.equal(inv.plain_bubble, 4);
    assert.deepEqual(state.placed[0].display, { classTsid: 'plain_bubble', count: 5 });
  });

  it('asks the pack how many fit first, says the source\'s words when not all did, and takes none into a full pack', () => {
    const fn = homes.slice(homes.indexOf('function withdrawWhatFits('), homes.indexOf('function expandHouse('));
    assert.match(fn, /engine\.query\?\.\('packRoom', cls, box\.display\.count, engine\)/);
    assert.match(fn, /if \(fits < 1\) return \{ ok: false, reason: 'pack', msg: STORAGE_TEXT\.noRoom \};/);
    assert.match(fn, /displayWithdraw\(decor, engine\.inv, id, fits\)/);
    assert.match(fn, /if \(box\.display\?\.count > 0\) engine\.toast\(STORAGE_TEXT\.noRoom\);/);
    assert.match(homes, /\} else if \(action === 'withdraw'\) \{\s+result = withdrawWhatFits\(engine, id\);/);
    assert.doesNotMatch(homes, /result = displayWithdraw\(decor, engine\.inv, id\);/, 'never everything whatever the room');
  });
});

describe('G1205: Set down, from a box to the floor without the pack (#384)', () => {
  const fn = homes.slice(homes.indexOf('function boxToFloor('), homes.indexOf('function expandHouse('));

  it('what the box holds goes onto the floor beside it, the pack never holding it', async () => {
    const { createDroppedItemState, dropInventoryStack } = await import('../public/js/world-items.js?v=a5deb102');
    const state = room();
    const inv = { emblem_alph: 40 };
    displayDeposit(state, inv, 8, 'emblem_alph', 40);
    delete inv.emblem_alph;
    // boxToFloor: the box gives into nothing, the floor takes them (engine.dropWorldStack).
    const out = {};
    const taken = displayWithdraw(state, out, 8);
    const dropped = createDroppedItemState();
    const res = dropInventoryStack(dropped, { emblem_alph: taken.qty }, 'RH_HOME_INT', 'emblem_alph', taken.qty, { x: 820, y: 560 }, { merge: true });
    assert.equal(res.ok, true);
    assert.equal(dropped.streets.RH_HOME_INT[0].count, 40);
    assert.equal(state.placed[0].display, undefined, 'the box is empty');
    assert.deepEqual(inv, {}, 'the pack never held them');
  });

  it('the button is on a box with something in it, beside Take out, and its action never touches the pack', () => {
    assert.match(homes, /label: `Set down \$\{item\.display\.count\}`, title: 'Set them on the floor beside the box', attrs: \{ 'data-home-action': 'floor' \}/);
    assert.match(homes, /\} else if \(action === 'floor'\) \{\s+result = boxToFloor\(engine, id\);/);
    assert.match(fn, /const taken = displayWithdraw\(decor, out, id\);/);
    assert.match(fn, /engine\.dropWorldStack\(cls, taken\.qty, spot\.x \+ roomX0\(\), spot\.y, undefined, undefined, \{ merge: true \}\)/);
    assert.doesNotMatch(fn, /engine\.inv/);
    // A refused drop puts them back in the box.
    assert.match(fn, /if \(!res\?\.ok\) \{\s+displayDeposit\(decor, out, id, cls, taken\.qty\);/);
    assert.match(fn, /stackSurfaceAt\(decor, b\.x \+ b\.w \+ 24, INTERIOR\.floorY\)/);
  });
});
