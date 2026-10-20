/**
 * Original Glitch streets (from GSJS inc_data_maps_prod.js) + playable slice geometry.
 * Hub 28 = Old Groddle Forest / Groddle forest streets including West Hechey.
 */

/** @typedef {{ tsid: string, label: string, hubId: string, hubName: string, worldW: number, groundY: number, spawnX: number, theme: string, portals: { to: string, x: number, side: 'left'|'right'|'door', label: string }[], entities?: object[], isHouse?: boolean, returnStreet?: string }} LocationDef */

export const HUBS = {
  '28': {
    id: '28',
    name: 'Old Groddle Forest',
    moteId: '9',
    // From maps_get_hubs_28 / maps street list in maps_prod
  },
};

/**
 * Playable original streets + personal house.
 * Street TSIDs and labels are from data_maps streets hub "28".
 * Portals approximate map adjacency (West Hechey ↔ East Hechey ↔ Hechey Track).
 */
export const LOCATIONS = {
  LM411BNOGTUG2: {
    tsid: 'LM411BNOGTUG2',
    label: 'West Hechey Clearing',
    hubId: '28',
    hubName: 'Old Groddle Forest',
    worldW: 2400,
    groundY: 420,
    spawnX: 200,
    theme: 'forest',
    portals: [
      {
        to: 'LM4103P17E3G0',
        x: 2320,
        side: 'right',
        label: 'to East Hechey Clearing',
      },
      {
        to: 'RH_HOME_INT',
        x: 480,
        side: 'door',
        label: 'Your House',
      },
    ],
    entities: {
      piggies: [380, 700, 1100, 1500, 1900],
      chickens: [500, 900, 1400],
      apples: [420, 800, 1200, 1600],
      butterflies: [650, 1300],
      trees: [1700, 2000],
      quoins: true,
    },
  },
  LM4103P17E3G0: {
    tsid: 'LM4103P17E3G0',
    label: 'East Hechey Clearing',
    hubId: '28',
    hubName: 'Old Groddle Forest',
    worldW: 2200,
    groundY: 420,
    spawnX: 180,
    theme: 'meadow',
    portals: [
      {
        to: 'LM411BNOGTUG2',
        x: 80,
        side: 'left',
        label: 'to West Hechey Clearing',
      },
      {
        to: 'LM4104P19669M',
        x: 2100,
        side: 'right',
        label: 'to Hechey Track',
      },
      {
        to: 'RH_HOME_INT',
        x: 600,
        side: 'door',
        label: 'Your House',
      },
    ],
    entities: {
      piggies: [400, 900, 1600],
      chickens: [700, 1200],
      apples: [350, 950],
      butterflies: [1100],
      trees: [1400],
      quoins: true,
    },
  },
  LM4104P19669M: {
    tsid: 'LM4104P19669M',
    label: 'Hechey Track',
    hubId: '28',
    hubName: 'Old Groddle Forest',
    worldW: 2000,
    groundY: 420,
    spawnX: 160,
    theme: 'path',
    portals: [
      {
        to: 'LM4103P17E3G0',
        x: 80,
        side: 'left',
        label: 'to East Hechey Clearing',
      },
      {
        to: 'RH_HOME_INT',
        x: 900,
        side: 'door',
        label: 'Your House',
      },
    ],
    entities: {
      piggies: [500, 1100],
      chickens: [800],
      apples: [600, 1400],
      butterflies: [],
      trees: [1600],
      quoins: true,
    },
  },
  /** Personal home interior — GSJS homes model (player-owned interior). */
  RH_HOME_INT: {
    tsid: 'RH_HOME_INT',
    label: 'Your House',
    hubId: 'home',
    hubName: 'Home',
    worldW: 1200,
    groundY: 420,
    spawnX: 200,
    theme: 'house',
    isHouse: true,
    returnStreet: 'LM411BNOGTUG2',
    portals: [
      {
        to: '__RETURN__',
        x: 100,
        side: 'door',
        label: 'Leave house',
      },
    ],
    entities: {
      piggies: [],
      chickens: [],
      apples: [400],
      butterflies: [],
      trees: [],
      quoins: false,
    },
  },
};

export const DEFAULT_STREET = 'LM411BNOGTUG2';

/**
 * @param {string} tsid
 * @returns {LocationDef}
 */
export function getLocation(tsid) {
  const loc = LOCATIONS[tsid];
  if (!loc) {
    throw new Error(`Unknown location tsid: ${tsid}`);
  }
  return loc;
}

/**
 * @param {string} tsid
 * @returns {{ tsid: string, label: string, hubId: string, hubName: string, worldW: number, groundY: number, spawnX: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }}
 */
export function loadLocation(tsid) {
  const loc = getLocation(tsid);
  return {
    tsid: loc.tsid,
    label: loc.label,
    hubId: loc.hubId,
    hubName: loc.hubName,
    worldW: loc.worldW,
    groundY: loc.groundY,
    spawnX: loc.spawnX,
    theme: loc.theme,
    isHouse: !!loc.isHouse,
    portals: loc.portals.map((p) => ({ ...p })),
    entities: loc.entities ? { ...loc.entities } : {},
    bounds: {
      minX: 24,
      maxX: loc.worldW - 24,
      minY: 0,
      maxY: loc.groundY + 40,
    },
  };
}

/**
 * @param {{ x: number, y: number }} player
 * @param {{ bounds: { minX: number, maxX: number, minY: number, maxY: number } }} location
 */
export function playerInBounds(player, location) {
  const b = location.bounds;
  return (
    player.x >= b.minX &&
    player.x <= b.maxX &&
    player.y >= b.minY &&
    player.y <= b.maxY + 80
  );
}

/**
 * Find a portal the player is standing on.
 * @param {number} px
 * @param {ReturnType<typeof loadLocation>} location
 * @param {number} [radius=48]
 */
export function portalAt(px, location, radius = 48) {
  for (const p of location.portals) {
    if (Math.abs(px - p.x) <= radius) return p;
  }
  return null;
}
