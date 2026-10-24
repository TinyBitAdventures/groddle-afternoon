/**
 * Source-derived street population plus deterministic, collision-aware
 * placement on recovered locations-xml platforms.
 */

export const STREET_ECOLOGY_URL = 'assets/content/street-ecology.json?v=official-ecology-6';

/**
 * Interior hubs: every street in them is indoors, and their archived item
 * lists hold no animals, fruit or Musicblocks. Jethimadh Tower: Base (hub 77,
 * inc_data_maps_prod.js) is six corridors whose objrefs are Quoins (labelled
 * "Quoin" or "Coin", the same quoin class), a Qurazy marker and one spawner
 * each; the Glitch Forever wiki has those spawners dropping keys and drinks
 * (C3's key, C5's Cloud 11 Smoothies, C6's Slow Gin Fizz), never animals.
 * build-street-ecology.mjs marks their rows `interior: true` with the archived
 * quoin count; populationForStreet then keeps only the exact static counts.
 * Rows a feature builds for rebuilt rooms (tower-rooms-feature) do the same.
 */
export const INTERIOR_HUBS = Object.freeze({ 77: 'Jethimadh Tower: Base' });

export function isInteriorHub(hubId) {
  return hubId != null && hubId !== '' && Object.prototype.hasOwnProperty.call(INTERIOR_HUBS, String(hubId));
}

/**
 * Interior streets in outdoor hubs (G43). build-street-ecology.mjs asks
 * interiorReason() for every street and writes `interior: true` plus the
 * reason (`interiorWhy`) on the row, so no fallback piggies, trees, vendor or
 * shrine appear indoors. The tests, in order:
 *
 * - door art: the street's own doors use the art drawn for a door seen from
 *   inside (`*_int*`, `*interior*`, stair doors, `shoppeIn`). This finds the
 *   five abandoned-apartment lobbies, their five basements (location.js lists
 *   the same basements as "Apt basements"), Uncle Friendly's Emporium, the
 *   Jethimadh Tower Base rooms, Mazza'la Gala and the Underground Puzzles.
 * - art sets: every SWF the street draws from is an interior set
 *   (`bldg_int_*`, `pol_int_*`, or one listed in INTERIOR_ART_SETS): the two
 *   community machine rooms, Giant Living Room, Giant Kitchen and the Eesti
 *   Life catalog rooms. Outdoor streets that borrow a few interior decos keep
 *   outdoor art too, so they never match.
 * - GameServerJS lists, passed in by the build: config_prod.js
 *   `machine_rooms`, and inc_data_pols_prod.js POL templates (SM Apartment 01,
 *   the bottle-tree apartment).
 * - INTERIOR_STREETS: the few interiors no source field marks, each with why.
 */
export const INTERIOR_DOOR_ART = /(?:_int(?:_|\d|$)|interior|stairdoor|stairs_(?:up|down)|shoppeIn$)/i;

export const INTERIOR_ART_SETS = Object.freeze({
  'kukubee2.swf': 'k04 room art only: floors, wallpaper, counters, fridge (Giant Kitchen, Giant Living Room, Eesti Life Catalog Page 17)',
});

export const INTERIOR_STREETS = Object.freeze({
  GDOOSA8V29J24I3: 'The forgotten floor: an apartment hall (apartment_hall_wall, sign_apartment_groddle, bldg_int_apt art) reached only by teleporter; archived items are notes, a cherry, cubimals and teleporters',
  GDOC74759ST2IG1: 'Autumn Lodge: inside a hollow log (layers "log top", "log back", "log bottom"; 97 apartment_hall_floor pieces); its two spawners hold the two archived Fried Eggs, not animals',
});

function isInteriorArtSet(swf) {
  return /^(?:bldg|pol)_int_/.test(swf) || Object.prototype.hasOwnProperty.call(INTERIOR_ART_SETS, swf);
}

/**
 * Why a street is indoors, or null. `street` is a street JSON (or index row)
 * with tsid, hubId, doors and swf_file; `lists` holds GameServerJS building
 * lists as G-prefixed tsids ({ machineRooms, polTemplates }).
 */
export function interiorReason(street, lists = {}) {
  const tsid = String(street?.tsid || '');
  if (isInteriorHub(street?.hubId)) return `hub ${street.hubId} ${INTERIOR_HUBS[String(street.hubId)]}`;
  const door = (street?.doors || []).find((d) => INTERIOR_DOOR_ART.test(String(d?.sprite || '')));
  if (door) return `door art ${door.sprite}`;
  const swfs = String(street?.swf_file || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (swfs.length && swfs.every(isInteriorArtSet)) return `interior art ${[...new Set(swfs)].join(',')}`;
  const g = tsid.startsWith('L') ? `G${tsid.slice(1)}` : tsid;
  if (lists.machineRooms?.has?.(g)) return 'config_prod.js machine_rooms';
  if (lists.polTemplates?.has?.(g)) return `inc_data_pols_prod.js POL template ${lists.polTemplates.get?.(g) || ''}`.trim();
  if (Object.prototype.hasOwnProperty.call(INTERIOR_STREETS, g)) return INTERIOR_STREETS[g];
  return null;
}

/** @type {{source?:string, sourceSnapshot?:string, streetCount?:number, streets:Record<string, any>}} */
let catalog = { streets: {} };

const TREE_CLASSES = Object.freeze([
  'trant_fruit',
  'trant_egg',
  'trant_bean',
  'trant_bubble',
  'trant_spice',
  'trant_gas',
  'wood_tree',
]);

const ROCK_CLASSES = Object.freeze([
  'rock_metal_1',
  'rock_dullite_1',
  'rock_beryl_1',
  'rock_sparkly_1',
]);

/**
 * Harvestable world resource nodes (see js/resource-nodes.js), in source
 * frequency order, with per-street render caps. `resourceCounts` on a
 * population stays exact; `resourceNodeClasses` is the capped spawn list.
 */
export const RESOURCE_NODE_CLASSES = Object.freeze([
  'npc_firefly',
  'npc_salmon',
  'mortar_barnacle',
  'dust_trap',
  'ice_knob',
  'jellisac',
  'dirt_pile',
  'peat_1',
  'npc_sloth',
  'paper_tree',
]);

export const RESOURCE_NODE_CAPS = Object.freeze({
  npc_firefly: 12,
  npc_salmon: 8,
  mortar_barnacle: 6,
  dust_trap: 4,
  ice_knob: 6,
  jellisac: 6,
  dirt_pile: 3,
  peat_1: 3,
  npc_sloth: 4, // 16 source streets hold 3-4 (Gomed Essoni, Tamar Garna, Heera Amond); Circle Crunch needs 3
  paper_tree: 1,
});

function resourceCountsFrom(counts) {
  const out = {};
  for (const classTsid of RESOURCE_NODE_CLASSES) {
    const n = whole(counts?.[classTsid]);
    if (n > 0) out[classTsid] = n;
  }
  return out;
}

function expandResourceClasses(counts) {
  const out = [];
  for (const classTsid of RESOURCE_NODE_CLASSES) {
    const n = Math.min(whole(counts?.[classTsid]), RESOURCE_NODE_CAPS[classTsid] || 4);
    for (let i = 0; i < n; i += 1) out.push(classTsid);
  }
  return out;
}

function whole(value, fallback = 0, max = 999) {
  const n = Number(value);
  return Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : fallback)));
}

export function stableEcologyHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function streetEcologyAliases(tsid) {
  if (!tsid) return [];
  const out = new Set([String(tsid)]);
  if (String(tsid).startsWith('G')) out.add(`L${String(tsid).slice(1)}`);
  if (String(tsid).startsWith('L')) out.add(`G${String(tsid).slice(1)}`);
  return [...out];
}

export function setStreetEcologyCatalog(next) {
  catalog = next && typeof next === 'object' && next.streets
    ? next
    : { streets: {} };
  return catalog;
}

export function getStreetEcologyCatalog() {
  return catalog;
}

export async function loadStreetEcologyCatalog(fetchImpl = globalThis.fetch) {
  if (!fetchImpl) return catalog;
  try {
    const response = await fetchImpl(STREET_ECOLOGY_URL);
    if (response.ok) setStreetEcologyCatalog(await response.json());
  } catch {
    // Keep the playable fallback population when the optional catalog is absent.
  }
  return catalog;
}

export function ecologyForStreet(tsid, source = catalog) {
  for (const alias of streetEcologyAliases(tsid)) {
    if (source?.streets?.[alias]) return source.streets[alias];
  }
  return null;
}

function expandClasses(counts, classes, totalCap) {
  const out = [];
  for (const classTsid of classes) {
    const perClass = Math.min(whole(counts?.[classTsid]), 8);
    for (let i = 0; i < perClass && out.length < totalCap; i += 1) out.push(classTsid);
  }
  return out;
}

/**
 * Convert an archived item-reference row into bounded playable counts.
 * Static items stay exact (within rendering caps). Archived spawners add no
 * animals: a spawner refills whenever a player enters, so its snapshot already
 * holds what it spawns, and 409 of the 449 archived streets with spawners show
 * no animal at all (register G44b).
 */
export function populationForStreet(tsid, entry, { starter = false } = {}) {
  if (entry?.empty === true) {
    return {
      source: 'tinyspeck-locations-xml',
      sourceTsid: entry.sourceTsid || null,
      sourceEmpty: true,
      giantId: null,
      piggies: 0,
      chickens: 0,
      butterflies: 0,
      flyingButterflies: 0,
      treeClasses: [],
      rockClasses: [],
      gardens: 0,
      vendor: false,
      shrine: false,
      apples: 0,
      musicblocks: 0,
      quoins: 0,
      companions: false,
      resourceCounts: {},
      resourceNodeClasses: [],
    };
  }
  const counts = entry?.counts || {};
  if (entry?.interior === true) {
    // Indoors: exactly what the archived row lists, no spawner-inferred
    // animals, no fallback scenery, no ambient apples or Musicblocks, and the
    // archived quoin count instead of the outdoor eight.
    const butterflies = Math.min(whole(counts.npc_butterfly), 3);
    return {
      source: 'tinyspeck-locations-xml',
      sourceTsid: entry.sourceTsid || null,
      interior: true,
      giantId: entry.giantId || null,
      piggies: Math.min(whole(counts.npc_piggy), 6),
      chickens: Math.min(whole(counts.npc_chicken), 3),
      butterflies,
      flyingButterflies: butterflies,
      treeClasses: expandClasses(counts, TREE_CLASSES, 8),
      rockClasses: expandClasses(counts, ROCK_CLASSES, 10),
      gardens: Math.min(whole(counts.garden), 2),
      vendor: whole(counts.street_spirit) > 0,
      shrine: !!entry.giantId,
      apples: 0,
      musicblocks: 0,
      quoins: whole(entry.quoins, 0, 40),
      companions: entry.companions !== false,
      resourceCounts: resourceCountsFrom(counts),
      resourceNodeClasses: expandResourceClasses(counts),
    };
  }
  const seed = stableEcologyHash(tsid);
  // A feature-built row for a rebuilt street may lift the rendering caps to its
  // source's own count (Vicar's Peak's loading card: 11 Piggies, 7 Chickens);
  // archived rows never carry `caps`.
  const caps = entry?.caps || {};
  let piggies = Math.min(whole(counts.npc_piggy), whole(caps.piggies, 6, 12));
  let chickens = Math.min(whole(counts.npc_chicken), whole(caps.chickens, 3, 8));
  let butterflies = Math.min(whole(counts.npc_butterfly), 3);

  let treeClasses = expandClasses(counts, TREE_CLASSES, 8);
  let rockClasses = expandClasses(counts, ROCK_CLASSES, 10);
  let gardens = Math.min(whole(counts.garden), 2);
  let vendor = whole(counts.street_spirit) > 0;
  let shrine = !!entry?.giantId;

  // The default street remains a self-contained onboarding playground while
  // retaining its exact archived piggy/trant population and official shrine.
  if (starter) {
    piggies = Math.max(3, piggies);
    chickens = Math.max(2, chickens);
    butterflies = Math.max(2, butterflies);
    if (!treeClasses.length) {
      treeClasses = ['trant_fruit', 'trant_egg', 'trant_bean', 'wood_tree'];
    } else if (!treeClasses.includes('wood_tree') && treeClasses.length < 8) {
      treeClasses.push('wood_tree');
    }
    if (!rockClasses.length) {
      rockClasses = [
        'rock_metal_1',
        'rock_dullite_1',
        'rock_beryl_1',
        'rock_sparkly_1',
        'rock_metal_1',
      ];
    }
    gardens = Math.max(2, gardens);
    vendor = true;
    shrine = true;
  }

  // If no official row exists at all, keep a small shippable fallback rather
  // than turning an otherwise playable recovered street into an empty shell.
  if (!entry) {
    piggies = starter ? piggies : 1 + (seed % 2);
    chickens = starter ? chickens : 1;
    butterflies = starter ? butterflies : 1;
    treeClasses = treeClasses.length
      ? treeClasses
      : ['trant_fruit', 'trant_egg', 'trant_bean', 'wood_tree'];
    rockClasses = starter ? rockClasses : ['rock_metal_1', 'rock_dullite_1'];
    gardens = starter ? gardens : 1;
    vendor = true;
    shrine = true;
  }

  return {
    source: entry ? 'tinyspeck-locations-xml' : 'playable-fallback',
    sourceTsid: entry?.sourceTsid || null,
    giantId: entry?.giantId || null,
    piggies,
    chickens,
    butterflies,
    flyingButterflies: Math.min(3, Math.max(starter ? 2 : 0, butterflies)),
    treeClasses,
    rockClasses,
    gardens,
    vendor,
    shrine,
    // Feature-built rows (private instances such as party spaces) may pin
    // these; archived street rows never carry them.
    apples: Number.isFinite(entry?.apples) ? whole(entry.apples, 0, 8) : 4,
    musicblocks: Number.isFinite(entry?.musicblocks) ? whole(entry.musicblocks, 0, 2) : 1,
    quoins: Number.isFinite(entry?.quoins) ? whole(entry.quoins, 0, 40) : 8,
    companions: entry?.companions !== false,
    resourceCounts: resourceCountsFrom(counts),
    resourceNodeClasses: expandResourceClasses(counts),
  };
}

/** Build dense, stable candidates along the lower reachable platform bands. */
export function buildPlatformCandidates(platforms, { worldW = 2500, seed = '' } = {}) {
  const clean = (platforms || []).filter((platform) => {
    return [platform?.x1, platform?.y1, platform?.x2, platform?.y2].every(Number.isFinite);
  });
  if (!clean.length) {
    return Array.from({ length: 32 }, (_, index) => ({
      id: `fallback:${index}`,
      x: 80 + ((index * 173) % Math.max(200, worldW - 160)),
      y: 600,
    }));
  }
  const minY = Math.min(...clean.flatMap((p) => [p.y1, p.y2]));
  const maxY = Math.max(...clean.flatMap((p) => [p.y1, p.y2]));
  const lowerThreshold = minY + (maxY - minY) * 0.46;
  let pool = clean.filter((p) => (p.y1 + p.y2) / 2 >= lowerThreshold);
  if (pool.length < 4) pool = clean;

  const candidates = [];
  const seen = new Set();
  for (let pIndex = 0; pIndex < pool.length; pIndex += 1) {
    const platform = pool[pIndex];
    const width = Math.abs(platform.x2 - platform.x1);
    if (width < 18) continue;
    const samples = Math.max(1, Math.ceil(width / 88));
    for (let i = 0; i < samples; i += 1) {
      const t = (i + 0.5) / samples;
      const x = platform.x1 + (platform.x2 - platform.x1) * t;
      const y = platform.y1 + (platform.y2 - platform.y1) * t;
      if (x < 34 || x > worldW - 34) continue;
      const key = `${Math.round(x / 22)}:${Math.round(y / 14)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ id: `${platform.id || pIndex}:${i}`, x, y });
    }
  }
  candidates.sort((a, b) => {
    return stableEcologyHash(`${seed}:${a.id}`) - stableEcologyHash(`${seed}:${b.id}`);
  });
  return candidates;
}

function scaledDistance(a, b, verticalScale = 1.75) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * verticalScale);
}

/**
 * Allocate every category in one pass. Large scenery goes first, then roaming
 * NPCs and collectibles fill the remaining platform anchors.
 *
 * @param {any[]} platforms
 * @param {{key:string,count:number,clearance:number}[]} requests
 */
export function planStreetPlacements(
  platforms,
  requests,
  { worldW = 2500, seed = '', reserved = [] } = {}
) {
  const candidates = buildPlatformCandidates(platforms, { worldW, seed });
  const occupied = (reserved || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map((point, index) => ({ ...point, key: point.key || `reserved:${index}`, clearance: whole(point.clearance, 120, 600) }));
  const used = new Set();
  const groups = {};

  for (const request of requests || []) {
    const count = whole(request?.count, 0, 40);
    const clearance = whole(request?.clearance, 40, 600);
    groups[request.key] = [];
    for (let index = 0; index < count; index += 1) {
      let best = null;
      let bestScore = -Infinity;
      for (const candidate of candidates) {
        if (used.has(candidate.id)) continue;
        const nearest = occupied.length
          ? Math.min(...occupied.map((other) => {
              const needed = Math.max(1, clearance + other.clearance);
              return scaledDistance(candidate, other) / needed;
            }))
          : 2;
        const centerBias = request.key === 'player'
          ? 0.85 - Math.abs(candidate.x - worldW / 2) / Math.max(1, worldW / 2)
          : 0;
        const edgeBias = Math.min(candidate.x, worldW - candidate.x) / Math.max(1, worldW) * 0.08;
        const jitter = (stableEcologyHash(`${seed}:${request.key}:${index}:${candidate.id}`) % 1000) / 100000;
        const score = nearest + centerBias + edgeBias + jitter;
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      if (!best) break;
      used.add(best.id);
      const point = { x: best.x, y: best.y, id: best.id, key: request.key, clearance };
      groups[request.key].push(point);
      occupied.push(point);
    }
  }

  return { seed: String(seed), groups, occupied, candidateCount: candidates.length };
}

export function nearestPlacementGap(plan, fromKey, toKeys = null) {
  const from = plan?.groups?.[fromKey] || [];
  const allowed = toKeys ? new Set(toKeys) : null;
  const targets = Object.entries(plan?.groups || {})
    .filter(([key]) => key !== fromKey && (!allowed || allowed.has(key)))
    .flatMap(([, points]) => points);
  if (!from.length || !targets.length) return Infinity;
  return Math.min(...from.flatMap((a) => targets.map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
}
