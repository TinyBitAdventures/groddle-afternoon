/**
 * G737: one feature's save() or restore() that throws never stops the others, and never loses
 * its own saved data (js/feature-host.js save, restore).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';

function host(features) {
  const errors = [];
  const h = createFeatureHost(features, { onError: (where, err) => errors.push(`${where}: ${err.message}`) });
  return { h, errors };
}

describe('feature save and restore are guarded one feature at a time', () => {
  it('a feature whose restore throws leaves the others restored and its slice kept as it was', () => {
    const got = {};
    const { h, errors } = host([
      { id: 'alpha', restore(slice) { got.alpha = slice; }, save: () => ({ n: got.alpha?.n ?? 0 }) },
      { id: 'broken', restore() { throw new Error('bad slice'); }, save: () => ({ fresh: true }) },
      { id: 'omega', restore(slice) { got.omega = slice; }, save: () => ({ z: got.omega?.z ?? 0 }) },
    ]);
    const slices = { alpha: { n: 3 }, broken: { treasure: [1, 2, 3] }, omega: { z: 9 } };
    h.restore(slices, {});
    assert.deepEqual(got, { alpha: { n: 3 }, omega: { z: 9 } });
    assert.deepEqual(h.keptSlices(), ['broken']);
    const saved = h.save();
    assert.deepEqual(saved.broken, { treasure: [1, 2, 3] }, 'the slice it could not take is written back unchanged');
    assert.deepEqual(saved.alpha, { n: 3 });
    assert.deepEqual(saved.omega, { z: 9 });
    h.save();
    assert.deepEqual(errors, ['broken.restore: bad slice'], 'logged once');
  });

  it('a feature whose save throws keeps its last good slice and the rest still save', () => {
    let fail = false;
    let count = 1;
    const { h, errors } = host([
      { id: 'flaky', restore() {}, save() { if (fail) throw new Error('cannot save'); return { count }; } },
      { id: 'steady', save: () => ({ ok: true }) },
    ]);
    h.restore({ flaky: { count: 1 } }, {});
    count = 2;
    assert.deepEqual(h.save(), { flaky: { count: 2 }, steady: { ok: true } });
    fail = true;
    count = 5;
    assert.deepEqual(h.save(), { flaky: { count: 2 }, steady: { ok: true } });
    assert.deepEqual(h.save(), { flaky: { count: 2 }, steady: { ok: true } });
    assert.deepEqual(errors, ['flaky.save: cannot save'], 'logged once');
  });

  it('a save that throws before any good slice keeps the restored one', () => {
    const { h } = host([{ id: 'late', restore() {}, save() { throw new Error('no'); } }]);
    h.restore({ late: { keep: 'me' } }, {});
    assert.deepEqual(h.save(), { late: { keep: 'me' } });
  });

  it('a fresh game with a throwing save simply leaves that feature out', () => {
    const { h } = host([{ id: 'new', save() { throw new Error('no'); } }, { id: 'fine', save: () => ({ a: 1 }) }]);
    assert.deepEqual(h.save(), { fine: { a: 1 } });
  });
});
