/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit item 7): a Quests card's menu, matching the
 * pinned tracker's: a right-click on a card, or Shift+F10 or the Menu key on its focused head, opens
 * Pin to screen or Unpin, Open or Close, then the card's own buttons (Try it, Enter ..., Not right
 * now). Each row presses the card's own control (R3: nothing new). A left click on the head still
 * opens or closes it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeEl, matches } from './social-fake-dom.js';
import { createQuestSheet, questCardMenuRows } from '../public/js/ui/quest-sheet.js?v=1dffc3a6';

class El extends FakeEl {
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) if (n instanceof FakeEl && matches(n, sel)) return n;
    return null;
  }
}

function card({ quest = 'porcine_pleaser', open = false, pinned = false, full = false, buttons = [] } = {}) {
  const c = new El('div');
  c.className = `q-card qc${open ? ' is-open' : ''}`;
  if (quest) c.dataset.quest = quest;
  const head = new El('button');
  head.className = 'qc-head';
  const title = new El('span');
  title.className = 'q-title qc-title';
  title.textContent = 'Porcine Pleaser';
  head.append(title);
  const body = new El('div');
  body.className = 'qc-body';
  const clicks = [];
  for (const label of buttons) {
    const b = new El('button');
    b.className = 'content-action-btn';
    b.textContent = label;
    b.addEventListener('click', () => clicks.push(label));
    body.append(b);
  }
  if (quest) {
    const pin = new El('button');
    pin.className = 'qc-pin';
    pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    if (full) {
      pin.setAttribute('aria-disabled', 'true');
      pin.title = 'You can pin two quests. Unpin one first.';
    }
    pin.addEventListener('click', () => clicks.push('pin'));
    body.append(pin);
  }
  head.addEventListener('click', () => clicks.push('head'));
  c.append(head, body);
  return { c, head, clicks };
}

describe('a Quests card\'s rows (js/ui/quest-sheet.js questCardMenuRows)', () => {
  it('an active card: Pin to screen, Open, then its buttons', () => {
    const { c } = card({ buttons: ['Try it'] });
    assert.deepEqual(questCardMenuRows(c).map((r) => [r.id, r.label, Boolean(r.disabled)]), [
      ['pin', 'Pin to screen', false], ['toggle', 'Open', false], ['act1', 'Try it', false],
    ]);
  });

  it('a pinned, open card: Unpin and Close; two pinned already: Pin says why', () => {
    assert.deepEqual(questCardMenuRows(card({ pinned: true, open: true }).c).map((r) => r.label), ['Unpin', 'Close']);
    const full = questCardMenuRows(card({ full: true }).c)[0];
    assert.equal(full.disabled, true);
    assert.equal(full.reason, 'You can pin two quests. Unpin one first.');
  });

  it('an offered card (no Pin): Open and its way in, as "Ok, I\'ll do it!" or a story quest\'s', () => {
    assert.deepEqual(questCardMenuRows(card({ quest: '', buttons: ["Ok, I'll do it!"] }).c).map((r) => r.label), ['Open', "Ok, I'll do it!"]);
  });
});

describe('the menu on the sheet', () => {
  function setup() {
    globalThis.document = { activeElement: null, body: new El('body') };
    const opened = [];
    const menu = {
      open: (o) => { opened.push(o); return true; },
      isOpenFor: () => false,
      owner: () => '',
      close() {},
    };
    const box = new El('div');
    box.id = 'quest';
    const one = card({ buttons: ['Enter the Back Alley'] });
    box.append(one.c);
    const sheet = createQuestSheet({ document: globalThis.document, contextMenu: menu });
    sheet.bindMenu(box);
    return { box, one, opened, sheet };
  }

  it('a right-click on a card opens its menu at the pointer, never the browser\'s', () => {
    const s = setup();
    const e = s.one.head.dispatch('contextmenu', { clientX: 400, clientY: 300, button: 2 });
    assert.equal(e.defaultPrevented, true);
    assert.equal(s.opened.length, 1);
    const o = s.opened[0];
    assert.deepEqual(o.at, { x: 400, y: 300 });
    assert.equal(o.keys, false);
    assert.equal(o.owner, 'quest-card:porcine_pleaser');
    assert.equal(o.title, 'Porcine Pleaser');
    assert.deepEqual(o.rows.map((r) => r.label), ['Pin to screen', 'Open', 'Enter the Back Alley']);
    assert.deepEqual(s.one.clicks, [], 'opening it presses nothing');
    delete globalThis.document;
  });

  it('Shift+F10 on the head opens it beside the head; a pick presses the card\'s own control', () => {
    const s = setup();
    const k = s.one.head.dispatch('keydown', { key: 'F10', shiftKey: true });
    assert.equal(k.stopped, true);
    const o = s.opened[0];
    assert.equal(o.keys, true);
    assert.equal(o.at, null);
    assert.equal(o.anchor, s.one.head);
    assert.equal(o.opener, s.one.head);
    o.onPick('pin', { keys: true });
    o.onPick('toggle', { keys: true });
    o.onPick('act1', { keys: true });
    assert.deepEqual(s.one.clicks, ['pin', 'head', 'Enter the Back Alley']);
    delete globalThis.document;
  });

  it('a left click on the head is unchanged (no menu)', () => {
    const s = setup();
    s.one.head.click();
    assert.deepEqual(s.one.clicks, ['head']);
    assert.equal(s.opened.length, 0);
    delete globalThis.document;
  });
});

describe('the wiring', () => {
  const pub = join(import.meta.dirname, '../public');
  it('game.js gives the sheet a shared context menu and binds it on #quest; closing the sheet closes it', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /contextMenu: createContextMenu\(\{ doc: document, host: document\.getElementById\('game-root'\), id: 'quest-card-menu'/);
    assert.match(game, /questSheet\.bindMenu\(document\.getElementById\('quest'\)\);/);
    assert.match(game, /function closeQuestPanel\(\) \{[\s\S]{0,140}questSheet\.closeMenu\(\);/);
  });

  it('each card is [data-ctx] and its head says Shift+F10 for more', () => {
    const src = readFileSync(join(pub, 'js/ui/quest-sheet.js'), 'utf8');
    assert.match(src, /card\.dataset\.ctx = 'quest-card';/);
    assert.match(src, /head\.setAttribute\('aria-keyshortcuts', 'Shift\+F10'\);/);
    assert.match(src, /\$\{MORE_KEYS_LABEL\}`\);/);
  });
});
