/**
 * Wintry Place (Austin 2026-11-07, live v0.22.0: "I think this is still a trap quest. You can get
 * in and can't get out then die."). GM11E7ODKHO1QJE, entered by Northwest Passage's snowy portal
 * or Newcot Close's locked door; its two signposts are signpost_1 on the top ledge (to Newcot
 * Close, still being built on a fresh world) and signpost_2 on the floor (to Northwest Passage).
 *
 * - The one trap is Tiny Speck's: the slot right of the stacked ice blocks, between the solid wall
 *   wall_1254812464461 (x 1960, top -221) and the street's end, floor pl1254812505169 at -128.
 *   Walking right off the blocks drops you in; leaving takes about 89 px of lift, which a new
 *   character's jump (x0.7105, about 70 px) doesn't have. High Jumper I and II get out.
 * - /stuck after a load or a return used the nearest way in: from the slot that was signpost_1 on
 *   the top ledge, beside the road still being built. Now the nearest way you can leave by.
 * - The /stuck hint listed the whole floor, so a new character could spend the one hint walking
 *   the open floor under the blocks. Now only the slot counts.
 * - The cold is the source's (catalog_buffs.js 1186-1216 kukubee_winter_negative: 1 energy a
 *   second on the three winter streets, a hint every fifth tick); it can croak you there, as it
 *   did in Glitch (the street's archived Graveside Marker, LM11E7ODKHO1QJE.xml 22).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformYAt, platformsScreen, stuckWay, worldToScreen } from '../public/js/street-model.js?v=b6cb6a4e';
import { reachStreet, streetBuff } from '../public/js/builder/reach-graph.js?v=d03eeab1';
import { STREET_TRAPS } from '../public/js/street-traps-data.js?v=b2911c49';
import { onTrapFloor, trapLinesOn } from '../public/js/features/slash-commands-feature.js?v=91bfd59f';
import { trapEntry } from '../tools/ecology/build-street-traps.mjs';
import { DRINK_TICKS } from '../public/js/buffs.js?v=c499cf1a';
import { coldPlaceMessage, isKukubeeWinter } from '../public/js/buff-triggers.js?v=a3093922';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WINTRY = 'GM11E7ODKHO1QJE';
const NEWCOT = 'GCRHJHOFQNL1PHP';
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const wintry = street(WINTRY);
const xml = join(root, '../streets/mnt/stos/location_data/GM11E7ODKHO1QJE.xml');
const gsjs = join(root, '../glitch-GameServerJS/items/catalog_buffs.js');
const S = (x, y) => worldToScreen(wintry, x, y);
/** Newcot Close's door_1 lands on the top ledge (world 1905, -800); the portal lands on the floor at -1829. */
const DOOR = { x: 3905, y: 210, from: 'GCRHJHOFQNL1PHP/door_1' };
const PORTAL = { ...S(-1829, -132), from: 'portal' };
const reach = (arr, jump) => reachStreet(wintry, arr, { jumpGrab: true, buff: { ...streetBuff(wintry).buff, jump } });

describe('Wintry Place: the slot right of the ice blocks', () => {
  it('is Tiny Speck\'s own geometry: a solid wall at x 1960 over the floor that runs on to 1991', () => {
    const wall = wintry.barriers.find((w) => w.id === 'wall_1254812464461');
    assert.deepEqual([wall.x, wall.y, wall.h, wall.pc_perm], [1960, -221, 85, null]);
    const floor = wintry.platforms.find((p) => p.id === 'pl1254812505169');
    assert.deepEqual([floor.x1, floor.y1, floor.x2, floor.y2], [1132, -139, 1991, -128]);
    assert.equal(wintry.bounds.r, 2000);
    if (!existsSync(xml)) return;
    const src = readFileSync(xml, 'utf8');
    assert.match(src, /<object id="wall_1254812464461">\s*<int id="y">-221<\/int>\s*<null id="pc_perm"\/>\s*<int id="w">0<\/int>\s*<int id="h">85<\/int>\s*<null id="item_perm"\/>\s*<int id="x">1960<\/int>/);
  });

  it('traps a new character who comes down from the top ledge, and nobody with High Jumper', () => {
    const [trap] = reach([DOOR], 0.7105).traps;
    assert.equal(trap.line, 'pl1254812505169');
    assert.ok(trap.points < trap.stands, 'only part of the floor');
    for (const [a, b] of trap.runs) assert.ok(a >= S(1960, 0).x && b <= S(1980, 0).x, `${a}..${b}`);
    assert.deepEqual(reach([DOOR], 0.907).traps, []);
    assert.deepEqual(reach([DOOR], 1).traps, []);
  });

  it('a new character from the portal never gets up there, and leaves by signpost_2', () => {
    const r = reach([PORTAL], 0.7105);
    assert.deepEqual(r.traps, []);
    assert.deepEqual(r.targets.map((t) => [t.id, t.reachedFrom[0]]), [['signpost_1', false], ['signpost_2', true]]);
  });
});

describe('Wintry Place: the /stuck hint counts only the slot', () => {
  const lines = trapLinesOn(wintry, STREET_TRAPS);
  const stand = (wx) => {
    const x = S(wx, 0).x;
    const p = platformsScreen(wintry).find((q) => q.id === 'pl1254812505169');
    return { x, y: platformYAt(p, x), onGround: true };
  };

  it('lists the floor with the slot\'s run, not the whole floor', () => {
    const entry = STREET_TRAPS[WINTRY].pl1254812505169;
    assert.ok(Array.isArray(entry));
    assert.deepEqual(entry.map((r) => r[0]), [0.7105]);
    assert.equal(lines.length, 1);
  });

  it('in the slot with a new character\'s jump: yes; under the blocks, or with High Jumper: no', () => {
    assert.equal(onTrapFloor(lines, stand(1970), 0.7105), true);
    assert.equal(onTrapFloor(lines, stand(1600), 0.7105), false, 'the floor under the blocks walks out left');
    assert.equal(onTrapFloor(lines, stand(1970), 0.907), false);
  });

  it('a floor that traps all along stays a plain number; runs a higher jump also traps are left to it', () => {
    assert.equal(trapEntry([{ jump: 0.7105, whole: true, runs: [[0, 80]] }, { jump: 1, whole: true, runs: [[0, 80]] }]), 1);
    assert.deepEqual(trapEntry([{ jump: 0.7105, whole: false, runs: [[100, 120], [300, 340]] }, { jump: 0.907, whole: false, runs: [[300, 340]] }]),
      [[0.7105, 96, 124], [0.907, 296, 344]]);
  });
});

describe('Wintry Place: /stuck goes to a way out', () => {
  const slotX = S(1970, 0).x;

  it('from the slot, signpost_2 on the floor while Newcot Close is still being built', () => {
    const way = stuckWay(wintry, slotX, [NEWCOT]);
    assert.deepEqual(way, { ...S(-1650, -150), open: true });
  });

  it('with Newcot Close built, the nearest post again (signpost_1 on the top ledge)', () => {
    assert.deepEqual(stuckWay(wintry, slotX, []), { ...S(1726, -798), open: true });
    // Either tsid prefix names the closed street.
    assert.deepEqual(stuckWay(wintry, slotX, [`L${NEWCOT.slice(1)}`]), { ...S(-1650, -150), open: true });
  });

  it('doors are screen space, and a locked one is not a way out (Newcot Close\'s door to Wintry Place, key 5)', () => {
    const newcot = street(NEWCOT);
    const door = newcot.doors.find((d) => d.id === 'door_1');
    const way = stuckWay(newcot, door.x, []);
    assert.equal(way.open, true);
    assert.notDeepEqual([way.x, way.y], [door.x, door.y]);
    assert.deepEqual(stuckWay({ ...newcot, signposts: [] }, door.x, []), { x: door.x, y: door.y, open: false });
  });
});

describe('Wintry Place: the cold is the source\'s', () => {
  it('A Cold Place loses 1 energy a second on the three winter streets, with a hint every fifth tick', () => {
    const buffs = JSON.parse(readFileSync(join(root, 'public/assets/content/buffs.json'), 'utf8'));
    assert.equal(buffs.kukubee_winter_negative.tickDuration, 1);
    assert.deepEqual(DRINK_TICKS.kukubee_winter_negative, { energy: -1 });
    assert.equal(isKukubeeWinter(WINTRY), true);
    assert.deepEqual([1, 5, 10, 15].map(coldPlaceMessage), ['', 'Eating something hearty will protect you from the cold.', 'Eating something hearty will protect you from the cold.', 'Eating something hearty will protect you from the cold.']);
    assert.equal(buffs.kukubee_winter_positive.duration, 60);
    if (!existsSync(gsjs)) return;
    const src = readFileSync(gsjs, 'utf8');
    const block = src.slice(src.indexOf('"kukubee_winter_negative"'), src.indexOf('"kukubee_winter_positive"'));
    assert.match(block, /tick_duration\t: 1,/);
    assert.match(block, /pc\.metabolics_lose_energy\(1\);/);
  });
});
