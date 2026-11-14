/**
 * Shrines where Tiny Speck's 2011-2012 street pictures show them, in every region no player's snap
 * covers. Glitch set every shrine by hand (npc_shrine_*.js obey_physics false) and the 2012 location
 * files keep only that a street has one, so the planner (street-ecology.js planStreetPlacements) put
 * each on a floor of its own choosing: 30 of Groddle Meadow's 36 shrines stood more than 300 px from
 * where the street's picture shows them (lane meadow2012), Sculdent Shill's 4,500 px away,
 * Marylpole Mount's up on a rock and Twickenrill Grotto's down in the cave. Lane pins2 (2026-11-14)
 * did the same for the 16 other regions with no snaps (Jethimadh, Ormonos, Kalavana, Muufo, Kajuu,
 * Karnata, Lida, Nottis, Haraiva, Drifa, Ilmenskie Deeps and Caverns, Massadoe, Pollokoo, Cauda, Ix).
 *
 * Evidence: research/eleven-snaps has no snap of those regions, but the encyclopedia kept a
 * whole-street render of most streets (research/wayback/raw/street-images/<hub folder>/, 720 px wide,
 * 2011-2012; reference only, never shipped). Each shrine's foot was read off its render
 * (shrine-pictures.json, hand-kept, good to about 25 px: one picture px is street width / 720, 8.3
 * street px on a 6,000 px street). Lane pins2 found each by matching our own CC0 shrine art (the
 * region's open and close sheets, frames first and last) against the render, then checked every hit
 * by eye on a zoomed crop; the spot is where the art's cell foot falls.
 *
 * This seats each spot on the floor under it: of the standable lines (pc_perm -1, 0 or none) at
 * the spot's x, the one nearest its y, at most SEAT_PX away, and the floor must hold the shrine's
 * footprint (PLACEMENT_FOOTPRINTS.shrine) on both sides. A spot the remake's art in front of the
 * street would hide (street-ecology.js hiddenBehindFront: Broxhurst Green's big middleplus oak), or
 * one on a measured node (a Peat Bog, Jellisac, Barnacle or Paper Tree the snaps place, lane nodes) or
 * a mailbox, or with its foot in a doorway, on a signpost or at a ladder's foot, moves along the floor
 * to the nearest clear spot, NUDGE_STEP at a time, at most NUDGE_PX. It writes
 * public/js/shrine-spots-data.js, which street-ecology.js shrinePlacementRequest reads (game.js
 * enterStreet, the realtime builders and the level builder ask with it), so a shrine stands where its
 * picture shows it and every other thing keeps clear of it.
 *
 *   node tools/snap-placements/shrine-pictures.mjs          write
 *   node tools/snap-placements/shrine-pictures.mjs --check  exit 1 if stale or a spot has no floor
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformYAt, platformsScreen } from '../../public/js/street-model.js?v=b6cb6a4e';
import { PLACEMENT_FOOTPRINTS, PLACEMENT_HEIGHTS, frontDecoCovers, hiddenBehindFront, streetReservedSpots } from '../../public/js/street-ecology.js?v=449b7771';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const check = process.argv.includes('--check');
/** How far (street px) a picture's spot may sit off the floor it is seated on. */
export const SEAT_PX = 90;
/** How far (street px) a hidden spot may move along the floor, and the step. */
export const NUDGE_PX = 300;
export const NUDGE_STEP = 25;

const standable = (p) => p.pcPerm === undefined || p.pcPerm === -1 || p.pcPerm === 0;

/** PURE: the floor y under (x, y) within SEAT_PX, with the footprint's ends on floor too, or null. */
export function seatOnFloor(platforms, x, y, footprint) {
  const lines = platforms.filter(standable);
  const yAt = (px, near) => {
    let best = null;
    for (const p of lines) {
      const py = platformYAt(p, px, 0);
      if (py == null) continue;
      if (best == null || Math.abs(py - near) < Math.abs(best - near)) best = py;
    }
    return best;
  };
  const fy = yAt(x, y);
  if (fy == null || Math.abs(fy - y) > SEAT_PX) return null;
  for (const ex of [x - footprint / 2, x + footprint / 2]) {
    const ey = yAt(ex, fy);
    if (ey == null || Math.abs(ey - fy) > 40) return null;
  }
  return Math.round(fy);
}

/**
 * PURE: what a shrine with its foot at (x, y) would stand on, or null: a measured node's or a
 * mailbox's box under its own (PLACEMENT_FOOTPRINTS.shrine x PLACEMENT_HEIGHTS.shrine), or its foot
 * inside a door, signpost or ladder foot's box. `reserved` is streetReservedSpots(street).
 */
export function standsOnReserved(reserved, x, y) {
  const half = PLACEMENT_FOOTPRINTS.shrine / 2;
  const top = y - PLACEMENT_HEIGHTS.shrine;
  for (const r of reserved) {
    const b = r.block;
    if (!b || r.front) continue;
    if (/^(node|mailbox):/.test(r.key)) {
      if (x + half > b.l && x - half < b.r && y > b.t && top < b.b) return r.key;
    } else if (x > b.l && x < b.r && y > b.t && y <= b.b + 2) {
      return r.key;
    }
  }
  return null;
}

/** Seats every spot and writes (or with --check, compares) public/js/shrine-spots-data.js. */
function main() {
  const source = JSON.parse(readFileSync(join(root, 'tools/snap-placements/shrine-pictures.json'), 'utf8'));
  const spots = {};
  const failed = [];
  for (const [tsid, row] of Object.entries(source.streets).sort(([a], [b]) => a.localeCompare(b))) {
    const street = JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
    const [x, y] = row.spot;
    const platforms = platformsScreen(street);
    const fronts = frontDecoCovers(street);
    const reserved = streetReservedSpots({ ...street, tsid });
    let seated = null;
    for (let step = 0; step <= NUDGE_PX && !seated; step += NUDGE_STEP) {
      for (const dx of step ? [-step, step] : [0]) {
        const fy = seatOnFloor(platforms, x + dx, y, PLACEMENT_FOOTPRINTS.shrine);
        if (fy != null && !hiddenBehindFront({ x: x + dx, y: fy }, 'shrine', fronts) && !standsOnReserved(reserved, x + dx, fy)) {
          seated = [x + dx, fy];
          break;
        }
      }
    }
    if (!seated) {
      failed.push(`${row.label} (${tsid}) ${x},${y}`);
      continue;
    }
    spots[tsid] = seated;
  }

  const text = `// Generated by tools/snap-placements/shrine-pictures.mjs from tools/snap-placements/shrine-pictures.json: never edit by hand.
/**
 * Shrines where Tiny Speck's 2011-2012 street pictures show them, in the regions no player's snap covers
 * (lanes meadow2012 and pins2): the shrine's foot in street px (0, 0 = the street's top left), seated on
 * the floor under the spot read off the picture. { [G tsid]: [x, y] }. street-ecology.js
 * shrinePlacementRequest reads them.
 */
export const SHRINE_SPOTS = Object.freeze(${JSON.stringify(spots, null, 2).replace(/\[\n\s+(-?\d+),\n\s+(-?\d+)\n\s+\]/g, '[$1, $2]')});
`;
  const out = join(root, 'public/js/shrine-spots-data.js');
  let before = '';
  try { before = readFileSync(out, 'utf8'); } catch { /* new */ }
  if (failed.length) console.error(`no floor under: ${failed.join('; ')}`);
  if (check) {
    if (before !== text || failed.length) {
      console.error('public/js/shrine-spots-data.js is stale: run node tools/snap-placements/shrine-pictures.mjs');
      process.exit(1);
    }
    console.log(`shrine spots are current (${Object.keys(spots).length} streets)`);
  } else {
    if (before !== text) writeFileSync(out, text);
    console.log(`${Object.keys(spots).length} shrine spots -> public/js/shrine-spots-data.js`);
    if (failed.length) process.exit(1);
  }
}

// Run only as a script: tests import the helpers above without writing anything.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
