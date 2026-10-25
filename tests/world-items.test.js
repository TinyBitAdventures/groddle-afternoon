import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createDroppedItemState,
  dropInventoryStack,
  listDroppedStacks,
  normalizeDroppedItemState,
  normalizeStackQuantity,
  parseDroppedItemState,
  pickupDroppedStack,
  serializeDroppedItemState,
} from '../public/js/world-items.js?v=world-items-4';
import { createInventory } from '../public/js/inventory.js?v=catalog-unified-7';

const publicRoot = join(import.meta.dirname, '..', 'public');

describe('original-style dropped street stacks', () => {
  it('moves a clamped quantity from the pack onto the street', () => {
    const state = createDroppedItemState();
    const inv = createInventory({ apple: 4 });
    const result = dropInventoryStack(state, inv, 'GLI123', 'apple', 99, { x: 120, y: 300 }, { now: 10 });
    assert.equal(result.ok, true);
    assert.equal(result.count, 4);
    assert.equal(inv.apple, 0);
    assert.deepEqual(listDroppedStacks(state, 'GLI123'), [{
      id: 'world-item-1',
      streetTsid: 'GLI123',
      classTsid: 'apple',
      count: 4,
      x: 120,
      y: 300,
      droppedAt: 10,
    }]);
  });

  it('merges nearby matching stacks but leaves distant stacks separate', () => {
    const state = createDroppedItemState();
    const inv = createInventory({ cherry: 8 });
    const first = dropInventoryStack(state, inv, 'GLI123', 'cherry', 2, { x: 100, y: 200 }, { now: 1 });
    const merged = dropInventoryStack(state, inv, 'GLI123', 'cherry', 3, { x: 130, y: 210 }, { now: 2 });
    const distant = dropInventoryStack(state, inv, 'GLI123', 'cherry', 1, { x: 260, y: 200 }, { now: 3 });
    assert.equal(first.merged, false);
    assert.equal(merged.merged, true);
    assert.equal(distant.merged, false);
    assert.deepEqual(listDroppedStacks(state, 'GLI123').map((row) => row.count), [5, 1]);
    assert.equal(inv.cherry, 2);
  });

  it('keeps stacks isolated by street', () => {
    const state = createDroppedItemState();
    const inv = createInventory({ grain: 3 });
    dropInventoryStack(state, inv, 'GLI_A', 'grain', 1, { x: 10, y: 20 });
    dropInventoryStack(state, inv, 'GLI_B', 'grain', 1, { x: 10, y: 20 });
    assert.equal(listDroppedStacks(state, 'GLI_A').length, 1);
    assert.equal(listDroppedStacks(state, 'GLI_B').length, 1);
    assert.notEqual(listDroppedStacks(state, 'GLI_A')[0].id, listDroppedStacks(state, 'GLI_B')[0].id);
  });

  it('picks up part of a stack, then removes it after the remainder', () => {
    const state = createDroppedItemState();
    const inv = createInventory({ meat: 3 });
    const dropped = dropInventoryStack(state, inv, 'GLI123', 'meat', 3, { x: 10, y: 20 });
    const partial = pickupDroppedStack(state, inv, 'GLI123', dropped.stack.id, 1);
    assert.deepEqual(partial, {
      ok: true,
      count: 1,
      classTsid: 'meat',
      removed: false,
      remaining: 2,
    });
    assert.equal(inv.meat, 1);
    const rest = pickupDroppedStack(state, inv, 'GLI123', dropped.stack.id);
    assert.equal(rest.removed, true);
    assert.equal(rest.count, 2);
    assert.equal(inv.meat, 3);
    assert.deepEqual(listDroppedStacks(state, 'GLI123'), []);
  });

  it('rejects missing pack items and missing world stacks without mutation', () => {
    const state = createDroppedItemState();
    const inv = createInventory({ apple: 0 });
    assert.deepEqual(
      dropInventoryStack(state, inv, 'GLI123', 'apple', 1, { x: 1, y: 2 }),
      { ok: false, reason: 'missing' }
    );
    assert.deepEqual(pickupDroppedStack(state, inv, 'GLI123', 'nope'), {
      ok: false,
      reason: 'missing',
    });
    assert.deepEqual(state.streets, {});
  });

  it('normalizes quantities and repairs untrusted persisted state', () => {
    assert.equal(normalizeStackQuantity(0, 5), 1);
    assert.equal(normalizeStackQuantity(20, 5), 5);
    assert.equal(normalizeStackQuantity(2.8, 5), 2);
    const repaired = normalizeDroppedItemState({
      nextId: -4,
      streets: {
        GLI123: [
          { id: 'world-item-9', classTsid: 'apple', count: '2', x: '3', y: 4 },
          { id: 'bad', classTsid: '', count: 2 },
          { id: 'empty', classTsid: 'grain', count: 0 },
        ],
      },
    });
    assert.equal(repaired.nextId, 10);
    assert.equal(repaired.streets.GLI123.length, 1);
    assert.equal(repaired.streets.GLI123[0].count, 2);
  });

  it('round-trips storage while preserving the next stable id', () => {
    const state = createDroppedItemState();
    const inv = createInventory({ apple: 2 });
    dropInventoryStack(state, inv, 'GLI123', 'apple', 1, { x: 4, y: 5 }, { now: 99 });
    const restored = parseDroppedItemState(serializeDroppedItemState(state));
    const second = dropInventoryStack(restored, inv, 'GLI123', 'apple', 1, { x: 400, y: 5 });
    assert.equal(second.stack.id, 'world-item-2');
    assert.equal(listDroppedStacks(restored, 'GLI123').length, 2);
  });
});

describe('dropped item client integration', () => {
  it('wires pack quantity controls, street persistence, Pixi stacks, and pickup verbs', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const content = readFileSync(join(publicRoot, 'content.js'), 'utf8');
    const css = readFileSync(join(publicRoot, 'style.css'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    assert.match(game, /dropInventoryStack/);
    assert.match(game, /pickupDroppedStack/);
    assert.match(game, /spawnDroppedItemStack/);
    assert.match(game, /DROPPED_ITEMS_STORAGE_KEY/);
    assert.match(game, /data-pack-drop-confirm/);
    assert.match(game, /aria-label', 'Groddle game world'/);
    assert.match(content, /classId === 'dropped_item'/);
    assert.match(css, /pack-drop-quantity/);
    assert.match(game, /world-item-stack/);
    assert.match(html, /game\.js\?v=official-ecology-1/);
  });
});
