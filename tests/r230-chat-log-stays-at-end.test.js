/**
 * Report #230 (live, Friendly): typing a long line in the Social drawer, the box grew a row at a
 * time, the log above it got shorter, and the newest lines slid under the box: the log's scroll
 * stayed where it was. A log that was at its end stays at its end when its height changes (the box
 * growing or shrinking, a resize: js/ui/social-drawer.js keepLogEnd); one the player scrolled up
 * stays where they were reading.
 * Run: node --test tests/r230-chat-log-stays-at-end.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page, memoryStore } from './social-fake-dom.js';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=bb35acd9';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';

const src = readFileSync(new URL('../public/js/ui/social-drawer.js', import.meta.url), 'utf8');

function mount() {
  const t = page();
  globalThis.document = t.doc;
  let drawer = null;
  const notifier = createNotifier({ onChange: () => drawer?.update() });
  drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, streetName: () => 'Hechey Track' });
  const log = t.dock.querySelector('.social-log');
  const input = t.dock.querySelector('#local-chat-input') || t.dock.querySelector('input, textarea');
  return { drawer, log, input };
}

describe('report 230: the chat log keeps to its end while the box grows', () => {
  const saved = {};
  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'ResizeObserver']) saved[k] = globalThis[k];
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    delete globalThis.ResizeObserver;
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('at its end: a growing box keeps the newest line in view', () => {
    const { drawer, log, input } = mount();
    drawer.select('local');
    // At the end of a 1000 px log, 400 px tall.
    Object.assign(log, { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
    log.dispatch('scroll');
    // The box grows two rows: the log is 36 px shorter, its scroll unchanged (the browser leaves it).
    Object.assign(log, { clientHeight: 364 });
    input.dispatch('input');
    assert.equal(log.scrollTop, 1000, 'back to the end');
  });

  it('scrolled up to read: typing leaves it there', () => {
    const { drawer, log, input } = mount();
    drawer.select('local');
    Object.assign(log, { scrollHeight: 1000, clientHeight: 400, scrollTop: 300 });
    log.dispatch('scroll');
    Object.assign(log, { clientHeight: 364 });
    input.dispatch('input');
    assert.equal(log.scrollTop, 300);
  });

  it('follows the log height itself (ResizeObserver) and runs after the box has fitted', () => {
    assert.match(src, /new globalThis\.ResizeObserver\(keepLogEnd\)\.observe\(log\)/);
    const bind = src.indexOf('bindChatInput(input, {');
    const listen = src.indexOf("input.addEventListener('input', keepLogEnd);");
    assert.ok(bind > 0 && listen > bind, 'the input listener comes after bindChatInput\'s own');
    assert.match(src, /log\.addEventListener\('scroll', \(\) => \{\n\s+logAtEnd = log\.scrollHeight - log\.scrollTop - log\.clientHeight < 24;/);
  });
});
