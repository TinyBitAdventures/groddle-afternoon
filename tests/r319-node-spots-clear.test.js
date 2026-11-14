/**
 * Player report #319 (Viscid Pud, Shimla Mirch): a Peat Bog was drawn over the shrine. The shrine
 * there is planned, and the planner put it at (4355.5, 485.5), 32 px from the measured peat spot
 * (4323, 482): measured node spots (Peat Bogs, Jellisacs, Mortar Barnacles, Paper Trees,
 * street-ecology.js measuredNodeSpots, drawn where the players' 2012 snaps show them) were never
 * kept clear. Glitch set both by hand (peat_1.js, jellisac.js, npc_shrine_*.js obey_physics false),
 * so they never met.
 *
 * Now streetReservedSpots (one helper for game.js enterStreet, the realtime data builders and the
 * level builder) holds each measured node as a keep-clear spot with its art's box
 * (measuredNodeCovers), as measured rocks and trees are fixed points. Census of every street laid
 * out as the server's data is (2026-11-14), each thing's box against each measured node's: before,
 * 16 shrines (on 15 streets), 8 vendors, 1 Piggy and 1 quoin on one; after, none.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import {
  MEASURED_NODE_COVERS,
  PLACEMENT_FOOTPRINTS,
  PLACEMENT_HEIGHTS,
  ROCK_SHAPE_HEIGHTS,
  ROCK_SHAPE_WIDTHS,
  ecologyForStreet,
  measuredNodeCovers,
  measuredNodeSpots,
  planStreetPlacements,
  populationForStreet,
  rockSpawnPlan,
  setStreetEcologyCatalog,
  streetReservedSpots,
  walkInScenery,
} from '../public/js/street-ecology.js?v=02dd7dda';
import { getResourceNodeDef } from '../public/js/resource-nodes.js?v=3a26727e';
import { RESOURCE_PLACEMENT_CLEARANCE, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=e96ab9ed';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=18b181ad';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
setStreetEcologyCatalog(JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8')));
setZoneStreetsShown(false);
applyStreetIndex(index);

const VISCID_PUD = 'GTJ12O0H7AO1IBS';
const box = (x, y, w, h) => ({ l: x - w / 2, r: x + w / 2, t: y - h, b: y });
const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const inside = (p, b) => p.x > b.l && p.x < b.r && p.y > b.t && p.y <= b.b;

function layout(data) {
  const pop = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === STREET_INDEX.default });
  const plan = planStreetPlacements(platformsScreen(data), placementRequests(pop), { worldW: streetWidth(data), seed: data.tsid, reserved: streetReservedSpots(data) });
  return { pop, plan, placement: (key) => plan.groups[key] || [] };
}

describe('report #319: measured nodes keep their ground', () => {
  it("each box is the node's art as drawn, each clearance its planned node's", () => {
    for (const [classTsid, rule] of Object.entries(MEASURED_NODE_COVERS)) {
      const sheets = getResourceNodeDef(classTsid).sprite.sheets;
      assert.equal(rule.clearance, RESOURCE_PLACEMENT_CLEARANCE[classTsid], classTsid);
      if (classTsid === 'paper_tree') {
        for (const s of Object.values(sheets)) assert.deepEqual(rule.cells[''], [s.frameWidth, s.frameHeight]);
        continue;
      }
      assert.deepEqual(Object.keys(rule.cells).sort(), Object.keys(sheets).sort(), classTsid);
      for (const [variant, s] of Object.entries(sheets)) assert.deepEqual(rule.cells[variant], [s.frameWidth, s.frameHeight], `${classTsid} ${variant}`);
    }
  });

  it("Viscid Pud's peat spots are keep-clear boxes, and its shrine is off them", async () => {
    const data = await loadStreetDataFromFs(VISCID_PUD, streetsDir);
    const peat = streetReservedSpots(data).filter((p) => p.key.startsWith('node:peat_1:'));
    assert.equal(peat.length, measuredNodeSpots(VISCID_PUD).peat_1.length);
    const spot = peat.find((p) => p.x === 4323 && p.y === 482);
    assert.ok(spot, 'the peat the player saw over the shrine');
    assert.deepEqual(spot.block, box(4323, 482, ...MEASURED_NODE_COVERS.peat_1.cells[measuredNodeSpots(VISCID_PUD).peat_1.find((s) => s.x === 4323).variant]));
    const { placement } = layout(data);
    const shrine = placement('shrine')[0];
    const shrineBox = box(shrine.x, shrine.y, PLACEMENT_FOOTPRINTS.shrine, PLACEMENT_HEIGHTS.shrine);
    for (const p of peat) assert.ok(!overlaps(shrineBox, p.block), `shrine at ${shrine.x}, ${shrine.y} on ${p.key}`);
    assert.deepEqual(measuredNodeCovers(''), []);
  });

  it('a walking animal is not planted on a measured node, and its walk keeps off it', () => {
    const [node] = measuredNodeCovers(VISCID_PUD).filter((p) => p.key.startsWith('node:peat_1:'));
    assert.equal(walkInScenery({ x: node.x, y: node.y, room: 600 }, 'piggies', [node]), 2);
    assert.equal(walkInScenery({ x: node.x + 150, y: node.y, room: 600 }, 'piggies', [node]), 1);
    assert.equal(walkInScenery({ x: node.x + 600, y: node.y, room: 600 }, 'piggies', [node]), 0);
  });

  it('on every street: no shrine, tree, rock, vendor, garden, animal or quoin stands on a measured node', async () => {
    const hits = [];
    let streets = 0;
    let measured = 0;
    for (const tsid of Object.keys(index.streets).filter((t) => !isZoneTsid(t)).sort()) {
      if (!measuredNodeCovers(tsid).length) continue;
      const data = await loadStreetDataFromFs(tsid, streetsDir);
      const { pop, placement } = layout(data);
      const nodes = measuredNodeCovers(data.tsid);
      // Every measured spot is drawn (resourceSpawnPlan), so every keep-clear box holds a node.
      const drawn = resourceSpawnPlan(pop, placement).filter((n) => n.wall && MEASURED_NODE_COVERS[n.classTsid]);
      assert.equal(drawn.length, nodes.length, `${data.label}: every measured node is drawn`);
      streets += 1;
      measured += nodes.length;
      const things = [];
      for (const p of placement('shrine')) things.push({ kind: 'shrine', b: box(p.x, p.y, PLACEMENT_FOOTPRINTS.shrine, PLACEMENT_HEIGHTS.shrine) });
      for (const [i, p] of placement('trees').entries()) if (!p.fixed) things.push({ kind: `tree:${i}`, b: box(p.x, p.y, PLACEMENT_FOOTPRINTS.trees, PLACEMENT_HEIGHTS.trees) });
      for (const r of rockSpawnPlan(pop, placement('rocks'), data.tsid)) {
        if (!r.measured && Number.isFinite(r.x)) things.push({ kind: `rock:${r.index}`, b: box(r.x, r.y, ROCK_SHAPE_WIDTHS[r.classTsid][r.shape - 1], ROCK_SHAPE_HEIGHTS[r.classTsid][r.shape - 1]) });
      }
      for (const key of ['vendor', 'gardens']) for (const p of placement(key)) things.push({ kind: key, b: box(p.x, p.y, PLACEMENT_FOOTPRINTS[key], PLACEMENT_HEIGHTS[key]) });
      for (const key of ['piggies', 'chickens', 'butterflies', 'quoins']) for (const [i, p] of placement(key).entries()) things.push({ kind: `${key}:${i}`, p });
      for (const n of nodes) {
        for (const t of things) if (t.b ? overlaps(t.b, n.block) : inside(t.p, n.block)) hits.push(`${data.label} ${t.kind} on ${n.key}`);
      }
    }
    assert.ok(streets >= 80 && measured >= 500, `${streets} streets, ${measured} measured nodes`);
    assert.deepEqual(hits, []);
  });
});
