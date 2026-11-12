// Austin (2026-11-04), item state round 3:
// 1. Each Rook Balm keeps its own pours (potion_rook_balm.js 25 points_capacity 5, 36 points_remaining;
//    tool_base use(1) lowers only that tube). The remake kept one balmPoints for every tube.
// 2. A copy's own words (a Cubimal's name, a Draught's Giant, a Still's hopper and Hooch, a lit
//    pumpkin's phrases: js/tools.js row.tags) travel with it online, as its wear and charges do:
//    gifts, trades, auctions, mail, shared ground and cabinets. The realtime server and the site check
//    them (js/copy-tags.js rules, written into trade.json and economy.json), and the receiving game
//    checks them again.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVER_DIR, SITE_DIR, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

import {
  TOOL_CONDITION_CATALOG,
  bindToolInventory,
  cleanCopyTag,
  copyTag,
  copyTagKind,
  copyTags,
  createToolConditionState,
  getToolCondition,
  leavingCopyTag,
  receiveToolCopies,
  receiveToolCopy,
  setCopyTag,
  setToolRemaining,
  toolCopies,
} from '../public/js/tools.js?v=5f482998';
import { COPY_TAG_RULES, cleanCopyTagOf } from '../public/js/copy-tags.js?v=7eec7d48';
import { goodsWithHeldTags, normalizeGoods, normalizeSlice, sameGoods, settleDone } from '../public/js/trade.js?v=ce0373e5';
import { giftEffects, normalizeGift, normalizeGiftsSlice, wrapBox } from '../public/js/gifts.js?v=3b8ab24e';
import { dropEffect, normalizeGroundStack, normalizeItem } from '../public/js/drops-mp.js?v=ec6a135d';
import { normalizeListing } from '../public/js/auctions.js?v=278dc46a';
import { cabinetMove, cabinetPut, cabinetTake, normalizeContents } from '../public/js/home-storage.js?v=b0225465';
import { CUBIMAL_NAMING } from '../public/js/cubimals.js?v=3a284648';
import { FAVOR_GIANTS } from '../public/js/potions.js?v=4f4c996d';
import { HOPPER_CEILING, STILL } from '../public/js/machines.js?v=590a7d4a';
import { teachPhrase } from '../public/js/seasons.js?v=1978c3f3';
import { addItem, countItem, createInventory } from '../public/js/inventory.js?v=2bd5b93e';

/** A copy of the feature of its own (its realtime binding is module state). */
const rookCopy = async (name) => (await import(`../public/js/features/rook-attack-feature.js?fresh=item-state-3-${name}`)).rookAttackFeature;

const TSID = 'GLI2V0UN7RD1T2J';
const ME = 500;

function pack(items = {}) {
  const inv = createInventory({});
  const toolState = bindToolInventory(createToolConditionState(), inv);
  for (const [cls, n] of Object.entries(items)) addItem(inv, cls, n);
  return { inv, toolState };
}

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = skipWithoutSite || !hasPhp;

/** One static call into the site's src (plain PHP, no engine). */
function php(classes, call, args) {
  const code = `
    foreach (${JSON.stringify(classes)} as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    $a = json_decode(stream_get_contents(STDIN), true);
    echo json_encode(${call});`;
  return JSON.parse(String(execFileSync('php', ['-r', code], { input: JSON.stringify(args) })));
}

const pours = (toolState) => toolCopies(toolState, 'potion_rook_balm').map((c) => c.remaining);

function sprite(x) {
  return { x, y: 800, visible: true, destroyed: false, scale: { x: 1, set() {} }, textures: [{}], gotoAndPlay() {}, play() {} };
}

function butterflies() {
  return [0, 1, 2].map((i) => ({
    classId: 'npc_butterfly',
    label: 'Butterfly',
    sprite: sprite(400 + i * 60),
    state: {},
    animalKey: `${TSID}:npc_butterfly:${i}`,
    classIndex: i,
  }));
}

function onlineEngine(interactables, sent, items) {
  const handlers = {};
  const { inv, toolState } = pack(items);
  const client = {
    me: { id: ME },
    state: 'online',
    street: TSID,
    players: [],
    on: (k, fn) => { (handlers[k] ||= []).push(fn); },
    send: (k, p) => { sent.push([k, p]); return true; },
  };
  const receipts = new Set();
  const engine = {
    started: true,
    mode: 'multiplayer',
    street: { tsid: TSID, hubId: '56', hubName: 'Groddle Forest' },
    streetTsid: TSID,
    interactables,
    player: { x: 400, y: 800 },
    pc: { energy: 500, mood: 500 },
    inv,
    toolState,
    camera: { x: 0, y: 0, w: 1280 },
    platforms: [],
    inScene: () => false,
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    busy: () => false,
    acting: () => false,
    param: () => null,
    setData: () => {},
    say: () => {},
    save: () => {},
    toast: () => {},
    pushActivity: () => {},
    playSound: () => {},
    updateHud: () => {},
    refreshPack: () => {},
    achievement: () => {},
    floatText: () => {},
    streetSlot: () => ({}),
    query: (k, op) => {
      if (k === 'realtimeClient') return client;
      if (k === 'ledgerReceipt') {
        if (receipts.has(op)) return false;
        receipts.add(op);
        return true;
      }
      return null;
    },
    learnedSkills: [],
  };
  const fire = (k, m) => (handlers[k] || []).forEach((f) => f(m));
  return { engine, fire };
}

let clock = 90_000;
function enter(feature, engine) {
  feature.onStreetClear(engine);
  for (let i = 0; i < 8; i += 1) {
    clock += 500;
    feature.onTick(500, clock, engine);
  }
}

describe('Rook Balm: each tube its own pours', () => {
  it('a balm is a five-pour copy class; a new tube is full', () => {
    const { toolState } = pack({ potion_rook_balm: 2 });
    assert.deepEqual(pours(toolState), [5, 5]);
    assert.equal(getToolCondition(toolState, 'potion_rook_balm').capacity, 5);
  });

  it('an older save: the one balmPoints is the first tube\'s, the other tube is full', async () => {
    const feature = await rookCopy('migrate');
    const { inv, toolState } = pack({ potion_rook_balm: 2 });
    feature.restore({ rule: 'daily', balmPoints: 3 }, { inv, toolState });
    assert.deepEqual(pours(toolState), [3, 5]);
    assert.equal(feature.save().balmPoints, 0, 'the save no longer keeps one number for every tube');
    // An engine with no tool state keeps the old number (pure callers).
    feature.restore({ rule: 'daily', balmPoints: 3 }, { inv: { potion_rook_balm: 1 } });
    assert.equal(feature.save().balmPoints, 3);
  });

  it('online: the tube picked goes with the ask (k); the ledger\'s word lands on it; a spend applies once', async () => {
    const feature = await rookCopy('online');
    const list = butterflies();
    const sent = [];
    const { engine, fire } = onlineEngine(list, sent, { potion_rook_balm: 2 });
    setToolRemaining(engine.toolState, 'potion_rook_balm', 2, { copy: 0 });
    enter(feature, engine);
    const rooked = {
      'npc_butterfly:0': { class: 'npc_butterfly', doses: 0, by: [] },
      'npc_butterfly:1': { class: 'npc_butterfly', doses: 0, by: [] },
    };
    fire('msg:rook', { street: TSID, snap: true, attack: null, rooked });
    // Pour from the second (full) tube's own pack slot.
    feature.runPackVerb('potion_rook_balm', 'rook_pour', engine, { copy: 1 });
    const ask = sent.filter(([k]) => k === 'rook_revive').at(-1)[1];
    assert.equal(ask.balm, true);
    assert.equal(ask.k, 1);
    // The ledger used one of that tube's five: 4 left there, the first tube keeps its 2.
    fire('msg:rook_you', { why: 'revive', balm: true, class: 'npc_butterfly', key: 'npc_butterfly:0', done: true, use: { op: 'use-1', c: 'potion_rook_balm', left: 4, spent: false } });
    assert.deepEqual(pours(engine.toolState), [2, 4]);
    // The first tube's last pour (the ledger empties it): that tube leaves, the other stays as it was.
    setToolRemaining(engine.toolState, 'potion_rook_balm', 1, { copy: 0 });
    feature.runVerbOverride(list[1], 'rook_apply_balm', engine);
    assert.equal(sent.filter(([k]) => k === 'rook_revive').at(-1)[1].k, 0, 'Apply Balm uses the tube in use, the first');
    const spend = { why: 'revive', balm: true, class: 'npc_butterfly', key: 'npc_butterfly:1', done: true, use: { op: 'use-2', c: 'potion_rook_balm', left: 0, spent: true } };
    fire('msg:rook_you', spend);
    assert.equal(countItem(engine.inv, 'potion_rook_balm'), 1);
    assert.deepEqual(pours(engine.toolState), [4]);
    // The same spend again (a resend after a load) takes nothing more.
    fire('msg:rook_you', spend);
    assert.equal(countItem(engine.inv, 'potion_rook_balm'), 1);
    assert.deepEqual(pours(engine.toolState), [4]);
    feature.onStreetClear(engine);
  });

  it('the pour tooltip counts the tube picked', async () => {
    const feature = await rookCopy('tooltip');
    const { inv, toolState } = pack({ potion_rook_balm: 2 });
    setToolRemaining(toolState, 'potion_rook_balm', 2, { copy: 1 });
    const engine = { inv, toolState, player: { x: 0, y: 0 }, streetSlot: () => ({}), streetTsid: 'L1' };
    const tip = (copy) => feature.packVerbs('potion_rook_balm', engine, { copy }).find((v) => v.id === 'rook_pour').tooltip;
    assert.match(tip(0), /5\/5 pours in this tube/);
    assert.match(tip(1), /2\/5 pours in this tube/);
    assert.equal(copyTag(toolState, 'potion_rook_balm', 0), null);
  });
});

describe('the site reads each tube on its own (LedgerUse)', { skip: skipSite }, () => {
  const classes = ['Economy', 'LedgerMath', 'LedgerCredits', 'Ledger', 'LedgerUse'];
  const left = (state, k) => php(classes, '\\Groddle\\Minn\\LedgerUse::savedLeft($a[0], "potion_rook_balm", $a[1])', [{ playerState: JSON.stringify(state) }, k]);
  it('the tool state\'s copies first; an older save\'s slice number is the first tube\'s', () => {
    const copies = { version: 7, inventory: { potion_rook_balm: 2 }, systems: { tools: { condition: { potion_rook_balm: { copies: [2, 4] } } }, features: { 'rook-attack': { balmPoints: 3 } } } };
    assert.equal(left(copies, 0), 2);
    assert.equal(left(copies, 1), 4);
    const old = { version: 7, inventory: { potion_rook_balm: 2 }, systems: { features: { 'rook-attack': { balmPoints: 3 } } } };
    assert.equal(left(old, 0), 3);
    assert.equal(left(old, 1), null, 'the other tube is full');
  });
});

// —— A copy's own words travel ——

const root = join(import.meta.dirname, '..');
const vectors = JSON.parse(readFileSync(join(root, 'tests/fixtures/copy-tag-vectors.json'), 'utf8'));

describe('a copy\'s words: what may travel (js/copy-tags.js)', () => {
  it('every class that keeps words names its kind; the rules are the game\'s own numbers', () => {
    for (const [cls, def] of Object.entries(TOOL_CONDITION_CATALOG)) {
      if (def.tags) assert.ok(['name', 'phrases', 'giant', 'still', 'script'].includes(copyTagKind(cls)), cls);
      else assert.equal(copyTagKind(cls), '', cls);
    }
    assert.equal(copyTagKind('npc_cubimal_rook'), 'name');
    assert.equal(copyTagKind('pumpkin_lit_5'), 'phrases');
    assert.equal(copyTagKind('potion_favor'), 'giant');
    assert.equal(copyTagKind('still'), 'still');
    assert.equal(COPY_TAG_RULES.name.max, CUBIMAL_NAMING.maxLength);
    assert.deepEqual([...COPY_TAG_RULES.giant.giants], [...FAVOR_GIANTS]);
    assert.equal(COPY_TAG_RULES.still.hooch, STILL.maxHooch);
    assert.equal(COPY_TAG_RULES.still.hopper, HOPPER_CEILING);
    // lit_pumpkin_base teach: three at most, 150 characters each.
    const list = [];
    for (const p of ['a', 'b', 'c', 'd']) teachPhrase(list, p);
    assert.equal(list.length, COPY_TAG_RULES.phrases.max);
    assert.equal(teachPhrase([], 'x'.repeat(200)).phrases[0].length, COPY_TAG_RULES.phrases.len);
  });

  it('passes the shared vectors (the server and the site pass the same file), and checks again the same', () => {
    assert.ok(vectors.vectors.length >= 40);
    for (const v of vectors.vectors) {
      const out = cleanCopyTagOf(v.kind, v.in, { now: vectors.now });
      assert.deepEqual(out, v.out, `${v.kind} ${JSON.stringify(v.in)}`);
      if (out != null) assert.deepEqual(cleanCopyTagOf(v.kind, out, { now: vectors.now }), out, 'idempotent');
    }
  });

  it('a name a player wrote goes through the word filter; a Giant must be one of the Giants', () => {
    assert.equal(cleanCopyTag('npc_cubimal_chick', 'Bad fuck name'), 'Bad #!@$ name');
    assert.deepEqual(cleanCopyTag('pumpkin_lit_1', ['shit pumpkin']), ['#!@$ pumpkin']);
    assert.equal(cleanCopyTag('potion_favor', 'nobody'), null);
    assert.equal(cleanCopyTag('apple', 'Bob'), null, 'a class that keeps no words carries none');
  });

  it('the copy leaving carries its words (the one picked, else the last); one arriving takes them, checked again', () => {
    const { inv, toolState } = pack({ npc_cubimal_chick: 2 });
    setCopyTag(toolState, 'npc_cubimal_chick', 0, 'Ann');
    setCopyTag(toolState, 'npc_cubimal_chick', 1, 'Bea');
    assert.equal(leavingCopyTag(toolState, 'npc_cubimal_chick', 1), 'Bea');
    assert.equal(leavingCopyTag(toolState, 'npc_cubimal_chick', 1, 0), 'Ann');
    assert.equal(leavingCopyTag(toolState, 'npc_cubimal_chick', 2), null, 'only a one-copy stack carries words');
    const b = pack({});
    addItem(b.inv, 'npc_cubimal_chick', 1);
    receiveToolCopy(b.toolState, 'npc_cubimal_chick', 0, 1, 'Shit Ann');
    assert.deepEqual(copyTags(b.toolState, 'npc_cubimal_chick'), ['#!@$ Ann']);
    addItem(b.inv, 'npc_cubimal_chick', 1);
    receiveToolCopy(b.toolState, 'npc_cubimal_chick', 0, 1, null);
    assert.deepEqual(copyTags(b.toolState, 'npc_cubimal_chick'), ['#!@$ Ann', null], 'one with none arrives with none');
    assert.equal(countItem(inv, 'npc_cubimal_chick'), 2);
  });
});

describe('words travel with a trade', () => {
  it('a one-copy slot carries the held copy\'s words, slot by slot; they never make an offer differ', () => {
    const hold = { trade: 't1', items: { npc_cubimal_chick: 2, still: 1 }, tags: { npc_cubimal_chick: ['Ann', 'Bea'], still: [{ hopper: 42, hooch: 1 }] } };
    const draft = { items: [{ c: 'npc_cubimal_chick', n: 1, r: 0 }, { c: 'apple', n: 3 }, { c: 'npc_cubimal_chick', n: 1, r: 0 }, { c: 'still', n: 1, r: 0 }], currants: 5 };
    const offer = goodsWithHeldTags(draft, hold);
    assert.deepEqual(offer.items.map((it) => it.t ?? null), ['Ann', null, 'Bea', { hopper: 42, hooch: 1, workingSince: 0 }]);
    assert.equal(sameGoods(draft, offer), true);
    assert.equal(sameGoods(draft, { ...offer, currants: 6 }), false);
  });

  it('what comes is checked again; the done names each slot\'s words; a saved hold keeps them', () => {
    const got = normalizeGoods({ items: [{ c: 'npc_cubimal_chick', n: 1, r: 0, t: 'fuck' }, { c: 'apple', n: 2, t: 'x' }, { c: 'potion_favor', n: 1, r: 9, t: 'mab' }] });
    assert.deepEqual(got.items, [{ c: 'npc_cubimal_chick', n: 1, r: 0, t: '#!@$' }, { c: 'apple', n: 2 }, { c: 'potion_favor', n: 1, r: 9, t: 'mab' }]);
    assert.deepEqual(settleDone(null, { gave: { items: [] }, got }).tools, [{ c: 'npc_cubimal_chick', r: 0, t: '#!@$' }, { c: 'potion_favor', r: 9, t: 'mab' }]);
    const slice = normalizeSlice({ hold: { trade: 'tr-1', with: { id: 2, name: 'Bo' }, items: { npc_cubimal_chick: 1 }, points: { npc_cubimal_chick: [0] }, tags: { npc_cubimal_chick: ['Ann', 'x'] } } });
    assert.deepEqual(slice.hold.tags, { npc_cubimal_chick: ['Ann'] });
  });

  it('copies that came one to a slot each take their own wear and words', () => {
    const { inv, toolState } = pack({ potion_favor: 1 });
    setCopyTag(toolState, 'potion_favor', 0, 'pot');
    addItem(inv, 'potion_favor', 2);
    receiveToolCopies(toolState, 'potion_favor', [{ r: 4, t: 'lem' }, { r: 11, t: 'nobody' }]);
    assert.deepEqual(toolCopies(toolState, 'potion_favor').map((c) => c.remaining), [11, 4, 11]);
    assert.deepEqual(copyTags(toolState, 'potion_favor'), ['pot', 'lem', null]);
  });

  it('trade-feature holds, sends and returns each copy\'s words', () => {
    const src = readFileSync(join(root, 'public/js/features/trade-feature.js'), 'utf8');
    assert.match(src, /saved\.hold\.tags \|\|= \{\}\)\[c\]/);
    assert.match(src, /goodsWithHeldTags\(goods, saved\.hold\?\.trade === trade \? saved\.hold : null\)/);
    assert.match(src, /receiveToolCopies\(engine\.toolState, c, list\)/);
    assert.match(src, /toolTagsIn\(c, \(hold\.tags\?\.\[c\] \|\| \[\]\)\.slice\(0, n\)\)/);
  });
});

describe('words travel with a gift, a Gift Box, a shared ground stack, an auction and mail', () => {
  it('a gift: the item and a box\'s contents keep their words, checked', () => {
    const g = normalizeGift({ op: 'gift-0000000000000001', from: { id: 7, name: 'Ada' }, item: { c: 'npc_cubimal_chick', n: 1, r: 0, t: 'Ann' } }, 'got');
    assert.deepEqual(giftEffects(g, {}).tool, { c: 'npc_cubimal_chick', r: 0, t: 'Ann' });
    const box = normalizeGift({ op: 'gift-0000000000000002', from: { id: 7, name: 'Ada' }, box: [{ c: 'still', n: 1, r: 0, t: { hopper: 9, hooch: 2 } }, { c: 'pumpkin_lit_2', n: 1, t: ['Boo', 'fuck off'] }] }, 'got');
    assert.deepEqual(box.box.map((it) => it.t), [{ hopper: 9, hooch: 2, workingSince: 0 }, ['Boo', '#!@$ off']]);
    // The site's list: the box first, then what was inside.
    const listed = normalizeGift({ op: 'gift-0000000000000003', side: 'got', with: { id: 7, name: 'Ada' }, box: true, items: [{ c: 'bag_gift_box', n: 1 }, { c: 'npc_cubimal_frog', n: 1, r: 0, t: 'Hop' }] });
    assert.equal(listed.box[0].t, 'Hop');
    // Wrapping keeps a copy's words in the box (the saved slice too).
    const wrapped = wrapBox({ boxes: [], next: 1 }, [{ c: 'npc_cubimal_frog', n: 1, r: 0, t: 'Hop' }], () => 1, { items: { npc_cubimal_frog: { max: 1 } } });
    assert.equal(wrapped.box.items[0].t, 'Hop');
    assert.equal(normalizeGiftsSlice({ boxes: [wrapped.box] }).boxes[0].items[0].t, 'Hop');
  });

  it('a shared ground stack shows its words and gives them to whoever picks it up', () => {
    const s = normalizeGroundStack({ id: 'drop-00000000000000aa', c: 'npc_cubimal_chick', n: 1, r: 0, t: 'Ann', by: { id: 7, name: 'Ada' } }, 'LA5');
    assert.equal(s.t, 'Ann');
    assert.deepEqual(s.tags, ['Ann'], 'game.js names a ground stack by tags[0]');
    assert.deepEqual(dropEffect('took', { c: 'npc_cubimal_chick', n: 1, r: 0, t: 'Ann' }).tool, { c: 'npc_cubimal_chick', r: 0, t: 'Ann' });
    assert.equal(normalizeItem({ c: 'npc_cubimal_chick', n: 2, t: 'Ann' }).t, undefined, 'a stack of two carries none');
  });

  it('an auction listing and its delivery keep the words', () => {
    assert.equal(normalizeListing({ id: '0123456789abcdef', c: 'potion_favor', n: 1, cost: 5, r: 3, t: 'zille' }).t, 'zille');
    assert.equal(normalizeListing({ id: '0123456789abcdef', c: 'potion_favor', n: 1, cost: 5, t: 'zillow' }).t, undefined);
    const src = readFileSync(join(root, 'public/js/features/auctions-feature.js'), 'utf8');
    assert.match(src, /applyReceipt\(r\.data\.receipt, \{ r: d\.item\?\.r \?\? null, t: d\.item\?\.t \?\? null \}\)/);
    assert.match(src, /listing\.t = t/);
    const mail = readFileSync(join(root, 'public/js/features/player-mail-feature.js'), 'utf8');
    assert.match(mail, /applyReceipt\(d\.receipt, \{ r: d\.letter\?\.item\?\.r \?\? null, t: d\.letter\?\.item\?\.t \?\? null \}\)/);
    assert.match(mail, /stack\.t = t/);
  });

  it('a cabinet keeps each copy\'s words beside its wear, through a put, a move and a take', () => {
    const slots = normalizeContents('bag_furniture_cabinet', []);
    cabinetPut(slots, 'npc_cubimal_chick', 1, { max: 1, points: [0], tags: ['Ann'] });
    cabinetPut(slots, 'npc_cubimal_chick', 1, { max: 1, points: [0], tags: ['Bea'] });
    assert.deepEqual(slots.filter(Boolean).map((x) => x.tags), [['Ann'], ['Bea']]);
    const saved = normalizeContents('bag_furniture_cabinet', JSON.parse(JSON.stringify(slots)));
    assert.deepEqual(saved.filter(Boolean).map((x) => x.tags), [['Ann'], ['Bea']], 'a save keeps them');
    cabinetMove(saved, 0, 5, 1);
    assert.equal(saved[5].tags[0], 'Ann');
    const out = cabinetTake(saved, 'npc_cubimal_chick', 1, { slot: 5 });
    assert.deepEqual(out.tags, ['Ann']);
    assert.equal(cabinetTake(saved, 'apple', 1).tags, undefined, 'none when no unit that left had words');
  });

  it('the pack copy the cabinet takes and gives back is the one with those words (home-storage-feature)', () => {
    const src = readFileSync(join(root, 'public/js/features/home-storage-feature.js'), 'utf8');
    assert.match(src, /copyTags\(engine\.toolState, cls\)\.slice\(-n\)/);
    assert.match(src, /setCopyTag\(engine\.toolState, cls, held - out\.tags\.length \+ i, t\)/);
  });
});

describe('the realtime server and the site check them the same way', () => {
  it('the server\'s copy of the vectors is this file; its table names each class\'s kind and the rules', { skip: skipWithoutServer }, () => {
    assert.equal(readFileSync(join(SERVER_DIR, 'testdata/copy-tag-vectors.json'), 'utf8'), readFileSync(join(root, 'tests/fixtures/copy-tag-vectors.json'), 'utf8'));
    const table = JSON.parse(readFileSync(join(SERVER_DIR, 'data/trade.json'), 'utf8'));
    assert.deepEqual(table.tags, JSON.parse(JSON.stringify(COPY_TAG_RULES)));
    assert.equal(table.items.npc_cubimal_chick.tag, 'name');
    assert.equal(table.items.still.tag, 'still');
    assert.equal(table.items.apple.tag, undefined);
  });

  const classes = ['WordFilter', 'Economy', 'CopyTags', 'LedgerMath', 'LedgerCredits', 'Ledger', 'LedgerGift', 'LedgerDrop', 'LedgerMail'];
  const clean = (kind, value) => php(classes, `\\Groddle\\Minn\\CopyTags::clean(\\Groddle\\Minn\\Economy::shared()->tagRules(), $a[0], $a[1], $a[2])`, [kind, value, vectors.now]);

  it('the site passes the shared vectors', { skip: skipSite }, () => {
    const out = php(classes, `array_map(fn ($v) => \\Groddle\\Minn\\CopyTags::clean(\\Groddle\\Minn\\Economy::shared()->tagRules(), $v['kind'], $v['in'], $a['now']), $a['vectors'])`, vectors);
    vectors.vectors.forEach((v, i) => assert.deepEqual(out[i], v.out, `${v.kind} ${JSON.stringify(v.in)}`));
    assert.equal(clean('name', 'Bob'), 'Bob');
  });

  it('the site keeps the words of a drop, a gift and a letter, checked; another class or a stack of two keeps none', { skip: skipSite }, () => {
    const drop = php(classes, '\\Groddle\\Minn\\LedgerDrop::call($a)', { op: 'drop-00000000000000aa', id: 7, street: 'LA5', x: 1, y: 2, item: { c: 'npc_cubimal_chick', n: 1, r: 0, t: 'fuck Bob' } });
    assert.equal(drop.t, '"#!@$ Bob"');
    const apple = php(classes, '\\Groddle\\Minn\\LedgerDrop::call($a)', { op: 'drop-00000000000000ab', id: 7, street: 'LA5', x: 1, y: 2, item: { c: 'apple', n: 1, t: 'Bob' } });
    assert.equal(apple.t, undefined);
    const gift = php(classes, '\\Groddle\\Minn\\LedgerGift::call($a)', { op: 'gift-0000000000000001', from: 7, to: 9, box: true, gave: { items: [{ c: 'bag_gift_box', n: 1 }, { c: 'still', n: 1, r: 0, t: { hopper: 5000, hooch: 3 } }, { c: 'npc_cubimal_frog', n: 2, t: 'Hop' }], currants: 0 } });
    assert.deepEqual(gift.items.map((it) => it.t ?? null), [null, { hopper: 600, hooch: 3, workingSince: 0 }, null]);
    const letter = php(classes, '\\Groddle\\Minn\\LedgerMail::call($a)', { id: '0123456789abcdef', to: 'Bo', text: 'hi', item: { c: 'pumpkin_lit_3', n: 1, t: ['<b>Boo</b>'] }, currants: 0 });
    assert.equal(letter.item.t, '["bBoo/b"]');
  });

  it('a missed pickup or gift the site applies to a save puts the words on the copy that came', { skip: skipSite }, () => {
    const state = { version: 7, inventory: { npc_cubimal_chick: 1 }, player: { currants: 0 }, systems: { tools: { condition: { npc_cubimal_chick: { copies: [0], tags: ['Ann'] } } }, features: {} } };
    const out = php(classes, '\\Groddle\\Minn\\LedgerDrop::withToolPoints($a[0], "npc_cubimal_chick", 0, 1, 1, "Bea")', [{ playerState: JSON.stringify(state) }]);
    assert.deepEqual(JSON.parse(out.playerState).systems.tools.condition.npc_cubimal_chick.tags, ['Ann', 'Bea']);
    const g = { op: 'gift-0000000000000009', from: 7, to: 9, items: [{ c: 'npc_cubimal_chick', n: 1, r: 0, t: 'Cy' }], box: false, ref: '', note: null, at: 0 };
    const after = php(classes, '\\Groddle\\Minn\\LedgerGift::apply($a[0], "got", $a[1])', [{ playerState: JSON.stringify(state) }, g]);
    const s2 = JSON.parse(after.playerState);
    assert.equal(s2.inventory.npc_cubimal_chick, 2);
    assert.deepEqual(s2.systems.tools.condition.npc_cubimal_chick.tags, ['Ann', 'Cy']);
    // Applied once: the same gift again changes nothing.
    const again = php(classes, '\\Groddle\\Minn\\LedgerGift::apply($a[0], "got", $a[1])', [after, g]);
    assert.equal(JSON.parse(again.playerState).inventory.npc_cubimal_chick, 2);
  });

  it('the site\'s tables have a place for them, and a key-holder\'s cabinet move keeps the owner\'s words', { skip: skipSite }, () => {
    const minn = JSON.parse(readFileSync(join(SITE_DIR, 'minn.json'), 'utf8'));
    for (const t of ['groddle_drops', 'groddle_auctions', 'groddle_player_mail']) assert.ok(minn.tables[t].includes('tag text NULL'), t);
    const boxes = readFileSync(join(SITE_DIR, 'src/LedgerBoxes.php'), 'utf8');
    assert.match(boxes, /\$out->tags = array_slice\(\$was\['tags'\], 0, \$s\['count'\]\);/);
    const auction = readFileSync(join(SITE_DIR, 'src/LedgerAuction.php'), 'utf8');
    assert.match(auction, /\$out\['item'\]\['t'\] = \$tag;/);
    const economy = JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
    assert.equal(economy.items.pumpkin_lit_3.tag, 'phrases');
    assert.deepEqual(economy.tags, JSON.parse(JSON.stringify(COPY_TAG_RULES)));
  });
});
