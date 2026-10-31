/**
 * G334, Game of Crowns between real players: the pure client side
 * (js/crowns-mp.js), the arena the server referees from
 * (tools/build-realtime-crowns.mjs, data/crowns.json in the server repo), the
 * server's source rules and copy (crowns.go; skipped without the server
 * repo), the site's signed route for the winner's currants
 * (LedgerCrowns.php; skipped without the site repo), the multiplayer branch
 * of crowns-feature (the ticket challenge, the shared arena street, a
 * reward applied once), and that solo never touches any of it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  CROWNS_MP_TEXT,
  CROWNS_REWARD_ID_RE,
  crownHolderPos,
  crownMsNow,
  crownsMpBoard,
  crownsMpOutcome,
  normalizeCrownsMatch,
  normalizeCrownsReward,
  normalizeCrownsState,
} from '../public/js/crowns-mp.js?v=0cb4bb3b';
import { crownsData } from '../tools/build-realtime-crowns.mjs';
import {
  CROWNS_LOCK_POINTS,
  CROWNS_START_POINTS,
  CROWNS_STREET,
  CROWNS_TEXT,
  CROWNS_TICKET,
} from '../public/js/game-of-crowns.js?v=98e21baf';
import { sharedStreet } from '../public/js/features/realtime-feature.js?v=72bd6e0f';
import { HAS_SERVER, HAS_SITE, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const MATCH = {
  t: 'crown_match',
  match: '00000000000000a1',
  street: 'CROWNS_00000000000000A1',
  title: 'Game of Crowns',
  slot: 2,
  spawn: [660, 275],
  players: [{ id: 7, name: 'Ada', slot: 0 }, { id: 8, name: 'Bo', slot: 1 }, { id: 9, name: 'Cy', slot: 2 }, { id: 10, name: 'Di', slot: 3 }],
  playLine: 610,
  locks: [[255, 1230], [1030, 1576], [1640, 1040], [2400, 1034]],
  winMs: 60000,
  autoLeave: 120,
};

const STATE = {
  t: 'crown_state',
  match: '00000000000000a1',
  round: 1,
  it: 8,
  locked: 800,
  clock: true,
  scores: [{ id: 8, name: 'Bo', ms: 12_400 }, { id: 7, name: 'Ada', ms: 3_000 }, { id: 9, name: 'Cy', ms: 0 }],
  locks: [true, false, true, true],
};

describe('crowns-mp: what the server sends', () => {
  it('cleans a match and turns away one it cannot play', () => {
    const m = normalizeCrownsMatch(MATCH);
    assert.equal(m.street, MATCH.street);
    assert.equal(m.slot, 2);
    assert.deepEqual(m.spawn, { x: 660, y: 275 });
    assert.equal(m.players.length, 4);
    assert.equal(m.locks.length, 4);
    assert.equal(m.playLine, 610);
    assert.equal(normalizeCrownsMatch({ ...MATCH, street: 'RACE_00000000000000A1' }), null);
    assert.equal(normalizeCrownsMatch({ ...MATCH, match: 'nope' }), null);
    assert.equal(normalizeCrownsMatch({ ...MATCH, players: [MATCH.players[0]] }), null);
    assert.equal(normalizeCrownsMatch({ ...MATCH, locks: [[1, 'x']] }), null);
  });

  it('runs the holder\'s clock on from the last state, capped at the win', () => {
    const st = normalizeCrownsState(STATE, 1000);
    assert.equal(st.it, 8);
    assert.equal(st.lockedUntil, 1800);
    assert.deepEqual(st.locks, [true, false, true, true]);
    assert.equal(crownMsNow(st, 8, 3000), 14_400);
    assert.equal(crownMsNow(st, 7, 3000), 3_000, 'only the holder\'s clock runs');
    assert.equal(crownMsNow({ ...st, clock: false }, 8, 3000), 12_400, 'above the play line it waits');
    assert.equal(crownMsNow(st, 8, 1_000_000), 60_000);
    const board = crownsMpBoard(st, 7, 3000);
    assert.deepEqual(board.map((r) => [r.name, r.seconds, r.it, r.you]), [['Bo', 14, true, false], ['Ada', 3, false, true], ['Cy', 0, false, false]]);
  });

  it('reads the end and the reward for this player', () => {
    assert.deepEqual(crownsMpOutcome({ winner: { id: 7, name: 'Ada' }, seconds: 60, played: true }, 7), { outcome: 'won', won: true, winnerName: 'Ada', seconds: 60, played: true, why: 'won' });
    assert.equal(crownsMpOutcome({ winner: { id: 7, name: 'Ada' }, seconds: 12 }, 8).outcome, 'lost');
    assert.equal(crownsMpOutcome({ winner: null, why: 'short' }, 8).outcome, 'called_off');
    const r = normalizeCrownsReward({ id: 'crowns-00000000000000a1-1-7', xp: 200, currants: 50 });
    assert.deepEqual([r.xp, r.currants], [200, 50]);
    assert.equal(normalizeCrownsReward({ id: 'crowns-00000000000000a1-1-7', xp: 9e9, currants: 9e9 }).currants, 50, 'never more than one win pays');
    assert.equal(normalizeCrownsReward({ id: 'job-r-1', xp: 200 }), null);
  });

  it('finds the holder for the crown sprite', () => {
    assert.deepEqual(crownHolderPos(7, 7, { x: 1, y: 2 }, []), { x: 1, y: 2 });
    assert.deepEqual(crownHolderPos(8, 7, null, [{ id: 8, x: 5, y: 6 }]), { x: 5, y: 6 });
    assert.equal(crownHolderPos(0, 7, { x: 1, y: 2 }, []), null);
  });
});

describe('the server\'s arena data', () => {
  it('is current (node tools/build-realtime-crowns.mjs)', { skip: skipWithoutServer }, () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/build-realtime-crowns.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /is current/);
  });

  it('is the arena solo plays on, with the source rules', () => {
    const d = crownsData();
    assert.equal(d.street, CROWNS_STREET);
    assert.equal(d.playLineY, 610, 'y >= -1390 on a street whose top is -2000');
    assert.deepEqual(d.starts, CROWNS_START_POINTS.map((p) => [p.x, p.y]));
    assert.deepEqual(d.locks, CROWNS_LOCK_POINTS.map((p) => [p.x, p.y]));
    assert.deepEqual(d.players, { min: 4, max: 5, retry: 3 });
    assert.deepEqual(d.reward, { xp: 200, currants: 50 });
    assert.deepEqual([d.winMs, d.tagLockMs, d.pickupLockMs, d.lockRespawnMs, d.countdownMs], [60000, 1000, 4000, 12000, 4000]);
    for (const [, y] of d.starts) assert.ok(y < d.playLineY, 'every start waits above the play line');
    for (const [, y] of d.locks) assert.ok(y > d.playLineY, 'every lock is in the play area');
  });
});

describe('the server (crowns.go)', { skip: skipWithoutServer }, () => {
  const go = HAS_SERVER ? readFileSync(serverPath('crowns.go'), 'utf8') : '';

  it('keeps the source numbers', () => {
    assert.match(go, /crownsInviteTimeout = 60 \* time\.Second/);
    assert.match(go, /crownsStartDelay\s+= 5 \* time\.Second/);
    assert.match(go, /crownsAutoLeave\s+= 2 \* time\.Minute/);
    assert.match(go, /crownsSoon\s+= 5 \* time\.Second/);
    assert.match(go, /crownsStateEvery\s+= time\.Second/);
  });

  it('says what the source says', () => {
    for (const line of [
      'You need at least one other player here.',
      ' is looking for a challenger for ',
      'Waiting for other players...',
      'Not enough players accepted your challenge. Try again later?',
      'Sorry, you were not quite fast enough to join ',
      ' in 5 seconds!',
      ' is ready to play. Need ',
      " is ready to play. LET'S GO!",
      ' is ready to play. Just waiting on a few more slackers to HIT THE START BUTTON.',
      'YAY! THE GAME IS STARTING SOON.',
      'You were removed from the game due to inactivity.',
      CROWNS_MP_TEXT.mustWait,
    ]) assert.ok(go.includes(line), line);
  });

  it('names the reward the way the client and the site check it', () => {
    assert.ok(go.includes('crowns-%s-%d-%d'));
    assert.ok(go.includes('`^crowns-[0-9a-f]{16}-[0-9]{1,3}-[0-9]{1,12}$`'));
    assert.equal(CROWNS_REWARD_ID_RE.source, '^crowns-[0-9a-f]{16}-[0-9]{1,3}-[0-9]{1,12}$');
    assert.ok(go.includes('ledgerRouteCrowns = "/groddle/v1/ledger/crowns"'));
  });
});

describe('the site (LedgerCrowns.php)', { skip: skipWithoutSite }, () => {
  const php = HAS_SITE ? readFileSync(sitePath('src/LedgerCrowns.php'), 'utf8') : '';
  const ext = HAS_SITE ? readFileSync(sitePath('src/Extension.php'), 'utf8') : '';

  it('takes the server\'s signed call for one win\'s currants, idempotent per id', () => {
    assert.ok(php.includes("public const ROUTE = '/groddle/v1/ledger/crowns';"));
    assert.ok(php.includes('ServiceCall::verify'));
    assert.ok(php.includes("preg_match('/^crowns-[0-9a-f]{16}-[0-9]{1,3}-[0-9]{1,12}$/'"));
    assert.ok(php.includes('public const WIN_CURRANTS = 50;'));
    assert.ok(php.includes("$got['items'] !== []"), 'no items, ever');
    assert.ok(ext.includes('new LedgerCrowns($minn)'));
  });
});

describe('the multiplayer branch of crowns-feature', () => {
  function fakeClient({ players = [{ id: 8 }], state = 'online' } = {}) {
    const handlers = new Map();
    const sent = [];
    return {
      sent,
      handlers,
      state,
      street: 'LHV2H026E492IAF',
      me: { id: 7, name: 'Ada' },
      players,
      on(type, fn) { handlers.set(type, fn); },
      send(kind, payload) { sent.push([kind, payload]); return true; },
      fire(kind, msg) { return handlers.get(`msg:${kind}`)?.({ t: kind, ...msg }); },
    };
  }
  const shared = fakeClient();
  function fakeEngine(client, extra = {}) {
    const log = { toasts: [], activity: [], achievements: [], receipts: [] };
    return {
      log,
      mode: 'multiplayer',
      inv: { [CROWNS_TICKET]: 1 },
      pc: { currants: 10, imagination: 0, xp: 0 },
      player: { x: 0, y: 0 },
      streetTsid: 'LHV2H026E492IAF',
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
      updateHud() {},
      save() {},
      setData() {},
      playSound() {},
      prompt: () => 'p1',
      removePrompt() {},
      ...extra,
    };
  }

  const sharedEngine = fakeEngine(shared);

  it('challenges the street with a ticket, and needs someone else there', async () => {
    const { crownsMpChallenge, crownsFeature } = await import('../public/js/features/crowns-feature.js?v=0a3487a4');
    // One realtime client for the whole module, as in the game (crowns-feature attaches once).
    shared.players = [];
    const e1 = sharedEngine;
    crownsFeature.restore({}, e1);
    assert.equal(crownsMpChallenge(CROWNS_TICKET, e1), false);
    assert.deepEqual(e1.log.toasts, [CROWNS_MP_TEXT.alone]);
    assert.equal(e1.inv[CROWNS_TICKET], 1, 'the ticket stays');
    shared.players = [{ id: 8 }];
    assert.equal(crownsMpChallenge(CROWNS_TICKET, e1), true);
    assert.deepEqual(shared.sent.at(-1), ['crown_challenge', {}]);
    assert.equal(e1.inv[CROWNS_TICKET], 0, 'spent on the challenge');
    assert.equal(crownsMpChallenge(CROWNS_TICKET, e1), false, 'one challenge at a time');
    // Nobody came: the ticket comes back (games_invite_timeout 2448-2450).
    shared.fire('crown_failed', { text: 'Not enough players accepted your challenge. Try again later?', refund: true });
    assert.equal(e1.inv[CROWNS_TICKET], 1);
  });

  it('keeps a ticket spent on a challenge in flight through a street change (G349)', async () => {
    const { crownsMpChallenge, crownsFeature } = await import('../public/js/features/crowns-feature.js?v=0a3487a4');
    const e1 = sharedEngine;
    shared.players = [{ id: 8 }];
    e1.inv[CROWNS_TICKET] = 1;
    assert.equal(crownsMpChallenge(CROWNS_TICKET, e1), true);
    assert.equal(e1.inv[CROWNS_TICKET], 0);
    // A croak sends the challenger to Hell One while the challenge is open: no refund.
    crownsFeature.onStreetEnter({ tsid: 'GA5PPFP86NF2FOS' }, { ...e1, param: () => null, instanceHold: null });
    assert.equal(e1.inv[CROWNS_TICKET], 0, 'the street change leaves the ticket spent');
    shared.fire('crown_failed', { text: 'Not enough players accepted your challenge. Try again later?', refund: true });
    assert.equal(e1.inv[CROWNS_TICKET], 1, 'the server saying it failed gives it back');
  });

  it('applies a reward once: the iMG, the currants through ledgerReceipt, then acks', async () => {
    const { crownsFeature } = await import('../public/js/features/crowns-feature.js?v=0a3487a4');
    const c = shared;
    c.players = [{ id: 8 }];
    const e = sharedEngine; // the handlers belong to the engine they were attached with, as in the game
    crownsFeature.restore({}, e);
    crownsFeature.onTick(16, 0, e); // attaches to the realtime client
    const id = 'crowns-00000000000000a1-1-7';
    await c.fire('crown_reward', { id, match: '00000000000000a1', round: 1, xp: 200, currants: 50 });
    assert.equal(e.pc.currants, 60);
    assert.ok(e.pc.imagination >= 200, 'the 200 iMG with the mood bonus');
    assert.deepEqual(e.log.receipts, [id]);
    assert.deepEqual(c.sent.at(-1), ['crown_ack', { id }]);
    assert.deepEqual(crownsFeature.save().applied, [id], 'the save remembers it');
    await c.fire('crown_reward', { id, match: '00000000000000a1', round: 1, xp: 200, currants: 50 });
    assert.equal(e.pc.currants, 60, 'never twice');
    assert.deepEqual(c.sent.at(-1), ['crown_ack', { id }]);
  });

  it('shares the arena on the match street only while a game is on', async () => {
    const { crownsFeature } = await import('../public/js/features/crowns-feature.js?v=0a3487a4');
    assert.equal(crownsFeature.realtimeStreet({ streetTsid: CROWNS_STREET }), null, 'no match: the arena is private as before');
    // No hub line: getLoadingInfo sends instances no hub_name (locations/location.js 3311).
    assert.deepEqual(crownsFeature.labelFor('CROWNS_00000000000000A1'), { street: 'Game of Crowns', hub: '', hubId: 'it_game' });
    const engine = (answer) => ({ player: {}, streetTsid: CROWNS_STREET, transientInstance: () => true, homeContext: () => ({}), query: (h) => (h === 'realtimeStreet' ? answer : null) });
    assert.equal(sharedStreet(engine('CROWNS_00000000000000A1')), 'CROWNS_00000000000000A1');
    assert.equal(sharedStreet(engine(null)), '');
  });
});

describe('solo Game of Crowns stays solo', () => {
  const feature = read('public/js/features/crowns-feature.js');
  const races = read('public/js/features/races-feature.js');

  it('routes a ticket to real players only in multiplayer', () => {
    assert.match(races, /if \(isMp\(engine\) && raceId === 'it_game'\) return crownsMpChallenge\(classTsid, engine\);/);
    assert.match(feature, /if \(classTsid !== CROWNS_TICKET \|\| !isMp\(engine\)\) return false;/);
    assert.match(feature, /function isMp\(engine\) \{\n  return engine\?\.mode === 'multiplayer' && Boolean\(engine\.query\?\.\('realtimeClient'\)\);/);
  });

  it('keeps the solo save as it was', async () => {
    const { crownsFeature } = await import('../public/js/features/crowns-feature.js?v=0a3487a4');
    crownsFeature.restore({ wins: 2, losses: 1, applied: ['crowns-00000000000000a1-1-7'] }, { mode: 'solo' });
    assert.deepEqual(Object.keys(crownsFeature.save()).sort(), ['losses', 'pendingTicket', 'returnTo', 'wins']);
  });

  it('keeps solo\'s reaches and spots', () => {
    assert.match(feature, /const START_POINTS = CROWNS_START_POINTS;/);
    assert.match(feature, /const LOCK_POINTS = CROWNS_LOCK_POINTS;/);
    assert.deepEqual(CROWNS_START_POINTS[0], { x: 1180, y: 243 });
    assert.deepEqual(CROWNS_LOCK_POINTS[3], { x: 2400, y: 1034 });
    assert.equal(CROWNS_TEXT.lockGot, '+4 seconds');
  });
});
