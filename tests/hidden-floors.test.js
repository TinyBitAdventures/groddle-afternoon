/**
 * The hidden floors (register rows G92, G105): the lost floor rebuilt from
 * footage, Goorsh Gam's treetop teleporter into it, Odena Odes' teleporter
 * into the forgotten floor, the missing floor rebuilt from Snaps with
 * Ilmenskie's running-jump teleporter into it, and the ways back
 * (js/hidden-floors.js, tools/build-hidden-floors.mjs,
 * features/hidden-floors-feature.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=g442-6';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=g442-6';
import { SOURCE_PHYSICS } from '../public/js/puzzle-triggers.js';
import {
  AVATAR_BODY_H,
  CANOPY_PHYSICS,
  CANOPY_Y,
  EXIT_SIGNS,
  FORGOTTEN_FLOOR_TSID,
  GOORSH_GAM_TSID,
  ILMENSKIE_CEILINGS,
  ILMENSKIE_LAUNCH_Y,
  ILMENSKIE_RISE,
  ILMENSKIE_TSID,
  ILMENSKIE_ZONE,
  LOST_FLOOR_TSID,
  LOST_FLOOR_Y,
  MISSING_BAYS,
  MISSING_COLUMN_X,
  MISSING_EXIT_ARROW,
  MISSING_FLOOR,
  MISSING_FLOOR_TSID,
  MISSING_FLOOR_Y,
  MISSING_VINE,
  ODENA_ODES_TSID,
  ODENA_POCKET_FLOOR_Y,
  PILLARS,
  PLAIN_JUMP_APEX,
  TELEPORTERS,
  WINDOWS,
  bumpCeiling,
  ceilingsScreen,
  exitSignOn,
  inTeleporter,
  jumpApex,
  teleportersOn,
} from '../public/js/hidden-floors.js';
import { hiddenFloorsFeature } from '../public/js/features/hidden-floors-feature.js';
import { FEATURES } from '../public/js/features/index.js?v=registry-328';
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
const missing = street(MISSING_FLOOR_TSID);
const ilmenskie = street(ILMENSKIE_TSID);
const byTsid = { [LOST_FLOOR_TSID]: lost, [GOORSH_GAM_TSID]: goorsh, [ODENA_ODES_TSID]: odena, [FORGOTTEN_FLOOR_TSID]: forgotten, [MISSING_FLOOR_TSID]: missing, [ILMENSKIE_TSID]: ilmenskie };
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
      // The teleporter's server prefix is its floor's (A9 lost, DO forgotten, UV missing).
      const prefix = { [LOST_FLOOR_TSID]: 'A9', [FORGOTTEN_FLOOR_TSID]: 'DO', [MISSING_FLOOR_TSID]: 'UV' }[row.to] || row.from.slice(1, 3);
      assert.equal(row.objref.slice(1, 3), prefix, row.id);
    }
    assert.equal(tp('ilmenskie_to_missing').objref, MISSING_FLOOR.teleporter);
    assert.equal(MISSING_FLOOR.tsid.slice(1, 3), 'UV');
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

describe('The missing floor street', () => {
  it('is written, indexed and current (tools/build-hidden-floors.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-hidden-floors.mjs'), '--check'], { stdio: 'pipe' });
    assertStreetGeometry(missing);
    assert.match(missing.source, /^reconstruction/);
    assert.equal(missing.reconstructed, true);
    const row = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets[MISSING_FLOOR_TSID];
    assert.deepEqual([row.label, row.hubId, row.hubName, row.reconstructed], ['The missing floor', '51', 'Uralia', true]);
    assert.deepEqual(missing.signposts, [], 'teleporters are the only ways in and out');
    assert.equal(MISSING_FLOOR_TSID.slice(1), MISSING_FLOOR.tsid.slice(1));
  });

  it('is the Uralia floor GSJS names, off the hub map, with a template beside its siblings\'', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    const hub51 = maps.slice(maps.indexOf('\t\t\t"51"\t: {'));
    const names = hub51.slice(0, hub51.indexOf('}'));
    assert.match(names, /"LUV1CSSE49J2P2C"\t: "The missing floor"/);
    assert.match(names, /"LIF102FDNU11314"\t: "Ilmenskie"/);
    const map51 = maps.slice(maps.indexOf('function maps_get_maps_51('), maps.indexOf('function maps_get_maps_52('));
    assert.ok(map51.length > 0 && !map51.includes('LUV1CSSE49J2P2C'), 'not drawn on the Uralia map');
    assert.match(maps, /"LDO5720PH6J2T8P"\t: "The lost floor",\s*"LDO49MOHI8J221M"\t: "The forgotten floor",\s*"LDOKP2FHL8J25AQ"\t: "The missing floor"/);
  });

  it('dresses the Snaps\' stretch: TV, drain pipe, Discover Ix, cabinet, table and stools, lattice behind crossed planks, broken drip over a ripped decal, column, rug', () => {
    const mg = missing.layers.find((l) => l.id === 'middleground').decos;
    const fg = missing.layers.find((l) => l.id === 'T_missingfloor_front').decos;
    const at = (sprite, id) => mg.find((d) => d.sprite === sprite && (!id || d.id === id));
    const D = MISSING_BAYS.find((b) => b.id === 'D');
    const window = at('apartment_hall_wall_piece_window', 'bay_D');
    assert.equal(window.x, D.x);
    const lattice = at('ladder_trellis_1', 'lattice');
    assert.ok(lattice.x === D.x && lattice.z < window.z, 'the lattice shows through the arch');
    assert.ok(Math.abs(at('door_barricade_wood_1', 'window_planks').x - D.x) < 5, 'crossed planks over it');
    // Left of the window: TV over the drain pipe, then the poster, ripped; cabinet, table, vase, stools.
    const poster = at('apartment_poster_discover_ix', 'poster_discover_ix');
    const tv = at('bureaucratic_hall_tv_1');
    assert.ok(tv.x < poster.x && poster.x < D.x);
    assert.ok(Math.abs(at('shredded_poster_1', 'poster_ripped_C').x - poster.x) < 60, 'ripped across');
    for (const s of ['k04_counter_far', 'deco_table_wooden_ghtest', 'vase_1']) assert.ok(at(s).x < D.x && at(s).x > tv.x - 60, s);
    assert.equal(mg.filter((d) => d.sprite === 'deco_stool_wooden_ghtest').length, 2);
    // Right of it: the broken drip over the ripped decal, the crack, then the column.
    const drip = at('wallpipe_1', 'drip_pipe_E');
    const decal = at('torn_poster_1', 'poster_ripped_E');
    assert.ok(drip.x > D.x && Math.abs(drip.x - decal.x) < 40 && drip.y < decal.y - decal.h + 40, 'the drip hangs over the decal');
    assert.ok(mg.some((d) => d.sprite === 'cave_drip_03' && Math.abs(d.x - drip.x) < 10));
    const column = fg.find((d) => d.id === 'column');
    assert.ok(column.x + missing.bounds.l > decal.x && column.x + missing.bounds.l - MISSING_COLUMN_X < 60);
    assert.ok(mg.filter((d) => d.sprite === 'hanging_lightbulb').length >= 12, 'the bulbs along the ceiling pipe');
    assert.ok(mg.some((d) => d.sprite === 'apartment_hall_lightbulb'));
    assert.ok(mg.some((d) => d.sprite === 'apartment_rug_red' && d.x > D.x));
    // The guide: ripped posters, dripping faucets, a climbable vine.
    assert.ok(mg.filter((d) => /poster_ripped/.test(d.id || '')).length >= 4);
    assert.ok(at('k04_sink_01', 'sink') && mg.filter((d) => d.sprite === 'cave_drip_03').length >= 3);
    assert.ok(at('ladder_vine_1', 'vine'));
  });

  it('uses only decos on disk', () => {
    const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
    for (const layer of missing.layers) for (const d of layer.decos) assert.ok(manifest.has(d.sprite), `${layer.id}: ${d.sprite}`);
  });

  it('has one walk line from wall to wall, and the vine climbs to its shelf', () => {
    const floor = plat(missing, 'plat_missing_floor');
    assert.deepEqual([floor.x1, floor.x2, floor.y1, floor.y2], [missing.bounds.l, missing.bounds.r, MISSING_FLOOR_Y, MISSING_FLOOR_Y]);
    const [vine] = missing.ladders;
    const shelf = plat(missing, 'plat_missing_shelf');
    assert.equal(vine.x, MISSING_VINE.x);
    assert.equal(vine.y, MISSING_FLOOR_Y, 'from the floor');
    assert.ok(vine.y - vine.h <= shelf.y1 && vine.y - vine.h > shelf.y1 - 20, 'to the shelf');
    assert.ok(shelf.x1 <= vine.x && shelf.x2 > vine.x);
    assert.ok(jumpApex(1) < MISSING_FLOOR_Y - shelf.y1, 'only the vine gets you up there');
  });

  it('lets you out at the right end, past the painted arrow', () => {
    const row = tp('missing_to_ilmenskie');
    const W = missing.bounds.r - missing.bounds.l;
    assert.equal(inTeleporter(row, W - 24, MISSING_FLOOR_Y - missing.bounds.t), true, 'walking into the right end');
    assert.ok(MISSING_EXIT_ARROW.x - missing.bounds.l < row.box.x - row.box.w / 2, 'past the arrow');
    assert.ok(MISSING_EXIT_ARROW.x > MISSING_BAYS.find((b) => b.id === 'G').x);
    assert.equal(exitSignOn(MISSING_FLOOR_TSID), null, 'no word on record');
  });
});

describe('Ilmenskie\'s top-right corner (2011-12-15)', () => {
  const { l, t } = ilmenskie.bounds;
  const row = tp('ilmenskie_to_missing');
  const cap = plat(ilmenskie, 'pl1271412334381');
  const apex = (ms, speed, upgrade) => jumpApex(scaledTripleJumpMultiplier(rawTripleJumpMultiplier(ms, speed), upgrade), CANOPY_PHYSICS.gravity);

  it('keeps the archived ledge, walls and ceilings the box is laid on', () => {
    const ledge = plat(ilmenskie, 'plat_1323982673210');
    assert.deepEqual([ledge.x1, ledge.y1, ledge.x2, ledge.pc_perm], [2668, -890, 2739, -1]);
    for (const id of ILMENSKIE_CEILINGS) assert.equal(plat(ilmenskie, id).pc_perm, 1, `${id} is a ceiling`);
    const walls = Object.fromEntries(ilmenskie.barriers.filter((w) => /^wall_13239826732/.test(w.id)).map((w) => [w.id, w]));
    assert.deepEqual([walls.wall_1323982673211.x, walls.wall_1323982673211.y, walls.wall_1323982673211.h], [2688, -887, 64]);
    assert.deepEqual([walls.wall_1323982673212.x, walls.wall_1323982673212.y, walls.wall_1323982673212.h], [2739, -999, 108]);
    // The box covers the ledge and the air left of it, up to the street's top.
    assert.ok(row.box.x - row.box.w / 2 <= ledge.x1 - l - 60 && row.box.x + row.box.w / 2 >= ledge.x2 - l);
    assert.equal(row.box.y - row.box.h, 0);
    assert.equal(row.box.y, ILMENSKIE_LAUNCH_Y - ILMENSKIE_RISE - t);
    assert.equal(cap.y1, ILMENSKIE_LAUNCH_Y);
  });

  it('a running Triple Jump off the mushroom cap gets there; a standing one, a plain jump or spinach does not', () => {
    assert.ok(apex(0, 1, 1) > ILMENSKIE_RISE + 100, 'Big \'Un at full speed');
    assert.ok(apex(50, 1, 1) > ILMENSKIE_RISE, 'Big \'Un, a little late');
    assert.ok(apex(0, 1, 0.82) > ILMENSKIE_RISE, 'Medium at full speed');
    assert.ok(apex(0, 1, 0.7) > ILMENSKIE_RISE, 'Baby at full speed, landing and jumping as one');
    assert.ok(apex(0, 0, 1) < ILMENSKIE_RISE, 'a standing Big \'Un falls short');
    assert.ok(apex(50, 1, 0.82) < ILMENSKIE_RISE, 'a late Medium falls short');
    assert.ok(jumpApex(1, CANOPY_PHYSICS.gravity) < ILMENSKIE_RISE / 2);
    assert.ok(jumpApex(1.5, CANOPY_PHYSICS.gravity) < ILMENSKIE_RISE, 'spinach alone');
    // Nothing else under the box is within a full-speed Big 'Un of it.
    for (const p of ilmenskie.platforms) {
      if (p === cap || ILMENSKIE_CEILINGS.includes(p.id) || p.id === 'plat_1323982673210') continue;
      if (Math.max(p.x1, p.x2) - l < row.box.x - row.box.w / 2 - 150 || Math.min(p.x1, p.x2) - l > row.box.x + row.box.w / 2) continue;
      const top = Math.min(p.y1, p.y2) - t;
      if (p.id === 'pl1271412363973') continue; // the Entrance ledge: shut off by the ceilings (below)
      assert.ok(top - row.box.y > apex(0, 1, 1), p.id);
    }
  });

  it('the ceilings stop a jump straight up from the Entrance ledge', () => {
    const ceilings = ceilingsScreen(ilmenskie);
    assert.deepEqual(ceilings.map((c) => c.id).sort(), [...ILMENSKIE_CEILINGS].sort());
    const ledgeY = -438 - t;
    for (const x of [2760, 2800, 2900, 2990].map((wx) => wx - l)) {
      // A standing Big 'Un from the ledge rises ~306 px: the head meets the ceiling first.
      const y = bumpCeiling(ceilings, x, ledgeY, x, ledgeY - apex(0, 0, 1));
      assert.ok(y !== null && y > row.box.y, `x ${x + l}`);
    }
    // Coming down from above, or passing left of them, nothing stops.
    assert.equal(bumpCeiling(ceilings, 2700 - l, -900 - t, 2700 - l, -880 - t), null);
    assert.equal(bumpCeiling(ceilings, 2650 - l, -500 - t, 2650 - l, -850 - t), null);
    assert.equal(AVATAR_BODY_H, 80);
  });

  it('the slope to the caps is a client jump over the ground: the right end moves as the client did', () => {
    // Ground (pl1266967749448) -> slope (pl1271412282623) -> flat -> mushroom cap.
    assert.ok(reachable(ilmenskie, 'pl1266967749448', CANOPY_PHYSICS).has('pl1271412334381'));
    assert.equal(reachable(ilmenskie, 'pl1266967749448').has('pl1271412282623'), false, 'not with the remake\'s jump');
    const slope = plat(ilmenskie, 'pl1271412282623');
    assert.ok(ILMENSKIE_ZONE.x < slope.x1 - 150, 'the run-up is in the zone');
  });

  it('lands back on the ground under the corner', () => {
    const back = tp('missing_to_ilmenskie');
    assert.equal(back.arrive.x + l, 2600);
    assert.ok(back.arrive.y + t > -120 && back.arrive.y + t < -80);
  });
});

describe('hidden-floors feature', () => {
  const stub = (player) => ({ player, data: {}, setData(k, v) { this.data[k] = v; }, param: () => null, transientInstance: () => false, homeContext: () => ({}) });

  it('is registered; the lost and missing floors get an empty ecology', () => {
    assert.ok(FEATURES.some((f) => f.id === hiddenFloorsFeature.id));
    assert.equal(hiddenFloorsFeature.ecologyOverride({ tsid: LOST_FLOOR_TSID }).empty, true);
    assert.equal(hiddenFloorsFeature.ecologyOverride({ tsid: MISSING_FLOOR_TSID }).empty, true);
    assert.equal(hiddenFloorsFeature.ecologyOverride({ tsid: FORGOTTEN_FLOOR_TSID }), null);
  });

  it('Ilmenskie: ceilings leave the walkable platforms, bump a rising head, and the right end gets the client\'s physics', () => {
    const copy = JSON.parse(JSON.stringify(ilmenskie));
    hiddenFloorsFeature.prepareStreet(copy);
    hiddenFloorsFeature.prepareStreet(copy); // idempotent
    assert.equal(copy.platforms.length, ilmenskie.platforms.length - ILMENSKIE_CEILINGS.length);
    assert.ok(!copy.platforms.some((p) => ILMENSKIE_CEILINGS.includes(p.id)));
    const p = { x: 2800 - copy.bounds.l, y: -438 - copy.bounds.t, vx: 0, vy: 0 };
    const engine = { ...stub(p), started: true, acting: () => false, questDialogueOpen: () => false };
    hiddenFloorsFeature.onStreetEnter(copy, engine);
    assert.equal(engine.data.hiddenFloorBoxes, 'ilmenskie_to_missing');
    assert.deepEqual(hiddenFloorsFeature._state().ceilings.sort(), [...ILMENSKIE_CEILINGS].sort());
    assert.deepEqual(hiddenFloorsFeature.physics(engine), { ...CANOPY_PHYSICS });
    hiddenFloorsFeature.onTick(16, Date.now(), engine);
    // Rise 300 px in one step: the head stops under plat_1323982673208.
    p.y -= 300;
    p.vy = -12;
    hiddenFloorsFeature.onTick(16, Date.now(), engine);
    const ceilingY = -722 - (2825 - 2800) / (2825 - 2744) * (773 - 722) - copy.bounds.t;
    assert.ok(Math.abs(p.y - AVATAR_BODY_H - ceilingY) < 1, `feet ${p.y}`);
    assert.equal(p.vy, 0);
    assert.equal(hiddenFloorsFeature._state().bumps, 1);
    // West of the street's right end the plain physics apply.
    p.x = 1500 - copy.bounds.l;
    assert.equal(hiddenFloorsFeature.physics(engine), null);
    hiddenFloorsFeature.onStreetClear();
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
