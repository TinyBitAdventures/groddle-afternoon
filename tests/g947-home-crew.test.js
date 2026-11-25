/**
 * G947 (shared-play audit M3, report #464): crews on a home street. js/home-crew-mp.js (the ids),
 * features/home-crew-mp-feature.js (the queries help-mine-feature asks there) on a stand-in
 * client, help-mine-feature's owner landing and visitor grant, the site's HomeYard::judgeStock
 * with the crew's help (through php -r), against GameServerJS items/include/mining.js and
 * items/dirt_pile.js. The server's home_crew.go has its own Go tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HOME_CREW_ID, homeCrewId, homeCrewOwner, normalizeHomeCrews } from '../public/js/home-crew-mp.js?v=df381ae8';
import { homeCrewMpFeature } from '../public/js/features/home-crew-mp-feature.js?v=e5fa40ab';
import { createMineRock } from '../public/js/mining.js?v=5e49efb3';
import { createQuestState } from '../public/js/quests.js?v=c8d59839';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function fakeClient({ street = 'HOME_7', me = 7 } = {}) {
  const heard = new Map();
  const sent = [];
  return {
    street,
    me: { id: me },
    sent,
    on(type, fn) {
      if (!heard.has(type)) heard.set(type, new Set());
      heard.get(type).add(fn);
      return () => heard.get(type)?.delete(fn);
    },
    hear(type, msg) {
      for (const fn of heard.get(type) || []) fn(msg);
    },
    send(kind, payload) {
      sent.push({ kind, ...payload });
      return true;
    },
  };
}

describe('the crew ids (js/home-crew-mp.js)', () => {
  it('a crew forms only on a home street, at a rock or a Dirt Pile', () => {
    assert.equal(homeCrewOwner('HOME_7'), 7);
    assert.equal(homeCrewOwner('HOUSE_7'), 0, 'the back yard is not the home street');
    assert.equal(homeCrewOwner('LA5101HF7F429V'), 0);
    assert.ok(HOME_CREW_ID.test('rock:3') && HOME_CREW_ID.test('node:dirt_pile:0'));
    assert.ok(!HOME_CREW_ID.test('node:peat_1:0'), 'peat_1.js has no helpers');
  });

  it('a visitor\'s copies by their yard id; the owner\'s own rocks and piles by their slot', () => {
    assert.equal(homeCrewId({ yardVisit: { kind: 'rock', id: 'rock:2' } }, { owner: 7, me: 9 }), 'rock:2');
    assert.equal(homeCrewId({ yardVisit: { kind: 'node', id: 'node:dirt_pile:1' } }, { owner: 7, me: 9 }), 'node:dirt_pile:1');
    assert.equal(homeCrewId({ yardVisit: { kind: 'node', id: 'node:jellisac:0' } }, { owner: 7, me: 9 }), null);
    assert.equal(homeCrewId({ yardVisit: { kind: 'tree', id: 'patch:0' } }, { owner: 7, me: 9 }), null);
    assert.equal(homeCrewId({ rockIndex: 1 }, { owner: 7, me: 7 }), 'rock:1');
    assert.equal(homeCrewId({ resourceKey: 'dirt_pile:0' }, { owner: 7, me: 7 }), 'node:dirt_pile:0');
    assert.equal(homeCrewId({ rockIndex: 1 }, { owner: 7, me: 9 }), null, 'only the owner stands among their own rock slots');
    assert.equal(homeCrewId({ rockIndex: 1 }, { owner: 0, me: 7 }), null);
  });

  it('reads the server\'s crews for this home only', () => {
    const crews = normalizeHomeCrews({ owner: 7, crews: { 'rock:0': [7, 9], 'tree:1': [3], 'node:dirt_pile:0': [] } }, 7);
    assert.deepEqual([...crews], [['rock:0', [7, 9]]]);
    assert.equal(normalizeHomeCrews({ owner: 8, crews: {} }, 7), null);
  });
});

describe('features/home-crew-mp-feature.js answers help-mine-feature on a home street', () => {
  function stage(opts) {
    homeCrewMpFeature._reset();
    const client = fakeClient(opts);
    const data = {};
    const engine = { mode: 'multiplayer', setData: (k, v) => { data[k] = String(v); }, query: (name) => (name === 'realtimeClient' ? client : null) };
    homeCrewMpFeature.onTick(16, 0, engine);
    return { client, data, engine };
  }

  it('the crew at the owner\'s rock, and a swing that starts and stops', () => {
    const { client, data } = stage();
    const rock = { classId: 'rock_metal_1', rockIndex: 0 };
    assert.deepEqual(homeCrewMpFeature.sharedMiners(rock), []);
    client.hear('msg:home_crews', { t: 'home_crews', owner: 7, crews: { 'rock:0': [9] } });
    assert.deepEqual(homeCrewMpFeature.sharedMiners(rock), [9]);
    assert.equal(data.homeCrew, 'rock:0=9');
    assert.equal(homeCrewMpFeature.sharedMineSwing(rock, 'start'), true);
    assert.equal(homeCrewMpFeature.sharedMineSwing(rock, 'stop'), true);
    assert.deepEqual(client.sent, [{ kind: 'home_crew', owner: 7, id: 'rock:0', do: 'start' }, { kind: 'home_crew', owner: 7, id: 'rock:0', do: 'stop' }]);
    assert.equal(homeCrewMpFeature.homeCrewId(rock), 'rock:0');
  });

  it('a swing that started is still running until it lands (a mined-out copy lets it reach the site)', () => {
    stage({ me: 9 });
    const rock = { classId: 'rock_metal_1', yardVisit: { kind: 'rock', id: 'rock:1' } };
    assert.equal(homeCrewMpFeature.homeCrewSwinging(rock), null);
    homeCrewMpFeature.sharedMineSwing(rock, 'start');
    assert.equal(homeCrewMpFeature.homeCrewSwinging(rock), true);
    homeCrewMpFeature.rockMined(rock);
    assert.equal(homeCrewMpFeature.homeCrewSwinging(rock), null, 'landed');
    homeCrewMpFeature.sharedMineSwing(rock, 'start');
    homeCrewMpFeature.sharedMineSwing(rock, 'stop');
    assert.equal(homeCrewMpFeature.homeCrewSwinging(rock), null, 'cancelled');
  });

  it('a visitor digs a Dirt Pile copy; the server\'s crews there are the diggers', () => {
    const { client } = stage({ me: 9 });
    const pile = { classId: 'dirt_pile', yardVisit: { kind: 'node', id: 'node:dirt_pile:0' } };
    client.hear('msg:home_crews', { owner: 7, crews: { 'node:dirt_pile:0': [7] } });
    assert.deepEqual(homeCrewMpFeature.sharedDiggers(pile), [7]);
    assert.equal(homeCrewMpFeature.sharedMiners(pile), null, 'a pile is no rock');
    assert.equal(homeCrewMpFeature.sharedDigSwing(pile, 'start'), true);
    assert.equal(homeCrewMpFeature.homeCrewLand(pile), null, 'a visitor\'s landing goes through home_yard and the site');
  });

  it('on a public street it answers nothing and sends nothing (street-objects-feature answers there)', () => {
    const { client } = stage({ street: 'LA5101HF7F429V' });
    const rock = { classId: 'rock_metal_1', rockIndex: 0 };
    assert.equal(homeCrewMpFeature.sharedMiners(rock), null);
    assert.equal(homeCrewMpFeature.sharedMineSwing(rock, 'start'), null);
    assert.equal(homeCrewMpFeature.homeCrewLand(rock), null);
    assert.deepEqual(client.sent, []);
  });

  it('the owner\'s landing waits for the server\'s help', async () => {
    const { client } = stage();
    const rock = { classId: 'rock_metal_1', rockIndex: 2 };
    const p = homeCrewMpFeature.homeCrewLand(rock);
    assert.equal(typeof p?.then, 'function');
    assert.deepEqual(client.sent.at(-1), { kind: 'home_crew', owner: 7, id: 'rock:2', do: 'land', req: 1 });
    client.hear('msg:home_crew_help', { t: 'home_crew_help', owner: 7, id: 'rock:2', req: 1, help: { bonus: 3, by: ['Bo'] } });
    assert.deepEqual(await p, { bonus: 3, by: ['Bo'] });
    homeCrewMpFeature._reset();
  });
});

describe('help-mine-feature on a home street (I Me Mine, the bonus)', () => {
  async function stage({ grant = null, land = null, miners = [] } = {}) {
    const mod = await import(`../public/js/features/help-mine-feature.js?v=test-${Math.random()}`);
    const feature = mod.helpMineFeature;
    const rock = createMineRock('rock_metal_1');
    const target = { classId: 'rock_metal_1', rockIndex: 0, state: { rock }, sprite: { x: 600, y: 600, destroyed: false } };
    const client = fakeClient();
    const log = [];
    const events = [];
    const data = {};
    let refreshed = 0;
    const engine = {
      mode: 'multiplayer',
      started: true,
      player: { x: 560, y: 600 },
      pc: { energy: 100 },
      inv: { pick: 1 },
      learnedSkills: ['mining_1'],
      interactables: [target],
      localCompanions: [],
      questState: createQuestState(),
      currentAction: null,
      acting: () => false,
      busy: () => false,
      param: () => null,
      setData: (k, v) => { data[k] = String(v); },
      pushActivity: (line) => log.push(line),
      floatText() {},
      refreshPack() {},
      refreshMineRock: () => { refreshed += 1; },
      achievement: (counter, n) => events.push([counter, n]),
      query(name) {
        if (name === 'realtimeClient') return client;
        if (name === 'sharedMiners') return miners;
        if (name === 'sharedMineSwing') return true;
        if (name === 'homeCrewId') return 'rock:0';
        if (name === 'sharedVerbGrant') return grant;
        if (name === 'homeCrewLand') return land;
        return undefined;
      },
    };
    feature.onStreetEnter({}, engine);
    return { feature, engine, rock, target, client, log, events, data, refreshed: () => refreshed };
  }

  it('the owner helped by a visitor: the server\'s bonus lands after the swing and comes off her rock (mining.js 327-383)', async () => {
    let answer;
    const s = await stage({ land: new Promise((resolve) => { answer = resolve; }) });
    s.feature.verbStarted(s.target, { id: 'mine' }, s.engine);
    s.client.hear('msg:home_crew_ok', { owner: 7, id: 'rock:0', helping: false });
    const chunks = s.rock.chunksRemaining;
    const before = s.engine.inv[s.rock.chunkId] || 0;
    s.feature.rockMined(s.target, { ok: true, rock: s.rock }, s.engine);
    assert.deepEqual(s.events, [], 'the first swing helps no one');
    answer({ bonus: 1, by: ['Bo'] });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal((s.engine.inv[s.rock.chunkId] || 0) - before, 1);
    assert.equal(s.rock.chunksRemaining, chunks - 1, 'the rock gives up the bonus too (mining.js 383)');
    assert.equal(s.refreshed(), 1);
    assert.match(s.log.at(-1), /^You got 1 additional .+ with the help you received from Bo\.$/);
  });

  it('#464: a visitor who joins the owner\'s swing counts for I Me Mine (mining.js 222-225, 501-505)', async () => {
    const s = await stage({ grant: { chunks: 5 }, miners: [7] });
    s.feature.verbStarted(s.target, { id: 'mine' }, s.engine);
    s.client.hear('msg:home_crew_ok', { owner: 7, id: 'rock:5', helping: false });
    assert.equal(s.data.helpMineHelping, undefined, 'another rock\'s answer');
    s.client.hear('msg:home_crew_ok', { owner: 7, id: 'rock:0', helping: true });
    assert.equal(s.data.helpMineHelping, 'server:yes');
    s.feature.rockMined(s.target, { ok: true, rock: s.rock }, s.engine);
    assert.deepEqual(s.events, [['help_mine', 1]]);
  });

  it('a visitor helped at the owner\'s rock: the bonus comes with the site\'s grant', async () => {
    const s = await stage({ grant: { chunks: 5, help: { bonus: 3, by: ['Ada', 'Cy'] } } });
    const chunks = s.rock.chunksRemaining;
    s.feature.verbStarted(s.target, { id: 'mine' }, s.engine);
    s.feature.rockMined(s.target, { ok: true, rock: s.rock }, s.engine);
    assert.equal(s.engine.inv[s.rock.chunkId], 3);
    assert.equal(s.rock.chunksRemaining, chunks, 'the copy takes the site\'s word on what is left');
  });
});

describe('the sources the crews follow', () => {
  const src = (file) => readFileSync(join(gsjs, file), 'utf8').split('\n');
  it('mining.js counts help_mine for a swing that helped; dirt_pile.js its bonus items and helped_dig', () => {
    const mining = src('items/include/mining.js');
    assert.match(mining[503], /quests_inc_counter\('help_mine', 1\)/);
    assert.match(mining.slice(66, 92).join('\n'), /this\.helpers\[i\]\[pc\.tsid\]\+\+/);
    const dirt = src('items/dirt_pile.js');
    assert.match(dirt.slice(344, 358).join('\n'), /if\(num_helpers > 5\) \{\s*bonus_items\+\+;\s*bonus_chance \+= 0\.1;/);
    assert.match(dirt.slice(475, 485).join('\n'), /quests_inc_counter\('helped_dig', 1\)/);
  });

  it('the server keeps the crews and hands a visitor\'s help to the site', { skip: HAS_SERVER ? false : 'no server checkout' }, () => {
    const crew = readFileSync(serverPath('home_crew.go'), 'utf8');
    assert.match(crew, /r\.Provide\("homecrew\.land", m\.land\)/);
    assert.match(readFileSync(serverPath('home_yard.go'), 'utf8'), /ProvidedLocked\("homecrew\.land"\)/);
  });
});

describe('the site takes and credits the crew\'s help (HomeYard::judgeStock)', { skip: skipSite }, () => {
  const items = [
    { id: 1, protoClass: 'proto_metal_rock', endClass: 'rock_metal_2', rx: -300, wear: 0 },
    { id: 2, protoClass: 'proto_dirt_pile', endClass: 'dirt_pile', rx: -900, wear: 0 },
  ];
  const state = {
    systems: { features: { homes: { cult: { items } } } },
    world: { streets: { RH_HOME_EXT: { rocks: [{ classId: 'rock_metal_1', rock: { chunksRemaining: 20, depleted: false, respawnAt: 0 } }] } } },
  };
  const judge = (id, verb, help, waiting = '[]', started = 0) => JSON.parse(execFileSync('php', ['-r', `foreach (["HomePool", "HomeYard"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\HomeYard; $s = json_decode(${JSON.stringify(JSON.stringify(state))}, false); $h = HomeYard::crewHelp(json_decode(${JSON.stringify(JSON.stringify(help))}, true)); if (${started} > 0) { $h['started'] = ${started}; } echo json_encode(HomeYard::judgeStock(HomeYard::rules(), $s, ${waiting}, [], [], ${JSON.stringify(id.startsWith('rock') ? 'rock' : 'node')}, ${JSON.stringify(id)}, ${JSON.stringify(verb)}, 1800000000000, fn($a, $b) => $a, $h));`]).toString());

  it('a swing\'s bonus comes off the rock with its own chunks and is credited', () => {
    const r = judge('rock:0', 'mine', { bonus: 3 });
    assert.equal(r.help, 3);
    assert.equal(r.took, r.got.metal_rock);
    assert.equal(r.left, 20 - r.took);
    assert.ok(r.took >= 3 + 1);
    assert.equal(judge('rock:0', 'mine', {}).help, undefined, 'no crew, no help');
    assert.equal(judge('rock:0', 'mine', { bonus: 999 }).help, 30, 'at most nine helps\' worth (mining.js 335-337)');
  });

  it('a crew swing that started while the rock had chunks is paid after another emptied it (mining.js 215-217, 293-383)', () => {
    const now = 1800000000000;
    const emptied = `[['id' => 'yd-1', 'kind' => 'rock', 'target' => 'rock:0', 'verb' => 'mine', 'took' => 20, 'at_ms' => ${now - 2000}]]`;
    assert.equal(judge('rock:0', 'mine', {}, emptied).why, 'empty', 'no crew swing: mined out');
    const late = judge('rock:0', 'mine', {}, emptied, now - 5000);
    assert.equal(late.late, true);
    assert.equal(late.left, 0);
    assert.equal(late.pool, '', 'only the swing that mined it out pays the owner');
    assert.ok(late.took >= 1);
    assert.equal(judge('rock:0', 'mine', {}, emptied, now - 1000).why, 'empty', 'a swing started after it was mined out');
  });

  it('a dig\'s bonus items, and Loam for the yield and the bonus when the crew\'s chance came up', { skip: !readFileSync(join(SITE_DIR, 'data', 'yard-verbs.json'), 'utf8').includes('proto_dirt_pile') ? 'no Dirt Pile cultivation in the yard rules' : false }, () => {
    const earth = judge('node:dirt_pile:0', 'dig', { items: 2, class: 'earth', loam: false });
    assert.deepEqual(earth.got, { earth: 4 });
    assert.equal(earth.help, 2);
    const loam = judge('node:dirt_pile:0', 'dig', { items: 1, class: 'loam', loam: true });
    assert.deepEqual(loam.got, { loam: 3 });
  });
});
