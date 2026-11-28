/**
 * #770: a new player left Gentle Island before Progress Way and was stuck on a tutorial step nothing
 * in Ur can finish. Every trip home (game.js teleportHome: the Home panel's Teleport home, the Map,
 * /home, /house, /tower) skipped the tutorial's travel gate, so a player could go home from the
 * island in its first step. Glitch ignored /home, /house, /tower and /leave until the intro was done
 * unless the island's go-home step had opened the way (main.js doChatCommand 1873-1903,
 * newbie_island.js openImagination 493 newxp_allow_home), and hid home street visiting on the
 * island (newbie_island.js hideUIOnLoad 255).
 * Run: node --test tests/newxp-home-trip-770.test.js
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENTLE_ISLAND, HOME_TRIP_REFUSED, ISLAND_STEPS, homeTripOpen } from '../public/js/newxp.js?v=abbf0ed6';
import { __newxpTest, newxpFeature } from '../public/js/features/newxp-feature.js?v=17e1d76c';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';
import { FEATURES } from '../public/js/features/index.js?v=9d4c0283';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const engineOn = (streetTsid) => ({ streetTsid, inScene: () => false, mode: 'multiplayer' });
const REFUSED = { ok: false, msg: HOME_TRIP_REFUSED };

describe('#770 no trip home before the tutorial sends you there', () => {
  afterEach(() => { __newxpTest.save = { status: 'off' }; });

  it('the rule: closed through the island\'s bag quest, open from its go-home step, open with no tutorial', () => {
    for (const island of ['arrive', 'quest_given', 'bags_done']) assert.equal(homeTripOpen({ status: 'active', stage: 'island', island }), false, island);
    for (const island of ['go_home', 'home_done', 'leaving', 'exited']) assert.equal(homeTripOpen({ status: 'active', stage: 'island', island }), true, island);
    for (const stage of ['clouds', 'training1', 'training2', 'house', 'skill']) assert.equal(homeTripOpen({ status: 'active', stage, island: 'arrive' }), false, stage);
    for (const status of ['done', 'skipped', 'off']) assert.equal(homeTripOpen({ status, stage: 'island', island: 'arrive' }), true, status);
    assert.ok(ISLAND_STEPS.indexOf('bags_done') < ISLAND_STEPS.indexOf('go_home'));
    assert.doesNotMatch(HOME_TRIP_REFUSED, /—/);
  });

  it('on Gentle Island in its first step the trip home the game asks about is refused, with a plain line', () => {
    __newxpTest.save = { status: 'active', stage: 'island', island: 'arrive' };
    const engine = engineOn(GENTLE_ISLAND.surveyors_stroll);
    assert.deepEqual(newxpFeature.homeTripGate(engine), REFUSED);
    // Through the real host, as game.js teleportHome asks it.
    assert.deepEqual(createFeatureHost(FEATURES).query('homeTripGate', engine), REFUSED);
    // The Home Street Ticket's trip (travelGate via 'home') says the same.
    assert.deepEqual(newxpFeature.travelGate('RH_HOME_EXT', engine, { via: 'home' }), REFUSED);
  });

  it('the go-home step, and after the tutorial, the trip home is the player\'s', () => {
    __newxpTest.save = { status: 'active', stage: 'island', island: 'go_home' };
    assert.equal(newxpFeature.homeTripGate(engineOn(GENTLE_ISLAND.surveyors_stroll)), null);
    assert.equal(newxpFeature.travelGate('RH_HOME_EXT', engineOn(GENTLE_ISLAND.surveyors_stroll), { via: 'home' }), null);
    __newxpTest.save = { status: 'done', stage: 'done', island: 'exited' };
    assert.equal(createFeatureHost(FEATURES).query('homeTripGate', engineOn('LA5101HF7F429V5')), null);
  });

  it('game.js teleportHome asks the gate before it travels (every trip home goes through it)', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    const start = game.indexOf('async function teleportHome(');
    const body = game.slice(start, game.indexOf('\n}\n', start));
    const gate = body.indexOf("features.query('homeTripGate', engine)");
    assert.ok(gate > 0, 'teleportHome asks homeTripGate');
    assert.ok(gate < body.indexOf('beginHomeVisit('), 'before the visit begins');
    assert.match(body, /reason: 'tutorial'/);
    // The Home panel, the Map, the ticket and the slash commands all travel by teleportHome.
    assert.match(game, /homeTravel\(action\) \{\n\s+if \(action === 'teleport' \|\| action === 'teleport-inside'\) return teleportHome\(/);
  });

  it('cites main.js and newbie_island.js', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const main = readFileSync(join(gsjs, 'main.js'), 'utf8').split('\n');
    assert.match(main[1872], /words\[0\] == '\/home' \|\| words\[0\] == '\/house'/);
    assert.match(main[1873], /!pc\.has_done_intro && !pc\.newxp_allow_home/);
    const island = readFileSync(join(gsjs, 'locations/newbie_island.js'), 'utf8').split('\n');
    assert.match(island[492], /pc\.newxp_allow_home = true/);
  });
});
