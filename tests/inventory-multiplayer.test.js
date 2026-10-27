/**
 * The inventory's multiplayer status (register G324, Track M): an override's
 * `mp` (the commits that proved a row between two real players) turns a row
 * that needs other players into `multiplayer`; lost rows say why (players or
 * nosource); judged multiplayer counter groups are met only by an emission
 * that names the group literally; the DB keeps both columns and the report
 * and scorecard count them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../tools/inventory/scan.mjs';
import { applyMultiplayer, judgeAchievements, judgeJobs, judgeSystems, STATUSES, REACHABLE } from '../tools/inventory/detectors.mjs';
import { REMAKE_EMITTERS, emissionsByTag, multiplayerLine, multiplayerSummary, openDb, writeDb } from '../tools/inventory/build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function remakeScan(files) {
  const index = buildIndex(files.map(([path, text]) => ({ path: `/fixture/public/${path}`, text })), { root: '/fixture/public' });
  const by = emissionsByTag(index, REMAKE_EMITTERS).by;
  return { counters: by.counter || [], grants: by.grant || [] };
}

const TRADER_JOE = { id: 'trader_joe', name: 'Trader Joe', desc: 'Traded with 3 players', category: 'social', isSecret: false, conditions: [{ type: 'group_sum', group: 'players_traded', num: 3 }] };
// An item verb counter whose class is an unbound parameter: `${classTsid}:crunch` can spell any group.
const OPEN_GROUP = ['js/verbs.js', 'export function crunch(engine, classTsid) { engine.achievement(`${classTsid}:crunch`, 1); }\n'];
const TRADE = ['js/features/trade-feature.js', 'export function done(engine, withP) { engine.achievement(`players_traded:${withP.id}`, 1); }\n'];
const TRADED_LOST = { status: 'lost', reason: 'trading needs other players' };
const TRADED_MP = { ...TRADED_LOST, mp: 'game 1fa394e5, server 89a0cde', mpReason: 'trade-feature.js counts it' };

describe('inventory: multiplayer status (G324)', () => {
  it('is a status of its own, not part of the solo reachable set', () => {
    assert.ok(STATUSES.includes('multiplayer'));
    assert.equal(REACHABLE.has('multiplayer'), false);
  });

  it('meets a judged counter group only through an emission that names it (an open wildcard group proves nothing)', () => {
    const remake = remakeScan([OPEN_GROUP]);
    // Unjudged, the open group still reads as reachable (the scanner's known looseness).
    assert.equal(judgeAchievements({ achievements: [TRADER_JOE], remake }).at(0).status, 'source');
    const [row] = judgeAchievements({ achievements: [TRADER_JOE], remake, counterOverrides: { players_traded: TRADED_LOST } });
    assert.equal(row.status, 'lost');
    assert.equal(row.lost_why, 'players');
  });

  it('calls a badge multiplayer when it is reached through a judged group that carries mp', () => {
    const remake = remakeScan([OPEN_GROUP, TRADE]);
    const [row] = judgeAchievements({ achievements: [TRADER_JOE], remake, counterOverrides: { players_traded: TRADED_MP } });
    assert.equal(row.status, 'multiplayer');
    assert.equal(row.mp, 'game 1fa394e5, server 89a0cde');
    assert.match(row.evidence, /^multiplayer \(game 1fa394e5, server 89a0cde\): counter group players_traded/);
    assert.match(row.evidence, /trade-feature\.js/);
  });

  it('calls a badge multiplayer when only judged groups with mp block it (counters the realtime server sends)', () => {
    const otter = { id: 'order_of_the_third_otter', name: 'Order of the Third Otter', desc: '', category: 'feats', isSecret: false, conditions: [{ type: 'counter', group: 'feats', name: 'top_26', num: 3 }] };
    const remake = remakeScan([['js/f.js', "export function f(engine) { engine.achievement('feats:contributed', 1); }\n"]]);
    const judged = { 'feats:top_26': { status: 'lost', reason: 'top 26 contributors', mp: 'game 2c54a95e, server 6377b5d' } };
    assert.equal(judgeAchievements({ achievements: [otter], remake, counterOverrides: judged })[0].status, 'multiplayer');
    const noMp = { 'feats:top_26': { status: 'lost', reason: 'top 26 contributors' } };
    assert.equal(judgeAchievements({ achievements: [otter], remake, counterOverrides: noMp })[0].status, 'lost');
    // feats:contributed is not judged: a badge on it stays the solo game's.
    const featFirst = { ...otter, id: 'feat_first', conditions: [{ type: 'counter', group: 'feats', name: 'contributed', num: 1 }] };
    assert.equal(judgeAchievements({ achievements: [featFirst], remake, counterOverrides: judged })[0].status, 'source');
  });

  it('applies an mp override to any row, keeping the evidence and naming the commits', () => {
    const lost = { kind: 'quest', id: 'canyon_run', status: 'lost', lost_why: 'players', basis: 'auto', evidence: 'multiplayer quest' };
    assert.equal(applyMultiplayer(lost, { status: 'lost' }), lost);
    const mp = applyMultiplayer(lost, { mp: 'game 4aaf6361, server 016b4d8', mpReason: 'raced against real players' });
    assert.equal(mp.status, 'multiplayer');
    assert.equal(mp.basis, 'override');
    assert.equal(mp.lost_why, '');
    assert.equal(mp.evidence, 'multiplayer (game 4aaf6361, server 016b4d8): raced against real players | multiplayer quest');
  });

  it('judges systems: mp on a mapped or a lost system, nothing survives for a lost checklist item', () => {
    const checklist = [{ id: 'chat', status: 'source' }, { id: 'snaps', status: 'lost' }];
    const sources = ['players/inc_buddies', 'players/inc_acl_keys', 'players/inc_snaps', 'players/inc_organizations'].map((id) => ({ id, name: id, source_ref: id }));
    const rows = judgeSystems({ sources, checklist, systemMap: {
      'players/inc_buddies': { checklist: 'chat', mp: 'game bfef1df4' },
      'players/inc_acl_keys': { status: 'lost', reason: 'house keys', mp: 'game 1e3afa1a' },
      'players/inc_snaps': { checklist: 'snaps' },
      'players/inc_organizations': { checklist: 'chat', status: 'lost', reason: 'not built' },
    } });
    assert.deepEqual(rows.map((r) => [r.id, r.status, r.mp || '', r.lost_why || '']), [
      ['players/inc_buddies', 'multiplayer', 'game bfef1df4', ''],
      ['players/inc_acl_keys', 'multiplayer', 'game 1e3afa1a', ''],
      ['players/inc_snaps', 'lost', '', 'nosource'],
      ['players/inc_organizations', 'lost', '', 'players'],
    ]);
  });

  it('tells group halls (need players) from empty cultivation protos (nothing survives)', () => {
    const rows = judgeJobs({ jobIds: ['a', 'b'], jobs: {}, excluded: { a: { label: 'Hall', reason: 'group hall: needs a player group' }, b: { label: 'Proto', reason: 'public-street cultivation proto: an empty proto slot' } } });
    assert.deepEqual(rows.map((r) => [r.status, r.lost_why]), [['lost', 'players'], ['lost', 'nosource']]);
  });
});

describe('inventory: multiplayer columns and counts', () => {
  it('writes mp and lost_why, counts the multiplayer line, and migrates a DB from before G324', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inventory-mp-'));
    try {
      const path = join(dir, 'inv.sqlite');
      // An old DB: entities without the two columns.
      const old = new DatabaseSync(path);
      old.exec('CREATE TABLE entities (kind TEXT, id TEXT, name TEXT, source_ref TEXT, status TEXT, basis TEXT, detector TEXT, evidence TEXT, register TEXT, updated_at TEXT, PRIMARY KEY (kind, id))');
      old.close();
      const db = openDb(path);
      const e = (kind, id, status, extra = {}) => ({ kind, id, name: id, status, detector: 't', evidence: '', ...extra });
      writeDb(db, { entities: [
        e('achievement', 'trader_joe', 'multiplayer', { mp: 'game 1fa394e5' }),
        e('quest', 'canyon_run', 'multiplayer', { mp: 'game 4aaf6361', lost_why: 'players' }),
        e('quest', 'tower_defense', 'lost', { lost_why: 'players' }),
        e('street_project', 'proto-1', 'lost', { lost_why: 'nosource' }),
        e('buff', 'charades', 'lost'),
        e('achievement', 'feat_first', 'source', { mp: 'stray', lost_why: 'players' }),
      ] }, { commit: 'aaa', at: '2026-10-26T00:00:00Z' });
      const rows = Object.fromEntries(db.prepare('SELECT id, mp, lost_why FROM entities').all().map((r) => [r.id, [r.mp, r.lost_why]]));
      assert.deepEqual(rows.trader_joe, ['game 1fa394e5', '']);
      assert.deepEqual(rows.canyon_run, ['game 4aaf6361', '']);
      assert.deepEqual(rows.charades, ['', 'players']);
      assert.deepEqual(rows.feat_first, ['', '']);
      const m = multiplayerSummary(db);
      assert.deepEqual([m.multiplayer, m.players, m.nosource, m.needPlayers], [2, 2, 1, 4]);
      assert.deepEqual(m.kinds.quest, { multiplayer: 1, players: 1, nosource: 0 });
      assert.match(multiplayerLine(m), /^2 of 4 rows that need other players are reachable between real players in multiplayer; 2 still lost needing players; 1 lost because nothing survives$/);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('inventory: multiplayer overrides (overrides.json)', () => {
  const overrides = JSON.parse(readFileSync(join(root, 'tools/inventory/overrides.json'), 'utf8'));
  const mpRows = Object.entries(overrides).filter(([, v]) => v && typeof v === 'object' && v.mp);

  it('name the proving commits by repo, with what reaches the row, and never an NPC (the catalog shows items only)', () => {
    assert.ok(mpRows.length >= 20, `${mpRows.length} mp overrides`);
    for (const [k, v] of mpRows) {
      assert.match(v.mp, /^(game|server|site|engine) [0-9a-f]{7,40}(, (game|server|site|engine) [0-9a-f]{7,40})*$/, k);
      assert.ok(v.mpReason && !/—/.test(v.mpReason), `${k} needs an mpReason (no em-dashes)`);
      assert.ok(!k.startsWith('npc:'), `${k}: nothing shows an NPC's multiplayer status yet`);
    }
    for (const [k, v] of Object.entries(overrides)) if (v?.lost) assert.ok(['players', 'nosource'].includes(v.lost), k);
  });

  it('cite game commits that are on this branch', (t) => {
    let head = true;
    try { execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: 'ignore' }); } catch { head = false; }
    if (!head) return t.skip('not a git checkout');
    const hashes = new Set(mpRows.flatMap(([, v]) => [...v.mp.matchAll(/game ([0-9a-f]+)/g)].map((m) => m[1])));
    for (const h of hashes) {
      let ok = true;
      try { execFileSync('git', ['merge-base', '--is-ancestor', h, 'HEAD'], { cwd: root, stdio: 'ignore' }); } catch { ok = false; }
      assert.ok(ok, `game ${h} is not an ancestor of HEAD`);
    }
  });
});
