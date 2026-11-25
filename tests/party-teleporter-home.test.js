/**
 * G901 (chat 11-16): a party invite accepted at home said the teleporter would not work from your
 * house. Glitch made the party teleporter wherever the player stood, with no location check
 * (GSJS players/inc_party.js party_space_prompt_callback, party_create_teleporter), and remembered
 * the way back from a house (players/inc_instances.js instances_enter). Your home and a home you are
 * visiting now allow it; the remake's one-trip instances (quest rooms, races) still refuse.
 * Run: node --test tests/party-teleporter-home.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partySpacesFeature, partyTeleporterSpot } from '../public/js/features/party-spaces-feature.js?v=d8ae6db7';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const src = readFileSync(join(ROOT, 'public/js/features/party-spaces-feature.js'), 'utf8');

function engineAt({ streetTsid = 'GA5101HF7F429V5', inHome = false, inScene = false, transient = false } = {}) {
  return {
    streetTsid,
    transientInstance: () => transient,
    homeContext: () => ({ inHome }),
    inScene: () => inScene,
    streetExists: () => true,
    travelGate: () => null,
    param: () => null,
  };
}

describe('G901: the party teleporter at home', () => {
  it('partyTeleporterSpot: home, a visited home and a street allow it; a one-trip instance does not', () => {
    assert.equal(partyTeleporterSpot({ inHome: true }), 'home');
    assert.equal(partyTeleporterSpot({ visit: true, transient: true }), 'visit');
    assert.equal(partyTeleporterSpot({}), 'world');
    assert.equal(partyTeleporterSpot({ transient: true }), '');
  });

  it('a Party Pack activates in your home and in a home you visit, not in a quest room', () => {
    partySpacesFeature.restore({});
    const verb = (engine) => partySpacesFeature.packVerbs('party_pack_taster_aquarius', engine)[0];
    assert.equal(verb(engineAt({ streetTsid: 'HOME_STREET', inHome: true })).enabled, true, 'own home street');
    assert.equal(verb(engineAt({ streetTsid: 'MPH_42', inScene: true, transient: true })).enabled, true, 'another player\'s home street');
    assert.equal(verb(engineAt({ streetTsid: 'MPH_42_IN', inScene: true, transient: true })).enabled, true, 'another player\'s house');
    const room = verb(engineAt({ streetTsid: 'QI_SOME_ROOM', inScene: true, transient: true }));
    assert.equal(room.enabled, false);
    assert.equal(room.reason, "You can't start a party from here.");
  });

  it('the invite\'s teleporter, the Map card and the pack share the one rule', () => {
    assert.equal(src.match(/homeContext\?\.\(\)\.inHome/g).length, 1, 'only teleporterSpot reads the home');
    const rejoin = src.slice(src.indexOf('function rejoin('), src.indexOf('function spawnTeleporter('));
    assert.match(rejoin, /if \(!teleporterSpot\(engine\)\) \{\s*engine\.toast\("You can't make a party teleporter from here\."\)/);
    const card = src.slice(src.indexOf('function buildMapCard('), src.indexOf('export function partyTeleporterSpot'));
    assert.match(card, /const blocked = !teleporterSpot\(engine\);/);
  });

  it('from a visited home the way back is where its way out leads', () => {
    const enter = src.slice(src.indexOf('async function enterParty('), src.indexOf('async function leaveParty('));
    assert.match(enter, /const visit = teleporterSpot\(engine\) === 'visit';/);
    assert.match(enter, /const out = trip\?\.tsid \? trip : visit \? engine\.sceneReturnTo : null;/);
  });

  it('Glitch checked no location before making the teleporter', { skip: !existsSync(GSJS) && 'no GSJS checkout' }, () => {
    const party = readFileSync(join(GSJS, 'players/inc_party.js'), 'utf8');
    const make = party.slice(party.indexOf('function party_create_teleporter('), party.indexOf('function party_find_teleporter('));
    assert.match(make, /this\.location\.createAndReturnItem\('teleporter_visible'/);
    assert.doesNotMatch(make, /pols_|is_instance|is_home/);
    const inst = readFileSync(join(GSJS, 'players/inc_instances.js'), 'utf8');
    assert.match(inst, /this\.location\.pols_is_pol\(\) && !this\.location\.pols_is_owner\(this\)[\s\S]{0,120}pols_get_entrance_outside/);
  });
});
