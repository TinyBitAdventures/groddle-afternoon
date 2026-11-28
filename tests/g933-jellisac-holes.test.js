/**
 * G933 (#453, #460): on Quinmchary a planned Jellisac sat on a ledge while the street's third hole
 * (ground_cutaway_hollow3 at 577,657) stood empty. Jellisacs live in the ground cutaway hollows
 * (168 of the 211 measured on players' snaps sit in one), so one the snaps never measured is seated
 * in an empty hole before any is planned on a floor (tools/build-jellisac-hole-spots.mjs).
 *
 * G939 (the placement audit of all 261): a hole is the deco street-render.js turns about its bottom
 * centre, so a seat goes on the turned opening's centre (Blottnass' hollows lie on their sides); never
 * two in one hole; open holes before the ones art is drawn over (Lagan Lark's stalks); and a planned
 * Jellisac stands on flat floor, out from behind the front layers (Quinmchary's curtain, Clam
 * Calumny's root pipe).
 *
 * Run: node --test tests/g933-jellisac-holes.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COVER_BAR,
  HOLE_DROP,
  SEAT_GAP,
  buildJellisacHoleSpots,
  coverDecos,
  holeCoverShare,
  inHole,
  sackCentre,
  seatInHoles,
  streetHoles,
} from '../tools/build-jellisac-hole-spots.mjs';
import { JELLISAC_SPOTS } from '../public/js/node-spots-data.js?v=97d4281c';
import { JELLISAC_HOLE_SPOTS } from '../public/js/jellisac-hole-spots-data.js?v=256c00e9';
import {
  STEADY_FLOOR_GROUPS,
  ecologyForStreet,
  frontDecoCovers,
  hiddenBehindFront,
  measuredNodeSpots,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=1c840641';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=23555e53';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const index = JSON.parse(read('public/assets/streets/index.json'));
const ecology = JSON.parse(read('public/assets/content/street-ecology.json'));
const masks = JSON.parse(read('tools/jellisac-hole-masks.json')).masks;
const streetOf = (tsid) => JSON.parse(read(`public/${index.streets[tsid].file}`));
const QUINMCHARY = 'GTJ101FB0SO17JK';
const BLOTTNASS = 'GTJLTCN21IQ1URB';
const LAGAN_LARK = 'GTJ2S0EVDSV1HQ0';
const CLAM_CALUMNY = 'GTJ1024R2DQ1B5S';
const hole = (cx, cy, extra = {}) => ({ sprite: 'ground_cutaway_hollow3', cx, cy, ex: 24, ey: 28, ...extra });

describe('Jellisacs sit in their street\'s empty holes first (#453)', () => {
  it('the data file is current', () => {
    const built = buildJellisacHoleSpots();
    assert.deepEqual(built.unmeasured, [], 'run node tools/build-jellisac-hole-spots.mjs --measure');
    assert.equal(read('public/js/jellisac-hole-spots-data.js'), built.text, 'run node tools/build-jellisac-hole-spots.mjs');
  });

  it('Quinmchary seats its tenth Jellisac in the third hole, the nine measured first in their order', () => {
    const street = streetOf(QUINMCHARY);
    assert.deepEqual(streetHoles(street).map((h) => h.x), [63, 111, 577]);
    const rows = measuredNodeSpots(QUINMCHARY).jellisac;
    assert.equal(rows.length, 10);
    assert.deepEqual(rows.slice(0, 9).map((r) => [r.x, r.y]), JELLISAC_SPOTS[QUINMCHARY].map(([x, y]) => [x, y]));
    // G939: on the opening's centre (577, 628.5) less HOLE_DROP: the sack's centre 4 px under it.
    assert.deepEqual([rows[9].x, rows[9].y], [577, 656.5]);
  });

  it('a hole a measured Jellisac sits in is taken; never more than the file names', () => {
    const measured = [[100, 524, 1]];
    const holes = [hole(100, 498), hole(400, 600), hole(700, 610)];
    assert.deepEqual(seatInHoles(measured, holes, 2), [[100, 524, 1], [400, 628, 1]]);
    assert.deepEqual(seatInHoles(measured, holes, 1), [[100, 524, 1]]);
    assert.equal(seatInHoles([], holes, 5).length, 3);
  });

  it('only the middleground hollows count (a background layer\'s are drawn elsewhere)', () => {
    const street = { bounds: { l: -100, t: -500 }, layers: [
      { name: 'bg_2', decos: [{ sprite: 'ground_cutaway_hollow2', x: 0, y: 0, w: 27, h: 44 }] },
      { name: 'middleground', decos: [{ sprite: 'ground_cutaway_hollow3', x: 0, y: 0, w: 49, h: 57 }, { sprite: 'ground_cutaway_fossil1', x: 10, y: 0, w: 99, h: 50 }] },
    ] };
    const holes = streetHoles(street);
    assert.equal(holes.length, 1);
    assert.deepEqual([holes[0].x, holes[0].y, holes[0].cx, holes[0].cy], [100, 500, 100, 471.5]);
  });
});

describe('G939: every hole holds one Jellisac, seated in its turned opening', () => {
  it('a turned hollow\'s opening is beside its deco point: Blottnass\' r -87 hole at 879,31 seats at 850.5', () => {
    const h = streetHoles(streetOf(BLOTTNASS)).find((k) => k.x === 879 && k.y === 31);
    assert.equal(h.r, -87);
    assert.ok(Math.abs(h.cx - 850.5) < 0.5 && Math.abs(h.cy - 29.5) < 0.5, `${h.cx},${h.cy}`);
    // Before: [879, 27], the sack hanging 28 px right of the opening, half out of it.
    assert.ok(JELLISAC_HOLE_SPOTS[BLOTTNASS].some(([x, y]) => x === 850.5 && y === 57.5));
    assert.ok(!JELLISAC_HOLE_SPOTS[BLOTTNASS].some(([x]) => x === 879));
  });

  it('never two in one hole, and no two seats closer than SEAT_GAP', () => {
    const doubled = [];
    for (const [tsid, rows] of Object.entries(JELLISAC_HOLE_SPOTS)) {
      const holes = streetHoles(streetOf(tsid));
      for (const h of holes) {
        const inIt = rows.filter((r) => inHole(h, sackCentre(r)));
        if (inIt.length > 1) doubled.push(`${tsid} ${h.x},${h.y}: ${inIt.map((r) => r.join(',')).join(' ')}`);
      }
      const measured = JELLISAC_SPOTS[tsid]?.length || 0;
      rows.slice(measured).forEach((r, i) => rows.forEach((o, j) => {
        if (j === measured + i) return;
        const [ax, ay] = sackCentre(r);
        const [bx, by] = sackCentre(o);
        if (Math.hypot(ax - bx, ay - by) < SEAT_GAP) doubled.push(`${tsid} ${r.join(',')} by ${o.join(',')}`);
      }));
    }
    assert.deepEqual(doubled, []);
  });

  it('every hole-seated Jellisac sits within its hole\'s opening, its sack HOLE_DROP under the centre', () => {
    const off = [];
    let seated = 0;
    for (const [tsid, rows] of Object.entries(JELLISAC_HOLE_SPOTS)) {
      const holes = streetHoles(streetOf(tsid));
      for (const r of rows.slice(JELLISAC_SPOTS[tsid]?.length || 0)) {
        seated += 1;
        const c = sackCentre(r);
        const h = holes.find((k) => inHole(k, c));
        if (!h) { off.push(`${tsid} ${r.join(',')} in no hole`); continue; }
        if (Math.abs(c[0] - h.cx) > 0.5 || Math.abs(c[1] - (h.cy + HOLE_DROP[h.sprite])) > 0.5) off.push(`${tsid} ${r.join(',')} off ${h.x},${h.y}`);
        if (Math.abs(c[0] - h.cx) > h.ex || Math.abs(c[1] - h.cy) > h.ey) off.push(`${tsid} ${r.join(',')} outside ${h.x},${h.y}`);
      }
    }
    assert.deepEqual(off, []);
    assert.equal(seated, 42);
  });

  it('counts: each street\'s list is the file\'s count or every hole it has; 42 seated on 20 streets', () => {
    const short = [];
    for (const [tsid, rows] of Object.entries(JELLISAC_HOLE_SPOTS)) {
      const named = ecology.streets[tsid].counts.jellisac;
      const measured = JELLISAC_SPOTS[tsid] || [];
      assert.ok(rows.length <= named, tsid);
      assert.deepEqual(rows.slice(0, measured.length), measured.map((r) => [...r]), `${tsid} keeps its measured rows first`);
      const free = streetHoles(streetOf(tsid)).filter((h) => !measured.some((r) => inHole(h, sackCentre(r))));
      if (rows.length < named && rows.length - measured.length < free.length) short.push(tsid);
    }
    assert.deepEqual(short, [], 'a street short of its count leaves no free hole');
    assert.equal(Object.keys(JELLISAC_HOLE_SPOTS).length, 20);
  });

  it('Lagan Lark takes its two open holes, not the two its hang_branch stalks curl over', () => {
    const street = streetOf(LAGAN_LARK);
    const covers = coverDecos(street);
    const share = (x) => holeCoverShare(streetHoles(street).find((h) => h.x === x), covers, masks);
    assert.ok(share(119) >= COVER_BAR && share(232) >= COVER_BAR, `${share(119)} ${share(232)}`);
    assert.ok(share(490) < COVER_BAR && share(2066) < COVER_BAR, `${share(490)} ${share(2066)}`);
    const seats = JELLISAC_HOLE_SPOTS[LAGAN_LARK].slice(JELLISAC_SPOTS[LAGAN_LARK].length).map(([x]) => x);
    assert.deepEqual(seats, [490, 2066]);
    // A covered hole still comes before none: the order only.
    assert.deepEqual(seatInHoles([], [hole(100, 500, { cover: 0.9 }), hole(300, 500)], 2).map(([x]) => x), [100, 300]);
    assert.deepEqual(seatInHoles([], [hole(100, 500, { cover: 0.9 }), hole(300, 500)], 1).map(([x]) => x), [300]);
  });
});

describe('G939: a planned Jellisac stands on flat floor, out from behind the front layers', () => {
  setStreetEcologyCatalog(ecology);
  setZoneStreetsShown(false);
  applyStreetIndex(index);
  const planned = async (tsid) => {
    const data = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
    const pop = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === index.default });
    const reserved = streetReservedSpots(data);
    const plan = planStreetPlacements(platformsScreen(data), placementRequests(pop), { worldW: streetWidth(data), seed: data.tsid, reserved });
    return { points: plan.groups['resource:jellisac'] || [], fronts: frontDecoCovers(data) };
  };

  it('the rule: no floor steeper than 0.1', () => {
    assert.equal(STEADY_FLOOR_GROUPS['resource:jellisac'].maxSlope, 0.1);
  });

  it('Quinmchary\'s eleventh is not behind the foreground curtain, nor Clam Calumny\'s inside the root pipe', async () => {
    const q = await planned(QUINMCHARY);
    assert.equal(q.points.length, 1);
    // Before: 1121, 715, behind the curtain (71% of the sack hidden in the contact sheet).
    assert.equal(hiddenBehindFront({ x: 1121, y: 715 }, 'resource:jellisac', q.fronts), true);
    assert.equal(hiddenBehindFront(q.points[0], 'resource:jellisac', q.fronts), false);
    const c = await planned(CLAM_CALUMNY);
    assert.equal(c.points.length, 2);
    // Before: 1660, 565, inside ground_rootpipe2 on the foreground.
    for (const p of c.points) {
      assert.ok(Math.abs(p.x - 1660) > 60, `${p.x}`);
      assert.equal(hiddenBehindFront(p, 'resource:jellisac', c.fronts), false);
    }
  });
});
