/**
 * The Hatchet's and Class Axe's pack verbs (js/pack-tree-verbs.js,
 * features/pack-tree-verbs-feature.js). Register row G165.
 * Source: glitch-GameServerJS items/hatchet.js:47-178, items/class_axe.js,
 * items/item.js:444-467 (proxyVerb), players/player.js:1152 (findCloseStack),
 * items/wood_tree.js:442-508.
 * Run: node --test tests/pack-tree-verbs.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEAD_TRANT_ORDER,
  PACK_TREE_REACH,
  PACK_TREE_TEXT,
  findCloseTarget,
  isPlainWoodTree,
  packTreeButtons,
  packTreeConditions,
  planPackTreeVerb,
  relabelWeeHarvest,
  woodTreeSide,
} from '../public/js/pack-tree-verbs.js?v=g165-1';
import { packTreeVerbsFeature, runPackTreeVerb } from '../public/js/features/pack-tree-verbs-feature.js?v=g403-1';
import { getVerbsFor } from '../public/content.js?v=g478-1';
import { plotVerbs } from '../public/js/patches.js?v=g414-1';
import { createToolConditionState, setToolRemaining } from '../public/js/tools.js?v=woodcutting-test-8';
import { FEATURES } from '../public/js/features/index.js?v=registry-357';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(gsjs);
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');

const at = (x, y = 600) => ({ x, y, destroyed: false });
const wood = (x, state = {}) => ({ classId: 'wood_tree', sprite: at(x), state: { maturity: 6, ...state } });
const dead = (x, cls = 'trant_bean_dead') => ({ classId: cls, sprite: at(x), state: {} });

/** The remake's real menu verbs: content.js for Wood Trees, patches.js for dead trees. */
function realVerbs(target, ctx) {
  if (target.classId === 'wood_tree') {
    const verbs = getVerbsFor(target, { pc: ctx.pc, inv: ctx.inv, tools: ctx.tools, skills: { learned: [] }, learned: [] });
    return relabelWeeHarvest(target, verbs) || verbs;
  }
  return plotVerbs({ stage: 'dead', deadClass: target.classId, kind: 'patch' }, { inv: ctx.inv, pc: ctx.pc, skills: [], toolState: ctx.tools });
}

function fakeEngine({ targets = [], x = 1000, inv = { hatchet: 1 }, energy = 100, tools = createToolConditionState() } = {}) {
  const data = {};
  const log = [];
  const begun = [];
  const engine = {
    player: { x, y: 600 },
    inv,
    pc: { energy, mood: 50, xp: 0, imagination: 0 },
    toolState: tools,
    interactables: targets,
    setData: (k, v) => { data[k] = v; },
    pushActivity: (line) => log.push(line),
    toast: () => {},
    param: () => null,
    targetVerbs: (t) => realVerbs(t, { pc: engine.pc, inv: engine.inv, tools: engine.toolState }),
    beginVerb: (target, verb) => {
      begun.push({ classId: target.classId, verb: verb.id, label: verb.label });
      return true;
    },
  };
  return { engine, data, log, begun };
}

afterEach(() => packTreeVerbsFeature._reset());

describe('source text', { skip: !hasGsjs && 'GSJS checkout not beside this worktree' }, () => {
  it('keeps the hatchet verbs, tooltips and lines verbatim', () => {
    for (const file of ['items/hatchet.js', 'items/class_axe.js']) {
      const s = src(file);
      assert.ok(s.includes(`"tooltip"\t\t\t: "${PACK_TREE_TEXT.harvestTip}"`), file);
      assert.ok(s.includes(`"tooltip"\t\t\t: "${PACK_TREE_TEXT.clearTip}"`), file);
      assert.ok(s.includes(`"name"\t\t\t\t: "${PACK_TREE_TEXT.harvestClearLabel}"`), file);
      assert.ok(s.includes(`"tooltip"\t\t\t: "${PACK_TREE_TEXT.harvestClearTip}"`), file);
      assert.ok(s.includes(`reason:'${PACK_TREE_TEXT.onceADay}'`), file);
      assert.ok(s.includes(`reason:'${PACK_TREE_TEXT.nothingToClear}'`), file);
      assert.ok(s.includes(`pc.sendActivity("${PACK_TREE_TEXT.nothingToHarvest}")`), file);
      assert.ok(s.includes(`pc.sendActivity("${PACK_TREE_TEXT.nothingToClearRun}")`), file);
      assert.ok(s.includes('" has become broken, and must be repaired."'), file);
      assert.match(s, /findCloseStack\('wood_tree', 100\)/);
      // The clear handler's class order.
      const order = [...s.matchAll(/proxyVerb\(pc, msg, '(trant_\w+_dead)', 100, 'clear'\)/g)].map((m) => m[1]);
      assert.deepEqual(order, DEAD_TRANT_ORDER);
    }
    assert.equal(PACK_TREE_REACH, 100);
    assert.ok(src('items/wood_tree.js').includes(`pc.sendActivity('${PACK_TREE_TEXT.treeSpent}')`));
    assert.match(src('players/player.js'), /var d = Math\.sqrt\(dx\*dx\+dy\*dy\);[\s\S]*if \(best_d <= max_distance\)/);
  });
});

describe('findCloseTarget (player.js findCloseStack)', () => {
  it('takes the nearest accepted target within reach, measured in a straight line', () => {
    const near = wood(1060);
    const far = wood(930);
    const from = { x: 1000, y: 600 };
    assert.equal(findCloseTarget([far, near], from, isPlainWoodTree), near);
    assert.equal(findCloseTarget([wood(1100)], from, isPlainWoodTree)?.sprite.x, 1100, '100 px is in reach');
    assert.equal(findCloseTarget([wood(1101)], from, isPlainWoodTree), null, '101 px is not');
    const high = { classId: 'wood_tree', sprite: at(1080, 540), state: {} }; // 100 px on the diagonal
    assert.equal(findCloseTarget([high], from, isPlainWoodTree), high);
    const higher = { classId: 'wood_tree', sprite: at(1080, 530), state: {} };
    assert.equal(findCloseTarget([higher], from, isPlainWoodTree), null);
  });

  it('never reaches an enchanted tree (its own class in the source) or a cleared one', () => {
    assert.equal(findCloseTarget([wood(1010, { enchanted: true })], { x: 1000, y: 600 }, isPlainWoodTree), null);
    assert.equal(findCloseTarget([wood(1010, { maturity: 0 })], { x: 1000, y: 600 }, isPlainWoodTree), null);
  });
});

describe('packTreeConditions (hatchet.js conditions)', () => {
  const side = (state, maturity = 6) => woodTreeSide({ state: { maturity } }, [{ id: 'harvest', ...state }]);

  it('a broken tool disables harvest and clear with the source line, harvest_clear has no broken check', () => {
    const c = packTreeConditions({ tool: 'class_axe', working: false, wood: side({ enabled: true }, 1) });
    assert.deepEqual(c.harvest, { state: 'disabled', reason: 'This Class Axe has become broken, and must be repaired.' });
    assert.deepEqual(c.clear, c.harvest);
    assert.equal(c.harvest_clear.state, 'enabled');
  });

  it('no tree in reach: harvest hidden, clear disabled with Nothing to clear!', () => {
    const c = packTreeConditions({ tool: 'hatchet', working: true });
    assert.equal(c.harvest.state, null);
    assert.equal(c.harvest_clear.state, null);
    assert.deepEqual(c.clear, { state: 'disabled', reason: 'Nothing to clear!' });
  });

  it('a ready tree: harvest enabled and clear hidden', () => {
    const c = packTreeConditions({ tool: 'hatchet', working: true, wood: side({ enabled: true }) });
    assert.deepEqual([c.harvest.state, c.clear.state, c.harvest_clear.state], ['enabled', null, null]);
  });

  it('a wee tree: Harvest and Clear instead, harvest hidden', () => {
    const c = packTreeConditions({ tool: 'hatchet', working: true, wood: side({ enabled: true }, 1) });
    assert.deepEqual([c.harvest.state, c.clear.state, c.harvest_clear.state], [null, null, 'enabled']);
  });

  it('a harvested tree: the daily line on harvest, clear hidden', () => {
    const c = packTreeConditions({ tool: 'hatchet', working: true, wood: side({ enabled: false, reason: 'You can only harvest this tree once per game day.' }) });
    assert.deepEqual(c.harvest, { state: 'disabled', reason: PACK_TREE_TEXT.onceADay });
    assert.equal(c.clear.state, null);
    // A wee one harvested today: harvest_clear hidden, so harvest says the daily line.
    const wee = packTreeConditions({ tool: 'hatchet', working: true, wood: side({ enabled: false, reason: 'x once per game day.' }, 1) });
    assert.deepEqual([wee.harvest.state, wee.harvest_clear.state], ['disabled', null]);
  });

  it('a remake-only gate (energy) shows the tree reason', () => {
    const c = packTreeConditions({ tool: 'hatchet', working: true, wood: side({ enabled: false, reason: 'Needs 20 energy (you have 3).' }) });
    assert.equal(c.harvest.reason, 'Needs 20 energy (you have 3).');
  });

  it('a dead tree with clear enabled wins over the wood tree rule', () => {
    const c = packTreeConditions({ tool: 'hatchet', working: true, wood: side({ enabled: true }), dead: { clear: { state: 'enabled' }, verb: {} } });
    assert.deepEqual([c.harvest.state, c.clear.state], ['enabled', 'enabled']);
  });
});

describe('packTreeButtons', () => {
  it('lists the visible verbs in each tool file order', () => {
    const all = { harvest: { state: 'enabled' }, clear: { state: 'disabled', reason: 'r' }, harvest_clear: { state: 'enabled' } };
    assert.deepEqual(packTreeButtons('hatchet', all).map((b) => b.id), ['harvest', 'clear', 'harvest_clear']);
    assert.deepEqual(packTreeButtons('class_axe', all).map((b) => b.id), ['clear', 'harvest', 'harvest_clear']);
    const b = packTreeButtons('hatchet', { harvest: { state: null }, clear: { state: 'disabled', reason: 'Nothing to clear!' }, harvest_clear: { state: null } });
    assert.deepEqual(b, [{ id: 'clear', label: 'clear', tooltip: 'Clear a dead tree for planks', enabled: false, reason: 'Nothing to clear!' }]);
  });
});

describe('planPackTreeVerb (hatchet.js handlers)', () => {
  const verbs = (t) => (t.classId === 'wood_tree' ? [{ id: 'harvest', enabled: t.ready !== false, reason: t.ready === false ? 'You can only harvest this tree once per game day.' : '' }] : [{ id: 'clear', enabled: t.ok !== false, reason: t.ok === false ? "You'll need a working Hatchet." : '' }]);
  const finderFor = (targets) => (pred) => findCloseTarget(targets, { x: 1000, y: 600 }, pred);

  it('harvest runs the tree verb, or says there is nothing to harvest', () => {
    const tree = wood(1050);
    assert.equal(planPackTreeVerb('harvest', { find: finderFor([tree]), verbsOf: verbs }).run.target, tree);
    assert.deepEqual(planPackTreeVerb('harvest', { find: finderFor([]), verbsOf: verbs }), { lines: [PACK_TREE_TEXT.nothingToHarvest] });
    const spent = Object.assign(wood(1050), { ready: false });
    assert.deepEqual(planPackTreeVerb('harvest', { find: finderFor([spent]), verbsOf: verbs }).lines, [PACK_TREE_TEXT.treeSpent, PACK_TREE_TEXT.nothingToHarvest]);
    assert.deepEqual(planPackTreeVerb('harvest', { working: false, find: finderFor([tree]), verbsOf: verbs }), { lines: [] });
  });

  it('Harvest and Clear only reaches a wee tree', () => {
    assert.deepEqual(planPackTreeVerb('harvest_clear', { find: finderFor([wood(1050)]), verbsOf: verbs }).lines, [PACK_TREE_TEXT.nothingToHarvest]);
    assert.ok(planPackTreeVerb('harvest_clear', { find: finderFor([wood(1050, { maturity: 1 })]), verbsOf: verbs }).run);
  });

  it('clear tries the dead classes in source order, not the nearest overall', () => {
    const gas = dead(1010, 'trant_gas_dead');
    const bean = dead(1090, 'trant_bean_dead');
    assert.equal(planPackTreeVerb('clear', { find: finderFor([gas, bean]), verbsOf: verbs }).run.target, bean);
    const refuse = Object.assign(dead(1010), { ok: false });
    assert.deepEqual(planPackTreeVerb('clear', { find: finderFor([refuse]), verbsOf: verbs }).lines, ["You'll need a working Hatchet.", PACK_TREE_TEXT.nothingToClearRun]);
    assert.deepEqual(planPackTreeVerb('clear', { find: finderFor([]), verbsOf: verbs }).lines, [PACK_TREE_TEXT.nothingToClearRun]);
  });
});

describe('the feature on the real tree verbs', () => {
  it('registers once in the feature list', () => {
    assert.equal(FEATURES.filter((f) => f.id === 'pack-tree-verbs').length, 1);
  });

  it('a Hatchet beside a ready Wood Tree offers harvest and starts the tree harvest', () => {
    const { engine, begun, data } = fakeEngine({ targets: [wood(1072)] });
    const buttons = packTreeVerbsFeature.packVerbs('hatchet', engine);
    assert.deepEqual(buttons.map((b) => [b.id, b.enabled]), [['harvest', true]]);
    assert.equal(data.packTreeVerbs, 'harvest:enabled');
    assert.equal(packTreeVerbsFeature.runPackVerb('hatchet', 'harvest', engine), true);
    assert.deepEqual(begun, [{ classId: 'wood_tree', verb: 'harvest', label: 'harvest' }]);
    assert.equal(packTreeVerbsFeature._state().last, 'hatchet:harvest:wood_tree');
  });

  it('a harvested tree: harvest disabled with the daily line', () => {
    const { engine } = fakeEngine({ targets: [wood(1072, { harvestedToday: true })] });
    const [b] = packTreeVerbsFeature.packVerbs('hatchet', engine);
    assert.deepEqual([b.id, b.enabled, b.reason], ['harvest', false, PACK_TREE_TEXT.onceADay]);
  });

  it('a wee tree: Harvest and Clear on the pack and on the tree menu', () => {
    const tree = wood(1072, { maturity: 1 });
    const { engine, begun } = fakeEngine({ targets: [tree] });
    assert.deepEqual(packTreeVerbsFeature.packVerbs('hatchet', engine).map((b) => [b.id, b.label, b.enabled]), [['harvest_clear', 'Harvest and Clear', true]]);
    runPackTreeVerb(engine, 'hatchet', 'harvest_clear');
    assert.deepEqual(begun, [{ classId: 'wood_tree', verb: 'harvest', label: 'Harvest and Clear' }]);
    const menu = packTreeVerbsFeature.decorateVerbs(tree, getVerbsFor(tree, { pc: engine.pc, inv: engine.inv, tools: engine.toolState, skills: { learned: [] } }));
    const harvest = menu.find((v) => v.id === 'harvest');
    assert.deepEqual([harvest.label, harvest.tooltip], ['Harvest and Clear', PACK_TREE_TEXT.harvestClearTip]);
    assert.equal(packTreeVerbsFeature.decorateVerbs(wood(0), menu.map((v) => ({ ...v }))), null, 'a grown tree keeps its menu');
  });

  it('nothing in reach: clear disabled, and running it says so', () => {
    const { engine, log } = fakeEngine({ targets: [wood(1200)] });
    assert.deepEqual(packTreeVerbsFeature.packVerbs('hatchet', engine).map((b) => [b.id, b.enabled, b.reason]), [['clear', false, 'Nothing to clear!']]);
    runPackTreeVerb(engine, 'hatchet', 'harvest');
    assert.deepEqual(log, [PACK_TREE_TEXT.nothingToHarvest]);
  });

  it('a Class Axe beside a dead tree clears it through the patches clear verb', () => {
    const { engine, begun } = fakeEngine({ targets: [dead(960, 'trant_fruit_dead')], inv: { class_axe: 1 } });
    assert.deepEqual(packTreeVerbsFeature.packVerbs('class_axe', engine).map((b) => [b.id, b.enabled]), [['clear', true]]);
    runPackTreeVerb(engine, 'class_axe', 'clear');
    assert.deepEqual(begun.map((b) => [b.classId, b.verb]), [['trant_fruit_dead', 'clear']]);
  });

  it('a broken Hatchet shows the broken line and does nothing', () => {
    const tools = createToolConditionState();
    setToolRemaining(tools, 'hatchet', 0);
    const { engine, begun, log } = fakeEngine({ targets: [wood(1072)], tools });
    const buttons = packTreeVerbsFeature.packVerbs('hatchet', engine);
    assert.deepEqual(buttons.map((b) => [b.id, b.reason]), [
      ['harvest', 'This Hatchet has become broken, and must be repaired.'],
      ['clear', 'This Hatchet has become broken, and must be repaired.'],
    ]);
    runPackTreeVerb(engine, 'hatchet', 'harvest');
    assert.deepEqual([begun.length, log.length], [0, 0]);
  });

  it('no verbs without the tool, or for other items', () => {
    const { engine } = fakeEngine({ targets: [wood(1072)], inv: {} });
    assert.deepEqual(packTreeVerbsFeature.packVerbs('hatchet', engine), []);
    assert.deepEqual(packTreeVerbsFeature.packVerbs('hoe', engine), []);
    assert.equal(packTreeVerbsFeature.runPackVerb('hoe', 'harvest', engine), false);
  });
});
