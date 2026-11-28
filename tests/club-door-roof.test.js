/**
 * #353 (Join the Club): the clubhouse's shut door pushed you back only while your feet were under
 * its 150 px, so a triple jump (up to about 250 px, js/avatar-step.js jumpApex) went over it to the
 * painting. Now the door's column is shut from the deck up to the roof (236 px) and above it, until
 * the frames are right. Room tick behaviour, with the room's own ctx shape.
 * In game (solo, 1280 x 800): placed past the shut door before the puzzle, the Curious Painting's
 * "Jump in" works and takes you into Pintura Prosa, so the painting itself never waited for the puzzle.
 * Run: node --test tests/club-door-roof.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CLUBHOUSE, DECKS, room, shutDoorColumn } from '../public/js/quest-rooms/clubhouse.js?v=46dce7e6';
import { jumpApex } from '../public/js/avatar-step.js?v=8415ee96';

const { x1, x2 } = CLUBHOUSE.door;
const deck = DECKS.club.y;

/** One room tick with the avatar at (x, y), having come from prevX. */
function tickAt(x, y, { prevX = x1 - 30, solved = false } = {}) {
  const player = { x, y, vx: 5, vy: -4 };
  const ctx = { stage: 'clubhouse', player, data: { solved, prevX, buttons: [], frames: [], quoins: [] }, memory: () => ({}) };
  room.tick(ctx, 16);
  return player;
}

describe('the clubhouse door is shut up to the roof', () => {
  it('a triple jump\'s height is over the old 150 px', () => {
    assert.ok(jumpApex(1.3, undefined, { triple: true }) > CLUBHOUSE.door.h);
  });

  it('pushes you back at every height from the deck to over the roof', () => {
    for (const up of [0, 100, 149, 151, 200, CLUBHOUSE.roofUp, 249, 400]) {
      const p = tickAt((x1 + x2) / 2, deck - up);
      assert.equal(p.x, x1 - 14, `${up} px up`);
      assert.equal(p.vx, 0);
    }
    // From inside, back the other way.
    assert.equal(tickAt((x1 + x2) / 2, deck - 220, { prevX: x2 + 30 }).x, x2 + 14);
  });

  it('leaves you be under the deck, away from the door, and once the door is open', () => {
    assert.equal(tickAt((x1 + x2) / 2, deck + 200).x, (x1 + x2) / 2, 'on the ground under the clubhouse');
    assert.equal(tickAt(x2 + 60, deck - 200).x, x2 + 60, 'beside the door');
    assert.equal(tickAt((x1 + x2) / 2, deck - 200, { solved: true }).x, (x1 + x2) / 2, 'the door is open');
    assert.equal(shutDoorColumn(NaN), false);
  });
});
