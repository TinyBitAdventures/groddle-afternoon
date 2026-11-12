/**
 * Selecting chat text (Austin 2026-11-04: "I click and drag to highlight however the drag select
 * disappears after a second or 2"). The Social drawer drew its whole log again from new nodes on every
 * change (a buddy moving, a player joining the street, presence, Activity), and the selection went with
 * the old nodes. Now rows are kept by what they show (js/ui/keyed-nodes.js) and a redraw only touches
 * the rows that changed, in the drawer and in the Classic skin's Local Chat / Activity pane.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeCache, pressLeavesKeys, reconcileChildren, uniqueKeys } from '../public/js/ui/keyed-nodes.js?v=9ab4de5c';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=61ebf621';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';
import { FakeEl, memoryStore, page } from './social-fake-dom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('rows kept between redraws: the pieces', () => {
  it('reconcileChildren leaves rows in place alone, adds, removes and moves only what differs', () => {
    const box = new FakeEl('div');
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((x) => { const n = new FakeEl('p'); n.textContent = x; return n; });
    assert.equal(reconcileChildren(box, [a, b, c]), 3);
    let inserted = 0;
    let removed = 0;
    const ins = box.insertBefore.bind(box);
    const rem = box.removeChild.bind(box);
    box.insertBefore = (n, r) => { inserted += 1; return ins(n, r); };
    box.removeChild = (n) => { removed += 1; return rem(n); };
    assert.equal(reconcileChildren(box, [a, b, c]), 0, 'the same rows: nothing touched');
    assert.equal(inserted + removed, 0);
    assert.equal(reconcileChildren(box, [a, b, c, d]), 1, 'a new line: one insert');
    assert.equal(inserted, 1);
    assert.equal(reconcileChildren(box, [b, c, d]), 1, 'the oldest goes: one removal');
    assert.equal(removed, 1);
    assert.deepEqual(box.children, [b, c, d]);
    reconcileChildren(box, [d, b, c]);
    assert.deepEqual(box.children, [d, b, c]);
    // A parent without the tree edits (a test double) is drawn whole, only when it changed.
    const flat = { children: [a], replaceChildren(...k) { this.children = k; this.calls = (this.calls || 0) + 1; } };
    assert.equal(reconcileChildren(flat, [a]), 0);
    assert.equal(reconcileChildren(flat, [a, b]), 2);
    assert.equal(flat.calls, 1);
  });

  it('the cache gives the same row for the same key and forgets the rest', () => {
    const cache = createNodeCache();
    let made = 0;
    const make = () => ({ n: ++made });
    const one = cache.get('x', make);
    cache.get('y', make);
    cache.sweep();
    assert.equal(cache.get('x', make), one);
    cache.sweep();
    assert.equal(cache.size, 1, 'y was not used: forgotten');
    assert.notEqual(cache.get('y', make), undefined);
    assert.equal(made, 3);
    assert.deepEqual(uniqueKeys(['a', 'b', 'a', 'a'], (x) => x), ['a', 'b', 'a#2', 'a#3']);
  });

  it('a press on a log\'s words leaves the keys with the world: the log is not focusable while pressed', () => {
    const doc = { listeners: {}, addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); } };
    const log = new FakeEl('div');
    log.setAttribute('tabindex', '0');
    const word = new FakeEl('p');
    const btn = new FakeEl('button');
    log.append(word, btn);
    assert.equal(pressLeavesKeys(log, { doc }), true);
    const up = () => doc.listeners.pointerup.forEach((fn) => fn({}));
    // Words: no tabindex while pressed (the press cannot focus it), back when it ends.
    word.dispatch('pointerdown', { button: 0 });
    assert.equal(log.getAttribute('tabindex'), null);
    up();
    assert.equal(log.getAttribute('tabindex'), '0');
    // A button in the log, or another button of the mouse: left alone.
    btn.dispatch('pointerdown', { button: 0 });
    assert.equal(log.getAttribute('tabindex'), '0');
    word.dispatch('pointerdown', { button: 2 });
    assert.equal(log.getAttribute('tabindex'), '0');
    // A redraw that set its own tabindex meanwhile (the Chats list's -1) keeps it.
    word.dispatch('pointerdown', { button: 0 });
    log.setAttribute('tabindex', '-1');
    up();
    assert.equal(log.getAttribute('tabindex'), '-1');
    assert.match(read('public/js/ui/social-drawer.js'), /pressLeavesKeys\(log, \{ doc: document \}\)/);
    assert.match(read('public/js/classic/classic-panes.js'), /pressLeavesKeys\(lowerLog, \{ doc \}\)/);
  });

});

describe('rows kept between redraws: the Social drawer', () => {
  const saved = {};
  let t;
  let drawer;
  let notifier;
  const log = () => t.dock.querySelector('[data-social-log]');
  const rows = () => log().children.filter((c) => c.tagName === 'P');

  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial', 'groddleBuddies', 'groddleRealtime']) saved[k] = globalThis[k];
    t = page();
    globalThis.document = t.doc;
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    notifier = createNotifier({ onChange: () => drawer?.update() });
    drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, streetName: () => 'Hechey Track', playerMenu: () => true });
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('a new line, a refresh and the same lines again keep the rows that were there', () => {
    drawer.select('local');
    const at = Date.now();
    drawer.push('local', { name: 'Friendly', text: 'see https://groddleafternoon.com/contribute/ ok', playerId: 7, at });
    drawer.push('local', { name: 'Ada', text: 'hello', mine: true, at: at + 1000 });
    const before = rows();
    assert.equal(before.length, 2);
    const time = log().children.find((c) => c.getAttribute('data-social-time') !== null);
    // Things that redraw the drawer without changing the lines (buddies, presence, the street's name).
    drawer.refresh();
    drawer.update();
    drawer.channel('local', { header: null });
    assert.deepEqual(rows(), before, 'the same nodes after redraws');
    assert.equal(log().children.find((c) => c.getAttribute('data-social-time') !== null), time, 'the time line too');
    // A line comes: the earlier rows stay the same nodes, one is added.
    drawer.push('local', { name: 'Friendly', text: 'nice', playerId: 7, at: at + 2000 });
    const after = rows();
    assert.equal(after.length, 3);
    assert.equal(after[0], before[0]);
    assert.equal(after[1], before[1]);
    // The same lines handed over again (an IM's state after a reconnect) keep their rows.
    drawer.setLines('local', drawer.lines('local'));
    assert.deepEqual(rows(), after);
    // The link in the kept row is still there.
    assert.equal(after[0].querySelector('a').getAttribute('href'), 'https://groddleafternoon.com/contribute/');
  });

  it('a conversation keeps its rows while other conversations get lines', () => {
    drawer.channel('im:7', { label: 'Friendly', section: 'private' });
    drawer.select('im:7');
    drawer.push('im:7', { name: 'Friendly', text: 'Might be a little silly', playerId: 7 });
    drawer.push('im:7', { name: 'Ada', text: 'Oh... I should add link support', mine: true });
    const before = rows();
    for (let i = 0; i < 5; i++) drawer.push('local', { name: 'Fi', text: `line ${i}`, playerId: 9 });
    drawer.refresh();
    assert.deepEqual(rows(), before);
  });

  it('Activity: a count going up redraws only that entry', () => {
    drawer.select('activity');
    notifier.notice('Harvested 3 Cherries.');
    notifier.notice('Petted a Piggy.');
    const before = log().children.filter((c) => c.getAttribute('data-kind') !== null);
    assert.equal(before.length, 2);
    notifier.notice('Petted a Piggy.');
    const after = log().children.filter((c) => c.getAttribute('data-kind') !== null);
    assert.equal(after.length, 2);
    assert.equal(after[0], before[0], 'the untouched entry is the same node');
  });

  it('each container keeps its own rows (a row is in one place): logNodes by cache name', () => {
    const a = drawer.logNodes(['local', 'activity'], { cache: 'one' });
    const b = drawer.logNodes(['local', 'activity'], { cache: 'one' });
    const c = drawer.logNodes(['local', 'activity'], { cache: 'two' });
    assert.ok(a.length > 3);
    assert.deepEqual(b, a, 'the same rows again');
    assert.ok(c.every((n, i) => n !== a[i]), 'another container: rows of its own');
    // A skin's own log for a tab is drawn with the drawer's rows, so they stay too.
    drawer.select('local');
    drawer.setLogSource((id) => (id === 'local' ? drawer.logNodes(['local', 'activity'], { cache: 'log' }) : null));
    const merged = log().children.slice();
    drawer.refresh();
    assert.deepEqual(log().children, merged);
    drawer.setLogSource(null);
  });

  it('chat text can be selected: no user-select: none on the logs or their lines', () => {
    for (const f of ['public/style.css', 'public/css/classic.css']) {
      const css = read(f);
      for (const m of css.matchAll(/([^{}]+)\{[^}]*user-select:\s*none[^}]*\}/g)) {
        assert.doesNotMatch(m[1], /social|chat|local-chat|classic-lower/, `${f}: ${m[1].trim()}`);
      }
    }
    const panes = read('public/js/classic/classic-panes.js');
    assert.doesNotMatch(panes, /lowerLog\.replaceChildren|log\.replaceChildren/);
    assert.doesNotMatch(read('public/js/ui/social-drawer.js'), /log\.replaceChildren/);
  });
});
