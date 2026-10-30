/**
 * The Classic growl line (public/js/classic/classic-growl.js; GrowlQueue.as): one notice at a time,
 * 0.2 s in, 4 s up, 0.6 s out, a second view on the notifier's notices, which stay mounted unseen.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enqueue, GROWL_IN_MS, GROWL_HOLD_MS, GROWL_OUT_MS, GROWL_QUEUE_MAX } from '../public/js/classic/classic-growl.js?v=g476-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Classic growl', () => {
  it('the client\'s timing', () => {
    assert.deepEqual([GROWL_IN_MS, GROWL_HOLD_MS, GROWL_OUT_MS], [200, 4000, 600]);
  });

  it('queues each notice once, in order, and drops the oldest past the limit', () => {
    let q = [];
    q = enqueue(q, 'a');
    q = enqueue(q, 'b');
    q = enqueue(q, 'b');
    q = enqueue(q, '  ');
    assert.deepEqual(q, ['a', 'b']);
    for (let i = 0; i < 10; i++) q = enqueue(q, `n${i}`);
    assert.equal(q.length, GROWL_QUEUE_MAX);
    assert.equal(q[q.length - 1], 'n9');
  });

  it('the modern stack stays mounted and unseen; the line speaks instead', () => {
    const css = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
    assert.match(css, /:root\[data-ui="classic"\] #notify-notices \{ visibility: hidden; \}/);
    const js = readFileSync(join(root, 'public/js/classic/classic-growl.js'), 'utf8');
    assert.match(js, /setAttribute\('aria-live', 'polite'\)/);
  });
});
