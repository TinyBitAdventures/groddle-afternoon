/**
 * #760: "Lump of iron Ore stuck in a tree on Shoga Links." The planned Metal Rock stood half way up
 * tree_coniferous_fg_2, on the ledges the street lays along the fir's tiers; its sibling, the Beryl
 * Rock on Willo Let, up heights_coniferous_1. G852's branch guard (street-ecology.js branchArtCovers)
 * knew only separate branch decos at most BRANCH_ART_MAX_H tall, so a fir drawn whole (branches in
 * the one deco) was floor. Glitch's snaps: none of 720 rocks stands in such a tree's crown. A whole
 * tree's crown now counts as branch art (WHOLE_TREE_ART, WHOLE_TREE_CROWN).
 * Run: node --test tests/r760-rock-in-tree.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  BRANCH_ART,
  branchArtCovers,
  branchFreeGroup,
  ecologyForStreet,
  onBranchArt,
  PERCH_DROP_PX,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
  WHOLE_TREE_ART,
} from '../public/js/street-ecology.js?v=1c840641';
import { creatureRequests, setCreatureEcology } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
setStreetEcologyCatalog(catalog);
setCreatureEcology(catalog);

function plan(tsid, data = street(tsid)) {
  const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === index.default });
  return planStreetPlacements(platformsScreen(data), creatureRequests(pop, data, catalog), { worldW: streetWidth(data), seed: tsid, reserved: streetReservedSpots(data) });
}

/**
 * The test's own picture of "up a tree", apart from the guard: the middle 80% of a fir drawn whole,
 * from 30% of its height up, with another floor more than PERCH_DROP_PX under the spot.
 */
function upATree(data, spot) {
  const wx = spot.x + data.bounds.l;
  const wy = spot.y + data.bounds.t;
  const lines = platformsScreen(data);
  const floorUnder = lines.some((p) => {
    const l = Math.min(p.x1, p.x2);
    const r = Math.max(p.x1, p.x2);
    if (spot.x < l || spot.x > r) return false;
    const y = p.y1 + (p.y2 - p.y1) * ((spot.x - p.x1) / ((p.x2 - p.x1) || 1));
    return y - spot.y > PERCH_DROP_PX;
  });
  if (!floorUnder) return null;
  for (const layer of data.layers || []) {
    if (layer.name !== 'middleground') continue;
    for (const d of layer.decos || []) {
      if (d.hidden || !/(^|_)(tree_coniferous|heights_coniferous)/i.test(String(d.sprite || ''))) continue;
      if (Math.abs(wx - d.x) <= d.w * 0.4 && wy <= d.y - 0.3 * d.h && wy >= d.y - d.h) return `${Math.round((d.y - wy) / d.h * 100)}% up ${d.sprite}`;
    }
  }
  return null;
}

describe('#760: a rock in a fir drawn whole', () => {
  for (const [tsid, name] of [['GA9S90EJ0G8241N', 'Shoga Links (the Metal Rock)'], ['GNVB0R0UVKH2OKJ', 'Willo Let (the Beryl Rock)']]) {
    it(`${name}: the rock stands on a floor, not up the tree`, () => {
      const data = street(tsid);
      const p = plan(tsid, data);
      assert.equal(p.groups.rocks.length, 1, 'the street keeps its one rock');
      const up = p.groups.rocks.map((r) => upATree(data, r)).filter(Boolean);
      assert.deepEqual(up, []);
      assert.deepEqual(p.branch, [], 'a floor spot was left for it');
    });
  }

  it('the new spots: Shoga Links on the street floor, Willo Let on the mound a plain jump reaches', () => {
    const [shoga] = plan('GA9S90EJ0G8241N').groups.rocks;
    assert.deepEqual([Math.round(shoga.x), Math.round(shoga.y)], [5878, 865]);
    const [willo] = plan('GNVB0R0UVKH2OKJ').groups.rocks;
    assert.deepEqual([Math.round(willo.x), Math.round(willo.y)], [3328, 686]);
  });

  it('a fir drawn whole is branch art from 30% of its height up, its trunk foot is not', () => {
    for (const name of ['tree_coniferous_fg_2', 'tree_coniferous_1', 'tree_coniferous2_1', 'heights_coniferous_1', 'snowcap_heights_coniferous_1_al1', 'tree_coniferous_bare_1']) assert.ok(WHOLE_TREE_ART.test(name), name);
    for (const name of ['tree_stack_trunk', 'pinecluster_1', 'tree_acacia_1', 'heights_mound_3']) assert.ok(!WHOLE_TREE_ART.test(name), name);
    assert.ok(!BRANCH_ART.test('tree_coniferous_fg_2'), 'G852 branch pieces unchanged');
    const s = { bounds: { l: -1000, r: 1000, t: -1000, b: 0 }, layers: [{ name: 'middleground', z: 0, decos: [{ sprite: 'tree_coniferous_fg_2', x: 0, y: 0, w: 600, h: 1000 }] }] };
    const covers = branchArtCovers(s);
    assert.equal(covers.length, 1);
    assert.deepEqual(covers[0].block, { l: 760, r: 1240, t: 0, b: 700 });
    assert.ok(onBranchArt({ x: 1000, y: 500, under: 400 }, covers), 'half way up, over the floor');
    assert.ok(!onBranchArt({ x: 1000, y: 900, under: 400 }, covers), 'by the trunk foot');
    assert.ok(!onBranchArt({ x: 1000, y: 500, under: 0 }, covers), 'a ledge with nothing under is ground');
  });

  it('every street: no planned rock, tree, shrine, vendor or animal up a fir drawn whole while a floor spot is left', () => {
    const up = [];
    for (const [tsid, meta] of Object.entries(index.streets)) {
      let data;
      try { data = JSON.parse(readFileSync(join(root, 'public', meta.file), 'utf8')); } catch { continue; }
      if (!data.bounds || !/coniferous/.test(JSON.stringify(data.layers || []))) continue;
      const p = plan(tsid, data);
      const last = new Set((p.branch || []).map((b) => `${b.key}:${b.index}`));
      for (const [key, spots] of Object.entries(p.groups)) {
        if (!branchFreeGroup(key)) continue;
        spots.forEach((s, i) => {
          const where = upATree(data, s);
          if (where && !last.has(`${key}:${s.index ?? i}`)) up.push(`${data.label} ${key}[${i}] ${where}`);
        });
      }
    }
    assert.deepEqual(up, []);
  });
});
