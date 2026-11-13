/**
 * #223 (Friendly, 2026-11-12): a search box in Activity. The Social drawer's Activity tab has a
 * magnifying glass in its head that opens a box over the log; typing shows only the entries that
 * hold every word, Esc clears and closes it (and the keys go back to the game), and leaving
 * Activity clears it. js/ui/social-drawer.js FIND, style.css and css/classic.css (activity-find).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIND_TEXT, activityMatches, foldFind, mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=99cc04a6';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';
import { memoryStore, page } from './social-fake-dom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function mount(mode = 'online') {
  const p = page();
  globalThis.document = p.doc;
  globalThis.CSS ||= { escape: (v) => String(v) };
  globalThis.addEventListener = () => {};
  let drawer = null;
  let t = 0;
  const notifier = createNotifier({ now: () => 0, clock: () => (t += 60000), onChange: () => drawer?.update() });
  drawer = mountSocialDrawer({ root: p.game, dock: p.dock, notifier, mode, storage: memoryStore(), width: () => 1920, canChat: () => true, streetName: () => 'Hechey Track', setData: () => {} });
  drawer.open();
  for (const line of ['You got 3 Cherries from a Fruit Tree', 'You petted a Piggy', 'Ada gave you a <b>Café</b> Latte', 'You got 2 Cherries']) notifier.log(line, line.includes('<b>') ? { html: line } : {});
  drawer.update?.();
  const q = (sel) => p.dock.querySelector(sel);
  const shown = () => q('[data-social-log]').children.filter((n) => n.getAttribute?.('data-kind')).map((n) => n.textContent.replace(/\d+:\d+ [AP]M.*$/, '').trim());
  return { ...p, drawer, notifier, q, shown };
}

describe('#223: search Activity', () => {
  it('activityMatches: every word, any case, accents folded, markup read as text; time lines never match', () => {
    const e = { text: 'You got 3 Cherries from a Fruit Tree' };
    assert.equal(activityMatches(e, ''), true);
    assert.equal(activityMatches(e, '  '), true);
    assert.equal(activityMatches(e, 'CHERR tree'), true);
    assert.equal(activityMatches(e, 'cherries piggy'), false);
    assert.equal(activityMatches({ html: 'Ada gave you a <b>Café</b> Latte' }, 'cafe latte'), true);
    assert.equal(activityMatches({ html: '<span class="x">b</span>' }, 'span'), false, 'tags are not words');
    assert.equal(activityMatches({ sep: '9:31 AM' }, '9'), false);
    assert.equal(foldFind('Á&amp;B'), 'a&b');
    for (const w of [FIND_TEXT.open, FIND_TEXT.label, FIND_TEXT.placeholder, FIND_TEXT.none('x')]) assert.doesNotMatch(w, /[—–]/);
  });

  it('the glass shows on Activity only; it opens the box, typing filters, Esc clears and lets go', () => {
    const t = mount();
    t.drawer.select('activity');
    const btn = t.q('[data-social-find]');
    assert.equal(btn.hidden, false);
    assert.equal(btn.getAttribute('aria-label'), 'Search Activity');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(t.q('[data-social-find-bar]'), null, 'no box until asked');
    assert.equal(t.shown().length, 4);
    btn.click();
    const box = t.q('#social-find-input');
    assert.ok(box, 'the box is over the log');
    assert.equal(t.doc.activeElement, box, 'the caret is in it');
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    box.value = 'cherries';
    box.dispatch('input');
    assert.deepEqual(t.shown(), ['You got 3 Cherries from a Fruit Tree', 'You got 2 Cherries']);
    assert.equal(t.q('[data-social-log]').getAttribute('data-social-find'), '2');
    box.value = 'cafe';
    box.dispatch('input');
    assert.equal(t.shown().length, 1);
    box.value = 'dragon';
    box.dispatch('input');
    assert.equal(t.shown().length, 0);
    assert.equal(t.q('[data-social-find-none]').textContent, FIND_TEXT.none('dragon'));
    // A new entry that matches shows as it comes.
    box.value = 'piggy';
    box.dispatch('input');
    t.notifier.log('You petted another Piggy');
    t.drawer.update?.();
    assert.equal(t.shown().length, 2);
    let blurred = false;
    box.blur = () => { blurred = true; };
    const esc = box.dispatch('keydown', { key: 'Escape' });
    assert.equal(esc.stopped, true, 'Esc is the box\'s: it closes nothing else');
    assert.equal(blurred, true, 'the keys go back to the game');
    assert.equal(box.value, '');
    assert.equal(t.q('[data-social-find-bar]'), null);
    assert.equal(t.shown().length, 5, 'every entry again');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
  });

  it('a second click on the glass closes it; leaving Activity clears it and hides the glass', () => {
    const t = mount();
    t.drawer.select('activity');
    const btn = t.q('[data-social-find]');
    btn.click();
    const box = t.q('#social-find-input');
    box.value = 'cherries';
    box.dispatch('input');
    btn.click();
    assert.equal(t.q('[data-social-find-bar]'), null);
    assert.equal(t.shown().length, 4);
    btn.click();
    box.value = 'piggy';
    box.dispatch('input');
    t.drawer.select('local');
    assert.equal(btn.hidden, true);
    t.drawer.select('activity');
    assert.equal(t.q('[data-social-find-bar]'), null, 'closed after leaving');
    assert.equal(box.value, '');
    assert.equal(t.shown().length, 4);
  });

  it('solo has it too (Activity is the drawer\'s only tab)', () => {
    const t = mount('solo');
    const btn = t.q('[data-social-find]');
    assert.equal(btn.hidden, false);
    btn.click();
    const box = t.q('#social-find-input');
    box.value = 'fruit';
    box.dispatch('input');
    assert.equal(t.shown().length, 1);
  });

  it('styled in Modern and Classic with tokens; the glass sits in the head before the collapse arrow', () => {
    const css = read('public/style.css');
    assert.match(css, /\.social-find-input \{[^}]*border-radius: var\(--radius-pill\)/);
    assert.match(css, /\.social-find-btn\[hidden\] \{ display: none; \}/);
    const classic = read('public/css/classic.css');
    const block = classic.slice(classic.indexOf('/* === activity-find (lane) === */'), classic.indexOf('/* === end activity-find === */'));
    assert.ok(block.length > 100 && classic.indexOf('/* === end activity-find === */') < classic.indexOf('/* == TICKETS =='));
    for (const line of block.split('\n').filter((l) => l.includes('{'))) assert.ok(line.startsWith(':root[data-ui="classic"]'), line);
    const src = read('public/js/ui/social-drawer.js');
    assert.match(src, /head\.append\(title, findBtn, collapseBtn\);/);
  });
});
