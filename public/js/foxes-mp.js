/**
 * Fox Brushing Preserves between real players (G329, the fox_flurrier badge):
 * pure helpers for the multiplayer branch of features/foxes-feature.js. The
 * realtime server's foxes.go owns each preserve's foxes and baits (its header
 * lists the messages); every player's game draws them and runs them along the
 * street with the solo rules in js/foxes.js.
 *
 * Source (glitch-GameServerJS, CC0):
 * - locations/inc_npcs.js:130-160 spawn_fox: max_foxes = active players / 3;
 *   a fox that appears while more than two are already there counts
 *   fox / three_or_more for everyone on the street (fox_flurrier).
 * - items/npc_fox_ranger.js:480-497 overCapacity: eight players past the
 *   Ranger and nobody else may go in.
 * - items/fox_bait.js:117 and locations/location.js:4347-4362 dropFoxBaits:
 *   three baits 300 px apart from randInt(x, x - 400).
 */

import { baitDropPlan } from './foxes.js';

/** inc_npcs.js:132: max_foxes = getNumActivePlayers() / 3. */
export const FOX_PLAYERS_PER_FOX = 3;

/** npc_fox_ranger.js:497: count >= 8 past the Ranger is over capacity. */
export const FOX_PRESERVE_CAPACITY = 8;

/**
 * Ours: how long a leaving fox still counts on the server (the source counts it
 * until it reaches the exit, 500 px past the spawner at 500 px/s; the server
 * cannot see where it runs).
 */
export const FOX_LEAVE_MS = 8000;

/** The badge counter a flurry counts (achievements/fox_flurrier.js:17-22). */
export const FOX_FLURRY_COUNTER = 'fox:three_or_more';

const ID_RE = /^[a-z0-9-]{1,40}$/;

/** A fox or bait id the server sent, or ''. */
export function serverId(v) {
  const s = String(v ?? '');
  return ID_RE.test(s) ? s : '';
}

/** The baits of a fox_baits / fox_state message: [{ id, x }]. */
export function normalizeBaits(list) {
  const out = [];
  for (const b of Array.isArray(list) ? list : []) {
    const id = serverId(b?.id);
    const x = Number(b?.x);
    if (id && Number.isFinite(x)) out.push({ id, x });
  }
  return out;
}

/** The foxes of a fox_state message: [{ id, leaving }]. */
export function normalizeFoxes(list) {
  const out = [];
  for (const f of Array.isArray(list) ? list : []) {
    const id = serverId(f?.id);
    if (id) out.push({ id, leaving: f?.leaving === true });
  }
  return out;
}

/** The three drop spots an ignite sends (dropFoxBaits, clamped to the street like solo's dropBaits). */
export function igniteBaitXs(playerX, worldW, rng = Math.random) {
  const w = Number.isFinite(worldW) && worldW > 120 ? worldW : Infinity;
  return baitDropPlan(Number(playerX) || 0, rng).map((row) => Math.round(Math.max(60, Math.min(w - 60, row.x))));
}

/**
 * npc_fox_ranger.js overCapacity: the other players already past the Ranger
 * (inside: +1 when the preserve is to the Ranger's right, -1 to its left).
 */
export function playersInside(players, rangerX, inside) {
  if (!Number.isFinite(rangerX) || !inside) return 0;
  let n = 0;
  for (const p of Array.isArray(players) ? players : []) {
    const x = Number(p?.x);
    if (Number.isFinite(x) && (x - rangerX) * inside > 0) n += 1;
  }
  return n;
}

export function preserveOverCapacity(players, rangerX, inside) {
  return playersInside(players, rangerX, inside) >= FOX_PRESERVE_CAPACITY;
}

/** spawn_fox's gate the server applies: another fox only while foxes < players / 3. */
export function serverCanSpawn(foxCount, activePlayers) {
  return foxCount < activePlayers / FOX_PLAYERS_PER_FOX;
}

/** A spawn that finds more than two foxes there counts the flurry (num_foxes > 2). */
export function spawnIsFlurry(foxesBefore) {
  return foxesBefore > 2;
}

/** The least number of players a fourth fox needs (10: at 9, 3 >= 9 / 3 refuses). */
export function playersForFoxes(n) {
  let p = 1;
  while (!serverCanSpawn(n - 1, p)) p += 1;
  return p;
}
