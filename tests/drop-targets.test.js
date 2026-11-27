/**
 * R9 (G967): one drop-target registry for the mouse and touch (js/drop-targets.js). Before it each
 * target wired its own HTML5 drop listeners and the touch lift reached only the cabinet (#407 G865),
 * so on a phone a pack stack could not go into a Storage Display Box (#470 G930, #473 G958), a trade,
 * a gift, a garden plot, a vendor or onto a thing on the street (report 37's lift).
 *
 * - No drop or dragover listener, dragstart watcher or touch event of its own outside the registry.
 * - Every target registers there, in DragVO.as findDragTargetForStack's order.
 * - A touch drag and a mouse drag reach the same target with the same stack, for the real targets
 *   (the cabinet in tests/g865-cabinet-touch-drop.test.js, the trade in tests/trade.test.js).
 * Run: node --test tests/drop-targets.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DROP_THROUGH, dropPoint, dropTargetIds, registerDropTarget, resolveDrop, currentDrag, beginDrag, dragDrop, endDrag } from '../public/js/drop-targets.js?v=d5325567';
import { dropPage, fakeSlot, touchDrop, mouseDrop } from './drop-fake.js';
import { worldDropFeature } from '../public/js/features/world-drop-feature.js?v=844b8975';
import { gardenGuanoFeature } from '../public/js/features/garden-guano-feature.js?v=3faeddbb';
import { createGarden } from '../public/js/garden.js?v=fefa7bcd';

const root = join(import.meta.dirname, '..', 'public');
const read = (f) => readFileSync(join(root, f), 'utf8');

function sources(dir = root) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'vendor' || name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (name.endsWith('.js')) out.push(relative(root, p));
  }
  return out;
}

/** Drops that take files from the desktop or the level builder's own art, never a stack. */
const NOT_STACKS = {
  'js/ui/reports-sheet.js': 'pictures dropped from the desktop onto a report',
  'js/builder/editor.js': "the level builder's art picker onto its canvas",
};

describe('one registry (R9, G967)', () => {
  it('no drop target listens outside js/drop-targets.js', () => {
    const bad = [];
    for (const f of sources()) {
      if (f === 'js/drop-targets.js') continue;
      const src = read(f);
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        const where = `${f}:${i + 1}`;
        if (/addEventListener\(\s*['"](drop|dragover|dragenter|dragleave)['"]/.test(line) && !NOT_STACKS[f]) bad.push(`${where} ${line.trim()}`);
        // A dragstart watcher on the page (each target's old way to see a pack drag begin).
        if (/(document|doc)\.addEventListener\(\s*['"](dragstart|dragend)['"]/.test(line)) bad.push(`${where} ${line.trim()}`);
        if (/pack-touch-(over|drop|end)|packDragStart/.test(line)) bad.push(`${where} ${line.trim()}`);
      });
    }
    assert.deepEqual(bad, [], 'register it with registerDropTarget (js/drop-targets.js)');
  });

  it('every place a stack goes is a registered target, in the client\'s order', () => {
    const want = {
      'game.js': ['vendor', 'pack'],
      'js/ui/storage-windows.js': ['cabinet', 'cabinet-out'],
      'js/features/trade-feature.js': ['trade'],
      'js/features/gifts-feature.js': ['gift'],
      'js/features/homes-feature.js': ['home-decorate', 'home-pour', 'home-display-box'],
      'js/features/garden-guano-feature.js': ['garden'],
      'js/features/world-drop-feature.js': ['world'],
      'js/butler-drop.js': ['butler', 'butler-own'],
    };
    const orders = {};
    for (const [f, ids] of Object.entries(want)) {
      const src = read(f);
      assert.match(src, /registerDropTarget\(/, f);
      for (const id of ids) {
        const m = new RegExp(`id: '${id}',\\s+order: (\\d+),`).exec(src);
        assert.ok(m, `${f} registers '${id}' with its order`);
        orders[id] = Number(m[1]);
      }
    }
    const asked = Object.keys(orders).sort((a, b) => orders[a] - orders[b]);
    // DragVO.as findDragTargetForStack: windows over the room first; then players (not while
    // decorating, which asks first and takes the room), plots, and the location's things last
    // (G972: a friend's Butler is one of them, asked before the street's other things).
    assert.deepEqual(asked, ['vendor', 'trade', 'cabinet', 'cabinet-out', 'pack', 'home-decorate', 'gift', 'home-pour', 'home-display-box', 'garden', 'butler', 'butler-own', 'world']);
  });

  it('the pack bar\'s mouse drag and its touch lift both go through the registry', () => {
    const game = read('game.js');
    const row = game.slice(game.indexOf('function renderPackRow('), game.indexOf('/** A stack\'s shown name in the pack'));
    assert.match(row, /beginDrag\(packStackOf\(slot, \{ copy: s\.copy \?\? null, tool: toolSlot, vendor: canDragToVendor \}\), \{ input: 'mouse' \}\);/);
    const drops = game.slice(game.indexOf('function setupPackDrops()'), game.indexOf('function renderPackBar()'));
    assert.match(drops, /installDropRegistry\(document\);/);
    assert.match(drops, /touchLift\(bar, \{/);
    assert.doesNotMatch(drops, /elementFromPoint|dispatchEvent/, 'the lift resolves targets in the registry, not by events');
  });
});

describe('a touch drag and a mouse drag reach the same target', () => {
  const calls = [];
  let page;
  let el;
  const slot = fakeSlot('cherry', 4, { packCopy: '2' });
  before(() => {
    page = dropPage([slot]);
    el = { id: 'box', contains: (n) => n === el };
    registerDropTarget({
      id: 'probe',
      order: 99,
      scope: () => el,
      start: (d) => calls.push(['start', d.input, d.stack.cls]),
      over: (d, at) => (calls.push(['over', d.input, at.x, at.y]), { ok: d.stack.cls === 'cherry' }),
      drop: (d, at, res) => calls.push(['drop', d.input, d.stack.cls, d.stack.count, d.stack.copy, res.ok]),
      leave: (d) => calls.push(['leave', d.input]),
      end: (d) => calls.push(['end', d.input]),
    });
  });

  it('touch: lift, over, drop, end, with the slot\'s stack', async () => {
    calls.length = 0;
    await touchDrop(page, slot, el, 210, 320);
    assert.deepEqual(calls, [['start', 'touch', 'cherry'], ['over', 'touch', 210, 320], ['over', 'touch', 210, 320], ['drop', 'touch', 'cherry', 4, 2, true], ['end', 'touch']]);
    assert.equal(currentDrag(), null);
    assert.equal(page.doc.documentElement.dataset.dropLast, 'probe:ok:touch');
  });

  it('mouse: the same calls, and the drop is taken (preventDefault)', () => {
    calls.length = 0;
    const { over, drop } = mouseDrop(page, slot, el, 210, 320);
    assert.equal(over.defaultPrevented, true);
    assert.equal(drop.defaultPrevented, true);
    assert.deepEqual(calls, [['start', 'mouse', 'cherry'], ['over', 'mouse', 210, 320], ['over', 'mouse', 210, 320], ['drop', 'mouse', 'cherry', 4, 2, true], ['end', 'mouse']]);
  });

  it('let go outside every target: nothing is taken, the drag still ends', async () => {
    calls.length = 0;
    const out = { contains: () => false };
    await touchDrop(page, slot, out);
    assert.deepEqual(calls.map((c) => c[0]), ['start', 'end']);
    assert.equal(page.doc.documentElement.dataset.dropLast, 'none:touch');
    const { drop } = mouseDrop(page, slot, out);
    assert.equal(drop.defaultPrevented, false, 'not ours: the browser keeps it');
  });

  it('a finger that moves before the hold scrolls: no drag', async () => {
    calls.length = 0;
    page.row.fire('pointerdown', { pointerType: 'touch', pointerId: 3, clientX: 10, clientY: 10, target: slot });
    page.row.fire('pointermove', { pointerType: 'touch', pointerId: 3, clientX: 40, clientY: 10, target: slot });
    await new Promise((r) => setTimeout(r, 5));
    page.doc.fire('pointerup', { pointerType: 'touch', pointerId: 3, clientX: 40, clientY: 10 });
    assert.deepEqual(calls, []);
  });

  it('order decides between two targets over one point; the first that answers takes it', () => {
    const got = [];
    const a = registerDropTarget({ id: 'first', order: 1, scope: () => el, over: () => null, drop: () => got.push('first') });
    const b = registerDropTarget({ id: 'second', order: 2, scope: () => el, over: () => ({ ok: true }), drop: () => got.push('second') });
    beginDrag({ from: 'pack', cls: 'cherry', count: 1 });
    assert.equal(resolveDrop({ x: 0, y: 0, el }).target.id, 'second', 'a target that says null is passed over');
    assert.deepEqual(dragDrop({ x: 0, y: 0, el }), { id: 'second', ok: true });
    assert.deepEqual(got, ['second']);
    a();
    b();
    endDrag();
    assert.ok(!dropTargetIds().includes('first'));
  });
});

describe('the street\'s targets by touch and by mouse', () => {
  const saved = {};
  let page;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }), contains: (n) => n === canvas };
  const calls = [];
  const engine = {
    PIXI: { Point: class { constructor(x, y) { this.x = x; this.y = y; } } },
    camera: { w: 960 },
    entityLayer: { toLocal: (p) => ({ x: p.x + 1000, y: p.y }) },
    interactables: [],
    interactableAt: (x, y) => (Math.abs(x - 1480) < 40 && Math.abs(y - 300) < 40 ? { classId: 'newxp_dustbunny', label: 'Dustbunny' } : null),
    targetVerbs: (t) => (t.classId === 'garden_plot' ? [{ id: 'fertilize', enabled: true }] : [{ id: 'give_egg', enabled: true }]),
    inv: { egg_plain: 1, guano: 3 },
    data: {},
    setData(k, v) { this.data[k] = v; },
    query: () => null,
    param: () => null,
    playSound: () => {},
    toast: () => {},
    closeVerbMenu: () => {},
    requestVerb: (t, v) => { calls.push([t.classId, v.id]); return true; },
  };
  before(() => {
    for (const k of ['document']) saved[k] = globalThis[k];
    const tip = () => ({ style: {}, classList: { toggle() {} }, setAttribute() {}, hidden: false, offsetWidth: 0 });
    globalThis.document = { querySelector: () => canvas, createElement: tip, body: { appendChild() {} } };
    // A garden plot at world (1200, 300): its box 60 wide, 40 tall, standing on its bottom centre.
    const garden = createGarden({ cols: 1, rows: 1, now: Date.now() });
    Object.assign(garden.plots['1-1'], { state: 'seeds', seed: 'seed_spinach', wet: true, wetAt: Date.now(), stageStartedAt: Date.now() });
    engine.interactables.push({ classId: 'garden_plot', state: { plot: garden.plots['1-1'], plotKey: '1-1', garden }, sprite: { x: 1200, y: 320, _gardenHitW: 60, _gardenHitH: 40 } });
    worldDropFeature.onStreetEnter({}, engine);
    gardenGuanoFeature.onStreetEnter({}, engine);
    page = dropPage([]);
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('an Egg dragged by touch onto the Dustbunny runs give_egg (world-drop-feature)', async () => {
    calls.length = 0;
    const egg = fakeSlot('egg_plain', 1);
    page.row.contains = (n) => n === egg;
    await touchDrop(page, egg, canvas, 480, 300);
    assert.deepEqual(calls, [['newxp_dustbunny', 'give_egg']]);
    assert.equal(engine.data.worldDropLast, 'ran:newxp_dustbunny:give_egg');
    calls.length = 0;
    mouseDrop(page, egg, canvas, 480, 300);
    assert.deepEqual(calls, [['newxp_dustbunny', 'give_egg']], 'the mouse the same');
  });

  it('Guano dragged by touch onto a plot fertilizes it (garden-guano-feature), before the street\'s things', async () => {
    calls.length = 0;
    const guano = fakeSlot('guano', 3);
    page.row.contains = (n) => n === guano;
    await touchDrop(page, guano, canvas, 200, 300);
    assert.deepEqual(calls, [['garden_plot', 'fertilize']]);
    assert.equal(engine.data.guanoDropLast, 'ran:1-1');
    calls.length = 0;
    engine.interactables[0].state.plot.state = 'seeds';
    mouseDrop(page, guano, canvas, 200, 300);
    assert.deepEqual(calls, [['garden_plot', 'fertilize']], 'the mouse the same');
  });

  it('a bag never drags onto the street', async () => {
    calls.length = 0;
    const bag = fakeSlot('bag_generic', 1, { packBag: 'bag_generic_1' });
    page.row.contains = (n) => n === bag;
    await touchDrop(page, bag, canvas, 480, 300);
    assert.deepEqual(calls, []);
  });
});

describe('a drag passes over the HUD to the room under it (review 2026-11-27 leftover 1)', () => {
  // A fake element: closest() matches the selectors it is given (its own and its parents' names).
  const node = (name, names = [name]) => ({ name, closest: (sel) => (sel.split(', ').some((s) => names.includes(s)) ? { name } : null), contains: (n) => n === node });
  const canvas = node('canvas');
  const currants = node('strong', ['#currants-stat', '.top-bar']);
  const map = node('img', ['#street-minimap']);
  const rail = node('button', ['.social-rail']);
  const pack = node('slot', ['#pack-bar']);
  const doc = (stack) => ({ elementsFromPoint: () => stack });

  it('over the Currants counter, the street map or the Social rail, the element under it decides', () => {
    for (const hud of [currants, map, rail]) {
      const at = dropPoint(doc([hud, canvas]), 20, 600, hud);
      assert.deepEqual(at, { x: 20, y: 600, el: canvas }, hud.name);
    }
  });

  it('anything else (the room, the pack, a window) decides itself, and nothing under keeps the HUD', () => {
    assert.equal(dropPoint(doc([canvas]), 1, 2, canvas).el, canvas);
    assert.equal(dropPoint(doc([pack, canvas]), 1, 2, pack).el, pack, 'the pack takes its own drop');
    assert.equal(dropPoint(doc([currants]), 1, 2, currants).el, currants);
    assert.equal(dropPoint({}, 1, 2, currants).el, currants, 'no elementsFromPoint');
    assert.equal(dropPoint(doc([canvas]), 1, 2, null).el, null);
  });

  it('the mouse and the touch lift both resolve through it (one target on the room, under the counter)', async () => {
    const got = [];
    const off = registerDropTarget({ id: 'room', order: 98, scope: () => canvas, over: () => ({ ok: true }), drop: () => got.push('room') });
    const page = dropPage([]);
    page.doc.elementsFromPoint = () => [currants, canvas];
    const slot = fakeSlot('cherry', 1);
    page.row.contains = (n) => n === slot;
    await touchDrop(page, slot, currants, 20, 600);
    const { drop } = mouseDrop(page, slot, currants, 20, 600);
    off();
    assert.deepEqual(got, ['room', 'room']);
    assert.equal(drop.defaultPrevented, true);
  });

  it('names the HUD over the room and what pops up by itself, not the pack or a window the player opens', () => {
    for (const sel of ['.top-bar', '#street-minimap', '.social-rail']) assert.ok(DROP_THROUGH.includes(sel), sel);
    for (const sel of DROP_THROUGH) assert.doesNotMatch(sel, /pack|panel|modal|sheet/, sel);
  });
});

describe('what pops up by itself mid-drag leaves the drag going (review 2026-11-27 leftover 2)', () => {
  const node = (name, names = [name]) => ({ name, closest: (sel) => (sel.split(', ').some((s) => names.includes(s)) ? { name } : null), contains: (n) => n === node });
  const canvas = node('canvas');
  const doc = (stack) => ({ elementsFromPoint: () => stack });

  it('the New Quest card, the familiar, a prompt and a notice: the room under them decides', () => {
    for (const id of ['#quest-dialogue', '#familiar-dialog', '#prompt-stack', '#notify-notices']) {
      assert.ok(DROP_THROUGH.includes(id), id);
      const card = node('button', [id]);
      assert.equal(dropPoint(doc([card, canvas]), 400, 300, card).el, canvas, id);
    }
  });

  it('a card over the pack: the pack under it still takes the stack back', () => {
    const card = node('div', ['#quest-dialogue']);
    const pack = node('slot', ['#pack-bar']);
    assert.equal(dropPoint(doc([card, pack, canvas]), 400, 760, card).el, pack);
  });

  it('a screen (a level up, a badge, a finished quest) waits for the drag, by the client\'s Cursor gate', () => {
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    assert.match(game, /\n\s*dragging: Boolean\(currentDrag\(\)\),/);
  });
});
