/**
 * QA routes that click a stack's pack slot open the bag that holds it first (js/pack-slot-qa.js).
 * Since bags a fresh solo game keeps its tools in the Red Toolbox and its items in Bigger Bags, and
 * a closed bag's stacks are not drawn, so `.pack-slot[data-tsid="<class>"]` found nothing:
 * machineartdemo never opened Make, the cubimal demo's drop and set-free never opened the card, and
 * the Top of the Tree autoplay never ate its Spinach.
 * Run: node --test tests/pack-slot-qa.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bagHolding, packSlotFor } from '../public/js/pack-slot-qa.js?v=1d74bf2d';
import { layoutPack } from '../public/js/pack-slots.js?v=6cf9f397';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** A pack as the game draws it: only the pack row's slots and the open bag's are in the page. */
function fakeGame(layout) {
  let open = '';
  const calls = [];
  const shown = () => [
    ...layout.pack.slots.map((s) => ({ tsid: s.cls })),
    ...(open ? layout.bags[open].slots.map((s) => ({ tsid: s.cls, bag: open })) : []),
  ];
  const doc = {
    querySelector(sel) {
      const cls = sel.match(/^\.pack-slot\[data-tsid="([\w-]+)"\]$/)?.[1];
      assert.ok(cls, `an unexpected selector: ${sel}`);
      return shown().find((s) => s.tsid === cls) || null;
    },
  };
  const engine = {
    query(hook, ...args) {
      calls.push(hook);
      if (hook === 'packLayout') return layout;
      if (hook === 'packOpenBag') return open;
      if (hook === 'packToggleBag') { open = open === args[0] ? '' : String(args[0]); return open; }
      return null;
    },
    refreshPack() { calls.push('refreshPack'); },
  };
  return { doc, engine, calls, open: () => open, setOpen: (k) => { open = k; } };
}

const layout = () => ({
  pack: { key: 'pack', slots: [{ kind: 'bag', key: 'b1', cls: 'bag_toolbox_red', count: 1 }, { kind: 'bag', key: 'b2', cls: 'bag_bigger', count: 1 }, { kind: 'stack', cls: 'apple', count: 3 }] },
  bags: {
    b1: { key: 'b1', cls: 'bag_toolbox_red', slots: [{ kind: 'stack', cls: 'fuelmaker', count: 1 }, { kind: 'stack', cls: 'pick', count: 1 }] },
    b2: { key: 'b2', cls: 'bag_bigger', slots: [{ kind: 'stack', cls: 'spinach', count: 6 }, { kind: 'stack', cls: 'npc_cubimal_chick', count: 1 }] },
  },
});

describe('a QA route finds a stack that sits in a closed bag', () => {
  it('names the bag that holds a stack, and none for the pack row or a stack not held', () => {
    assert.equal(bagHolding(layout(), 'fuelmaker'), 'b1');
    assert.equal(bagHolding(layout(), 'spinach'), 'b2');
    assert.equal(bagHolding(layout(), 'apple'), '');
    assert.equal(bagHolding(layout(), 'bag_bigger'), '', 'a bag in the pack row is not inside itself');
    assert.equal(bagHolding(layout(), 'hoe'), '');
    assert.equal(bagHolding(null, 'hoe'), '');
    assert.equal(bagHolding(layout(), ''), '');
  });

  it('reads the layout the game really builds: a tool goes into the toolbox', () => {
    const built = layoutPack(
      { bag_toolbox_red: 1, fuelmaker: 1, apple: 2 },
      { bags: [{ key: 'b1', cls: 'bag_toolbox_red' }], place: { pack: ['@b1', 'apple'], b1: ['fuelmaker'] }, n: { pack: [0, 2], b1: [1] } },
      { isTool: (cls) => cls === 'fuelmaker' },
    );
    assert.deepEqual(built.pack.slots.map((s) => [s.kind, s.cls]), [['bag', 'bag_toolbox_red'], ['stack', 'apple']]);
    assert.deepEqual(built.bags.b1.slots.map((s) => s.cls), ['fuelmaker'], 'the machine sits in the toolbox');
    assert.equal(bagHolding(built, 'fuelmaker'), 'b1');
    assert.equal(bagHolding(built, 'apple'), '');
  });

  it('a stack in the pack row is returned as it is, and no bag opens', () => {
    const g = fakeGame(layout());
    assert.deepEqual(packSlotFor(g.engine, 'apple', g.doc), { tsid: 'apple' });
    assert.equal(g.open(), '');
    assert.deepEqual(g.calls, []);
  });

  it('opens the bag that holds the stack, redraws the pack and returns its slot', () => {
    const g = fakeGame(layout());
    assert.deepEqual(packSlotFor(g.engine, 'fuelmaker', g.doc), { tsid: 'fuelmaker', bag: 'b1' });
    assert.equal(g.open(), 'b1');
    assert.deepEqual(g.calls, ['packLayout', 'packOpenBag', 'packToggleBag', 'refreshPack']);
    // Another bag was open: the one that holds the stack takes its place (one open bag at a time).
    assert.deepEqual(packSlotFor(g.engine, 'spinach', g.doc), { tsid: 'spinach', bag: 'b2' });
    assert.equal(g.open(), 'b2');
    // Already open: found at once, and never toggled shut.
    g.calls.length = 0;
    assert.deepEqual(packSlotFor(g.engine, 'npc_cubimal_chick', g.doc), { tsid: 'npc_cubimal_chick', bag: 'b2' });
    assert.deepEqual(g.calls, []);
  });

  it('gives null for a stack the pack does not hold, and opens nothing', () => {
    const g = fakeGame(layout());
    assert.equal(packSlotFor(g.engine, 'hoe', g.doc), null);
    assert.equal(g.open(), '');
    assert.equal(packSlotFor({}, 'hoe', g.doc), null);
    assert.equal(packSlotFor(null, 'hoe', { querySelector: () => null }), null);
  });
});

describe('the QA routes that click a pack slot', () => {
  it('machineartdemo, the cubimal demo and the Top of the Tree autoplay go through packSlotFor', () => {
    const machine = read('public/js/features/machine-art-feature.js');
    assert.match(machine, /packSlotFor\(engine, machine\)\?\.click\(\);/);
    const cubimal = read('public/js/features/cubimal-race-feature.js');
    assert.match(cubimal, /function openSlot\(engine, classTsid\) \{\n  const slot = packSlotFor\(engine, classTsid\);/);
    assert.equal(cubimal.match(/\n  openSlot\(engine, classTsid\);/g).length, 2, 'the drop and the set-free demos');
    assert.match(read('public/js/quest-rooms/top-of-tree.js'), /packSlotFor\(ctx\.engine, 'spinach'\)/);
  });

  it('no feature or quest room looks a stack up by a bare .pack-slot[data-tsid="..."] query any more', () => {
    const bad = [];
    for (const dir of ['public/js/features', 'public/js/quest-rooms']) {
      for (const name of readdirSync(join(root, dir))) {
        if (!name.endsWith('.js')) continue;
        if (/querySelector\(\s*[`'"]\.pack-slot\[data-tsid=/.test(read(`${dir}/${name}`))) bad.push(`${dir}/${name}`);
      }
    }
    assert.deepEqual(bad, []);
  });
});
