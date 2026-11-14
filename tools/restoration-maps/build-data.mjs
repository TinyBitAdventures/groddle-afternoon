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
 * - Every region: tools/provenance/repainted-maps.json. A region whose method
 *   is "restored" (Tiny Speck's 2012 painting, restored) is shown beside the
 *   painting it replaced (its `replaces` record); any other beside Tiny Speck's
 *   150 x 91 thumbnail it was painted from (public/assets/maps/index.json
 *   thumbLocal), or alone when it had none (painted from its street layout).
 *   Each carries its World map hover card (public/assets/maps/art/world/cards)
 *   and its Encyclopedia place page when one is built.
 *
 * A restored painting is written over the file it replaces, so the replaced
 * painting would only be in git. This keeps it reachable: its x1 and x2 are
 * found in the history of the region's file by the sha256 the `replaces`
 * record holds, and copied to public/restoration/maps/replaced/ under a name
 * carrying that hash (immutable, so a later restore never reuses a URL). Git
 * stores the same bytes once, so the copy adds nothing to the repo's size.
 *
 * Licence (hard rule): only CC0 art ships. Tiny Speck's 2012 Encyclopedia
 * pictures, the restores' input, are named in words only and never shipped;
 * no file under research/ is read or copied. Nothing else from the provenance
 * (prompts, paths, hashes) reaches the page.
 *
 *   node tools/restoration-maps/build-data.mjs           write maps.json and any missing replaced painting
 *   node tools/restoration-maps/build-data.mjs --check   exit 1 when maps.json or a replaced painting is stale or missing
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { GAME_DIR } from '../repos.mjs';
import { contentProblems } from '../gaps/build-data.mjs';
import { dateLabel, jpegSize, webpSize } from '../made-art/build-data.mjs';

export const MAPS = join(GAME_DIR, 'tools/provenance/repainted-maps.json');
export const WORLD = join(GAME_DIR, 'tools/provenance/world-map-2x.json');
export const INDEX = join(GAME_DIR, 'public/assets/maps/index.json');
export const OUT = join(GAME_DIR, 'public/restoration/maps.json');
/** Where the replaced paintings are kept, under public/. */
export const REPLACED_DIR = 'restoration/maps/replaced';

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

/** Where a replaced painting is kept: its own name with the first 8 hex of its sha256 (public/ relative). */
export function replacedFile(file, hash) {
  const name = basename(file).replace(/\.webp$/, '');
  return `${REPLACED_DIR}/${name}.${hash.slice(0, 8)}.webp`;
}

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
export function build(maps, world, index, fs) {
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
    before: pic(c.original.file, c.original.sha256, `world ${key} original`, { label: `Tiny Speck’s chart (${c.original.w} x ${c.original.h})` }),
    after: pic(c.x2.file, c.x2.sha256, `world ${key} 2x`, { label: `Sharpened at 2x (${c.x2.w} x ${c.x2.h}), in the game now` }),
  }));

  const regions = Object.entries(maps.regions).map(([id, r]) => {
    const name = r.hubName;
    const restored = isRestored(r);
    const thumbFile = index.hubs?.[id]?.thumbLocal || '';
    const state = restored ? 'restored' : thumbFile ? 'painted' : 'layout';
    const after = pic(r.x1.file, r.x1.sha256, `${name} painting`, {
      label: restored ? 'Restored, in the game now' : 'Painted for Groddle, in the game now',
      src2: url(r.x2.file),
    });
    need(r.x2.file, r.x2.sha256, `${name} painting at 2x`);
    let before = null;
    if (restored) {
      const was = r.replaces;
      const x1 = replacedFile(was.x1.file, was.x1.sha256);
      const x2 = replacedFile(was.x2.file, was.x2.sha256);
      before = pic(x1, was.x1.sha256, `${name} replaced painting`, {
        label: `Before: painted from the thumbnail${was.made ? ` on ${dateLabel(was.made)}` : ''}`,
        src2: url(x2),
      });
      need(x2, was.x2.sha256, `${name} replaced painting at 2x`);
    } else if (thumbFile) {
      before = pic(thumbFile, null, `${name} thumbnail`, { label: 'Tiny Speck’s thumbnail, all that survived (150 x 91)' });
    }
    const cardFile = `assets/maps/art/world/cards/${id}.svg`;
    const cardBuf = fs.read(cardFile);
    const placeFile = `encyclopedia/places/${slug(name)}/index.html`;
    const facts = [{ label: 'Made', text: `${dateLabel(r.made)}, with ${r.model}` }];
    if (restored && r.replaces.made) facts.push({ label: 'Replaced', text: `The painting made from the thumbnail on ${dateLabel(r.replaces.made)}` });
    return {
      id,
      name,
      anchor: `map-${slug(name)}`,
      state,
      caption: restored
        ? `Tiny Speck’s own 2012 painting of ${name}, restored: the 2012 Encyclopedia showed it under the game’s roads, names and buttons, and that picture was given to an image model to take the markings off and sharpen without moving anything, then toned back to the 2012 colour.`
        : state === 'painted'
          ? `Tiny Speck’s 760 x 460 painting of ${name} is lost; only its thumbnail on the World map survived. This painting was made from that thumbnail and the region’s street layout, in the style of the decos Tiny Speck painted its streets with.`
          : `${name} had no thumbnail on the World map, so its painting was made from its street layout alone, in the style of the decos Tiny Speck painted its streets with.`,
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
  for (const c of data.world?.charts || []) add(c.name, c.caption, c.before.label, c.after.label);
  for (const r of data.regions) {
    add(r.name, r.caption, r.differences, r.before?.label, r.after.label, r.card?.label);
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

/** Where every replaced painting is kept (public/ relative) => its sha256 and the file it was, for each restored region. */
export function replacedFiles(maps) {
  const out = new Map();
  for (const r of Object.values(maps.regions)) {
    if (!isRestored(r)) continue;
    for (const v of ['x1', 'x2']) out.set(replacedFile(r.replaces[v].file, r.replaces[v].sha256), { sha256: r.replaces[v].sha256, file: r.replaces[v].file });
  }
  return out;
}

/** The bytes `public/<file>` had at some commit of HEAD's history with this sha256, or null. */
export function fromHistory(file, hash, git = (args, opts) => execFileSync('git', args, { cwd: GAME_DIR, maxBuffer: 1 << 28, ...opts })) {
  const path = `public/${file}`;
  const commits = String(git(['rev-list', 'HEAD', '--', path], { encoding: 'utf8' })).split('\n').filter(Boolean);
  for (const c of commits) {
    for (const at of [c, `${c}^`]) {
      let buf;
      try {
        buf = git(['show', `${at}:${path}`], { stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        continue;
      }
      if (sha256(buf) === hash) return buf;
    }
  }
  return null;
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

  // The replaced paintings: each must be there with its hash; build fetches a missing one from git.
  const keep = replacedFiles(maps);
  for (const [file, { sha256: hash, file: was }] of keep) {
    const have = checkout.read(file);
    if (have && sha256(have) === hash) continue;
    if (check) {
      problems.push(`public/${file} is ${have ? 'stale' : 'missing'}`);
      continue;
    }
    const buf = fromHistory(was, hash);
    if (!buf) throw new Error(`no commit has public/${was} with sha256 ${hash.slice(0, 12)}...: the replaced painting is lost from this history`);
    mkdirSync(pub(REPLACED_DIR), { recursive: true });
    writeFileSync(pub(file), buf);
    console.log(`kept the replaced painting public/${file} (from git history)`);
  }
  // Nothing left over that no record names.
  const dir = pub(REPLACED_DIR);
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const file = `${REPLACED_DIR}/${name}`;
    if (keep.has(file)) continue;
    if (check) problems.push(`public/${file} is not named by any restored region's replaces record`);
    else {
      unlinkSync(pub(file));
      console.log(`removed public/${file} (no record names it)`);
    }
  }
  if (problems.length) {
    console.error(`maps: ${problems.length} problem(s):\n  ${problems.join('\n  ')}\nrun node tools/restoration-maps/build-data.mjs`);
    process.exit(1);
  }

  const data = build(maps, world, readJson(INDEX), checkout);
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
    console.log(`maps.json current (${data.regions.length} regions, ${data.counts.restored} restored)`);
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
