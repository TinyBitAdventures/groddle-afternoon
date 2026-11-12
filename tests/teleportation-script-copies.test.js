/**
 * Report #125, G557: each Teleportation Script is its own copy with its own destination
 * (items/teleportation_script.js stackmax 1, has_instance_props, destination and is_imbued on the
 * item: 15-19, 254-260, 298-319). It used to be one list beside a count, so the one you held showed
 * the list's first street. Through the pack, the ground, bags, cabinets, gifts and trades, the
 * ledger and the realtime server; and saves from before it must lose nothing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SITE_DIR, skipWithoutServer, skipWithoutSite, SERVER_DIR } from '../tools/repos.mjs';
import { addItem, countItem, createInventory, ensureItem, ITEM_CATALOG } from '../public/js/inventory.js?v=5be47371';
import {
  TOOL_CONDITION_CATALOG,
  bindToolInventory,
  cleanCopyTag,
  copyTag,
  copyTagKind,
  copyTags,
  createToolConditionState,
  keepsOwnStack,
  leavingCopyTag,
  moveToolCopy,
  normalizeToolConditionState,
  pickToolCopies,
  placeToolCopies,
  receiveToolCopies,
  receiveToolCopy,
  setCopyTag,
  syncToolCopies,
  takeToolCopy,
} from '../public/js/tools.js?v=5f482998';
import {
  SCRIPT_CLASS,
  SCRIPT_ITEM,
  adoptScripts,
  createTeleportState,
  normalizeTeleportState,
  scriptFromTag,
  scriptLabel,
  scriptTag,
  scriptTitle,
  useScript,
} from '../public/js/teleportation.js?v=e95cf7cb';
import { teleportationFeature as feature } from '../public/js/features/teleportation-feature.js?v=cd1de9fc';
import { cleanContents, createDroppedItemState, dropInventoryStack, pickupDroppedStack, placeDroppedBag } from '../public/js/world-items.js?v=792e1606';
import { cabinetPut, cabinetTake, cleanHeldList, normalizeContents } from '../public/js/home-storage.js?v=b0225465';
import { normalizeGroundStack, normalizeItem } from '../public/js/drops-mp.js?v=ec6a135d';
import { goodsWithHeldTags, normalizeGoods } from '../public/js/trade.js?v=ce0373e5';

const root = join(import.meta.dirname, '..');
const A = { tsid: 'GA5101HF7F429V5', x: 100, y: -68, label: 'Hechey Track', hubId: '58', hubName: 'Groddle Forest' };
const B = { tsid: 'GCR10NQRPKJ16H6', x: 300, y: -90, label: 'Sylvan Grove', hubId: '58', hubName: 'Groddle Forest' };
const C = { tsid: 'GA5AAB0VNKR2VRN', x: 1642, y: 790, label: 'Teobocci Shasha', hubId: '86', hubName: 'Xalanga' };
const D = { tsid: 'LIFH2AKJ5I735SV', label: 'Winter Walk', hubName: 'Winter' };
const row = (destination, id, imbued = true) => ({ id, destination, imbued, title: scriptTitle(destination), createdAt: 1 });

function fakeEngine(items = {}, over = {}) {
  const inv = createInventory({});
  const toolState = bindToolInventory(createToolConditionState(), inv);
  for (const [cls, n] of Object.entries(items)) addItem(inv, cls, n);
  const log = { toasts: [], prompts: [], taken: [], activity: [] };
  const engine = {
    log,
    started: true,
    inv,
    toolState,
    pc: { energy: 90, mood: 50, xp: 0, imagination: 0 },
    learnedSkills: ['teleportation_1'],
    player: { x: 500, y: 400, vx: 0, vy: 0, onGround: true, height: 96 },
    street: { label: 'Elsewhere', hubId: '56', hubName: 'Groddle Forest' },
    streetTsid: 'GLI2V0UN7RD1T2J',
    param: () => null,
    setData() {},
    toast: (msg) => log.toasts.push(msg),
    prompt: (p) => log.prompts.push(p),
    pushActivity: (m) => log.activity.push(m),
    updateHud() {},
    save() {},
    achievement() {},
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    streetExists: () => true,
    travelGate: () => ({ ok: true }),
    closeMap() {},
    busy: () => false,
    query: (name, ...args) => {
      if (name === 'packTakeUnit') log.taken.push(args);
      return null;
    },
    PIXI: { Graphics: class { clear() {} roundRect() {} fill() {} circle() {} destroy() {} get destroyed() { return false; } } },
    fxLayer: { addChild() {} },
    ...over,
  };
  return engine;
}

const streets = (engine) => copyTags(engine.toolState, SCRIPT_CLASS).map((t) => t?.tsid ?? null);
const useVerb = (engine, copy) => feature.packVerbs(SCRIPT_CLASS, engine, { copy }).find((v) => v.id === 'use');

describe('one script, one destination', () => {
  it('stackmax 1, a class of the per-copy system, with its own stack on the ground', () => {
    assert.equal(SCRIPT_ITEM.stackMax, 1);
    assert.match(readFileSync(join(root, '../glitch-GameServerJS/items/teleportation_script.js'), 'utf8'), /var stackmax = 1;/);
    const def = TOOL_CONDITION_CATALOG[SCRIPT_CLASS];
    assert.equal(def.tags, true);
    assert.equal(def.repairable, false);
    assert.equal(copyTagKind(SCRIPT_CLASS), 'script');
    assert.equal(keepsOwnStack(SCRIPT_CLASS), true);
    assert.equal(keepsOwnStack('npc_cubimal_fox'), false);
  });

  it('a script\'s words read back as they were: an unknown spot stays unknown, not 0', () => {
    const tag = scriptTag({ destination: D, imbued: true });
    assert.deepEqual(tag, { tsid: D.tsid, x: null, y: null, label: 'Winter Walk', hubId: '', hubName: 'Winter', imbued: true });
    const back = scriptFromTag(tag);
    assert.deepEqual(back.destination, { tsid: D.tsid, label: 'Winter Walk', hubName: 'Winter' });
    assert.equal(back.imbued, true);
    assert.equal(back.title, 'Teleport to Winter Walk, Winter');
    assert.equal(scriptLabel(back), 'Imbued Teleportation Script to Winter Walk, Winter');
    assert.equal(scriptLabel(scriptFromTag(scriptTag({ destination: A }))), 'Teleportation Script to Hechey Track, Groddle Forest');
    assert.deepEqual(cleanCopyTag(SCRIPT_CLASS, tag), tag, 'clean twice, the same');
    assert.equal(scriptFromTag(null), null);
    assert.equal(scriptFromTag({ label: 'no street' }), null);
  });

  it('the report: each one held reads as its own street, in any order of picking up', () => {
    const engine = fakeEngine({ [SCRIPT_CLASS]: 3 });
    feature.restore({ scripts: [row(A, 'tps1'), row(B, 'tps2'), row(C, 'tps3')] }, engine);
    assert.deepEqual(streets(engine), [A.tsid, B.tsid, C.tsid]);
    assert.match(useVerb(engine, 0).label, /^Teleport to Hechey Track/);
    assert.match(useVerb(engine, 1).label, /^Teleport to Sylvan Grove/);
    assert.match(useVerb(engine, 2).label, /^Teleport to Teobocci Shasha/);
    assert.equal(feature.itemDisplayName(SCRIPT_CLASS, 2, engine).label, 'Imbued Teleportation Script to Teobocci Shasha, Xalanga');
    assert.equal(feature.packVerbs(SCRIPT_CLASS, engine, { copy: 1 }).length, 2, 'Read and its own Teleport: no list of six');
    feature.runPackVerb(SCRIPT_CLASS, 'read', engine, { copy: 1 });
    assert.equal(engine.log.prompts[0].title, 'Teleport to Sylvan Grove, Groddle Forest');
  });

  it('using one takes that one, from its own slot; the others keep theirs', () => {
    const engine = fakeEngine({ [SCRIPT_CLASS]: 3 });
    feature.restore({ scripts: [row(A, 'a', false), row(B, 'b', false), row(C, 'c', true)] }, engine);
    assert.equal(feature.runPackVerb(SCRIPT_CLASS, 'use', engine, { copy: 1 }), true);
    assert.equal(countItem(engine.inv, SCRIPT_CLASS), 2);
    assert.deepEqual(streets(engine), [A.tsid, C.tsid]);
    assert.deepEqual(engine.log.taken[0].slice(0, 3), [SCRIPT_CLASS, 1, 1]);
    assert.equal(engine.pc.energy, 90 - 33, 'an unimbued script charges');
    feature.onStreetClear(engine);
  });

  it('an imbued script needs no skill and no energy; a vanished street refunds and takes only that one', async () => {
    const fresh = (await import('../public/js/features/teleportation-feature.js?fresh=script-copies-a')).teleportationFeature;
    const engine = fakeEngine({ [SCRIPT_CLASS]: 2 }, { learnedSkills: [], streetExists: (t) => t !== B.tsid });
    fresh.restore({ scripts: [row(A, 'a', true), row(B, 'b', true)] }, engine);
    assert.equal(fresh.packVerbs(SCRIPT_CLASS, engine, { copy: 0 }).find((v) => v.id === 'use').enabled, true);
    fresh.runPackVerb(SCRIPT_CLASS, 'use', engine, { copy: 1 });
    assert.equal(engine.pc.imagination, 100);
    assert.deepEqual(streets(engine), [A.tsid]);
    assert.equal(fresh._state().totals.script, 0);
    assert.equal(useScript(createTeleportState(), null, { learned: ['teleportation_1'] }).ok, false);
  });

  it('a street project and the Paper verb each add a copy of its own, wherever others stand', async () => {
    const fresh = (await import('../public/js/features/teleportation-feature.js?fresh=script-copies-b')).teleportationFeature;
    const engine = fakeEngine({ quill: 1, paper: 5 }, { learnedSkills: ['teleportation_1', 'teleportation_4', 'penmanship_1'] });
    fresh.restore({}, engine);
    assert.equal(fresh.grantScript(engine, A).imbued, true);
    assert.equal(fresh.grantScript(engine, { tsid: 'bad/street' }), null, 'no words it could carry: no script from nothing');
    assert.equal(countItem(engine.inv, SCRIPT_CLASS), 1);
    fresh.grantScript(engine, B);
    assert.deepEqual(streets(engine), [A.tsid, B.tsid]);
    assert.equal(fresh.runPackVerb('paper', 'create_script', engine), true);
    assert.equal(countItem(engine.inv, 'paper'), 4);
    const made = copyTag(engine.toolState, SCRIPT_CLASS, 2);
    assert.equal(made.tsid, engine.streetTsid);
    assert.equal(made.imbued, false);
    assert.equal(made.x, 500);
    assert.equal(copyTag(engine.toolState, SCRIPT_CLASS, 0).imbued, true);
  });

  it('the projects panel finds the script that goes there (Ticket 81), G and L alike', async () => {
    const fresh = (await import('../public/js/features/teleportation-feature.js?fresh=script-copies-c')).teleportationFeature;
    const engine = fakeEngine({ [SCRIPT_CLASS]: 3 });
    fresh.restore({ scripts: [row(A, 'a'), row(D, 'd'), row(C, 'c', false)] }, engine);
    assert.equal(fresh.teleportScriptTo('check', 'GB', engine), null);
    assert.equal(fresh.teleportScriptTo('check', '', engine), null);
    const check = fresh.teleportScriptTo('check', 'GIFH2AKJ5I735SV', engine);
    assert.deepEqual([check.ok, check.copy, check.imbued, check.energyCost], [true, 1, true, 0]);
    assert.equal(fresh.teleportScriptTo('check', C.tsid, engine).energyCost, 33);
    assert.equal(fresh.teleportScriptTo('go', C.tsid, engine), true);
    assert.deepEqual(streets(engine), [A.tsid, D.tsid]);
  });
});

describe('saves from before each script kept its own', () => {
  const old = (over) => ({ version: 1, targets: {}, scripts: [], looseScripts: [], nextScriptId: 9, ...over });

  it('every script in the two lists becomes a copy where the pack count allows', () => {
    const engine = fakeEngine({ [SCRIPT_CLASS]: 4 });
    feature.restore(old({ scripts: [row(B, 'b'), row(A, 'a')], looseScripts: [row(D, 'd'), row(C, 'c')] }), engine);
    assert.deepEqual(new Set(streets(engine)), new Set([A.tsid, B.tsid, C.tsid, D.tsid]));
    assert.equal(feature._state().scripts.length, 0);
    assert.equal(feature._state().looseScripts.length, 0);
    assert.equal(feature._state().version, 2);
  });

  it('what is held first; the rest wait, for good, for a script that comes back up, in no particular order', async () => {
    const fresh = (await import('../public/js/features/teleportation-feature.js?fresh=script-copies-d')).teleportationFeature;
    const engine = fakeEngine({ [SCRIPT_CLASS]: 1 });
    const loose = Array.from({ length: 20 }, (_, i) => row({ ...A, tsid: `GLOOSE${i}` }, `l${i}`));
    fresh.restore(old({ scripts: [row(C, 'c')], looseScripts: loose }), engine);
    assert.deepEqual(streets(engine), [C.tsid]);
    assert.equal(fresh._state().looseScripts.length, 20, 'kept past a pack that has no room for them yet');
    addItem(engine.inv, SCRIPT_CLASS, 2);
    syncToolCopies(engine.toolState);
    fresh.onTick(16, Date.now() + 10000, engine);
    assert.deepEqual(streets(engine), [C.tsid, 'GLOOSE0', 'GLOOSE1']);
    assert.equal(fresh._state().looseScripts.length, 18);
    const saved = JSON.parse(JSON.stringify(fresh.save()));
    const tools = JSON.parse(JSON.stringify(engine.toolState));
    // A reload changes nothing: the copies are in the tool state, the rest still waiting.
    const again = fakeEngine({ [SCRIPT_CLASS]: 3 });
    Object.assign(again.toolState, normalizeToolConditionState(tools));
    fresh.restore(saved, again);
    assert.deepEqual(streets(again), [C.tsid, 'GLOOSE0', 'GLOOSE1']);
    assert.equal(fresh._state().looseScripts.length, 18);
  });

  it('with none in the pack, nothing moves and nothing is lost', async () => {
    const fresh = (await import('../public/js/features/teleportation-feature.js?fresh=script-copies-e')).teleportationFeature;
    const engine = fakeEngine({});
    fresh.restore(old({ scripts: [row(A, 'a')], looseScripts: [row(B, 'b')] }), engine);
    assert.equal(fresh._state().looseScripts.length, 2);
    assert.equal(engine.toolState.condition?.[SCRIPT_CLASS]?.copies?.length ?? 0, 0);
  });

  it('a count with no known destination stays in the pack, plain, unusable, and can still be dropped or given', async () => {
    const fresh = (await import('../public/js/features/teleportation-feature.js?fresh=script-copies-f')).teleportationFeature;
    const engine = fakeEngine({ [SCRIPT_CLASS]: 3 });
    fresh.restore(old({ scripts: [row(A, 'a')] }), engine);
    assert.equal(countItem(engine.inv, SCRIPT_CLASS), 3);
    assert.deepEqual(streets(engine), [A.tsid, null, null]);
    assert.equal(fresh.itemDisplayName(SCRIPT_CLASS, 1, engine), null, 'its plain name');
    assert.deepEqual(fresh.packVerbs(SCRIPT_CLASS, engine, { copy: 1 }).map((v) => v.id), ['read']);
    fresh.runPackVerb(SCRIPT_CLASS, 'read', engine, { copy: 1 });
    assert.match(engine.log.prompts[0].text, /too smudged/);
    fresh.runPackVerb(SCRIPT_CLASS, 'use', engine, { copy: 2 });
    assert.equal(countItem(engine.inv, SCRIPT_CLASS), 3, 'nothing to read aloud: it stays');
  });

  it('a row with a lost id still counts; a row with no destination is skipped; the same id twice is one script', () => {
    const out = adoptScripts(old({
      scripts: [{ destination: A }, { id: 'x' }, null, 'nonsense', row(B, 'b')],
      looseScripts: [row(B, 'b'), row(C, 'c'), { id: 'bad', destination: { tsid: 'has/slash' } }],
    }), [null, null, null, null]);
    assert.deepEqual(out.tags.map((t) => t?.tsid ?? null), [A.tsid, B.tsid, C.tsid, null]);
    assert.equal(out.adopted, 3);
    assert.equal(out.unknown, 1);
    assert.equal(out.state.looseScripts.length, 0);
  });

  it('a copy that has words keeps them', () => {
    const had = scriptTag({ destination: C });
    const out = adoptScripts(old({ scripts: [row(A, 'a')] }), [had, null]);
    assert.equal(out.tags[0], had);
    assert.equal(out.tags[1].tsid, A.tsid);
  });

  it('the pool does not grow a limit of 20 again, and an empty save settles to a clean state', () => {
    const many = Array.from({ length: 40 }, (_, i) => row({ ...A, tsid: `GM${i}` }, `m${i}`));
    assert.equal(normalizeTeleportState(old({ looseScripts: many })).looseScripts.length, 40);
    const clean = normalizeTeleportState({});
    assert.deepEqual([clean.scripts, clean.looseScripts, clean.version], [[], [], 2]);
    assert.equal('nextScriptId' in clean, false);
  });

  it('the tool state saves them: a JSON round trip keeps each copy\'s words', () => {
    const engine = fakeEngine({ [SCRIPT_CLASS]: 2 });
    setCopyTag(engine.toolState, SCRIPT_CLASS, 1, scriptTag({ destination: B, imbued: true }));
    const back = normalizeToolConditionState(JSON.parse(JSON.stringify(engine.toolState)));
    assert.equal(back.condition[SCRIPT_CLASS].tags[1].tsid, B.tsid);
    assert.equal(back.condition[SCRIPT_CLASS].tags[1].imbued, true);
  });
});

describe('on the ground, in bags and cabinets', () => {
  const held = (...dests) => {
    const engine = fakeEngine({ [SCRIPT_CLASS]: dests.length });
    dests.forEach((d, i) => setCopyTag(engine.toolState, SCRIPT_CLASS, i, scriptTag({ destination: d })));
    return engine;
  };

  it('solo drop and pick up: no pile, each its own stack, its name from its own words', () => {
    const engine = held(A, B);
    const ground = createDroppedItemState();
    const drop = (copy) => {
      takeToolCopy(engine.toolState, SCRIPT_CLASS, { copy });
      const tag = copyTag(engine.toolState, SCRIPT_CLASS, countItem(engine.inv, SCRIPT_CLASS) - 1);
      return dropInventoryStack(ground, engine.inv, 'GTEST', SCRIPT_CLASS, 1, { x: 10, y: 20 }, { merge: !keepsOwnStack(SCRIPT_CLASS), tags: [tag] });
    };
    const first = drop(0);
    syncToolCopies(engine.toolState);
    const second = drop(0);
    assert.notEqual(first.stack.id, second.stack.id, 'side by side, two stacks');
    assert.deepEqual(ground.streets.GTEST.map((r) => r.tags[0].tsid), [A.tsid, B.tsid]);
    assert.equal(feature.itemDisplayName(SCRIPT_CLASS, null, engine, ground.streets.GTEST[0].tags[0]).label, 'Teleportation Script to Hechey Track, Groddle Forest');
    assert.equal(feature.itemDisplayName(SCRIPT_CLASS, null, engine, null), null, 'an old stack with no words: its plain name');
    syncToolCopies(engine.toolState);
    // Second one back first: it is still that street.
    const up = pickupDroppedStack(ground, engine.inv, 'GTEST', second.stack.id);
    assert.equal(up.tags[0].tsid, B.tsid);
    setCopyTag(engine.toolState, SCRIPT_CLASS, 0, up.tags[0]);
    assert.deepEqual(streets(engine), [B.tsid]);
    const saved = JSON.parse(JSON.stringify(ground));
    assert.equal(saved.streets.GTEST[0].tags[0].tsid, A.tsid);
  });

  it('game.js drops a script as its own stack, from the pack and in Decoration Mode', () => {
    const src = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.equal(src.match(/keepsOwnStack\(classTsid\) \? \{ merge: false \} : \{\}/g)?.length, 2);
  });

  it('a stack from before (no words) comes up with the plain name and takes a waiting destination', async () => {
    const fresh = (await import('../public/js/features/teleportation-feature.js?fresh=script-copies-g')).teleportationFeature;
    const engine = fakeEngine({});
    fresh.restore({ looseScripts: [row(C, 'c')] }, engine);
    addItem(engine.inv, SCRIPT_CLASS, 1);
    fresh.onTick(16, Date.now() + 10000, engine);
    assert.deepEqual(streets(engine), [C.tsid]);
  });

  it('a whole bag dropped or stored keeps its scripts\' words', () => {
    const contents = [{ classTsid: SCRIPT_CLASS, count: 1, points: [0], tags: [scriptTag({ destination: A })] }, { classTsid: 'apple', count: 3 }];
    assert.equal(cleanContents(contents)[0].tags[0].tsid, A.tsid);
    assert.equal(cleanContents(contents)[1].tags, undefined);
    const placed = placeDroppedBag(createDroppedItemState(), 'GTEST', 'bag_bigger', [{ cls: SCRIPT_CLASS, count: 1, points: [0], tags: [scriptTag({ destination: A })] }], { x: 1, y: 2 });
    assert.equal(placed.stack.contents[0].tags[0].tsid, A.tsid, 'the bag on the ground has them');
    const stored = cleanHeldList(contents);
    assert.equal(stored[0].tags[0].tsid, A.tsid);
    const slots = normalizeContents('bag_furniture_cabinet', [{ classTsid: 'bag_bigger', count: 1, contents }]);
    assert.equal(slots[0].contents[0].tags[0].tsid, A.tsid);
    const storage = readFileSync(join(root, 'public/js/features/home-storage-feature.js'), 'utf8');
    assert.match(storage, /Array\.isArray\(c\.tags\) \? \{ tags: c\.tags \} : \{\}/, 'into the cabinet with the bag');
    assert.match(storage, /\.\.\.\(c\.tags \? \{ tags: c\.tags \} : \{\}\)/, 'and back out');
    const src = readFileSync(join(root, 'public/js/features/bags-feature.js'), 'utf8');
    assert.match(src, /points\.tags\?\.slice\(at, at \+ n\)/);
    assert.match(src, /placeToolCopies\(engine\.toolState, tcls, ranks, points, words\)/);
  });

  it('out of a bag and back: pick and place carry the words to the right places', () => {
    const engine = held(A, B, C);
    const out = pickToolCopies(engine.toolState, SCRIPT_CLASS, [0, 2]);
    assert.deepEqual(out.tags.map((t) => t.tsid), [A.tsid, C.tsid]);
    engine.inv[SCRIPT_CLASS] = 1;
    syncToolCopies(engine.toolState);
    assert.deepEqual(streets(engine), [B.tsid]);
    addItem(engine.inv, SCRIPT_CLASS, 2);
    placeToolCopies(engine.toolState, SCRIPT_CLASS, [0, 2], [0, 0], out.tags);
    assert.deepEqual(streets(engine), [A.tsid, B.tsid, C.tsid]);
  });

  it('cabinets: one to a slot, each keeps its own, in and out', () => {
    const slots = normalizeContents('bag_furniture_cabinet', []);
    const max = 1;
    cabinetPut(slots, SCRIPT_CLASS, 1, { max, points: [0], tags: [scriptTag({ destination: A })] });
    cabinetPut(slots, SCRIPT_CLASS, 1, { max, points: [0], tags: [scriptTag({ destination: B })] });
    const saved = normalizeContents('bag_furniture_cabinet', JSON.parse(JSON.stringify(slots)));
    assert.deepEqual(saved.filter(Boolean).map((s) => s.tags[0].tsid), [A.tsid, B.tsid]);
    const at = saved.findIndex((s) => s?.tags?.[0]?.tsid === B.tsid);
    assert.equal(cabinetTake(saved, SCRIPT_CLASS, 1, { slot: at }).tags[0].tsid, B.tsid);
  });

  it('a pack drag moves the words with the copy', () => {
    const engine = held(A, B, C);
    moveToolCopy(engine.toolState, SCRIPT_CLASS, 0, 2);
    assert.deepEqual(streets(engine), [B.tsid, C.tsid, A.tsid]);
  });
});

describe('between players', () => {
  const tag = scriptTag({ destination: C, imbued: true });

  it('the wire keeps a one-copy stack\'s words, checked; a stack of two or a forged one has none', () => {
    assert.deepEqual(normalizeItem({ c: SCRIPT_CLASS, n: 1, r: 0, t: tag }).t, tag);
    assert.equal(normalizeItem({ c: SCRIPT_CLASS, n: 2, t: tag }).t, undefined);
    assert.equal(normalizeItem({ c: SCRIPT_CLASS, n: 1, t: { tsid: '../etc' } }).t, undefined);
    const stack = normalizeGroundStack({ id: 'drop-00000000000000aa', c: SCRIPT_CLASS, n: 1, x: 1, y: 2, t: tag, by: { id: 7, name: 'Bo' } }, 'GST');
    assert.deepEqual(stack.tags, [tag]);
    const label = cleanCopyTag(SCRIPT_CLASS, { ...tag, label: '<img src=x onerror=alert(1)>' }).label;
    assert.ok(!/[<>]/.test(label), label);
  });

  it('a gift or a pickup puts the words on the copy that came; the giver\'s other scripts keep theirs', () => {
    const giver = fakeEngine({ [SCRIPT_CLASS]: 2 });
    setCopyTag(giver.toolState, SCRIPT_CLASS, 0, scriptTag({ destination: A }));
    setCopyTag(giver.toolState, SCRIPT_CLASS, 1, scriptTag({ destination: B }));
    const t = leavingCopyTag(giver.toolState, SCRIPT_CLASS, 1, 0);
    assert.equal(t.tsid, A.tsid, 'the one chosen, not the last');
    takeToolCopy(giver.toolState, SCRIPT_CLASS, { copy: 0 });
    giver.inv[SCRIPT_CLASS] = 1;
    syncToolCopies(giver.toolState);
    assert.deepEqual(streets(giver), [B.tsid]);
    const taker = fakeEngine({ [SCRIPT_CLASS]: 1 });
    addItem(taker.inv, SCRIPT_CLASS, 1);
    receiveToolCopy(taker.toolState, SCRIPT_CLASS, 0, 1, t);
    assert.equal(copyTag(taker.toolState, SCRIPT_CLASS, 1).tsid, A.tsid);
  });

  it('a trade carries a script slot by slot, in hold order', () => {
    const hold = { items: { [SCRIPT_CLASS]: 2 }, tags: { [SCRIPT_CLASS]: [scriptTag({ destination: A }), scriptTag({ destination: B })] } };
    const goods = goodsWithHeldTags({ items: [{ c: SCRIPT_CLASS, n: 1 }, { c: SCRIPT_CLASS, n: 1 }], currants: 0 }, hold);
    assert.deepEqual(goods.items.map((it) => it.t.tsid), [A.tsid, B.tsid]);
    assert.deepEqual(normalizeGoods(goods).items.map((it) => it.t.tsid), [A.tsid, B.tsid]);
    const taker = fakeEngine({});
    addItem(taker.inv, SCRIPT_CLASS, 2);
    receiveToolCopies(taker.toolState, SCRIPT_CLASS, goods.items.map((it) => ({ r: 0, t: it.t })));
    assert.deepEqual(streets(taker), [A.tsid, B.tsid]);
  });

  it('the Give and Trade windows list each script by its street and take the one chosen', () => {
    const gifts = readFileSync(join(root, 'public/js/features/gifts-feature.js'), 'utf8');
    assert.match(gifts, /copyTagKind\(c\) === 'script'/);
    assert.match(gifts, /Number\.isInteger\(p\.copy\) \? p\.copy/);
    const trade = readFileSync(join(root, 'public/js/features/trade-feature.js'), 'utf8');
    assert.match(trade, /addFromPack\(row\.classTsid, tag\)/);
    assert.match(trade, /chosenScriptsLast\(c, goods\)/);
  });

  it('an auction listing and a cabinet slot name the script\'s street, and no uses left', () => {
    const auctions = readFileSync(join(root, 'public/js/features/auctions-feature.js'), 'utf8');
    assert.match(auctions, /script \? scriptLabel\(script\) : label\(a\.c, a\.n\)/);
    assert.match(auctions, /!TOOL_CONDITION_CATALOG\[a\.c\]\.noMeter/);
    assert.equal(TOOL_CONDITION_CATALOG[SCRIPT_CLASS].noMeter, true);
    assert.match(readFileSync(join(root, 'public/js/ui/storage-windows.js'), 'utf8'), /item\(s\.classTsid, s\)/);
  });

  it('both shipped tables name the kind and the rules', { skip: skipWithoutServer || skipWithoutSite }, () => {
    const game = JSON.parse(readFileSync(join(root, 'public/assets/content/trade-items.json'), 'utf8'));
    assert.equal(game.items[SCRIPT_CLASS].tag, 'script');
    assert.equal(JSON.parse(readFileSync(join(SERVER_DIR, 'data/trade.json'), 'utf8')).items[SCRIPT_CLASS].tag, 'script');
    const economy = JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
    assert.equal(economy.items[SCRIPT_CLASS].tag, 'script');
    assert.equal(economy.items[SCRIPT_CLASS].g, undefined, 'an ordinary item to the ledger: no credit or cap on it');
    assert.deepEqual(game.tags.script, economy.tags.script);
  });

  const hasPhp = spawnSync('php', ['-v']).status === 0;
  const classes = ['WordFilter', 'Economy', 'CopyTags', 'LedgerMath', 'LedgerCredits', 'Ledger', 'LedgerGift', 'LedgerDrop', 'LedgerMail'];
  const php = (call, args) => JSON.parse(String(execFileSync('php', ['-r', `
    foreach (${JSON.stringify(classes)} as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    $a = json_decode(stream_get_contents(STDIN), true);
    echo json_encode(${call});`], { input: JSON.stringify(args) })));

  it('the ledger keeps a script\'s words on a drop, a gift and a letter, and a save it mends', { skip: skipWithoutSite || !hasPhp }, () => {
    const t = { ...tag };
    const drop = php('\\Groddle\\Minn\\LedgerDrop::call($a)', { op: 'drop-00000000000000aa', id: 7, street: 'LA5', x: 1, y: 2, item: { c: SCRIPT_CLASS, n: 1, r: 0, t } });
    assert.deepEqual(JSON.parse(drop.t), t);
    const gift = php('\\Groddle\\Minn\\LedgerGift::call($a)', { op: 'gift-0000000000000001', from: 7, to: 9, gave: { items: [{ c: SCRIPT_CLASS, n: 1, r: 0, t }] }, item: { c: SCRIPT_CLASS, n: 1, r: 0, t } });
    assert.deepEqual(gift.items[0].t, t);
    const letter = php('\\Groddle\\Minn\\LedgerMail::call($a)', { id: '0123456789abcdef', to: 'Bo', text: 'hi', item: { c: SCRIPT_CLASS, n: 1, t } });
    assert.deepEqual(JSON.parse(letter.item.t), t);
    const state = { version: 7, inventory: { [SCRIPT_CLASS]: 1 }, player: { currants: 0 }, systems: { tools: { condition: { [SCRIPT_CLASS]: { copies: [0], tags: [scriptTag({ destination: A })] } } } } };
    const out = php('\\Groddle\\Minn\\LedgerDrop::withToolPoints($a[0], "teleportation_script", 0, 1, 1, $a[1])', [{ playerState: JSON.stringify(state) }, t]);
    assert.deepEqual(JSON.parse(out.playerState).systems.tools.condition[SCRIPT_CLASS].tags.map((x) => x.tsid), [A.tsid, C.tsid]);
  });
});
