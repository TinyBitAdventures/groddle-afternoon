/**
 * A phone's side sheet and the notices (Austin's iPhone, 2026-11-12): beside the Skills sheet a notice
 * stood one letter wide down the right edge (the stack centred in the sliver the sheet and the drawer's
 * rail left), and the Social drawer, opened over the sheet, peeked out beside it.
 * Run: node --test tests/notices-beside-sheet.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTICE_MIN_W, noRoomBeside } from '../public/js/notify-view.js?v=f40de936';
import { mountPanelShell } from '../public/js/ui/panel-shell.js?v=06a0d3fe';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const view = readFileSync(join(root, 'public/js/notify-view.js'), 'utf8');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

describe('notices beside a side sheet', () => {
  it('a sliver is no room: the notices wait', () => {
    assert.equal(NOTICE_MIN_W, 240);
    // The iPhone upright: Skills (8 + 320 + 8) and the rail (44 + 8 + 8) on 402 px.
    assert.equal(noRoomBeside(402, 336 + 60), true);
    // The iPhone sideways: 812 - 24 - 396 = 392 px is room.
    assert.equal(noRoomBeside(812, 396), false);
    // No sheet and no drawer: never.
    assert.equal(noRoomBeside(300, 0), false);
    assert.equal(noRoomBeside(1280, 336 + 316), false);
  });
  it('layout waits before it places the stack', () => {
    const at = view.indexOf('if (noRoomBeside(zones.rootW, room)) {');
    assert.ok(at > view.indexOf('function layout()'));
    assert.ok(at < view.indexOf('place = placeBelow(rect, zones.blockers'));
    assert.match(view.slice(at, at + 120), /place = \{ dy: 0, wait: true \};\s*shownBox = null;\s*return;/);
  });
});

/** A sheet element the shell can measure and watch. */
function sheetEl(id, doc) {
  return { id, hidden: true, offsetLeft: 8, offsetWidth: 320, offsetParent: null, ownerDocument: doc, querySelector: () => null, contains: () => false };
}

describe('a phone keeps one of a side sheet and the drawer', () => {
  it('the shell closes its open sheet through the sheet\'s own closer', () => {
    const doc = { body: {}, activeElement: null, byId: {}, getElementById: (id) => doc.byId[id] || null };
    const closed = [];
    doc.byId.skills = sheetEl('skills', doc);
    doc.byId.quests = sheetEl('quests', doc);
    const rootEl = { ownerDocument: doc, dataset: {}, style: { v: {}, getPropertyValue(k) { return this.v[k] || ''; }, setProperty(k, v) { this.v[k] = v; } } };
    const shell = mountPanelShell({
      root: rootEl,
      sheets: [
        { id: 'skills', close: () => { closed.push('skills'); doc.byId.skills.hidden = true; } },
        { id: 'quests', close: () => { closed.push('quests'); doc.byId.quests.hidden = true; } },
      ],
    });
    shell.closeOpen();
    assert.deepEqual(closed, [], 'nothing open, nothing closed');
    doc.byId.skills.hidden = false;
    shell.sync();
    assert.equal(shell.open(), 'skills');
    shell.closeOpen();
    assert.deepEqual(closed, ['skills']);
    assert.equal(shell.open(), '', 'at once, not on the next mutation (the drawer would close too)');
  });
  it('game.js: the one opened last stays, on a phone in Modern, every frame', () => {
    const at = game.indexOf('function oneSheetOrDrawer() {');
    assert.ok(at > 0);
    const fn = game.slice(at, game.indexOf('\n}\n', at));
    assert.match(fn, /if \(!sheet \|\| !drawer \|\| !TOUCH_PHONE \|\| document\.documentElement\.dataset\.ui === 'classic'\) return;/);
    assert.match(fn, /if \(!was\.drawer\) panelShell\.closeOpen\(\);\s*else socialDrawer\.present\(false\);/);
    assert.match(game, /socialDrawer\?\.frame\(\);\n  oneSheetOrDrawer\(\);/);
  });
});
