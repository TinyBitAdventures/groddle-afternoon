/**
 * Louise Pasture Villa (register row G371), rebuilt from its 2011 render on the
 * apartment lobby template (js/louise-pasture-villa.js, tools/build-rebuilt-rooms.mjs,
 * features/rebuilt-rooms-feature.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry, platformYAt } from '../public/js/street-model.js?v=b6cb6a4e';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=90fca5cc';
import { checkDoorEntry, doorAt, doorDestination } from '../public/js/doors.js?v=727d0e0b';
import {
  HOUSE_GROUND_ART,
  LOUISE_PASTURE_DOOR,
  LOUISE_PASTURE_ENTRY,
  LOUISE_PASTURE_HOUSE,
  LOUISE_PASTURE_SIGN_ID,
  LOUISE_PASTURE_TSID,
  LOUISE_VILLA_ARRIVE,
  LOUISE_VILLA_EXIT,
  LOUISE_VILLA_EXIT_DOOR,
  LOUISE_VILLA_LIFT_DOORS,
  LOUISE_VILLA_POSTER,
  LOUISE_VILLA_PROP_TOPS,
  LOUISE_VILLA_TEMPLATE_TSID,
  LOUISE_VILLA_TSID,
  isLouiseVillaTsid,
  louisePastureHouseSpan,
  louiseVillaEcology,
  louiseVillaStreet,
  villaLayerX,
  villaLayerY,
} from '../public/js/louise-pasture-villa.js?v=01066f39';
import { rebuiltRoomsFeature } from '../public/js/features/rebuilt-rooms-feature.js?v=80416d0d';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8'));
const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
const gsjs = join(spike, '../glitch-GameServerJS');
const locations = join(spike, '../streets/mnt/stos/location_data');

const villa = street(LOUISE_VILLA_TSID);
const pasture = street(LOUISE_PASTURE_TSID);
const towers = street(LOUISE_VILLA_TEMPLATE_TSID);
const door = (s, id) => (s.doors || []).find((d) => d.id === id);
const floorAt = (s, x, y) => s.platforms.some((p) => {
  const py = platformYAt(p, x, 0);
  return py != null && Math.abs(py - y) <= 2;
});
const landsOnFloor = (target, arrive) => floorAt(target, arrive.x + target.bounds.l, arrive.y + target.bounds.t);
const decos = (s) => s.layers.flatMap((l) => l.decos);

describe('Louise Pasture Villa: street JSON', () => {
  it('is written, indexed and current (tools/build-rebuilt-rooms.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-rebuilt-rooms.mjs'), '--check'], { stdio: 'pipe' });
    assertStreetGeometry(villa);
    assert.match(villa.source, /^reconstruction/);
    assert.equal(villa.reconstructed, true);
    assert.deepEqual([villa.label, villa.hubId, villa.hubName], ['Louise Pasture Villa', '58', 'Groddle Meadow']);
    const row = index.streets[LOUISE_VILLA_TSID];
    assert.deepEqual([row.label, row.reconstructed, row.file, row.platforms, row.decos], ['Louise Pasture Villa', true, `assets/streets/${LOUISE_VILLA_TSID}.json`, villa.platforms.length, villa.stats.decoCount]);
    assert.equal(villa.stats.decoCount, decos(villa).length);
    assert.equal(pasture.stats.decoCount, decos(pasture).length);
    assert.equal(pasture.stats.doorCount, pasture.doors.length);
  });

  it("is the render's shape on the apartment lobby template: Gregarious Towers' floor, ceiling and walls without its prop tops", () => {
    assert.deepEqual(villa.bounds, towers.bounds);
    assert.equal(720 / 308 - 1500 / 642 < 0.002, true);
    const keep = towers.platforms.filter((p) => !LOUISE_VILLA_PROP_TOPS.includes(p.id));
    assert.deepEqual(villa.platforms, keep);
    assert.equal(towers.platforms.length - keep.length, LOUISE_VILLA_PROP_TOPS.length);
    assert.deepEqual(villa.barriers, towers.barriers);
    // One walkable floor from wall to wall, and the ceiling.
    for (let x = -580; x <= 735; x += 15) {
      const ys = villa.platforms.filter((p) => p.pc_perm === -1).map((p) => platformYAt(p, x, 0)).filter((y) => y != null);
      assert.ok(ys.length >= 1 && ys.every((y) => y > -160), `floor at x ${x}`);
    }
    assert.ok(villa.platforms.some((p) => p.pc_perm === 1 && p.y1 < -580));
  });

  it("draws the hall as the render shows it, in Tiny Speck's CC0 pieces already shipped", () => {
    const names = decos(villa).map((d) => d.sprite);
    for (const want of ['apartment_lobby', 'apartment_poster_discover_ix', 'door_asset_elevator_door', 'apartment_lobby_stairs_separated', 'apartment_lobby_door_separated']) {
      assert.ok(names.includes(want), want);
    }
    // None of the towers' abandonment dressing.
    for (const s of names) assert.doesNotMatch(s, /brick|crack|crate|barrel|vase|shadow|icicle/, s);
    for (const d of [...decos(villa), ...villa.doors]) {
      assert.ok(manifest.has(d.sprite) && existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), d.sprite);
    }
    // Read off the render: the poster in the left bay, the lift doors in the tower's arch.
    assert.deepEqual([LOUISE_VILLA_POSTER.x, LOUISE_VILLA_POSTER.base], [villaLayerX(200), villaLayerY(180)]);
    assert.ok(LOUISE_VILLA_POSTER.x > 267 && LOUISE_VILLA_POSTER.x < 569);
    const lift = towers.layers.flatMap((l) => l.decos).find((d) => d.sprite === 'apartment_hall_elevator');
    assert.ok(Math.abs(LOUISE_VILLA_LIFT_DOORS.x - lift.x) < 10, 'the lift doors sit on the towers\' lift');
    assert.equal(villa.layers.find((l) => l.name === 'middleground').filters, undefined, 'the render is lit plainly, not the towers\' dim orange');
  });

  it('is an empty hall indoors (no ecology row: the feature supplies it)', () => {
    const eco = louiseVillaEcology(LOUISE_VILLA_TSID);
    assert.deepEqual([eco.interior, eco.quoins, Object.keys(eco.counts).length], [true, 0, 0]);
    assert.equal(louiseVillaEcology(LOUISE_PASTURE_TSID), null);
    assert.ok(isLouiseVillaTsid('LCRDGMREPJ02ORK'));
    assert.deepEqual(rebuiltRoomsFeature.ecologyOverride({ tsid: LOUISE_VILLA_TSID }), eco);
    const data = {};
    rebuiltRoomsFeature.onStreetEnter({ tsid: LOUISE_VILLA_TSID }, { setData: (k, v) => { data[k] = v; } });
    assert.equal(data.rebuiltRoom, LOUISE_VILLA_TSID);
  });

  it('throws without its template', () => {
    assert.throws(() => louiseVillaStreet(pasture), /Gregarious Towers/);
  });
});

describe('Louise Pasture Villa: the doors', () => {
  it('the EXIT door leads out to Louise Pasture, in front of the way in', () => {
    const out = door(villa, LOUISE_VILLA_EXIT_DOOR);
    assert.deepEqual([out.x, out.y, out.sprite, out.is_locked, out.hidden, out.key_id], [LOUISE_VILLA_EXIT.x, LOUISE_VILLA_EXIT.y, 'door_asset_apartment_hall_right', false, false, 0]);
    // Where the towers' own street door stands in the same hall.
    const towersDoor = towers.doors.find((d) => d.connect?.label === 'Gregarious Grange');
    assert.deepEqual([out.x, out.y], [towersDoor.x, towersDoor.y]);
    assert.equal(out.connect.street, LOUISE_PASTURE_TSID);
    assert.ok(landsOnFloor(pasture, out.connect.arrive));
    const feet = arrivalInTarget(villa, out.x + villa.bounds.l - 20, out.y + villa.bounds.t);
    assert.ok(feet.snapped);
    assert.equal(doorAt(villa.doors, feet.x, feet.y)?.id, out.id, 'standing on the steps is at the door');
    assert.equal(checkDoorEntry(out, { destination: doorDestination(out) }).ok, true);
    const inDoor = door(pasture, LOUISE_PASTURE_DOOR);
    assert.ok(Math.abs(out.connect.arrive.x - inDoor.x) <= 2, 'you come out at the door you went in by');
  });

  it("the way in on Louise Pasture: an open door and the apartment sign, landing at the towers' lobby arrival", () => {
    const d = door(pasture, LOUISE_PASTURE_DOOR);
    assert.deepEqual([d.sprite, d.w, d.h, d.is_locked, d.key_id], ['door_asset_abandoned_apt_1', 120, 179, false, 0]);
    assert.equal(d.x + pasture.bounds.l, LOUISE_PASTURE_ENTRY.x);
    assert.ok(floorAt(pasture, d.x + pasture.bounds.l, d.y + pasture.bounds.t), 'the door stands on the floor');
    assert.equal(d.connect.street, LOUISE_VILLA_TSID);
    assert.deepEqual([d.connect.x, d.connect.y], [LOUISE_VILLA_ARRIVE.x, LOUISE_VILLA_ARRIVE.y]);
    const tower = street('GLI32G3NUTD100I').doors.find((x) => x.connect?.street === LOUISE_VILLA_TEMPLATE_TSID);
    assert.deepEqual([tower.connect.x, tower.connect.y], [LOUISE_VILLA_ARRIVE.x, LOUISE_VILLA_ARRIVE.y], "the five tower doors' lobby arrival");
    assert.deepEqual(d.connect.arrive, tower.connect.arrive);
    assert.ok(landsOnFloor(villa, d.connect.arrive));
    assert.equal(checkDoorEntry(d, { level: 1, hasKey: () => false, destination: doorDestination(d) }).ok, true);
    const sign = decos(pasture).filter((x) => x.id === LOUISE_PASTURE_SIGN_ID);
    assert.equal(sign.length, 1);
    assert.equal(sign[0].sprite, 'sign_apartment_groddle');
    // Nothing else stands in the doorway: no signpost within 400 px.
    for (const sp of pasture.signposts) assert.ok(Math.abs(sp.x - LOUISE_PASTURE_ENTRY.x) > 400, sp.id);
    assert.equal(pasture.doors.filter((x) => x.id === LOUISE_PASTURE_DOOR).length, 1);
  });

  it('the way in stands in the apartment house bldg_ext_apt.swf draws, as on the five tower streets (a player saw a door with no villa)', () => {
    const d = door(pasture, LOUISE_PASTURE_DOOR);
    const dx = d.x + pasture.bounds.l;
    const dy = d.y + pasture.bounds.t;
    const mg = pasture.layers.find((l) => l.name === 'middleground');
    const base = mg.decos.find((x) => x.id === LOUISE_PASTURE_HOUSE.base.id);
    const top = mg.decos.find((x) => x.id === LOUISE_PASTURE_HOUSE.extension.id);
    assert.deepEqual([base.sprite, top.sprite], ['abandoned_apt_base_1', 'abandoned_apt_extension_1']);
    for (const x of [base, top]) {
      assert.ok(manifest.has(x.sprite) && existsSync(join(pub, 'assets/decos/groddle', `${x.sprite}.webp`)), x.sprite);
      assert.equal(mg.decos.filter((y) => y.id === x.id).length, 1);
    }
    // The five tower streets stand the house on their door_asset_abandoned_apt_1 the same way each time.
    const offsets = [];
    for (const tsid of ['GLI32G3NUTD100I', 'GA9A9CGB9F824PK', 'GHV2SQS7ENA25BL', 'GHV36AG0LO2208L', 'GA9I4JIPBE92B8M']) {
      const s = street(tsid);
      const all = s.layers.find((l) => l.name === 'middleground').decos;
      const b = all.find((x) => x.sprite === 'abandoned_apt_base_1');
      const e = all.find((x) => x.sprite === 'abandoned_apt_extension_1' && Math.abs(x.x - b.x) < 20 && x.y < b.y - 500 && x.y > b.y - 700);
      const td = s.doors.find((x) => x.sprite === 'door_asset_abandoned_apt_1' && Math.abs(x.x + s.bounds.l - b.x) < 60);
      offsets.push([b.x - (td.x + s.bounds.l), b.y - (td.y + s.bounds.t), e.x - b.x, e.y - b.y, b.z < e.z]);
    }
    const median = (i) => offsets.map((o) => o[i]).sort((a, b) => a - b)[2];
    assert.deepEqual([LOUISE_PASTURE_HOUSE.base.dx, LOUISE_PASTURE_HOUSE.base.dy, LOUISE_PASTURE_HOUSE.extension.dx, LOUISE_PASTURE_HOUSE.extension.dy], [median(0), median(1), median(2), median(3)]);
    assert.ok(offsets.every((o) => o[4]), 'the extension draws over the base');
    // The door stands in the arch: the house round it, its foot just under the door's.
    assert.deepEqual([base.x - dx, base.y - dy, top.x - base.x, top.y - base.y], [median(0), median(1), median(2), median(3)]);
    assert.deepEqual([base.w, base.h, top.w, top.h], [678, 651, 623, 380]);
    // In front of the ground strips under it and behind the flowers and bushes there.
    const span = louisePastureHouseSpan();
    assert.deepEqual(span, { l: base.x - base.w / 2, r: base.x + base.w / 2 });
    const under = mg.decos.filter((x) => x !== base && x !== top && x.x + x.w / 2 > span.l && x.x - x.w / 2 < span.r);
    const ground = under.filter((x) => HOUSE_GROUND_ART.test(x.sprite));
    assert.ok(ground.length >= 5);
    assert.ok(ground.every((x) => x.z < base.z), 'in front of the ground strips');
    assert.equal(top.z, base.z + 1);
    assert.ok(under.filter((x) => !HOUSE_GROUND_ART.test(x.sprite)).every((x) => x.z > top.z), 'behind the flowers and bushes');
    // The sign beside the house on the flat ground to its right (the towers: 352-377 px from the middle), on the floor.
    const sign = mg.decos.find((x) => x.id === LOUISE_PASTURE_SIGN_ID);
    assert.ok(sign.x > span.r, 'the sign stands beside the house (its left end in front of the corner, as the towers\' do)');
    assert.ok(Math.abs(sign.x - base.x) >= 352 && Math.abs(sign.x - base.x) <= 377, `sign ${sign.x - base.x} from the middle`);
    const signFoot = arrivalInTarget(pasture, sign.x, -130);
    assert.ok(signFoot.snapped && Math.abs(sign.y - (signFoot.y + pasture.bounds.t) - LOUISE_PASTURE_ENTRY.sign.sink) <= 1);
    assert.ok(sign.z > Math.max(...mg.decos.filter((x) => x !== sign).map((x) => x.z)));
  });

  it("the sources: GSJS lists the villa in hub 58, and Louise Pasture's sources name it", { skip: (!existsSync(gsjs) || !existsSync(locations)) && 'GSJS or the street dump not beside this worktree' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    assert.match(maps, /"LCRDGMREPJ02ORK"\t: "Louise Pasture Villa"/);
    const xml = readFileSync(join(locations, `${LOUISE_PASTURE_TSID}.xml`), 'utf8');
    const tail = xml.slice(xml.lastIndexOf('<object id="sources">'));
    assert.match(tail.slice(0, 600), /<int id="LCRDGMREPJ02ORK">1<\/int>/);
    assert.match(xml, /bldg_ext_apt/);
    assert.doesNotMatch(xml, /tsid="LCRDGMREPJ02ORK"/, 'nothing archived leads in: the way in is ours');
    assert.equal(existsSync(join(locations, 'GCRDGMREPJ02ORK.xml')), false);
  });
});
