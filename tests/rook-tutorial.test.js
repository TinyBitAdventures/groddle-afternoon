/**
 * Live report #9 (2026-10-30): a Rook attacked Gentle Island Exit (GA93VBH3H3D38HF), the last
 * street of the new-player island, online, with no way to fend it off. The 2012 server never sent
 * the Rook to a hidden street (locations/inc_rook.js isRookable 20), and is_hidden hid three whole
 * hubs (locations/location.js 2807): 129 Gentle Island, 132 the first skills' practice streets and
 * 81 the game and race clones. Solo (rook-attack-feature's schedule) and online (the realtime
 * server's data/rook.json, built by tools/build-realtime-rook.mjs) now skip them.
 * Run: node --test tests/rook-tutorial.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOK_HIDDEN_HUBS, streetIsRookable } from '../public/js/rook-attack.js?v=g479-2';
import { GENTLE_ISLAND_TSIDS } from '../public/js/newxp.js';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '../public');
const gsjsDir = path.join(here, '../../glitch-GameServerJS');
const haveGsjs = fs.existsSync(gsjsDir);
const index = JSON.parse(fs.readFileSync(path.join(pub, 'assets/streets/index.json'), 'utf8')).streets;

describe('report #9: no Rook on new-player and practice streets', () => {
  it('the source: hidden streets are never rookable, and three hubs are hidden', { skip: !haveGsjs }, () => {
    const rook = fs.readFileSync(path.join(gsjsDir, 'locations/inc_rook.js'), 'utf8');
    assert.match(rook, /function isRookable\(\) \{\n\tif\(this\.pols_is_pol\(\) \|\| this\.isInstance\(\) \|\| this\.instances_instance_me\(\) \|\| this\.is_hidden\(\) \|\| this\.no_rook \|\| this\.is_game \|\| this\.is_party_space\) \{\n\t\treturn false;/);
    const loc = fs.readFileSync(path.join(gsjsDir, 'locations/location.js'), 'utf8');
    assert.match(loc, /if \(this\.hubid == 129 \|\| this\.hubid == 132 \|\| this\.hubid == 81\) return true;/);
    // The attack group only ever picks a rookable street of its hub (groups/rook_attack.js newLocation).
    const group = fs.readFileSync(path.join(gsjsDir, 'groups/rook_attack.js'), 'utf8');
    assert.match(group, /if\(!loc \|\| !loc\.isRookable\(\) \|\| loc\.isRooked\(\) \|\| loc\.tsid == this\.last_location\)/);
    assert.deepEqual([...ROOK_HIDDEN_HUBS], ['129', '132', '81']);
  });

  it('a shrine street in a hidden hub is not rookable; elsewhere the old rule stands', () => {
    for (const hubId of ['129', '132', '81', 129]) assert.equal(streetIsRookable({ hasShrine: true, hubId }), false, `hub ${hubId}`);
    assert.equal(streetIsRookable({ hasShrine: true, hubId: '27' }), true);
    assert.equal(streetIsRookable({ hasShrine: true }), true);
    assert.equal(streetIsRookable({ hasShrine: true, hubId: '27', instance: true }), false);
    assert.equal(streetIsRookable({ hasShrine: false, hubId: '27' }), false);
  });

  it('every Gentle Island street, the reported Exit among them, sits in a hidden hub', () => {
    assert.ok(GENTLE_ISLAND_TSIDS.includes('GA93VBH3H3D38HF'));
    for (const tsid of GENTLE_ISLAND_TSIDS) {
      assert.equal(String(index[tsid]?.hubId), '129', tsid);
      assert.equal(streetIsRookable({ hasShrine: true, hubId: index[tsid].hubId }), false, tsid);
    }
  });

  it('solo passes the street hub to the rule; the server data builder applies it', () => {
    const feature = fs.readFileSync(path.join(pub, 'js/features/rook-attack-feature.js'), 'utf8');
    assert.match(feature, /streetIsRookable\(\{ hasShrine: hasShrine\(engine\), instance: engine\.transientInstance\(\), home: engine\.homeContext\(\)\.inHome, hubId: engine\.street\?\.hubId \}\)/);
    const tool = fs.readFileSync(path.join(here, '../tools/build-realtime-rook.mjs'), 'utf8');
    assert.match(tool, /if \(!streetIsRookable\(\{ hasShrine: true, hubId \}\)\) continue;/);
    // The rooms the game keeps empty (rebuilt rooms, Winter Walk) get the game's own ecology there: no shrine, no Rook.
    assert.match(tool, /const override = rebuiltRoomEcology\(tsid\) \|\| winterStreetEcology\(tsid\);/);
  });

  it('online: the realtime server has no Rook street in a hidden hub', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(fs.readFileSync(serverPath('data/rook.json'), 'utf8'));
    const hidden = Object.entries(data.streets).filter(([, row]) => ROOK_HIDDEN_HUBS.includes(String(row[0])));
    assert.deepEqual(hidden.map(([tsid]) => tsid), []);
    assert.equal(data.streets.GA93VBH3H3D38HF, undefined);
    for (const tsid of ['GIFH2AKJ5I735SV', 'GIFNNTRK1073PQ6', 'GA9RLGSQ05F3Q69']) assert.equal(data.streets[tsid], undefined, tsid);
  });
});
