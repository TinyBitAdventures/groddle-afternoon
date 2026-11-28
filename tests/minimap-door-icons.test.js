/**
 * #645 (Austin 2026-11-26): the street map's door buttons each show what kind of way out they are, a
 * dinosaur's mouth (Teobocci Shasha's dino), a portal (Ethereal Endeavour's orb) or a plain door, where
 * every one used to draw the same door. The kind is read off the door's own art in the street data
 * (doorLook of its `sprite`), and each icon is Tiny Speck's CC0 art scaled down
 * (tools/build-minimap-door-icons.py). Ours: tools/inventions/inventions.json minimap-door-kind-icons.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { DOOR_ART, DOOR_LOOKS, createStreetMinimap, doorArtName, doorLook, doorMarks, markArt, sceneDoorMarks, withDoorArt } from '../public/js/ui/street-minimap.js?fresh=minimap-door-icons';
import { phoneSignRows } from '../public/js/features/street-minimap-feature.js?v=5f14140c';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=ea8b4915';
import { imageSize } from '../tools/image-size.mjs';
import { python311 } from './python311.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const streetsDir = join(root, 'public/assets/streets');
const streetJson = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));

/* A small stand-in DOM, as tests/street-minimap-hd.test.js's. */
function fakeEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(), hidden: false, inert: false, dataset: {}, attrs: {}, children: [], parentElement: null,
    style: { setProperty() {} },
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }, toggle() {} },
    sel: new Map(),
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {},
    append(...kids) { for (const k of kids) { k.parentElement = el; el.children.push(k); } },
    prepend(...kids) { el.append(...kids); },
    replaceChildren() { el.children = []; },
    remove() {}, contains: () => false, closest: () => null, focus() {},
    querySelector(s) { if (!el.sel.has(s)) el.sel.set(s, fakeEl()); return el.sel.get(s); },
    querySelectorAll: () => [],
    decode: () => Promise.resolve(),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 192, bottom: 100, width: 192, height: 100 }),
    clientWidth: 192, offsetWidth: 0,
    set innerHTML(v) { el._html = v; },
    get innerHTML() { return el._html || ''; },
  };
  if (tag === 'canvas') {
    el.width = 300;
    el.height = 150;
    el.getContext = () => ({ createLinearGradient: () => ({ addColorStop() {} }), clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {} });
  }
  return el;
}

function allStreets() {
  const out = [];
  for (const file of readdirSync(streetsDir)) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    const street = JSON.parse(readFileSync(join(streetsDir, file), 'utf8'));
    if (!street.doors?.length) continue;
    subwayFeature.prepareStreet(street);
    out.push(street);
  }
  return out;
}

describe('door buttons on the street map show their kind (#645)', () => {
  it('the kind comes from the door\'s own art: dino, portal or door', () => {
    assert.deepEqual([...DOOR_LOOKS], ['dino', 'portal', 'door']);
    assert.equal(doorLook('door_dino_006'), 'dino');
    assert.equal(doorLook('door_dino_01'), 'dino');
    assert.equal(doorLook('glowing_orb_dull'), 'portal');
    assert.equal(doorLook('portal_wintry'), 'portal');
    assert.equal(doorLook('Teleporter_Base'), 'portal');
    assert.equal(doorLook('door_asset_wooden_door_lock'), 'door');
    assert.equal(doorLook('door_asset_stairs'), 'door');
    assert.equal(doorLook('cave_hole_back'), 'door');
    assert.equal(doorLook(undefined), 'door');
  });

  it('Teobocci Shasha\'s dino, Ethereal Endeavour\'s orb and Gregarious Grange\'s doors', () => {
    assert.deepEqual(doorMarks(streetJson('GA5AAB0VNKR2VRN')).map((m) => [m.look, m.tip]), [['dino', 'Glutton Greens']]);
    assert.deepEqual(doorMarks(streetJson('GA9EKMN138D3QK2')).map((m) => [m.look, m.tip]), [['portal', 'Doonboggle Trail']]);
    const grange = streetJson('GLI32G3NUTD100I');
    subwayFeature.prepareStreet(grange);
    assert.deepEqual(doorMarks(grange).map((m) => m.look), ['door', 'door']);
    assert.equal(sceneDoorMarks([{ classId: 'bureaucratic_hall_exit', label: 'Gregarious Grange', sprite: { x: 1, y: 2 } }])[0].look, 'door');
  });

  it('every door on every street gets a kind, from its art, and all three kinds appear', () => {
    const seen = { dino: 0, portal: 0, door: 0 };
    let doors = 0;
    for (const street of allStreets()) {
      const bySprite = new Map(street.doors.map((d) => [`door:${d.id}`, d.sprite]));
      for (const mark of doorMarks(street)) {
        doors += 1;
        assert.ok(DOOR_LOOKS.includes(mark.look), `${street.tsid} ${street.label} ${mark.id}: ${mark.look}`);
        assert.equal(mark.look, doorLook(bySprite.get(mark.id)), `${street.label} ${mark.id}`);
        seen[mark.look] += 1;
      }
      // Every dinosaur door on the map is a dino.
      for (const d of street.doors) if (/^door_dino_/.test(d.sprite) && !d.hidden) assert.equal(doorMarks(street).find((m) => m.id === `door:${d.id}`)?.look, 'dino', street.label);
    }
    assert.ok(doors > 150, `${doors} door marks`);
    assert.ok(seen.dino >= 6, `dinos ${seen.dino}`);
    assert.ok(seen.portal >= 1, `portals ${seen.portal}`);
    assert.ok(seen.door > 100, `doors ${seen.door}`);
  });

  it('each kind has its icon: 12 px for the card, 96 px for a scaled-up map, built from Tiny Speck art', () => {
    for (const look of DOOR_LOOKS) {
      const a = DOOR_ART[doorArtName(look)];
      assert.ok(a, look);
      for (const [url, px] of [[a.one, 12], [a.hd, 96]]) {
        const file = join(root, 'public', url);
        assert.ok(existsSync(file), url);
        assert.deepEqual(imageSize(readFileSync(file)), { w: px, h: px, format: 'webp' }, url);
      }
    }
    assert.equal(doorArtName('nonsense'), 'door_look_door');
  });

  it('build-minimap-door-icons.py --check: the icons are the builder\'s output', { skip: !existsSync(python311) && 'needs python3.11' }, () => {
    const out = execFileSync(python311, ['-I', join(root, 'tools/build-minimap-door-icons.py'), '--check'], { encoding: 'utf8' });
    assert.match(out, /current/);
  });

  it('the corner map draws each door with its kind\'s icon, sharp when crisp and through srcset in Classic', () => {
    const street = {
      tsid: 'LA', bounds: { l: -2000, r: 2000, t: -1000, b: 0 }, gradient: { top: 'ccddee', bottom: 'eeffff' },
      doors: [
        { id: 'a', x: -1500, y: -10, w: 100, h: 100, sprite: 'door_dino_006', connect: { label: 'Glutton Greens' } },
        { id: 'b', x: 0, y: -10, w: 100, h: 100, sprite: 'glowing_orb_dull', connect: { label: 'Doonboggle Trail' } },
        { id: 'c', x: 1500, y: -10, w: 100, h: 100, sprite: 'door_asset_wooden_door_lock', connect: { label: 'Out' } },
      ],
    };
    let classic = false;
    const view = createStreetMinimap({ createElement: (t) => fakeEl(t), documentElement: { clientWidth: 1280 }, activeElement: null }, fakeEl(), { raf: (fn) => fn(0), artUrl: (n) => `assets/classic/${n}.webp`, crisp: () => !classic });
    view.setStreet(street);
    const doors = view.root.querySelector('.smm-signs').children.filter((b) => b.dataset.kind === 'door');
    assert.deepEqual(doors.map((b) => b.dataset.look), ['dino', 'portal', 'door']);
    assert.match(doors[0].innerHTML, /src="assets\/ui\/minimap\/door_look_dino_hd\.webp"/);
    assert.match(doors[1].innerHTML, /src="assets\/ui\/minimap\/door_look_portal_hd\.webp"/);
    assert.match(doors[2].innerHTML, /src="assets\/ui\/minimap\/door_look_door_hd\.webp"/);
    assert.doesNotMatch(doors.map((b) => b.innerHTML).join(''), /<svg/, 'no drawn door left');
    classic = true;
    view.refreshArt();
    assert.match(doors[0].innerHTML, /src="assets\/ui\/minimap\/door_look_dino\.webp" srcset="assets\/ui\/minimap\/door_look_dino\.webp 1x, assets\/ui\/minimap\/door_look_dino_hd\.webp 2x"/);
  });

  it('the phone sheet\'s rows show the same icons', () => {
    const rows = phoneSignRows([
      { kind: 'door', id: 'door:a', look: 'dino', x: 10, y: 0, tip: 'Glutton Greens' },
      { kind: 'door', id: 'door:b', look: 'portal', x: 20, y: 0, tip: 'Doonboggle Trail' },
      { kind: 'door', id: 'scene:door:x:0', x: 30, y: 0, tip: 'Out' },
      { kind: 'sign', id: 's', x: 40, y: 0, tip: 'Kebra Glories' },
    ], { x: 0, y: 0 });
    assert.deepEqual(rows.map((r) => r.look), ['dino', 'portal', 'door', undefined]);
    assert.equal(markArt(doorArtName('portal'), withDoorArt({ crisp: true })), '<img alt="" src="assets/ui/minimap/door_look_portal_hd.webp" />');
    const feature = read('public/js/features/street-minimap-feature.js');
    assert.match(feature, /markArt\(row\.kind === 'door' \? doorArtName\(row\.look\) : /);
    assert.match(read('public/style.css'), /\.smm-sheet-sign\[data-kind="door"\] img \{ width: 21px; height: 21px;/);
  });

  it('is registered as ours', () => {
    const reg = JSON.parse(read('tools/inventions/inventions.json'));
    const entry = reg.entries.find((e) => e.id === 'minimap-door-kind-icons');
    assert.equal(entry?.status, 'kept');
    assert.match(entry.ruling, /Austin 2026-11-26/);
  });
});
