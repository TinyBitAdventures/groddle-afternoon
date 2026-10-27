/**
 * G335 hardening: what the realtime server decides outlives a restart (the
 * launchd agent restarts on every deploy). The server keeps each lasting
 * system in a state file of its own, beside -secret-file by default, "off"
 * for memory only (groddle-afternoon-server persist.go): the trade journal,
 * street projects, the Feat, hi signs, the credits outbox (credits.go), the
 * shared street objects with dead trees, poison clocks and street Piggies
 * (objects_persist.go), what the Rook rooked (rook_persist.go) and the gone
 * quoins with the day's grabs (quoins_persist.go). The restarts themselves are
 * the server's Go tests (objects_persist_test.go, credits_journal_test.go,
 * rook_persist_test.go, quoins_persist_test.go); this checks the contract the
 * deploys rely on, and that a client joining a restarted server reads the
 * kept state the way it reads a live one.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { applyPigState, applyTreeState, applyWoodState, createStreetCopy, stateFor, takeObjs } from '../public/js/street-objects.js?v=g374-1';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

/** The state files: flag -> default file name beside -secret-file. */
const STATE_FILES = {
  'trade-journal': 'realtime-trades.jsonl',
  'projects-file': 'realtime-projects.json',
  'feats-file': 'realtime-feats.json',
  'hi-file': 'realtime-hi.json',
  'credits-file': 'realtime-credits.jsonl',
  'objects-file': 'realtime-objects.json',
  'rook-file': 'realtime-rook.json',
  'quoins-file': 'realtime-quoins.json',
  'crowns-file': 'realtime-crowns.json', // G334 lane RACES3: crowns.go's owed rewards
  'party-file': 'realtime-party.json', // G335 lane PARTYSAVE: parties, Party Spaces and the spends owed back
};

describe('the server keeps its lasting state in files', { skip: skipWithoutServer }, () => {
  const go = readdirSync(serverPath())
    .filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'))
    .map((f) => readFileSync(serverPath(f), 'utf8'))
    .join('\n');

  it('each state file has its flag, a default beside -secret-file and "off"', () => {
    for (const [flag, name] of Object.entries(STATE_FILES)) {
      const def = go.match(new RegExp(`flag\\.String\\("${flag}", "", "([^"]*)"\\)`));
      assert.ok(def, `-${flag} is a flag with no value of its own`);
      assert.match(def[1], new RegExp(`default: ${name.replace('.', '\\.')} beside -secret-file; off: memory only`), `-${flag}'s help names its default`);
      assert.ok(go.includes(`"${name}"`), `${name} is the default -${flag} uses`);
    }
    assert.equal(new Set(Object.values(STATE_FILES)).size, Object.keys(STATE_FILES).length, 'no two systems share a file');
  });

  it('the launchd agent takes the defaults: no state flag, so every file sits beside the secret', () => {
    const plist = readFileSync(serverPath('deploy/launchd.plist'), 'utf8');
    for (const flag of Object.keys(STATE_FILES)) assert.ok(!plist.includes(`-${flag}`), `launchd.plist passes -${flag}`);
  });

  it('the systemd unit puts every state file in its StateDirectory (/etc is read-only there)', () => {
    const unit = readFileSync(serverPath('deploy/groddle-realtime.service'), 'utf8');
    assert.match(unit, /StateDirectory=groddle-realtime/);
    for (const [flag, name] of Object.entries(STATE_FILES)) {
      assert.ok(unit.includes(`-${flag} /var/lib/groddle-realtime/${name}`), `the unit gives -${flag} under /var/lib/groddle-realtime`);
    }
  });

  it('a bad or missing file starts a system empty, never stops the server', () => {
    const persist = readFileSync(serverPath('persist.go'), 'utf8');
    assert.match(persist, /func readStateFile/);
    assert.match(persist, /moved aside/);
    assert.doesNotMatch(go.match(/func \(o \*objects\) load\(\)[\s\S]*?\n}\n/)[0], /log\.Fatal|panic\(/);
  });
});

describe('a client joining a restarted server reads what it kept', () => {
  it('a tree that died before the restart is dead, with its poisoner', () => {
    const copy = createStreetCopy();
    takeObjs(copy, { street: 'GLI2V0UN7RD1T2J', snap: true, objs: [{ id: 'tree:7', maturity: 6, count: 0, dead: true, by: 380 }, { id: 'tree:0', fruit: 0, cap: 70, health: 7, maturity: 10, petted: false, watered: false, dead: true }] }, 5000);
    const wood = {};
    applyWoodState(wood, stateFor(copy, 'tree:7', 5000), 5000);
    assert.deepEqual([wood.sharedDead, wood.sharedDeadBy], [true, 380]);
    const trant = { classTsid: 'trant_fruit' };
    applyTreeState(trant, stateFor(copy, 'tree:0', 5000), 5000);
    assert.deepEqual([trant.sharedDead, trant.sharedDeadBy], [true, 0], 'the Rook (by 0) killed it');
  });

  it('a poison clock that ran on through the restart counts down from what the new server says', () => {
    const wood = {};
    applyWoodState(wood, { id: 'tree:7', maturity: 6, count: 0, poison: 118_000, by: 380 }, 60_000);
    assert.equal(wood.poisonEndsAt, 60_000 + 118_000);
    assert.equal(wood.poisonBy, 380);
  });

  it('a street Piggy keeps its mood, hunger and clock', () => {
    const st = {};
    applyPigState(st, { id: 'pig:4', mood: 2, hunger: 0, petted: true, daily: true, croak: false, in: 6_970_544 }, 1000);
    assert.equal(st.mood, 2);
    assert.equal(st.hasBeenPetted, 1);
  });
});
