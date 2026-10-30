/**
 * World session: current street, teleport graph, personal house enter/exit.
 */

import {
  DEFAULT_STREET,
  loadLocation,
  getLocation,
  portalAt,
  playerInBounds,
} from './locations.js?v=7e086f05';

/**
 * @typedef {ReturnType<typeof loadLocation>} LoadedLocation
 */

/**
 * @typedef {{
 *   currentTsid: string,
 *   location: LoadedLocation,
 *   previousStreetTsid: string | null,
 *   houseReturnTsid: string | null,
 * }} WorldSession
 */

/**
 * @param {string} [startTsid]
 * @returns {WorldSession}
 */
export function createWorld(startTsid = DEFAULT_STREET) {
  const location = loadLocation(startTsid);
  return {
    currentTsid: location.tsid,
    location,
    previousStreetTsid: null,
    houseReturnTsid: null,
  };
}

/**
 * Teleport to a destination street (not house special-case).
 * @param {WorldSession} world
 * @param {string} destTsid
 * @param {{ spawnX?: number }} [opts]
 */
export function teleportTo(world, destTsid, opts = {}) {
  if (destTsid === '__RETURN__') {
    return leaveHouse(world);
  }
  const dest = loadLocation(destTsid);
  if (!world.location.isHouse) {
    world.previousStreetTsid = world.currentTsid;
  }
  world.currentTsid = dest.tsid;
  world.location = dest;
  const spawnX = opts.spawnX ?? dest.spawnX;
  return {
    ok: true,
    tsid: dest.tsid,
    label: dest.label,
    hubName: dest.hubName,
    spawnX,
    spawnY: dest.groundY,
    location: dest,
  };
}

/**
 * Enter personal house from current street.
 * @param {WorldSession} world
 */
export function enterHouse(world) {
  if (world.location.isHouse) {
    return { ok: false, reason: 'already_in_house', location: world.location };
  }
  world.houseReturnTsid = world.currentTsid;
  world.previousStreetTsid = world.currentTsid;
  const house = loadLocation('RH_HOME_INT');
  // Dynamic return street stored on session; location.returnStreet is default
  world.currentTsid = house.tsid;
  world.location = {
    ...house,
    returnStreet: world.houseReturnTsid,
  };
  return {
    ok: true,
    tsid: house.tsid,
    label: house.label,
    hubName: house.hubName,
    spawnX: house.spawnX,
    spawnY: house.groundY,
    returnStreet: world.houseReturnTsid,
    location: world.location,
  };
}

/**
 * Leave house to return street.
 * @param {WorldSession} world
 */
export function leaveHouse(world) {
  if (!world.location.isHouse) {
    return { ok: false, reason: 'not_in_house', location: world.location };
  }
  const returnTsid =
    world.houseReturnTsid || world.location.returnStreet || DEFAULT_STREET;
  world.houseReturnTsid = null;
  return teleportTo(world, returnTsid);
}

/**
 * Use portal under player if any.
 * @param {WorldSession} world
 * @param {number} playerX
 */
export function tryUsePortal(world, playerX) {
  const portal = portalAt(playerX, world.location);
  if (!portal) return { ok: false, reason: 'no_portal' };

  if (portal.to === 'RH_HOME_INT' || (portal.side === 'door' && portal.to === 'RH_HOME_INT')) {
    return { ...enterHouse(world), portal };
  }
  if (portal.to === '__RETURN__') {
    return { ...leaveHouse(world), portal };
  }
  // Arrive slightly inset from the connecting edge
  const dest = getLocation(portal.to);
  let spawnX = dest.spawnX;
  if (portal.side === 'right') spawnX = 120;
  if (portal.side === 'left') spawnX = dest.worldW - 120;
  return { ...teleportTo(world, portal.to, { spawnX }), portal };
}

export { loadLocation, getLocation, portalAt, playerInBounds, DEFAULT_STREET };
