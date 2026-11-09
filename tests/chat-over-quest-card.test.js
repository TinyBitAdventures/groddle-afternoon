/**
 * "/" puts the keyboard in the chat box while a quest card (an offer or a conversation) is open
 * (game.js socialChatReady; the client's / focused the chat, KeyBeacon.as 32-33). Found by
 * the signals lane, 2026-11-08: the offer kept "/" from reaching the chat. What is typed then goes
 * to the box, never the card's buttons: the window's key handler returns for a text field.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const src = readFileSync(join(ROOT, 'game.js'), 'utf8');
const blocking = src.match(/function isScreenFxBlocking\([^)]*\) \{[\s\S]*?\n\}/)[0];
const ready = src.match(/function socialChatReady\(\) \{[\s\S]*?\n\}/)[0];

/** The two functions over a fake page: `open` names the ids shown (`is-visible` for the screens). */
function load(open = [], { panel = false, started = true } = {}) {
  const nodes = new Map();
  for (const id of ['screen-transition', 'award-screen', 'new-day-screen', 'feed-picker', 'emotional-bear-picker', 'quest-dialogue', 'home-panel', 'mail-panel']) {
    nodes.set(id, { hidden: !open.includes(id), classList: { contains: () => open.includes(id) } });
  }
  const document = {
    getElementById: (id) => nodes.get(id) || null,
    body: { classList: { contains: () => false } },
  };
  return new Function(
    'document', 'state', 'currentAction', 'menuTarget', 'enterChooser', 'panelOnScreen',
    `${blocking}; ${ready}; return { isScreenFxBlocking, socialChatReady };`
  )(document, { started }, null, null, null, () => panel);
}

describe('chat over a quest card', () => {
  it('an open offer leaves "/" free for the chat', () => {
    assert.equal(load(['quest-dialogue']).socialChatReady(), true);
  });
  it('the offer still holds everything else that waits on a screen', () => {
    assert.equal(load(['quest-dialogue']).isScreenFxBlocking(), true);
    assert.equal(load([]).isScreenFxBlocking(), false);
  });
  it('a real screen, a picker or a panel still keeps the chat shut', () => {
    assert.equal(load(['quest-dialogue', 'award-screen']).socialChatReady(), false);
    assert.equal(load(['feed-picker']).socialChatReady(), false);
    assert.equal(load(['quest-dialogue'], { panel: true }).socialChatReady(), false);
    assert.equal(load([], { started: false }).socialChatReady(), false);
  });
  it('keys typed in the chat box never reach the card: the window handler returns for a text field first', () => {
    const handler = src.slice(src.indexOf("window.addEventListener('keydown', (e) => {\n    if (e.target?.matches?.('input, textarea"));
    const fieldReturn = handler.indexOf("if (e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]')) {");
    const cardEscape = handler.indexOf('closeQuestDialogue({ dismiss: true })');
    assert.ok(fieldReturn >= 0 && cardEscape > fieldReturn, 'the text-field return comes before the card handling');
    // Escape in the box only leaves it.
    assert.match(handler.slice(fieldReturn, fieldReturn + 200), /if \(e\.key === 'Escape'\) \{\n\s+e\.target\.blur\(\);\n\s+e\.preventDefault\(\);\n\s+\}\n\s+return;/);
  });
});
