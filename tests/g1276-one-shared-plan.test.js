/**
 * G1276 (root R43, report #680): online a page draws each rock, tree, node and street animal at the
 * realtime server's spot (data/objects.json, tools/build-realtime-objects.mjs) and plans everything
 * else itself: its street furniture, and the groups from its player's own projects, the season and
 * the finds that come after them (game.js enterStreet, features.collect('placementGroups')). On
 * Lonkari Line the server's Peat Bog stood at 4070 and the page planned its mailbox at 4135, on the
 * bog: a node the front art covered was moved after the whole plan, so it moved by groups planned
 * after it, and the server planned without the furniture. 7 nodes and rocks under furniture on 7
 * streets, and 27 streets where the page's own nodes stood elsewhere than the server's.
 *
 * One placement for both: the planner moves a covered node before it plans the next group, so a
 * group's spots depend only on the groups before it, and the builder lays the street out with the
 * furniture groups as the page does. This proves it on every street: planned with the builder's
 * groups alone and with the groups a page adds after them, every group the builder lays out stands
 * at the same spot. tests/client-server-placement.test.js compares the page's own plan with
 * data/objects.json; tests/g1236-click-fixtures-clear.test.js sweeps every node against the furniture.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=23555e53';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { planStreetPlacements, populationForStreet, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=63b5b2c0';
import { crabPlacementGroups } from '../public/js/crabs.js?v=eb0bdc39';
import { fireDragonPlacementGroups } from '../public/js/fire-dragon.js?v=b7f3d751';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';
import { creatureRequests, plannedStreet, setCreatureEcology, streetEcology } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
setStreetEcologyCatalog(catalog);
setCreatureEcology(catalog);
setZoneStreetsShown(false);
applyStreetIndex(index);

// Groups a page plans after the shared ones, different for each player: a Street Job board and its
// flora (street-jobs-feature), the season's decor (seasons-feature), a find (funpickle-feature), a
// Party Space's stacks (party-spaces-feature). Big and many, so they crowd every street.
const PAGE_ONLY = [
  { key: 'street-job-board', count: 1, clearance: 110 },
  { key: 'street-job-flora', count: 4, clearance: 70 },
  { key: 'season-decor', count: 6, clearance: 60 },
  { key: 'funpickle', count: 1, clearance: 40 },
  { key: 'partySpaceStacks', count: 3, clearance: 50 },
];

/** The builder's planner groups for a street (streetObjectLayout). */
function builderGroups(data, population) {
  return [...creatureRequests(population, data, catalog), ...crabPlacementGroups(data.tsid), ...fireDragonPlacementGroups(population)];
}

async function drift(tsid) {
  let data = await loadStreetDataFromFs(tsid, streetsDir).catch(() => null);
  if (!data?.platforms?.length) return [];
  data = plannedStreet(data);
  const population = populationForStreet(tsid, streetEcology(tsid), { starter: tsid === index.default });
  const groups = builderGroups(data, population);
  const opts = { worldW: streetWidth(data), seed: tsid, reserved: streetReservedSpots(data) };
  const platforms = platformsScreen(data);
  const server = planStreetPlacements(platforms, groups, opts);
  const page = planStreetPlacements(platforms, [...groups, ...PAGE_ONLY], opts);
  const out = [];
  for (const { key } of groups) {
    const a = (server.groups[key] || []).map((p) => (p ? [p.x, p.y] : null));
    const b = (page.groups[key] || []).map((p) => (p ? [p.x, p.y] : null));
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${tsid} ${data.label}: ${key} server ${JSON.stringify(a)} page ${JSON.stringify(b)}`);
  }
  return out;
}

describe('G1276: the server and every page lay out the shared things from one plan', () => {
  it('#680 Lonkari Line: the groups a page adds never move the Peat Bogs', async () => {
    assert.deepEqual(await drift('GIF11LLL5KV1CUG'), []);
  });

  it('every street: the builder\'s groups stand where they stand with the page\'s own groups after them', { timeout: 300000 }, async () => {
    const hits = [];
    for (const tsid of Object.keys(index.streets).filter((t) => !isZoneTsid(t))) hits.push(...(await drift(tsid)));
    assert.deepEqual(hits, []);
  });
});
