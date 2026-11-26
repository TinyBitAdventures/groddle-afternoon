/**
 * G794: Glitch let you drop a tool onto a Tinkertool, or a Tinkertool onto a tool, to repair it, and
 * one Tinkertool onto another (GSJS items/tinkertool.js repair verb 154-311, tool_base:
 * is_drop_target, drop_tip "Repair with your Tinkertool", drop_ok_code 167-181; main.js 5464-5516
 * asks the target's verbs with the dragged stack). The remake's pack drop only moved stacks; now a
 * drop between a Tinkertool and a tool that needs it is that repair, with the Repair verb's costs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bindToolInventory,
  createToolConditionState,
  dropRepair,
  quoteToolRepair,
  repairToolCondition,
  repairingTinkertool,
  setToolRemaining,
  toolCopies,
  TINKERTOOL_DROP_TIP,
} from '../public/js/tools.js?v=4156bba8';
import { createInventory } from '../public/js/inventory.js?v=3be7988a';

const remaining = (tools, cls) => toolCopies(tools, cls).map((c) => c.remaining);
function kit(items) {
  const inv = createInventory(items);
  return { inv, tools: bindToolInventory(createToolConditionState(), inv) };
}
const T = (copy) => ({ cls: 'tinkertool', copy });

describe('G794: which drops are repairs (tools.js dropRepair)', () => {
  it('a worn tool onto a Tinkertool, and a Tinkertool onto a worn tool, are both repairs by that Tinkertool', () => {
    const { tools } = kit({ hoe: 1, tinkertool: 2 });
    setToolRemaining(tools, 'hoe', 10, { copy: 0 });
    assert.deepEqual(dropRepair(tools, { cls: 'hoe', copy: 0 }, T(1)), { classTsid: 'hoe', copy: 0, by: 1 });
    assert.deepEqual(dropRepair(tools, T(1), { cls: 'hoe', copy: 0 }), { classTsid: 'hoe', copy: 0, by: 1 });
  });

  it('a broken tool counts (drop_ok_code: !isWorking)', () => {
    const { tools } = kit({ pick: 1, tinkertool: 1 });
    setToolRemaining(tools, 'pick', 0, { copy: 0 });
    assert.deepEqual(dropRepair(tools, { cls: 'pick', copy: 0 }, T(0)), { classTsid: 'pick', copy: 0, by: 0 });
  });

  it('a whole tool, an item, or two tools without a Tinkertool stay a move', () => {
    const { tools } = kit({ hoe: 1, pick: 1, tinkertool: 1 });
    assert.equal(dropRepair(tools, { cls: 'hoe', copy: 0 }, T(0)), null);
    setToolRemaining(tools, 'pick', 10, { copy: 0 });
    assert.equal(dropRepair(tools, { cls: 'pick', copy: 0 }, { cls: 'hoe', copy: 0 }), null);
    assert.equal(dropRepair(tools, { cls: 'apple', copy: 0 }, T(0)), null);
  });

  it('a tool that can\'t be repaired is no drop target (can_repair 0)', () => {
    const { tools } = kit({ butterfly_lotion: 1, tinkertool: 1 });
    setToolRemaining(tools, 'butterfly_lotion', 1, { copy: 0 });
    assert.equal(dropRepair(tools, { cls: 'butterfly_lotion', copy: 0 }, T(0)), null);
  });

  it('one Tinkertool onto another: the working one repairs the worn one, either way round', () => {
    const { tools } = kit({ tinkertool: 2 });
    setToolRemaining(tools, 'tinkertool', 0, { copy: 0 });
    // The broken one dragged onto the whole one (handler 276-284: the target repairs the dragged).
    assert.deepEqual(dropRepair(tools, T(0), T(1)), { classTsid: 'tinkertool', copy: 0, by: 1 });
    // The whole one dragged onto the broken one (handler 291-309: the dragged repairs the target).
    assert.deepEqual(dropRepair(tools, T(1), T(0)), { classTsid: 'tinkertool', copy: 0, by: 1 });
    // Both worn but working: the target repairs the dragged (handler 276).
    setToolRemaining(tools, 'tinkertool', 50, { copy: 0 });
    setToolRemaining(tools, 'tinkertool', 80, { copy: 1 });
    assert.deepEqual(dropRepair(tools, T(0), T(1)), { classTsid: 'tinkertool', copy: 0, by: 1 });
    assert.deepEqual(dropRepair(tools, T(1), T(0)), { classTsid: 'tinkertool', copy: 1, by: 0 });
    // A slot onto itself is nothing.
    assert.equal(dropRepair(tools, T(0), T(0)), null);
  });

  it('a broken Tinkertool can do no repair, and says so (handler 293-295)', () => {
    const { tools } = kit({ hoe: 1, tinkertool: 2 });
    setToolRemaining(tools, 'hoe', 10, { copy: 0 });
    setToolRemaining(tools, 'tinkertool', 0, { copy: 0 });
    setToolRemaining(tools, 'tinkertool', 0, { copy: 1 });
    assert.match(dropRepair(tools, { cls: 'hoe', copy: 0 }, T(0)).refuse, /broken/);
    assert.match(dropRepair(tools, T(0), { cls: 'hoe', copy: 0 }).refuse, /broken/);
    assert.match(dropRepair(tools, T(0), T(1)).refuse, /broken/);
  });

  it('the drop tip is the source\'s', () => {
    assert.equal(TINKERTOOL_DROP_TIP, 'Repair with your Tinkertool');
  });
});

describe('G794: the repair a drop starts', () => {
  it('the Tinkertool dropped on does the work and wears, not the first one in the pack', () => {
    const { tools } = kit({ hoe: 1, tinkertool: 2 });
    setToolRemaining(tools, 'hoe', 10, { copy: 0 });
    const done = repairToolCondition(tools, 'hoe', { energy: 1000 }, { copy: 0, by: 1, learned: ['tinkering_1'], hasTinkertool: true });
    assert.equal(done.ok, true, done.msg);
    const [first, second] = remaining(tools, 'tinkertool');
    assert.equal(first, 200);
    assert.ok(second < 200, 'the named Tinkertool wore');
    assert.ok(remaining(tools, 'hoe')[0] > 10);
  });

  it('costs what the Repair verb costs for that tool', () => {
    const { tools } = kit({ hoe: 1, tinkertool: 2 });
    setToolRemaining(tools, 'hoe', 10, { copy: 0 });
    const verb = quoteToolRepair(tools, 'hoe', ['tinkering_1'], { copy: 0 });
    const drop = quoteToolRepair(tools, 'hoe', ['tinkering_1'], { copy: 0, by: 1 });
    assert.equal(drop.energy, verb.energy);
    assert.equal(drop.durationSeconds, verb.durationSeconds);
  });

  it('one Tinkertool repaired by another needs Tinkering I (the drop_stack branch, conditions 214-223), not III', () => {
    const { tools } = kit({ tinkertool: 2 });
    setToolRemaining(tools, 'tinkertool', 0, { copy: 0 });
    assert.equal(quoteToolRepair(tools, 'tinkertool', ['tinkering_1'], { copy: 0 }).reason, 'self_skill');
    const q = quoteToolRepair(tools, 'tinkertool', ['tinkering_1'], { copy: 0, by: 1 });
    assert.equal(q.ok, true);
    assert.deepEqual(repairingTinkertool(tools, 'tinkertool', q, { by: 1 }), { self: false, copy: 1, points: 200 });
    const done = repairToolCondition(tools, 'tinkertool', { energy: 5000 }, { copy: 0, by: 1, learned: ['tinkering_1'], hasTinkertool: true });
    assert.equal(done.ok, true, done.msg);
    const [mended, by] = remaining(tools, 'tinkertool');
    // Not a self repair: the repaired one does not wear as it rises, the other wears a point a tick.
    assert.ok(mended > 0);
    assert.equal(by, 200 - done.plan.ticks);
  });

  it('still needs Tinkering I and the energy, as the verb does', () => {
    const { tools } = kit({ hoe: 1, tinkertool: 1 });
    setToolRemaining(tools, 'hoe', 10, { copy: 0 });
    assert.equal(quoteToolRepair(tools, 'hoe', [], { copy: 0, by: 0 }).reason, 'skill');
    assert.equal(repairToolCondition(tools, 'hoe', { energy: 1 }, { copy: 0, by: 0, learned: ['tinkering_1'], hasTinkertool: true }).reason, 'energy');
  });

  it('a Tinkertool\'s own Repair is still its self repair (no `by`, or `by` on itself)', () => {
    const { tools } = kit({ tinkertool: 1 });
    setToolRemaining(tools, 'tinkertool', 50, { copy: 0 });
    assert.equal(quoteToolRepair(tools, 'tinkertool', ['tinkering_1'], { copy: 0, by: 0 }).reason, 'self_skill');
    assert.equal(repairingTinkertool(tools, 'tinkertool', quoteToolRepair(tools, 'tinkertool', ['tinkering_3'], { copy: 0 })).self, true);
  });
});

describe('G794: the pack drop (game.js setupPackDrops)', () => {
  const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
  it('a drop asks dropRepair before it moves a stack, with the dragged and target copies', () => {
    assert.match(game, /function packDropRepair\(el\)[\s\S]{0,300}dropRepair\(toolState, \{ cls: packDrag\.cls, copy: packDrag\.copy \}/);
    const dropOn = game.slice(game.indexOf('const dropOn = (el) =>'), game.indexOf("bar.addEventListener('drop'"));
    assert.ok(dropOn.indexOf('packDropRepair(el)') < dropOn.indexOf("features.query('packMove'"));
    assert.match(dropOn, /beginToolRepair\(fix\.classTsid, fix\.copy, \{ by: fix\.by \}\)/);
  });
  it('mouse and touch drags carry the tool\'s copy', () => {
    // R9 (G967): both carry the drop registry's stack (js/drop-targets.js packStackOf reads data-pack-copy).
    assert.match(game, /beginDrag\(packStackOf\(slot, \{ copy: s\.copy \?\? null,/);
    assert.match(game, /packDrag = st\.from === 'pack' && st\.container != null \? \{[^}]*copy: st\.copy \?\? null \}/);
    assert.match(readFileSync(new URL('../public/js/drop-targets.js', import.meta.url), 'utf8'), /const copy = d\.packCopy != null/);
  });
});
