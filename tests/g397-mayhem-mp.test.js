/**
 * G397, Math Mayhem between real players: the rules and the pure client side
 * (js/math-mayhem.js), the rules the server runs on (tools/build-realtime-mayhem.mjs,
 * data/mayhem.json in the server repo), the server's source rules and copy
 * (mayhem.go; skipped without the server repo), the site's signed route for the
 * winner's currants (LedgerMayhem.php; skipped without the site repo), the
 * end screen's four CC0 pictures, the feature (the Game Pig, joining, the arena
 * on the game's own street, a reward applied once) and that solo never sees it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  MAYHEM_END,
  MAYHEM_PLAYERS,
  MAYHEM_REWARD_ID_RE,
  MAYHEM_TARGET,
  MAYHEM_TEXT,
  MAYHEM_WIN_REWARD,
  mayhemBoard,
  mayhemColor,
  mayhemMath,
  mayhemOutcome,
  mayhemPos,
  mayhemSpawn,
  mayhemTeams,
  normalizeMayhemReward,
  normalizeMayhemRoom,
  normalizeMayhemState,
} from '../public/js/math-mayhem.js?v=7fe952aa';
import { mayhemData } from '../tools/build-realtime-mayhem.mjs';
import { CROWNS_START_POINTS, CROWNS_STREET } from '../public/js/game-of-crowns.js?v=98e21baf';
import { OVERLAY_USES } from '../public/js/overlays.js?v=90f4b1ba';
import { sharedStreet } from '../public/js/features/realtime-feature.js?v=2b66de0a';
import { HAS_SERVER, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const gsjs = join(root, '..', 'glitch-GameServerJS');

describe('the rules (GameServerJS math_mayhem)', () => {
  it('keeps the source numbers', () => {
    assert.deepEqual({ ...MAYHEM_PLAYERS }, { min: 4, max: 20 }); // config_prod.js:1282
    assert.deepEqual({ ...MAYHEM_TARGET }, { min: 10, max: 100 }); // global_game.js:298
    assert.deepEqual({ ...MAYHEM_WIN_REWARD }, { xp: 200, currants: 50 }); // inc_games.js 1077-1078
  });

  it('reads them from the source where it is checked out', { skip: !existsSync(gsjs) }, () => {
    const config = readFileSync(join(gsjs, 'config_prod.js'), 'utf8');
    assert.match(config, /math_mayhem: \{locations: \['LHV2H026E492IAF'\], min_players: 4, max_players: 20, name: 'Math Mayhem', can_retry: true\}/);
    const game = readFileSync(join(gsjs, 'groups/global_game.js'), 'utf8');
    assert.match(game, /this\.target_score = randInt\(10, 100\);/);
    assert.match(game, /games_start_math_mayhem\(this, start_time, 1\+this\.teams\[team\]\.length, team, this\.target_score\)/);
    const inc = readFileSync(join(gsjs, 'players/inc_games.js'), 'utf8');
    assert.match(inc, /total = our_status\.score \+ their_status\.score;/);
    assert.match(inc, /total = Math\.abs\(our_status\.score - their_status\.score\);/);
    assert.match(inc, /this\.stats_add_xp\(200, false, context\);\s+this\.stats_add_currants\(50, context\);/);
    for (const key of ['crown_game_winner_you', 'crown_game_winner_someone_else', 'button_play_again', 'button_leave_game']) {
      assert.ok(inc.includes(`overlay_key_to_url('${key}')`), key);
    }
    const pig = readFileSync(join(gsjs, 'items/test_game_starter.js'), 'utf8');
    assert.ok(pig.includes(`"${MAYHEM_TEXT.pigAsk}"`) && pig.includes(MAYHEM_TEXT.transported) && pig.includes(MAYHEM_TEXT.pigDesc));
  });

  it('gives teams in turn, blue first, each starting at one more than its last', () => {
    assert.deepEqual(mayhemTeams([1, 2, 3, 4, 5]), [
      { id: 1, team: 'blue', score: 1 },
      { id: 2, team: 'red', score: 1 },
      { id: 3, team: 'blue', score: 2 },
      { id: 4, team: 'red', score: 2 },
      { id: 5, team: 'blue', score: 3 },
    ]);
  });

  it('adds for a team and subtracts across them, never below zero', () => {
    assert.equal(mayhemMath({ team: 'blue', score: 3 }, { team: 'blue', score: 4 }), 7);
    assert.equal(mayhemMath({ team: 'blue', score: 3 }, { team: 'red', score: 10 }), 7);
    assert.equal(mayhemMath({ team: 'red', score: 5 }, { team: 'blue', score: 5 }), 0);
    assert.equal(mayhemColor('red'), '#CC0000');
    assert.equal(mayhemColor('blue'), '#0C6AE0');
  });

  it('spreads a full game past the touch reach at the four starts', () => {
    const spots = Array.from({ length: 20 }, (_, i) => mayhemSpawn(CROWNS_START_POINTS, i));
    assert.deepEqual(spots[0], CROWNS_START_POINTS[0]);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const near = Math.abs(spots[i].x - spots[j].x) <= 46 + 12 && Math.abs(spots[i].y - spots[j].y) <= 70;
        assert.ok(!near, `seats ${i} and ${j} touch`);
      }
    }
  });
});

describe('what the server sends, cleaned', () => {
  const STATE = { room: '00000000000000a1', round: 2, target: 42, players: [{ id: 7, name: 'Ada', team: 'blue', score: 40, locked: 500 }, { id: 8, name: 'Bo', team: 'red', score: 3 }, { id: 'x' }] };

  it('takes a room and turns away one it cannot play', () => {
    const r = normalizeMayhemRoom({ room: '00000000000000a1', street: 'MAYHEM_00000000000000A1', slot: 5, spawn: [1, 2], players: [{ id: 7, name: 'Ada' }], min: 4, max: 20 });
    assert.equal(r.slot, 5);
    assert.deepEqual(r.spawn, { x: 1, y: 2 });
    assert.equal(normalizeMayhemRoom({ room: '00000000000000a1', street: 'CROWNS_00000000000000A1' }), null);
    assert.equal(normalizeMayhemRoom({ room: 'nope', street: 'MAYHEM_00000000000000A1' }), null);
  });

  it('reads the round, the board and the end for this player', () => {
    const st = normalizeMayhemState(STATE, 1000);
    assert.equal(st.target, 42);
    assert.equal(st.players.length, 2);
    assert.equal(st.players[0].lockedUntil, 1500);
    assert.equal(normalizeMayhemState({ ...STATE, target: 5 }), null, 'a target outside 10-100 is not a round');
    assert.deepEqual(mayhemBoard(st, 7).map((r) => [r.name, r.off, r.you]), [['Ada', 2, true], ['Bo', 39, false]]);
    assert.deepEqual(mayhemOutcome({ winner: { id: 7, name: 'Ada' } }, 7), { outcome: 'won', won: true, winnerName: 'Ada', played: true, why: 'won' });
    assert.equal(mayhemOutcome({ winner: { id: 7, name: 'Ada' } }, 8).outcome, 'lost');
    assert.equal(mayhemOutcome({ winner: null, why: 'timeout' }, 8).outcome, 'timeout');
    assert.equal(mayhemOutcome({ winner: null, why: 'short' }, 8).outcome, 'called_off');
    assert.deepEqual(mayhemPos(8, 7, { x: 1, y: 2 }, [{ id: 8, x: 30, y: 40 }]), { x: 30, y: 40 });
  });

  it('caps a reward at the source\'s and checks its id', () => {
    assert.deepEqual(normalizeMayhemReward({ id: 'mayhem-00000000000000a1-3-7', xp: 999, currants: 999 }), { id: 'mayhem-00000000000000a1-3-7', room: '', round: 1, xp: 200, currants: 50 });
    assert.equal(normalizeMayhemReward({ id: 'crowns-00000000000000a1-3-7' }), null);
  });
});

describe('the server\'s rules data', () => {
  it('is current (node tools/build-realtime-mayhem.mjs)', { skip: skipWithoutServer }, () => {
    execFileSync(process.execPath, [join(root, 'tools/build-realtime-mayhem.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('plays on the Game of Crowns arena with the source rules', () => {
    const d = mayhemData();
    assert.equal(d.street, CROWNS_STREET);
    assert.deepEqual(d.players, { min: 4, max: 20 });
    assert.deepEqual(d.target, { min: 10, max: 100 });
    assert.deepEqual(d.teams, ['blue', 'red']);
    assert.equal(d.lockMs, 1000);
    assert.deepEqual(d.reward, { xp: 200, currants: 50 });
  });
});

describe('the server (mayhem.go)', { skip: skipWithoutServer }, () => {
  const go = HAS_SERVER ? readFileSync(serverPath('mayhem.go'), 'utf8') : '';

  it('does the math of a touch, locks both and ends at the target', () => {
    assert.match(go, /if a\.team == b\.team \{\s+answer = a\.score \+ b\.score/);
    assert.match(go, /a\.lockUntil, b\.lockUntil = lock, lock/);
    assert.match(go, /if answer == rm\.target \{/);
    assert.match(go, /rm\.target = m\.pick\(m\.a\.Target\.Min, m\.a\.Target\.Max\)/);
  });

  it('says what the source says', () => {
    for (const s of ['YAY! THE GAME IS STARTING SOON.', MAYHEM_TEXT.mustWait, MAYHEM_TEXT.removed, ' is ready to play. Need ', 'Just waiting on a few more slackers to HIT THE START BUTTON.']) {
      assert.ok(go.includes(s), s);
    }
  });

  it('names the reward the way the client and the site check it', () => {
    assert.match(go, /fmt\.Sprintf\("mayhem-%s-%d-%d", rm\.id, rm\.round, w\.ID\)/);
    assert.ok(MAYHEM_REWARD_ID_RE.test('mayhem-00000000000000a1-12-7'));
    assert.match(go, /ledgerRouteMayhem = "\/groddle\/v1\/ledger\/mayhem"/);
  });
});

describe('the site (LedgerMayhem.php)', { skip: skipWithoutSite }, () => {
  it('takes the server\'s signed call for one win\'s currants, idempotent per id', () => {
    const php = readFileSync(sitePath('src/LedgerMayhem.php'), 'utf8');
    assert.match(php, /ServiceCall::verify/);
    assert.match(php, /public const WIN_CURRANTS = 50;/);
    assert.match(php, /preg_match\('\/\^mayhem-\[0-9a-f\]\{16\}-\[0-9\]\{1,3\}-\[0-9\]\{1,12\}\$\/', \$id\)/);
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new LedgerMayhem\(\$minn\)/);
  });
});

describe('the end screen is Tiny Speck\'s four pictures', () => {
  const more = JSON.parse(read('public/assets/sprites/overlays/overlays-more.json'));

  it('builds each from its CC0 FLA and places it where games_end_math_mayhem did', () => {
    for (const k of ['you', 'other', 'again', 'leave']) {
      const e = MAYHEM_END[k];
      assert.ok(more[e.key], `${e.key} is in overlays-more.json`);
      assert.equal(more[e.key].src, `glitch-overlays/${e.key}.fla`);
      assert.ok(existsSync(join(root, 'public/assets/sprites/overlays', more[e.key].file)), more[e.key].file);
      const use = OVERLAY_USES[e.key];
      assert.equal(use.type, 'vp');
      assert.equal(use.wh, e.wh);
      assert.equal(use.x, e.x);
      assert.equal(use.y, e.y);
    }
  });
});

describe('the feature', () => {
  function fakeClient() {
    const handlers = new Map();
    const sent = [];
    return {
      sent,
      state: 'online',
      street: 'GA1',
      me: { id: 7, name: 'Ada' },
      players: [{ id: 8, x: 100, y: 200 }],
      on(type, fn) { handlers.set(type, fn); },
      send(kind, payload) { sent.push([kind, payload]); return true; },
      fire(kind, msg) { return handlers.get(`msg:${kind}`)?.({ t: kind, ...msg }); },
    };
  }
  const client = fakeClient();
  const log = { toasts: [], activity: [], achievements: [], receipts: [], prompts: [], entered: [] };
  const engine = {
    mode: 'multiplayer',
    pc: { currants: 10, imagination: 0, xp: 0 },
    player: { x: 0, y: 0 },
    streetTsid: 'GA1',
    instanceHold: null,
    query: (hook, id) => {
      if (hook === 'realtimeClient') return client;
      if (hook === 'ledgerReceipt') {
        log.receipts.push(id);
        return true;
      }
      return null;
    },
    toast: (t) => log.toasts.push(t),
    pushActivity: (t) => log.activity.push(t),
    achievement: (c, n) => log.achievements.push([c, n]),
    enter: async (tsid) => { log.entered.push(tsid); engine.streetTsid = tsid; },
    updateHud() {},
    save() {},
    setData() {},
    playSound() {},
    prompt: (o) => { log.prompts.push(o); return `p${log.prompts.length}`; },
    removePrompt() {},
  };

  it('asks which game, joins, and enters the arena on the game\'s own street', async () => {
    const { mayhemFeature } = await import('../public/js/features/mayhem-feature.js?v=eb2a46e3');
    mayhemFeature.init(engine);
    mayhemFeature.restore({}, engine);
    mayhemFeature.onTick(16, 0, engine);
    assert.deepEqual(mayhemFeature.verbsFor({ classId: 'test_game_starter' }).map((v) => v.id), ['admire']);
    mayhemFeature.runVerb({ classId: 'test_game_starter' }, 'admire', engine);
    const ask = log.prompts.at(-1);
    assert.equal(ask.text, 'Which game do you want to play?');
    ask.onChoice('math_mayhem');
    assert.deepEqual(client.sent.at(-1), ['mayhem_join', {}]);
    await client.fire('mayhem_room', { room: '00000000000000a1', street: 'MAYHEM_00000000000000A1', slot: 0, spawn: [1180, 243], players: [{ id: 7, name: 'Ada' }], min: 4, max: 20 });
    assert.deepEqual(log.entered, [CROWNS_STREET]);
    assert.ok(log.activity.includes('You are transported to a mystical land of fun and adventure!'));
    assert.equal(mayhemFeature.realtimeStreet(engine), 'MAYHEM_00000000000000A1');
    assert.deepEqual(mayhemFeature.labelFor('MAYHEM_00000000000000A1'), { street: 'Math Mayhem', hub: '', hubId: 'math_mayhem' });
    const se = { player: {}, streetTsid: CROWNS_STREET, transientInstance: () => true, homeContext: () => ({}), query: (h) => (h === 'realtimeStreet' ? 'MAYHEM_00000000000000A1' : null) };
    assert.equal(sharedStreet(se), 'MAYHEM_00000000000000A1');
    assert.deepEqual(mayhemFeature.travelGate(), { ok: false, msg: "You can't leave in the middle of a game!" });
    assert.deepEqual(mayhemFeature.physics(engine), { speed: 0, jump: 0 }, 'held until GO');
  });

  it('counts the end once and applies a reward once', async () => {
    const { mayhemFeature } = await import('../public/js/features/mayhem-feature.js?v=eb2a46e3');
    client.fire('mayhem_go', { room: '00000000000000a1', round: 1, target: 12, players: [{ id: 7, name: 'Ada', team: 'blue', score: 1 }, { id: 8, name: 'Bo', team: 'red', score: 1 }] });
    assert.equal(mayhemFeature.physics(engine).jump, 1.15);
    const end = { room: '00000000000000a1', round: 1, target: 12, winner: { id: 7, name: 'Ada' }, why: 'won', players: [], played: true };
    client.fire('mayhem_end', end);
    client.fire('mayhem_end', end);
    assert.deepEqual(log.achievements, [['math_mayhem:won', 1]]);
    const id = 'mayhem-00000000000000a1-1-7';
    await client.fire('mayhem_reward', { id, room: '00000000000000a1', round: 1, xp: 200, currants: 50 });
    assert.equal(engine.pc.currants, 60);
    assert.ok(engine.pc.imagination >= 200);
    assert.deepEqual(client.sent.at(-1), ['mayhem_ack', { id }]);
    await client.fire('mayhem_reward', { id, room: '00000000000000a1', round: 1, xp: 200, currants: 50 });
    assert.equal(engine.pc.currants, 60, 'never twice');
    assert.deepEqual(mayhemFeature.save().applied, [id]);
  });
});

describe('solo has no Math Mayhem', () => {
  const feature = read('public/js/features/mayhem-feature.js');
  it('places the Game Pig in multiplayer only, beside the dispenser, without a planner group', () => {
    assert.match(feature, /if \(engine\.mode === 'multiplayer' && hasRaceDispenser\(street\.tsid\)\) \{/);
    assert.doesNotMatch(feature, /placementGroups/, 'no street plan changes, solo or online');
  });
  it('leaves Game of Crowns its arena when no Math Mayhem game holds it', async () => {
    const { crownsFeature } = await import('../public/js/features/crowns-feature.js?v=f711131e');
    assert.deepEqual(crownsFeature.labelFor('CROWNS_00000000000000A1'), { street: 'Game of Crowns', hub: '', hubId: 'it_game' });
  });
});
