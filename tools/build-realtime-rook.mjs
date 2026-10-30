/**
 * Multiplayer phase 4: what the realtime server needs to own group Rook
 * attacks (the realtime server's rook.go).
 *
 * - streets: every street the Rook can attack (locations/inc_rook.js
 *   isRookable 19-31: a street with a shrine, not hidden: no new-player
 *   island, practice street or game clone, js/rook-attack.js ROOK_HIDDEN_HUBS;
 *   instances, homes and party spaces never reach the shared server), with its hub (groups/rook_attack.js
 *   is one attack group per hub, newLocation 30-66 picks a street of that
 *   hub), the shrine's place as game.js spawnShrine puts it (placement
 *   'shrine' from the same planner as tools/build-realtime-objects.mjs, then
 *   clamped 90 px inside the street) and the shrine's Giant (js/shrines.js
 *   giantForStreet), whose emblem a primed shrine takes for 250 damage.
 * - values: what an offering is worth to a primed shrine, per item class
 *   (js/shrines.js donationValueFor over the game's item catalog: GSJS
 *   base_cost from making-items.json, else SHRINE_ITEM_BASE_COSTS, else 1).
 *   items/include/shrines.js launchAttack 1034-1046 turns 10% of it into
 *   damage. Classes worth 1 are left out (the server's fallback is 1, as the
 *   client's is); tools, no_donate items, machines and other emblems are
 *   listed under refused.
 *
 * Run from the game repo root:
 *   node tools/build-realtime-rook.mjs
 * Writes data/rook.json in the realtime server repo (go:embed in its rook.go;
 * found by tools/repos.mjs: GRODDLE_SERVER_DIR, else ../groddle-afternoon-server). Rerun after
 * street, placement or catalog changes, as for build-realtime-objects.mjs.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireServer, serverPath } from './repos.mjs';

import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js?v=20c7b021';
import { platformsScreen, streetWidth, worldToScreen } from '../public/js/street-model.js?v=606bae73';
import { ecologyForStreet, planStreetPlacements, populationForStreet, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=dbcefe18';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=85d4faba';
import { loadRecipeCatalogFromFile } from '../public/js/making.js?v=9e538296';
import { SHRINE_ITEM_BASE_COSTS, donationValueFor, giantForStreet } from '../public/js/shrines.js?v=01b185bc';
import { placementRequests } from './build-realtime-objects.mjs';
import { streetIsRookable } from '../public/js/rook-attack.js?v=c06c0537';
import { rebuiltRoomEcology } from '../public/js/rebuilt-rooms.js?v=95ca6839';
import { winterStreetEcology } from '../public/js/winter-walk-streets.js?v=615549da';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const outPath = serverPath('data', 'rook.json');

const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** game.js enterStreet: GROUND_Y is the 75th-percentile platform midpoint. */
function groundY(platforms) {
  const ys = platforms.map((p) => (p.y1 + p.y2) / 2).sort((a, b) => a - b);
  return ys[Math.floor(ys.length * 0.75)] || platforms[0]?.y1 || 800;
}

/** One street's shrine as game.js lays it out, or null (no shrine: the Rook never comes). */
export function streetShrine(data, { starter = false, ecology = ecologyForStreet(data.tsid) } = {}) {
  const population = populationForStreet(data.tsid, ecology, { starter });
  if (!population.shrine) return null;
  const platforms = platformsScreen(data);
  const reserved = (data.signposts || []).map((signpost, index) => {
    const point = worldToScreen(data, signpost.x, signpost.y);
    return { ...point, key: `signpost:${index}`, clearance: 100 };
  });
  const worldW = streetWidth(data);
  const plan = planStreetPlacements(platforms, placementRequests(population), { worldW, seed: data.tsid, reserved });
  const point = plan.groups.shrine?.[0] || { x: worldW * 0.72, y: groundY(platforms) };
  // game.js spawnShrine: x clamped 90 px inside the street, feet 2 px down.
  const x = clamp(point.x, 90, Math.max(90, worldW - 90));
  return { x: r1(x), y: r1((point.y ?? groundY(platforms)) + 2), giant: giantForStreet(data).id };
}

/** Offer values a primed shrine turns into damage (js/features/rook-attack-feature.js offerOptions). */
export function offerValues() {
  const values = {};
  const refused = [];
  const ids = new Set([...Object.keys(ITEM_CATALOG), ...Object.keys(SHRINE_ITEM_BASE_COSTS)]);
  for (const id of [...ids].sort()) {
    const meta = ITEM_CATALOG[id] || {};
    const tags = meta.tags || [];
    // shrines.js donate_to drop_ok_code 318-330: no bags, emblems (but the shrine's own), machines, no_donate.
    if (meta.isTool || meta.donatable === false || tags.includes('emblem') || tags.includes('machine') || tags.includes('no_donate') || id.startsWith('emblem_')) {
      refused.push(id);
      continue;
    }
    const v = donationValueFor(id);
    if (v > 1) values[id] = v;
  }
  return { values, refused };
}

async function main() {
  requireServer();
  const index = JSON.parse(await readFile(join(streetsDir, 'index.json'), 'utf8'));
  applyStreetIndex(index);
  setStreetEcologyCatalog(JSON.parse(await readFile(join(root, 'public/assets/content/street-ecology.json'), 'utf8')));
  await loadRecipeCatalogFromFile(join(root, 'public/assets/content/recipes.json'));
  const streets = {};
  for (const tsid of Object.keys(index.streets).sort()) {
    let data;
    try {
      data = await loadStreetDataFromFs(tsid, streetsDir);
    } catch (err) {
      console.warn(`skip ${tsid}: ${err.message}`);
      continue;
    }
    const meta = index.streets[tsid] || {};
    const hubId = String(data.hubId ?? meta.hubId ?? '');
    // The new-player island, the practice streets and the game clones are hidden in the source: no Rook (ROOK_HIDDEN_HUBS).
    if (!streetIsRookable({ hasShrine: true, hubId })) continue;
    // The rebuilt rooms and Winter Walk spawn what the game spawns there (rebuilt-rooms-feature ecologyOverride): no shrine.
    const override = rebuiltRoomEcology(tsid) || winterStreetEcology(tsid);
    const shrine = streetShrine({ ...data, hubId: data.hubId ?? meta.hubId, hubName: data.hubName ?? meta.hubName }, { starter: data.tsid === STREET_INDEX.default, ...(override ? { ecology: override } : {}) });
    if (!shrine) continue;
    streets[tsid] = [String(data.hubId ?? meta.hubId ?? ''), shrine.x, shrine.y, shrine.giant];
  }
  const { values, refused } = offerValues();
  const out = {
    about: 'Rook attacks for rook.go in groddle-afternoon-server. Generated by tools/build-realtime-rook.mjs from public/assets/streets, street-ecology.json and the item catalog; do not edit by hand.',
    format: 'streets[tsid] = [hubId, shrineX, shrineY, giantId]; values[class] = shrine offer value (absent: 1); refused = classes a primed shrine will not take',
    streets,
    values,
    refused,
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(out)}\n`);
  const hubs = new Set(Object.values(streets).map((s) => s[0]));
  console.log(`${Object.keys(streets).length} rookable streets in ${hubs.size} hubs, ${Object.keys(values).length} offer values, ${refused.length} refused -> ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
