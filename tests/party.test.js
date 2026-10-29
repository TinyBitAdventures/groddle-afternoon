/**
 * Multiplayer parties (phase 4), the game side: js/party.js (roster, where
 * members are, the Partiers line, chat commands, the Invite to Party verb)
 * and js/features/party-feature.js (off in solo, wired before realtime, the
 * kinds it speaks are the ones the realtime server's party.go handles). The
 * server's rules are party_test.go in groddle-afternoon-server; the checks
 * that read the server skip when that repo is not beside this one
 * (tools/repos.mjs).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PARTY_MAX_SIZE,
  PARTY_PROMPT_SECONDS,
  PARTY_TEXT,
  inviteCandidates,
  inviteVerb,
  memberWhere,
  normalizeParty,
  partiersLine,
  partyCommand,
} from '../public/js/party.js?v=mp4-1';
import { partyFeature } from '../public/js/features/party-feature.js?v=g442-6';
import { FEATURES } from '../public/js/features/index.js?v=registry-276';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const readServer = (rel) => readFileSync(serverPath(rel), 'utf8');

const roster = {
  leader: 1,
  members: [
    { id: 1, name: 'Ada', leader: true, online: true, away: false, street: 'GA5101HF7F429V5' },
    { id: 2, name: 'Bo', leader: false, online: true, away: false, street: '' },
    { id: 3, name: 'Cy', leader: false, online: false, away: false, street: '' },
  ],
};

describe('party rules (js/party.js)', () => {
  it('keeps the source numbers', () => {
    assert.equal(PARTY_MAX_SIZE, 71); // config_prod.js:40
    assert.equal(PARTY_PROMPT_SECONDS, 89); // inc_party.js:131
  });

  it('keeps the same numbers as the server', { skip: skipWithoutServer }, () => {
    const go = readServer('party.go');
    assert.match(go, /partyMaxSize\s+= 71/);
    assert.match(go, /partyInviteTimeout = 90 \* time.Second/);
    assert.match(go, /partyPromptSeconds = 89/);
  });

  it('reads a roster, and a party of one is no party', () => {
    const p = normalizeParty(roster);
    assert.equal(p.leader, 1);
    assert.deepEqual(p.members.map((m) => m.name), ['Ada', 'Bo', 'Cy']);
    assert.equal(normalizeParty(null), null);
    assert.equal(normalizeParty({ members: [roster.members[0]] }), null);
    assert.equal(normalizeParty({ members: 'x' }), null);
    // Junk members drop out; unknown fields default safely.
    assert.equal(normalizeParty({ members: [{ id: 'x' }, { id: 4 }, { id: 5, name: 7 }] }).members[1].name, '7');
  });

  it('says where each member is', () => {
    const label = (t) => (t === 'GA5101HF7F429V5' ? 'Groddle Meadow' : '');
    const [ada, bo, cy] = normalizeParty(roster).members;
    assert.equal(memberWhere(ada, label), 'Groddle Meadow');
    assert.equal(memberWhere(bo, label), 'A secret place');
    assert.equal(memberWhere(cy, label), 'Offline');
    assert.equal(memberWhere({ ...ada, away: true }, label), 'Reconnecting');
    assert.equal(memberWhere({ ...ada, street: 'GZZZ' }, label), 'GZZZ');
  });

  it('builds the Partiers line as RightSideManager.as partyTooltip does', () => {
    const p = normalizeParty(roster);
    assert.equal(partiersLine(p, 1), 'Partiers (3): You, Bo and Cy');
    assert.equal(partiersLine({ members: p.members.slice(0, 2) }, 1), 'Partiers (2): You and Bo');
    assert.equal(partiersLine({ members: [...p.members, { id: 4, name: 'Dee' }] }, 1), 'Partiers (4): You, Bo, Cy, and Dee');
    assert.equal(partiersLine(null, 1), 'Partiers (1): Just you!');
  });

  it('parses the party chat commands', () => {
    assert.deepEqual(partyCommand('/p  meet  at the tree '), { kind: 'chat', text: 'meet at the tree' });
    assert.deepEqual(partyCommand('/PARTY hi'), { kind: 'chat', text: 'hi' });
    assert.deepEqual(partyCommand('/invite Ada Lovelace'), { kind: 'invite', name: 'Ada Lovelace' });
    assert.deepEqual(partyCommand('/leaveparty'), { kind: 'leave' });
    assert.equal(partyCommand('/p').kind, 'usage');
    assert.equal(partyCommand('/invite').kind, 'usage');
    assert.equal(partyCommand('/pizza'), null);
    assert.equal(partyCommand('/happy'), null);
    assert.equal(partyCommand('hello /p'), null);
    assert.equal(partyCommand('/leaveparty now'), null);
  });

  it('offers Invite to Party, off for someone already in it', () => {
    const p = normalizeParty(roster);
    const off = inviteVerb({ id: 2, name: 'Bo' }, p);
    assert.equal(off.label, 'Invite to Party');
    assert.equal(off.tooltip, 'Invite this person to a multi-person private chat.');
    assert.equal(off.enabled, false);
    assert.equal(off.reason, 'Bo is already in your party.');
    assert.equal(off.durationMs, 0);
    assert.equal(inviteVerb({ id: 9, name: 'Eve' }, p).enabled, true);
    assert.equal(inviteVerb({ id: 9, name: 'Eve' }, null).enabled, true);
    assert.deepEqual(inviteCandidates([{ id: 2 }, { id: 9 }, null], p), [{ id: 9 }]);
  });

  it('keeps the source copy', () => {
    assert.equal(PARTY_TEXT.leaveConfirm, "Are you sure you want to leave your party? You'll have to be invited back to rejoin.");
    assert.equal(PARTY_TEXT.accept, 'OK');
    assert.equal(PARTY_TEXT.decline, 'No thanks');
    for (const v of Object.values(PARTY_TEXT)) assert.doesNotMatch(v, /—/);
  });
});

describe('party feature (js/features/party-feature.js)', () => {
  it('does nothing in solo', () => {
    const solo = { mode: 'solo', started: true, query: () => { throw new Error('solo asked for the realtime client'); } };
    assert.equal(partyFeature.chatCommand('/p hi', solo), null);
    assert.equal(partyFeature.chatCommand('/invite Ada', solo), null);
    assert.equal(partyFeature.verbsFor({ featureId: 'party', playerId: 2 }, solo), null);
    assert.equal(partyFeature.runVerb({ featureId: 'party', playerId: 2 }, 'party_invite', solo), false);
    partyFeature.onTick(16, 0, solo);
    partyFeature.onStreetClear(solo);
    assert.equal(globalThis.groddleParty, undefined);
  });

  it('waits for the realtime client in multiplayer', () => {
    const mp = { mode: 'multiplayer', started: true, query: (hook) => (hook === 'realtimeClient' ? null : null) };
    assert.equal(partyFeature.chatCommand('/p hi', mp), null);
  });

  it('is registered before realtime (its chat commands answer first)', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('party'));
    assert.ok(ids.indexOf('party') < ids.indexOf('realtime'));
  });

  it('speaks only kinds the server\'s party.go handles, and hears what it sends', { skip: skipWithoutServer }, () => {
    const go = readServer('party.go');
    const header = go.slice(0, go.indexOf('import ('));
    const feature = read('public/js/features/party-feature.js');
    const sent = [...feature.matchAll(/client\.send\('([a-z_]+)'/g)].map((m) => m[1]);
    const heard = [...feature.matchAll(/client\.on\('msg:([a-z_]+)'/g)].map((m) => m[1]);
    // party_accept / party_decline go out through one ternary.
    sent.push(...[...feature.matchAll(/'(party_accept|party_decline)'/g)].map((m) => m[1]));
    assert.ok(sent.length >= 5 && heard.length >= 5);
    for (const kind of new Set([...sent, ...heard])) assert.match(header, new RegExp(`"t":"${kind}"`), kind);
    for (const kind of ['party_invite', 'party_accept', 'party_decline', 'party_leave', 'party_chat']) {
      assert.match(go, new RegExp(`r\\.Handle\\("${kind}"`), kind);
    }
  });
});
