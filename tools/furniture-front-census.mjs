/**
 * Census (G1084, #574): planned street furniture (Visiting Stones, Mailboxes, Notice Boards) mostly
 * behind the front art (street-ecology.js hiddenBehindFront, FRONT_HIDE_SHARE), laid out as
 * game.js enterStreet does (tools/build-realtime-objects.mjs creatureRequests) and stepped off doors
 * and trees as street-furniture-feature.js spawnStreet does (clearOfDoors, treeObstacles).
 * Spots measured on the 2012 snaps (stoneSpotRow, rowMailboxes) and fixed rows are not counted.
 *
 *   node tools/furniture-front-census.mjs [--list]
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown, STREET_INDEX } from '../public/js/street-loader.js?v=23555e53';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  ecologyForStreet, frontDecoCovers, hiddenBehindFront, planStreetPlacements, populationForStreet,
  setStreetEcologyCatalog, streetReservedSpots,
} from '../public/js/street-ecology.js?v=1c840641';
import { FURNITURE_GROUPS, clearOfDoors, treeObstacles, STONE_ART, BOARD_ART } from '../public/js/street-furniture.js?v=071203fc';
import { creatureRequests, setCreatureEcology } from './build-realtime-objects.mjs';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const HALF = { npc_mailbox: 50, visiting_stone: STONE_ART.w / 2, bag_notice_board: BOARD_ART.w / 2 };

/**
 * `reseat: false` lays the streets out as before #574 (the furniture as planned, before reseatHiddenNodes
 * moves the covered pieces). Returns { planned, hidden, moved, outOfZone, rows } by class.
 */
export async function census({ reseat = true } = {}) {
  setZoneStreetsShown(false);
  const index = JSON.parse(await readFile(join(streetsDir, 'index.json'), 'utf8'));
  applyStreetIndex(index);
  const ecology = JSON.parse(await readFile(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
  setStreetEcologyCatalog(ecology);
  setCreatureEcology(ecology);
  const out = { planned: {}, hidden: {}, moved: {}, outOfZone: 0, rows: [] };
  for (const tsid of Object.keys(index.streets).filter((t) => !isZoneTsid(t)).sort()) {
    let data;
    try { data = await loadStreetDataFromFs(tsid, streetsDir); } catch { continue; }
    const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === STREET_INDEX.default });
    const requests = creatureRequests(pop, data, ecology);
    const platforms = platformsScreen(data);
    const plan = planStreetPlacements(platforms, requests, { worldW: streetWidth(data), seed: tsid, reserved: streetReservedSpots(data), reseat });
    const fronts = frontDecoCovers(data);
    for (const m of plan.moved || []) {
      if (!m.key.startsWith('furniture')) continue;
      out.moved[m.key] = (out.moved[m.key] || 0) + 1;
      const zone = requests.find((r) => r.key === m.key)?.zone;
      const p = plan.groups[m.key][m.index];
      if (zone && (p.x < zone.lo || p.x > zone.hi)) out.outOfZone += 1;
      out.rows.push([tsid, data.label || '', 'moved', m.key, Math.round(m.from.x), Math.round(m.from.y), '->', Math.round(p.x), Math.round(p.y)]);
    }
    const doors = [...(data.doors || []), ...treeObstacles(plan.groups.trees || [])];
    for (const [cls, { key }] of Object.entries(FURNITURE_GROUPS)) {
      if (!HALF[cls] || !requests.some((r) => r.key === key)) continue;
      for (const p of plan.groups[key] || []) {
        if (p.fixed) continue;
        const at = clearOfDoors(p, HALF[cls], doors, platforms, streetWidth(data));
        out.planned[cls] = (out.planned[cls] || 0) + 1;
        if (hiddenBehindFront(at, key, fronts)) {
          out.hidden[cls] = (out.hidden[cls] || 0) + 1;
          out.rows.push([tsid, data.label || '', cls, Math.round(at.x), Math.round(at.y)]);
        }
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const reseat of [false, true]) {
    const c = await census({ reseat });
    console.log(reseat ? 'now' : 'before #574', JSON.stringify({ planned: c.planned, hidden: c.hidden, moved: c.moved, outOfZone: c.outOfZone }));
    if (process.argv.includes('--list')) for (const r of c.rows) console.log(r.join('\t'));
  }
}
