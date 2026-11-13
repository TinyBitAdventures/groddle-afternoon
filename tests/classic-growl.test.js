/**
 * The Classic growl line (public/js/classic/classic-growl.js; GrowlQueue.as): one notice at a time,
 * 0.2 s in, 4 s up, 0.6 s out, a second view on the notifier's notices, which stay mounted unseen.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enqueue, growlStayMs, GROWL_IN_MS, GROWL_HOLD_MS, GROWL_OUT_MS, GROWL_QUEUE_MAX } from '../public/js/classic/classic-growl.js?v=b16acfa9';

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

  it('ticket 69: a line holds its reading time; it gives way after 4 s to one waiting line, after NOTICE_KEEP_MS in a burst', () => {
    assert.equal(growlStayMs('Hi'), 4300);
    assert.equal(growlStayMs(''), GROWL_HOLD_MS);
    assert.equal(growlStayMs('Darn. Got distracted. That was relaxing. <span class="amt">+12 mood</span>, +12 energy, +1 iMG'), 7900);
    assert.equal(growlStayMs(Array(40).fill('w').join(' ')), 10_000);
    // One line behind it: the 4 s (the meditation line, then the cooldown line). A burst: 1.5 s each.
    assert.equal(growlStayMs('Darn. Got distracted. That was relaxing. +12 mood', 1), GROWL_HOLD_MS);
    assert.equal(growlStayMs('Hi', 2), 1500);
    assert.equal(growlStayMs('Hi', 5), 1500);
    const js = readFileSync(join(root, 'public/js/classic/classic-growl.js'), 'utf8');
    assert.match(js, /fadeIn\(inMs \+ growlStayMs\(html, queue\.length\)\);/);
    assert.match(js, /if \(!showing\) next\(\);\n\s+else hurry\(\);/);
    assert.match(js, /const at = current\.at \+ current\.inMs \+ growlStayMs\(current\.html, queue\.length\);\n\s+if \(at < current\.fadeAt\) fadeIn/);
  });

  it('the modern stack stays mounted and unseen; the line speaks instead', () => {
    const css = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
    assert.match(css, /:root\[data-ui="classic"\] #notify-notices \{ visibility: hidden; \}/);
    const js = readFileSync(join(root, 'public/js/classic/classic-growl.js'), 'utf8');
    assert.match(js, /setAttribute\('aria-live', 'polite'\)/);
  });
});
