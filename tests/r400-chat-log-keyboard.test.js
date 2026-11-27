/**
 * #400 (iPhone, upright and sideways): replying in a chat, the keyboard came up and the conversation
 * jumped to its oldest lines. The view shrinking rebuilt the log's box and its scroll went back to
 * the top; that scroll counted as the player's, so the log stopped keeping to its end (report #230's
 * keepLogEnd). A scroll that comes with a new log height is the layout's: a log at its end goes back
 * there (js/ui/social-drawer.js). WebKit at 402x660 shrunk to 402x420 showed it: scrollTop 1114 to 0.
 * Run: node --test tests/r400-chat-log-keyboard.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page, memoryStore } from './social-fake-dom.js';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=0eba1119';
import { createNotifier } from '../public/js/notify.js?v=c9d79ec5';

const src = readFileSync(new URL('../public/js/ui/social-drawer.js', import.meta.url), 'utf8');

function mount() {
  const t = page();
  globalThis.document = t.doc;
  let drawer = null;
  const notifier = createNotifier({ onChange: () => drawer?.update() });
  drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 402, streetName: () => 'Groddle Forest Junction' });
  const log = t.dock.querySelector('.social-log');
  const input = t.dock.querySelector('#local-chat-input') || t.dock.querySelector('input, textarea');
  drawer.select('local');
  return { drawer, log, input };
}

describe('#400: the keyboard coming up keeps a chat at its newest lines', () => {
  const saved = {};
  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'ResizeObserver', 'visualViewport']) saved[k] = globalThis[k];
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    delete globalThis.ResizeObserver;
    delete globalThis.visualViewport;
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('the log rebuilt shorter with its scroll back at the top goes back to its end', () => {
    const { log, input } = mount();
    Object.assign(log, { scrollHeight: 1532, clientHeight: 418, scrollTop: 1114 });
    log.dispatch('scroll');
    // The keyboard: the log is 296 px now and Safari has put its scroll back to 0.
    Object.assign(log, { clientHeight: 296, scrollTop: 0 });
    log.dispatch('scroll');
    assert.equal(log.scrollTop, 1532, 'back to the newest line');
    // The pinning scroll that follows is at the end: it stays pinned for the next line.
    Object.assign(log, { scrollTop: 1532 - 296 });
    log.dispatch('scroll');
    Object.assign(log, { scrollHeight: 1555, clientHeight: 278 });
    input.dispatch('input');
    assert.equal(log.scrollTop, 1555, 'still kept to its end');
  });

  it('a player who scrolled up to read is left there, keyboard or not', () => {
    const { log, input } = mount();
    Object.assign(log, { scrollHeight: 1532, clientHeight: 418, scrollTop: 1114 });
    log.dispatch('scroll');
    Object.assign(log, { scrollTop: 400 });
    log.dispatch('scroll');
    Object.assign(log, { clientHeight: 296, scrollTop: 0 });
    log.dispatch('scroll');
    assert.equal(log.scrollTop, 0, 'not at its end before, so not moved');
    input.dispatch('focus');
    assert.equal(log.scrollTop, 0);
  });

  it('the box taking focus puts a log at its end back there (the tap nudged it 11 px)', () => {
    const { log, input } = mount();
    Object.assign(log, { scrollHeight: 1532, clientHeight: 418, scrollTop: 1103 });
    log.dispatch('scroll');
    input.dispatch('focus');
    assert.equal(log.scrollTop, 1532);
  });

  it('the visual viewport (the keyboard\'s steps) and the log\'s own height keep it there', () => {
    assert.match(src, /globalThis\.visualViewport\?\.addEventListener\?\.\('resize', keepLogEnd\);/);
    assert.match(src, /new globalThis\.ResizeObserver\(keepLogEnd\)\.observe\(log\)/);
    assert.match(src, /if \(resized && logAtEnd && !atEnd\) \{\n\s*keepLogEnd\(\);\n\s*return;/);
  });
});
