/**
 * House files (G1285, report #669, Austin 2026-11-25): a whole house described as plain JSON,
 * loaded into a solo practice copy's own house so a player's house can be rebuilt, shared as a
 * link and used to debug Groddle's housing. Pure rules: no Pixi, no DOM, no fetch. The browser
 * side (the play-link param, the fetch, the on-screen report) is js/house-file-loader.js.
 *
 * The link: /play/?autostart=1&fresh=1&housefile=<url-encoded URL or path>
 * - An absolute URL must be this site's own (same origin) and under its media library,
 *   /wp-content/uploads/ (Minn stores uploads as WordPress does, uploads/YYYY/MM/<file>).
 * - A relative path (play/houses/sample-house.json, /wp-content/uploads/...) is resolved against
 *   the page's base (the site root) and must stay on the same origin.
 * - Either way it must end in .json. Anything else is refused with a line on screen.
 * The file is read as data only (JSON.parse, at most HOUSE_FILE_MAX_BYTES), validated here, and
 * never reaches the online game: /play/online/ strips every query param before a module loads
 * (js/game-mode.js), and the loader checks the mode again. A house file always opens a practice
 * copy (js/practice-mode.js), so the player's own solo save is never touched.
 *
 * ---------------------------------------------------------------------------------------------
 * The format (version 1). Every field the game does not know is reported, and left out or set to its default.
 *
 * {
 *   "format": "groddle-house",        required, exactly this
 *   "version": 1,                     required, exactly 1
 *   "title": "...",                   optional, shown in the report
 *   "source": "...",                  optional, where the house came from (a picture, a report)
 *   "segments": 11,                   wall segments per floor, end caps included (home-decor
 *                                     wallSegments, HOME_LIMITS 6..20; 150 px each)
 *   "exterior": { "style": "meadow" } optional: the home street's style (meadow|firebog|uralia)
 *   "yard": { "segments": 5, "items": [ { "class": "proto_patch", "x": -300 } ] }
 *                                     optional: the back yard the ground floor opens onto (G1291):
 *                                     its segments (HOME_LIMITS 5..20, 150 px each) and what is
 *                                     cultivated there, a proto class (inc_cultivation.js, the
 *                                     Cultivate list) or what it grew into ("rock_beryl_2"), x in room
 *                                     px (negative: the yard is left of the house's left end)
 *   "floors": [ ground, second, third ]  1..3 floors (HOME_LIMITS.MAX_FLOORS), ground floor first
 * }
 *
 * A floor:
 * {
 *   "name": "Ground floor",           optional
 *   "wall": "<wall swatch key>",      the paper on every wall segment (homes-catalog walls)
 *   "walls": { "3": "<key>", ... },   optional per-segment paper (0 is the left end cap), or an array
 *   "floor": "<floor swatch key>", "ceiling": "<ceiling swatch key>",
 *   "pieces":   [ piece, ... ],       furniture and trophies (home-decor placed rows)
 *   "items":    [ { "class", "count", "x" } ],   loose stacks on the floor
 *   "machines": [ { "class": "woodworker", "x": 300, "fuel": 50 } ],  home-machines rows
 *   "craftybot": { "x": 1500, "folded": true }  the Crafty Bot, on one floor at most; folded: asleep
 *                                     as a cube (npc_crafty_bot.js craft_state 'sleep', sleepMode)
 * }
 *
 * A piece (positions are room px: 0 is the house's left end, as home-decor keeps x):
 * {
 *   "class": "furniture_sofa",        a FURNITURE_CATALOG class or a trophy class
 *   "style": 359,                     optional upgrade id (furniture-upgrades), plain without
 *   "x": 420,                         the piece's middle
 *   "y": 180,                         wall pieces: px from the walk line up to the piece's bottom
 *   "plat": "chair",                  floor pieces: bookshelf|chair|rug|front (the class's own sets)
 *   "facing": "left",                 left|right (right when left out); only classes that flip
 *   "ref": "mantel",                  a name other pieces on this floor can rest "on"
 *   "on": "mantel",                   tabletop pieces and trophies: the piece they stand on
 *   "door": "up",                     furniture_door only: up|down, the way between floors
 *   "show": { "class": "cherry", "count": 1 },   bag_furniture_sdb: what the box shows
 *   "contents": [ { "class", "count" }, null, ... ],  cabinets: their slots in order
 *   "items": [ { "class": "beer", "count": 1, "x": 900 } ]  stacks resting on its surface;
 *                                     x left out spreads them evenly over the surface
 * }
 *
 * Side tables, pedestals and the like are pieces too: the white pedestal of the 2012 picture is
 * furniture_sidetable style 162 (Shell Side Table, items/catalog_furniture.js).
 *
 * Doors: every floor but the top needs one "up" Door and every floor but the ground one "down"
 * Door; floor N's up Door leads to floor N+1's down Door (home-floors links, each keeping its own
 * x). A missing one is added plain and reported.
 * ---------------------------------------------------------------------------------------------
 */

import { HOME_LIMITS } from './homes-catalog.js?v=0367f90f';
import { cultivationDef, listCultivationClasses } from './home-cultivation.js?v=122d6f45';
import {
  INTERIOR,
  furnitureDef,
  furnitureSize,
  isFurniture,
  normalizeHomeDecorState,
  placeFurniture,
  standingSets,
  surfaceHeight,
  textureConfig,
  wallSlots,
} from './home-decor.js?v=d84c139d';
import { cleanUpgradeId } from './furniture-upgrades.js?v=f563b304';
import { CABINETS, SDB_CLASS, SDB_COUNT_MAX, isCabinetClass, normalizeContents } from './home-storage.js?v=17bf7f79';
import { MACHINE_LABELS } from './machine-rooms.js?v=a99c4d01';
import { stackMaxOf } from './pack-slots.js?v=38e4aea5';

export const HOUSE_FILE_FORMAT = 'groddle-house';
export const HOUSE_FILE_VERSION = 1;
export const HOUSE_FILE_PARAM = 'housefile';
/** The most a house file may weigh (a three-floor house with every box full is under 100 KB). */
export const HOUSE_FILE_MAX_BYTES = 1_000_000;
/** The site's media library (Minn keeps WordPress's wp-content/uploads/YYYY/MM/). */
export const UPLOADS_PATH = '/wp-content/uploads/';
/** The save's dropped-stack key of each house floor (homes-feature HOME_INTERIOR_TSID, HOUSE_FLOOR_DROP_PREFIX). */
export const HOUSE_FLOOR_KEYS = Object.freeze(['RH_HOME_INT', 'RH_HOME_FLOOR_1', 'RH_HOME_FLOOR_2']);
export const HOUSE_STYLES = Object.freeze(['meadow', 'firebog', 'uralia']);
/** A fresh machine's tank (machine_base onCreate max_fuel / 4). */
const FRESH_FUEL = 50;
const MAX_FUEL = 200;
const MAX_PIECES = 2000;
const MAX_ITEMS = 2000;

const TOP_KEYS = new Set(['format', 'version', 'title', 'source', 'segments', 'exterior', 'yard', 'floors', 'notes']);
const FLOOR_KEYS = new Set(['name', 'wall', 'walls', 'floor', 'ceiling', 'pieces', 'items', 'machines', 'craftybot', 'notes']);
const PIECE_KEYS = new Set(['class', 'style', 'x', 'y', 'plat', 'facing', 'ref', 'on', 'door', 'show', 'contents', 'items', 'note']);

export const HOUSE_FILE_TEXT = Object.freeze({
  refusedOrigin: 'That house file is not on this site. Only house files from this site can be loaded.',
  refusedPath: "That house file can't be loaded: links must point into this site's media library.",
  refusedType: "That house file can't be loaded: it must be a .json file.",
  refusedBad: "That house file link doesn't look right.",
  tooBig: 'That house file is too big to load.',
  notJson: "That house file isn't readable JSON.",
  online: 'House files only open in solo play.',
});

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const cleanClass = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,64}$/.test(v) ? v : '');

/**
 * Where a housefile param points: { ok, url } (an absolute same-origin URL) or { ok: false, reason, msg }.
 * `baseUri` is the page's base (play/index.html: the site root), `origin` the page's origin.
 */
export function resolveHouseFileUrl(value, { baseUri, origin } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048) return { ok: false, reason: 'bad', msg: HOUSE_FILE_TEXT.refusedBad };
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('\\');
  let url;
  try {
    url = new URL(raw, baseUri);
  } catch {
    return { ok: false, reason: 'bad', msg: HOUSE_FILE_TEXT.refusedBad };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'origin', msg: HOUSE_FILE_TEXT.refusedOrigin };
  if (url.origin !== origin || url.username || url.password) return { ok: false, reason: 'origin', msg: HOUSE_FILE_TEXT.refusedOrigin };
  if (absolute && !url.pathname.startsWith(UPLOADS_PATH)) return { ok: false, reason: 'path', msg: HOUSE_FILE_TEXT.refusedPath };
  if (!/\.json$/i.test(url.pathname)) return { ok: false, reason: 'type', msg: HOUSE_FILE_TEXT.refusedType };
  url.hash = '';
  return { ok: true, url: url.href };
}

/** Parse a house file's text: { ok, raw } or { ok: false, msg }. Data only (JSON.parse), capped. */
export function parseHouseFileText(text) {
  const s = String(text ?? '');
  // UTF-8 bytes: at least the code units, at most three times them.
  const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(s).length : s.length;
  if (bytes > HOUSE_FILE_MAX_BYTES) return { ok: false, reason: 'size', msg: HOUSE_FILE_TEXT.tooBig };
  try {
    return { ok: true, raw: JSON.parse(s) };
  } catch {
    return { ok: false, reason: 'json', msg: HOUSE_FILE_TEXT.notJson };
  }
}

/** Every item class a file names (boxes, cabinets, shelves, the floor), for the loader's art check. */
export function houseFileItemClasses(raw) {
  const out = new Set();
  const add = (c) => {
    const k = cleanClass(c);
    if (k) out.add(k);
  };
  for (const floor of Array.isArray(raw?.floors) ? raw.floors : []) {
    for (const it of Array.isArray(floor?.items) ? floor.items : []) add(it?.class);
    for (const p of Array.isArray(floor?.pieces) ? floor.pieces : []) {
      add(p?.show?.class);
      for (const s of Array.isArray(p?.contents) ? p.contents : []) add(s?.class);
      for (const it of Array.isArray(p?.items) ? p.items : []) add(it?.class);
    }
  }
  return [...out];
}

function stackList(list, where, isItem, problems) {
  const out = [];
  for (const [i, it] of (Array.isArray(list) ? list : []).entries()) {
    const at = `${where}[${i}]`;
    const cls = cleanClass(it?.class);
    if (!cls) {
      problems.push({ level: 'error', where: at, msg: 'An item needs a "class".' });
      continue;
    }
    if (!isItem(cls)) {
      problems.push({ level: 'error', where: at, msg: `Unknown item class "${cls}": left out.` });
      continue;
    }
    const count = it.count == null ? 1 : Math.floor(Number(it.count));
    if (!Number.isFinite(count) || count < 1) {
      problems.push({ level: 'warn', where: at, msg: `"${cls}" has no count: one is used.` });
    }
    out.push({ classTsid: cls, count: Number.isFinite(count) && count >= 1 ? Math.min(count, SDB_COUNT_MAX) : 1, ...(finite(it.x) ? { x: Math.round(it.x) } : {}) });
  }
  return out;
}

function textureKey(kind, key, where, problems) {
  if (key == null) return null;
  if (typeof key === 'string' && textureConfig(kind, key)) return key;
  problems.push({ level: 'warn', where, msg: `Unknown ${kind} swatch "${String(key)}": the default is used.` });
  return null;
}

function unknownKeys(obj, allowed, where, problems) {
  for (const k of Object.keys(obj)) if (!allowed.has(k)) problems.push({ level: 'warn', where, msg: `"${k}" is not part of the house file format: ignored.` });
}

/**
 * Check a parsed house file against the format. Returns { ok, problems, house }: `ok` false only
 * when nothing can be built (not a house file, no floors); every other problem leaves the piece or
 * field out (level 'error') or uses a default (level 'warn'), and is listed. `isItem(classTsid)`
 * says whether an item class exists (the loader checks the art; tests the icon folder).
 */
export function validateHouseFile(raw, { isItem = () => true } = {}) {
  const problems = [];
  const fail = (msg) => ({ ok: false, problems: [...problems, { level: 'error', where: 'file', msg }], house: null });
  if (!isObj(raw)) return fail('A house file is a JSON object.');
  if (raw.format !== HOUSE_FILE_FORMAT) return fail(`"format" must be "${HOUSE_FILE_FORMAT}".`);
  if (raw.version !== HOUSE_FILE_VERSION) return fail(`"version" must be ${HOUSE_FILE_VERSION}.`);
  unknownKeys(raw, TOP_KEYS, 'file', problems);
  let segments = HOME_LIMITS.START_WALL_SEGMENTS;
  if (raw.segments != null) {
    const n = Math.floor(Number(raw.segments));
    if (!Number.isFinite(n)) problems.push({ level: 'warn', where: 'segments', msg: `"segments" is not a number: ${segments} is used.` });
    else {
      segments = Math.max(HOME_LIMITS.MIN_WALL_SEGMENTS, Math.min(HOME_LIMITS.MAX_WALL_SEGMENTS, n));
      if (segments !== n) problems.push({ level: 'warn', where: 'segments', msg: `A house has ${HOME_LIMITS.MIN_WALL_SEGMENTS} to ${HOME_LIMITS.MAX_WALL_SEGMENTS} wall segments: ${segments} is used.` });
    }
  }
  let style = null;
  if (raw.exterior != null) {
    if (isObj(raw.exterior) && HOUSE_STYLES.includes(raw.exterior.style)) style = raw.exterior.style;
    else problems.push({ level: 'warn', where: 'exterior', msg: `Unknown exterior style: one of ${HOUSE_STYLES.join(', ')}.` });
  }
  if (!Array.isArray(raw.floors) || !raw.floors.length) return fail('"floors" must list at least the ground floor.');
  if (raw.floors.length > HOME_LIMITS.MAX_FLOORS) {
    problems.push({ level: 'warn', where: 'floors', msg: `A house has at most ${HOME_LIMITS.MAX_FLOORS} floors: the rest are left out.` });
  }
  const slots = wallSlots({ layout: 'house', wallSegments: segments });
  let pieceTotal = 0;
  let itemTotal = 0;
  let botFloor = -1;
  const floors = raw.floors.slice(0, HOME_LIMITS.MAX_FLOORS).map((f, fi) => {
    const fw = `floors[${fi}]`;
    const floor = { name: typeof f?.name === 'string' ? f.name.slice(0, 80) : '', wall: null, walls: null, floor: null, ceiling: null, pieces: [], items: [], machines: [], craftybot: null };
    if (!isObj(f)) {
      problems.push({ level: 'error', where: fw, msg: 'A floor is an object: it is left bare.' });
      return floor;
    }
    unknownKeys(f, FLOOR_KEYS, fw, problems);
    floor.wall = textureKey('wall', f.wall, `${fw}.wall`, problems);
    floor.floor = textureKey('floor', f.floor, `${fw}.floor`, problems);
    floor.ceiling = textureKey('ceiling', f.ceiling, `${fw}.ceiling`, problems);
    if (f.walls != null) {
      const entries = Array.isArray(f.walls) ? f.walls.map((k, i) => [i, k]) : isObj(f.walls) ? Object.entries(f.walls) : null;
      if (!entries) problems.push({ level: 'warn', where: `${fw}.walls`, msg: '"walls" is an object of segment: swatch (or an array).' });
      else {
        const walls = {};
        for (const [k, key] of entries) {
          const i = Number(k);
          if (key == null) continue;
          if (!Number.isInteger(i) || i < 0 || i >= slots) {
            problems.push({ level: 'warn', where: `${fw}.walls`, msg: `Segment ${k} is outside the ${slots} wall segments: ignored.` });
            continue;
          }
          const t = textureKey('wall', key, `${fw}.walls.${k}`, problems);
          if (t) walls[i] = t;
        }
        if (Object.keys(walls).length) floor.walls = walls;
      }
    }
    const refs = new Set();
    for (const [pi, p] of (Array.isArray(f.pieces) ? f.pieces : []).entries()) {
      const at = `${fw}.pieces[${pi}]`;
      if (!isObj(p)) {
        problems.push({ level: 'error', where: at, msg: 'A piece is an object: left out.' });
        continue;
      }
      unknownKeys(p, PIECE_KEYS, at, problems);
      const cls = cleanClass(p.class);
      if (!cls || !isFurniture(cls)) {
        problems.push({ level: 'error', where: at, msg: `Unknown furniture class "${String(p.class ?? '')}": left out.` });
        continue;
      }
      if (!finite(p.x)) {
        problems.push({ level: 'error', where: at, msg: `${cls} has no "x": left out.` });
        continue;
      }
      if (++pieceTotal > MAX_PIECES) {
        problems.push({ level: 'error', where: at, msg: `More than ${MAX_PIECES} pieces: the rest are left out.` });
        break;
      }
      const def = furnitureDef(cls);
      const piece = { classTsid: cls, x: Math.round(p.x), facingRight: true };
      if (p.style != null && p.style !== '' && p.style !== 0) {
        const id = cleanUpgradeId(cls, p.style);
        if (id) piece.upgradeId = id;
        else problems.push({ level: 'warn', where: at, msg: `${cls} has no style ${String(p.style)} with art: placed plain.` });
      }
      if (p.y != null) {
        if (def.slot === 'wall' && finite(p.y)) piece.y = Math.round(p.y);
        else problems.push({ level: 'warn', where: at, msg: `"y" is only for wall pieces (a height above the floor): ignored.` });
      }
      if (p.plat != null) {
        if (standingSets(cls).includes(p.plat)) piece.plat = p.plat;
        else problems.push({ level: 'warn', where: at, msg: `${cls} can't stand on "${String(p.plat)}" (it takes ${standingSets(cls).join(', ') || 'none'}).` });
      }
      if (p.facing != null) {
        if (p.facing === 'left' || p.facing === 'right') {
          if (p.facing === 'left' && !def.canFlip) problems.push({ level: 'warn', where: at, msg: `${cls} only faces one way: facing ignored.` });
          else piece.facingRight = p.facing === 'right';
        } else problems.push({ level: 'warn', where: at, msg: '"facing" is left or right.' });
      }
      if (p.ref != null) {
        const ref = String(p.ref).slice(0, 64);
        if (refs.has(ref)) problems.push({ level: 'warn', where: at, msg: `"ref" ${ref} is used twice on this floor: the first is kept.` });
        else {
          refs.add(ref);
          piece.ref = ref;
        }
      }
      if (p.on != null) {
        if (def.tabletop) piece.on = String(p.on).slice(0, 64);
        else problems.push({ level: 'warn', where: at, msg: `${cls} doesn't stand on other pieces: "on" ignored.` });
      }
      if (p.door != null) {
        if (cls === 'furniture_door' && (p.door === 'up' || p.door === 'down')) piece.door = p.door;
        else problems.push({ level: 'warn', where: at, msg: '"door" is up or down, on a furniture_door.' });
      }
      if (p.show != null) {
        if (cls !== SDB_CLASS) problems.push({ level: 'warn', where: at, msg: '"show" is only for Storage Display Boxes: ignored.' });
        else {
          const [one] = stackList([p.show], `${at}.show`, isItem, problems);
          if (one) piece.show = { classTsid: one.classTsid, count: one.count };
        }
      }
      if (p.contents != null) {
        if (!isCabinetClass(cls) || !Array.isArray(p.contents)) problems.push({ level: 'warn', where: at, msg: '"contents" is a list of slots, for cabinets: ignored.' });
        else {
          const cap = CABINETS[cls].cols * CABINETS[cls].rows;
          if (p.contents.length > cap) problems.push({ level: 'warn', where: at, msg: `${cls} holds ${cap} slots: the rest are left out.` });
          const slotsIn = p.contents.slice(0, cap);
          const kept = stackList(slotsIn.filter(Boolean), `${at}.contents`, isItem, problems);
          // Keep the slot order: empty slots stay empty.
          let k = 0;
          piece.contents = slotsIn.map((s) => {
            if (!s) return null;
            const row = kept[k];
            if (row && row.classTsid === cleanClass(s.class)) {
              k += 1;
              return { classTsid: row.classTsid, count: row.count };
            }
            return null;
          });
        }
      }
      if (p.items != null) {
        const list = stackList(p.items, `${at}.items`, isItem, problems);
        itemTotal += list.length;
        if (list.length) piece.items = list;
      }
      floor.pieces.push(piece);
    }
    for (const piece of floor.pieces) {
      if (piece.on && !refs.has(piece.on)) {
        problems.push({ level: 'warn', where: fw, msg: `${piece.classTsid} stands "on" ${piece.on}, which no piece on this floor is: it stands on the floor.` });
        delete piece.on;
      }
    }
    floor.items = stackList(f.items, `${fw}.items`, isItem, problems).filter((it) => {
      if (finite(it.x)) return true;
      problems.push({ level: 'error', where: `${fw}.items`, msg: `${it.classTsid} on the floor has no "x": left out.` });
      return false;
    });
    itemTotal += floor.items.length;
    for (const [mi, m] of (Array.isArray(f.machines) ? f.machines : []).entries()) {
      const at = `${fw}.machines[${mi}]`;
      const cls = cleanClass(m?.class);
      if (!cls || !MACHINE_LABELS[cls]) {
        problems.push({ level: 'error', where: at, msg: `Unknown machine "${String(m?.class ?? '')}" (${Object.keys(MACHINE_LABELS).join(', ')}): left out.` });
        continue;
      }
      if (!finite(m.x)) {
        problems.push({ level: 'error', where: at, msg: `${cls} has no "x": left out.` });
        continue;
      }
      const fuel = m.fuel == null ? FRESH_FUEL : Math.max(0, Math.min(MAX_FUEL, Math.round(Number(m.fuel) || 0)));
      floor.machines.push({ classTsid: cls, x: Math.round(m.x), fuel });
    }
    if (f.craftybot != null) {
      if (!isObj(f.craftybot) || !finite(f.craftybot.x)) problems.push({ level: 'error', where: `${fw}.craftybot`, msg: 'The Crafty Bot needs an "x": left out.' });
      else if (botFloor >= 0) problems.push({ level: 'error', where: `${fw}.craftybot`, msg: `There is one Crafty Bot, already on floor ${botFloor}: left out.` });
      else {
        botFloor = fi;
        floor.craftybot = { x: Math.round(f.craftybot.x) };
        if (f.craftybot.folded === true) floor.craftybot.folded = true;
        else if (f.craftybot.folded != null && f.craftybot.folded !== false) problems.push({ level: 'warn', where: `${fw}.craftybot`, msg: '"folded" is true or false: it stands.' });
      }
    }
    return floor;
  });
  if (itemTotal > MAX_ITEMS) problems.push({ level: 'warn', where: 'file', msg: `More than ${MAX_ITEMS} stacks of items: some may be slow to draw.` });
  // The ways between floors.
  floors.forEach((floor, fi) => {
    for (const dir of ['up', 'down']) {
      const need = dir === 'up' ? fi < floors.length - 1 : fi > 0;
      const doors = floor.pieces.filter((p) => p.door === dir);
      if (!need && doors.length) {
        problems.push({ level: 'warn', where: `floors[${fi}]`, msg: `A ${dir} Door here leads nowhere: it stands as a plain Door.` });
        for (const d of doors) delete d.door;
      } else if (need && doors.length > 1) {
        problems.push({ level: 'warn', where: `floors[${fi}]`, msg: `More than one ${dir} Door: the first is the way ${dir}.` });
        for (const d of doors.slice(1)) delete d.door;
      } else if (need && !doors.length) {
        problems.push({ level: 'warn', where: `floors[${fi}]`, msg: `No ${dir} Door: a plain one is added.` });
        floor.pieces.push({ classTsid: 'furniture_door', x: 300, facingRight: true, door: dir, added: true });
      }
    }
  });
  const yard = raw.yard == null ? null : backYard(raw.yard, problems);
  const house = {
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : '',
    source: typeof raw.source === 'string' ? raw.source.slice(0, 200) : '',
    segments,
    style,
    floors,
    ...(yard ? { yard } : {}),
  };
  return { ok: true, problems, house };
}

/** The cultivation a yard entry names: its proto class, or the proto of what it grew into. */
function cultivationOf(cls) {
  if (cultivationDef(cls)) return { protoClass: cls, endClass: null };
  const def = listCultivationClasses().find((d) => d.endItems.includes(cls) && d.kind !== 'tower');
  return def ? { protoClass: def.protoClass, endClass: cls } : null;
}

/** G1291: the back yard's segments and cultivations ({ yardLeft, items: [{ protoClass, endClass, rx }] }), or null. */
function backYard(raw, problems) {
  if (!isObj(raw)) {
    problems.push({ level: 'warn', where: 'yard', msg: '"yard" is an object with "segments" and "items": ignored.' });
    return null;
  }
  unknownKeys(raw, new Set(['segments', 'items', 'notes']), 'yard', problems);
  const lo = HOME_LIMITS.START_BACKYARD_SEGMENTS;
  const hi = HOME_LIMITS.MAX_BACKYARD_SEGMENTS;
  let segments = lo;
  if (raw.segments != null) {
    const n = Math.floor(Number(raw.segments));
    segments = Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
    if (segments !== n) problems.push({ level: 'warn', where: 'yard.segments', msg: `A back yard has ${lo} to ${hi} segments: ${segments} is used.` });
  }
  const minX = -segments * 150 + 60;
  const items = [];
  for (const [i, it] of (Array.isArray(raw.items) ? raw.items : []).entries()) {
    const at = `yard.items[${i}]`;
    const cls = cleanClass(it?.class);
    const found = cls ? cultivationOf(cls) : null;
    if (!found) {
      problems.push({ level: 'error', where: at, msg: `Unknown yard cultivation "${it?.class}": left out.` });
      continue;
    }
    if (!finite(it.x)) {
      problems.push({ level: 'error', where: at, msg: `${cls} has no "x": left out.` });
      continue;
    }
    const rx = Math.round(Math.max(minX, Math.min(0, it.x)));
    if (rx !== Math.round(it.x)) problems.push({ level: 'warn', where: at, msg: `${cls} at x ${it.x} moved to ${rx} to stay in the yard.` });
    items.push({ ...found, rx });
  }
  return { yardLeft: segments - lo, items };
}

/** A machine id the home-machines slice takes (hm-<16 hex>), one per machine in the file. */
function machineId(n) {
  return `hm-${(0x4f05e0000000 + n).toString(16).padStart(16, '0')}`;
}

/**
 * Turn a validated house into the save's own shapes:
 * - decors: one home-decor state a floor (ground first), every piece placed by the game's own
 *   placement (placeFurniture: plats, wall heights and the walls' ends clamp as in Decorate);
 * - floors: the home-floors state (upper floors, their Door links, the ground floor shown);
 * - machines: home-machines solo rows (place house / house:1 / house:2, rx room x);
 * - craftybot: { floor, x } (room x) or null;
 * - stacks: { floor, key, classTsid, count, x (room x), y, on } to set down (shelves, tables, floor);
 * - counts: placed pieces per floor and class; problems: anything placing changed.
 */
export function buildHouse(house) {
  const problems = [];
  const counts = [];
  const stacks = [];
  const machines = [];
  let craftybot = null;
  const decors = house.floors.map((f, fi) => {
    const slots = wallSlots({ layout: 'house', wallSegments: house.segments });
    const state = normalizeHomeDecorState({ layout: 'house', starterKit: true, wallSegments: house.segments });
    if (f.wall) state.wall = f.wall;
    state.walls = Array(slots).fill(state.wall);
    for (const [i, key] of Object.entries(f.walls || {})) state.walls[Number(i)] = key;
    if (f.floor) state.floor = f.floor;
    if (f.ceiling) state.ceiling = f.ceiling;
    const byRef = new Map();
    const place = (p) => {
      state.storage[p.classTsid] = (state.storage[p.classTsid] || 0) + 1;
      const opts = { facingRight: p.facingRight !== false, from: 'storage' };
      if (p.upgradeId) {
        state.styles ||= {};
        state.styles[p.classTsid] = [...(state.styles[p.classTsid] || []), { upgradeId: p.upgradeId }];
        opts.style = state.styles[p.classTsid].length - 1;
      }
      const def = furnitureDef(p.classTsid);
      const at = { x: p.x };
      if (def.slot === 'wall' && p.y != null) at.y = INTERIOR.floorY - p.y;
      if (p.plat) at.plat = p.plat;
      const res = placeFurniture(state, {}, p.classTsid, at, opts);
      if (!res.ok) {
        problems.push({ level: 'error', where: `floors[${fi}]`, msg: `${p.classTsid} could not be placed: ${res.msg || res.reason}` });
        return null;
      }
      const item = res.item;
      if (Math.abs(item.x - p.x) > 2) {
        problems.push({ level: 'warn', where: `floors[${fi}]`, msg: `${p.classTsid} at x ${p.x} moved to ${item.x} to stay inside the walls.` });
      }
      if (def.slot === 'wall' && p.y != null && Math.abs(INTERIOR.floorY - item.y - p.y) > 4) {
        problems.push({ level: 'warn', where: `floors[${fi}]`, msg: `${p.classTsid} at height ${p.y} moved to ${INTERIOR.floorY - item.y} to stay on the wall.` });
      }
      if (p.ref) byRef.set(p.ref, item);
      if (p.show) item.display = { classTsid: p.show.classTsid, count: p.show.count };
      if (p.contents) {
        item.contents = normalizeContents(p.classTsid, p.contents, (c) => stackMaxOf(c));
        if (!item.contents.some(Boolean)) delete item.contents;
      }
      return item;
    };
    const placed = [];
    // Hosts first, so what stands on them draws in front.
    for (const p of f.pieces.filter((x) => !x.on)) placed.push([p, place(p)]);
    for (const p of f.pieces.filter((x) => x.on)) {
      const item = place(p);
      const host = byRef.get(p.on);
      const h = host ? surfaceHeight(host.classTsid, host.upgradeId) : 0;
      if (item && host && h) {
        item.on = host.id;
        item.y = host.y - h;
        delete item.plat;
      } else if (item && host) {
        problems.push({ level: 'warn', where: `floors[${fi}]`, msg: `${p.on} has nothing to stand ${p.classTsid} on: it stands on the floor.` });
      }
      placed.push([p, item]);
    }
    for (const [p, item] of placed) {
      if (!item || !p.items?.length) continue;
      const h = surfaceHeight(item.classTsid, item.upgradeId);
      if (!h) {
        problems.push({ level: 'warn', where: `floors[${fi}]`, msg: `${p.classTsid} has no surface to hold items: they go on the floor under it.` });
      }
      const half = Math.max(4, furnitureSize(item.classTsid, item.upgradeId).w / 2 - 6);
      p.items.forEach((it, i) => {
        const x = it.x ?? Math.round(item.x - half + ((i + 0.5) * 2 * half) / p.items.length);
        stacks.push({ floor: fi, key: HOUSE_FLOOR_KEYS[fi], classTsid: it.classTsid, count: it.count, x: h ? Math.round(Math.max(item.x - half, Math.min(item.x + half, x))) : x, y: h ? item.y - h : INTERIOR.floorY, on: h ? item.id : null });
      });
    }
    for (const it of f.items) stacks.push({ floor: fi, key: HOUSE_FLOOR_KEYS[fi], classTsid: it.classTsid, count: it.count, x: it.x, y: INTERIOR.floorY, on: null });
    for (const m of f.machines) {
      machines.push({ id: machineId(machines.length + 1), classTsid: m.classTsid, owner: '', ownerName: '', place: fi ? `house:${fi}` : 'house', rx: m.x, fuel: m.fuel, music: true, job: null, contents: {} });
    }
    if (f.craftybot) craftybot = { floor: fi, x: f.craftybot.x, ...(f.craftybot.folded ? { folded: true } : {}) };
    const c = {};
    for (const row of state.placed) c[row.classTsid] = (c[row.classTsid] || 0) + 1;
    counts.push(c);
    state.placed.forEach((row) => {
      row.door = placed.find(([, item]) => item === row)?.[0]?.door;
      if (!row.door) delete row.door;
    });
    return state;
  });
  // The Doors between floors: floor N's up Door leads to floor N+1's down Door.
  const links = [];
  for (let fi = 0; fi < decors.length - 1; fi += 1) {
    const up = decors[fi].placed.find((row) => row.door === 'up');
    const down = decors[fi + 1].placed.find((row) => row.door === 'down');
    if (up && down) links.push({ floor: fi, up: up.id, down: down.id, upX: up.x, downX: down.x });
  }
  for (const d of decors) for (const row of d.placed) delete row.door;
  const floors = { upper: decors.slice(1), links, pending: null, at: 0 };
  // G1291: the back yard as the homes slice keeps it (home-cultivation createBackYardState).
  const backYard = house.yard ? {
    yard: 'back',
    yardLeft: house.yard.yardLeft,
    items: house.yard.items.map((it, i) => ({ id: i + 1, protoClass: it.protoClass, ...(it.endClass ? { endClass: it.endClass } : {}), rx: it.rx, placedAt: 0 })),
  } : null;
  return { decors, floors, machines, craftybot, backYard, stacks, counts, problems, style: house.style, title: house.title };
}

/** Pieces a built house holds, per floor and in all. */
export function houseCounts(built) {
  const perFloor = built.counts.map((c) => Object.values(c).reduce((a, b) => a + b, 0));
  return { perFloor, pieces: perFloor.reduce((a, b) => a + b, 0), stacks: built.stacks.length, machines: built.machines.length, craftybot: Boolean(built.craftybot) };
}

/** Plain words for the report's first line. */
export function houseSummary(built) {
  const n = houseCounts(built);
  const floors = built.decors.length;
  const bits = [`${n.pieces} pieces on ${floors} floor${floors === 1 ? '' : 's'}`];
  if (n.stacks) bits.push(`${n.stacks} stacks of things`);
  if (n.machines) bits.push(`${n.machines} machine${n.machines === 1 ? '' : 's'}`);
  if (n.craftybot) bits.push('a Crafty Bot');
  return bits.join(', ');
}

