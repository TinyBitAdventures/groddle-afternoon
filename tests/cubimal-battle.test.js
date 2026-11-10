/**
 * Cubimal battles (register G40): the rules from GameServerJS
 * npc_cubimal_base (js/cubimal-battle.js), the data the realtime server
 * referees by (tools/build-realtime-cubimal-battle.mjs), the pack verbs and
 * the figures on the street (features/cubimal-battle-feature.js) in solo and
 * online, and a figure's battle level kept in its copy's words.
 */
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  BATTLE_SLUGS,
  CUBIMAL_BATTLE,
  battleInsultBubble,
  battleRestX,
  battleStrikeX,
  battleStyleMod,
  battleStyleOfVerb,
  battleWinnerGain,
  canBattle,
  cubimalBattleLabel,
  cubimalBattleStats,
  cubimalBattleVerbMessage,
  cubimalEgo,
  cubimalTagName,
  cubimalTagWith,
  nextLevelAmount,
  ownedBattleLabel,
  rollBattleStrike,
} from '../public/js/cubimal-battle.js?v=80a58864';
import { ensureCubimalItems } from '../public/js/cubimals.js?v=5e340c94';
import { addItem, countItem, createInventory } from '../public/js/inventory.js?v=60dfc9ca';
import { bindToolInventory, copyTags, createToolConditionState, setCopyTag } from '../public/js/tools.js?v=5f482998';
import { cleanCopyTagOf } from '../public/js/copy-tags.js?v=7eec7d48';
import { FEATURES } from '../public/js/features/index.js?v=e5fdd42e';
import { cubimalBattleFeature, CUBIMAL_BATTLE_FEATURE_ID } from '../public/js/features/cubimal-battle-feature.js?v=513f11ac';
import { cubimalRaceFeature } from '../public/js/features/cubimal-race-feature.js?v=9509cf65';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { applyAchievementProgress, createAchievementState } from '../public/js/achievements.js?v=2e4aa9cb';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '../glitch-GameServerJS');
ensureCubimalItems();

/** A queue of rolls, then 0.5. */
const rolls = (...vals) => () => (vals.length ? vals.shift() : 0.5);

describe('cubimal battle rules (npc_cubimal_base)', () => {
  it('reads the source: verbs, insults, stats and the 43 figures that battle', () => {
    let src = '';
    try {
      src = readFileSync(join(GSJS, 'items/npc_cubimal_chick.js'), 'utf8');
    } catch {
      return; // the public clone without GameServerJS beside it
    }
    for (const s of CUBIMAL_BATTLE.styles) assert.ok(src.includes(`"name"\t\t\t\t: "${CUBIMAL_BATTLE.verbs[s].label}"`), CUBIMAL_BATTLE.verbs[s].label);
    assert.ok(src.includes(`"tooltip"\t\t\t: "${CUBIMAL_BATTLE.tooltip}"`));
    for (const insult of CUBIMAL_BATTLE.insults) assert.ok(src.includes(JSON.stringify(insult).slice(1, -1).replace(/'/g, "\\'")) || src.includes(insult), insult);
    assert.ok(src.includes('this.sendBubble("Come at me, Bro!", 3000, null);'));
    assert.ok(src.includes('this.instanceProps.health = "10";'));
    assert.ok(src.includes("this.setInstanceProp('next_level_amount', nla*2.2);"));
    assert.equal(BATTLE_SLUGS.length, 43);
    for (const slug of BATTLE_SLUGS) {
      assert.ok(readFileSync(join(GSJS, `items/npc_cubimal_${slug}.js`), 'utf8').includes('verbs.paper_battle'), slug);
      assert.ok(canBattle(`npc_cubimal_${slug}`), slug);
    }
    assert.ok(!readFileSync(join(GSJS, 'items/npc_cubimal_factorydefect_chick.js'), 'utf8').includes('battle'));
    assert.equal(canBattle('npc_cubimal_factorydefect_chick'), false);
  });

  it('levels: next_level_amount 10, 22, 48, 105 (intval x 2.2) and two Ego a level', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(nextLevelAmount), [10, 22, 48, 105, 231, 508]);
    assert.deepEqual([1, 2, 5].map(cubimalEgo), [10, 12, 18]);
  });

  it('the winner earns ten a loser level and carries the rest over a level up', () => {
    assert.deepEqual(battleWinnerGain({ level: 1, xp: 0 }, 1), { level: 2, xp: 0, earned: 10, levelUp: true, bubble: 'LEVEL 2!', feat: 2 });
    assert.deepEqual(battleWinnerGain({ level: 2, xp: 5 }, 1), { level: 2, xp: 15, earned: 10, levelUp: false, bubble: '+10xp!', feat: 1 });
    assert.deepEqual(battleWinnerGain({ level: 2, xp: 15 }, 3), { level: 3, xp: 23, earned: 30, levelUp: true, bubble: 'LEVEL 3!', feat: 2 });
  });

  it('styles as getType writes them: Gumption > Wile > Panache > Gumption, no row for Panache against Wile', () => {
    const table = {};
    for (const a of 'rps') for (const b of 'rps') table[a + b] = battleStyleMod(a, b);
    assert.deepEqual(table, { rr: 0, rp: -1, rs: 1, pr: 1, pp: 0, ps: 0, sr: -1, sp: 1, ss: 0 });
    assert.deepEqual(CUBIMAL_BATTLE.styles.map((s) => CUBIMAL_BATTLE.verbs[s].label), ['Panache (battle)', 'Wile (battle)', 'Gumption (battle)']);
    assert.equal(battleStyleOfVerb('cubimal_battle_r'), 'r');
    assert.equal(battleStyleOfVerb('cubimal_race'), '');
  });

  it('strikes roll the insult, then the damage, then the choke (the server does the same: cubimal_battle_test.go)', () => {
    // Level 1 Gumption against Panache with middling rolls: randInt(1, 3) = 2 twice, no choke.
    assert.deepEqual(rollBattleStrike({ level: 1, mod: -1 }, rolls()), { index: 2, insult: "You're more like a spherimal!", damage: 2, choke: false });
    // The same insult as the opponent's last: half the insult roll, rounded up.
    const same = rollBattleStrike({ level: 1, mod: 0, opponentInsult: "Any squarer and you'd be round." }, rolls(0.99, 0.99, 0.5));
    assert.equal(same.damage, 2);
    assert.equal(battleInsultBubble(same.insult, "Any squarer and you'd be round."), "No, Any squarer and you'd be round.");
    // A choke (floor(random * 10) == 0) does nothing; from level 10 the odds are 1 in 12.
    assert.deepEqual(rollBattleStrike({ level: 1 }, rolls(0.5, 0.5, 0.0)), { index: 0, insult: '*choke*', damage: 0, choke: true });
    assert.equal(battleInsultBubble('*choke*', '*choke*'), '*choke*');
    assert.equal(rollBattleStrike({ level: 10 }, rolls(0.5, 0.5, 0.09)).choke, false);
    // From level 18 the insult stays in 18..21 (+1 past the list keeps the last one).
    assert.equal(rollBattleStrike({ level: 40, mod: 1 }, rolls(0.99, 0.5, 0.5)).index, 21);
  });

  it('labels, places and words', () => {
    assert.equal(cubimalBattleLabel('npc_cubimal_chick', '', 1), 'Chick Cubimal Lvl.1');
    assert.equal(cubimalBattleLabel('npc_cubimal_chick', 'Sprocket', 3), 'Sprocket Lvl.3');
    assert.equal(ownedBattleLabel('Ada', 'Sprocket Lvl.3'), "Ada's Sprocket Lvl.3");
    assert.equal(cubimalBattleVerbMessage('npc_cubimal_emobear'), 'You battled an Emo-Bear Cubimal.');
    assert.equal(battleRestX(100, 400), 200);
    assert.equal(battleRestX(400, 200), 350);
    assert.equal(battleStrikeX(100, 400), 360);
    assert.equal(battleStrikeX(400, 200), 240);
  });

  it('a figure keeps its name, then { name, level, xp } once it has won', () => {
    assert.equal(cubimalTagName('Bob'), 'Bob');
    assert.equal(cubimalTagName({ name: 'Bob', level: 2, xp: 0 }), 'Bob');
    assert.deepEqual(cubimalBattleStats('Bob'), { level: 1, xp: 0 });
    assert.deepEqual(cubimalBattleStats({ name: '', level: 3, xp: 7 }), { level: 3, xp: 7 });
    assert.deepEqual(cubimalTagWith('Bob', { level: 2, xp: 0 }), { name: 'Bob', level: 2, xp: 0 });
    assert.deepEqual(cubimalTagWith(null, { level: 2, xp: 4 }), { name: '', level: 2, xp: 4 });
    assert.equal(cubimalTagWith({ name: 'Bob', level: 2, xp: 0 }, { name: 'Zed' }).name, 'Zed');
    assert.equal(cubimalTagWith('Bob', { level: 1, xp: 0 }), 'Bob');
    assert.equal(cubimalTagWith(null, {}), null);
    // Between players the words travel checked (js/copy-tags.js; the server and site agree on the vectors).
    assert.deepEqual(cleanCopyTagOf('name', { name: 'Bob', level: 2, xp: 0 }), { name: 'Bob', level: 2, xp: 0 });
  });
});

describe('the battle data the realtime server reads', () => {
  it('is current (node tools/build-realtime-cubimal-battle.mjs)', { skip: skipWithoutServer }, () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/build-realtime-cubimal-battle.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /is current \(43 figures, 22 insults\)/);
  });
});

// —— The feature ————————————————————————————————————————————————————————————

class Sprite {
  constructor() {
    this.anchor = { set() {} };
    this.scale = { x: 1, y: 1, set() {} };
    this.x = 0;
    this.y = 0;
    this.destroyed = false;
    this.playing = false;
  }
  gotoAndStop() { this.playing = false; }
  gotoAndPlay() { this.playing = true; }
  destroy() { this.destroyed = true; }
}

function fakeClient() {
  const handlers = new Map();
  const sent = [];
  return {
    state: 'online',
    me: { id: 7, name: 'Ada' },
    sent,
    on(kind, fn) {
      if (!handlers.has(kind)) handlers.set(kind, new Set());
      handlers.get(kind).add(fn);
      return () => handlers.get(kind)?.delete(fn);
    },
    send(kind, payload) {
      sent.push({ kind, ...payload });
      return true;
    },
    emit(kind, msg) {
      for (const fn of handlers.get(kind) || []) fn(msg);
    },
  };
}

function fakeEngine({ mp = false, params = {} } = {}) {
  const data = {};
  const log = [];
  const client = mp ? fakeClient() : null;
  const engine = {
    PIXI: { AnimatedSprite: Sprite, Texture: { EMPTY: {} } },
    mode: mp ? 'multiplayer' : 'solo',
    started: true,
    inv: createInventory({}),
    toolState: null,
    player: { x: 300, y: 500 },
    platforms: [{ x1: 0, y1: 500, x2: 3000, y2: 500 }],
    worldW: 3000,
    streetTsid: 'GA5A',
    entityLayer: { addChild() {} },
    registered: [],
    busy: () => false,
    register(t) { engine.registered.push(t); return t; },
    unregister(t) { engine.registered = engine.registered.filter((r) => r !== t); t.sprite?.destroy(); },
    playSound: (k) => log.push(`sound:${k}`),
    pushActivity: (m) => log.push(`activity:${m}`),
    toast: (m) => log.push(`toast:${m}`),
    refreshPack: () => {},
    save: () => {},
    say: (t, text) => log.push(`say:${t.label}:${text}`),
    setData: (k, v) => { data[k] = v; },
    param: (k) => (k in params ? params[k] : null),
    query: (k) => (k === 'realtimeClient' ? client : null),
  };
  engine.toolState = bindToolInventory(createToolConditionState(), engine.inv);
  return { engine, data, log, client };
}

describe('cubimal-battle feature', () => {
  let clock = 1_000_000;
  const realNow = Date.now;
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    Date.now = () => clock;
  });
  afterEach(() => {
    mock.timers.reset();
    Date.now = realNow;
  });

  it('is registered with the other features, before the shared street objects', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes(CUBIMAL_BATTLE_FEATURE_ID));
    assert.ok(ids.indexOf(CUBIMAL_BATTLE_FEATURE_ID) < ids.indexOf('street-objects'));
  });

  it('solo: the three verbs; the figure is set down, says "Come at me, Bro!" and waits until picked up', () => {
    const { engine, data, log } = fakeEngine();
    cubimalBattleFeature.restore({}, engine);
    assert.deepEqual(cubimalBattleFeature.packVerbs('npc_cubimal_chick', engine), []);
    addItem(engine.inv, 'npc_cubimal_chick', 1);
    setCopyTag(engine.toolState, 'npc_cubimal_chick', 0, { name: 'Sprocket', level: 2, xp: 3 });
    const verbs = cubimalBattleFeature.packVerbs('npc_cubimal_chick', engine);
    assert.deepEqual(verbs.map((v) => v.label), ['Panache (battle)', 'Wile (battle)', 'Gumption (battle)']);
    assert.ok(verbs.every((v) => v.tooltip === 'Battle against another cubimal to level up' && v.enabled));
    assert.equal(cubimalBattleFeature.packVerbs('npc_cubimal_factorydefect_chick', engine).length, 0);

    assert.equal(cubimalBattleFeature.runPackVerb('npc_cubimal_chick', 'cubimal_battle_s', engine), true);
    assert.equal(countItem(engine.inv, 'npc_cubimal_chick'), 0);
    assert.ok(log.includes('sound:CUBIMAL_WIND_UP'));
    assert.ok(log.includes('activity:You battled a Chick Cubimal.'));
    assert.equal(engine.registered.length, 1);
    assert.equal(engine.registered[0].label, 'Sprocket Lvl.2');
    assert.equal(data.cubiBattleState, 'waiting');
    // A second figure while one is out is refused.
    assert.equal(cubimalBattleFeature.packVerbs('npc_cubimal_chick', engine).length, 0);
    mock.timers.tick(999);
    assert.ok(!log.some((l) => l.includes('Come at me')));
    mock.timers.tick(1);
    assert.ok(log.includes('say:Sprocket Lvl.2:Come at me, Bro!'));
    // Only its owner, and only while it waits: Pick up.
    const target = engine.registered[0];
    assert.deepEqual(cubimalBattleFeature.verbsFor(target, engine).map((v) => v.label), ['Pick up']);
    cubimalBattleFeature.runVerb(target, 'cubimal_battle_pickup', engine);
    assert.equal(countItem(engine.inv, 'npc_cubimal_chick'), 1);
    assert.deepEqual(copyTags(engine.toolState, 'npc_cubimal_chick'), [{ name: 'Sprocket', level: 2, xp: 3 }]);
    assert.equal(engine.registered.length, 0);
    assert.ok(log.includes('activity:You picked up a Chick Cubimal.'));
    assert.equal(data.cubiBattleState, 'idle');
  });

  it('solo: leaving the street or a reload puts the figure back with its words', () => {
    const { engine } = fakeEngine();
    cubimalBattleFeature.restore({}, engine);
    addItem(engine.inv, 'npc_cubimal_rook', 1);
    setCopyTag(engine.toolState, 'npc_cubimal_rook', 0, 'Caw');
    cubimalBattleFeature.runPackVerb('npc_cubimal_rook', 'cubimal_battle_r', engine);
    const saved = cubimalBattleFeature.save();
    assert.deepEqual(saved.out, { c: 'npc_cubimal_rook', tag: 'Caw' });
    cubimalBattleFeature.onStreetClear(engine);
    assert.equal(countItem(engine.inv, 'npc_cubimal_rook'), 1);
    assert.deepEqual(copyTags(engine.toolState, 'npc_cubimal_rook'), ['Caw']);
    // A reload of the save taken while it was out.
    const two = fakeEngine();
    cubimalBattleFeature.restore(saved, two.engine);
    assert.equal(countItem(two.engine.inv, 'npc_cubimal_rook'), 1);
    assert.deepEqual(copyTags(two.engine.toolState, 'npc_cubimal_rook'), ['Caw']);
  });

  it('online: the server pairs and referees; the winner comes home a level up', () => {
    const { engine, data, log, client } = fakeEngine({ mp: true });
    cubimalBattleFeature.restore({}, engine);
    cubimalBattleFeature.onTick(16, 0, engine);
    addItem(engine.inv, 'npc_cubimal_chick', 1);
    cubimalBattleFeature.runPackVerb('npc_cubimal_chick', 'cubimal_battle_r', engine);
    assert.deepEqual(client.sent, [{ kind: 'cubi_battle', c: 'npc_cubimal_chick', style: 'r', name: '', level: 1, xp: 0 }]);
    assert.equal(data.cubiBattleState, 'pending');
    // Bo's Rook is already out; then the server sets Ada's down and pairs them.
    client.emit('msg:cubi_fighters', { street: 'GA5A', fighters: [{ id: 9, name: 'Bo', c: 'npc_cubimal_rook', label: 'Rook Cubimal Lvl.1', level: 1, style: 'p', x: 400, y: 500, state: 'waiting', vs: 0, ego: 10 }] });
    client.emit('msg:cubi_fighter', { f: { id: 7, name: 'Ada', c: 'npc_cubimal_chick', label: 'Chick Cubimal Lvl.1', level: 1, style: 'r', x: 300, y: 500, state: 'waiting', vs: 0, ego: 10 } });
    assert.equal(data.cubiBattleState, 'waiting');
    assert.equal(data.cubiBattleFighters, '2');
    const rook = engine.registered.find((t) => t.label === 'Rook Cubimal Lvl.1');
    assert.equal(rook.subtitle, "Bo's Cubimal");
    assert.deepEqual(cubimalBattleFeature.verbsFor(rook, engine), [], 'nobody picks up another player\'s figure');
    client.emit('msg:cubi_vs', { a: 7, b: 9, text: "Ada's Chick Cubimal Lvl.1 VS. Bo's Rook Cubimal Lvl.1" });
    assert.equal(data.cubiBattleState, 'fighting');
    const mineTarget = engine.registered.find((t) => t.label === 'Chick Cubimal Lvl.1');
    assert.deepEqual(cubimalBattleFeature.verbsFor(mineTarget, engine), [], 'no pick up once it has an opponent');
    client.emit('msg:cubi_strike', { id: 7, vs: 9, to: 360, speed: 150, text: "You're more like a spherimal!", ego: 8, choke: false, ms: 920 });
    mock.timers.tick(100);
    assert.ok(log.includes("say:Chick Cubimal Lvl.1:You're more like a spherimal!"));
    assert.ok(log.includes('sound:CUBIMAL_RACE'));
    // It runs at 150 px/s toward x 360.
    for (let i = 0; i < 30; i += 1) cubimalBattleFeature.onTick(16, 0, engine);
    assert.equal(mineTarget.sprite.x, 360);
    client.emit('msg:cubi_line', { text: "Rook Cubimal Lvl.1's Ego remaining: 8" });
    assert.equal(data.cubiBattleLast, "Rook Cubimal Lvl.1's Ego remaining: 8");
    assert.equal(data.cubiBattleEgo, '9:8,7:10');
    client.emit('msg:cubi_won', { id: 7, vs: 9, text: "Ada's Chick Cubimal Lvl.1 defeated Bo's Rook Cubimal Lvl.1", level: 2, xp: 0, earned: 10, level_up: true });
    assert.equal(data.cubiBattleState, 'won');
    assert.ok(log.includes('sound:PROTO_PUFF'));
    client.emit('msg:cubi_home', { id: 9, why: 'lost' });
    client.emit('msg:cubi_say', { id: 7, text: 'LEVEL 2!', ms: 4000 });
    client.emit('msg:cubi_home', { id: 7, why: 'won', level: 2, xp: 0, earned: 10, level_up: true });
    assert.equal(countItem(engine.inv, 'npc_cubimal_chick'), 1);
    assert.deepEqual(copyTags(engine.toolState, 'npc_cubimal_chick'), [{ name: '', level: 2, xp: 0 }]);
    assert.equal(engine.registered.length, 0);
    assert.equal(data.cubiBattleWins, '1');
    // Its pack label now carries the level (getLabel 580).
    assert.deepEqual(cubimalRaceFeature.itemDisplayName('npc_cubimal_chick', 0, engine), { label: 'Chick Cubimal Lvl.2', kind: 'Chick Cubimal' });
    // Its next fight starts from there.
    clock += 5_000;
    cubimalBattleFeature.runPackVerb('npc_cubimal_chick', 'cubimal_battle_p', engine);
    assert.deepEqual(client.sent.at(-1), { kind: 'cubi_battle', c: 'npc_cubimal_chick', style: 'p', name: '', level: 2, xp: 0 });
  });

  it('online: a refusal or no answer puts the figure back', () => {
    const { engine, log, client } = fakeEngine({ mp: true });
    cubimalBattleFeature.restore({}, engine);
    cubimalBattleFeature.onTick(16, 0, engine);
    addItem(engine.inv, 'npc_cubimal_frog', 1);
    cubimalBattleFeature.runPackVerb('npc_cubimal_frog', 'cubimal_battle_p', engine);
    assert.equal(countItem(engine.inv, 'npc_cubimal_frog'), 0);
    client.emit('error', { code: 'cubi_battle', message: 'slow_down' });
    assert.equal(countItem(engine.inv, 'npc_cubimal_frog'), 1);
    assert.ok(log.includes('toast:Not right now.'));
    cubimalBattleFeature.runPackVerb('npc_cubimal_frog', 'cubimal_battle_p', engine);
    clock += 5_001;
    cubimalBattleFeature.onTick(16, 0, engine);
    assert.equal(countItem(engine.inv, 'npc_cubimal_frog'), 1);
    // Leaving mid-fight: the game puts it back at once; the server's later home for it is ignored.
    cubimalBattleFeature.runPackVerb('npc_cubimal_frog', 'cubimal_battle_p', engine);
    client.emit('msg:cubi_fighter', { f: { id: 7, name: 'Ada', c: 'npc_cubimal_frog', label: 'Frog Cubimal Lvl.1', level: 1, style: 'p', x: 300, y: 500, state: 'waiting', vs: 0, ego: 10 } });
    cubimalBattleFeature.onStreetClear(engine);
    client.emit('msg:cubi_home', { id: 7, why: 'left' });
    assert.equal(countItem(engine.inv, 'npc_cubimal_frog'), 1);
  });

  it('a race and a rename keep a figure\'s battle level', () => {
    const { engine } = fakeEngine();
    cubimalRaceFeature.init?.(engine);
    cubimalRaceFeature.restore({}, engine);
    addItem(engine.inv, 'npc_cubimal_chick', 1);
    setCopyTag(engine.toolState, 'npc_cubimal_chick', 0, { name: 'Sprocket', level: 3, xp: 5 });
    // A reload mid-race brings the whole words back.
    cubimalRaceFeature.restore({ out: ['npc_cubimal_chick'], outNames: ['Sprocket'], outTags: [{ name: 'Sprocket', level: 4, xp: 1 }] }, engine);
    assert.deepEqual(copyTags(engine.toolState, 'npc_cubimal_chick')[1], { name: 'Sprocket', level: 4, xp: 1 });
    assert.deepEqual(cubimalRaceFeature.itemDisplayName('npc_cubimal_chick', 1, engine), { label: 'Sprocket Lvl.4', kind: 'Chick Cubimal' });
    assert.deepEqual(cubimalRaceFeature.itemDisplayName('npc_cubimal_chick', null, engine, 'Bob'), { label: 'Bob', kind: 'Chick Cubimal' });
  });
});

// —— G120: the Feat contributor ranking badges (the shared Feat ranks them: server feats.go) ——

describe('feats:top_26 (G120)', () => {
  it('Order of the Third Otter at 3 top-26 places, Order of the Seventh Seal at 7', async () => {
    await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
    const state = createAchievementState();
    const pc = { xp: 0, imagination: 0, favor: {} };
    const unlockedAt = {};
    for (let n = 1; n <= 7; n += 1) {
      for (const u of applyAchievementProgress(state, 'feats:top_26', 1, pc)) if (u.unlocked) unlockedAt[u.classTsid] = n;
    }
    assert.deepEqual(unlockedAt, { order_of_the_third_otter: 3, order_of_the_seventh_seal: 7 });
  });

  it('the server ranks every contributor of a shared Feat and counts places 1-26 (feats.go end)', { skip: skipWithoutServer }, async () => {
    const go = readFileSync(serverPath('feats.go'), 'utf8');
    assert.match(go, /if place <= rw\.TopPlaces \{\n\t\t\tcounters = append\(counters, map\[string\]any\{"counter": "feats:top_26", "n": 1\}\)/);
    const data = JSON.parse(readFileSync(serverPath('data', 'feats.json'), 'utf8'));
    assert.equal(data.reward.topPlaces, 26);
  });
});
