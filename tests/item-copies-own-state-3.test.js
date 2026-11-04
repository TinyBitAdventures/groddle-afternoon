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
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

import {
  bindToolInventory,
  copyTag,
  createToolConditionState,
  getToolCondition,
  setToolRemaining,
  toolCopies,
} from '../public/js/tools.js?v=ca00d182';
import { addItem, countItem, createInventory } from '../public/js/inventory.js?v=d82f3b00';

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
