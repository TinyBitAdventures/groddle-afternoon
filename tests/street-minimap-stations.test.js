/**
 * #463 (a player's request Austin approved 2026-11-19): a street's subway entrance shows on the street
 * map like a signpost, and the phone street map lists it under the map with the signposts, a tap walks
 * there. The remake's own: Glitch's minimap showed only signposts (MiniMapView.as maybeAddSignpost),
 * so it is in the inventions register (tools/inventions/inventions.json minimap-subway-stations).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATION_MARK, markHasMenu, stationMarks, tipFor } from '../public/js/ui/street-minimap.js?v=faab9586';
import { phoneSignRows } from '../public/js/features/street-minimap-feature.js?v=b57b3ccb';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=bb31219d';
import { STATIONS } from '../public/js/subway.js?v=ea6921ff';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const streetJson = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));

describe('subway entrances on the street map (#463)', () => {
  it('the subway feature names each surface entrance\'s station, on every one of the 12 streets', () => {
    for (const station of STATIONS) {
      const street = streetJson(station.surfaceStreetTsid);
      subwayFeature.prepareStreet(street);
      const marks = stationMarks(street);
      assert.equal(marks.length, 1, `${street.label}: one entrance`);
      assert.equal(marks[0].tip, station.label);
      assert.equal(marks[0].kind, 'station');
      // Doors are in street space already (bottom-centre), as the doors feature draws them.
      const door = street.doors.find((d) => d.subwayStation);
      assert.deepEqual([marks[0].x, marks[0].y], [door.x, door.y]);
    }
  });

  it('a street prepared again (its doors already linked) keeps its entrance\'s name', () => {
    const street = streetJson(STATIONS.find((s) => s.name === 'Somewhat Sump').surfaceStreetTsid);
    subwayFeature.prepareStreet(street);
    for (const d of street.doors) delete d.subwayStation;
    subwayFeature.prepareStreet(street);
    assert.deepEqual(stationMarks(street).map((m) => m.tip), ['Somewhat Sump Subway Station']);
  });

  it('only named, shown doors: a house door or a hidden entrance is no station', () => {
    const street = { bounds: { l: -3000, r: 3000, t: -1000, b: 0 }, doors: [
      { id: 'door_1', x: 300, y: 900, subwayStation: 'Kongu Hop Subway Station' },
      { id: 'door_2', x: 900, y: 900 },
      { id: 'door_3', x: 1200, y: 900, hidden: true, subwayStation: 'Hidden Station' },
    ] };
    assert.deepEqual(stationMarks(street), [{ kind: 'station', id: 'station:door_1', x: 300, y: 900, tip: 'Kongu Hop Subway Station' }]);
    assert.deepEqual(stationMarks({}), []);
  });

  it('its tip is the station\'s name; it walks on a click and opens no menu', () => {
    const [m] = stationMarks({ doors: [{ id: 'd', x: 1, y: 2, subwayStation: 'Onto Parada Subway Station' }] });
    assert.equal(tipFor(m), 'Onto Parada Subway Station');
    assert.equal(markHasMenu(m), false);
    assert.ok(STATION_MARK.w > 0 && STATION_MARK.h > 0);
  });

  it('the corner map draws it as a button with the hub map\'s subway icon, sized in CSS', () => {
    const view = read('public/js/ui/street-minimap.js');
    assert.match(view, /for \(const mark of stationMarks\(street\)\) addSign\(mark\)|const stations = stationMarks\(street\);\s*for \(const mark of stations\) addSign\(mark\);/);
    // SHARP MARKS (tests/street-minimap-hd.test.js): the icon through markArt, its trace where it is scaled up.
    assert.match(view, /el\.dataset\.art = kind === 'sign' \? 'teensy_signpost' : kind === 'station' \? 'map_icon_subway' : doorArtName\(look\);[\s\S]{0,120}el\.innerHTML = el\.artHtml = markArt\(el\.dataset\.art, artOpts\(\)\);/);
    assert.match(read('public/style.css'), /\.street-minimap \.smm-sign\.smm-station \{ width: calc\(12px \* var\(--mm-u\)\); height: calc\(12px \* var\(--mm-u\)\); \}/);
  });

  it('the phone sheet lists it with the signposts, left to right, and a tap walks to it', () => {
    const rows = phoneSignRows([
      { kind: 'sign', id: 'a', x: 100, y: 0, tip: 'Peatland Moors' },
      { kind: 'station', id: 'station:door_1', x: 3273, y: 888, tip: 'Somewhat Sump Subway Station' },
      { kind: 'station', id: 'station:x', x: 5000, y: 0, tip: '' },
    ], 1000);
    assert.deepEqual(rows.map((r) => [r.kind, r.side, r.text]), [
      ['sign', 'left', 'Peatland Moors'],
      ['station', 'right', 'Somewhat Sump Subway Station'],
      ['station', 'right', 'Subway station'],
    ]);
    const feature = read('public/js/features/street-minimap-feature.js');
    assert.match(feature, /\.\.\.stationMarks\(engine\.street\), \.\.\.doorMarks\(engine\.street\)/);
    assert.match(feature, /walkFromMap\(engine, \{ kind: row\.kind, id: row\.id, x: row\.x, y: row\.y \}/);
    assert.match(feature, /markArt\(row\.kind === 'door' \? doorArtName\(row\.look\) : row\.kind === 'station' \? 'map_icon_subway' : 'teensy_signpost', withDoorArt\(\{ artUrl: classicArtUrl, artHd: classicArtHd, crisp: true \}\)\)/);
  });

  it('is registered as an invention', () => {
    const reg = JSON.parse(read('tools/inventions/inventions.json'));
    const e = reg.entries.find((x) => x.id === 'minimap-subway-stations');
    assert.ok(e, 'the inventions register lists it');
    assert.equal(e.kind, 'UI');
    assert.ok(e.where.some((w) => w.file === 'public/js/ui/street-minimap.js'));
  });
});
