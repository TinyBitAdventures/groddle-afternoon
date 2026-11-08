/**
 * Regional shrines: the 33 shrine classes beside the 11 plain ones
 * (items/npc_shrine_firebog_<giant>.js, npc_shrine_ix_<giant>.js,
 * npc_shrine_uralia_<giant>.js, all children of npc_shrine_base with the
 * same verbs and the same label "Shrine to <Giant>"). Each wears its own art:
 * Firebog's wooden posts and bowl, Ix's pink frame, Uralia's blue cavern
 * urn. The pictures are Tiny Speck's own open / close sheets from the
 * OpenGameArt dump (glitch-assets-1/2.7z, CC0), cut to lossless WebP by
 * tools/shrine-variants/build.mjs (manifest assets/sprites/shrines/variants.json
 * with each file's sha256 and its OGA source).
 *
 * Which variant a street had is not in the dump: a location's item objrefs
 * carry only the label, and every variant's label is the plain one. The
 * remake picks it by the street's hub, the rule the regional Street Spirits
 * use (main.js ambient_hub_map 456-510, js/street-spirits.js): the Firebog
 * hubs get the Firebog shrine, Uralia and its caverns the Uralia shrine, Ix
 * the Ix shrine, every other hub the plain one. That puts 120 Firebog, 19
 * Uralia and 4 Ix shrines on the archived streets.
 *
 * Sheet geometry (OGA __x1_open / __x1_close, measured 2026-11-08): plain
 * 151 x 188 in 6 columns (open 22 frames, close 23), Firebog 164 x 212 in 6
 * (22, 23), Ix 168 x 216 in 5 (24, 20), Uralia 126 x 188 in 6 (22, 23).
 * shrines.js showSplatterOverlayFinish 845-852 also tells the variants
 * apart: the splatter sits 275 px down on Ix, 255 on Firebog, 195 on Uralia.
 */

import { FIREBOG_HUBS, IX_HUBS, URALIA_HUBS } from './street-spirits.js?v=f9e88445';

export const SHRINE_REGIONS = Object.freeze(['base', 'firebog', 'ix', 'uralia']);

/** Cell size, columns and frame counts of each region's open / close sheets. */
export const SHRINE_SHEETS = Object.freeze({
  base: Object.freeze({ fw: 151, fh: 188, cols: 6, open: 22, close: 23 }),
  firebog: Object.freeze({ fw: 164, fh: 212, cols: 6, open: 22, close: 23 }),
  ix: Object.freeze({ fw: 168, fh: 216, cols: 5, open: 24, close: 20 }),
  uralia: Object.freeze({ fw: 126, fh: 188, cols: 6, open: 22, close: 23 }),
});

/** The region a hub's shrines belong to (main.js ambient_hub_map, as js/street-spirits.js reads it). */
export function shrineRegionForHub(hubId) {
  const hub = String(hubId ?? '');
  if (FIREBOG_HUBS.includes(hub)) return 'firebog';
  if (URALIA_HUBS.includes(hub)) return 'uralia';
  if (IX_HUBS.includes(hub)) return 'ix';
  return 'base';
}

/** The source class's Giant part: Tii is "tii" on Firebog and "ti" elsewhere (npc_shrine_firebog_tii.js, npc_shrine_ix_ti.js). */
function classGiant(region, giantId) {
  const g = String(giantId || '').toLowerCase();
  if ((g === 'ti' || g === 'tii') && region === 'firebog') return 'tii';
  return g === 'tii' ? 'ti' : g;
}

/** The GSJS class of a region's shrine to a Giant (npc_shrine_<giant> for the plain one). */
export function shrineClassFor(region, giantId) {
  const g = classGiant(region, giantId);
  return region && region !== 'base' ? `npc_shrine_${region}_${g}` : `npc_shrine_${g}`;
}

/** The sheet a shrine draws: { url, fw, fh, cols, frames } for 'open' or 'close'. */
export function shrineSheet(region, giantId, motion) {
  const r = SHRINE_SHEETS[region] ? region : 'base';
  const def = SHRINE_SHEETS[r];
  const g = String(giantId || '').toLowerCase() === 'tii' ? 'ti' : String(giantId || '').toLowerCase();
  const dir = r === 'base' ? '' : `${r}/`;
  return { url: `assets/sprites/shrines/${dir}${g}_${motion}.webp`, fw: def.fw, fh: def.fh, cols: def.cols, frames: def[motion] };
}

/**
 * A street's shrine: { region, classTsid }. `forced` (QA: &shrineregion=)
 * names a region to use instead of the hub's.
 */
export function shrineVariantFor(street = {}, giantId, forced = '') {
  const region = SHRINE_REGIONS.includes(forced) ? forced : shrineRegionForHub(street?.hubId);
  return { region, classTsid: shrineClassFor(region, giantId) };
}
