/**
 * The hidden floors (register row G92): the lost floor rebuilt from footage,
 * Goorsh Gam's treetop teleporter into it, Odena Odes' teleporter into the
 * forgotten floor, and both ways back (js/hidden-floors.js,
 * tools/build-hidden-floors.mjs, features/hidden-floors-feature.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js';
import { arrivalInTarget } from '../public/js/location-navigation.js';
import { SOURCE_PHYSICS } from '../public/js/puzzle-triggers.js';
import {
  CANOPY_PHYSICS,
  CANOPY_Y,
  EXIT_SIGNS,
  FORGOTTEN_FLOOR_TSID,
  GOORSH_GAM_TSID,
  LOST_FLOOR_TSID,
  LOST_FLOOR_Y,
  MISSING_FLOOR,
  ODENA_ODES_TSID,
  ODENA_POCKET_FLOOR_Y,
  PILLARS,
  PLAIN_JUMP_APEX,
  TELEPORTERS,
  WINDOWS,
  exitSignOn,
  inTeleporter,
  jumpApex,
  teleportersOn,
} from '../public/js/hidden-floors.js';
import { hiddenFloorsFeature } from '../public/js/features/hidden-floors-feature.js';
import { FEATURES } from '../public/js/features/index.js';
import { rawTripleJumpMultiplier, scaledTripleJumpMultiplier } from '../public/js/movement.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const gsjs = join(spike, '../glitch-GameServerJS');
const xmlDir = join(spike, '../streets/mnt/stos/location_data');

const lost = street(LOST_FLOOR_TSID);
const goorsh = street(GOORSH_GAM_TSID);
const odena = street(ODENA_ODES_TSID);
const forgotten = street(FORGOTTEN_FLOOR_TSID);
const byTsid = { [LOST_FLOOR_TSID]: lost, [GOORSH_GAM_TSID]: goorsh, [ODENA_ODES_TSID]: odena, [FORGOTTEN_FLOOR_TSID]: forgotten };
const tp = (id) => TELEPORTERS.find((t) => t.id === id);
const plat = (s, id) => s.platforms.find((p) => p.id === id);
const yAt = (p, x) => p.y1 + ((x - p.x1) / (p.x2 - p.x1 || 1)) * (p.y2 - p.y1);

/** Floor segments one plain jump (at `phys` multipliers) apart, as a graph. */
function reachable(s, fromId, phys = { speed: 1, gravity: 1, jump: 1 }) {
  const segs = s.platforms.filter((p) => p.pc_perm == null || Number(p.pc_perm) === -1);
  const V = 9.6 * phys.jump;
  const G = 0.42 * phys.gravity;
  const VX = 4.4 * phys.speed;
  const reach = (up) => {
    const disc = V * V - 2 * G * up;
    return disc < 0 ? -1 : VX * ((V + Math.sqrt(disc)) / G);
  };
  const hop = (a, b) => {
    for (let i = 0; i <= 6; i += 1) {
      const xa = a.x1 + ((a.x2 - a.x1) * i) / 6;
      for (let j = 0; j <= 6; j += 1) {
        const xb = b.x1 + ((b.x2 - b.x1) * j) / 6;
        const r = reach(yAt(a, xa) - yAt(b, xb));
        if (r >= 0 && Math.abs(xb - xa) <= r * 0.9) return true;
      }
    }
    return false;
  };
  const seen = new Set([fromId]);
  const queue = [segs.find((p) => p.id === fromId)];
  while (queue.length) {
    const a = queue.shift();
    for (const b of segs) if (!seen.has(b.id) && hop(a, b)) { seen.add(b.id); queue.push(b); }
  }
  return seen;
}

describe('The lost floor street', () => {
  it('is written, indexed and current (tools/build-hidden-floors.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-hidden-floors.mjs'), '--check'], { stdio: 'pipe' });
    assertStreetGeometry(lost);
    assert.match(lost.source, /^reconstruction/);
    assert.equal(lost.reconstructed, true);
    const row = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets[LOST_FLOOR_TSID];
    assert.deepEqual([row.label, row.hubId, row.hubName, row.reconstructed], ['The lost floor', '92', 'Tamila', true]);
    assert.deepEqual([lost.signposts, lost.ladders], [[], []], 'teleporters are the only ways in and out');
  });

  it('is the Tamila floor GSJS names, off the hub map, teleport-safe', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    const hub92 = maps.slice(maps.indexOf('\t\t\t"92"\t: {'));
    assert.match(hub92.slice(0, hub92.indexOf('}')), /"LA9QUBPI49J2MOB"\t: "The lost floor"/);
    assert.match(hub92.slice(0, hub92.indexOf('}')), /"LIF16GDJ89724E3"\t: "Goorsh Gam"/);
    const map92 = maps.slice(maps.indexOf('function maps_get_maps_92('), maps.indexOf('function maps_get_maps_93('));
    assert.ok(map92.length > 0 && !map92.includes('LA9QUBPI49J2MOB'), 'not drawn on the Tamila map');
    assert.match(maps, /"LUV1CSSE49J2P2C"\t: "The missing floor"/);
    const config = readFileSync(join(gsjs, 'config_prod.js'), 'utf8');
    assert.match(config, /var teleportation_ok_streets = \['LDOOSA8V29J24I3', 'LA9QUBPI49J2MOB', 'LUV1CSSE49J2P2C'\];/);
  });

  it('lays the hall out as the video shows: four pillars, three windows, EXIT at the right', () => {
    const mg = lost.layers.find((l) => l.id === 'middleground').decos;
    const fg = lost.layers.find((l) => l.id === 'T_lostfloor_front').decos;
    const columns = fg.filter((d) => d.sprite === 'column_1').map((d) => d.x + lost.bounds.l);
    assert.deepEqual(columns, Object.values(PILLARS));
    const windows = mg.filter((d) => d.sprite === 'apartment_hall_wall_piece_window').map((d) => d.x);
    assert.deepEqual(windows, WINDOWS.map((w) => w.x));
    assert.ok(mg.some((d) => d.sprite === 'door_barricade_wood_1' && Math.abs(d.x - WINDOWS[2].x) < 5), 'crossed planks on the right window');
    assert.equal(mg.filter((d) => /^abandoned_apt_windowboard_/.test(d.sprite)).length, 2, 'two planks on the left window');
    for (const s of ['wallpipe_1', 'wall_shelf1', 'vase_1', 'wall_crack_1', 'ladder_trellis_1', 'ladder_vine_1', 'apartment_rug_red', 'abbasid_planter_box_1x3', 'decor_plants1']) {
      assert.ok(mg.some((d) => d.sprite === s), s);
    }
    assert.ok(fg.some((d) => d.sprite === 'decor_plants2'), 'yellow pot in front');
    assert.ok(fg.filter((d) => d.sprite === 'abbasid_planter_box_1x3').length >= 3, 'front planters');
    const arrow = mg.find((d) => d.id === 'exit_arrow');
    assert.ok(arrow.x > PILLARS.D && arrow.x < WINDOWS[2].x, 'EXIT between pillar D and the crossed window (t0057)');
    assert.equal(exitSignOn(LOST_FLOOR_TSID).text, 'EXIT');
  });

  it('uses only decos on disk', () => {
    const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
    for (const layer of lost.layers) for (const d of layer.decos) assert.ok(manifest.has(d.sprite), `${layer.id}: ${d.sprite}`);
  });

  it('has one walk line from wall to wall', () => {
    const floor = plat(lost, 'plat_lost_floor');
    assert.deepEqual([floor.x1, floor.x2, floor.y1, floor.y2], [lost.bounds.l, lost.bounds.r, LOST_FLOOR_Y, LOST_FLOOR_Y]);
  });
});

describe('Hidden floor teleporters (items/teleporter.js)', () => {
  it('sit on the streets whose one Collision-triggered Teleporter they stand for', { skip: !existsSync(xmlDir) && 'locations dump not beside this worktree' }, () => {
    for (const row of TELEPORTERS.filter((t) => t.objref)) {
      const xml = readFileSync(join(xmlDir, `L${row.from.slice(1)}.xml`), 'utf8');
      const ctts = xml.match(/label="Collision-triggered Teleporter"/g) || [];
      assert.equal(ctts.length, 1, row.from);
      assert.ok(xml.includes(`<objref tsid="${row.objref}" label="Collision-triggered Teleporter"/>`), row.id);
      // The teleporter's server prefix is its floor's (A9 lost, DO forgotten).
      assert.equal(row.objref.slice(1, 3), (row.to === LOST_FLOOR_TSID ? 'A9' : row.to === FORGOTTEN_FLOOR_TSID ? 'DO' : row.from.slice(1, 3)), row.id);
    }
    // Ilmenskie's, for the missing floor (not built): the UV prefix of LUV1CSSE49J2P2C.
    assert.ok(readFileSync(join(xmlDir, 'LIF102FDNU11314.xml'), 'utf8').includes(`<objref tsid="${MISSING_FLOOR.teleporter}" label="Collision-triggered Teleporter"/>`));
  });

  it('land on a floor of the target street, clear of its own teleporters', () => {
    for (const row of TELEPORTERS) {
      const target = byTsid[row.to];
      const land = arrivalInTarget(target, row.arrive.x + target.bounds.l, row.arrive.y + target.bounds.t);
      assert.equal(land.snapped, true, row.id);
      assert.deepEqual({ x: land.x, y: land.y }, { ...row.arrive }, row.id);
      for (const back of teleportersOn(row.to)) assert.equal(inTeleporter(back, row.arrive.x, row.arrive.y), false, `${row.id} lands in ${back.id}`);
    }
  });

  it('Goorsh Gam: a jump from the top-left treetop, out of reach from anywhere else', () => {
    const row = tp('goorsh_to_lost');
    const { l, t } = goorsh.bounds;
    const top = ['plat_1323982673201', 'plat_1323982673202', 'plat_1323982673203', 'plat_1323982673204'].map((id) => plat(goorsh, id));
    const peak = Math.min(...top.flatMap((p) => [p.y1, p.y2])) - t;
    assert.equal(peak, 125, 'the treetop at world y -875');
    const rise = peak - row.box.y;
    assert.ok(rise > 0 && rise < PLAIN_JUMP_APEX, `a plain hop of ${rise} px`);
    assert.ok(row.box.x - row.box.w / 2 >= top[3].x1 - l - 20 && row.box.x + row.box.w / 2 <= top[2].x2 - l + 20, 'over the treetop');
    // Every other platform under the box is more than a canopy jump below it.
    for (const p of goorsh.platforms) {
      if (top.includes(p) || p.x2 - l < row.box.x - row.box.w / 2 || p.x1 - l > row.box.x + row.box.w / 2) continue;
      assert.ok(Math.min(p.y1, p.y2) - t - row.box.y > jumpApex(1, CANOPY_PHYSICS.gravity), p.id);
    }
  });

  it('Goorsh Gam: the 2011-12-15 treetop route is one walk with the client\'s jump, and broken with the remake\'s', () => {
    // From the ladder top's canopy (plat_1310611729880) and the middle canopy.
    const target = 'plat_1323982673202';
    assert.ok(reachable(goorsh, 'plat_1310611729880', CANOPY_PHYSICS).has(target));
    assert.ok(reachable(goorsh, 'plat_1337048686021', CANOPY_PHYSICS).has(target));
    assert.equal(reachable(goorsh, 'plat_1337048686021').has(target), false, 'plain remake physics cannot make plat_...191 -> 206');
    assert.deepEqual({ ...CANOPY_PHYSICS, jump: undefined }, { ...SOURCE_PHYSICS, jump: undefined });
    // The canopy line sits between the forest floor and the lowest treetop.
    const ladder = goorsh.ladders[0];
    assert.ok(CANOPY_Y < -100 && CANOPY_Y > ladder.y - ladder.h, 'the ladder climbs through it');
  });

  it('Odena Odes: in the ceiling pocket over the right end; a plain jump falls short, a triple jump does not', () => {
    const row = tp('odena_to_forgotten');
    const { l, t } = odena.bounds;
    const wall = odena.barriers.find((w) => w.id === 'wall_1323982673162');
    const roof = plat(odena, 'plat_1323982673163');
    assert.ok(row.box.x - row.box.w / 2 >= wall.x - l - 1 && row.box.x + row.box.w / 2 <= odena.bounds.r - l + 1, 'between the pocket wall and the street end');
    assert.equal(row.box.y - row.box.h, Math.round(Math.min(roof.y1, roof.y2) - t + 2), 'up to the pocket roof');
    const floor = plat(odena, 'plat_1311895253649');
    assert.equal(Math.round(yAt(floor, row.box.x + l)), ODENA_POCKET_FLOOR_Y);
    const rise = ODENA_POCKET_FLOOR_Y - t - row.box.y;
    assert.equal(rise, 160);
    assert.ok(jumpApex(1) < rise, `plain jump ${Math.round(jumpApex(1))}`);
    // Big 'Un Triple Jump, even standing and 150 ms late; Medium off a quick landing; spinach (vy_jump x1.5).
    assert.ok(jumpApex(scaledTripleJumpMultiplier(rawTripleJumpMultiplier(150, 0), 1)) > rise);
    assert.ok(jumpApex(scaledTripleJumpMultiplier(rawTripleJumpMultiplier(250, 0), 0.82)) < rise, 'a slow Medium one falls short');
    assert.ok(jumpApex(scaledTripleJumpMultiplier(rawTripleJumpMultiplier(150, 0), 0.7)) < rise, 'a lazy Baby one falls short');
    assert.ok(jumpApex(scaledTripleJumpMultiplier(rawTripleJumpMultiplier(50, 1), 0.82)) > rise);
    assert.ok(jumpApex(1.5) > rise, 'spinach');
    // The avatar can stand under it (x clamp WORLD_W - 24).
    assert.ok(inTeleporter(row, odena.bounds.r - l - 24, row.box.y - 1));
    assert.equal(inTeleporter(row, row.box.x, ODENA_POCKET_FLOOR_Y - t), false, 'standing under it does nothing');
  });

  it('both floors let you out past EXIT at their right end', () => {
    for (const [id, s] of [['lost_to_goorsh', lost], ['forgotten_to_odena', forgotten]]) {
      const row = tp(id);
      const W = s.bounds.r - s.bounds.l;
      const floorY = Math.max(...s.platforms.filter((p) => p.pc_perm === -1 && p.x2 >= s.bounds.r - 2).map((p) => p.y2)) - s.bounds.t;
      assert.equal(inTeleporter(row, W - 24, floorY), true, `${id}: walking into the right end`);
      assert.ok(EXIT_SIGNS[row.from].x < row.box.x - row.box.w / 2, `${id}: past the sign`);
    }
    // The forgotten floor's sign is its archived blank deco (sign_txt EXIT).
    const blank = forgotten.layers.find((l) => l.id === 'middleground').decos.find((d) => d.sprite === 'blank' && d.x === 708);
    const sign = EXIT_SIGNS[FORGOTTEN_FLOOR_TSID];
    assert.deepEqual([sign.x, sign.y], [blank.x - forgotten.bounds.l, blank.y - blank.h / 2 - forgotten.bounds.t]);
  });
});

describe('hidden-floors feature', () => {
  const stub = (player) => ({ player, data: {}, setData(k, v) { this.data[k] = v; }, param: () => null, transientInstance: () => false, homeContext: () => ({}) });

  it('is registered; the lost floor gets an empty ecology', () => {
    assert.ok(FEATURES.some((f) => f.id === hiddenFloorsFeature.id));
    assert.equal(hiddenFloorsFeature.ecologyOverride({ tsid: LOST_FLOOR_TSID }).empty, true);
    assert.equal(hiddenFloorsFeature.ecologyOverride({ tsid: FORGOTTEN_FLOOR_TSID }), null);
  });

  it('gives Goorsh Gam\'s canopy the client\'s physics, and only the canopy', () => {
    const p = { x: 500, y: 200 };
    const engine = stub(p);
    hiddenFloorsFeature.onStreetEnter(goorsh, engine);
    assert.deepEqual(engine.data.hiddenFloorBoxes, 'goorsh_to_lost');
    assert.deepEqual(hiddenFloorsFeature.physics(engine), { ...CANOPY_PHYSICS });
    p.y = 960; // the forest floor
    assert.equal(hiddenFloorsFeature.physics(engine), null);
    hiddenFloorsFeature.onStreetEnter(odena, stub({ x: 2716, y: 1443 }));
    assert.equal(hiddenFloorsFeature.physics(stub({ x: 2716, y: 200 })), null, 'nowhere else');
    hiddenFloorsFeature.onStreetClear();
  });
});
