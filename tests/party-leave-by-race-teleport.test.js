/**
 * Race tickets and teleports work inside a Party Space, as in Glitch. The remake counted the
 * party's hold as a held instance, so a Race Ticket said "You cannot start a race from here." and a
 * Teleportation Script or Map teleport said "This place has its own way out", and the party's
 * travel gate refused every way out but its signpost. Glitch had no such check: race_ticket.js
 * 116-122 refuses only a player already in a game, teleportation_can_teleport
 * (players/inc_teleportation.js 126-285) never looks at where you stand (777 refuses only a summons
 * from a party space), and teleportation_teleport 362-366 leaves the instance you are in.
 *
 * The way back: a race started in a party leads back into it (the race's way back is the party
 * street). If the party ends meanwhile, Glitch swapped in the party's own way back
 * (players/inc_instances.js 140-175 instances_left), so the race ends on the street the party was
 * entered from: here the expired party keeps that street as `wayBack` and its street sends you on.
 * A party teleporter taken in that race (G904) keeps the party's way back too (instances_enter
 * 96-99 keeps `previously` for a member coming back in).
 * Run: node --test tests/party-leave-by-race-teleport.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PARTY_SPACES, startParty } from '../public/js/party-spaces.js?v=4e1ca2a5';
import { partySpacesFeature } from '../public/js/features/party-spaces-feature.js?v=22cdaca0';
import { racesFeature } from '../public/js/features/races-feature.js?v=1f05692d';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MOON = PARTY_SPACES.moon.streetTsid;
const RAINBOW = PARTY_SPACES.rainbow.streetTsid;
const FROM = { tsid: 'GLI32G3NUTD100I', label: 'Somewhere', x: 1234, y: -89 };
const TARGET = { tsid: 'GCR10NQRPKJ16H6', x: 300, y: -90, label: 'Sylvan Grove', hubId: '58', hubName: 'Groddle Forest' };
const NO_EXIT = 'This place has its own way out. Teleporting will have to wait.';
const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** A live party, entered from FROM, with you inside. */
function liveParty(now = Date.now()) {
  const party = startParty(null, 'party_pack_toxic_moon', { now }).party;
  party.inside = true;
  party.returnTo = { ...FROM };
  partySpacesFeature.restore(JSON.parse(JSON.stringify({ instructionsRead: true, party })));
  return party;
}

function partyEngine(over = {}) {
  const log = { entered: [], toasts: [] };
  return {
    log,
    mode: 'solo',
    streetTsid: MOON,
    instanceHold: 'party',
    inScene: () => false,
    transientInstance() { return Boolean(this.instanceHold) || this.inScene(); },
    homeContext: () => ({ inHome: false }),
    param: () => null,
    setData() {},
    toast: (t) => log.toasts.push(t),
    pushActivity() {},
    save() {},
    enter: async (tsid, opts) => { log.entered.push([tsid, opts]); },
    ...over,
  };
}

describe('the party answers whether its own hold is all that holds you', () => {
  it('partyHoldHere: on the party street under its hold, not elsewhere or in a scene', () => {
    liveParty();
    assert.equal(partySpacesFeature.partyHoldHere(partyEngine()), true);
    assert.equal(partySpacesFeature.partyHoldHere(partyEngine({ instanceHold: null })), false);
    assert.equal(partySpacesFeature.partyHoldHere(partyEngine({ instanceHold: 'quest-instances' })), false);
    assert.equal(partySpacesFeature.partyHoldHere(partyEngine({ streetTsid: FROM.tsid })), false);
    assert.equal(partySpacesFeature.partyHoldHere(partyEngine({ inScene: () => true })), false);
    partySpacesFeature.restore({});
  });

  it('its travel gate lets a teleport or a race go; the map and a teleport into a party still refuse', () => {
    liveParty();
    const engine = partyEngine();
    assert.equal(partySpacesFeature.travelGate(TARGET.tsid, engine, { via: 'teleport' }), null);
    assert.equal(partySpacesFeature.travelGate('RACE_SCENE', engine, { via: 'race' }), null);
    assert.match(partySpacesFeature.travelGate(TARGET.tsid, engine, {}).msg, /no map routes/);
    assert.equal(partySpacesFeature.travelGate(RAINBOW, engine, { via: 'teleport' }).ok, false, 'party spaces stay private');
    partySpacesFeature.restore({});
  });
});

describe('a Race Ticket inside a Party Space (races-feature)', () => {
  function raceEngine(over = {}) {
    const gates = [];
    return {
      gates,
      mode: 'solo',
      inv: { race_ticket: 1 },
      transientInstance: () => true,
      homeContext: () => ({ inHome: false }),
      travelGate: (tsid, meta) => { gates.push([tsid, meta]); return { ok: true }; },
      query: (hook) => (hook === 'partyHoldHere' ? true : null),
      ...over,
    };
  }

  it('activates in the party, asking the travel gate as a race', () => {
    const engine = raceEngine();
    const [verb] = racesFeature.packVerbs('race_ticket', engine);
    assert.equal(verb.enabled, true, verb.reason);
    assert.deepEqual(engine.gates.at(-1)[1], { via: 'race' });
  });

  it('any other held place still refuses', () => {
    const [verb] = racesFeature.packVerbs('race_ticket', raceEngine({ query: () => null }));
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, 'You cannot start a race from here.');
  });
});

describe('a teleport inside a Party Space (teleportation-feature)', () => {
  function tpEngine(over = {}) {
    const log = { gates: [] };
    return {
      log,
      started: true,
      inv: {},
      toolState: {},
      pc: { energy: 90, mood: 50, xp: 0, imagination: 0 },
      learnedSkills: ['teleportation_1', 'teleportation_2', 'teleportation_3', 'teleportation_4'],
      player: { x: 500, y: 400, vx: 0, vy: 0, onGround: true, height: 96 },
      street: { label: 'Toxic Moon', hubId: '', hubName: '' },
      streetTsid: MOON,
      param: () => null,
      setData() {},
      toast() {},
      pushActivity() {},
      updateHud() {},
      save() {},
      transientInstance: () => true,
      homeContext: () => ({ inHome: false }),
      streetExists: () => true,
      visitedStreets: () => [TARGET.tsid],
      travelGate: (tsid, meta) => { log.gates.push(meta); return { ok: true }; },
      closeMap() {},
      busy: () => false,
      query: (hook) => (hook === 'partyHoldHere' ? true : null),
      ...over,
    };
  }

  it('is not refused as a held place; any other held place still is', async () => {
    const { teleportationFeature: tp } = await import('../public/js/features/teleportation-feature.js?fresh=party-leave-a');
    tp.restore({ targets: { 1: TARGET } });
    const engine = tpEngine();
    assert.notEqual(tp.mapTeleport('check', TARGET, engine).error, NO_EXIT);
    assert.equal(engine.log.gates.at(-1).via, 'teleport');
    assert.equal(tp.mapTeleport('check', TARGET, tpEngine({ query: () => null })).error, NO_EXIT);
  });
});

describe('the way back after a race started in a party', () => {
  it('the party ends during the race: no trip then, and the race\'s return to the party street goes on to its way back', async () => {
    const party = liveParty();
    // In the race scene (enterScene: the party street is not where you stand).
    const race = partyEngine({ streetTsid: 'RACE_SCENE', inScene: () => true });
    partySpacesFeature.onTick(16, party.expiresAt + 1000, race);
    assert.deepEqual(race.log.entered, [], 'nobody is moved out of the race');
    assert.equal(partySpacesFeature.save().party, null, 'the party is over');
    assert.equal(partySpacesFeature.save().wayBack.tsid, FROM.tsid, 'its way back is kept');
    // The race ends: back to the party street (races-feature leaveRace, bypassFeatureGates) ...
    const back = partyEngine({ instanceHold: null });
    partySpacesFeature.onStreetEnter({ tsid: MOON }, back);
    await flush(350);
    // ... which sends you on to the street the party was entered from.
    // #674: a teleport out (teleport only picks the trip's sound): groups/party.js 183 `pc.instances_exit('party_space');`,
    // whose instances_left teleports you (players/inc_instances.js 175 teleportToLocationDelayed; player.js 674-678).
    assert.deepEqual(back.log.entered, [[FROM.tsid, { spawnX: FROM.x, spawnY: FROM.y, bypassFeatureGates: true, teleport: true }]]);
    partySpacesFeature.restore({});
  });

  it('a party teleporter taken in that race keeps the party\'s way back, never the party street', () => {
    const src = read('public/js/features/party-spaces-feature.js');
    const enter = src.slice(src.indexOf('async function enterParty('), src.indexOf('async function leaveParty('));
    assert.match(enter, /const backIntoParty = Boolean\(out\?\.tsid && partySpaceForStreet\(out\.tsid\) && p\.returnTo\);\s*if \(!backIntoParty\) p\.returnTo =/);
  });

  it('Glitch: teleporting leaves the instance; a race from a party swaps in the party\'s way back', { skip: !existsSync(GSJS) && 'no GSJS checkout' }, () => {
    const tp = readFileSync(join(GSJS, 'players/inc_teleportation.js'), 'utf8');
    const can = tp.slice(tp.indexOf('function teleportation_can_teleport('), tp.indexOf('function teleportation_can_set_target('));
    assert.doesNotMatch(can, /party|isInstance/);
    assert.match(tp, /if \(this\.location\.isInstance\(\)\)\{\s*this\.instances_left\(this\.location\.instance_id, false, true\);/);
    const ticket = readFileSync(join(GSJS, 'items/race_ticket.js'), 'utf8');
    assert.doesNotMatch(ticket, /party|isInstance/);
    const inst = readFileSync(join(GSJS, 'players/inc_instances.js'), 'utf8');
    assert.match(inst, /if \(instance\.is_location\(this\.instances\.previously\[i\]\.tsid\)\)\{[\s\S]{0,120}this\.instances\.previously\[i\] = prev;/);
  });
});
