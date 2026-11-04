/**
 * Player report 37 (2026-11-02): "I cannot combine stacks. A stack of meat is 60. I collect 65, eat
 * 10, now I have a stack of 50 and a stack of 5. I can't drag one onto the other. I need to drop one
 * stack, and pick it up again."
 *
 * The original: a stack of the same class that is not full is a drop target (glitch-client
 * PackDisplayManager.as _findItemDragTargetSlot 712-715, a partly-fitting drag allowed), the drop
 * sends inventory_move to that slot (_packDragCompleteHandler 989-1012), and the server adds into
 * that slot and puts the rest back where it came from (GSJS main.js doInventoryMove 5148-5200,
 * items/bag.js addItemStack 241-258). The remake's moveStack (js/pack-slots.js) now does the same, in
 * the pack, in a bag and between them. Only places change: no class count moves, so the save's
 * inventory and the online ledger have nothing to settle.
 * Run: node --test tests/pack-stack-merge.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ITEM_CATALOG, isToolItem, removeItem } from '../public/js/inventory.js?v=597a17a2';
import { PACK_CAPACITY, layoutPack, moveStack, stackMaxOf } from '../public/js/pack-slots.js?v=68a8fca3';

const root = join(import.meta.dirname, '..');
const OPTS = { capacity: PACK_CAPACITY, catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG) };
const client = join(root, '../glitch-client/com/tinyspeck/engine/pack/PackDisplayManager.as');
const gsjs = join(root, '../glitch-GameServerJS/main.js');

/** Every slot as text: the pack (bags as @key) and each bag. */
function picture(layout) {
  const out = { pack: layout.pack.slots.map((s) => (s.kind === 'bag' ? `@${s.key}` : `${s.cls}:${s.count}`)) };
  for (const [key, box] of Object.entries(layout.bags)) out[key] = box.slots.map((s) => `${s.cls}:${s.count}`);
  return out;
}

describe('37: a stack dropped on a stack of its own class joins it', () => {
  it('the player\'s meat: 65, eat 10, then 5 dragged onto 50 makes one stack of 55', () => {
    assert.equal(stackMaxOf('meat', ITEM_CATALOG), 60);
    const inv = { meat: 65 };
    let layout = layoutPack(inv, null, OPTS);
    assert.deepEqual(picture(layout).pack, ['meat:60', 'meat:5']);
    removeItem(inv, 'meat', 10);
    layout = layoutPack(inv, layout.prefs, OPTS);
    assert.deepEqual(picture(layout).pack, ['meat:50', 'meat:5']);
    const r = moveStack(inv, layout.prefs, { container: 'pack', index: 1 }, { container: 'pack', index: 0 }, OPTS);
    assert.equal(r.ok, true);
    assert.equal(r.merged, 5);
    assert.deepEqual(picture(layoutPack(inv, r.prefs, OPTS)).pack, ['meat:55']);
    assert.deepEqual(inv, { meat: 55 }, 'the inventory count is untouched');
    // The other way round, 50 onto 5, makes one stack of 55 too.
    const back = moveStack(inv, layout.prefs, { container: 'pack', index: 0 }, { container: 'pack', index: 1 }, OPTS);
    assert.deepEqual(picture(layoutPack(inv, back.prefs, OPTS)).pack, ['meat:55']);
  });

  it('up to the stack max: what does not fit stays where it was', () => {
    const inv = { meat: 63 };
    const prefs = { bags: [], place: { pack: ['meat', 'meat'] }, n: { pack: [58, 5] } };
    const layout = layoutPack(inv, prefs, OPTS);
    assert.deepEqual(picture(layout).pack, ['meat:58', 'meat:5']);
    const r = moveStack(inv, layout.prefs, { container: 'pack', index: 1 }, { container: 'pack', index: 0 }, OPTS);
    assert.equal(r.merged, 2);
    assert.deepEqual(picture(layoutPack(inv, r.prefs, OPTS)).pack, ['meat:60', 'meat:3']);
  });

  it('a full stack is no target: the drop moves the stack there as before', () => {
    const inv = { meat: 65 };
    const layout = layoutPack(inv, null, OPTS);
    const r = moveStack(inv, layout.prefs, { container: 'pack', index: 1 }, { container: 'pack', index: 0 }, OPTS);
    assert.equal(r.ok, true);
    assert.equal(r.merged, undefined);
    assert.deepEqual(picture(layoutPack(inv, r.prefs, OPTS)).pack, ['meat:5', 'meat:60']);
  });

  it('another class is no merge: the drop moves the stack there as before', () => {
    const inv = { meat: 5, cherry: 3 };
    const layout = layoutPack(inv, { bags: [], place: { pack: ['meat', 'cherry'] }, n: { pack: [5, 3] } }, OPTS);
    const r = moveStack(inv, layout.prefs, { container: 'pack', index: 1 }, { container: 'pack', index: 0 }, OPTS);
    assert.equal(r.merged, undefined);
    assert.deepEqual(picture(layoutPack(inv, r.prefs, OPTS)).pack, ['cherry:3', 'meat:5']);
  });

  it('inside a bag, from a bag to the pack and from the pack to a bag', () => {
    const inv = { meat: 63, bag_bigger: 1 };
    const prefs = { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', 'meat'], b1: ['meat', 'meat'] }, n: { pack: [0, 50], b1: [8, 5] } };
    const layout = layoutPack(inv, prefs, OPTS);
    assert.deepEqual(picture(layout), { pack: ['@b1', 'meat:50'], b1: ['meat:8', 'meat:5'] });
    const inBag = moveStack(inv, layout.prefs, { container: 'b1', index: 1 }, { container: 'b1', index: 0 }, OPTS);
    assert.deepEqual(picture(layoutPack(inv, inBag.prefs, OPTS)), { pack: ['@b1', 'meat:50'], b1: ['meat:13'] });
    const toPack = moveStack(inv, layout.prefs, { container: 'b1', index: 0 }, { container: 'pack', index: 1 }, OPTS);
    assert.deepEqual(picture(layoutPack(inv, toPack.prefs, OPTS)), { pack: ['@b1', 'meat:58'], b1: ['meat:5'] });
    const toBag = moveStack(inv, layout.prefs, { container: 'pack', index: 1 }, { container: 'b1', index: 1 }, OPTS);
    assert.equal(toBag.merged, 50);
    assert.deepEqual(picture(layoutPack(inv, toBag.prefs, OPTS)), { pack: ['@b1'], b1: ['meat:8', 'meat:55'] });
    for (const r of [inBag, toPack, toBag]) assert.equal(r.ok, true);
    assert.deepEqual(inv, { meat: 63, bag_bigger: 1 });
  });

  it('a merge is kept by the save: the next layout reads the joined stack back', () => {
    const inv = { meat: 55 };
    const layout = layoutPack(inv, { bags: [], place: { pack: ['meat', 'meat'] }, n: { pack: [50, 5] } }, OPTS);
    const r = moveStack(inv, layout.prefs, { container: 'pack', index: 1 }, { container: 'pack', index: 0 }, OPTS);
    const saved = JSON.parse(JSON.stringify(r.prefs));
    assert.deepEqual(picture(layoutPack(inv, saved, OPTS)).pack, ['meat:55']);
  });

  it('the game hands a drop on a slot to packMove with that slot, mouse and touch alike', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /const dropOn = \(el\) => \{/);
    assert.match(game, /bar\.addEventListener\('drop', \(event\) => \{[\s\S]{0,400}dropOn\(el\);/);
    assert.match(game, /if \(packDrag\) dropOn\(el\);/);
    assert.match(game, /event\.pointerType !== 'touch'/);
  });

  it('the sources say so', { skip: !(existsSync(client) && existsSync(gsjs)) && 'needs glitch-client and glitch-GameServerJS beside the repo' }, () => {
    const pdm = readFileSync(client, 'utf8').split('\n');
    assert.match(pdm[711], /class_tsid != target_itemstack\.class_tsid\) continue;/);
    assert.match(pdm[713], /target_itemstack\.count >= target_item_class\.stackmax\) continue;/);
    assert.match(pdm[714], /you can still put some of the dragged stack into the target stack/);
    const main = readFileSync(gsjs, 'utf8');
    const move = main.slice(main.indexOf('function doInventoryMove('), main.indexOf('function doLocationMove('));
    assert.match(move, /var remaining = to_bag\.addItemStack\(item, msg\.to_slot, pc\);/);
    assert.match(move, /if \(remaining\)\{\s*item\.apiPutBack\(\);/);
  });
});
