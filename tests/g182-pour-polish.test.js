/**
 * G182: Wine of the Dead pour polish and the wee Wood Tree.
 * - The pour walks you beside the item and plays the bottle's tool_animation
 *   on it (items/wine_of_the_dead.js:213-262 modal_callback; js/wine-pour-fx.js,
 *   features/homes-feature.js pourFx, game.js engine.moveAvatar).
 * - The bottle drops onto an item (items/patch.js:44-74 remove, drop_tip
 *   "Pour {$stack_name} on {$item_name}"; homes-feature packDragStart).
 * - A pour that wears an item out sends no line (include/cultivation.js 52-82).
 * - The wee tree: maturity 1 is the "wee tree" (wood_tree.js:451) and its
 *   harvest says a harvest_state_1to0 line (wood_tree.js:1304-1310).
 * Run: node --test tests/g182-pour-polish.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WOTD_TOOL, pourApproach, pourDropTip } from '../public/js/wine-pour-fx.js?v=g369-1';
import { harvestWoodTree, woodMaturityLabel, woodTreeStatusLabel } from '../public/js/woodcutting.js?v=g403-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(gsjs);
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');

describe('source', { skip: !hasGsjs && 'GSJS checkout not beside this worktree' }, () => {
  it('modal_callback walks you 100 px short of the target and pours the tool_animation on it', () => {
    const s = src('items/wine_of_the_dead.js');
    assert.match(s, /if \(target\.x < pc\.x\)\{\s*var state = '-tool_animation';\s*var delta_x = 10;\s*var endpoint = target\.x\+100;\s*var face = 'left';/);
    assert.match(s, /else\{\s*var state = 'tool_animation';\s*var delta_x = -10;\s*var endpoint = target\.x-100;\s*var face = 'right';/);
    assert.match(s, /pc\.moveAvatar\(endpoint, pc\.y, face\);/);
    assert.match(s, /type: 'itemstack_overlay',\s*itemstack_tsid: target\.tsid,\s*duration: 3000,\s*item_class: this\.class_tsid,\s*state: state,\s*locking: false,\s*delta_x: delta_x,\s*delta_y: 20,/);
    assert.equal(WOTD_TOOL.durationMs, 3000);
    assert.equal(WOTD_TOOL.deltaY, 20);
    // The bubble above the avatar is for everyone else (apiSendAnnouncementX skips pc).
    assert.match(s, /pc\.location\.apiSendAnnouncementX\(\{\s*type: 'pc_overlay'[\s\S]*?\}, pc\);/);
  });

  it('the Patch, trees and protos take the bottle as a drop', () => {
    for (const f of ['items/patch.js', 'items/trant_bean.js', 'items/proto_patch.js']) {
      assert.ok(src(f).includes('"drop_tip"\t\t\t: "Pour {$stack_name} on {$item_name}"'), f);
    }
    assert.match(src('items/patch.js'), /return it\.verbs\['pour'\]\.handler\.call\(it, pc, msg\);/);
    assert.equal(pourDropTip('Wine of the Dead', 'Bean Tree'), 'Pour Wine of the Dead on Bean Tree');
  });

  it('a worn-out item sends no line, and the felling lines are the source\'s', () => {
    const c = src('items/include/cultivation.js');
    const deplete = c.slice(c.indexOf('function makeDepleted'), c.indexOf('function removeResource'));
    assert.doesNotMatch(deplete, /sendActivity/);
    const w = src('items/wood_tree.js');
    assert.ok(w.includes('"tooltip"\t\t\t: "Harvesting this wee tree will also kill it!"'));
    assert.match(w, /if \(this\.getInstanceProp\('maturity'\) == 1\)\{\s*if \(!this\.canHarvest\(pc\)\)/);
    assert.match(w, /\} else if \(maturity == 1\)\{\s*resp_type = 'harvest_state_1to0';/);
    const felled = w.slice(w.indexOf('"harvest_state_1to0": ['), w.indexOf('"harvest_state_3to2_2to1"'));
    for (const line of ['Wood: felled.', 'My trunk! My mighty tru…', "I've totally lost wood.", "Aaaand I'm spent.", 'Kiss this wood goodbye.']) {
      assert.ok(felled.includes(JSON.stringify(line)), line);
    }
  });
});

describe('the walk and the overlay', () => {
  it('stands you on the near side, facing the item, the bottle 10 px toward you', () => {
    assert.deepEqual(pourApproach(1000, 1300), { endpoint: 1100, face: 'left', state: '-tool_animation', flipped: true, deltaX: 10 });
    assert.deepEqual(pourApproach(1000, 700), { endpoint: 900, face: 'right', state: 'tool_animation', flipped: false, deltaX: -10 });
  });

  it('plays the CC0 tool_animation sheet: 90 cells of 66 x 89, one 3 s pour at 30 fps', () => {
    const { sheet } = WOTD_TOOL;
    const buf = readFileSync(join(pub, sheet.path));
    assert.equal(buf.toString('ascii', 12, 16), 'VP8L');
    const bits = buf.readUInt32LE(21);
    assert.deepEqual([(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1], [990, 534]);
    assert.deepEqual([sheet.fw * sheet.cols, sheet.fh * Math.ceil(sheet.frames / sheet.cols)], [990, 534]);
    assert.equal((sheet.frames / sheet.fps) * 1000, WOTD_TOOL.durationMs);
  });

  it('game.js walks the avatar for a feature (player.js moveAvatar)', () => {
    const game = read('game.js');
    assert.match(game, /moveAvatar: \(x, face\) => startAvatarWalk\(x, face\),/);
    assert.match(game, /const steer = avatarWalkSteer\(left \|\| right \|\| up \|\| down\);/);
  });

  it('homes-feature walks, pours, takes the drop and says no wear-out line for a pour', () => {
    const h = read('js/features/homes-feature.js');
    assert.match(h, /engine\.moveAvatar\?\.\(ap\.endpoint, ap\.face\);/);
    assert.match(h, /pourFx\(engine, row\);\n  removeItem\(engine\.inv, WOTD, 1\);/);
    assert.match(h, /packDragStart\(classTsid, event, engine\) \{\n    return startPourDrag\(classTsid, event, engine\) \? true : null;/);
    assert.doesNotMatch(h, /It wore out at once/);
    assert.match(h, /if \(!wotd\) engine\.pushActivity\(`Your \$\{result\.label\} wore out\./);
  });
});

describe('the wee Wood Tree', () => {
  it('maturity 1 is the wee tree, and the names follow the talkback tiers', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(woodMaturityLabel), ['Wee', 'Young', 'Young', 'Large', 'Large', 'Mighty']);
    assert.match(woodTreeStatusLabel({ maturity: 1 }), /^Wee · 25 planks/);
  });

  it('felling a wee tree says a harvest_state_1to0 line', () => {
    const felled = ['Wood: felled.', 'My trunk! My mighty tru…', "I've totally lost wood.", "Aaaand I'm spent.", 'Kiss this wood goodbye.'];
    const state = { maturity: 1 };
    const result = harvestWoodTree(state, { hatchet: 1 }, { energy: 100, maxEnergy: 100 }, {});
    assert.equal(result.ok, true);
    assert.equal(result.maturityAfter, 0);
    assert.ok(felled.includes(result.line), result.line);
    const tall = harvestWoodTree({ maturity: 3 }, { hatchet: 1 }, { energy: 100, maxEnergy: 100 }, {});
    assert.ok(!felled.includes(tall.line));
  });
});
