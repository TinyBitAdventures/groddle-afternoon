#!/usr/bin/env node
/**
 * Writes public/restoration/maps.json, the data of the Maps page
 * (/restoration/maps/, drawn by the site's groddle/restoration-maps block,
 * groddle-afternoon-site src/RestorationMaps.php; Austin 2026-11-14: "a few
 * dedicated page like Restoration -> Maps ... keep all of the flip/preview
 * features and fill it up all of the maps").
 *
 * Everything comes from the provenance records, so a region painted or
 * restored later shows up with no page edit:
 * - The World map: tools/provenance/world-map-2x.json, Tiny Speck's two CC0
 *   charts beside their sharpened 2x copies.
 * - Every region: tools/provenance/repainted-maps.json, the painting in the
 *   game now, beside Tiny Speck's own 2012 Encyclopedia map of the region
 *   (tools/provenance/encyclopedia-maps.json), or, for a region with none, the
 *   150 x 91 thumbnail it was painted from (public/assets/maps/index.json
 *   thumbLocal), or alone. Each carries its World map hover card
 *   (public/assets/maps/art/world/cards) and its Encyclopedia place page when
 *   one is built.
 * - The page opens each pair in Wipe (VIEW; Austin 2026-11-14: "I want the
 *   'wipe' option to be the default").
 *
 * The 2012 maps (Austin 2026-11-14, lane mapsbefore: "For the before images, I
 * want to use the originals we have from screenshots, not our before AI
 * generations"): Tiny Speck's Encyclopedia drew each region's 760 x 460
 * painting with the game's roads and names on it (c1.glitch.bz
 * img/maps_encyclopedia, saved from the Wayback Machine). They ship as Tiny
 * Speck's own originals, and only from the list: each entry names its local
 * copy under research/ and that copy's sha256, and this re-encodes it as WebP
 * at its own pixels and size (ENCODE) to the shipped path, recording the
 * shipped file's sha256. --check then needs only the shipped files, never
 * research/. Nothing else from research/ is read or copied (no snaps, no
 * videos), and nothing else from the provenance (prompts, paths, hashes)
 * reaches the page. The paintings a restore replaced are no longer shown or
 * shipped (their `replaces` records stay in repainted-maps.json, and the
 * files stay in git history).
 *
 *   node tools/restoration-maps/build-data.mjs           write maps.json and any missing 2012 map (from research/)
 *   node tools/restoration-maps/build-data.mjs --check   exit 1 when maps.json or a 2012 map is stale, missing or unlisted
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { GAME_DIR } from '../repos.mjs';
import { contentProblems } from '../gaps/build-data.mjs';
import { dateLabel, jpegSize, webpSize } from '../made-art/build-data.mjs';

export const MAPS = join(GAME_DIR, 'tools/provenance/repainted-maps.json');
export const WORLD = join(GAME_DIR, 'tools/provenance/world-map-2x.json');
export const INDEX = join(GAME_DIR, 'public/assets/maps/index.json');
export const ENCYCLOPEDIA = join(GAME_DIR, 'tools/provenance/encyclopedia-maps.json');
export const OUT = join(GAME_DIR, 'public/restoration/maps.json');
/** The page's own pictures, under public/: only the 2012 maps, in 2012/. */
export const MAPS_DIR = 'restoration/maps';
export const DIR_2012 = 'restoration/maps/2012';
/** Where a list entry's `local` (research/...) is found: the folder holding research/ beside the game. */
export const AUDIT_DIR = process.env.GRODDLE_AUDIT_DIR || join(GAME_DIR, '..');
/** How a 2012 map is re-encoded: its own pixels and size, WebP quality 90, no metadata. */
export const ENCODE = ['-quiet', '-q', '90', '-m', '6', '-metadata', 'none'];
/** The compare mode each pair opens in (the site's src/RestorationMaps.php draws it, restoration/maps.js keeps it). */
export const VIEW = 'wipe';

/** The states a region can be in, in the order the page lists them, with each one's tone (restoration.css tokens). */
export const STATES = {
  restored: { label: 'Restored from 2012', tone: 'moss' },
  painted: { label: 'Painted from the thumbnail', tone: 'sky' },
  layout: { label: 'Painted from the street layout', tone: 'plum' },
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const imageSize = (buf) => (buf[0] === 0xff && buf[1] === 0xd8 ? jpegSize(buf) : webpSize(buf));
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** A file under public/ as the site serves it. */
const url = (file) => `/${file.replace(/^public\//, '')}`;
/** Whether a region's method says it was restored (repainted-maps.json "method": "restored: ..."). */
export const isRestored = (r) => /^restored\b/.test(r.method || '') && !!r.replaces;
/** A Wayback capture stamp (20131119141452) as a date (2013-11-19). */
const stampDate = (ts) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;

/** An SVG's width and height attributes. */
function svgSize(text) {
  const w = /<svg\b[^>]*\swidth="([\d.]+)"/.exec(text);
  const h = /<svg\b[^>]*\sheight="([\d.]+)"/.exec(text);
  if (!w || !h) throw new Error('an SVG without width and height');
  return { w: Math.round(Number(w[1])), h: Math.round(Number(h[1])) };
}

/**
 * The page's data. `fs` reads the checkout: { read(publicFile) -> Buffer|null, exists(publicFile) }.
 * Throws when a file the provenance names is missing or no longer matches its hash.
 */
export function build(maps, world, index, fs, encyclopedia = { regions: {} }) {
  const need = (file, hash, what) => {
    const buf = fs.read(file);
    if (!buf) throw new Error(`${what}: public/${file} is missing`);
    if (hash && sha256(buf) !== hash) throw new Error(`${what}: public/${file} no longer matches the sha256 its provenance records`);
    return buf;
  };
  const pic = (file, hash, what, extra = {}) => ({ src: url(file), ...imageSize(need(file, hash, what)), ...extra });

  // The World map's two charts: Tiny Speck's 760 x 460 original beside the 2x copy sharpened from it.
  const charts = Object.entries(world?.charts || {}).map(([key, c]) => ({
    anchor: `world-${key}`,
    name: key === 'unlocked' ? 'The painted chart' : key === 'locked' ? 'The sketched chart' : key,
    caption: key === 'unlocked'
      ? 'The painted chart the World view shows round every region you may open.'
      : key === 'locked' ? 'The sketched chart under everything, where regions you have not opened sit.' : '',
    before: pic(c.original.file, c.original.sha256, `world ${key} original`, { label: 'Tiny Speck’s chart', alt: `Tiny Speck’s chart, ${c.original.w} x ${c.original.h}` }),
    after: pic(c.x2.file, c.x2.sha256, `world ${key} 2x`, { label: 'Now, at 2x', alt: `The chart sharpened at 2x, ${c.x2.w} x ${c.x2.h}, in the game now` }),
  }));

  const regions = Object.entries(maps.regions).map(([id, r]) => {
    const name = r.hubName;
    const restored = isRestored(r);
    const thumbFile = index.hubs?.[id]?.thumbLocal || '';
    const state = restored ? 'restored' : thumbFile ? 'painted' : 'layout';
    const after = pic(r.x1.file, r.x1.sha256, `${name} painting`, {
      label: 'Now',
      alt: `${name} ${restored ? 'restored' : 'painted for Groddle'}, as the game draws it now`,
      src2: url(r.x2.file),
    });
    need(r.x2.file, r.x2.sha256, `${name} painting at 2x`);
    // Before: Tiny Speck's own 2012 map when the list has one, else the thumbnail, else nothing.
    const old = encyclopedia.regions?.[id] || null;
    let before = null;
    if (old) {
      before = pic(old.shipped.file, old.shipped.sha256, `${name} 2012 map`, {
        label: '2012',
        alt: `Tiny Speck’s 2012 Encyclopedia map of ${name}, with the game’s roads and names on it`,
      });
    } else if (thumbFile) {
      before = pic(thumbFile, null, `${name} thumbnail`, { label: 'Thumbnail', alt: `Tiny Speck’s 150 x 91 thumbnail of ${name}, all that survived` });
    }
    const cardFile = `assets/maps/art/world/cards/${id}.svg`;
    const cardBuf = fs.read(cardFile);
    const placeFile = `encyclopedia/places/${slug(name)}/index.html`;
    const facts = [{ label: 'Made', text: `${dateLabel(r.made)}, with ${r.model}` }];
    if (restored && r.replaces.made) facts.push({ label: 'Replaced', text: `The painting made from the thumbnail on ${dateLabel(r.replaces.made)}` });
    if (old) facts.push({ label: '2012', text: `Tiny Speck’s Encyclopedia map, as the Internet Archive saved it on ${dateLabel(stampDate(old.wayback))}` });
    const lost = `No 2012 Encyclopedia map of ${name} survives, so it is shown beside ${thumbFile ? 'that thumbnail' : 'nothing'}.`;
    return {
      id,
      name,
      anchor: `map-${slug(name)}`,
      state,
      caption: restored
        ? `Tiny Speck’s own painting of ${name}, restored from its 2012 Encyclopedia map: the painting with the game’s roads, names and buttons on it. An image model took those markings off and sharpened it without moving anything, then it was toned back to the 2012 colour.`
        : state === 'painted'
          ? old
            ? `Tiny Speck’s painting of ${name} survives only in the 2012 Encyclopedia map, under the game’s roads and names. The painting in the game now was made from the World map’s 150 x 91 thumbnail and the region’s street layout, in the style of the decos Tiny Speck painted its streets with, so the two differ.`
            : `Tiny Speck’s 760 x 460 painting of ${name} is lost; only its thumbnail on the World map survived. This painting was made from that thumbnail and the region’s street layout, in the style of the decos Tiny Speck painted its streets with. ${lost}`
          : old
            ? `${name} had no thumbnail on the World map, so the painting in the game now was made from its street layout alone, in the style of the decos Tiny Speck painted its streets with. The 2012 Encyclopedia map shows Tiny Speck’s own painting, under the game’s roads and names.`
            : `${name} had no thumbnail on the World map, so its painting was made from its street layout alone, in the style of the decos Tiny Speck painted its streets with. ${lost}`,
      differences: restored ? r.differences || '' : '',
      facts,
      before,
      after,
      card: cardBuf ? { src: url(cardFile), ...svgSize(cardBuf.toString('utf8')), label: 'Its card on the World map' } : null,
      place: fs.exists(placeFile) ? `/encyclopedia/places/${slug(name)}/` : null,
    };
  });
  const order = Object.keys(STATES);
  regions.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(order.map((s) => [s, regions.filter((r) => r.state === s).length]));

  return {
    note: 'Built by tools/restoration-maps/build-data.mjs from the provenance records; do not edit.',
    view: VIEW,
    states: STATES,
    counts: { regions: regions.length, ...counts },
    world: world ? { made: dateLabel(world.made), model: world.model, charts } : null,
    regions,
  };
}

/** Every string players read (labels, captions, facts), for the page's rules. */
export function playerWords(data) {
  const out = [];
  const add = (...s) => out.push(...s.filter((x) => typeof x === 'string' && x !== ''));
  for (const s of Object.values(data.states)) add(s.label);
  for (const c of data.world?.charts || []) add(c.name, c.caption, c.before.label, c.before.alt, c.after.label, c.after.alt);
  for (const r of data.regions) {
    add(r.name, r.caption, r.differences, r.before?.label, r.before?.alt, r.after.label, r.after.alt, r.card?.label);
    for (const f of r.facts) add(f.label, f.text);
  }
  return out;
}

/** What breaks the page's rules: an em-dash, a path, an @, a web address, a hash, a name on the deny list. */
export function wordProblems(data) {
  const words = playerWords(data);
  const problems = contentProblems(words);
  for (const s of words) if (/\b[0-9a-f]{12,}\b/i.test(s)) problems.push(`a hash: ${s.slice(0, 90)}`);
  return problems;
}

/** The shipped 2012 maps (public/ relative) => their list entry and hub id. */
export function files2012(encyclopedia) {
  const out = new Map();
  for (const [id, e] of Object.entries(encyclopedia.regions)) out.set(e.shipped.file, { ...e, id });
  return out;
}

/** What is wrong with the list itself: an entry that is not a c1.glitch.bz 2012 map, or is shipped anywhere but 2012/. */
export function listProblems(encyclopedia, maps) {
  const problems = [];
  for (const [id, e] of Object.entries(encyclopedia.regions)) {
    const say = (why) => problems.push(`${id} ${e.region}: ${why}`);
    if (!maps.regions[id]) say('no such region in repainted-maps.json');
    else if (maps.regions[id].hubName !== e.region) say(`the region is ${maps.regions[id].hubName}`);
    if (!/^http:\/\/c1\.glitch\.bz\/img\/maps_encyclopedia\/[a-z_]+_\d+\.jpg$/.test(e.source)) say(`not a 2012 Encyclopedia map: ${e.source}`);
    if (!/^research\/(wayback\/raw\/c1-img\/maps_encyclopedia|coverage\/hunt-maps-2026-11-04\/encyclopedia-760)\/[a-z_]+_\d+\.jpg$/.test(e.local) || !e.local.endsWith(e.source.split('/').pop())) say(`not its saved copy: ${e.local}`);
    if (!/^[0-9a-f]{64}$/.test(e.sha256 || '')) say('no sha256 of the saved copy');
    if (!/^\d{14}$/.test(e.wayback || '')) say('no Wayback capture stamp');
    if (!new RegExp(`^${DIR_2012}/[a-z]+\\.webp$`).test(e.shipped?.file || '')) say(`shipped outside ${DIR_2012}: ${e.shipped?.file}`);
  }
  return problems;
}

/** A 2012 map re-encoded from its saved copy, checked against the sha256 the list records for it. */
export function encode2012(entry, auditDir = AUDIT_DIR) {
  const src = join(auditDir, entry.local);
  if (!existsSync(src)) throw new Error(`${entry.region}: its saved copy ${entry.local} is not beside the game (set GRODDLE_AUDIT_DIR)`);
  if (sha256(readFileSync(src)) !== entry.sha256) throw new Error(`${entry.region}: ${entry.local} no longer matches the sha256 the list records`);
  const dir = mkdtempSync(join(tmpdir(), 'maps2012-'));
  try {
    const out = join(dir, 'out.webp');
    execFileSync('cwebp', [...ENCODE, src, '-o', out], { stdio: ['ignore', 'ignore', 'inherit'] });
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every file under public/<dir>, public/ relative. */
function listFiles(dir) {
  const root = pub(dir);
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(join(GAME_DIR, 'public'), p));
    }
  };
  walk(root);
  return out;
}

const stringify = (data) => `${JSON.stringify(data, null, 2)}\n`;
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const pub = (file) => join(GAME_DIR, 'public', file);
const checkout = { read: (file) => (existsSync(pub(file)) ? readFileSync(pub(file)) : null), exists: (file) => existsSync(pub(file)) };

function main() {
  const check = process.argv.includes('--check');
  const maps = readJson(MAPS);
  const world = existsSync(WORLD) ? readJson(WORLD) : null;
  const problems = [];

  // The 2012 maps: each listed one must be there with the sha256 the list records; build encodes a missing one.
  const encyclopedia = readJson(ENCYCLOPEDIA);
  problems.push(...listProblems(encyclopedia, maps));
  const keep = files2012(encyclopedia);
  let listed = false;
  for (const [file, e] of keep) {
    const have = checkout.read(file);
    if (have && e.shipped.sha256 && sha256(have) === e.shipped.sha256) continue;
    if (check) {
      problems.push(`public/${file} is ${have ? 'stale' : 'missing'}`);
      continue;
    }
    const buf = encode2012(e);
    mkdirSync(dirname(pub(file)), { recursive: true });
    writeFileSync(pub(file), buf);
    Object.assign(encyclopedia.regions[e.id].shipped, { sha256: sha256(buf), bytes: buf.length, ...webpSize(buf) });
    listed = true;
    console.log(`encoded public/${file} from ${e.local} (${buf.length} bytes)`);
  }
  if (listed) writeFileSync(ENCYCLOPEDIA, stringify(encyclopedia));
  // Nothing else under restoration/maps/: no file the list does not name (the replaced paintings left 2026-11-14).
  for (const file of listFiles(MAPS_DIR)) {
    if (keep.has(file)) continue;
    if (check) problems.push(`public/${file} is not named by tools/provenance/encyclopedia-maps.json`);
    else {
      unlinkSync(pub(file));
      console.log(`removed public/${file} (the list does not name it)`);
    }
  }
  if (problems.length) {
    console.error(`maps: ${problems.length} problem(s):\n  ${problems.join('\n  ')}\nrun node tools/restoration-maps/build-data.mjs`);
    process.exit(1);
  }

  const data = build(maps, world, readJson(INDEX), checkout, encyclopedia);
  const rules = wordProblems(data);
  if (rules.length) {
    console.error(`maps: ${rules.length} problem(s) in the words:\n  ${rules.join('\n  ')}`);
    process.exit(1);
  }
  if (check) {
    const previous = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
    if (previous !== stringify(data)) {
      console.error(`public/restoration/maps.json is ${previous === null ? 'missing' : 'stale'}: run node tools/restoration-maps/build-data.mjs`);
      process.exit(1);
    }
    console.log(`maps.json current (${data.regions.length} regions, ${data.counts.restored} restored, ${keep.size} 2012 maps)`);
    return;
  }
  writeFileSync(OUT, stringify(data));
  console.log(`wrote public/restoration/maps.json: ${data.regions.length} regions (${Object.entries(data.counts).filter(([k]) => k !== 'regions').map(([k, n]) => `${n} ${k}`).join(', ')}), ${data.world?.charts.length || 0} World map charts`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
