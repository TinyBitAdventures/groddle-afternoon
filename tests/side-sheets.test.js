/**
 * The side sheets (Quests, Make, Badges, Skills, Buffs, Feat) sit beside the world, not over it
 * (Austin 2026-10-30): the avatar walks, jumps and acts while one is open; only a text field in the
 * sheet takes the keys, and the number keys and buttons in it only while focus is there.
 * Run: node --test tests/side-sheets.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIDE_SHEET_IDS, sheetKeyToWorld } from '../public/js/ui/panel-shell.js?v=g472-3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

describe('side sheets are not modal', () => {
  it('walking and jumping go on to the world, wherever focus is', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', 'A', 'D']) {
      assert.equal(sheetKeyToWorld({ key }), true, key);
      assert.equal(sheetKeyToWorld({ key }, { focusInSheet: true }), true, `${key} with the title focused`);
    }
    assert.equal(sheetKeyToWorld({ key: ' ' }), true);
    assert.equal(sheetKeyToWorld({ key: 'Enter' }), true);
    assert.equal(sheetKeyToWorld({ key: 'e' }), true);
  });

  it('a button in the sheet takes Space, Enter and E; the number keys stay with a focused sheet', () => {
    const onButton = { focusInSheet: true, focusOnControl: true };
    for (const key of [' ', 'Enter', 'e']) assert.equal(sheetKeyToWorld({ key }, onButton), false, key);
    assert.equal(sheetKeyToWorld({ key: '5' }), true, 'Say Hi with focus in the world');
    assert.equal(sheetKeyToWorld({ key: '5' }, { focusInSheet: true }), false);
  });

  it('the panels\' letters, Shift letters and the browser\'s keys stay off the world', () => {
    for (const key of ['q', 'n', 'c', 'k', 'b', 'h', 'y', 'm', 'f', 't', 'x']) assert.equal(sheetKeyToWorld({ key }), false, key);
    assert.equal(sheetKeyToWorld({ key: 'S', shiftKey: true }), false, 'Shift+S is the skills key');
    assert.equal(sheetKeyToWorld({ key: 'a', metaKey: true }), false);
    assert.equal(sheetKeyToWorld({ key: 'ArrowLeft', ctrlKey: true }), false);
  });

  it('game.js: no side sheet blocks movement or makes the game busy; a text field still takes the keys', () => {
    assert.deepEqual([...SIDE_SHEET_IDS], ['quest-panel', 'make-panel', 'achieve-panel', 'skills-panel', 'buffs-panel', 'feat-panel']);
    const blocked = game.slice(game.indexOf('function gameplayInputBlocked() {'), game.indexOf('function publishJumpState('));
    for (const open of ['isQuestOpen()', 'isMakeOpen()', 'isAchieveOpen()', 'isSkillsOpen()', 'isBuffsOpen()', 'isFeatOpen()']) {
      assert.ok(!blocked.includes(open), `${open} does not stop the avatar`);
    }
    for (const open of ['isMapOpen()', 'isQuestDialogueOpen()', 'isPackPopoverOpen()', 'isScreenFxBlocking()']) assert.ok(blocked.includes(open), `${open} still does`);
    assert.match(game, /return found\.some\(\(n\) => !SIDE_SHEET_IDS\.includes\(n\.id\) &&/);
    assert.match(game, /if \(modal \|\| !sheetKeyToWorld\(e, \{ focusInSheet, focusOnControl \}\)\) return;/);
    // A field (the recipe search) has the keys: the window's handler stops at an input, Esc blurs it.
    assert.match(game, /if \(e\.target\?\.matches\?\.\('input, textarea, select, \[contenteditable="true"\]'\)\) \{\s+if \(e\.key === 'Escape'\) \{\s+e\.target\.blur\(\);/);
  });
});
