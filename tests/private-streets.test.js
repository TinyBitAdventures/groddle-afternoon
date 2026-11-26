/**
 * G945 (audit M21, M22): the places Glitch kept to one player (instance_me with a max of 1
 * member, locations/inc_instances.js 88-90) stay private online: one rule (js/shared-street.js
 * publicStreet) over a list generated from the location data (tools/private-streets/build.mjs).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCATION_XML, OUT_PATH, collectPrivateStreets, instanceRow, render } from '../tools/private-streets/build.mjs';
import { PRIVATE_STREETS, isPrivateStreet } from '../public/js/private-streets.js?v=e0a38930';
import { publicStreet } from '../public/js/shared-street.js?v=dce5694b';
import { sharedStreet } from '../public/js/features/realtime-feature.js?v=38dea85a';
import { sharedQuoinsFeature } from '../public/js/features/shared-quoins-feature.js?v=5d1f752a';
import { ROOM_4_TSID, ROOM_8_TSID, ROOM_16_TSID } from '../public/js/tower-challenge-rooms.js?v=01f1c620';
import { ROOM_23_TSID } from '../public/js/gwendolyn-room-23.js?v=918c0f6b';
import { ROOM_15_TSID } from '../public/js/tower-rooms.js?v=4f1f6af7';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const SURVEYORS_STROLL = 'GA952QGCH3D31E2'; // Gentle Island, NB_Street1
const ORANGIAN = 'GHVCKEPHO403BN5'; // a colour level
const ALAKOL_START = 'GNV57FNCD0D2059'; // a newxp exit street
const GROVE = 'GLI2V0UN7RD1T2J'; // an ordinary public street

const engineOn = (tsid, extra = {}) => ({
  player: { x: 0, y: 0 },
  streetTsid: tsid,
  transientInstance: () => false,
  homeContext: () => ({ inHome: false }),
  ...extra,
});

describe('the location data (tools/private-streets/build.mjs)', () => {
  it('reads instance_me and the max, which is 1 when the record names none', () => {
    assert.deepEqual(instanceRow('<str id="instance_me">NB_Street1</str>\n<int id="instance_max_members">1</int>'), { instanceMe: 'NB_Street1', maxMembers: 1 });
    assert.deepEqual(instanceRow('<str id="instance_me">tower_quest</str>'), { instanceMe: 'tower_quest', maxMembers: 1 });
    assert.deepEqual(instanceRow('<str id="instance_me">hell_one</str><int id="instance_max_members">21</int>'), { instanceMe: 'hell_one', maxMembers: 21 });
    assert.equal(instanceRow('<str id="label">Grove</str>'), null);
  });

  it('is up to date with the archived XML and the rebuilt rooms', { skip: !existsSync(LOCATION_XML) && `no location XML at ${LOCATION_XML}` }, () => {
    assert.equal(readFileSync(OUT_PATH, 'utf8'), render(collectPrivateStreets()), 'run node tools/private-streets/build.mjs');
  });

  it('lists Gentle Island, the newxp exit streets, the colour levels, the challenge rooms and Room 23', () => {
    for (const tsid of [SURVEYORS_STROLL, 'GA93VBH3H3D38HF', ALAKOL_START, ORANGIAN, ROOM_4_TSID, ROOM_8_TSID, ROOM_16_TSID, ROOM_23_TSID]) {
      assert.ok(isPrivateStreet(tsid), tsid);
    }
    assert.ok(isPrivateStreet(`L${SURVEYORS_STROLL.slice(1)}`), 'an L-prefixed tsid too');
    assert.ok(PRIVATE_STREETS.size >= 34);
  });

  it('leaves shared instances and public streets out', () => {
    // Hell One (max 21) and the gut tubes (max 53) were instances many shared.
    assert.equal(isPrivateStreet('GA5PPFP86NF2FOS'), false, 'Hell One');
    assert.equal(isPrivateStreet('GA9TCL1H7LD37DC'), false, 'Bilicious Blues');
    assert.equal(isPrivateStreet(GROVE), false);
    assert.equal(isPrivateStreet(ROOM_15_TSID), false, 'Room 15 declares no instance');
    assert.equal(isPrivateStreet(''), false);
  });

  it('takes a rebuilt room in from its own instance row', () => {
    const rooms = [{ tsid: 'GTESTROOM', label: 'Test Room', instance: { maxMembers: 1 } }, { tsid: 'GTESTHALL', label: 'Hall', instance: { maxMembers: 4 } }];
    const dir = existsSync(LOCATION_XML) ? LOCATION_XML : join(spike, 'tests');
    const rows = collectPrivateStreets({ xmlDir: dir, rooms });
    assert.ok(rows.some((r) => r.tsid === 'GTESTROOM' && r.from === 'rebuilt room'));
    assert.ok(!rows.some((r) => r.tsid === 'GTESTHALL'));
  });
});

describe('one rule for the shared street (js/shared-street.js)', () => {
  it('shares a public street and never a place Glitch kept to one player', () => {
    assert.equal(publicStreet(engineOn(GROVE)), GROVE);
    assert.equal(publicStreet(engineOn(SURVEYORS_STROLL)), '');
    assert.equal(publicStreet(engineOn(ORANGIAN)), '');
    assert.equal(publicStreet(engineOn(ROOM_23_TSID)), '');
    assert.equal(publicStreet(engineOn(GROVE, { transientInstance: () => true })), '');
    assert.equal(publicStreet(engineOn(GROVE, { homeContext: () => ({ inHome: true }) })), '');
  });

  it('realtime-feature sharedStreet joins no presence there (no one else appears)', () => {
    assert.equal(sharedStreet(engineOn(GROVE)), GROVE);
    assert.equal(sharedStreet(engineOn(ALAKOL_START)), '');
    assert.equal(sharedStreet(engineOn(ROOM_16_TSID)), '');
    // A scene some players share still wins (a race's own street).
    assert.equal(sharedStreet(engineOn(SURVEYORS_STROLL, { query: (h) => (h === 'realtimeStreet' ? 'RACE_00000000000000A1' : null) })), 'RACE_00000000000000A1');
  });

  it('keeps the quoins of a private street local in multiplayer', () => {
    const client = { state: 'online', street: '', me: { id: 1 }, sent: [], on: () => () => {}, send(kind) { this.sent.push(kind); return true; } };
    const mpEngine = (tsid, quoin) => engineOn(tsid, {
      mode: 'multiplayer',
      started: true,
      quoins: [quoin],
      data: {},
      setData(k, v) { this.data[k] = String(v); },
      query: (h) => (h === 'realtimeClient' ? client : null),
    });
    // On a public street the quoins wait for the server's layout.
    const shared = { x: 1, y: 1, naturalQuoinIndex: 0, visible: true };
    sharedQuoinsFeature.onStreetEnter({}, mpEngine(GROVE, shared));
    assert.equal(shared.visible, false, 'a public street hides its quoins until the sync');
    const quoin = { x: 1, y: 1, naturalQuoinIndex: 0, visible: true };
    const engine = mpEngine(SURVEYORS_STROLL, quoin);
    sharedQuoinsFeature.onStreetEnter({}, engine);
    sharedQuoinsFeature.onTick(16, 0, engine);
    assert.equal(quoin.visible, true, 'not hidden waiting for the server');
    assert.equal(sharedQuoinsFeature.quoinTouched(quoin, engine), null, 'grabbed by the solo rules');
    assert.notEqual(sharedQuoinsFeature.quoinsShared(engine), true);
    assert.deepEqual(client.sent, []);
  });

  it('is the one copy the three realtime features use', () => {
    for (const file of ['features/realtime-feature.js', 'features/shared-quoins-feature.js', 'features/rook-attack-feature.js']) {
      const src = readFileSync(join(spike, 'public/js', file), 'utf8');
      assert.match(src, /return publicStreet\(engine\);/, file);
    }
  });
});
