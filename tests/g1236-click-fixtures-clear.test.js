/**
 * G1236 (root R2, "stands clear of what is drawn"): in a fresh solo game on Hechey Track a starter rock
 * stood on the Shrine to Mab, so clicking the shrine opened the rock's menu. The starter rocks are seated
 * late (STARTER_ROCK_SPOTS), and a fresh game's arrival (the incoming spot nearest the middle) moved the
 * planned shrine onto one. The sweep: on every street, shared (the server's layout) and solo (the archived
 * street; since #718 no page keeps its arrival clear), no planned rock, tree, garden, node or piece of
 * street furniture stands on a shrine, the vendor, a signpost, a door, a mailbox or a Visiting Stone.
 * Glitch set every one of them by hand, clear of each other (the archived streets).
 * R43 (#680): online the page draws each rock, tree and node at the server's spot and plans its own
 * street furniture, so the shared case takes the server's layout (streetObjectLayout) for those and
 * the page's plan for the furniture, and every node (measured or planned) is checked against every
 * planned mailbox, Visiting Stone and Notice Board: Lonkari Line's Peat Bog was drawn over the bottom
 * of the page's mailbox when the server planned without the furniture. A pair of fixed
 * things (measured on 2012 snaps, hand-picked) is left out: Larceny Ladder's measured rock 3 touches a signpost.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  FRONT_BOXES,
  PLACEMENT_FOOTPRINTS,
  PLACEMENT_HEIGHTS,
  ROCK_SHAPE_HEIGHTS,
  ROCK_SHAPE_WIDTHS,
  ecologyForStreet,
  planStreetPlacements,
  populationForStreet,
  rockSpawnPlan,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=f1c11a2d';
import { resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=abc828a8';
import { creatureRequests, plannedStreet, setCreatureEcology, streetEcology, streetObjectLayout } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
const HECHEY = 'GLI2V0UN7RD1T2J';
setStreetEcologyCatalog(catalog);
setCreatureEcology(catalog);
setZoneStreetsShown(false);
applyStreetIndex(index);

// Things that move (swimming Salmon, flying Fireflies) pass in front of anything; they are left out.
const MOVING = /npc_salmon|npc_firefly/;
const box = (key, x, y, w, h, fixed = false) => ({ key, fixed, l: x - w / 2, r: x + w / 2, t: y - h, b: y });
// The planned street furniture a player clicks (G1236 CLICK_FIXTURE_GROUPS).
const FURNITURE_KEYS = ['furnitureMailbox', 'furnitureStone', 'furnitureBoard'];
// A dropped Note is NOTE_ART's 45 x 14 (street-furniture.js).
const artBox = (key) => FRONT_BOXES[key] || (key === 'furnitureNote' ? [45, 14] : [PLACEMENT_FOOTPRINTS[key] || 60, 60]);

async function overlaps(tsid) {
  const loaded = await loadStreetDataFromFs(tsid, streetsDir).catch(() => null);
  if (!loaded?.platforms?.length) return [];
  const starter = tsid === index.default;
  const worldW = streetWidth(loaded);
  const out = [];
  // Online the page plans the street the builder lays it out from (plannedStreet: a Party Space keeps
  // only its exit signpost) with no arrival kept clear, and draws each rock, tree and node at the
  // server's spot (R43, #587; tools/build-realtime-objects.mjs streetObjectLayout, data/objects.json).
  // Solo it plans the archived street and draws its own spots (#718: with no arrival kept clear, as online).
  const variants = [['shared', plannedStreet(loaded), streetEcology(tsid), []], ['solo', loaded, ecologyForStreet(tsid), []]];
  for (const [mode, data, ecology, keep] of variants) {
    const pop = populationForStreet(tsid, ecology, { starter });
    const reserved = [...streetReservedSpots(data), ...keep];
    const plan = planStreetPlacements(platformsScreen(data), creatureRequests(pop, data, catalog), { worldW, seed: tsid, reserved });
    const placement = (key) => plan.groups[key] || [];
    const server = mode === 'shared' ? streetObjectLayout(data, { starter, ecology }) : null;
    const targets = [];
    // R43 (#680): the planned street furniture too, the page's own (the server never lays it out).
    for (const key of ['shrine', 'vendor', ...FURNITURE_KEYS]) {
      placement(key).forEach((p, i) => {
        if (!p || !Number.isFinite(p.x)) return;
        const [w, h] = FURNITURE_KEYS.includes(key) ? artBox(key) : [PLACEMENT_FOOTPRINTS[key], PLACEMENT_HEIGHTS[key]];
        targets.push(box(`${key}:${i}`, p.x, p.y, w, h, Boolean(p.fixed)));
      });
    }
    for (const r of reserved) if (r.block && /^(signpost|door|mailbox|stone):/.test(r.key)) targets.push({ key: r.key, fixed: true, ...r.block });
    const things = [];
    const serverRocks = new Map((server?.rocks || []).map((row) => [row[0], row]));
    for (const rock of rockSpawnPlan(pop, placement('rocks'), tsid)) {
      const row = server ? serverRocks.get(rock.index) : null;
      const [x, y] = row ? row.slice(2, 4) : [rock.x, rock.y];
      if (x == null) continue;
      things.push(box(`rock:${rock.index}`, x, y, ROCK_SHAPE_WIDTHS[rock.classTsid][rock.shape - 1], ROCK_SHAPE_HEIGHTS[rock.classTsid][rock.shape - 1], rock.measured));
    }
    // Trees by their trunk (the canopy rule keeps the furniture out of a crown), drawn at the server's spot online.
    const serverTrees = new Map((server?.trees || []).map((row) => [row[0], row]));
    placement('trees').forEach((p, i) => {
      const row = serverTrees.get(i);
      things.push(box(`trees:${i}`, row ? row[2] : p.x, row ? row[3] - 2 : p.y, 60, PLACEMENT_HEIGHTS.trees, Boolean(p.fixed)));
    });
    for (const key of ['gardens', 'shrine', 'vendor']) {
      placement(key).forEach((p, i) => things.push(box(`${key}:${i}`, p.x, p.y, PLACEMENT_FOOTPRINTS[key], PLACEMENT_HEIGHTS[key], Boolean(p.fixed))));
    }
    // Every node, the measured ones (drawn where the snaps show them) and the planned ones: online at
    // the server's spot for its key (its row's y is the spot's + 2), solo where the page planned it.
    const nodes = server
      ? server.nodes.map(([key, classTsid, x, y]) => ({ key, classTsid, x, y: y - 2, wall: resourceSpawnPlan(pop, placement, data).find((n) => n.key === key)?.wall }))
      : resourceSpawnPlan(pop, placement, data);
    for (const node of nodes) {
      if (MOVING.test(node.classTsid) || !Number.isFinite(node.x)) continue;
      const [w, h] = FRONT_BOXES[`resource:${node.classTsid}`] || [60, 60];
      things.push(box(`node:${node.key}`, node.x, node.y, w, h, Boolean(node.wall)));
    }
    for (const [key, pts] of Object.entries(plan.groups)) {
      if (!/^(furniture|raceDispenser)/.test(key)) continue;
      const [w, h] = artBox(key);
      pts.forEach((p, i) => { if (p && Number.isFinite(p.x)) things.push(box(`${key}:${i}`, p.x, p.y, w, h, Boolean(p.fixed))); });
    }
    for (const target of targets) {
      for (const thing of things) {
        // Two things both set where Glitch (or a hand-picked spot) had them are not the planner's doing.
        if (target.key === thing.key || (target.fixed && thing.fixed)) continue;
        const ox = Math.min(target.r, thing.r) - Math.max(target.l, thing.l);
        const oy = Math.min(target.b, thing.b) - Math.max(target.t, thing.t);
        if (ox > 10 && oy > 10) out.push(`${mode} ${tsid} ${data.label}: ${thing.key} on ${target.key} (${Math.round(ox)} px)`);
      }
    }
  }
  return out;
}

describe('G1236: planned things keep clear of what players click', () => {
  it('Hechey Track in a fresh solo game: no starter rock on the Shrine to Mab', async () => {
    assert.deepEqual(await overlaps(HECHEY), []);
  });

  it('#680 Lonkari Line online: the server\'s Peat Bog is not drawn over the page\'s mailbox', async () => {
    assert.deepEqual(await overlaps('GIF11LLL5KV1CUG'), []);
  });

  it('every street, shared and solo: nothing planned on a shrine, vendor, signpost, door, mailbox, stone or board', { timeout: 300000 }, async () => {
    const hits = [];
    for (const tsid of Object.keys(index.streets)) hits.push(...(await overlaps(tsid)));
    assert.deepEqual(hits, []);
  });
});
