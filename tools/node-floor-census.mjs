/**
 * Census (#581): rocks and resource nodes standing off their floor. For every street it lays the
 * rocks and nodes out as the realtime server's objects.json has them (tools/build-realtime-objects.mjs
 * placementRequests) and as a solo page does (creatureRequests, game.js enterStreet's full group
 * list), then measures how far the floor falls away under either end of each one's drawn foot
 * (street-ecology.js footOverAir): a rock's whole shape as drawn (ROCK_SHAPE_WIDTHS), a node's
 * PLACEMENT_FOOTPRINTS. Only nodes that stand on a floor count (a STEADY_FLOOR_GROUPS edgeDrop: not
 * Barnacles on walls, Fireflies or Salmon). Spots measured on Tiny Speck's own snaps (set by hand in
 * the art, often off any line) are counted apart, for comparison, and so are planned ones kept at their
 * planned height because the front art would hide them once seated (`afloat`).
 *
 *   node tools/node-floor-census.mjs [--list] [--over=<px>]
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown, STREET_INDEX } from '../public/js/street-loader.js?v=23555e53';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  ecologyForStreet, footOverAir, planStreetPlacements, populationForStreet, rockSpawnPlan,
  setStreetEcologyCatalog, streetReservedSpots, ROCK_SHAPE_WIDTHS, PLACEMENT_FOOTPRINTS, STEADY_FLOOR_GROUPS,
} from '../public/js/street-ecology.js?v=1c840641';
import { resourceSpawnPlan, RESOURCE_GROUP_PREFIX } from '../public/js/features/resource-nodes-feature.js?v=6ec0d8c0';
import { creatureRequests, placementRequests, setCreatureEcology } from './build-realtime-objects.mjs';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');

/** A rock's or node's drawn foot, half each side of its spot. */
function halfFoot(row) {
  if (row.kind === 'rock') return (ROCK_SHAPE_WIDTHS[row.classTsid]?.[row.shape - 1] || 120) / 2;
  return (PLACEMENT_FOOTPRINTS[`${RESOURCE_GROUP_PREFIX}${row.classTsid}`] || 60) / 2;
}

/** Every rock and node of one street's layout (`solo`: the full group list), with its end drop. */
export function streetRows(data, { solo = false } = {}) {
  const pop = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === STREET_INDEX.default });
  const platforms = platformsScreen(data);
  const requests = solo ? creatureRequests(pop, data, null) : placementRequests(pop);
  const plan = planStreetPlacements(platforms, requests, { worldW: streetWidth(data), seed: data.tsid, reserved: streetReservedSpots(data) });
  // A spot the front art would hide once seated keeps its planned height (planStreetPlacements `afloat`).
  const afloat = new Set(Object.values(plan.groups).flat().filter((p) => p?.afloat).map((p) => `${p.x},${p.y}`));
  const rows = [];
  for (const r of rockSpawnPlan(pop, plan.groups.rocks || [], data.tsid)) {
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    rows.push({ kind: 'rock', classTsid: r.classTsid, x: r.x, y: r.y, shape: r.shape, measured: r.measured, key: `rock:${r.index}` });
  }
  for (const n of resourceSpawnPlan(pop, (k) => plan.groups[k] || [], data)) {
    // Only the nodes that stand on a floor (a steady rule with an edgeDrop): not Barnacles on walls,
    // Fireflies in the air or Salmon in the water.
    if (!Number.isFinite(STEADY_FLOOR_GROUPS[`${RESOURCE_GROUP_PREFIX}${n.classTsid}`]?.edgeDrop)) continue;
    rows.push({ kind: 'node', classTsid: n.classTsid, x: n.x, y: n.y, measured: Boolean(n.wall), key: n.key });
  }
  for (const row of rows) {
    row.drop = footOverAir(platforms, row, halfFoot(row));
    if (!row.measured && afloat.has(`${row.x},${row.y}`)) row.afloat = true;
  }
  return rows;
}

export async function census({ over = 12, solo = false } = {}) {
  setZoneStreetsShown(false);
  const index = JSON.parse(await readFile(join(streetsDir, 'index.json'), 'utf8'));
  applyStreetIndex(index);
  const ecology = JSON.parse(await readFile(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
  setStreetEcologyCatalog(ecology);
  setCreatureEcology(ecology);
  const out = { planned: { rock: 0, node: 0 }, plannedOver: { rock: 0, node: 0 }, afloat: { rock: 0, node: 0 }, measured: { rock: 0, node: 0 }, measuredOver: { rock: 0, node: 0 }, streets: new Set(), rows: [] };
  for (const tsid of Object.keys(index.streets).filter((t) => !isZoneTsid(t)).sort()) {
    let data;
    try { data = await loadStreetDataFromFs(tsid, streetsDir); } catch { continue; }
    for (const row of streetRows(data, { solo })) {
      const side = row.measured ? 'measured' : row.afloat ? 'afloat' : 'planned';
      out[side === 'afloat' ? 'planned' : side][row.kind] += 1;
      if (row.drop > over) {
        out[side === 'afloat' ? 'afloat' : `${side}Over`][row.kind] += 1;
        if (side === 'planned') out.streets.add(tsid);
        out.rows.push([tsid, data.label || '', side, row.key, row.classTsid, Math.round(row.x), Math.round(row.y), row.drop === Infinity ? 'air' : Math.round(row.drop)]);
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const over = Number(process.argv.find((a) => a.startsWith('--over='))?.slice(7) ?? 12);
  for (const solo of [false, true]) {
    const c = await census({ over, solo });
    console.log(solo ? 'solo' : 'online', `over ${over} px`, JSON.stringify({ planned: c.planned, plannedOver: c.plannedOver, afloat: c.afloat, measured: c.measured, measuredOver: c.measuredOver, streets: c.streets.size }));
    if (process.argv.includes('--list')) for (const r of c.rows) console.log(r.join('\t'));
  }
}
