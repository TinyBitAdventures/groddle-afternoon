/**
 * #633 (G1182): Bonelington Hole's one Dirt Pile stood at the far west end of the lower ground (a
 * planner spot), where the street's July 2011 picture and a 2012 one show it inside the cave, right
 * of the two Egg Plants; and Luiro Run and Naatamo Way name four Peat Bogs each but drew three
 * (street-ecology.js PLANNED_NODE_CAPS seats at most 3 planned bogs), though their 2012 pictures show
 * four. Glitch set all of them by hand (dirt_pile.js, peat_1.js, trant_*.js obey_physics false), so
 * their spots now come from those pictures (tools/snap-placements/node-pictures.json, seated and
 * written by node-pictures.mjs into js/node-picture-spots-data.js), as the snaps' spots do elsewhere.
 *
 * The siblings check: every street draws as many nodes of each kind as its card counts, the card
 * the game shows and the card Glitch showed (the location file's count), save the listed exceptions.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MEASURED_NODE_SPOTS,
  RESOURCE_NODE_CAPS,
  ecologyForStreet,
  measuredNodeCovers,
  measuredNodeSpots,
  measuredTreeSpots,
  populationForStreet,
  setStreetEcologyCatalog,
} from '../public/js/street-ecology.js?v=58aafb61';
import { DIRT_PILE_PICTURE_SPOTS, PEAT_PICTURE_SPOTS, TREE_PICTURE_SPOTS } from '../public/js/node-picture-spots-data.js?v=36608622';
import { resourcePlacementGroups, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=6963f42a';
import { homeToFromPopulation } from '../public/js/exploration.js?v=8f19e25d';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js?v=10376267';
import { streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { floorUnder, streetFloors } from '../tools/snap-placements/node-pictures.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const catalog = JSON.parse(read('public/assets/content/street-ecology.json'));
setStreetEcologyCatalog(catalog);
applyStreetIndex(JSON.parse(read('public/assets/streets/index.json')));

const BONELINGTON = 'GCRHSGTEION115H';
const LUIRO = 'GIF12EQUGVU1RPI';
const NAATAMO = 'GIFN3FI0TNU10PS';
const count = (list, cls) => list.filter((id) => id === cls).length;
const layoutOf = async (tsid) => streetObjectLayout(await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets')), { starter: tsid === STREET_INDEX.default });

describe('nodes where the street pictures show them (#633 G1182)', () => {
  it('the data is current (tools/snap-placements/node-pictures.mjs --check)', () => {
    execFileSync(process.execPath, [join(root, 'tools/snap-placements/node-pictures.mjs'), '--check'], { stdio: 'pipe' });
    const source = JSON.parse(read('tools/snap-placements/node-pictures.json')).streets;
    assert.deepEqual(Object.keys(source).sort(), [BONELINGTON, LUIRO, NAATAMO].sort());
    assert.equal(MEASURED_NODE_SPOTS.dirt_pile.streets, DIRT_PILE_PICTURE_SPOTS);
    assert.deepEqual(MEASURED_NODE_SPOTS.peat_1.streets[LUIRO], PEAT_PICTURE_SPOTS[LUIRO]);
  });

  it("Bonelington Hole's Dirt Pile stands in the cave right of the two Egg Plants, on the cave floor", async () => {
    const pop = populationForStreet(BONELINGTON, ecologyForStreet(BONELINGTON));
    assert.deepEqual(pop.resourceSpots.dirt_pile, [{ x: 2646, y: 1241, variant: 'dirt1' }]);
    // Never planned: the planner is not asked for it, and the game draws it at its spot.
    assert.deepEqual(resourcePlacementGroups(pop), []);
    const plan = resourceSpawnPlan(pop, () => [{ x: 371.8, y: 1233 }]);
    assert.deepEqual(plan.map(({ key, x, y, wall }) => [key, x, y, wall]), [['dirt_pile:0', 2646, 1241, true]]);
    const trees = measuredTreeSpots(BONELINGTON);
    assert.deepEqual(trees.map((t) => [t.x, t.classTsid]), [[1836, 'trant_egg'], [2200, 'trant_egg']]);
    assert.ok(plan[0].x > trees[1].x + 200 && plan[0].x < 2900, 'right of the Egg Plants, before the mound');
    // On the floor under it (the cave's lower ground), within nodes.py's 25 px.
    const street = JSON.parse(read(`public/assets/streets/${BONELINGTON}.json`));
    const under = floorUnder(streetFloors(street), plan[0].x, plan[0].y);
    assert.ok(under && under.y - plan[0].y >= 0 && under.y - plan[0].y <= 25, JSON.stringify(under));
    // Kept clear by everything planned (report #319).
    assert.ok(measuredNodeCovers(BONELINGTON).some((c) => c.key === 'node:dirt_pile:0'));
    // The shared layout (the realtime server's) has the pile and both Egg Plants there.
    const layout = await layoutOf(BONELINGTON);
    assert.deepEqual(layout.nodes.map((n) => n.slice(0, 3)), [['dirt_pile:0', 'dirt_pile', 2646]]);
    assert.deepEqual(layout.trees.map((t) => [t[1], t[2]]), [['trant_egg', 1836], ['trant_egg', 2200]]);
  });

  it('Luiro Run and Naatamo Way draw all four of their Peat Bogs, where the pictures show them', async () => {
    for (const tsid of [LUIRO, NAATAMO]) {
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      assert.equal(ecologyForStreet(tsid).counts.peat_1, 4);
      assert.equal(count(pop.resourceNodeClasses, 'peat_1'), 4, tsid);
      assert.equal(homeToFromPopulation(pop).counts.peat, 4, `${tsid} card`);
      const plan = resourceSpawnPlan(pop, () => []).filter((p) => p.classTsid === 'peat_1');
      assert.deepEqual(plan.map((p) => [p.x, p.y]), PEAT_PICTURE_SPOTS[tsid].map(([x, y]) => [x, y]), tsid);
      assert.ok(plan.every((p) => p.wall && /^peat[123]$/.test(p.variant)), tsid);
      const layout = await layoutOf(tsid);
      assert.equal(layout.nodes.filter((n) => n[1] === 'peat_1').length, 4, `${tsid} shared layout`);
    }
    assert.deepEqual(measuredNodeSpots(LUIRO).peat_1.map((s) => s.variant), ['peat1', 'peat3', 'peat2', 'peat1']);
  });

  it('a picture never overrides what a snap measured', () => {
    const source = JSON.parse(read('tools/snap-placements/node-pictures.json')).streets;
    const snaps = JSON.parse(read('public/assets/content/node-spots.json')).classes;
    for (const tsid of Object.keys(source)) {
      assert.equal(snaps.peat_1.streets[tsid], undefined, tsid);
      assert.equal(snaps.trees.streets[tsid], undefined, tsid);
    }
    assert.deepEqual(Object.keys(TREE_PICTURE_SPOTS), [BONELINGTON]);
  });
});

/**
 * Real exceptions to the siblings check, each with its reason. A street here draws fewer of a kind
 * than its card counts.
 */
const DRAWN_SHORT = Object.freeze({
  // A small round street (2,500 px, 11 platforms) whose floors seat 6 of the 8 Salmon the render cap
  // allows at their 60 px clearance; its file names 17.
  'GUVSBGGQCHC386B npc_salmon': 'Hetuhila: the planner has room for 6 Salmon',
});

describe('every street draws as many nodes of each kind as its card counts (G1182 siblings)', () => {
  it('the game\'s card, Glitch\'s card (the location file) and the shared layout agree', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8'));
    // The kinds the shared layout holds (the server owns them); the rest (Fireflies, dust traps,
    // Sloths) are drawn from no planner spot the server keeps.
    const KINDS = ['mortar_barnacle', 'ice_knob', 'jellisac', 'dirt_pile', 'peat_1', 'paper_tree', 'npc_salmon'];
    const short = [];
    const seen = new Set();
    let checked = 0;
    for (const [tsid, street] of Object.entries(data.streets)) {
      const row = ecologyForStreet(tsid);
      const pop = populationForStreet(tsid, row, { starter: tsid === STREET_INDEX.default });
      const home = homeToFromPopulation(pop);
      // The card names a Paper Tree with the trees (exploration.js HOME_TO_TREES), a Peat Bog as `peat`.
      const card = { ...home.counts, paper_tree: Object.fromEntries(home.trees).paper_tree || 0 };
      for (const cls of KINDS) {
        const drawn = (street.nodes || []).filter((n) => n[1] === cls).length;
        const shown = card[cls === 'peat_1' ? 'peat' : cls] || 0;
        // Glitch's card counted every one its file names; only the wandering Salmon have a render cap.
        const file = Math.min(row?.counts?.[cls] || 0, RESOURCE_NODE_CAPS[cls] ?? Infinity);
        if (!drawn && !shown && !file) continue;
        checked += 1;
        if (drawn === shown && drawn === file) continue;
        const key = `${tsid} ${cls}`;
        seen.add(key);
        if (!DRAWN_SHORT[key]) short.push(`${row?.label || tsid} ${cls}: file ${file}, card ${shown}, drawn ${drawn}`);
      }
    }
    assert.deepEqual(short, []);
    assert.ok(checked >= 450, `${checked} street kinds checked`);
    // Every listed exception is still real (drop it once the street draws them all).
    assert.deepEqual(Object.keys(DRAWN_SHORT).filter((k) => !seen.has(k)), []);
  });
});
