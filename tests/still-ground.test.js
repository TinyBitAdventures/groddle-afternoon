/**
 * #285: a Still works on the ground, as in Glitch (items/still.js). In the pack its Collect and
 * Distill stay, refused ("You must first Drop this to use it.", 134-136, 208-210); dropped it has
 * Distill (which grain, how many, room in the hopper), Collect (4 s, then the Hooch) and Pick up,
 * its hopper and Hooch lie with it as the dropped stack's words, run while you are away, and come
 * back into the pack with it, where it stops (onPickup 488-493). An older save's working pack
 * Still keeps its Hooch. Art: Tiny Speck's four state sheets (js/still-art.js).
 * Run: node --test tests/still-ground.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInventory, countItem } from '../public/js/inventory.js?v=f49c8998';
import { copyForVerb, copyTags, createToolConditionState, keepsOwnStack, setCopyTag } from '../public/js/tools.js?v=48542c24';
import { STILL, STILL_TEXT, createStillState, distillInStill, stillCollectCheck, stillDistillCheck } from '../public/js/machines.js?v=e96d8d3b';
import { supplyFeature } from '../public/js/features/supply-feature.js?v=a703f7a8';
import { createDroppedItemState, dropInventoryStack, pickupDroppedStack } from '../public/js/world-items.js?v=deadf665';
import { shareReason } from '../public/js/drops-mp.js?v=3207d36c';
import { dropFor } from '../public/js/world-drop.js?v=d152b2bb';
import { STILL_ART, STILL_ART_CELL, stillArtFrame, stillArtState, stillSheetDef } from '../public/js/still-art.js?v=2eeb65ff';

const root = join(import.meta.dirname, '..');
const STILL_JS = join(root, '..', 'glitch-GameServerJS', 'items', 'still.js');
const skipWithoutSource = existsSync(STILL_JS) ? false : 'needs tinyspeck/glitch-GameServerJS beside the game';
const T = 'STREET';

function world(items = {}, { stills = 1, tag = null, skills = ['distilling_1'], home = null } = {}) {
  const played = [];
  const data = {};
  let changed = 0;
  const rows = Array.from({ length: stills }, (_, k) => ({ id: `world-item-${k + 1}`, classTsid: 'still', count: 1, x: 100 * k, y: 0, ...(tag ? { tags: [{ ...tag }] } : {}) }));
  const engine = {
    played,
    data,
    inv: createInventory({ ...items }),
    pc: { energy: 100, imaginationUpgrades: [] },
    toolState: createToolConditionState(),
    learnedSkills: skills,
    param: () => null,
    playSound: (key, opts) => played.push([key, opts?.volume]),
    setData: (k, v) => { data[k] = v; },
    droppedItems: { streets: { [T]: rows } },
    dropTsid: T,
    droppedItemsChanged() { changed += 1; },
    get changed() { return changed; },
    homeContext: () => home || { inHome: false },
  };
  return engine;
}
const target = (engine, at = 0) => ({ classId: 'dropped_item', state: { id: engine.droppedItems.streets[T][at].id, classTsid: 'still', count: 1 } });
const tagOf = (engine, at = 0) => engine.droppedItems.streets[T][at].tags?.[0] ?? null;
const pickup = { id: 'pickup', label: 'pick up', sort: 10, enabled: true, reason: '', tooltip: 'Put Still in your pack' };
const menu = (engine, at = 0) => supplyFeature.decorateVerbs(target(engine, at), [pickup], engine);
const row = (engine, id) => menu(engine).find((v) => v.id === id);

beforeEach(() => supplyFeature._reset());

describe('in the pack', () => {
  it('Collect and Distill stay, refused: drop it first (the skill first for Collect, as 130-136)', () => {
    const engine = world({ still: 1, grain: 30 }, { stills: 0 });
    assert.deepEqual(supplyFeature.packVerbs('still', engine).map((v) => [v.id, v.enabled, v.reason]), [
      ['collect', false, STILL_TEXT.mustDrop],
      ['distill', false, STILL_TEXT.mustDrop],
    ]);
    const unskilled = world({ still: 1, grain: 30 }, { stills: 0, skills: [] });
    assert.deepEqual(supplyFeature.packVerbs('still', unskilled).map((v) => v.reason), [STILL_TEXT.skill, STILL_TEXT.mustDrop]);
    assert.equal(supplyFeature.runPackVerb('still', 'distill', engine), true);
    assert.equal(countItem(engine.inv, 'grain'), 30);
    assert.equal(countItem(engine.inv, 'hooch'), 0);
  });
});

describe('on the ground', () => {
  it('has Pick up, Collect and Distill with the source conditions and tooltips', () => {
    const empty = world({});
    assert.deepEqual(menu(empty).map((v) => v.id), ['pickup', 'collect', 'distill']);
    assert.equal(row(empty, 'collect').enabled, false);
    assert.equal(row(empty, 'collect').reason, STILL_TEXT.empty);
    assert.equal(row(empty, 'distill').reason, STILL_TEXT.nothing);
    assert.equal(row(empty, 'distill').tooltip, 'Add Grain, Potatoes or Corn to the hopper to begin making Hooch');
    const working = world({ grain: 3 }, { tag: { hopper: 30, hooch: 0, workingSince: Date.now() - 1000 } });
    assert.equal(row(working, 'collect').reason, 'This Still is currently working, and will produce 2 more Hooch. Return in a while to collect your Hooch.');
    assert.equal(row(working, 'distill').enabled, true);
    assert.equal(row(working, 'distill').picker, 'distill');
    assert.match(row(working, 'distill').tooltip, /^The hopper contains 30 units, enough to make 2 Hooch\./);
    const low = world({}, { tag: { hopper: 6, hooch: 0, workingSince: 0 } });
    assert.equal(row(low, 'collect').reason, STILL_TEXT.needsMore);
    const ready = world({}, { tag: { hopper: 0, hooch: 3, workingSince: 0 } });
    assert.equal(row(ready, 'collect').enabled, true);
    assert.equal(row(ready, 'collect').tooltip, 'Collect your 3 Hooches!');
    const unskilled = world({ grain: 5 }, { tag: { hopper: 0, hooch: 3 }, skills: [] });
    assert.equal(row(unskilled, 'collect').reason, STILL_TEXT.skill);
    assert.equal(row(unskilled, 'distill').reason, STILL_TEXT.skill);
    // A full hopper: too full for anything you carry.
    const full = world({ potato: 4 }, { tag: { hopper: 495, hooch: 0, workingSince: Date.now() } });
    assert.equal(row(full, 'distill').reason, STILL_TEXT.tooFull);
  });

  it('Distill picks the grain that fits and asks how many, up to the room in the hopper', () => {
    const engine = world({ grain: 600, corn: 2, potato: 3 }, { tag: { hopper: 450, hooch: 0, workingSince: Date.now() } });
    const t = target(engine);
    assert.deepEqual(supplyFeature.pickerChoices(t, 'distill', engine).map((c) => [c.classTsid, c.have]), [['grain', 600], ['corn', 2], ['potato', 3]]);
    assert.equal(supplyFeature.pickerTakesCount(t, 'distill'), true);
    assert.equal(supplyFeature.pickerMax(t, 'distill', 'grain', engine), 50);
    assert.equal(supplyFeature.pickerMax(t, 'distill', 'potato', engine), 3);
    assert.equal(supplyFeature.runVerbOverride(t, 'distill:grain:20', engine), true);
    assert.equal(countItem(engine.inv, 'grain'), 580);
    assert.equal(tagOf(engine).hopper, 470);
    assert.equal(supplyFeature._state().last, 'You added 20 Grains to the hopper.');
    // Not a Still on the ground, or another verb: not ours.
    assert.equal(supplyFeature.pickerChoices({ classId: 'npc_piggy' }, 'feed', engine), null);
    assert.equal(supplyFeature.pickerTakesCount(t, 'feed'), null);
  });

  it('Distill with too little to make a Hooch says the source line; a full Still takes the grain all the same', () => {
    const state = createStillState();
    const inv = createInventory({ grain: 5 });
    assert.equal(distillInStill(state, inv, 'grain', ['distilling_1'], 1000).msg, 'You added 5 Grains to the hopper. Hm… nothing happened. Maybe you "still" need to add more stuff?');
    assert.equal(state.workingSince, 0);
    const full = createStillState({ hooch: STILL.maxHooch });
    const res = distillInStill(full, createInventory({ potato: 1 }), 'potato', ['distilling_1'], 1000);
    assert.equal(res.msg, "You added 1 Potato to the hopper. The Still is totally full. You'll have to remove some Hooch before you can make any more.");
    assert.equal(full.hopper, 7);
  });

  it('Collect: the chime and the collect clip, the Hooch 4 s later; no Pick up meanwhile', () => {
    const engine = world({}, { tag: { hopper: 28, hooch: 3, workingSince: Date.now() - 5000 } });
    const t = target(engine);
    supplyFeature.runVerbOverride(t, 'collect', engine);
    assert.deepEqual(engine.played, [['STILL_COLLECT', 0.6]]);
    // The run under way stops for the collect (apiCancelTimer finishWorking).
    assert.equal(tagOf(engine).workingSince, 0);
    assert.match(engine.data.supplyStill, /art=collect/);
    assert.equal(row(engine, 'pickup').enabled, false);
    assert.equal(row(engine, 'pickup').reason, STILL_TEXT.collectingSelf);
    assert.equal(supplyFeature.groundPickupRefused(t, engine), STILL_TEXT.collectingSelf);
    assert.equal(row(engine, 'collect').enabled, false, 'one collect at a time (give_pc)');
    supplyFeature.onTick(16, Date.now() + 3000, engine);
    assert.equal(countItem(engine.inv, 'hooch'), 0);
    supplyFeature.onTick(16, Date.now() + 4100, engine);
    assert.equal(countItem(engine.inv, 'hooch'), 3);
    assert.equal(supplyFeature._state().last, 'You collected 3 Hooches in convenient, rustic jars.');
    // giveHooch: grain enough left, so it works on.
    assert.equal(tagOf(engine).hooch, 0);
    assert.ok(tagOf(engine).workingSince > 0);
    assert.equal(supplyFeature.groundPickupRefused(t, engine), null);
  });

  it('runs while you are away: the Hooch made since is there when you come back', () => {
    const engine = world({}, { tag: { hopper: 100, hooch: 0, workingSince: Date.now() - 10 * STILL.workMs - 1000 } });
    supplyFeature.onTick(16, Date.now(), engine);
    // finishWorking set 'ready' (409) while you were away.
    assert.deepEqual(tagOf(engine), { hopper: 100 - 7 * STILL.hoochCost, hooch: 7, workingSince: 0, ready: true });
    assert.equal(engine.played.length, 0, 'a stop long ago passes in silence');
  });

  it('put down with grain in it, it starts working 2 s later (onDrop 482-486)', () => {
    const t0 = Date.now();
    const engine = world({}, { tag: { hopper: 42, hooch: 1, workingSince: 0 } });
    supplyFeature.onTick(16, t0, engine);
    assert.equal(tagOf(engine).workingSince, 0);
    supplyFeature.onStreetEnter({}, engine);
    // Picked up it was 'empty' (onPickup 489); nothing on drop sets another state, Hooch or not.
    assert.match(engine.data.supplyStill, /working=0,ground=1,art=empty/);
    supplyFeature.onTick(16, t0 + 2100, engine);
    assert.equal(tagOf(engine).workingSince, t0 + 2000);
    assert.ok(engine.changed > 0, 'saved with the dropped stacks');
  });

  it('a hopper of exactly 14 stays idle after a drop (onDrop 483: more than hoochCost) until the next Distill', () => {
    const t0 = Date.now();
    const engine = world({ grain: 1 }, { tag: { hopper: 14, hooch: 0, workingSince: 0 } });
    supplyFeature.onTick(16, t0, engine);
    supplyFeature.onTick(16, t0 + 5000, engine);
    assert.equal(tagOf(engine).workingSince, 0);
    supplyFeature.runVerbOverride(target(engine), 'distill:grain:1', engine);
    assert.ok(tagOf(engine).workingSince > 0, 'Distill starts it (363-364)');
  });

  it('shows empty when dropped, ready once a run of its finishes, then empty again after a Collect', () => {
    const t0 = Date.now();
    const engine = world({}, { tag: { hopper: 0, hooch: 2, workingSince: 0 } });
    supplyFeature.onStreetEnter({}, engine);
    assert.match(engine.data.supplyStill, /art=empty/);
    engine.droppedItems.streets[T][0].tags = [{ hopper: 14, hooch: 2, workingSince: t0 - STILL.workMs - 10 }];
    supplyFeature.onTick(16, t0, engine);
    assert.equal(tagOf(engine).ready, true);
    assert.match(engine.data.supplyStill, /art=ready/);
    supplyFeature.runVerbOverride(target(engine), 'collect', engine);
    supplyFeature.onTick(16, t0 + 4100, engine);
    assert.equal(tagOf(engine), null, 'giveHooch: empty, nothing left to keep');
  });

  it('no Still is left in someone else\'s house, nor taken from it, nor collected from (canDrop, canPickup, 139-144)', () => {
    const away = world({ still: 1 }, { tag: { hopper: 0, hooch: 2 }, home: { inHome: true, owned: false } });
    assert.equal(supplyFeature.packDropBlockReason('still', away), "This is someone else's house. Don't litter!");
    assert.equal(supplyFeature.groundPickupRefused(target(away), away), STILL_TEXT.stealing);
    assert.equal(row(away, 'collect').reason, STILL_TEXT.bootlegger);
    const mine = world({ still: 1 }, { home: { inHome: true, owned: true } });
    assert.equal(supplyFeature.packDropBlockReason('still', mine), null);
  });
});

describe('its hopper and Hooch go where it goes', () => {
  it('down with it from the pack, and back up with it, where it stops', () => {
    const engine = world({ still: 1 }, { stills: 0 });
    const at = copyForVerb(engine.toolState, 'still', null);
    setCopyTag(engine.toolState, 'still', at, { hopper: 70, hooch: 4, workingSince: 0 });
    // game.js dropPackItem / dropPackStackAt: the leaving copy's words go down with the stack.
    const ground = createDroppedItemState();
    const tags = copyTags(engine.toolState, 'still');
    const down = dropInventoryStack(ground, engine.inv, T, 'still', 1, { x: 10, y: 0 }, { tags, merge: !keepsOwnStack('still') });
    assert.deepEqual(down.stack.tags, [{ hopper: 70, hooch: 4, workingSince: 0 }]);
    engine.droppedItems = ground;
    supplyFeature.onTick(16, Date.now(), engine);
    supplyFeature.onTick(16, Date.now() + 2100, engine);
    assert.ok(tagOf(engine).workingSince > 0, 'working on the ground');
    // Picked up mid-run: the words come back with it ...
    const up = pickupDroppedStack(ground, engine.inv, T, down.stack.id);
    assert.equal(up.tags[0].hooch, 4);
    setCopyTag(engine.toolState, 'still', 0, up.tags[0]);
    // ... and in the pack it stops (the next look).
    supplyFeature.onTick(16, Date.now() + 5000, engine);
    assert.deepEqual(copyTags(engine.toolState, 'still')[0], { hopper: 70, hooch: 4, workingSince: 0 });
  });

  it('two Stills never lie in one pile (stackmax 1, each its own hopper)', () => {
    assert.equal(keepsOwnStack('still'), true);
    const ground = createDroppedItemState();
    const inv = createInventory({ still: 2 });
    dropInventoryStack(ground, inv, T, 'still', 1, { x: 0, y: 0 }, { merge: !keepsOwnStack('still'), tags: [{ hopper: 14, hooch: 0, workingSince: 0 }] });
    dropInventoryStack(ground, inv, T, 'still', 1, { x: 5, y: 0 }, { merge: !keepsOwnStack('still') });
    assert.equal(ground.streets[T].length, 2);
  });

  it('an older save: a pack Still that was working keeps the Hooch it made, then waits to be dropped', () => {
    const engine = world({ still: 1 }, { stills: 0 });
    setCopyTag(engine.toolState, 'still', 0, { hopper: 56, hooch: 2, workingSince: Date.now() - 3 * STILL.workMs - 500 });
    supplyFeature.onTick(16, Date.now(), engine);
    assert.deepEqual(copyTags(engine.toolState, 'still')[0], { hopper: 14, hooch: 5, workingSince: 0 });
    // A v1 save's one Still state is the first Still's, as before.
    const old = world({ still: 1 }, { stills: 0 });
    supplyFeature.restore({ version: 1, still: { hopper: 28, hooch: 6 } }, old);
    assert.equal(copyTags(old.toolState, 'still')[0].hooch, 6);
  });
});

describe('dragging grain onto it, and online', () => {
  it('a crop dragged onto a Still on the ground runs Distill with it (drop_ok_code: distillables with room)', () => {
    const verbs = [{ id: 'pickup' }, { id: 'distill', enabled: true }];
    const ctx = { distillable: (c) => c === 'grain' };
    assert.equal(dropFor('ground:still', 'grain', verbs, ctx).rule.id, 'distill');
    assert.equal(dropFor('ground:still', 'grain', verbs, ctx).rule.tip, 'Distill {$stack_name} into Hooch.');
    assert.equal(dropFor('ground:still', 'apple', verbs, ctx), null);
    assert.equal(dropFor('still', 'grain', verbs, ctx), null, 'only a Still lying on the ground');
    const engine = world({ grain: 5, apple: 1 }, { tag: { hopper: 499, hooch: 0, workingSince: Date.now() } });
    assert.equal(supplyFeature.stillTakes(target(engine), 'grain', engine), true);
    assert.equal(supplyFeature.stillTakes(target(engine), 'corn', engine), false);
  });

  it('online a Still stays the player\'s own: the shared ground has no verbs to run it', () => {
    const table = { items: { still: { max: 1, tag: 'still' }, apple: { max: 50 } } };
    for (const street of ['GLI32G3NUTD100I', 'HOME_7']) {
      assert.equal(shareReason('apple', table, { street }), '', `${street}: an apple is everyone's`);
      assert.equal(shareReason('still', table, { street }), 'works', `${street}: a Still stays the player's own`);
    }
    // A shared stack (a Still another player left before this) gets no Still verbs.
    const engine = world({});
    assert.equal(supplyFeature.decorateVerbs({ classId: 'dropped_item', state: { id: 'drop-1', classTsid: 'still', count: 1, shared: true } }, [pickup], engine), null);
  });
});

describe('the art (js/still-art.js)', () => {
  it('plays empty, active, ready and collect as the source sets them', () => {
    const now = 1_000_000;
    assert.equal(stillArtState({ hopper: 0, hooch: 0, workingSince: 0 }, { now }), 'empty');
    assert.equal(stillArtState({ hopper: 30, hooch: 0, workingSince: now - 5 }, { now }), 'active');
    assert.equal(stillArtState({ hopper: 0, hooch: 2, workingSince: 0 }, { now }), 'empty', 'dropped with Hooch: empty (onPickup 489)');
    assert.equal(stillArtState({ hopper: 0, hooch: 2, workingSince: 0, ready: true }, { now }), 'ready');
    assert.equal(stillArtState({ hopper: 0, hooch: 2, workingSince: 0 }, { now, collecting: true }), 'collect');
    // 30 fps: the collect clip is the collect timer's 4 s, held on its last frame.
    assert.equal(STILL_ART.collect.frames, 119);
    assert.equal(stillArtFrame('collect', 3966), 118);
    assert.equal(stillArtFrame('collect', 9000), 118);
    assert.equal(stillArtFrame('active', 99 * 1000 / 30), 0, 'active loops');
    assert.deepEqual(stillSheetDef('ready'), { path: 'assets/sprites/machines/still-ready.webp', fw: 96, fh: 163, cols: 9, frames: 41 });
  });

  it('ships each sheet as WebP at the source grid (tools/still-art/build.py --check measures the cells)', () => {
    for (const [state, art] of Object.entries(STILL_ART)) {
      const buf = readFileSync(join(root, 'public', art.url));
      assert.equal(buf.toString('ascii', 8, 16), 'WEBPVP8L', state);
      const bits = buf.readUInt32LE(21);
      const w = (bits & 0x3fff) + 1;
      const h = ((bits >> 14) & 0x3fff) + 1;
      assert.equal(w, art.cols * STILL_ART_CELL.fw, `${state} width`);
      assert.equal(h % STILL_ART_CELL.fh, 0, `${state} height`);
      assert.ok((h / STILL_ART_CELL.fh) * art.cols >= art.frames, `${state} rows`);
    }
  });
});

describe('the words are the source\'s (items/still.js)', () => {
  it('every refusal and line, word for word', { skip: skipWithoutSource }, () => {
    const src = readFileSync(STILL_JS, 'utf8');
    for (const [k, line] of Object.entries(STILL_TEXT)) {
      if (k === 'distillTitle') continue;
      assert.ok(src.includes(line), `${k}: ${line}`);
    }
    assert.ok(src.includes('"drop_tip"\t\t\t: "Distill {$stack_name} into Hooch."'));
    assert.match(src, /this\.apiSetTimer\('giveHooch', 4000\)/);
    assert.match(src, /this\.apiSetTimer\('startWorking', 2000\)/);
    // A check that refuses in the pack.
    assert.equal(stillCollectCheck(createStillState({ hooch: 3 }), ['distilling_1'], { onGround: false }).msg, STILL_TEXT.mustDrop);
    assert.equal(stillDistillCheck(createStillState(), createInventory({ grain: 3 }), ['distilling_1'], { onGround: false }).msg, STILL_TEXT.mustDrop);
  });
});
