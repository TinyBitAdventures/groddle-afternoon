/**
 * #593 (G1113): in Decoration Mode a stack moved onto a like stack on a shelf or the floor never
 * joined it, so emblems kept on a shelf had to come down to the pack to be stacked.
 *
 * The original's Decoration Mode sent a move as itemstack_modify and merged it when it landed
 * "directly on stack": 10 px along the same plat line (HandOfDecorator.as shouldMerge 1656-1670;
 * main.js doModifyItem 4855-4866). A pack drop there already merged within 12 px (game.js
 * dropPackStackAt); a move now joins a like stack on the same surface within that too.
 *
 * Run: node --test tests/home-stack-merge-593.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { likeStackAt, mergeDroppedStacks, normalizeDroppedItemState, PLACED_MERGE_RADIUS } from '../public/js/world-items.js?v=93313aad';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const ROOM = 'home_interior_test';

/** Apples on a shelf (emblems' stackmax is 1: tests/home-floor-share.test.js) (piece 7, top 377) and one on the floor under it, as a room's dropped stacks. */
function room() {
  return {
    nextId: 10,
    streets: {
      [ROOM]: [
        { id: 'a', streetTsid: ROOM, classTsid: 'apple', count: 3, x: 1800, y: 377, on: 7, droppedAt: 1 },
        { id: 'b', streetTsid: ROOM, classTsid: 'apple', count: 1, x: 1900, y: 377, on: 7, droppedAt: 1 },
        { id: 'c', streetTsid: ROOM, classTsid: 'apple', count: 2, x: 1805, y: 620, droppedAt: 1 },
        { id: 'd', streetTsid: ROOM, classTsid: 'cherry', count: 1, x: 1802, y: 377, on: 7, droppedAt: 1 },
      ],
    },
  };
}
const rows = (s) => s.streets[ROOM];
const row = (s, id) => rows(s).find((r) => r.id === id);
const total = (s, cls) => rows(s).filter((r) => r.classTsid === cls).reduce((n, r) => n + r.count, 0);

describe('a stack moved onto a like stack joins it (#593)', () => {
  it('finds the like stack on the same shelf where it lands, not one on the floor under it or of another class', () => {
    const s = room();
    const moving = row(s, 'b');
    assert.equal(likeStackAt(rows(s), moving, 1806, 7)?.id, 'a', 'on the shelf: the shelf apple, not the cherry beside it');
    assert.equal(likeStackAt(rows(s), moving, 1806, null)?.id, 'c', 'on the floor: the floor one');
    assert.equal(likeStackAt(rows(s), moving, 1800 + PLACED_MERGE_RADIUS + 1, 7), null, 'further off: its own stack');
    assert.equal(likeStackAt(rows(s), moving, 1900, 7), null, 'never itself');
    assert.equal(PLACED_MERGE_RADIUS, 12, 'the pack drop\'s radius (game.js dropPackStackAt mergeRadius: 12)');
  });

  it('joins it: one stack with both counts, the moved record gone, nothing made or lost', () => {
    const s = room();
    const before = total(s, 'apple');
    const res = mergeDroppedStacks(s, ROOM, 'b', 'a', { now: 5 });
    assert.equal(res.ok, true);
    assert.equal(res.count, 1);
    assert.equal(row(s, 'b'), undefined);
    assert.deepEqual({ count: row(s, 'a').count, x: row(s, 'a').x, on: row(s, 'a').on }, { count: 4, x: 1800, on: 7 });
    assert.equal(total(s, 'apple'), before);
    // It saves as one stack (the dropped-items save, game.js saveDroppedItems).
    const saved = normalizeDroppedItemState(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(saved.streets[ROOM].filter((r) => r.classTsid === 'apple').map((r) => [r.id, r.count]), [['a', 4], ['c', 2]]);
  });

  it('keeps each copy\'s wear and words, the stack\'s own first', () => {
    const s = { nextId: 3, streets: { [ROOM]: [
      { id: 'p', classTsid: 'cherry', count: 2, x: 10, y: 620, points: [40, null] },
      { id: 'q', classTsid: 'cherry', count: 1, x: 12, y: 620, points: [7], tags: ['x'] },
    ] } };
    assert.equal(mergeDroppedStacks(s, ROOM, 'q', 'p').ok, true);
    assert.deepEqual(row(s, 'p').points, [40, null, 7]);
    assert.deepEqual(row(s, 'p').tags, [null, null, 'x']);
  });

  it('a bag, a named stack or another class never joins', () => {
    const s = room();
    row(s, 'a').name = 'Mine';
    assert.equal(likeStackAt(rows(s), row(s, 'b'), 1800, 7), null);
    assert.equal(mergeDroppedStacks(s, ROOM, 'b', 'a').ok, false);
    assert.equal(mergeDroppedStacks(s, ROOM, 'd', 'c').reason, 'unlike');
    assert.equal(rows(s).length, 4);
  });

  it('Decoration Mode\'s move joins it and saves; the drag marker sits on the stack it joins', () => {
    const homes = read('public/js/features/homes-feature.js');
    const mv = homes.slice(homes.indexOf('function moveStack('), homes.indexOf('function pickUpStack('));
    // R50: a shared stack is claimed (tests/ground-stacks.test.js); the save's own joins here.
    assert.match(mv, /const into = moveJoins\(engine, row, target\);\s+if \(row\.shared\) return claimShared\(engine, row, target, into\);[\s\S]{0,400}const joined = into \? mergeDroppedStacks\(ownGroundState\(engine\), groundKey\(engine\), id, into\.id, target\.on != null \? \{ decor: true \} : \{\}\) : null;/);
    assert.ok(mv.indexOf('mergeDroppedStacks(') < mv.indexOf('engine.droppedItemsChanged?.();'), 'saved after it joins');
    const joins = homes.slice(homes.indexOf('function moveJoins('), homes.indexOf('function moveStack('));
    assert.match(joins, /keepsOwnStack\(row\.classTsid\)/, 'a class that keeps its own stack never joins, as its pack drop');
    assert.match(joins, /likeStackAt\(roomStackRows\(engine\), row\.shared \? \{ \.\.\.row, shared: false \} : row, target\.x \+ roomX0\(\), target\.on\)/);
    const drag = homes.slice(homes.indexOf('function moveStackDrag('), homes.indexOf('function endStackDrag('));
    assert.match(drag, /const join = moveJoins\(engine, row, target\);\s+drawPackMarker\(engine, join \? \{ x: join\.x - roomX0\(\), y: join\.y \} : target, row\);/);
  });
});
