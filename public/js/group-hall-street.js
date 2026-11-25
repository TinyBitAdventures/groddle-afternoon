/**
 * Group Hall streets (register G1312, Austin 2026-11-25: "one hall first, then the rest; a layout for
 * his review before the other nine"; G331, G1301). Pure data, rules and the street builder (no Pixi,
 * no DOM): tools/build-rebuilt-rooms.mjs writes the street JSON and its index row,
 * features/group-hall-street-feature.js names the street after its group and keeps non-members out,
 * and the lot on the hall's public street (features/street-jobs-feature.js, js/group-hall-lot.js)
 * is the way in. The realtime server checks every join (groddle-afternoon-server
 * group_hall_streets.go) against the site's signed groups list.
 *
 * What survives of Glitch's halls (GameServerJS and the location archive, CC0):
 * - Each hall job's `street_info.target_street` (streets/mnt/stos/location_data, the lot street's
 *   jobs block) was a street made beforehand and kept locked: the job's primary_location
 *   (locations/inc_jobs.js 283-292). Archimedes Acres's hall, job 692, is LA51318ODPB2UF7. None of
 *   the ten hall streets, and none of the group templates GameServerJS names
 *   (inc_data_pols_prod.js 585-628 "Group Meadows 1", inc_data_maps_prod.js 18176-18198 GOL), is
 *   in the archive.
 * - quests/quest.js 1831-1863: the finished hall hides the lot (1843), is named after the group,
 *   "A Private Group" for a private one (1849-1854), the group owns it and its signpost opens
 *   (pols_setOwner, jobs_modify_connections 1857-1858; group.addPol 1861).
 * - locations/inc_pols.js pols_canEnter 286-349: a group's location lets in its members only;
 *   anyone else hears players/inc_houses.js 500 "The location is the property of <b>...</b>, and
 *   you are not a member." The job's own words: "Once completed, only group members will be able
 *   to access it -- like your own private country club!"
 * - GlitchAddict's video PUzIKuL2tPo "New Group Halls" (2011-09-16; reference only, never pixels),
 *   job 694's hall: an ordinary three-tier Groddle street (grass terraces over earth banks), one
 *   wooden signpost back to the lot street on the upper ledge at the left, a Community Machine Room
 *   hut on the middle tier with a ladder to its roof (players stood on it) and its door locked, a
 *   long lower path; the street named after the group (the minimap's title).
 *
 * Built from (CC0, tinyspeck/glitch-locations):
 * - Fanfoot Flare (GCR10M2FUJK177P, hub 58 Groddle Meadow, as Archimedes Acres's hall is): an
 *   archived meadow street of exactly that shape, three tiers of grass over earth banks on its left,
 *   a long lower path to the right, and one signpost, on its upper ledge at the left. Its sky,
 *   hills, banks and plants as they are; its hidden box left out.
 * - The Community Machine Room's exterior (community_machine_room_ext, its arched door drawn in),
 *   with the walkable roof Tiny Speck gave it on Middle Valley Clearing (GLI23FELDHD1O3C: the roof
 *   line 210 px left and 152 px right of the hut's middle, 353 px up), and a wooden ladder
 *   (ladder_tile_*_basicWood).
 *
 * Ours (inventions: group-hall-street-layout):
 * - The template street, where the hut stands on it (the middle tier's flattest run), the ladder on
 *   its right side, and no door to use (locked in the video; no room behind it yet).
 * - The name "<group>'s Group Hall" (OWNED_TEXT.name, Austin 2026-11-25); Glitch used the group's
 *   name alone.
 * - The way in is the lot's verb (Glitch hid the lot and opened a signpost on the lot street); the
 *   way out lands in front of the lot.
 * - Nothing grows or lives here yet (no ecology row survives for any hall street).
 */

import { OWNED_TEXT } from './group-hall-lot.js?v=045c799a';

/** The template street the hall is laid on (CC0 geometry and decos). */
export const HALL_TEMPLATE_TSID = 'GCR10M2FUJK177P';

/**
 * The halls whose street is built, by job id: the hall's street (its target_street, G-prefixed as
 * the game's streets are) and the public street its lot stands on. Phase 1: Archimedes Acres only.
 */
export const HALL_STREET_JOBS = Object.freeze({
  692: Object.freeze({
    tsid: 'GA51318ODPB2UF7',
    lot: 'GLI32N0F1UD114O',
    lotName: 'Archimedes Acres',
    hubId: '58',
    hubName: 'Groddle Meadow',
    // Screen space, on the floor (tools/build-rebuilt-rooms.mjs checks both): where you land in the
    // hall (beside its signpost, HALL_LAYOUT.arrive) and on the lot street mid-street (world 0, -60),
    // where the game then stands you at the lot (features/group-hall-street-feature.js).
    inside: Object.freeze({ x: 230, y: 560 }),
    lotOut: Object.freeze({ x: 3000, y: 914 }),
  }),
});

/** Archimedes Acres's hall (job 692). */
export const ARCHIMEDES_HALL = HALL_STREET_JOBS[692];

/** Hall street placements (world px, the template's bounds -3000..3000 x -1000..0). */
export const HALL_LAYOUT = Object.freeze({
  /** The template's one signpost, on the upper ledge at the left: its way back to the lot street. */
  signId: 'signpost_2',
  /** Where you arrive from the lot: beside that signpost, on the upper ledge (as in the video). */
  arrive: Object.freeze({ x: -2770, y: -445 }),
  /** The hut: its bottom middle on the middle tier (y -256 under it, the art's foot 8 px into the ground). */
  hut: Object.freeze({ sprite: 'community_machine_room_ext', x: -400, y: -248, w: 556, h: 393 }),
  /** The roof you can stand on (Middle Valley Clearing's plat_1337364235531), reaching the ladder on the right. */
  roof: Object.freeze({ l: -210, r: 200, dy: -353 }),
  /** The ladder up the hut's right side, from the middle tier to the roof (h: whole 50 px rungs, its top at the roof). */
  ladder: Object.freeze({ dx: 185, w: 50, h: 350 }),
});

/** The wood ladder's tiles (as Archimedes Acres's neighbour streets draw theirs). */
const LADDER_TILING = Object.freeze({
  cap_0: { sprite: 'ladder_tile_center_00_basicWood', w: 60, h: 50 },
  cap_1: { sprite: 'ladder_tile_cap_1_basicWood', w: 60, h: 50 },
  centers: [{ sprite: 'ladder_tile_center_00_basicWood', w: 60, h: 50 }],
});

export const HALL_STREET_TEXT = Object.freeze({
  /** inc_houses.js:500 (its <b> left out). */
  notMember: (group) => `The location is the property of ${group}, and you are not a member.`,
  notBuilt: "This group hall isn't built yet.", // ours
  solo: 'Group Halls are in the online game.', // ours
  offline: "The hall can't be reached right now. Try again in a moment.", // ours
  checking: 'Checking your groups. Try again in a moment.', // ours
  enter: 'enter', // ours (Glitch: the hall's signpost on the lot street)
  enterTip: (group) => `Go into ${OWNED_TEXT.name(group)}`,
  /** The street before its group is known (a reload, a slow answer). */
  unnamed: 'A Group Hall', // ours
});

/** The hall's name: "<group>'s Group Hall" ("A Private Group's Group Hall" for a private group). */
export const hallLabel = (group) => (String(group || '').trim() ? OWNED_TEXT.name(String(group).trim()) : HALL_STREET_TEXT.unnamed);

const sameTsid = (a, b) => String(a || '').length > 1 && String(a || '').slice(1) === String(b || '').slice(1);

/** The hall job whose street this is ('' for any other street). */
export function hallStreetJob(tsid) {
  for (const [job, row] of Object.entries(HALL_STREET_JOBS)) if (sameTsid(tsid, row.tsid)) return job;
  return '';
}

/** The built hall street of a hall job, or null. */
export const hallStreetOf = (jobId) => HALL_STREET_JOBS[String(jobId || '')] || null;

/**
 * pols_canEnter for a hall street, as the game can tell before the server's word:
 * { ok: true } or { ok: false, why, text }.
 * - mp: the game is online; online: the realtime client is connected.
 * - owner: the hall's row from the server (hall.owned, hall.group { id, name }), or null.
 * - myGroups: the ids of the groups the site's list has you in, or null before it has come.
 */
export function hallEntry({ mp = false, online = false, owner = null, myGroups = null } = {}) {
  if (!mp) return { ok: false, why: 'solo', text: HALL_STREET_TEXT.solo };
  if (!online) return { ok: false, why: 'offline', text: HALL_STREET_TEXT.offline };
  if (!owner?.owned) return { ok: false, why: 'unbuilt', text: HALL_STREET_TEXT.notBuilt };
  if (!Array.isArray(myGroups)) return { ok: false, why: 'checking', text: HALL_STREET_TEXT.checking };
  const id = Number(owner.group?.id);
  if (!myGroups.some((g) => Number(g) === id)) return { ok: false, why: 'member', text: HALL_STREET_TEXT.notMember(owner.group?.name || 'A Private Group') };
  return { ok: true };
}

/** No ecology row survives for a hall street: nothing grows or lives there yet. */
export function hallStreetEcology(tsid) {
  const job = hallStreetJob(tsid);
  if (!job) return null;
  return { label: HALL_STREET_TEXT.unnamed, sourceTsid: `L${HALL_STREET_JOBS[job].tsid.slice(1)}`, counts: {}, quoins: 0, reconstructed: true };
}

/* ------------------------------------------------------------------ */
/* The street                                                          */
/* ------------------------------------------------------------------ */

const clone = (v) => JSON.parse(JSON.stringify(v));
const countDecos = (layers) => layers.reduce((n, l) => n + (l.decos?.length || 0), 0);

/** The y of the walk line under x nearest `near` (platforms { x1, y1, x2, y2 }), or `near`. */
function floorAt(platforms, x, near) {
  let best = null;
  for (const p of platforms || []) {
    const lo = Math.min(p.x1, p.x2);
    const hi = Math.max(p.x1, p.x2);
    if (x < lo || x > hi || hi === lo) continue;
    const y = p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / (p.x2 - p.x1);
    if (best == null || Math.abs(y - near) < Math.abs(best - near)) best = y;
  }
  return Math.round(best ?? near);
}

/** The hut's pieces on the template (world px; the middleground is the street's own size). */
export function hutPieces(platforms = []) {
  const H = HALL_LAYOUT.hut;
  const R = HALL_LAYOUT.roof;
  const L = HALL_LAYOUT.ladder;
  const floorY = H.y - 8;
  const roofY = H.y + R.dy;
  return {
    hut: { sprite: H.sprite, x: H.x, y: H.y, w: H.w, h: H.h },
    roof: { id: 'plat_group_hall_roof', x1: H.x + R.l, y1: roofY, x2: H.x + R.r, y2: roofY, pc_perm: -1, item_perm: -1 },
    // The ladder's foot on the middle tier where it stands.
    ladder: { id: 'ladder_group_hall_roof', x: H.x + L.dx, y: floorAt(platforms, H.x + L.dx, floorY), w: L.w, h: L.h },
  };
}

/**
 * The hall's street JSON: the template's layers and ground, the hut on its middle tier, the roof
 * and the ladder, and one signpost back to the lot street.
 * @param {object} template the GCR10M2FUJK177P street JSON
 * @param {string} jobId the hall job (692)
 * @param {{ lotArrive: { x: number, y: number } }} at where the way out lands (the lot street's screen space)
 */
export function groupHallStreet(template, jobId, { lotArrive }) {
  const hall = hallStreetOf(jobId);
  if (!hall) throw new Error(`hall ${jobId} has no street`);
  const layers = clone(template.layers);
  const platforms = clone(template.platforms);
  const mg = layers.find((l) => l.name === 'middleground');
  const p = hutPieces(platforms);
  // The hut stands behind the plants in front of it (they draw after it) and in front of the banks behind.
  const z = 1 + Math.max(...mg.decos.filter((d) => /^mound_dirt|^evenground/.test(d.sprite)).map((d) => d.z));
  mg.decos = [
    ...mg.decos.map((d) => (d.z >= z ? { ...d, z: d.z + 1 } : d)),
    { ...p.hut, id: 'deco_group_hall_hut', z, r: 0 },
  ];
  platforms.push(p.roof);
  const ladders = [{ ...p.ladder, tiling: { ...clone(LADDER_TILING), pattern: [] } }];
  const sign = template.signposts.find((s) => s.id === HALL_LAYOUT.signId);
  if (!sign) throw new Error(`${template.label} has no ${HALL_LAYOUT.signId}`);
  const signposts = [{
    ...clone(sign),
    connects: [{ tsid: `L${hall.lot.slice(1)}`, label: hall.lotName, hub_id: hall.hubId, arrive: { ...lotArrive } }],
  }];
  return {
    source: `reconstruction: Archimedes Acres's Group Hall (LA51318ODPB2UF7, hall job 692; not in tinyspeck/glitch-locations); Fanfoot Flare's geometry and decos (GCR10M2FUJK177P, locations-xml.zip, CC0) with the Community Machine Room exterior and its roof as on Middle Valley Clearing (GLI23FELDHD1O3C), and a wood ladder`,
    reconstructed: true,
    tsid: hall.tsid,
    label: HALL_STREET_TEXT.unnamed,
    hubId: hall.hubId,
    hubName: hall.hubName,
    swf_file: template.swf_file,
    bounds: { ...template.bounds },
    gradient: { ...template.gradient },
    platforms,
    layers,
    signposts,
    doors: [],
    ladders,
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount: countDecos(layers),
      signpostCount: signposts.length,
      doorCount: 0,
      ladderCount: ladders.length,
      barrierCount: 0,
    },
    why: {
      street: 'quest.js 1831-1863: the hall job finished on a street made beforehand (its target_street); none of the ten survives, nor any group template.',
      geometry: "Fanfoot Flare (hub 58, as this hall's): an archived meadow street of the video hall's shape, three grass tiers over earth banks, a long lower path and one signpost on the upper ledge at the left.",
      hut: 'The video hall\'s Community Machine Room hut on the middle tier, its roof walkable (Middle Valley Clearing\'s roof line) and a ladder up its right side; its door is the hut\'s own art (locked in the video).',
      name: "quest.js 1849-1854 named it after the group ('A Private Group' for a private one); here \"<group>'s Group Hall\" (Austin 2026-11-25).",
      entry: 'inc_pols.js pols_canEnter 286-349: members only; the realtime server checks each join against the site\'s signed groups list.',
      wayOut: 'Its one signpost leads back to the lot street, in front of the lot.',
    },
  };
}

export const groupHallIndexEntry = (street) => ({
  label: street.label,
  file: `assets/streets/${street.tsid}.json`,
  hubId: street.hubId,
  hubName: street.hubName,
  platforms: street.platforms.length,
  decos: street.stats.decoCount,
  reconstructed: true,
});
