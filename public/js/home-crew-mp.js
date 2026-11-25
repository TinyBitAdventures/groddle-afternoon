/**
 * Crews on a home street in multiplayer (register G929, G947; shared-play audit M3): the rules
 * features/home-crew-mp-feature.js runs. In the original a home street's rocks and Dirt Piles were
 * the ordinary items, so help mine and help dig worked there as anywhere (GameServerJS
 * items/include/mining.js addMiner 68-91, getVerbLabel 8-23, 327-383, 501-505; items/dirt_pile.js
 * addDigger 153-166, 345-485); nothing asks for the owner or a key. The realtime server keeps the
 * crews (groddle-afternoon-server home_crew.go) by the ids the site uses (src/HomeYard.php
 * homeRocks, homeNodes; js/yard-stock-mp.js): rock:<i> and node:dirt_pile:<n>.
 *
 * Pure: no engine, no socket.
 */

import { readHomeStreet } from './neighbours-mp.js?v=e44a14e5';

/** What has a crew on a home street (home_crew.go homeCrewIDRe). */
export const HOME_CREW_ID = /^(rock:\d{1,2}|node:dirt_pile:\d{1,2})$/;

/** The owner of the home street the realtime client stands on (HOME_<id>), or 0. */
export function homeCrewOwner(street) {
  const home = readHomeStreet(street);
  return home && home.room === 'street' ? home.owner : 0;
}

/**
 * A target's crew id on a home street, or null. A visitor's rocks and piles are
 * yard-verbs-mp-feature's copies (target.yardVisit); the owner's own are the street's rock slots
 * (rockIndex: homes-feature draws them in cultivation order, the site's homeRocks order) and
 * resource nodes (resourceKey, homes-feature nodeKeyMap).
 */
export function homeCrewId(target, { owner = 0, me = 0 } = {}) {
  if (!owner || !target) return null;
  const v = target.yardVisit;
  if (v) {
    const id = String(v.id || '');
    return (v.kind === 'rock' || v.kind === 'node') && HOME_CREW_ID.test(id) ? id : null;
  }
  if (owner !== me) return null;
  if (Number.isInteger(target.rockIndex) && target.rockIndex >= 0 && target.rockIndex < 100) return `rock:${target.rockIndex}`;
  const key = String(target.resourceKey || '');
  return /^dirt_pile:\d{1,2}$/.test(key) ? `node:${key}` : null;
}

/** The server's home_crews frame: id -> the player ids at it, or null when it names another home. */
export function normalizeHomeCrews(msg, owner) {
  if (!msg || Number(msg.owner) !== owner || !msg.crews || typeof msg.crews !== 'object') return null;
  const out = new Map();
  for (const [id, list] of Object.entries(msg.crews)) {
    if (!HOME_CREW_ID.test(id) || !Array.isArray(list)) continue;
    const ids = list.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length) out.set(id, ids);
  }
  return out;
}
