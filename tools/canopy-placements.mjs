/**
 * G1061 (#555 follow-up, root R2): planned vendors (Street Spirits), shrines and mailboxes drawn in
 * a tree's crown. Glitch set these down by hand from the street XML; the remake plans them where the
 * archive has no position, and only the resource nodes, the Visiting Stone and the Race Ticket
 * Dispenser kept out of a planned tree's canopy (street-ecology.js TREE_CANOPY, report #256).
 *
 * For every shared street (public/assets/streets/index.json, no published zone), and each street
 * upgrade that changes its layout (street-jobs.json, as tools/build-realtime-objects.mjs lays them
 * out), this lays the street out as game.js enterStreet does (the realtime builder's
 * creatureRequests) and lists every planned vendor, shrine and mailbox whose drawn box overlaps a
 * tree's canopy box. A shrine pinned from its street's picture (shrinePlacementRequest `fixed`) and
 * the mailboxes the snaps show (measuredMailboxes, reserved spots, not in the group) are not planned
 * and are left out.
 *
 *   node tools/canopy-placements.mjs           (counts by kind and a few examples)
 *   node tools/canopy-placements.mjs --all     (every one)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STREET_INDEX, applyStreetIndex, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  TREE_CANOPY,
  ecologyForStreet,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=f6185033';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';
import { upgradeEcologyEntry } from '../public/js/street-jobs.js?v=76471e42';
import { creatureRequests, setCreatureEcology } from './build-realtime-objects.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');

/**
 * Each kind's drawn box on its feet (w x h, street px): the Street Spirit (decos/groddle/vendor.webp
 * 422 x 508 at 0.25: PLACEMENT_FOOTPRINTS / PLACEMENT_HEIGHTS.vendor), a shrine cell (151 x 188 at
 * spawnShrine's 0.78: .shrine) and a street mailbox's opaque art (mailbox-left-idle.webp, 72 x 135
 * of its 97 x 146 cell at 1:1).
 */
export const CROWN_KINDS = Object.freeze({
  vendor: Object.freeze({ w: 106, h: 127 }),
  shrine: Object.freeze({ w: 118, h: 147 }),
  furnitureMailbox: Object.freeze({ w: 72, h: 135 }),
});

/** Whether a thing of `box` standing at `p` overlaps the canopy of the tree standing at `t`. */
export function inCrown(p, box, t) {
  return p.x - box.w / 2 < t.x + TREE_CANOPY.w / 2 && t.x - TREE_CANOPY.w / 2 < p.x + box.w / 2
    && p.y - box.h < t.y && t.y - TREE_CANOPY.h < p.y;
}

/**
 * The planned things of a plan that stand in a tree's crown: [{ key, index, x, y, tree, tx, ty, blocked }].
 * `blocked`: the planner had no clear spot left for it (plan.blocked names the `canopy`): the canopy
 * rule's own last resort, every other spot steep, behind the front art or on another fixture.
 */
export function crownOverlapsInPlan(plan) {
  const out = [];
  const trees = plan.groups.trees || [];
  for (const [key, box] of Object.entries(CROWN_KINDS)) {
    for (const [index, p] of (plan.groups[key] || []).entries()) {
      if (p.fixed) continue;
      const t = trees.findIndex((tree) => inCrown(p, box, tree));
      if (t < 0) continue;
      const blocked = (plan.blocked || []).some((b) => b.key === key && b.index === index && b.fixture === 'canopy');
      out.push({ key, index, x: Math.round(p.x), y: Math.round(p.y), tree: t, tx: Math.round(trees[t].x), ty: Math.round(trees[t].y), blocked });
    }
  }
  return out;
}

let loaded = null;
function load() {
  if (loaded) return loaded;
  setZoneStreetsShown(false);
  const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
  applyStreetIndex(index);
  const ecology = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
  setStreetEcologyCatalog(ecology);
  setCreatureEcology(ecology);
  const jobs = JSON.parse(readFileSync(join(root, 'public/assets/content/street-jobs.json'), 'utf8'));
  loaded = { index, ecology, jobs };
  return loaded;
}

/**
 * A street's layouts as game.js enterStreet plans them: its own (upgrade null) and each street
 * upgrade's that changes it: [{ upgrade, plan }], with its platforms; null when the street has no file.
 */
export function streetPlans(tsid) {
  const { index, ecology, jobs } = load();
  let data;
  try {
    data = JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
  } catch {
    return null;
  }
  const starter = tsid === STREET_INDEX.default;
  const base = ecologyForStreet(tsid);
  const layouts = [[null, base]];
  for (const option of jobs.upgrades?.[tsid]?.options || []) {
    if (option?.id) layouts.push([option.id, upgradeEcologyEntry(base, option)]);
  }
  const platforms = platformsScreen(data);
  const reserved = streetReservedSpots(data);
  const plans = layouts.map(([upgrade, entry]) => {
    const pop = populationForStreet(tsid, entry, { starter });
    const requests = creatureRequests(pop, data, ecology);
    return { upgrade, plan: planStreetPlacements(platforms, requests, { worldW: streetWidth(data), seed: tsid, reserved }) };
  });
  return { label: index.streets[tsid]?.label || tsid, platforms, plans };
}

/**
 * Every shared street's planned vendors, shrines and mailboxes in a crown, and how many of each kind
 * were planned: { overlaps: [{ tsid, label, upgrade?, key, index, x, y, tree, tx, ty }], planned }.
 */
export function crownOverlaps({ tsids = null } = {}) {
  const { index } = load();
  const overlaps = [];
  const planned = { vendor: 0, shrine: 0, furnitureMailbox: 0 };
  const list = tsids || Object.keys(index.streets).filter((t) => !isZoneTsid(t)).sort();
  for (const tsid of list) {
    const street = streetPlans(tsid);
    if (!street) continue;
    const seen = new Set();
    for (const { upgrade, plan } of street.plans) {
      if (!upgrade) {
        for (const key of Object.keys(planned)) planned[key] += (plan.groups[key] || []).filter((p) => !p.fixed).length;
      }
      for (const hit of crownOverlapsInPlan(plan)) {
        // An upgrade that leaves the thing where the street's own layout has it is the same one.
        const id = `${hit.key}:${hit.index}:${hit.x}:${hit.y}`;
        if (seen.has(id)) continue;
        seen.add(id);
        overlaps.push({ tsid, label: street.label, ...(upgrade ? { upgrade } : {}), ...hit });
      }
    }
  }
  return { overlaps, planned };
}

const NAMES = { vendor: 'vendors', shrine: 'shrines', furnitureMailbox: 'mailboxes' };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { overlaps, planned } = crownOverlaps();
  const base = overlaps.filter((o) => !o.upgrade);
  console.log(`Planned vendors, shrines and mailboxes in a tree's crown (shared streets): ${base.length}`);
  for (const key of Object.keys(CROWN_KINDS)) {
    console.log(`  ${NAMES[key]}: ${base.filter((o) => o.key === key).length} of ${planned[key]} planned`);
  }
  const ups = overlaps.filter((o) => o.upgrade);
  if (ups.length) console.log(`  in street upgrade layouts too: ${ups.length}`);
  const show = process.argv.includes('--all') ? overlaps : overlaps.slice(0, 8);
  for (const o of show) {
    console.log(`  ${o.label} (${o.tsid}${o.upgrade ? `, upgrade ${o.upgrade}` : ''}): ${o.key} ${o.index} at ${o.x},${o.y} in tree ${o.tree} at ${o.tx},${o.ty}${o.blocked ? ' (no clear spot left)' : ''}`);
  }
  // G1061: none may be left (Mossystep's vendor took its hand-ruled slope spot, SLOPE_RULINGS).
  if (overlaps.length) process.exitCode = 1;
}
