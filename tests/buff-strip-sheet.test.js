/**
 * Report #125: an open side sheet (Make, a grinder's window, Quests ...) covered the buff strip, so a
 * running buff could not be watched. The modern skin's strip stands beside the sheet, as the quest
 * tracker does; Classic's windows sit in the middle of the world and leave it in sight, unchanged.
 * Screenshots of 1280, 800, 640, 390 and 340 px and of Classic were looked at (lane report).
 * Report #286: Classic's one rule for the strip puts it right of the energy line, as the client did
 * (BuffViewManager.as 116-119); it never follows an open sheet.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const classic = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
const rule = (selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  return css.slice(at, css.indexOf('}', at));
};

describe('the buff strip and an open side sheet', () => {
  it('stands beside the sheet and wraps in the width left', () => {
    const r = rule('[data-ui="modern"] #game-root[data-sheet] #buff-strip');
    assert.match(r, /left: max\(var\(--hud-inset\), var\(--inset-l, 0px\)\)/);
    assert.match(r, /max-width: calc\(100% - max\(var\(--hud-inset\), var\(--inset-l, 0px\)\) - var\(--inset-r, 0px\) - var\(--hud-inset\)\)/);
    assert.match(r, /flex-wrap: wrap/);
  });

  it('still steps under the tracker, which stands beside the sheet too', () => {
    assert.match(css, /\[data-ui="modern"\] #game-root\[data-sheet\] #quest-pins:not\(\[hidden\]\) \{ left: max\(var\(--hud-inset\), var\(--inset-l, 0px\)\); \}/);
    assert.match(rule('[data-ui="modern"] #game-root #quest-pins:not([hidden]) ~ #buff-strip'), /--quest-pins-h/);
  });

  it('on a phone stacks in the column left, over the panel so a narrower phone keeps it in sight', () => {
    const at = css.indexOf('[data-ui="modern"] #game-root[data-sheet] #buff-strip .buff-chip');
    const media = css.lastIndexOf('@media (max-width: 560px)', at);
    assert.ok(media >= 0 && at - media < 900);
    const block = css.slice(media, at);
    assert.match(block, /z-index: calc\(var\(--z-panel\) \+ 1\)/);
    assert.match(block, /left: min\(var\(--inset-l, 0px\), calc\(100% - 50px\)\)/);
    assert.match(block, /flex-direction: column/);
  });

  it('leaves Classic alone with a sheet open: it pins the inset to 0, and its one strip rule (#286) never follows a sheet', () => {
    assert.match(classic, /--inset-l: 0px !important/);
    // #286: the one Classic rule, right of the energy line (BuffViewManager.as 116-119), not tied to a sheet.
    const rules = classic.split('\n').filter((l) => /buff-strip/.test(l) && /\{/.test(l));
    assert.deepEqual(rules, [':root[data-ui="classic"] #game-root #buff-strip {']);
    const at = classic.indexOf(rules[0]);
    const body = classic.slice(at, classic.indexOf('}', at));
    assert.match(body, /left: calc\(var\(--classic-buffs-x, calc\(150 \* var\(--cu\)\)\) \+ 13 \* var\(--cu\)\);/);
    assert.doesNotMatch(body, /--inset-l|--inset-r|data-sheet/);
    assert.ok(!/\[data-sheet\][^{]*#buff-strip/.test(classic));
    assert.ok(!/\[data-sheet\] #buff-strip/.test(css.replace(/\[data-ui="modern"\][^\n]*#buff-strip[^\n]*/g, '')));
  });
});
