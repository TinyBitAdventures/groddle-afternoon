/**
 * Ticket 37 follow-up (mr granberry, live chat 2026-11-02): "sometimes the left/right arrow works, but
 * sometimes it makes me walk instead". The arrow keys switch chats only while a tab has the keyboard
 * (Tab or Shift+Tab to the row), the row shows a ring meanwhile, a click on a tab no longer takes the
 * keyboard, and Escape gives the keys back. The client's arrow keys were the avatar's unless a chat
 * field had focus, and Tab cycled through the chats and let go (RightSideView.as focusCycle 134-168).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=dff40570';
import { createNotifier } from '../public/js/notify.js?v=37c6b748';
import { memoryStore, page } from './social-fake-dom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function mount() {
  const p = page();
  globalThis.document = p.doc;
  globalThis.CSS ||= { escape: (v) => String(v) };
  const winListeners = {};
  globalThis.addEventListener = (type, fn) => (winListeners[type] ||= []).push(fn);
  const notifier = createNotifier({ now: () => 0, clock: () => 0, onChange: () => drawer?.update() });
  let drawer = null;
  drawer = mountSocialDrawer({ root: p.game, dock: p.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, canChat: () => true, streetName: () => 'Hechey Track', setData: () => {} });
  for (const [id, label] of [['help', 'Help'], ['global', 'Global Chat'], ['group:3', 'Zebra Club']]) drawer.channel(id, { label });
  drawer.open();
  const winKey = (key) => {
    const e = { key, target: p.doc.body, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of winListeners.keydown || []) fn(e);
    return e;
  };
  return { ...p, drawer, winKey };
}

describe('ticket 37: the chat tabs and the arrow keys', () => {
  it('a click picks a chat without taking the keyboard, so the arrows keep walking', () => {
    const t = mount();
    t.doc.activeElement = t.doc.body;
    const chats = t.dock.querySelector('[data-social-tab="chats"]');
    assert.equal(chats.dispatch('pointerdown').defaultPrevented, true);
    chats.click();
    assert.equal(t.drawer.tab, 'chats');
    const help = t.dock.querySelector('[data-social-chat="help"]');
    assert.equal(help.dispatch('pointerdown').defaultPrevented, true, 'a row too');
    help.click();
    assert.equal(t.drawer.chat, 'help');
    assert.equal(t.doc.activeElement, t.doc.body);
    const e = t.winKey('ArrowLeft');
    assert.equal(e.defaultPrevented, false, 'the game has it');
    assert.equal(t.drawer.chat, 'help');
  });

  it('with a tab focused the arrows switch chats and never reach the avatar; Escape lets go', () => {
    const t = mount();
    const local = t.dock.querySelector('[data-social-tab="local"]');
    local.focus();
    const right = local.dispatch('keydown', { key: 'ArrowRight' });
    assert.equal(right.stopped, true, 'kept in the drawer');
    assert.notEqual(t.drawer.tab, 'local');
    const now = t.doc.activeElement;
    let blurred = false;
    now.blur = () => { blurred = true; };
    const esc = now.dispatch('keydown', { key: 'Escape' });
    assert.equal(blurred, true);
    assert.equal(esc.stopped, false, 'the game still sees Escape');
  });

  it('the row shows a ring while a tab has the keyboard', () => {
    assert.match(read('public/style.css'), /\.social-tabs:has\(\.social-tab:focus-visible\) \{ box-shadow: inset 0 0 0 2px var\(--accent\);/);
  });
});
