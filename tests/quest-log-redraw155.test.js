// #155: the Quests sheet showed the tab counts and the footer ("26 active · 8 offered · 32 done") over
// no rows. The redraw swaps a fresh draw in only when its markup changed (G255), so a list that lost
// its rows while the markup stayed the same was never drawn again; it now also swaps when the shown
// list holds fewer elements than the draw. A report's context now says how the sheet was drawn.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { questLogNeedsSwap } from '../public/js/ui/quest-sheet.js?v=ccaa43a8';
import { openPanels, questLogDetail } from '../public/js/features/bug-report-feature.js?v=d93d29dc';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

/** A small element tree: ids, classes, [role="tab"], aria-selected, hidden. */
function el(attrs = {}, children = []) {
  const n = { ...attrs, hidden: Boolean(attrs.hidden), children, dataset: attrs.dataset || {}, attrs: { ...(attrs.attrs || {}) } };
  n.getAttribute = (k) => n.attrs[k] ?? null;
  n.getClientRects = () => (n.hidden ? [] : [1]);
  const all = () => children.flatMap((c) => [c, ...c.all()]);
  n.all = all;
  const has = (c) => String(n.className || '').split(' ').includes(c);
  n.matches = (sel) => sel.split(',').map((x) => x.trim()).some((x) => {
    if (x.startsWith('#')) return n.id === x.slice(1);
    if (x.startsWith('.')) return x.slice(1).split('.').every(has);
    if (x === '[role="tab"]') return n.attrs.role === 'tab';
    return false;
  });
  n.querySelectorAll = (sel) => all().filter((c) => c.matches(sel));
  n.querySelector = (sel) => n.querySelectorAll(sel)[0] || null;
  return n;
}

function sheet({ active = 26, offered = 8, done = 32, tab = 'active', shownActive = active, drawn = true } = {}) {
  const tabs = el({ id: 'quest-tabs' }, ['active', 'offered', 'done'].map((t) => el({
    attrs: { role: 'tab', 'aria-selected': t === tab ? 'true' : 'false' },
    dataset: { tab: t },
    textContent: `${t[0].toUpperCase()}${t.slice(1)} ${{ active, offered, done }[t]}`,
  })));
  const cards = [];
  if (drawn) {
    for (let i = 0; i < active; i++) cards.push(el({ className: 'q-card qc', hidden: tab !== 'active' || i >= shownActive }));
    for (let i = 0; i < offered; i++) cards.push(el({ className: 'q-card qc q-put-off', hidden: tab !== 'offered' }));
    for (let i = 0; i < done; i++) cards.push(el({ className: 'q-card qc done', hidden: tab !== 'done' }));
  }
  const list = el({ id: 'quest', className: 'quest-log-body' }, cards);
  return el({ id: 'quest-panel', className: 'side-panel quest-panel ui-sheet' }, [tabs, list]);
}

describe('#155 the Quests list redraws when it lost its rows', () => {
  it('swaps when the markup changed, as before (G255)', () => {
    assert.equal(questLogNeedsSwap({ drawn: '<b>', lastDrawn: '<a>', shownCount: 5, drawnCount: 5 }), true);
    assert.equal(questLogNeedsSwap({ drawn: '<a>', lastDrawn: '<a>', shownCount: 5, drawnCount: 5 }), false, 'no swap under the pointer');
  });

  it('swaps when the shown list holds fewer rows than the draw, though the markup is the same', () => {
    assert.equal(questLogNeedsSwap({ drawn: '<a>', lastDrawn: '<a>', shownCount: 0, drawnCount: 66 }), true, 'emptied');
    assert.equal(questLogNeedsSwap({ drawn: '<a>', lastDrawn: '<a>', shownCount: 40, drawnCount: 66 }), true, 'some rows detached');
    assert.equal(questLogNeedsSwap({ drawn: '<a>', lastDrawn: '<a>', shownCount: 66, drawnCount: 66 }), false);
  });

  it('game.js asks it with the live list and the fresh draw', () => {
    const block = game.slice(game.indexOf("const qShown = document.getElementById('quest');"), game.indexOf('renderQuestTracker();'));
    assert.match(block, /questLogNeedsSwap\(\{ drawn, lastDrawn: questLogDrawn, shownCount: qShown\.childElementCount, drawnCount: qBox\.childElementCount \}\)/);
    assert.match(block, /qShown\.replaceChildren\(\.\.\.qBox\.childNodes\);\s*questLogDrawn = drawn;/);
    // The count is read before the swap moves the nodes out of qBox.
    assert.ok(block.indexOf('qBox.childElementCount') < block.indexOf('qShown.replaceChildren'));
  });
});

describe('#155 a report says how the Quests sheet was drawn', () => {
  it('names the tab, the cards shown of those drawn and the tab counts', () => {
    assert.equal(questLogDetail(sheet()), 'active 26/66 cards, tabs 26/8/32');
    assert.equal(questLogDetail(sheet({ shownActive: 0 })), 'active 0/66 cards, tabs 26/8/32', 'drawn but not shown');
    assert.equal(questLogDetail(sheet({ drawn: false })), 'active 0/0 cards, tabs 26/8/32', 'never drawn');
    assert.equal(questLogDetail(sheet({ tab: 'done' })), 'done 32/66 cards, tabs 26/8/32');
    assert.equal(questLogDetail(el({ id: 'quest-panel' })), '', 'no list: nothing');
  });

  it('rides the open windows in the report context (no new site field)', () => {
    globalThis.getComputedStyle ||= () => ({ visibility: 'visible' });
    const doc = el({}, [sheet({ shownActive: 0 })]);
    assert.deepEqual(openPanels(doc), ['quest:active 0/66 cards, tabs 26/8/32']);
    // It fits the site's 300-character panels field with the other windows beside it.
    assert.ok(openPanels(doc).join(', ').length < 120);
  });
});
