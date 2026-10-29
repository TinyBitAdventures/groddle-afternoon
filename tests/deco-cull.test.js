import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decoBox } from '../public/js/street-render.js?v=g442-6';

describe('deco culling box', () => {
  it('skips children it cannot measure instead of throwing (blank "And so it begins..." street)', () => {
    assert.equal(decoBox({ texture: null }), null);
    assert.equal(decoBox({ texture: {} }), null);
  });

  it('boxes a bottom-centre anchored sprite', () => {
    const box = decoBox({ texture: { orig: { width: 100, height: 50 } }, scale: { x: 1, y: 1 }, anchor: { x: 0.5, y: 1 }, x: 200, y: 300, rotation: 0 });
    assert.deepEqual(box, { x0: 150, y0: 250, x1: 250, y1: 300 });
  });
});
