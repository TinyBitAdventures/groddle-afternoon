/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit item 1; decision 1: a right-click on the world
 * may open the verb menu, a menu is not an act). A right-click on a thing opens the same verb menu
 * a left click does, under the same guards; on a one-click thing (the mailbox, a scene post's arm)
 * the full menu instead of acting (Glitch's Shift+click rule, TSFrontController.as 3703-3790); on a
 * signpost's arm the post's arms. It never walks, runs a verb or cancels the running one.
 * Shift+F10 and the Menu key on the world are Enter.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOneClick, ONE_CLICK_VERBS, signpostArmRows, worldContextAction } from '../public/js/world-context-menu.js?v=2a64801e';
import { hotkeySections } from '../public/js/client-hotkeys.js?v=2922915e';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');

/** A top-level function's body in game.js. */
function fnBody(name) {
  const at = game.indexOf(`\nfunction ${name}(`);
  assert.ok(at > 0, name);
  const end = game.indexOf('\n}\n', at);
  return game.slice(at, end);
}

describe('what a right-click on the world does (js/world-context-menu.js)', () => {
  it('a thing opens its menu; a one-click thing its full menu, never its one verb', () => {
    assert.deepEqual(worldContextAction({ thing: { classId: 'trant_fruit' } }), { kind: 'menu' });
    assert.deepEqual(worldContextAction({ thing: { classId: 'npc_mailbox' } }), { kind: 'menu' });
    assert.equal(isOneClick({ classId: 'npc_mailbox' }), true);
    assert.equal(isOneClick({ classId: 'npc_piggy' }), false);
    assert.equal(ONE_CLICK_VERBS.npc_mailbox, 'view_inbox', 'the verb a left click runs (game.js pointerdown)');
  });

  it('a signpost arm: the post\'s arms; a scene post\'s arm: its target\'s full menu', () => {
    assert.deepEqual(worldContextAction({ board: { key: '1' } }), { kind: 'arms' });
    assert.deepEqual(worldContextAction({ board: { scene: true } }), { kind: 'scene-arm' });
  });

  it('behind a floor it says so, as a left click does; another player opens from anywhere', () => {
    assert.deepEqual(worldContextAction({ thing: { classId: 'npc_piggy' }, outOfReach: true }), { kind: 'out-of-reach' });
    assert.deepEqual(worldContextAction({ thing: { classId: 'pc_remote' }, outOfReach: true }), { kind: 'menu' });
  });

  it('blocked or empty: nothing opens', () => {
    for (const why of ['menu-open', 'map', 'screen', 'camera', 'decorating', 'echo', 'closed-a-menu']) {
      assert.deepEqual(worldContextAction({ blocked: why, thing: { classId: 'npc_piggy' } }), { kind: 'none', why });
    }
    assert.deepEqual(worldContextAction({}), { kind: 'none', why: 'nothing' });
  });

  it('a post\'s arms as rows, top first; a road to nowhere in the game says why', () => {
    const boards = [
      { board: { key: '2', index: 1, label: { text: 'Groddle Meadow' } } },
      { board: { key: '1', index: 0, label: { text: 'Hechey Track' } } },
      { board: { key: '3', index: 2, label: { text: 'The Next Step' }, lost: true } },
    ];
    const rows = signpostArmRows(boards, { inGame: (b) => !b.lost, notInGame: 'Not in the game.' });
    assert.deepEqual(rows.map((r) => [r.label, r.disabled, r.reason]), [
      ['Hechey Track', false, ''],
      ['Groddle Meadow', false, ''],
      ['The Next Step', true, 'Not in the game.'],
    ]);
    assert.equal(rows[0].tip, 'Take this road to Hechey Track');
    assert.equal(rows[1].board, boards[0].board, 'each row keeps its arm');
  });
});

describe('the game wiring', () => {
  it('the canvas: its contextmenu opens the world\'s menu and never the browser\'s', () => {
    assert.match(game, /app\.canvas\.addEventListener\('contextmenu', \(e\) => \{\n\s+e\.preventDefault\(\);\n\s+worldRightClick\(e\);/);
    assert.match(game, /window\.addEventListener\('pointerdown', \(e\) => \{ lastPressAt = e\.timeStamp; \}, true\);/);
  });

  it('the main button still acts; a right press or a Mac Ctrl+click never does', () => {
    // The canvas's pointerdown hands the press to worldPress (a phone's pinch may hold it first).
    assert.match(game, /app\.canvas\.addEventListener\('pointerdown', \(e\) => \{[\s\S]{0,120}worldPress\(e\);/);
    const at = game.indexOf('function worldPress(e) {');
    const press = game.slice(at, game.indexOf('\n  }\n', at));
    assert.match(press, /if \(e\.pointerType === 'mouse' && e\.button !== 0\) return;/);
    assert.match(press, /if \(e\.pointerType === 'mouse' && e\.ctrlKey && MAC_CTRL_CLICK\) return;/);
    assert.match(press, /e\.timeStamp === worldCtxMenu\?\.closedByPressAt\(\)/);
  });

  it('the same guards as a left click, plus Camera Mode, Decorate and Cultivate, the echo and the closing press', () => {
    const body = fnBody('worldRightClick');
    for (const guard of [/!state\.started/, /menuTarget \? 'menu-open'/, /isMapOpen\(\) \? 'map'/, /isScreenFxBlocking\(\) \? 'screen'/,
      /cameraMode === '1' \? 'camera'/, /features\.query\('homeEditMode', engine\) \? 'decorating'/, /worldMenuEchoUntil \? 'echo'/,
      /verbMenuClosedByPointerAt === lastPressAt/]) assert.match(body, guard);
    assert.match(body, /pickInteractableAt\(sx, sy\)/, 'the left click\'s pick');
    assert.match(body, /behindFloorFromPlayer\(best\) && !walkOverReaches\(best\)/, 'the left click\'s reach rule');
  });

  it('it never walks, runs a verb, travels or cancels the running verb', () => {
    const body = fnBody('worldRightClick') + fnBody('openWorldMenuFor');
    for (const act of [/requestVerb\(/, /executeVerb\(/, /travelTo\(/, /cancelCurrentAction\(/, /takeSceneArm\(/, /walkTo\(/]) assert.doesNotMatch(body, act);
    assert.match(fnBody('openWorldMenuFor'), /openVerbMenu\(target\);/);
    // The arms menu travels only when a row is picked (takeSignBoard, as a click on the arm).
    assert.match(fnBody('openSignpostArmsMenu'), /onPick: \(id\) => \{[\s\S]*takeSignBoard\(\{ view, board: row\.board \}\)/);
  });

  it('Shift+F10 and the Menu key on the world are Enter (the nearest thing\'s menu), and the help says so', () => {
    assert.match(game, /if \(isMenuKey\(e\) && \(e\.target === app\?\.canvas \|\| e\.target === document\.body\)\) \{[\s\S]{0,260}worldMenuEchoUntil = Date\.now\(\) \+ 1000;[\s\S]{0,120}tryOpenNearestMenu\(\);/);
    assert.match(game, /app\.canvas\.setAttribute\('aria-keyshortcuts', 'Enter E Shift\+F10 ContextMenu'\);/);
    const rows = hotkeySections().flatMap((s) => s.rows);
    const row = rows.find((r) => r[0] === 'Right-click Menu');
    assert.ok(row);
    assert.deepEqual(row[1], [['Shift', 'F10'], ['Menu']]);
  });

  it('QA: the world menu a right-click opened says so in canvas data contextMenu, cleared on close', () => {
    assert.match(fnBody('openWorldMenuFor'), /setCanvasData\('contextMenu', `world:\$\{target\.classId \|\| target\.kind \|\| ''\}`\)/);
    assert.match(fnBody('closeVerbMenu'), /contextMenu\?\.startsWith\('world:'\)\) app\.canvas\.dataset\.contextMenu = ''/);
  });
});
