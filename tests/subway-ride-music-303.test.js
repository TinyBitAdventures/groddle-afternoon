/**
 * #303 (G705): every subway ride layered two music tracks: the car's SUBWAY_CAR_HUM mapped to the
 * subway stand-in theme, under the recovered TRAVELLING_TRAIN loop (subway_loop3,
 * locations/inc_transit.js 287). The car's own source file (inc_data_sounds.js 195,
 * hum_caboose_4.mp3) is lost, so the car plays no street music: a ride is the train loop alone,
 * and the station's music comes back on arrival.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SILENT_THEME, resolveAmbientTheme, setAmbientMusicConfig } from '../public/js/ambient-music.js?v=75a5ad20';
import { CAR_MUSIC, STATION_MUSIC, STATIONS, carStreet, stationStreet } from '../public/js/subway.js?v=e6995db8';
import { streetState } from '../tools/sound/sound-model.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const cfg = JSON.parse(read('public/assets/content/ambient-music.json'));
setAmbientMusicConfig(cfg);

describe('#303: a subway ride plays the train loop alone', () => {
  it('the car is quiet (no stand-in under the train loop)', () => {
    // The car keeps its source music_file; the remake maps the lost key to silence.
    assert.equal(CAR_MUSIC, 'SUBWAY_CAR_HUM');
    assert.equal(carStreet().musicFile, 'SUBWAY_CAR_HUM');
    const json = JSON.parse(read(`public/assets/streets/${carStreet().tsid}.json`));
    assert.equal(json.musicFile, 'SUBWAY_CAR_HUM');
    assert.equal(cfg.streetMusic.SUBWAY_CAR_HUM, SILENT_THEME);
    assert.equal(resolveAmbientTheme(carStreet()), SILENT_THEME);
    assert.equal(streetState(cfg, 'SUBWAY_CAR_HUM', carStreet().hubId).status, 'silent', 'the encyclopedia and sound reports agree');
    assert.ok(!cfg.themes.subway.gsjsKeys.includes('TRAVELLING_TRAIN'), 'TRAVELLING_TRAIN plays its own recovered loop');
  });

  it('the station keeps its music, so it returns on arrival', () => {
    const station = stationStreet(STATIONS[0]);
    assert.equal(station.musicFile, STATION_MUSIC);
    assert.equal(resolveAmbientTheme(station), `street:${STATION_MUSIC}`);
  });

  it('the train loop starts on departure and stops at the brakes', () => {
    const feature = read('public/js/features/subway-feature.js');
    assert.match(feature, /ev\.type === 'depart'[\s\S]*?travelLoop = engine\.playSoundLoop\('TRAVELLING_TRAIN'/);
    assert.match(feature, /ev\.type === 'brakes'\) \{\s+stopTravelSound\(\);/);
  });
});
