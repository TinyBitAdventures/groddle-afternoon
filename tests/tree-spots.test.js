/**
 * The placements audit (2026-11-12): Glitch set its trants, Paper Trees and street mailboxes by hand
 * (trant_fruit.js, paper_tree.js, npc_mailbox.js obey_physics false). The planner put 27% of the
 * trants and 42% of the mailboxes on snapped streets at a height where the street had none, trees low
 * (height rank median 0.30 against Glitch's 0.56), and mailboxes with an end over air. Now:
 * - trees, Paper Trees and mailboxes stand where players' 2012 snaps show them
 *   (tools/snap-placements/nodes.py, assets/content/node-spots.json, js/node-spots-data.js);
 * - a measured tree keeps its index, id and class (street-ecology.js treePlacementRequest), a
 *   measured mailbox faces the snap's way and every planned thing keeps clear of it
 *   (streetReservedSpots);
 * - a planned mailbox keeps both ends of its stand over a floor while any such spot is left, and is
 *   never left out (STEADY_FLOOR_GROUPS furnitureMailbox `keep`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MEASURED_NODE_SPOTS,
  PLACEMENT_FOOTPRINTS,
  STEADY_FLOOR_GROUPS,
  ecologyForStreet,
  footOverAir,
  measuredNodeSpots,
  measuredTreeSlots,
  measuredTreeSpots,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
  treePlacementRequest,
} from '../public/js/street-ecology.js?v=4016b2cb';
import { furniturePlacementGroups, measuredMailboxes, rowMailboxes } from '../public/js/street-furniture.js?v=cf1d21b1';
import { MAILBOX_SPOTS, PAPER_TREE_SPOTS, TREE_SPOTS } from '../public/js/node-spots-data.js?v=97d4281c';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const spotsFile = JSON.parse(read('public/assets/content/node-spots.json'));
const catalog = JSON.parse(read('public/assets/content/street-ecology.json'));
const TRANTS = ['trant_fruit', 'trant_egg', 'trant_bean', 'trant_bubble', 'trant_spice', 'trant_gas'];
const floor = (id, x1, x2, y1, y2 = y1) => ({ id, x1, y1, x2, y2, pcPerm: -1, itemPerm: -1 });
setStreetEcologyCatalog(catalog);

/** populationForStreet's trants: TREE_CLASSES order, 8 a street at most, less the Wood Trees. */
function trantCount(tsid) {
  const counts = catalog.streets[tsid]?.counts || {};
  let total = 0;
  let trants = 0;
  for (const c of [...TRANTS, 'wood_tree']) {
    const n = Math.min(counts[c] || 0, 8 - total);
    total += n;
    if (c !== 'wood_tree') trants += n;
  }
  return trants;
}

describe('trees the snaps show', () => {
  it('are what the game reads (js/node-spots-data.js matches the JSON)', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(TREE_SPOTS)), spotsFile.classes.trees.streets);
    assert.deepEqual(JSON.parse(JSON.stringify(MAILBOX_SPOTS)), spotsFile.classes.mailboxes.streets);
    assert.deepEqual(JSON.parse(JSON.stringify(PAPER_TREE_SPOTS)), spotsFile.classes.paper_tree.streets);
    assert.equal(MEASURED_NODE_SPOTS.paper_tree.streets, PAPER_TREE_SPOTS);
  });

  it('cover the snapped trant streets, a trant at its trunk\'s foot, never more than the street\'s file names', () => {
    let total = 0;
    for (const [tsid, rows] of Object.entries(spotsFile.classes.trees.streets)) {
      assert.ok(rows.length <= trantCount(tsid), `${tsid} ${rows.length} > ${trantCount(tsid)}`);
      for (const [x, y, cls, stage] of rows) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && TRANTS.includes(cls) && [5, 7, 10].includes(stage), `${tsid} ${x},${y},${cls},${stage}`);
      }
      total += rows.length;
    }
    const streets = Object.keys(spotsFile.classes.trees.streets).length;
    assert.ok(total >= 900 && streets >= 420, `${total} trants on ${streets} streets`);
  });

  it('a trant takes a spot of its own class first, then any trant spot left; a Wood Tree never takes one', () => {
    const pop = {
      treeClasses: ['trant_fruit', 'trant_fruit', 'trant_bean', 'wood_tree'],
      treeSpots: [
        { x: 900, y: 600, classTsid: 'trant_bean', stage: 10 },
        { x: 300, y: 800, classTsid: 'trant_fruit', stage: 7 },
        { x: 1500, y: 800, classTsid: 'trant_gas', stage: 10 },
      ],
    };
    const slots = measuredTreeSlots(pop);
    assert.deepEqual(slots.map((s) => s && [s.x, s.shown]), [[300, 'trant_fruit'], [1500, 'trant_gas'], [900, 'trant_bean'], null]);
    const req = treePlacementRequest(pop);
    assert.deepEqual(req.fixed.map((p) => [p.index, p.x, p.y]), [[0, 300, 800], [1, 1500, 800], [2, 900, 600]]);
    assert.equal(req.count, 4);
  });

  it('seat at their own index before anything is planned, and keep every other thing off them', () => {
    const pop = { treeClasses: ['trant_fruit', 'trant_egg', 'trant_bean'], treeSpots: [{ x: 1200, y: 600, classTsid: 'trant_egg', stage: 10 }] };
    const lines = [floor('ground', 0, 2400, 1000), floor('deck', 1000, 1400, 600)];
    const plan = planStreetPlacements(lines, [{ key: 'player', count: 1, clearance: 190 }, treePlacementRequest(pop), { key: 'rocks', count: 4, clearance: 74 }], { worldW: 2400, seed: 't', unreached: null });
    const trees = plan.groups.trees;
    assert.equal(trees.length, 3);
    assert.deepEqual([trees[1].x, trees[1].y, trees[1].fixed], [1200, 600, true], 'tree 1 (the Egg Plant) where the snap shows it');
    assert.ok(!trees[0].fixed && !trees[2].fixed);
    for (const p of [...trees.filter((t) => !t.fixed), ...plan.groups.rocks]) {
      assert.ok(Math.abs(p.x - 1200) > 100 || Math.abs(p.y - 600) > 40, `${p.key} at ${p.x},${p.y}`);
    }
  });

  it('Northwest Passage: the game lays its trees where the snaps show them, each keeping its class', () => {
    const NWP = 'GLI23D3LDHD1FQA';
    const pop = populationForStreet(NWP, ecologyForStreet(NWP));
    assert.ok(measuredTreeSpots(NWP).length >= 6);
    const slots = measuredTreeSlots(pop);
    assert.equal(slots.filter(Boolean).length, measuredTreeSpots(NWP).length);
    slots.forEach((s, i) => assert.ok(!s || pop.treeClasses[i] !== 'wood_tree'));
    const game = read('public/game.js');
    assert.match(game, /treePlacementRequest\(currentStreetPopulation\),/);
    for (const f of ['tools/build-realtime-objects.mjs', 'tools/build-realtime-quoins.mjs', 'public/js/builder/validate.js']) {
      assert.match(read(f), /treePlacementRequest\((population|pop)\),/, f);
      assert.doesNotMatch(read(f), /key: 'trees', count/, f);
    }
  });
});

describe('Paper Trees the snaps show', () => {
  it('stand where the snaps show them, with no variant (their art follows their paper and care)', () => {
    const rows = Object.entries(spotsFile.classes.paper_tree.streets);
    assert.ok(rows.length >= 18, String(rows.length));
    for (const [tsid, spots] of rows) {
      assert.ok(spots.length <= (catalog.streets[tsid]?.counts?.paper_tree || 0), tsid);
      assert.ok(spots.every((s) => s[2] === null), tsid);
    }
    const [tsid, spots] = rows[0];
    assert.deepEqual(measuredNodeSpots(tsid).paper_tree, spots.map(([x, y]) => ({ x, y, variant: null })));
  });
});

describe('mailboxes the snaps show', () => {
  it('cover the snapped mailbox streets, facing the way the snap shows', () => {
    let total = 0;
    const facing = [0, 0];
    for (const [tsid, rows] of Object.entries(spotsFile.classes.mailboxes.streets)) {
      assert.ok(rows.length <= (catalog.furniture[tsid]?.npc_mailbox || 0), tsid);
      for (const [x, y, f] of rows) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && [1, 2].includes(f), `${tsid} ${x},${y},${f}`);
        facing[f - 1] += 1;
      }
      total += rows.length;
    }
    assert.ok(total >= 165, `${total} mailboxes`);
    assert.ok(facing[0] > 0 && facing[1] > 0, String(facing));
  });

  it('Saani Shim: on the flat floor where the snap shows it, kept clear, and not planned again', () => {
    const SAANI = 'GTJ16T2SURV19NT';
    const row = catalog.furniture[SAANI];
    const [box] = measuredMailboxes(SAANI);
    assert.ok(Math.abs(box.x - 3649) < 10 && Math.abs(box.y - 681) < 10, `${box.x},${box.y}`);
    assert.deepEqual(rowMailboxes(row, SAANI), [{ ...box, fixed: true }]);
    assert.equal(furniturePlacementGroups(row, SAANI).find((g) => g.key === 'furnitureMailbox'), undefined);
    assert.equal(furniturePlacementGroups(row).find((g) => g.key === 'furnitureMailbox').count, 1, 'no tsid: planned as before');
    const spot = streetReservedSpots({ tsid: SAANI }).find((s) => s.key === 'mailbox:0');
    assert.deepEqual([spot.x, spot.y], [box.x, box.y]);
    assert.ok(spot.block.r - spot.block.l > 90);
    assert.match(read('public/js/features/street-furniture-feature.js'), /buildMailbox\(engine, p\.x, p\.y, p\.facing === 2 \? -1 : 1\)/);
  });

  it('a planned one keeps both ends of its stand over a floor, and is never left out', () => {
    assert.equal(PLACEMENT_FOOTPRINTS.furnitureMailbox, 60);
    assert.deepEqual({ ...STEADY_FLOOR_GROUPS.furnitureMailbox }, { maxSlope: 0.3, ledgeRun: 0, edgeDrop: 12, keep: true });
    const lines = [floor('stub', 100, 140, 800), floor('ground', 600, 1400, 1000)];
    for (let i = 0; i < 12; i += 1) {
      const plan = planStreetPlacements(lines, [{ key: 'furnitureMailbox', count: 1, clearance: 80 }], { worldW: 1500, seed: `m${i}`, unreached: null });
      const p = plan.groups.furnitureMailbox[0];
      assert.ok(footOverAir(lines, p, 30) <= 12, `${p.x},${p.y}`);
    }
    const stubOnly = planStreetPlacements([floor('stub', 100, 140, 800)], [{ key: 'furnitureMailbox', count: 1, clearance: 80 }], { worldW: 1500, seed: 'm', unreached: null });
    assert.equal(stubOnly.groups.furnitureMailbox.length, 1, 'kept');
  });
});
