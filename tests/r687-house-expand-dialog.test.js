/**
 * #687 (Austin 2026-11-25 chose the original's dialog): Decoration Mode's Expand was a button that did
 * the expanding, off while short with a cost note under the banner (#182) that went away once the
 * player could pay, with nothing saying they were ready. In Glitch Expand always opened
 * HouseExpandDialog (DecorateToolbarUI.as 319-320): "The next expansion will cost:", a row per item
 * with "Nx" and "Need N more" or "Got 'em" (HouseExpandReqUI.as 86, 132, 135), and "Use these items to
 * expand your house", off with its tip while short or while a floor project runs (HouseExpandDialog.as
 * 109, 248, 579-588); at the widest, "Your house is already sooo wide!" and Okay (120, 400). It stayed
 * open after an expansion with the next cost (HouseManager.as onExpandReply).
 * Run: node --test tests/r687-house-expand-dialog.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { EXPAND_DIALOG, addFloor, createFloorsState, expandCountText, expandRowStatus, houseExpandView, wallExpandItems } from '../public/js/home-floors.js?v=0565b551';
import { createHomeDecorState, placeFurniture } from '../public/js/home-decor.js?v=69523fb6';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const CLIENT = join(homedir(), 'Documents/glitch-audit/glitch-client/com/tinyspeck/engine');
const client = (f) => (existsSync(join(CLIENT, f)) ? readFileSync(join(CLIENT, f), 'utf8') : null);

function twoFloors() {
  const ground = createHomeDecorState({ starterKit: true });
  ground.storage.furniture_door = 1;
  const door = placeFurniture(ground, {}, 'furniture_door', { x: 600 }).item;
  const fs = createFloorsState();
  fs.pending = { floor: 0, id: door.id };
  addFloor(fs, ground);
  return { fs, ground };
}

describe('#687 the expand dialog states', () => {
  it('short: the cost with what is missing, the button off with its tip', () => {
    const view = houseExpandView(createFloorsState(), createHomeDecorState(), {});
    assert.equal(view.title, 'The next expansion will cost:');
    assert.deepEqual(view.rows.map((r) => [r.classTsid, `${r.count}x`, r.label, expandRowStatus(r)]), [['wall_segment', '1x', 'Wall Segment', 'Need 1 more']]);
    assert.deepEqual(view.button, { label: 'Use these items to expand your house', disabled: true, tip: 'You need the materials first!' });
    assert.equal(view.made, 'A Wall Segment is made with a Construction Tool.');
    assert.equal(view.count, `This building can be expanded ${20 - createHomeDecorState().wallSegments} more times.`);
    assert.equal(view.ok, false);
  });

  it('ready: every row says Got ’em and the button is on', () => {
    const view = houseExpandView(createFloorsState(), createHomeDecorState(), { wall_segment: 3 });
    assert.equal(view.ok, true);
    assert.deepEqual(view.rows.map(expandRowStatus), ['Got ’em']);
    assert.deepEqual(view.button, { label: EXPAND_DIALOG.button, disabled: false, tip: '' });
    assert.equal(view.made, '');
  });

  it('two floors: every item, each with what is still missing (bags count: the inventory totals)', () => {
    const { fs, ground } = twoFloors();
    const inv = { wall_segment: 2, grade_aa_earth_block: 0, girder: 5 };
    const view = houseExpandView(fs, ground, inv);
    const want = wallExpandItems(2, ground.wallSegments - 2);
    assert.deepEqual(view.rows.map((r) => r.classTsid), Object.keys(want));
    assert.equal(expandRowStatus(view.rows.find((r) => r.classTsid === 'grade_aa_earth_block')), 'Need 1 more');
    assert.equal(expandRowStatus(view.rows.find((r) => r.classTsid === 'wall_segment')), 'Got ’em');
    assert.equal(view.button.disabled, true);
  });

  it('a floor project under way: the materials are there but the button waits, with its tip', () => {
    const { fs, ground } = twoFloors();
    fs.pending = { floor: 1, id: 1 };
    const view = houseExpandView(fs, ground, { wall_segment: 9, grade_aa_earth_block: 9, girder: 9 });
    assert.equal(view.button.disabled, true);
    assert.equal(view.button.tip, 'You need to finish up your floor project first!');
  });

  it('the widest house: its title and Okay, no rows', () => {
    const ground = createHomeDecorState();
    ground.wallSegments = 20;
    const view = houseExpandView(createFloorsState(), ground, { wall_segment: 9 });
    assert.equal(view.maxed, true);
    assert.equal(view.title, 'Your house is already sooo wide!');
    assert.deepEqual(view.rows, []);
    assert.equal(view.button.label, 'Okay');
    assert.equal(view.count, 'This building can’t be expanded anymore.');
    assert.equal(view.unexpand, true);
    assert.equal(expandCountText(1), 'This building can be expanded 1 more time.');
  });

  it('the words are the client\'s', () => {
    const dialog = client('port/HouseExpandDialog.as');
    if (dialog) {
      for (const s of ["'The next expansion will cost:'", "label: 'Use these items to expand your house'", "expand_tip.txt = 'You need the materials first!'", "expand_tip.txt = 'You need to finish up your floor project first!'", "label: 'Okay'", 'You can also un-expand your house.']) assert.ok(dialog.includes(s), s);
    }
    const req = client('view/ui/decorate/HouseExpandReqUI.as');
    if (req) for (const s of ["+req.count+'x</p>'", "Need <b>'+need_num+'</b> more", "'Got ’em'"]) assert.ok(req.includes(s), s);
  });

  it('the banner\'s Expand opens the dialog, never off, and the banner carries no cost note', () => {
    const src = read('public/js/features/homes-feature.js');
    const at = src.indexOf("label: 'Expand',\n      icon:");
    const btn = src.slice(at, src.indexOf('{ label: UNEXPAND_TEXT.button', at));
    assert.match(btn, /onClick: \(\) => openHouseExpandDialog\(engine\)/);
    assert.doesNotMatch(btn, /disabled:/);
    assert.doesNotMatch(src, /bannerNote: /);
    assert.match(src, /if \(next !== 'decorate'\) closeHouseExpandDialog\(engine\);/);
    // Both skins dress it (Classic in place, the same ids and hooks).
    assert.match(read('public/style.css'), /\[data-ui="modern"\] #game-root \.hb-pop\.hb-expand \{/);
    assert.match(read('public/css/classic.css'), /:root\[data-ui="classic"\] #game-root \.hb-pop\.hb-expand \{/);
  });
});
