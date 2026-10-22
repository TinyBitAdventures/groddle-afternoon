/**
 * Musicblock collection badges from every source (see js/feature-host.js).
 *
 * The collection_musicblocks_* trophies count `in_inventory` per block
 * (GSJS achievements/collection_musicblocks_*.js). game.js emits it for a
 * block picked up off a street, but blocks also arrive in the pack from
 * drop tables (Chicken squeezes, croppery, herbalism, tree petting and
 * watering, refining, barnacles, jellisacs, peat), the soil
 * (musicblocks_brown), the Spinning Wheel and quests. This feature watches
 * the pack once a second and emits `in_inventory:<block>` the first time a
 * block shows up, so a series badge unlocks the moment its fifth tune lands.
 * Counting an already-owned block again is harmless (each condition needs 1).
 */

import { MUSICBLOCK_CATALOG } from '../musicblocks.js';

const SYNC_MS = 1_000;
const BLOCK_IDS = Object.keys(MUSICBLOCK_CATALOG);

let owned = null;
let nextSyncAt = 0;

/** Block ids whose count went from 0 to at least 1 since the last look. */
export function newlyOwnedMusicblocks(before, inv) {
  const out = [];
  for (const id of BLOCK_IDS) {
    if ((Number(inv?.[id]) || 0) > 0 && !before.has(id)) out.push(id);
  }
  return out;
}

export const musicblocksFeature = {
  id: 'musicblocks',

  onTick(dtMs, now, engine) {
    if (now < nextSyncAt || !engine.inv) return;
    nextSyncAt = now + SYNC_MS;
    if (!owned) {
      // game.js already counts the blocks owned at boot.
      owned = new Set(BLOCK_IDS.filter((id) => (Number(engine.inv[id]) || 0) > 0));
      return;
    }
    for (const id of newlyOwnedMusicblocks(owned, engine.inv)) {
      owned.add(id);
      engine.achievement(`in_inventory:${id}`, 1);
    }
    for (const id of owned) if (!((Number(engine.inv[id]) || 0) > 0)) owned.delete(id);
  },
};
