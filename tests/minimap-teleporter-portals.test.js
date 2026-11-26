/**
 * #645 (Austin 2026-11-26, the follow-up to the door icons): every walk-in teleporter the game has wired
 * (Collision-triggered Teleporters, items/teleporter.js: the Vortex of Random's back doors, Northwest
 * Passage's wintry portal, the hidden floors, the pits and beams) shows on the street map as a portal
 * button like the doors, with the portal icon by the same kind rule (doorLook; a teleporter row is the
 * `teleporter` item). A click or Enter on it, or its row on the phone sheet, travels where walking into it
 * does, through the hidden-floors feature's own teleport (travelGate first). Ours:
 * tools/inventions/inventions.json minimap-door-kind-icons.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createStreetMinimap, doorLook, teleporterMarks } from '../public/js/ui/street-minimap.js?fresh=minimap-teleporter-portals';
import { phoneSignRows, walkFromMap } from '../public/js/features/street-minimap-feature.js?fresh=minimap-teleporter-portals';
import { hiddenFloorsFeature, walkInTeleportersOn } from '../public/js/features/hidden-floors-feature.js?fresh=minimap-teleporter-portals';
import { TELEPORTERS } from '../public/js/hidden-floors.js?v=17a8b20b';
import { NARAKA_TELEPORTERS } from '../public/js/hell.js?v=d77f15ef';
import { WINTRY_PORTAL_TELEPORTERS } from '../public/js/wintry-portal.js?v=1437deda';
import { CAVE_PIT_TELEPORTERS } from '../public/js/cave-pit.js?v=81e62950';
import { SEAM_TELEPORTERS } from '../public/js/seam-teleporters.js?v=09d11340';
import { WIRED_TELEPORTERS, AINT_THAT_DRY_TSID, CHITI_TIGA_TSID } from '../public/js/collision-teleporters.js?v=73c97f41';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const streetJson = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const ALL = [...TELEPORTERS, ...NARAKA_TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS, ...CAVE_PIT_TELEPORTERS, ...SEAM_TELEPORTERS, ...WIRED_TELEPORTERS];

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

function fakeEngine(extra = {}) {
  const data = {};
  const calls = [];
  return {
    data, calls, started: true, player: { x: 0, y: 0, vx: 0, vy: 0 },
    setData: (k, v) => { data[k] = v; },
    param: () => null,
    travelGate: () => ({ ok: true }),
    enter: async (tsid, opts) => { calls.push(['enter', tsid, opts]); return true; },
    save() {}, toast() {}, snapCamera() {},
    ...extra,
  };
}

describe('walk-in teleporters as portal buttons on the street map (#645)', () => {
  it('every wired teleporter is a portal mark on its own street, its tip where it goes, its box its art', () => {
    assert.ok(ALL.length >= 20, `${ALL.length} teleporters`);
    assert.equal(doorLook('teleporter'), 'portal', 'the teleporter item is a portal by the door kind rule');
    for (const t of ALL) {
      const rows = walkInTeleportersOn(t.from);
      assert.ok(rows.some((r) => r.id === t.id && r.to === t.to), `${t.id} on ${t.from}`);
      const mark = teleporterMarks(rows).find((m) => m.id === `teleporter:${t.id}`);
      assert.deepEqual(mark, { kind: 'door', id: `teleporter:${t.id}`, look: 'portal', x: t.box.x, y: t.box.y, tip: t.label, w: t.box.w, h: t.box.h });
    }
  });

  it('the Vortex back doors and the wintry portal', () => {
    assert.deepEqual(teleporterMarks(walkInTeleportersOn(AINT_THAT_DRY_TSID)).map((m) => [m.look, m.tip]), [['portal', 'Chiti Tiga']]);
    assert.deepEqual(teleporterMarks(walkInTeleportersOn(CHITI_TIGA_TSID)).map((m) => [m.look, m.tip]), [['portal', "Ain't That Dry"]]);
    assert.deepEqual(teleporterMarks(walkInTeleportersOn('GLI23D3LDHD1FQA')).map((m) => [m.look, m.tip]), [['portal', 'Wintry Place']]);
    assert.deepEqual(teleporterMarks(walkInTeleportersOn('GA5AAB0VNKR2VRN')), [], 'a street with none');
  });

  it('the hidden-floors feature answers the map: its teleporters, none in a home or an instance', () => {
    const street = streetJson(AINT_THAT_DRY_TSID);
    assert.deepEqual(hiddenFloorsFeature.minimapTeleporters(street, fakeEngine()).map((t) => t.id), ['aint_that_dry_to_chiti_tiga']);
    assert.equal(hiddenFloorsFeature.minimapTeleporters(street, fakeEngine({ transientInstance: () => true })), null);
    assert.equal(hiddenFloorsFeature.minimapTeleporters(streetJson('GA5AAB0VNKR2VRN'), fakeEngine()), null);
  });

  it('a click on the button travels where walking in does: the feature\'s own teleport, through the travel gate', async () => {
    const engine = fakeEngine();
    hiddenFloorsFeature.onStreetEnter(streetJson(AINT_THAT_DRY_TSID), engine);
    assert.equal(hiddenFloorsFeature.teleportFromMap('nope', engine), null);
    assert.equal(hiddenFloorsFeature.teleportFromMap('aint_that_dry_to_chiti_tiga', engine), true);
    await new Promise((r) => setTimeout(r, 0));
    const t = WIRED_TELEPORTERS.find((r) => r.id === 'aint_that_dry_to_chiti_tiga');
    assert.deepEqual(engine.calls, [['enter', t.to, { spawnX: t.arrive.x, spawnY: t.arrive.y }]]);
    const gated = fakeEngine({ travelGate: () => ({ ok: false, msg: 'Not now' }) });
    hiddenFloorsFeature.onStreetEnter(streetJson(AINT_THAT_DRY_TSID), gated);
    hiddenFloorsFeature.teleportFromMap('aint_that_dry_to_chiti_tiga', gated);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(gated.calls, [], 'the travel gate still says no');
    hiddenFloorsFeature.onStreetClear();
  });

  it('the map\'s click goes to the teleport, not a walk', () => {
    const asked = [];
    const engine = fakeEngine({
      query: (hook, id) => { asked.push([hook, id]); return hook === 'teleportFromMap' ? true : null; },
      walkTo: () => { throw new Error('no walk'); },
    });
    assert.equal(walkFromMap(engine, { kind: 'door', id: 'teleporter:aint_that_dry_to_chiti_tiga', x: 1, y: 2 }, { keyboard: true }), true);
    assert.deepEqual(asked, [['teleportFromMap', 'aint_that_dry_to_chiti_tiga']]);
    assert.equal(engine.data.streetMapWalk, 'teleporter:aint_that_dry_to_chiti_tiga');
  });

  it('the corner map and the phone rows show it with the portal icon', () => {
    const street = streetJson(AINT_THAT_DRY_TSID);
    const view = createStreetMinimap({ createElement: (t) => fakeEl(t), documentElement: { clientWidth: 1280 }, activeElement: null }, fakeEl(), {
      raf: (fn) => fn(0), crisp: () => true, teleporters: (s) => walkInTeleportersOn(s.tsid),
    });
    view.setStreet(street);
    const ports = view.root.querySelector('.smm-signs').children.filter((b) => b.dataset.mark?.startsWith('teleporter:'));
    assert.deepEqual(ports.map((b) => [b.dataset.kind, b.dataset.look, b.getAttribute('aria-label')]), [['door', 'portal', 'Door to Chiti Tiga']]);
    assert.match(ports[0].innerHTML, /door_look_portal_hd\.webp/);
    assert.equal(view.root.dataset.teleporters, '1');
    const rows = phoneSignRows(teleporterMarks(walkInTeleportersOn(AINT_THAT_DRY_TSID)), { x: 0, y: 0 });
    assert.deepEqual(rows.map((r) => [r.kind, r.look, r.text]), [['door', 'portal', 'Chiti Tiga']]);
    const feature = read('public/js/features/street-minimap-feature.js');
    assert.equal((feature.match(/teleporters: \(s\) => engine\.query\?\.\('minimapTeleporters', s, engine\) \|\| \[\]/g) || []).length, 2, 'the corner card and the phone sheet');
    assert.match(feature, /\.\.\.teleporterMarks\(engine\.query\?\.\('minimapTeleporters', engine\.street, engine\) \|\| \[\]\)/);
  });
});
