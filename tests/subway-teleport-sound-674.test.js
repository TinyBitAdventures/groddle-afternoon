/**
 * #674: a Subway ticket played the coin sound and then the signpost whoosh, and every station
 * played the downloads-page "subway" stand-ins.
 *
 * Glitch: the Red Button took the fare (locations/inc_transit.js 71 PAY_50_CURRANTS) and moved
 * you into the car with instances_enter (inc_transit.js 176), a teleportToLocation
 * (players/inc_instances.js 89-104), which played TELEPORT_AWAY_HUB because the car's hub (66)
 * is never the station's (players/player.js 674-678). Getting off was a teleport too
 * (transit_disembark_callback, teleportToLocationDelayed), and so were a Party Space's way in and
 * out (groups/party.js 725, instances_exit). TELEPORT_AWAY_HUB now plays teleport.mp3, Tiny
 * Speck's own file from the server's sound folder (Sounds.zip).
 *
 * The stations' own music_file, SUBWAY_STATION_HUM (location.js 481-482), is lost; the 2012
 * client played the region's set there (NetController.as 1843-1849, main.js ambient_hub_map), so
 * a station resolves to its hub's music. The train stays hum-only (Austin, 2026-11-25).
 * Run: node --test tests/subway-teleport-sound-674.test.js
 */
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tripSound } from '../public/js/street-trip.js?v=04c3258c';
import { SILENT_THEME, resolveAmbientTheme, setAmbientMusicConfig } from '../public/js/ambient-music.js?v=4b3c6041';
import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js?v=8b36c250';
import { CAR_TSID, FARE, STATIONS, carStreet, stationStreet } from '../public/js/subway.js?v=ea6921ff';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=23574807';
import { FakeEl, page } from './social-fake-dom.js';

FakeEl.prototype.appendChild ||= function appendChild(k) {
  this.append(k);
  return k;
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const index = JSON.parse(read('public/assets/streets/index.json'));
const music = JSON.parse(read('public/assets/content/ambient-music.json'));
setAmbientMusicConfig(music);
const hubOf = (tsid) => index.streets[tsid]?.hubId || '';

/** A fake engine: playSound and the trip's opening sound (game.js streetTripTo, through tripSound) in order. */
function ticketEngine(at) {
  const sounds = [];
  const data = {};
  const engine = {
    started: true,
    mode: 'solo',
    streetTsid: at,
    pc: { currants: 200 },
    inv: [],
    sounds,
    data,
    setData: (k, v) => { data[k] = v; },
    save() {},
    updateHud() {},
    toast() {},
    pushActivity() {},
    param: () => null,
    query: () => null,
    travelGate: () => ({ ok: true }),
    playSound: (key) => sounds.push(key),
    playSoundLoop: () => ({ stop() {} }),
    async enter(tsid, opts = {}) {
      sounds.push(tripSound({ teleport: opts.teleport, fromHubId: hubOf(engine.streetTsid), toHubId: hubOf(tsid) }));
      engine.streetTsid = tsid;
      return true;
    },
  };
  return engine;
}

let doc = null;
let savedDocument;
let savedWindow;
beforeEach(() => {
  savedDocument = globalThis.document;
  savedWindow = globalThis.window;
  doc = page().doc;
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
});
afterEach(() => {
  globalThis.document = savedDocument;
  globalThis.window = savedWindow;
  subwayFeature._test.setRide(null, { state: { inCar: false }, pendingBoard: null });
});

describe('#674: a ticket teleports you into the car', () => {
  it('tripSound: a teleport into another hub is TELEPORT_AWAY_HUB, the same hub TELEPORT_AWAY, a walk the whoosh', () => {
    assert.equal(tripSound({ teleport: true, fromHubId: '93', toHubId: '66' }), 'TELEPORT_AWAY_HUB');
    assert.equal(tripSound({ teleport: true, fromHubId: 93, toHubId: '93' }), 'TELEPORT_AWAY');
    assert.equal(tripSound({ teleport: true, fromHubId: '', toHubId: '66' }), 'TELEPORT_AWAY');
    assert.equal(tripSound({ teleport: false, fromHubId: '93', toHubId: '66' }), 'SIGNPOST_TRAVEL');
    assert.equal(tripSound(), 'SIGNPOST_TRAVEL');
  });

  it('buying a ticket at Thiruvan Thrive plays PAY_50_CURRANTS, then TELEPORT_AWAY_HUB into the car', async () => {
    const thiruvan = STATIONS.find((s) => s.name === 'Thiruvan Thrive');
    const engine = ticketEngine(thiruvan.streetTsid);
    assert.equal(subwayFeature._test.buyTicket(engine, thiruvan, 'forwards'), true);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.streetTsid, CAR_TSID);
    assert.equal(engine.pc.currants, 200 - FARE);
    assert.deepEqual(engine.sounds.slice(0, 2), ['PAY_50_CURRANTS', 'TELEPORT_AWAY_HUB']);
    assert.ok(!engine.sounds.includes('SIGNPOST_TRAVEL'), 'no signpost whoosh on a ticket');
  });

  it('every station is in another hub than the car, so every boarding and every stop plays TELEPORT_AWAY_HUB', () => {
    assert.equal(String(carStreet().hubId), '66');
    for (const s of STATIONS) {
      assert.notEqual(String(stationStreet(s).hubId), '66', s.name);
      assert.equal(tripSound({ teleport: true, fromHubId: hubOf(s.streetTsid), toHubId: hubOf(CAR_TSID) }), 'TELEPORT_AWAY_HUB', s.name);
      assert.equal(tripSound({ teleport: true, fromHubId: hubOf(CAR_TSID), toHubId: hubOf(s.streetTsid) }), 'TELEPORT_AWAY_HUB', s.name);
    }
  });

  it('the source: game.js picks the trip sound with tripSound; the car, Get off and the Party Space go by teleport', () => {
    const game = read('public/game.js');
    assert.match(game, /playSound\(tripSound\(\{ teleport: opts\.teleport, fromHubId: currentStreet\?\.hubId, toHubId: hubId \}\)/);
    assert.doesNotMatch(game, /opts\.teleport \? 'TELEPORT_AWAY' : 'SIGNPOST_TRAVEL'/);
    const sub = read('public/js/features/subway-feature.js');
    assert.match(sub, /engine\.enter\(CAR_TSID, \{ spawnX: spot\.x, spawnY: spot\.y, teleport: true \}\)/);
    assert.match(sub, /engine\.enter\(station\.streetTsid, \{ spawnX: spot\.x, spawnY: spot\.y, teleport: true \}\)/);
    const party = read('public/js/features/party-spaces-feature.js');
    assert.match(party, /engine\.enter\(s\.streetTsid, \{ spawnX: arrive\.x, spawnY: arrive\.y, bypassFeatureGates: true, teleport: true \}\)/);
    assert.match(party, /engine\.enter\(back\.tsid, \{ spawnX: back\.x, spawnY: back\.y, bypassFeatureGates: true, teleport: true \}\)/);
  });

  it('TELEPORT_AWAY_HUB plays its own file, teleport.mp3 from the server sound folder, not the rejected beam-up take', () => {
    assert.equal(SOUND_ALIASES.TELEPORT_AWAY_HUB, undefined);
    assert.equal(SOUND_FILES.TELEPORT_AWAY_HUB, 'assets/audio/sfx/TELEPORT_AWAY_HUB.mp3');
    const md5 = createHash('md5').update(readFileSync(join(root, 'public', SOUND_FILES.TELEPORT_AWAY_HUB))).digest('hex');
    assert.equal(md5, '4050932e0cefa99307d1566b46b7b5be');
    const catalog = JSON.parse(read('public/assets/content/sound-keys.json')).keys;
    assert.equal(catalog.TELEPORT_AWAY_HUB.origin, 'sounds-zip');
    assert.equal(catalog.TELEPORT_AWAY_HUB.zipFile, 'teleport.mp3');
  });
});

describe('#674: a station plays its region\'s music; the train stays hum-only', () => {
  it('every station resolves to its hub\'s music (main.js ambient_hub_map), never the subway stand-ins', () => {
    assert.equal(music.streetMusic.SUBWAY_STATION_HUM, undefined);
    for (const s of STATIONS) {
      const street = stationStreet(s);
      assert.equal(street.musicFile, 'SUBWAY_STATION_HUM', s.name);
      const want = music.hubMap[String(street.hubId)] || music.defaultTheme;
      assert.equal(resolveAmbientTheme(street), want, s.name);
      assert.notEqual(resolveAmbientTheme(street), 'subway', s.name);
    }
    const by = (name) => resolveAmbientTheme(stationStreet(STATIONS.find((s) => s.name === name)));
    assert.equal(by('Thiruvan Thrive'), 'highlands');
    assert.equal(by('Torpan Cleft'), 'highlands');
    assert.equal(by('Somewhat Sump'), 'firebog');
    assert.equal(by('Groddle Forest Junction'), music.defaultTheme);
  });

  it('the train keeps its silence, with the ruling noted', () => {
    assert.equal(music.streetMusic.SUBWAY_CAR_HUM, SILENT_THEME);
    assert.equal(resolveAmbientTheme(carStreet()), SILENT_THEME);
    assert.match(music.streetMusicNotes.SUBWAY_CAR_HUM, /2026-11-25/);
  });
});
