// Dragging a pack item onto a thing in the world (register G588 left; js/world-drop.js and
// features/world-drop-feature.js): GSJS drop-target verbs (is_drop_target, drop_ok_code, drop_tip).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORLD_DROP_RULES, dropFor, dropRulesFor, dropTip } from '../public/js/world-drop.js?v=f162fb0e';
import { overAt, runDrop } from '../public/js/features/world-drop-feature.js?v=74c277c6';

const root = join(import.meta.dirname, '..');
const pub = (f) => readFileSync(join(root, 'public', f), 'utf8');
const gsjs = (f) => {
  try { return readFileSync(join(root, '..', 'glitch-GameServerJS', 'items', f), 'utf8'); } catch { return null; }
};

describe('the drop-target table', () => {
  it('carries the original drop tips, word for word', (t) => {
    const egg = gsjs('npc_newxp_dustbunny.js');
    if (!egg) return t.skip('needs glitch-GameServerJS beside the game');
    const files = {
      give_egg: 'npc_newxp_dustbunny.js', feed: 'npc_piggy.js', apply_balm: 'npc_piggy.js', water: 'trant_bean.js',
      apply_antidote: 'trant_bean.js', poison: 'trant_bean.js', mine_metal: 'rock_metal_1.js', mine: 'rock_beryl_1.js', dig: 'patch.js', tend: 'patch.js',
      dig_dirt: 'dirt_pile.js', scrape: 'mortar_barnacle.js', scrape_ice: 'ice_knob.js',
      peat: 'peat_1.js', brush: 'npc_fox.js', add_note: 'bag_notice_board.js', donate: 'npc_shrine_cosma.js',
    };
    for (const rule of WORLD_DROP_RULES) {
      const src = gsjs(files[rule.id]);
      assert.ok(src, rule.id);
      assert.ok(src.includes(`"drop_tip"\t\t\t: "${rule.tip}"`), `${rule.id}: ${rule.tip}`);
    }
  });

  it('a target class has its rules, and only the stacks drop_ok_code takes', () => {
    assert.deepEqual(dropRulesFor('newxp_dustbunny').map((r) => r.id), ['give_egg']);
    assert.deepEqual(dropRulesFor('trant_bean').map((r) => r.id), ['apply_balm', 'water', 'apply_antidote', 'poison']);
    assert.deepEqual(dropRulesFor('trant_bean_dead'), []);
    assert.deepEqual(dropRulesFor('wood_tree').map((r) => r.id), ['apply_balm', 'water', 'apply_antidote', 'poison']);
    assert.deepEqual(dropRulesFor('npc_shrine_mab').map((r) => r.id), ['donate']);
    assert.deepEqual(dropRulesFor('garden_plot'), [], 'Guano on a plot stays with garden-guano-feature');
    const water = WORLD_DROP_RULES.find((r) => r.id === 'water');
    assert.equal(water.accepts('watering_can'), true);
    assert.equal(water.accepts('irrigator_9000'), true);
    assert.equal(water.accepts('hoe'), false);
    const donate = WORLD_DROP_RULES.find((r) => r.id === 'donate');
    const ctx = { isBag: (c) => c.startsWith('bag_'), hasTag: (c, tag) => c === 'machine_x' && tag === 'machine' };
    assert.equal(donate.accepts('cherry', ctx), true);
    assert.equal(donate.accepts('bag_bigger', ctx), false);
    assert.equal(donate.accepts('emblem_mab', ctx), false);
    assert.equal(donate.accepts('machine_x', ctx), false);
  });

  it('dropFor needs the target to offer the verb; a disabled verb still answers, for its reason', () => {
    const verbs = [{ id: 'pet', enabled: true }, { id: 'water', enabled: false, reason: 'Already watered today' }];
    const d = dropFor('trant_fruit', 'watering_can', verbs);
    assert.equal(d.rule.id, 'water');
    assert.equal(d.verb.enabled, false);
    assert.equal(dropFor('trant_fruit', 'watering_can', [{ id: 'pet' }]), null);
    assert.equal(dropFor('trant_fruit', 'cherry', verbs), null);
    assert.equal(dropFor('trant_fruit', '', verbs), null);
    // Tree Poison's verbs are tree-death-feature's (treepoison:*).
    assert.equal(dropFor('trant_egg', 'tree_poison', [{ id: 'treepoison:poison', enabled: true }]).rule.id, 'poison');
    // Feed asks the animal's own food list.
    const feedable = (c) => c === 'cherry';
    assert.equal(dropFor('npc_piggy', 'cherry', [{ id: 'feed', enabled: true }], { feedable }).rule.use, 'pick');
    assert.equal(dropFor('npc_piggy', 'pick', [{ id: 'feed', enabled: true }], { feedable }), null);
  });

  it('fills the client tokens in a tip', () => {
    assert.equal(dropTip('Feed {$count} {$stack_name} to {$item_name}', { count: 20, stackName: 'Cherry', stackPlural: 'Cherries', itemName: 'Piggy' }), 'Feed 20 Cherries to Piggy');
    assert.equal(dropTip('Feed {$count} {$stack_name} to {$item_name}', { count: 1, stackName: 'Cherry', stackPlural: 'Cherries', itemName: 'Piggy' }), 'Feed 1 Cherry to Piggy');
    assert.equal(dropTip('Water this {$item_name}', { itemName: 'Bean Tree' }), 'Water this Bean Tree');
    assert.equal(dropTip('Give Egg to Dust Bunny'), 'Give Egg to Dust Bunny');
  });
});

describe('the feature', () => {
  const fakeEngine = (target, verbs, inv = {}) => {
    const calls = [];
    const engine = {
      PIXI: { Point: class { constructor(x, y) { this.x = x; this.y = y; } } },
      camera: { w: 960 },
      entityLayer: { toLocal: (p) => ({ x: p.x + 1000, y: p.y }) },
      interactableAt: (x, y) => (Math.abs(x - 1480) < 40 && Math.abs(y - 300) < 40 ? target : null),
      targetVerbs: () => verbs,
      inv,
      data: {},
      setData(k, v) { this.data[k] = v; },
      query: () => null,
      playSound: (k) => calls.push(['sound', k]),
      toast: (m) => calls.push(['toast', m]),
      closeVerbMenu: () => calls.push(['close']),
      requestVerb: (t, v, opts) => { calls.push(['request', v.id, Boolean(opts?.run)]); opts?.run?.(); return true; },
      openPicker: (t, v, pick) => calls.push(['picker', v.id, pick]),
      openShrineDonate: (t, c) => calls.push(['donate', c]),
    };
    return { engine, calls };
  };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) };

  it('over a thing that takes the stack: its tip; elsewhere nothing', () => {
    const dust = { classId: 'newxp_dustbunny', label: 'Dustbunny' };
    const { engine } = fakeEngine(dust, [{ id: 'give_egg', enabled: true }], { egg_plain: 1 });
    const o = overAt(engine, canvas, 480, 300, 'egg_plain');
    assert.equal(o.tip, 'Give Egg to Dust Bunny');
    assert.equal(o.ok, true);
    assert.equal(overAt(engine, canvas, 100, 300, 'egg_plain'), null);
    assert.equal(overAt(engine, canvas, 480, 300, 'cherry'), null);
  });

  it('a drop runs the verb through the walk into reach; Feed and donate pick the dragged stack', () => {
    const tree = { classId: 'trant_fruit', label: 'Fruit Tree' };
    let { engine, calls } = fakeEngine(tree, [{ id: 'water', enabled: true }]);
    runDrop(engine, overAt(engine, canvas, 480, 300, 'watering_can'), 'watering_can');
    assert.deepEqual(calls.filter((c) => c[0] === 'request'), [['request', 'water', false]]);
    assert.equal(engine.data.worldDropLast, 'ran:trant_fruit:water');

    ({ engine, calls } = fakeEngine({ classId: 'npc_piggy', label: 'Piggy' }, [{ id: 'feed', enabled: true }], { cherry: 20 }));
    // The Piggy's own food list (animals.js) decides: a Cherry is food.
    const over = overAt(engine, canvas, 480, 300, 'cherry');
    // The plural comes from the catalog the browser fills (the page showed "Feed 20 Cherries to Piggy").
    assert.match(over.tip, /^Feed 20 Cherr(y|ies) to Piggy$/);
    runDrop(engine, over, 'cherry');
    assert.deepEqual(calls.filter((c) => c[0] === 'picker'), [['picker', 'feed', 'cherry']]);

    ({ engine, calls } = fakeEngine({ classId: 'npc_shrine_mab', label: 'Shrine to Mab' }, [{ id: 'donate_to', enabled: true }], { cherry: 3 }));
    runDrop(engine, overAt(engine, canvas, 480, 300, 'cherry'), 'cherry');
    assert.deepEqual(calls.filter((c) => c[0] === 'donate'), [['donate', 'cherry']]);
  });

  it('a verb that can not run now shows its reason in red and refuses the drop', () => {
    const { engine, calls } = fakeEngine({ classId: 'trant_fruit', label: 'Fruit Tree' }, [{ id: 'water', enabled: false, reason: 'Already watered today' }]);
    const o = overAt(engine, canvas, 480, 300, 'watering_can');
    assert.equal(o.ok, false);
    assert.equal(o.tip, 'Already watered today');
    assert.equal(runDrop(engine, o, 'watering_can'), false);
    assert.deepEqual(calls.filter((c) => c[0] === 'request'), []);
    assert.ok(calls.some((c) => c[0] === 'sound' && c[1] === 'CLICK_FAILURE'));
    assert.equal(engine.data.worldDropLast, 'refused:trant_fruit:water');
  });

  it('is registered, never takes the drag from a bag or a gift, and the engine passes the stack on', () => {
    const index = pub('js/features/index.js');
    assert.match(index, /import \{ worldDropFeature \} from '\.\/world-drop-feature\.js[^']*'; FEATURES\.push\(worldDropFeature\);/);
    const feature = pub('js/features/world-drop-feature.js');
    assert.doesNotMatch(feature, /packDragStart\(/, 'it only listens, as garden-guano-feature does');
    assert.match(feature, /globalThis\.groddleGifts\?\.playerAt\?\.\(clientX, clientY\)/);
    const game = pub('game.js');
    assert.match(game, /openPicker: \(target, verb, pick = ''\) => openFeedPicker\(target, verb, pick\),/);
    assert.match(game, /openShrineDonate: \(target, classTsid\) => openShrinePanel\(target, \{ item: classTsid \}\),/);
    assert.match(game, /requestVerb: \(target, verb, opts\) => requestVerb\(target, verb, opts\),/);
    assert.match(pub('style.css'), /\.world-drop-tip\.is-no \{ color: var\(--c-red-53d\); \}/);
    assert.match(pub('css/classic.css'), /:root\[data-ui="classic"\] \.world-drop-tip \{/);
  });

  it('an open bag\'s tray closes under the donation window however it opens (report #168, G623)', () => {
    const game = pub('game.js');
    const open = game.slice(game.indexOf('function openShrinePanel('), game.indexOf('function renderShrinePanel('));
    // By a dragged stack, by the shrine's verb or by the keyboard: every way in is openShrinePanel.
    assert.match(open, /\n  closePackTray\(\);\n/, 'always, not only for a dragged stack');
    assert.doesNotMatch(open, /if \(item\) closePackTray/);
    assert.ok(open.indexOf('closePackTray();') < open.indexOf('panel.hidden = false'), 'before the window shows');
    assert.doesNotMatch(open, /closeShrinePanel/);
    for (const call of game.match(/[^\n]*openShrinePanel\(target[^\n]*/g)) assert.match(call, /openShrinePanel\(target(, \{ item[^)]*\})?\)/, call);
  });

});
