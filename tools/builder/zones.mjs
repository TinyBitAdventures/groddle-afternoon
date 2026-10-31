/**
 * LEVEL BUILDER publishing (docs/level-builder/spec.md 11, phase P6): published zones as a second
 * source beside Tiny Speck's. A published zone is one file, public/assets/zones/<id>.json (the
 * zone document without editor state), and everything the game reads about it is derived from that
 * file by the functions here:
 *
 *   assets/streets/<GZ tsid>.json       each street, stats recomputed
 *   assets/streets/index.json           a row per street (label, file, hub, counts, zone)
 *   assets/content/street-ecology.json  a row per street with a population
 *   assets/maps/hubs/hub-<id>.json      a new hub's map, and its row in assets/maps/index.json
 *                                       (marked `zone`, so the hub picker leaves it out)
 *   shipped streets named by edits[]    the arms into the zone, `arrive` worked out again
 *   tools/provenance/new-art.json       the gz_ art's provenance, and js/deco-new-list.js
 *
 * Tiny Speck's generators keep these when they run again: build-street-names.mjs merges the index
 * rows, build-street-ecology.mjs the population rows, and build-street-navigation.mjs (which drops
 * the `arrive` of an arm it has no source for) puts the edits back last. build-hub-maps.mjs adds
 * nothing: zones stay out of hub-maps-data.js, so off the world map and out of Completist badges
 * (spec 15, Q5). tools/builder/build-zones.mjs runs every step (--check), apply-zone-edits.mjs and
 * build-zone-maps.mjs one each.
 *
 * Every function works through a small file interface (`files(root)`, or an overlay for a dry run),
 * with paths relative to the game checkout, so tests publish into a temporary folder.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { streetStats, editsOn } from '../../public/js/builder/zone.js?v=6a3db28e';
import { arriveFor } from '../../public/js/builder/geometry-handles.js?v=a291ae18';
import { isZoneTsid, withoutZoneConnects } from '../../public/js/zone-streets.js?v=b40010d5';

export const ZONES_DIR = 'public/assets/zones';
export const STREETS_DIR = 'public/assets/streets';
export const INDEX = 'public/assets/streets/index.json';
export const ECOLOGY = 'public/assets/content/street-ecology.json';
export const MAP_INDEX = 'public/assets/maps/index.json';
export const HUB_MAPS_DIR = 'public/assets/maps/hubs';
export const DECO_DIR = 'public/assets/decos/groddle';
export const NEW_ART = 'tools/provenance/new-art.json';
export const NEW_DECO_LIST = 'public/js/deco-new-list.js';
export const MAP_W = 760;
export const MAP_H = 460;

const ZONE_FILE = /^[a-z][a-z0-9-]{2,47}\.json$/;
const ZONE_STREET_FILE = /^[GL]Z[A-Z0-9]{13}\.json$/;
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const clone = (v) => JSON.parse(JSON.stringify(v));

// —— Files ——

/** The checkout's files, by path relative to `root`. */
export function files(root) {
  const abs = (p) => join(root, p);
  return {
    root,
    exists: (p) => existsSync(abs(p)),
    read: (p) => readFileSync(abs(p)),
    text: (p) => readFileSync(abs(p), 'utf8'),
    list: (dir) => (existsSync(abs(dir)) ? readdirSync(abs(dir)).sort() : []),
    write(p, data) {
      mkdirSync(dirname(abs(p)), { recursive: true });
      writeFileSync(abs(p), data);
    },
    remove: (p) => rmSync(abs(p), { force: true }),
  };
}

/**
 * Files seen through pending writes (a dry run, or a publish before it touches the disk): reads
 * see what was written, lists include new files and leave out removed ones. `changes` maps each
 * path to its new bytes, or null for a removal.
 */
export function overlay(base) {
  const changes = new Map();
  const has = (p) => changes.has(p);
  return {
    root: base.root,
    changes,
    exists: (p) => (has(p) ? changes.get(p) !== null : base.exists(p)),
    read(p) {
      if (has(p)) {
        if (changes.get(p) === null) throw Object.assign(new Error(`${p} was removed`), { code: 'ENOENT' });
        return Buffer.from(changes.get(p));
      }
      return base.read(p);
    },
    text(p) {
      return this.read(p).toString('utf8');
    },
    list(dir) {
      const names = new Set(base.list(dir));
      const prefix = `${dir}/`;
      for (const [p, v] of changes) {
        if (!p.startsWith(prefix) || p.slice(prefix.length).includes('/')) continue;
        if (v === null) names.delete(p.slice(prefix.length));
        else names.add(p.slice(prefix.length));
      }
      return [...names].sort();
    },
    write: (p, data) => changes.set(p, Buffer.isBuffer(data) ? data : Buffer.from(String(data))),
    remove: (p) => changes.set(p, null),
  };
}

/** Write the bytes only when they differ; answers whether the file changed. */
function put(fs, p, text, out) {
  const now = fs.exists(p) ? fs.read(p) : null;
  const next = Buffer.isBuffer(text) ? text : Buffer.from(text);
  if (now && now.equals(next)) return false;
  out.push(p);
  fs.write(p, next);
  return true;
}

const readJson = (fs, p) => JSON.parse(fs.text(p));

// —— The published zones ——

/** Every published zone: [{ file, zone }] in id order. */
export function listZones(fs) {
  return fs.list(ZONES_DIR).filter((f) => ZONE_FILE.test(f)).map((f) => ({ file: `${ZONES_DIR}/${f}`, zone: readJson(fs, `${ZONES_DIR}/${f}`) }));
}

/**
 * PURE: the zone as published: the zone document without the editor's state (streets[].editor),
 * each street's stats recomputed. Everything else (provenance, waivers, edits, the hub and its
 * map) is kept, so the file still passes zone.schema.json and the validator.
 */
export function publishedZone(zone) {
  const z = clone(zone);
  for (const row of z.streets || []) {
    delete row.editor;
    if (row.street) row.street.stats = streetStats(row.street);
  }
  return z;
}

/** PURE: the zone file's text (one space, as the CLI writes zone files). */
export const zoneText = (zone) => `${JSON.stringify(zone, null, 1)}\n`;

/** PURE: a zone street as the game loads it (assets/streets/<tsid>.json), one line like the rest. */
export function streetText(street) {
  return `${JSON.stringify({ ...street, stats: streetStats(street) })}\n`;
}

/** PURE: the street index row of a zone street. */
export function indexRow(zone, street) {
  return {
    label: street.label,
    file: `assets/streets/${street.tsid}.json`,
    hubId: String(street.hubId ?? zone.hub?.id ?? ''),
    hubName: String(street.hubName ?? zone.hub?.name ?? ''),
    platforms: (street.platforms || []).length,
    decos: (street.layers || []).reduce((n, l) => n + (l.decos || []).length, 0),
    zone: zone.id,
  };
}

/** PURE: the zones' streets as tsid -> { zone, key, street, population }. */
export function zoneStreets(zones) {
  const out = new Map();
  for (const zone of zones) {
    for (const row of zone.streets || []) {
      const tsid = row.street?.tsid;
      if (!tsid) continue;
      if (out.has(tsid)) throw new Error(`${tsid} is in two zones (${out.get(tsid).zone.id} and ${zone.id}).`);
      out.set(tsid, { zone, key: row.key, street: row.street, population: row.population || null });
    }
  }
  return out;
}

/**
 * PURE: the street index with the zones' rows as they should be: rows of zones no longer
 * published dropped, every zone street's row set. The input is changed and returned.
 */
export function mergeZoneIndex(index, zones) {
  const streets = index.streets || (index.streets = {});
  for (const [tsid, row] of Object.entries(streets)) if (isZoneTsid(tsid) || row?.zone) delete streets[tsid];
  for (const [tsid, z] of zoneStreets(zones)) streets[tsid] = indexRow(z.zone, z.street);
  return index;
}

/** PURE: a zone street's ecology row (the play-test's, js/builder/draft-play.js), or null. */
export function ecologyRow(street, population) {
  if (!population || typeof population !== 'object') return null;
  return { label: street.label || street.tsid, ...clone(population) };
}

/**
 * PURE: the ecology catalog with the zones' population rows: rows of zones no longer published
 * dropped, each zone street with a population set, as the play-test merges them. `streetCount`
 * stays the count of Tiny Speck's streets; `zoneStreetCount` says how many came from zones.
 */
export function mergeZoneEcology(eco, zones) {
  const streets = eco.streets || (eco.streets = {});
  for (const tsid of Object.keys(streets)) if (isZoneTsid(tsid)) delete streets[tsid];
  let n = 0;
  for (const [tsid, z] of zoneStreets(zones)) {
    const row = ecologyRow(z.street, z.population);
    if (!row) continue;
    streets[tsid] = row;
    n += 1;
  }
  if (n) eco.zoneStreetCount = n;
  else delete eco.zoneStreetCount;
  eco.streetCount = Object.keys(streets).length - n;
  return eco;
}

// —— Hub maps (build-zone-maps.mjs) ——

/** PURE: a new hub's map file, shaped as Tiny Speck's (assets/maps/hubs/hub-<id>.json), or null. */
export function hubMapFile(zone) {
  const hub = zone.hub;
  if (!hub?.isNew || !hub.map) return null;
  const m = hub.map;
  return {
    hubId: String(hub.id),
    hubName: hub.name,
    bg: '',
    fg: '',
    color: m.color || '',
    btm_color: m.btm_color || '',
    top_color: m.top_color || '',
    mote_id: '',
    mapW: MAP_W,
    mapH: MAP_H,
    streets: (m.streets || []).map((s) => ({ tsid: s.tsid, name: s.name, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
    hubs: (m.hubs || []).map((h) => ({ tsid: h.tsid, hub_id: String(h.hub_id), hubName: h.hubName || '', label: h.label, x: h.x, y: h.y, arrow: h.arrow ?? 0 })),
    bgLocal: '',
    fgLocal: '',
    zone: zone.id,
  };
}

/** PURE: a new hub's row in assets/maps/index.json. `zone` keeps it off the hub picker. */
export function hubMapRow(zone, map) {
  return {
    hubId: map.hubId,
    hubName: map.hubName,
    file: `assets/maps/hubs/hub-${map.hubId}.json`,
    streetCount: map.streets.length,
    hubExitCount: map.hubs.length,
    bg: '',
    fg: '',
    mote_id: '',
    bgLocal: '',
    fgLocal: '',
    hasArt: false,
    zone: zone.id,
  };
}

/** The zones' hub maps: their files written, their index rows set, those of unpublished zones gone. */
export function buildZoneMaps(fs, zones, out = []) {
  const index = readJson(fs, MAP_INDEX);
  const want = new Map();
  for (const zone of zones) {
    const map = hubMapFile(zone);
    if (!map) continue;
    const prior = index.hubs?.[map.hubId];
    if (prior && !prior.zone) throw new Error(`Zone ${zone.id}: hub ${map.hubId} is one of Tiny Speck's.`);
    if (want.has(map.hubId)) throw new Error(`Zones ${want.get(map.hubId).zone} and ${zone.id} both make hub ${map.hubId}.`);
    want.set(map.hubId, map);
  }
  for (const [id, row] of Object.entries(index.hubs || {})) {
    if (!row?.zone || want.has(id)) continue;
    delete index.hubs[id];
    const p = `public/${row.file}`;
    if (fs.exists(p)) {
      fs.remove(p);
      out.push(p);
    }
  }
  for (const [id, map] of want) {
    index.hubs[id] = hubMapRow({ id: map.zone }, map);
    put(fs, `${HUB_MAPS_DIR}/hub-${id}.json`, `${JSON.stringify(map, null, 2)}\n`, out);
  }
  put(fs, MAP_INDEX, `${JSON.stringify(index, null, 2)}\n`, out);
  return out;
}

// —— Ways in: the zones' edits on shipped streets (apply-zone-edits.mjs) ——

/**
 * PURE: a shipped street with the zones' edits on it, as publishing leaves it: every arm into a
 * zone (and a post that only held such arms) taken off first, so running it again changes nothing,
 * then each edit put on in order (js/builder/zone.js streetWithEdits), each arm's `arrive` worked
 * out again where the zone street's post leading back stands (build-street-navigation.mjs's rule,
 * geometry-handles.js arriveFor), else kept.
 */
export function streetWithZoneEdits(shipped, edits, streets) {
  const s = clone(shipped);
  if (Array.isArray(s.signposts)) s.signposts = withoutZoneConnects(s.signposts);
  for (const e of edits) {
    const arms = e.op === 'add-connect' ? [e.connect] : e.op === 'add-signpost' ? (e.newSignpost?.connects || []) : [];
    const fixed = arms.map((c) => {
      const into = streets.get(c?.tsid)?.street;
      const arrive = into ? arriveFor(into, s.tsid) : null;
      return arrive ? { ...c, arrive } : c;
    });
    if (e.op === 'add-connect') {
      const post = (s.signposts || []).find((p) => p.id === e.signpost);
      if (!post) throw new Error(`${s.tsid}: no signpost ${e.signpost} for the zone's arm to ${e.connect?.label}.`);
      (post.connects ||= []).push(fixed[0]);
    } else if (e.op === 'add-signpost') {
      (s.signposts ||= []).push({ ...clone(e.newSignpost), connects: fixed });
    }
  }
  return s;
}

/** The shipped streets the edits name, plus any that still carry an arm into a zone. */
function editedStreets(fs, zones) {
  const named = new Set();
  for (const zone of zones) for (const e of zone.edits || []) if (e?.tsid) named.add(e.tsid);
  const files = fs.list(STREETS_DIR).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f) && !ZONE_STREET_FILE.test(f));
  const byTsid = new Map();
  for (const f of files) {
    const tsid = f.slice(0, -5);
    const alias = `${tsid[0] === 'G' ? 'L' : 'G'}${tsid.slice(1)}`;
    if (named.has(tsid) || named.has(alias)) {
      byTsid.set(tsid, f);
      continue;
    }
    // An arm into a zone names a GZ tsid; a quick look at the text finds the streets that have one.
    if (/"tsid":"[GL]Z[A-Z0-9]{13}"/.test(fs.text(`${STREETS_DIR}/${f}`))) byTsid.set(tsid, f);
  }
  for (const t of named) {
    const alias = `${t[0] === 'G' ? 'L' : 'G'}${t.slice(1)}`;
    if (!byTsid.has(t) && !byTsid.has(alias)) throw new Error(`An edit names ${t}, which is not a street file here.`);
  }
  return byTsid;
}

/** Put the zones' edits on the shipped streets (and take stale ones off). Answers the paths changed. */
export function applyZoneEdits(fs, zones, out = []) {
  const streets = zoneStreets(zones);
  const all = zones.flatMap((z) => z.edits || []);
  for (const [tsid, f] of editedStreets(fs, zones)) {
    const p = `${STREETS_DIR}/${f}`;
    const text = fs.text(p);
    const next = streetWithZoneEdits(JSON.parse(text), editsOn(all, tsid), streets);
    put(fs, p, `${JSON.stringify(next)}\n`, out);
  }
  return out;
}

// —— New art ——

/**
 * The zones' new art (origin `new` rows that a street uses): name -> provenance row for
 * tools/provenance/new-art.json, with the file's place and bytes. A file that is missing or whose
 * sha256 is not the row's is an error: the provenance must describe the bytes that ship.
 */
export function newArt(fs, zones) {
  const art = {};
  for (const zone of zones) {
    const used = new Set();
    for (const row of zone.streets || []) for (const l of row.street?.layers || []) for (const d of l.decos || []) used.add(d.sprite);
    for (const [name, a] of Object.entries(zone.assets || {})) {
      if (a?.origin !== 'new' || !used.has(name)) continue;
      if (art[name] && art[name].sha256 !== a.sha256) throw new Error(`${name}: zones ${art[name].zones.join(', ')} and ${zone.id} hold different pictures under one name.`);
      const file = `${DECO_DIR}/${name}.webp`;
      if (!fs.exists(file)) throw new Error(`${name}: ${file} is missing.`);
      const bytes = fs.read(file);
      if (sha256(bytes) !== a.sha256) throw new Error(`${name}: ${file} is not the picture its provenance names (sha256 differs).`);
      const three = `${DECO_DIR}/${name}@1.5x.webp`;
      const row = art[name] || {
        file,
        sha256: a.sha256,
        bytes: bytes.length,
        ...(fs.exists(three) ? { file3: three, sha256_3: sha256(fs.read(three)) } : {}),
        licence: a.licence,
        author: a.author,
        ...(a.tool ? { tool: a.tool } : {}),
        ...(a.prompt ? { prompt: a.prompt } : {}),
        inputs: a.inputs || [],
        ...(a.intake ? { intake: a.intake } : {}),
        ...(a.w ? { w: a.w, h: a.h } : {}),
        zones: [],
      };
      row.zones.push(zone.id);
      art[name] = row;
    }
  }
  return Object.fromEntries(Object.entries(art).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** PURE: tools/provenance/new-art.json's text. */
export function newArtText(art) {
  return `${JSON.stringify({
    format: 'groddle-new-art/1',
    about: 'New art published zones ship (docs/level-builder/spec.md 10, 11): own work or AI-generated, each dedicated CC0 1.0, with who or what made it and from what inputs. Written by tools/builder/build-zones.mjs from public/assets/zones/*.json; tests/g316-provenance.test.js allows exactly these files.',
    count: Object.keys(art).length,
    art,
  }, null, 1)}\n`;
}

/** PURE: js/deco-new-list.js's text. */
export function newDecoListText(art) {
  const names = Object.keys(art);
  const hires = names.filter((n) => art[n].file3);
  return `/**
 * New art a published zone ships (docs/level-builder/spec.md 10, 11): gz_ decos, own work or
 * AI-generated, dedicated CC0 1.0, each with its provenance in tools/provenance/new-art.json.
 * Their files sit beside the library's (assets/decos/groddle/<name>.webp, and <name>@1.5x.webp
 * when the art came with a 3x file), but they are kept out of assets/decos/manifest.json and
 * js/deco-hires-list.js, which the deco pipeline builds from Tiny Speck's SWFs.
 * Generated by tools/builder/build-zones.mjs from public/assets/zones/*.json; do not edit by hand.
 */
export const NEW_DECOS = new Set(${JSON.stringify(names)});
export const NEW_DECOS_HIRES = new Set(${JSON.stringify(hires)});
`;
}

// —— Every step ——

/**
 * Bring everything derived from the published zones up to date (or, through an overlay, see what
 * would change). Answers { zones, changed: [paths] }.
 */
export function buildZones(fs) {
  const zones = listZones(fs).map((z) => z.zone);
  const changed = [];
  const streets = zoneStreets(zones);
  // 1. The zones' street files, and none left over from a zone no longer published.
  for (const f of fs.list(STREETS_DIR).filter((n) => ZONE_STREET_FILE.test(n))) {
    if (!streets.has(f.slice(0, -5))) {
      fs.remove(`${STREETS_DIR}/${f}`);
      changed.push(`${STREETS_DIR}/${f}`);
    }
  }
  for (const [tsid, z] of streets) put(fs, `${STREETS_DIR}/${tsid}.json`, streetText(z.street), changed);
  // 2. Index rows; 3. ecology rows.
  const indexText = fs.text(INDEX);
  put(fs, INDEX, `${JSON.stringify(mergeZoneIndex(JSON.parse(indexText), zones), null, 2)}\n`, changed);
  put(fs, ECOLOGY, `${JSON.stringify(mergeZoneEcology(readJson(fs, ECOLOGY), zones), null, 2)}\n`, changed);
  // 4. Hub maps; 5. the ways in.
  buildZoneMaps(fs, zones, changed);
  applyZoneEdits(fs, zones, changed);
  // 6. New art: provenance and the renderer's list.
  const art = newArt(fs, zones);
  const hadArt = fs.exists(NEW_ART);
  if (Object.keys(art).length || hadArt) put(fs, NEW_ART, newArtText(art), changed);
  put(fs, NEW_DECO_LIST, newDecoListText(art), changed);
  for (const f of fs.list(DECO_DIR).filter((n) => /^gz_/.test(n))) {
    const name = f.replace(/(@1\.5x)?\.webp$/, '');
    if (!art[name]) {
      fs.remove(`${DECO_DIR}/${f}`);
      changed.push(`${DECO_DIR}/${f}`);
    }
  }
  return { zones, changed: [...new Set(changed)] };
}

/** Write an overlay's pending changes to the files under it. */
export function commitOverlay(ov, base) {
  for (const [p, data] of ov.changes) {
    if (data === null) base.remove(p);
    else base.write(p, data);
  }
}

/**
 * A zone tool's command line: run `step(fs, zones)` through an overlay over the checkout; with
 * --check report what it would change and exit 1 if anything, else write it.
 */
export function zoneToolMain(name, step, { root, argv = process.argv.slice(2) } = {}) {
  const base = files(root);
  const ov = overlay(base);
  const zones = listZones(base).map((z) => z.zone);
  step(ov, zones);
  const changed = [...ov.changes.keys()].filter((p) => {
    const v = ov.changes.get(p);
    return v === null ? base.exists(p) : !(base.exists(p) && base.read(p).equals(v));
  });
  const what = `${zones.length} published zone${zones.length === 1 ? '' : 's'}`;
  if (argv.includes('--check')) {
    if (changed.length) {
      console.error(`${name}: stale (${what}): ${changed.slice(0, 10).join(', ')}${changed.length > 10 ? ` and ${changed.length - 10} more` : ''}\nrun node tools/builder/${name}`);
      return 1;
    }
    console.log(`${name}: current (${what})`);
    return 0;
  }
  commitOverlay(ov, base);
  console.log(`${name}: ${what}; ${changed.length ? `wrote ${changed.join(', ')}` : 'nothing to change'}`);
  return 0;
}
