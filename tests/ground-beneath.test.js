/**
 * NPC ground rule: companions never climb steep slopes or snap up to ledges.
 * Run: node --test tests/ground-beneath.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groundBeneath } from '../public/js/street-model.js?v=g478-1';

const floor = { x1: 0, y1: 800, x2: 1000, y2: 800 };
const ledge = { x1: 300, y1: 500, x2: 600, y2: 500 };
const steep = { x1: 600, y1: 800, x2: 620, y2: 600 };

describe('groundBeneath', () => {
  it('keeps a walker on the floor beneath a ledge overhead', () => {
    assert.equal(groundBeneath([floor, ledge], 400, 800).y, 800);
  });

  it('keeps a walker on the ledge it stands on', () => {
    assert.equal(groundBeneath([floor, ledge], 400, 500).y, 500);
  });

  it('allows only a gentle step up, never a steep climb', () => {
    assert.equal(groundBeneath([floor, steep], 610, 800).y, 800);
    assert.equal(groundBeneath([{ x1: 0, y1: 800, x2: 100, y2: 790 }], 50, 800).y, 795);
  });

  it('drops to the lowest platform when nothing is beneath', () => {
    assert.equal(groundBeneath([floor, ledge], 400, 900).y, 800);
    assert.equal(groundBeneath([], 400, 900), null);
  });
});
