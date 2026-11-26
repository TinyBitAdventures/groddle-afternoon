/**
 * G851 (Austin 2026-11-16, phone): press and drag on Act moved the light in a verb menu (ACTPRESS,
 * js/touch-controls.js actMenu) but not through a signpost's roads, a separate chooser (SIGNFOCUS:
 * Enter holds a post of several arms, Up and Down light one, Enter goes; SignpostView.as tryFocus
 * 382-416, focus 447-462, go 581-584). game.js signpostActMenu gives Act the held post: a drag steps
 * the lit arm (resting at the ends, as a drag rests on a menu's), a tap or the lift goes. A stack's
 * own menu (the pack's item card, the same verb rows) is driven the same way, and Act's press keeps
 * it open.
 * Run: node --test tests/g851-act-signpost-chooser.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACT_DRAG_STEP } from '../public/js/touch-controls.js?v=8bc690ac';
import { fakeControls } from './touch-fake-dom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
const fn = (name) => game.match(new RegExp(`\\nfunction ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];

/** The post's functions over stubs: three arms, held at `index`; `here` false walks away. */
function post({ index = 0, here = true } = {}) {
  const boards = ['Hechey Track', "Pasha's Place", 'Northwest Passage'].map((label) => ({ view: {}, board: { label } }));
  const world = { focus: null, lit: [], taken: [], released: 0, here };
  const api = new Function(
    'world', 'boards',
    `let signpostFocus = null;
    const signpostAtHand = () => (world.here ? { boards } : null);
    const releaseSignpostFocus = () => { signpostFocus = null; world.released += 1; };
    const lightFocusedBoard = () => world.lit.push(signpostFocus.boards[signpostFocus.index].board.label);
    const takeSignBoard = (entry) => { releaseSignpostFocus(); world.taken.push(entry.board.label); };
    ${fn('signpostStillHeld')}
    ${fn('signpostActMenu')}
    return { hold: (i) => { signpostFocus = { boards: boards.slice(), index: i }; }, menu: () => signpostActMenu(), held: () => signpostFocus };`
  )(world, boards);
  if (index !== null) api.hold(index);
  return { world, api };
}

describe('G851: Act drives a held signpost', () => {
  it('no post held, no menu for Act', () => {
    const { api } = post({ index: null });
    assert.equal(api.menu(), null);
  });

  it('a drag steps the lit arm and rests on the top and bottom arms', () => {
    const { world, api } = post();
    const m = api.menu();
    m.step(1);
    m.step(1);
    m.step(1);
    m.step(-5);
    assert.deepEqual(world.lit, ["Pasha's Place", 'Northwest Passage', 'Northwest Passage', 'Hechey Track']);
  });

  it('choosing goes to the lit arm, as Enter does', () => {
    const { world, api } = post({ index: 1 });
    api.menu().choose();
    assert.deepEqual(world.taken, ["Pasha's Place"]);
    assert.equal(api.held(), null, 'the post lets go');
  });

  it('a post no longer at hand lets go and takes nothing', () => {
    const { world, api } = post();
    const m = api.menu();
    world.here = false;
    m.step(1);
    m.choose();
    assert.deepEqual(world.taken, []);
    assert.deepEqual(world.lit, []);
    assert.equal(world.released, 1);
  });

  it("through Act's own handlers: a tap holds the post, a drag lights the next arm, the lift goes", async () => {
    const { world, api } = post({ index: null });
    const frames = [];
    const c = await fakeControls({
      win: { requestAnimationFrame: (f) => { frames.push(f); return frames.length; } },
      // act(): Act's Enter at a post of several arms holds it (game.js enterSignpost).
      install: { act: () => api.hold(0), actMenu: () => api.menu() },
    });
    c.act.fire('pointerdown', { clientX: 300, clientY: 500 });
    for (const f of frames.splice(0)) f();
    c.act.fire('pointermove', { clientX: 300, clientY: 500 + ACT_DRAG_STEP * 2 + 2 });
    c.act.fire('pointerup', { clientX: 300, clientY: 500 + ACT_DRAG_STEP * 2 + 2 });
    assert.deepEqual(world.taken, ['Northwest Passage']);
    // Held again: a still tap goes to the lit (top) arm.
    api.hold(0);
    c.act.fire('pointerdown', { clientX: 300, clientY: 500 });
    c.act.fire('pointerup', { clientX: 300, clientY: 500 });
    assert.deepEqual(world.taken, ['Northwest Passage', 'Hechey Track']);
  });

  it('game.js: Act gets the verb menu, then the held post, then a stack\'s menu; its press keeps the stack menu open', () => {
    const act = game.match(/actMenu: \(\) => \{[\s\S]*?\n {6}\},/)[0];
    const at = (s) => act.indexOf(s);
    assert.ok(at('enterChooser?.isOpen()') >= 0 && at('enterChooser?.isOpen()') < at('actVerbMenu(menu)'));
    assert.ok(at('actVerbMenu(menu)') < at('if (signpostFocus) return signpostActMenu();'));
    assert.ok(at('if (signpostFocus) return signpostActMenu();') < at('stepVerbRow(pop, n)'));
    assert.match(act, /isPackPopoverOpen\(\) \? document\.getElementById\('pack-popover'\)/);
    assert.match(game, /if \(pop\?\.contains\(e\.target\) \|\| e\.target\?\.closest\?\.\('\.pack-slot\[data-tsid\]'\)\) return;\n\s*\/\/ G851[^\n]*\n\s*if \(e\.target\?\.closest\?\.\('\[data-touch-act\]'\)\) return;/);
    // The keys keep their wrap: only Act's drag rests at the ends.
    assert.match(fn('signpostFocusKey'), /signpostFocus\.index = \(signpostFocus\.index \+ step \+ n\) % n;/);
  });
});
