/**
 * The Map opens on the player's own hub every time (HubMapDialog.as start: the current
 * location's hub; moveMoveEnded: it follows the player). A hub picked by hand on the open
 * map holds only while it stays open on the same street. Places off the hub maps (the
 * subway stations and train, instances) mark "you" on the street that stands for them:
 * a stop's surface street, or the last street walked that is drawn on a hub map
 * (mapInfo.showStreet). Austin's report: on Jutuan Central the Map opened on Groddle
 * Forest, with no red star.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_TRAIL_MAX, findCurrentStreet, noteMapTrail, pickMapSpot } from '../public/js/map-graph.js?v=c161229d';
import { CAR_TSID, STATIONS, stationById } from '../public/js/subway.js?v=44d1a09f';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=8d036336';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const readJson = (rel) => JSON.parse(readFileSync(join(pub, rel), 'utf8'));
const mapIndex = readJson('assets/maps/index.json');
const hubStreets = new Map();
const hubHasMap = (id) => Boolean(mapIndex.hubs[id] && (mapIndex.hubs[id].streetCount > 0 || mapIndex.hubs[id].zone));
const streetOnHub = (id, tsid) => {
  if (!hubStreets.has(id)) hubStreets.set(id, readJson(mapIndex.hubs[id].file.replace(/^\//, '')).streets || []);
  return Boolean(findCurrentStreet(tsid, hubStreets.get(id)));
};
const streets = readJson('assets/streets/index.json').streets;
const jutuan = STATIONS.find((s) => s.name === 'Jutuan Central');

describe('The Map opens on the current hub', () => {
  it('picks the current street\'s own hub, whatever was shown before (Jutuan Central is Chakra Phool)', () => {
    const tsid = jutuan.surfaceStreetTsid;
    assert.equal(String(streets[tsid].hubId), '72');
    const trail = [{ tsid: 'GLI3272LOTD1B1F', hubId: '56' }];
    const spot = pickMapSpot([{ tsid, hubId: streets[tsid].hubId }, ...trail], hubHasMap, streetOnHub);
    assert.deepEqual(spot, { tsid, hubId: '72', onMap: true });
  });

  it('marks a subway station or the train on its stop\'s surface street', () => {
    const engine = { streetTsid: jutuan.streetTsid };
    assert.deepEqual(subwayFeature.mapStreet(engine), { tsid: jutuan.surfaceStreetTsid, hubId: jutuan.surfaceHubId });
    // The station's own street is on no hub map; its surface street is.
    const here = { tsid: jutuan.streetTsid, hubId: jutuan.hubId };
    const spot = pickMapSpot([here, subwayFeature.mapStreet(engine)], hubHasMap, streetOnHub);
    assert.equal(spot.hubId, jutuan.surfaceHubId);
    assert.equal(spot.onMap, true);
    // In the train (hub 66, The Seams, which does not draw it): the last stop's street.
    subwayFeature.restore({ stop: jutuan.id, inCar: true });
    const car = { streetTsid: CAR_TSID };
    assert.deepEqual(subwayFeature.mapStreet(car), { tsid: jutuan.surfaceStreetTsid, hubId: '72' });
    const ride = pickMapSpot([{ tsid: CAR_TSID, hubId: '66' }, subwayFeature.mapStreet(car)], hubHasMap, streetOnHub);
    assert.deepEqual(ride, { tsid: jutuan.surfaceStreetTsid, hubId: '72', onMap: true });
    assert.equal(subwayFeature.mapStreet({ streetTsid: 'GLI32G3NUTD100I' }), null);
    // Every stop's surface street is drawn on its hub's map.
    for (const s of STATIONS) assert.ok(streetOnHub(String(s.surfaceHubId), s.surfaceStreetTsid), s.name);
    assert.equal(stationById(jutuan.id), jutuan);
  });

  it('falls back to the street you came from for a place off the hub maps, then Groddle Forest', () => {
    const came = { tsid: jutuan.surfaceStreetTsid, hubId: '72' };
    const instance = { tsid: 'GQUEST_ROOM', hubId: '52' }; // The New Start: no hub map
    assert.deepEqual(pickMapSpot([instance, came], hubHasMap, streetOnHub), { ...came, onMap: true });
    const noHub = { tsid: 'GNOHUB', hubId: '' };
    assert.deepEqual(pickMapSpot([noHub, came], hubHasMap, streetOnHub), { ...came, onMap: true });
    assert.deepEqual(pickMapSpot([noHub], hubHasMap, streetOnHub), { tsid: 'GNOHUB', hubId: '56', onMap: false });
    // A mapped hub that does not draw the street still beats the default.
    assert.deepEqual(pickMapSpot([{ tsid: CAR_TSID, hubId: '66' }], hubHasMap, streetOnHub), { tsid: CAR_TSID, hubId: '66', onMap: false });
  });

  it('keeps a short trail of streets walked, newest last', () => {
    let trail = [];
    trail = noteMapTrail(trail, { tsid: 'GA', hubId: 56 });
    trail = noteMapTrail(trail, { tsid: 'GA', hubId: '56' });
    trail = noteMapTrail(trail, { tsid: 'GB' });
    assert.deepEqual(trail, [{ tsid: 'GA', hubId: '56' }, { tsid: 'GB', hubId: '' }]);
    assert.equal(noteMapTrail(trail, null), trail);
    for (let i = 0; i < 30; i += 1) trail = noteMapTrail(trail, { tsid: `G${i}`, hubId: '56' });
    assert.equal(trail.length, MAP_TRAIL_MAX);
    assert.equal(trail.at(-1).tsid, 'G29');
  });

  it('wires game.js: no remembered hub across opens or streets, the trail on every street', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    const open = game.slice(game.indexOf('async function openMap('), game.indexOf('function openMapStreetMenu'));
    assert.match(open, /if \(!isMapOpen\(\) \|\| mapPanelStreetTsid !== currentStreetTsid\) mapPanelHubId = null;/);
    assert.match(open, /const targetHub = String\(hubId \|\| mapPanelHubId \|\| spot\.hubId\);/);
    assert.match(open, /spot = await playerMapSpot\(/);
    const close = game.slice(game.indexOf('function closeMap()'), game.indexOf('function isMapOpen()'));
    assert.match(close, /mapPanelHubId = null;/);
    assert.match(game, /features\.streetEnter\(data, engine, opts\);\n {2}mapTrail = noteMapTrail\(mapTrail, \{ tsid: data\.tsid, hubId: data\.hubId \}\);/);
    assert.match(game, /features\.query\('mapStreet', engine\)/);
    assert.doesNotMatch(game, /mapPanelHubId \|\| playerHubId\(\)/);
  });
});
