/**
 * #586 (a phone, upright, online): Act pressed quickly on a street tree chose the wrong rows. "Pet,
 * water, harvest, harvest, talk to might become Pet, talk to, water." Right after a verb, the tree's
 * menu opens while the street still answers it: the rows the street decides (Pet, Water, Harvest)
 * are greyed with the busy line (#476, js/street-objects.js greyWaitingVerbs), so the first row that
 * could be done, and the one Act's next press chose, was Talk to. Glitch's menu took no choice until
 * the server had sent its verbs (InteractionMenuController.as startItemstackMenu 709-723). Now Act's
 * presses on a waiting menu are kept, in order, and done when the answer redraws it
 * (js/ui/verb-menu.js actVerbMenu, settleVerbMenu; game.js refreshVerbMenu).
 * Run: node --test tests/act-quick-presses-586.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { actVerbMenu, dropVerbMenuActs, focusVerbRow, makeVerbRow, settleVerbMenu, verbMenuWaiting, verbRowAttrs } from '../public/js/ui/verb-menu.js?v=1ad4f969';
import { greyWaitingVerbs } from '../public/js/street-objects.js?v=7d1864e8';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

/** A world verb menu with just enough DOM for verb-menu.js; a usable row's click runs it and closes the menu. */
function fakeMenu() {
  const doc = { activeElement: null };
  const ran = [];
  let rows = [];
  const el = {
    hidden: false,
    ownerDocument: doc,
    dataset: {},
    contains: (n) => n === el || rows.includes(n),
    querySelector: (sel) => (sel === '[data-vm-wait]' ? rows.find((r) => r.wait) || null : null),
    querySelectorAll: () => rows,
  };
  /** Draw the rows: [label, 'ok' | 'wait' | 'done']. */
  const draw = (spec) => {
    doc.activeElement = null;
    rows = spec.map(([label, how]) => {
      const classes = new Set(['vm-row']);
      const row = {
        label,
        wait: how === 'wait',
        dataset: {},
        disabled: false,
        classList: { contains: (c) => classes.has(c), toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)) },
        getAttribute: (a) => (a === 'aria-disabled' && how !== 'ok' ? 'true' : null),
        hasAttribute: (a) => a === 'data-vm-wait' && how === 'wait',
        getClientRects: () => [1],
        closest: (sel) => (sel === '.vm-row' ? row : null),
        matches: (sel) => sel === 'button',
        focus: () => { doc.activeElement = row; },
        click: () => {
          if (how !== 'ok') return;
          ran.push(label);
          el.hidden = true;
          dropVerbMenuActs(el);
        },
      };
      return row;
    });
  };
  const lit = () => doc.activeElement?.label ?? null;
  return { el, draw, ran, lit };
}

const WAITING = [['Pet', 'wait'], ['Water', 'wait'], ['Harvest', 'wait'], ['Talk to', 'ok']];
const AFTER_PET = [['Pet', 'done'], ['Water', 'ok'], ['Harvest', 'ok'], ['Talk to', 'ok']];

describe('#586 Act on a menu still waiting on the street', () => {
  it('the second quick press waits for the answer and chooses Water, not Talk to', () => {
    const m = fakeMenu();
    m.draw(WAITING);
    assert.equal(verbMenuWaiting(m.el), true);
    const act = actVerbMenu(m.el);
    act.choose();
    assert.deepEqual(m.ran, [], 'nothing runs while the street answers');
    assert.equal(m.lit(), null, 'and Talk to was not lit for it');
    // The answer lands: refreshVerbMenu draws the rows again and lights the first one.
    m.draw(AFTER_PET);
    assert.equal(verbMenuWaiting(m.el), false);
    focusVerbRow(m.el);
    assert.equal(settleVerbMenu(m.el), 1);
    assert.deepEqual(m.ran, ['Water']);
  });

  it('a drag kept while waiting steps from the answered first row, in the order pressed', () => {
    const m = fakeMenu();
    m.draw(WAITING);
    const act = actVerbMenu(m.el);
    act.step(1);
    act.choose();
    act.choose();
    m.draw(AFTER_PET);
    focusVerbRow(m.el);
    assert.equal(settleVerbMenu(m.el), 2, 'the extra press stops once a choice closed the menu');
    assert.deepEqual(m.ran, ['Harvest']);
  });

  it('a menu that is not waiting is driven at once, as before', () => {
    const m = fakeMenu();
    m.draw(AFTER_PET);
    focusVerbRow(m.el);
    actVerbMenu(m.el).choose();
    assert.deepEqual(m.ran, ['Water']);
  });

  it('closing the menu drops what was kept', () => {
    const m = fakeMenu();
    m.draw(WAITING);
    actVerbMenu(m.el).choose();
    dropVerbMenuActs(m.el);
    m.draw(AFTER_PET);
    assert.equal(settleVerbMenu(m.el), 0);
    assert.deepEqual(m.ran, []);
  });

  it('the street\'s greyed rows say they are waiting, and the rows carry it', () => {
    const out = greyWaitingVerbs([{ id: 'pet', enabled: true }, { id: 'talk_to', enabled: true }], (v) => v.id === 'pet');
    assert.equal(out[0].waiting, true);
    assert.equal(out[1].waiting, undefined);
    const attrs = new Map();
    const btn = { dataset: {}, setAttribute: (k, v) => attrs.set(k, v), innerHTML: '' };
    makeVerbRow({ createElement: () => btn }, { label: 'pet', disabled: true, wait: true, reason: 'Hold on' });
    assert.ok('vmWait' in btn.dataset);
    assert.match(verbRowAttrs({ disabled: true, wait: true }), /data-vm-wait/);
    assert.doesNotMatch(verbRowAttrs({ wait: true }), /data-vm-wait/, 'only a greyed row waits');
  });

  it('game.js: Act drives the world menu through actVerbMenu; a waiting menu lights nothing until its answer, which runs the kept presses', () => {
    assert.match(game, /if \(menuTarget && menu && !menu\.hidden\) return actVerbMenu\(menu\);/);
    const open = game.slice(game.indexOf('function openVerbMenu('), game.indexOf('function refreshVerbMenu('));
    assert.match(open, /dropVerbMenuActs\(menu\);/);
    assert.match(open, /if \(menuTarget === target && !menu\.hidden && !verbMenuWaiting\(menu\)\) focusVerbRow\(menu\);/);
    const refresh = game.slice(game.indexOf('function refreshVerbMenu('), game.indexOf('function verbMenuSig('));
    assert.match(refresh, /const waited = verbMenuWaiting\(menu\);\s*renderVerbMenu\(target, verbs\);/);
    assert.match(refresh, /else if \(waited && !verbMenuWaiting\(menu\)\) \{[\s\S]{0,160}focusVerbRow\(menu\);/);
    assert.match(refresh, /const acts = settleVerbMenu\(menu\);/);
    assert.match(game, /wait: Boolean\(v\.waiting\),/);
    const close = game.slice(game.indexOf('function closeVerbMenu('), game.indexOf('function isFeedPickerOpen('));
    assert.match(close, /dropVerbMenuActs\(menu\);/);
  });
});
