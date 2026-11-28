/**
 * #490 (R2): a Peat Bog planned behind a front hut on Raudan Rasp (GIFNIC9JFOU1B2S, peat_1:0 at
 * 2786, 987 behind middleplus bottletree_burb_wndw_2). The planner's behind-front-art check
 * (street-ecology.js hiddenBehindFront) knew only trees, rocks, Piggies, shrines, vendors and
 * Jellisacs; every node kind it seats now has its art's box (FRONT_BOXES), so a spot the front
 * art mostly covers is taken last. Spots measured on the 2012 snaps are kept as measured.
 *
 * Run: node --test tests/front-art-nodes.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  FRONT_BOXES,
  FRONT_HIDE_SHARE,
  RESOURCE_NODE_CLASSES,
  ecologyForStreet,
  frontCoverShare,
  frontDecoCovers,
  hiddenBehindFront,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=36fd044b';
import { UNPLANNED_RESOURCE_CLASSES, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=479849b6';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=23555e53';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
setStreetEcologyCatalog(JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8')));
// As the realtime builders and a multiplayer page load streets.
setZoneStreetsShown(false);
applyStreetIndex(index);

const RAUDAN_RASP = 'GIFNIC9JFOU1B2S';
// Fireflies wander a fly box over their spot (resource-nodes-feature placeFirefly); Sloths are never planned.
const FLYING = ['npc_firefly'];

function planOf(data, reseat = true) {
  const pop = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === index.default });
  return planStreetPlacements(platformsScreen(data), placementRequests(pop), { worldW: streetWidth(data), seed: data.tsid, reserved: streetReservedSpots(data), reseat });
}

function nodesOf(data) {
  const pop = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === index.default });
  const plan = planOf(data);
  return resourceSpawnPlan(pop, (key) => plan.groups[key] || []);
}

const share = (row, fronts) => frontCoverShare(row, ...FRONT_BOXES[`resource:${row.classTsid}`], fronts);

describe('#490 planned nodes stay out from behind the front art', () => {
  it('every node kind the planner seats has a front-art box', () => {
    for (const cls of RESOURCE_NODE_CLASSES) {
      if (UNPLANNED_RESOURCE_CLASSES.includes(cls) || FLYING.includes(cls)) continue;
      const box = FRONT_BOXES[`resource:${cls}`];
      assert.ok(Array.isArray(box) && box[0] > 0 && box[1] > 0, cls);
    }
  });

  it('Raudan Rasp plans its Peat Bogs clear of the front hut', async () => {
    const data = await loadStreetDataFromFs(RAUDAN_RASP, streetsDir);
    const fronts = frontDecoCovers(data);
    // Before: peat_1:0 on the floor behind bottletree_burb_wndw_2, all of its mound covered.
    const before = { x: 2786, y: 985.5 };
    assert.ok(frontCoverShare(before, ...FRONT_BOXES['resource:peat_1'], fronts) >= FRONT_HIDE_SHARE);
    assert.equal(hiddenBehindFront(before, 'resource:peat_1', fronts), true);
    const peat = nodesOf(data).filter((r) => r.classTsid === 'peat_1' && !r.wall);
    assert.ok(peat.length >= 1);
    for (const r of peat) assert.ok(share(r, fronts) < FRONT_HIDE_SHARE, `${r.key} ${Math.round(r.x)},${Math.round(r.y)}`);
  });

  it('only the covered nodes move, each at its turn: the groups before it keep their spots (a stable layout)', async () => {
    let moved = 0;
    for (const tsid of Object.keys(index.streets).filter((t) => !/^GZ/.test(t)).sort()) {
      let data;
      try { data = await loadStreetDataFromFs(tsid, streetsDir); } catch { continue; }
      const fronts = frontDecoCovers(data);
      const pop = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === index.default });
      const after = planOf(data);
      const before = planOf(data, false);
      // Each moved node was covered where the planner put it and is clear where it stands now.
      for (const m of after.moved) {
        const q = after.groups[m.key][m.index];
        assert.equal(hiddenBehindFront(m.from, m.key, fronts), true, `${tsid} ${m.key}:${m.index} was covered`);
        assert.equal(hiddenBehindFront(q, m.key, fronts), false, `${tsid} ${m.key}:${m.index} is clear now`);
        moved += 1;
      }
      // R43 (#680): a covered node moves before the next group is planned, so the groups after it are
      // planned round where it stands (never moved by it later); up to the first group with a move, and
      // in that group every node but the moved ones, the layout is the plan without the move.
      const movedKeys = new Set(after.moved.map((m) => `${m.key}:${m.index}`));
      for (const { key } of placementRequests(pop)) {
        (before.groups[key] || []).forEach((p, i) => {
          if (movedKeys.has(`${key}:${i}`)) return;
          const q = after.groups[key][i];
          assert.deepEqual([q.x, q.y], [p.x, p.y], `${tsid} ${key}:${i} moved without being covered`);
        });
        if (after.moved.some((m) => m.key === key)) break;
      }
    }
    // Census (2026-11-18): only the covered planned nodes move (344 rows of the server data/objects.json;
    // the rest are solo-only Dust Traps); the rest of every layout stays. 2026-11-27 (G1323): 302, Drifa's
    // Ice Nubbins hang on its walls now (370 while they were planned on its floors, many under front snow).
    assert.ok(moved >= 295, `${moved} moved`);
  });

  it('no planned node on any street is mostly behind front art while the street has room for it', async () => {
    const hidden = {};
    let planned = 0;
    for (const tsid of Object.keys(index.streets).filter((t) => !/^GZ/.test(t)).sort()) {
      let data;
      try { data = await loadStreetDataFromFs(tsid, streetsDir); } catch { continue; }
      const fronts = frontDecoCovers(data);
      if (!fronts.length) continue;
      for (const r of nodesOf(data)) {
        // A spot measured on a 2012 picture is where Glitch had it.
        if (r.wall || FLYING.includes(r.classTsid) || !FRONT_BOXES[`resource:${r.classTsid}`]) continue;
        planned += 1;
        if (share(r, fronts) >= FRONT_HIDE_SHARE) hidden[tsid] = (hidden[tsid] || 0) + 1;
      }
    }
    assert.ok(planned > 900, `${planned} planned nodes`);
    // Census (2026-11-18): before, 385 planned nodes 60% or more behind the front art (Peat Bogs 19,
    // Dirt Piles 18, Paper Trees 2, Barnacles 3, Ice Nubbins 154, Salmon 189). After, 34, where the
    // front art covers every free floor left: Hellinum Dum's sliding foreground snow skirts lie over
    // all its floors, and the Samudra sea streets' dark foreground rock over their sea beds.
    // G1236: Dokk Rokk's last free floor is its doorway, and a node no longer stands in a door (one Ice Nubbin).
    const LEFT = new Set(['GHV7LLAAIDB35G2', 'GHV7VE7O4MA35H6', 'GUVCHLO06EA3VBC', 'GUV2LJJO5UC30B2', 'GUVUMTSQ2FC34ES', 'GA9QTSIOV4F31QH', 'GUVVSU5NCBA3KOS', 'GUVV0NRR2FC3D3D', 'GUV2M85OU8A39GS']);
    assert.deepEqual(Object.keys(hidden).filter((t) => !LEFT.has(t)), []);
    assert.ok(Object.values(hidden).reduce((a, b) => a + b, 0) <= 35, JSON.stringify(hidden));
  });
});
