/** Group Rook attacks in multiplayer: the client's pure half (js/rook-mp.js) and its wiring. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MP_ROOK,
  attackFromServer,
  offerAllowed,
  orbOf,
  primeBonusLevel,
  rookedFromServer,
  shareLine,
  shareOf,
  strikeDamage,
  syncKeys,
  syncObjs,
} from '../public/js/rook-mp.js?v=20b4c9ce';
import { rookClockS, canStrike, canStun, rookPresent } from '../public/js/rook-attack.js?v=c06c0537';
import { HAS_SERVER, serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('rook-mp: the server attack as the UI attack', () => {
  const raw = {
    phase: 'angry', angry: 'angry2', health: 150, maxHealth: 200, stun: 25, maxStun: 125, crowd: 2, wingBeats: 1, clock: 90000,
    orbs: [{ by: 7, name: 'Ada', joiners: [8], in: 12000 }], primed: null, shrine: { x: 865.6, y: 940.6, giant: 'spriggan' },
  };

  it('keeps the numbers and turns the clock into this client\'s time', () => {
    const a = attackFromServer(raw, 'GLI2V0UN7RD1T2J', 1000);
    assert.equal(a.mp, true);
    assert.equal(a.tsid, 'GLI2V0UN7RD1T2J');
    assert.equal(a.phase, 'angry');
    assert.equal(a.angryState, 'angry2');
    assert.equal(a.health, 150);
    assert.equal(a.maxStun, 125);
    assert.equal(a.wingBeatAt, 91000);
    assert.equal(a.recoveryAt, null);
    assert.equal(rookClockS(a, 1000), 90);
    assert.ok(canStun(a) && rookPresent(a) && !canStrike(a));
    assert.deepEqual(a.orbs, [{ by: 7, name: 'Ada', joiners: [8], fireAt: 13000 }]);
    assert.equal(a.shrine.giant, 'spriggan');
  });

  it('puts each phase\'s clock where rookClockS reads it', () => {
    assert.equal(attackFromServer({ ...raw, phase: 'herald', clock: 30000 }, 's', 0).attackAt, 30000);
    assert.equal(attackFromServer({ ...raw, phase: 'herald', clock: 30000 }, 's', 0).startedAt, 0);
    const stunned = attackFromServer({ ...raw, phase: 'stunned', clock: 120000, primed: { by: 8, name: 'Bo', in: 9000 } }, 's', 5);
    assert.equal(stunned.recoveryAt, 120005);
    assert.equal(stunned.angryState, '');
    assert.ok(canStrike(stunned));
    assert.deepEqual(stunned.primed, { by: 8, name: 'Bo', until: 9005 });
    assert.equal(attackFromServer({ ...raw, phase: 'dead', health: 0, clock: 15000 }, 's', 0).clearAt, 15000);
  });

  it('refuses what is not an attack', () => {
    assert.equal(attackFromServer(null, 's', 0), null);
    assert.equal(attackFromServer({ phase: 'party' }, 's', 0), null);
  });

  it('finds the orb a player is in', () => {
    const a = attackFromServer(raw, 's', 0);
    assert.equal(orbOf(a, 7).by, 7);
    assert.equal(orbOf(a, 8).by, 7);
    assert.equal(orbOf(a, 9), null);
  });
});

describe('rook-mp: rooked things and keys', () => {
  it('reads the server rows, dropping strangers', () => {
    const rows = rookedFromServer({
      'npc_piggy:0': { class: 'npc_piggy', doses: 2, by: [7, 8] },
      'trant_bean:1': { class: 'trant_bean', doses: 0, by: [] },
      'rock_beryl_1:0': { class: 'rock_beryl_1', doses: 0 },
      nonsense: { class: 'npc_piggy' },
    });
    assert.deepEqual(Object.keys(rows).sort(), ['npc_piggy:0', 'trant_bean:1']);
    assert.deepEqual(rows['npc_piggy:0'], { classId: 'npc_piggy', doses: 2, by: [7, 8], at: 0 });
  });

  it('syncs only rookable keys, at most the server\'s limit', () => {
    const entries = [{ key: 'npc_piggy:0' }, { key: 'pc:1' }, { key: 'trant_fruit:3' }, { key: 'npc_chicken:x' }];
    assert.deepEqual(syncKeys(entries), ['npc_piggy:0', 'trant_fruit:3']);
    const many = Array.from({ length: 100 }, (_, i) => ({ key: `npc_butterfly:${i}` }));
    assert.equal(syncKeys(many).length, MP_ROOK.maxSyncKeys);
  });
});

describe('rook-mp: each player\'s own share', () => {
  it('applies Rook Armor the way the source does', () => {
    assert.deepEqual(shareOf({ why: 'wing_beat', energy: -20, mood: -20 }), { why: 'wing_beat', xp: 0, energy: -20, mood: -20, favor: 0 });
    assert.deepEqual(shareOf({ why: 'wing_beat', energy: -20, mood: -20 }, { armor: true }), { why: 'wing_beat', xp: 0, energy: -10, mood: 0, favor: 0 });
    assert.equal(shareOf({ why: 'orb_start', energy: -50 }, { armor: true }).energy, -25);
    assert.equal(shareOf({ why: 'prime', energy: -10 }, { armor: true }).energy, -5);
    assert.equal(shareOf({ why: 'orb_join', energy: -25, xp: 10 }, { armor: true }).energy, -25);
    assert.equal(shareOf({ why: 'stun_fail', xp: 5, mood: -5 }, { armor: true }).mood, 0);
    assert.equal(shareOf({ why: 'revive', xp: 250, energy: -25, mood: -25, favor: 10 }, { armor: true }).mood, -25);
  });

  it('never lets a share add energy or mood, or take iMG', () => {
    assert.deepEqual(shareOf({ why: 'strike', xp: -4, energy: 30, mood: 9 }), { why: 'strike', xp: 0, energy: 0, mood: 0, favor: 0 });
  });

  it('speaks the source lines', () => {
    assert.equal(shareLine({ why: 'stun_lead' }, { xp: 10 }), 'You received 10 iMG for your successful attack against the Rook');
    assert.equal(shareLine({ why: 'stun_assist', damage: 25 }, { xp: 25 }), 'You struck back against the Rook for 25 points of stun. You got 25 iMG.');
    assert.equal(shareLine({ why: 'orb_join' }, { xp: 10, energy: -25 }), 'You focus your thoughts on the orb. You lose 25 energy and gain 10 iMG.');
    assert.equal(shareLine({ why: 'strike', damage: 63 }, { xp: 63 }), 'You struck back against the Rook, causing 63 damage. You got 63 iMG.');
    assert.equal(shareLine({ why: 'defeat_help' }, { xp: 176 }), 'You helped defeat the Rook. You got 176 iMG for your contributions.');
    assert.equal(shareLine({ why: 'defeat_witness' }, { xp: 50 }), 'You got 50 iMG for witnessing the defeat of the Rook.');
    assert.equal(shareLine({ why: 'stun_fail', broke: true }, { xp: 5, mood: -5 }), 'The orb was pushed past the breaking point! You gain 5 iMG but you lose 5 mood.');
    assert.equal(shareLine({ why: 'prime_done', damage: 200 }, { xp: 100 }), 'You have finished priming the shrine for attack. You got 100 iMG for the 200 damage dealt to the Rook.');
  });
});

describe('rook-mp: offerings', () => {
  it('takes what the server takes', () => {
    assert.equal(offerAllowed('plank', { label: 'Plank' }, 'spriggan'), true);
    assert.equal(offerAllowed('pick', { isTool: true }, 'spriggan'), false);
    assert.equal(offerAllowed('emblem_spriggan', { tags: ['emblem'] }, 'spriggan'), true);
    assert.equal(offerAllowed('emblem_lem', { tags: ['emblem'] }, 'spriggan'), false);
    assert.equal(offerAllowed('bag_furniture_cabinet', {}, 'spriggan'), false);
    assert.equal(offerAllowed('ghost', null, 'spriggan'), false);
  });

  it('strikes at the source value, with no solo crowd', () => {
    assert.equal(strikeDamage({ baseCost: 5, count: 100 }), 50);
    assert.equal(strikeDamage({ baseCost: 5, count: 100, primeBonus: 0.25 }), 63);
    assert.equal(strikeDamage({ baseCost: 5, count: 1 }), 0);
    assert.equal(strikeDamage({ emblem: true, count: 2 }), 500);
    assert.equal(primeBonusLevel(0), 0);
    assert.equal(primeBonusLevel(0.25), 1);
    assert.equal(primeBonusLevel(0.5), 2);
  });
});

describe('rook-mp: shared trees', () => {
  it('pairs each tree key with its shared object, only for keys the sync sends', () => {
    const entries = [
      { key: 'trant_bean:0', target: { treeIndex: 2 } },
      { key: 'npc_piggy:0', target: {} },
      { key: 'trant_fruit:1', target: { treeIndex: 0 } },
      { key: 'not_a_thing:0', target: { treeIndex: 5 } },
      { key: 'trant_egg:0', target: { treeIndex: -1 } },
    ];
    assert.deepEqual(syncObjs(entries), { 'trant_bean:0': 'tree:2', 'trant_fruit:1': 'tree:0' });
    assert.deepEqual(syncObjs([]), {});
  });

  it('rook_sync carries the pairs, and the server takes them', { skip: skipWithoutServer }, () => {
    assert.match(read('public/js/features/rook-attack-feature.js'), /client\.send\('rook_sync', \{ keys: syncKeys\(entries\), objs: syncObjs\(entries\) \}\)/);
    const go = fs.readFileSync(serverPath('rook.go'), 'utf8');
    assert.match(go, /Objs map\[string\]string `json:"objs"`/);
    assert.match(go, /ProvidedLocked\("objects\.rookTree"\)/);
    assert.match(fs.readFileSync(serverPath('objects.go'), 'utf8'), /r\.Provide\("objects\.rookTree", o\.rookTree\)/);
  });
});

describe('rook-mp: wiring', () => {
  const feature = read('public/js/features/rook-attack-feature.js');
  // The server is rook.go in groddle-afternoon-server (tools/repos.mjs); its checks skip without it.
  const go = HAS_SERVER ? fs.readFileSync(serverPath('rook.go'), 'utf8') : '';

  it('every importer of rook-mp.js uses one key', () => {
    const keys = [...feature.matchAll(/rook-mp\.js\?v=([\w-]+)/g)].map((m) => m[1]);
    assert.equal(new Set(keys).size, 1);
    assert.match(keys[0], /^[0-9a-f]{8}$/);
  });

  it('solo never binds the realtime client or skips its own schedule', () => {
    assert.match(feature, /if \(engine\.mode === 'multiplayer'\) \{\n\s+\/\/ The realtime server owns every attack[^\n]*\n\s+mpTick\(engine, t\);\n\s+\} else \{\n\s+\/\/ Schedule \(about hourly\)/);
    assert.match(feature, /function mpBind\(engine\) \{\n\s+if \(mp\) return mp;\n\s+const client = engine\.query\?\.\('realtimeClient'\);/);
    // mpBind is reached only from mpTick, which only multiplayer calls.
    assert.equal([...feature.matchAll(/mpBind\(/g)].length, 2);
    assert.equal([...feature.matchAll(/mpTick\(/g)].length, 2);
  });

  it('sends only the kinds the server handles, and handles what it sends', { skip: skipWithoutServer }, () => {
    const sent = new Set([...feature.matchAll(/client\.send\('(rook_[a-z_]+)'/g)].map((m) => m[1]));
    for (const kind of sent) assert.match(go, new RegExp(`r\\.Handle\\("${kind}"`), kind);
    for (const kind of ['rook', 'rook_you', 'rook_no']) assert.match(feature, new RegExp(`'msg:${kind}'`), kind);
    for (const why of ['orb_start', 'orb_join', 'stun_lead', 'stun_assist', 'stun_fail', 'wing_beat', 'prime', 'prime_done', 'strike', 'defeat_help', 'defeat_witness', 'revive']) {
      assert.match(go, new RegExp(`"${why}"`), why);
    }
  });

  it('the server data is generated, and names its street and offer rows', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(fs.readFileSync(serverPath('data/rook.json'), 'utf8'));
    assert.match(data.about, /build-realtime-rook\.mjs/);
    assert.ok(Object.keys(data.streets).length > 100);
    assert.equal(data.streets.GLI2V0UN7RD1T2J.length, 4);
    assert.ok(data.values.plank > 1);
    assert.ok(data.refused.includes('pick'));
  });
});
