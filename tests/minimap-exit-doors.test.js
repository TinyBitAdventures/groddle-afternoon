/**
 * G1232 (#645, Austin 2026-11-24: yes, as with the subway buttons): every door or portal out of a
 * place shows on the street map like a subway entrance, with a walk-to row on the phone sheet,
 * unless the door is meant to be hidden. The remake's own (Glitch's minimap showed only
 * signposts, MiniMapView.as maybeAddSignpost): tools/inventions/inventions.json minimap-exit-doors.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENE_DOOR_CLASSES, doorMarks, sceneDoorMarks, stationMarks, tipFor, markHasMenu } from '../public/js/ui/street-minimap.js?v=faab86a5';
import { phoneSignRows } from '../public/js/features/street-minimap-feature.js?v=2162b984';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=50d6e916';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const streetJson = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));

describe('doors out on the street map (G1232, #645)', () => {
  it('Gregarious Grange: Gregarious Towers and the Bureaucratic Hall as doors, its subway entrance as a station', () => {
    const street = streetJson('GLI32G3NUTD100I');
    subwayFeature.prepareStreet(street);
    assert.deepEqual(doorMarks(street).map((m) => [m.kind, m.tip]), [['door', 'Gregarious Towers'], ['door', 'Bureaucratic Hall']]);
    assert.deepEqual(stationMarks(street).map((m) => m.tip), ['Gregarious Grange Subway Station']);
    const hall = street.doors.find((d) => d.connect?.label === 'Bureaucratic Hall');
    const mark = doorMarks(street).find((m) => m.tip === 'Bureaucratic Hall');
    assert.deepEqual([mark.x, mark.y], [hall.x, hall.y], 'street space, as the doors feature draws it');
  });

  it('Teobocci Shasha: the dino to Glutton Greens', () => {
    assert.deepEqual(doorMarks(streetJson('GA5AAB0VNKR2VRN')).map((m) => m.tip), ['Glutton Greens']);
  });

  it('a door meant to be hidden stays off: hidden, or its way out hidden; a door to nowhere too', () => {
    const marks = doorMarks({ doors: [
      { id: 'a', x: 10, y: 20, connect: { label: 'Out' } },
      { id: 'b', x: 30, y: 20, hidden: true, connect: { label: 'Secret' } },
      { id: 'c', x: 50, y: 20, connect: { label: 'Quiet', hidden: true } },
      { id: 'd', x: 70, y: 20 },
      { id: 'e', x: 90, y: 20, destinations: [{ tsid: 'X' }] },
    ] });
    assert.deepEqual(marks, [
      { kind: 'door', id: 'door:a', x: 10, y: 20, tip: 'Out' },
      { kind: 'door', id: 'door:e', x: 90, y: 20, tip: null },
    ]);
    assert.deepEqual(doorMarks({}), []);
  });

  it('the hall\'s glass doors are a door on its map', () => {
    assert.deepEqual([...SCENE_DOOR_CLASSES], ['bureaucratic_hall_exit']);
    const marks = sceneDoorMarks([
      { classId: 'bureaucratic_hall_exit', label: 'Gregarious Grange', sprite: { x: 72.4, y: 572 } },
      { classId: 'npc_bureaucrat', label: 'Assistant', sprite: { x: 1700, y: 538 } },
    ]);
    assert.deepEqual(marks, [{ kind: 'door', id: 'scene:door:bureaucratic_hall_exit:0', x: 72, y: 572, tip: 'Gregarious Grange' }]);
    const feature = read('public/js/features/street-minimap-feature.js');
    assert.match(feature, /const marks = \[\.\.\.sceneSignMarks\(engine\.interactables \|\| \[\]\), \.\.\.sceneDoorMarks\(engine\.interactables \|\| \[\]\)\];/);
  });

  it('its tip says where it leads; a click walks there and opens no menu', () => {
    const [m] = doorMarks({ doors: [{ id: 'd', x: 1, y: 2, connect: { label: 'Glutton Greens' } }] });
    assert.equal(tipFor(m), 'Glutton Greens');
    assert.equal(markHasMenu(m), false);
  });

  it('the corner map draws it as a button with a door icon, not counted as a signpost', () => {
    const view = read('public/js/ui/street-minimap.js');
    assert.match(view, /const doors = doorMarks\(street\);\s*for \(const mark of doors\) addSign\(mark\);/);
    assert.match(view, /kind === 'door' \? 'smm-sign smm-door'/);
    assert.match(view, /const signCount = \(\) => \[\.\.\.signs\.values\(\)\]\.filter\(\(s\) => s\.mark\.kind === 'sign'\)\.length;/);
    assert.match(read('public/style.css'), /\.street-minimap \.smm-sign\.smm-door \{ width: calc\(12px \* var\(--mm-u\)\); height: calc\(12px \* var\(--mm-u\)\); \}/);
  });

  it('the phone sheet lists it with the signposts and stations, left to right, a tap walks to it', () => {
    const rows = phoneSignRows([
      { kind: 'door', id: 'scene:door:bureaucratic_hall_exit:0', x: 72, y: 572, tip: 'Gregarious Grange' },
      { kind: 'door', id: 'door:x', x: 900, y: 572, tip: null },
    ], { x: 600, y: 572 });
    assert.deepEqual(rows.map((r) => [r.kind, r.side, r.text]), [['door', 'left', 'Gregarious Grange'], ['door', 'right', 'Door']]);
    const feature = read('public/js/features/street-minimap-feature.js');
    assert.match(feature, /\.\.\.stationMarks\(engine\.street\), \.\.\.doorMarks\(engine\.street\), \.\.\.\(live \? sceneDoorMarks\(engine\.interactables \|\| \[\]\) : \[\]\)\];/);
    assert.match(feature, /row\.kind === 'door' \? `Walk to the door to \$\{row\.text\}`/);
  });

  it('is registered as the remake\'s own, ruled by Austin', () => {
    const reg = JSON.parse(read('tools/inventions/inventions.json'));
    const entry = reg.entries.find((e) => e.id === 'minimap-exit-doors');
    assert.equal(entry?.status, 'kept');
    assert.match(entry.ruling, /Austin 2026-11-24/);
  });
});
