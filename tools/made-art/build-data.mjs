#!/usr/bin/env node
/**
 * Writes public/restoration/made.json, the data of the Made for Groddle
 * section of /restoration/ (drawn by the site's groddle/restoration-made
 * block, groddle-afternoon-site src/RestorationMade.php): the art made for
 * the remake rather than restored from Tiny Speck, each piece beside the
 * Tiny Speck original it comes from, or what it was made from.
 *
 * Which pieces there are, when they were made, with what tool and under what
 * licence come from the provenance lists: tools/provenance/made-sprites.json
 * (a piece per sprite), repainted-maps.json (map:<hub>, or maps:<hub>,<hub>
 * for a gallery), subway-map-paper.json (subway:paper) and made-decos.json
 * (decos:<group> or decos:<group>:<view>: the made decos named gz_ai_<group>_*,
 * every one of which must be on the page). Every word players read comes from
 * tools/made-art/pieces.json (curated by hand). Image sizes are read from the
 * files, and each made file must still match the hash its provenance records.
 * A piece may show a picture composed from those files (a crop, a render, a
 * side-by-side) instead: its image.file (and original.file) under
 * public/assets/made-art/, recorded with its hash in tools/made-art/showcase.json
 * (tools/made-art/compose.py). Nothing else from the provenance (prompts,
 * hashes, file names) reaches the page.
 *
 *   node tools/made-art/build-data.mjs           write made.json
 *   node tools/made-art/build-data.mjs --check   exit 1 when made.json is stale or breaks the page's rules
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { GAME_DIR } from '../repos.mjs';
import { contentProblems } from '../gaps/build-data.mjs';

export const PROVENANCE = join(GAME_DIR, 'tools/provenance/made-sprites.json');
export const MAPS = join(GAME_DIR, 'tools/provenance/repainted-maps.json');
export const SUBWAY = join(GAME_DIR, 'tools/provenance/subway-map-paper.json');
export const MADE_DECOS = join(GAME_DIR, 'tools/provenance/made-decos.json');
export const SHOWCASE = join(GAME_DIR, 'tools/made-art/showcase.json');
export const CURATED = join(GAME_DIR, 'tools/made-art/pieces.json');
export const OUT = join(GAME_DIR, 'public/restoration/made.json');

/** What each provenance licence means for players. */
const LICENCES = {
  'ai-generated': 'Dedicated to the public domain under CC0 1.0, like the Tiny Speck art it comes from.',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-12" as "12 November 2026". */
export function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) throw new Error(`not a date: ${iso}`);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** A WebP file's width and height, from its header (VP8X, VP8 or VP8L). */
export function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

/** A JPEG file's width and height, from its first SOF marker. */
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG file');
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error('no JPEG frame header');
}
/** An image file's size: WebP or JPEG. */
const imageSize = (buf) => (buf[0] === 0xff && buf[1] === 0xd8 ? jpegSize(buf) : webpSize(buf));

/** The public URL of a file under public/. */
const url = (file) => `/${file.replace(/^public\//, '')}`;

/**
 * One picture: its URL, its size (a sheet's one frame), and the sheet's grid.
 * Throws when the file is missing or a sheet does not divide into its grid.
 */
function picture(file, sheet, read) {
  const size = imageSize(read(file));
  const out = { src: url(file), w: size.w, h: size.h };
  if (sheet) {
    const { cols, rows, frames } = sheet;
    if (size.w % cols || size.h % rows) throw new Error(`${file}: ${size.w}x${size.h} does not divide into ${cols}x${rows}`);
    if (frames > cols * rows) throw new Error(`${file}: ${frames} frames in a ${cols}x${rows} grid`);
    out.w = size.w / cols;
    out.h = size.h / rows;
    out.sheet = { cols, rows, frames, ...(sheet.fps ? { fps: sheet.fps } : {}) };
  }
  return out;
}

/** The latest of some ISO dates. */
const latest = (dates) => dates.slice().sort().at(-1);

/** One licence for a piece made of several provenance rows, or a throw. */
function oneOf(id, values, what) {
  const set = [...new Set(values)];
  if (set.length !== 1) throw new Error(`${id}: its provenance rows differ in ${what} (${set.join(', ')})`);
  return set[0];
}

/**
 * made.json from the provenance and the curated words. `read` reads a file
 * under the game (a Buffer), so tests can hand in their own. `more` holds the
 * other provenance lists: { subway, decos, showcase } (subway-map-paper.json,
 * made-decos.json, tools/made-art/showcase.json).
 */
export function build(provenance, curated, read = (file) => readFileSync(join(GAME_DIR, file)), maps = { regions: {} }, more = {}) {
  const { subway = null, decos = { art: {} }, showcase = { files: {} } } = more;
  // An entry marked experiment (Austin 2026-11-12: the Fire Dragon) stays in the builder, off the page.
  const made = Object.fromEntries(Object.entries(provenance.sprites).filter(([, p]) => p.experiment !== true).map(([id, p]) => [id, { ...p, files: [{ file: p.file, sha256: p.sha256 }] }]));
  const regionCount = Object.keys(maps.regions).length;
  const madeDecos = Object.entries(decos.art || {});
  const shownDecos = new Set();
  for (const c of curated.pieces) {
    // A repainted region map (tools/provenance/repainted-maps.json) is a piece by the id map:<hub id>: its 2x painting;
    // maps:<hub>,<hub> is a gallery of several, shown as a picture composed from them (image.file).
    const hubs = /^maps?:([\d,]+)$/.exec(c.id)?.[1]?.split(',');
    const regions = hubs?.map((h) => maps.regions[h]);
    if (regions?.length && regions.every(Boolean)) {
      made[c.id] = {
        file: `public/${regions[0].x2.file}`,
        files: regions.map((r) => ({ file: `public/${r.x2.file}`, sha256: r.x2.sha256 })),
        licence: oneOf(c.id, regions.map((r) => r.licence), 'licence'),
        tool: oneOf(c.id, regions.map((r) => r.model), 'model'),
        made: latest(regions.map((r) => r.made)),
        regions: regionCount,
        gallery: c.id.startsWith('maps:'),
      };
    }
    // The Subway System map's recreated paper (tools/provenance/subway-map-paper.json).
    if (c.id === 'subway:paper' && subway?.x2) {
      const file = `public/${subway.x2.file}`;
      made[c.id] = { file, files: [{ file, sha256: subway.x2.sha256 }], licence: subway.licence, tool: subway.model, made: subway.made };
    }
    // Made decos for Groddle's own streets (tools/provenance/made-decos.json): decos:<group>[:<view>] is every gz_ai_<group>_ deco.
    const group = /^decos:([a-z0-9]+)(?::[a-z0-9-]+)?$/.exec(c.id)?.[1];
    const rows = group ? madeDecos.filter(([name]) => name.startsWith(`gz_ai_${group}_`)) : [];
    if (rows.length) {
      for (const [name] of rows) shownDecos.add(name);
      made[c.id] = {
        file: rows[0][1].file,
        files: rows.flatMap(([, r]) => [{ file: r.file, sha256: r.sha256 }, ...(r.file3 ? [{ file: r.file3, sha256: r.sha256_3 }] : [])]),
        licence: oneOf(c.id, rows.map(([, r]) => r.licence), 'licence'),
        tool: oneOf(c.id, rows.map(([, r]) => r.model), 'model'),
        made: latest(rows.map(([, r]) => r.made)),
      };
    }
  }
  const byId = new Map(curated.pieces.map((p) => [p.id, p]));
  const problems = [];
  for (const id of Object.keys(made)) if (!byId.has(id)) problems.push(`${id}: in the provenance list but has no words in tools/made-art/pieces.json`);
  for (const id of byId.keys()) if (!made[id]) problems.push(`${id}: has words but is not in the provenance list`);
  for (const [name] of madeDecos) if (!shownDecos.has(name)) problems.push(`${name}: a made deco (made-decos.json) on no piece of tools/made-art/pieces.json`);
  if (problems.length) throw new Error(problems.join('\n'));

  const hash = (file) => createHash('sha256').update(read(file)).digest('hex');
  const usedShowcase = new Set();
  /** A composed picture (public/assets/made-art/) must be the one showcase.json records. */
  const composed = (id, file) => {
    if (!file.startsWith('public/assets/made-art/')) return;
    const row = showcase.files?.[file];
    if (!row) throw new Error(`${id}: ${file} is not recorded in tools/made-art/showcase.json`);
    if (hash(file) !== row.sha256) throw new Error(`${id}: ${file} no longer matches its hash in tools/made-art/showcase.json; run tools/made-art/compose.py`);
    usedShowcase.add(file);
  };
  const pieces = curated.pieces.map((c, order) => {
    const prov = made[c.id];
    for (const f of prov.files) {
      if (hash(f.file) !== f.sha256) throw new Error(`${c.id}: ${f.file} no longer matches its provenance hash; record the new art in its provenance list`);
    }
    const licence = LICENCES[prov.licence];
    if (!licence) throw new Error(`${c.id}: no words for the licence ${prov.licence}`);
    // A gallery or a group of decos has no one file to show: its picture is composed.
    if ((prov.gallery || prov.files.length > 1) && !c.image.file && !c.id.startsWith('map:')) throw new Error(`${c.id}: several made files; show a composed picture (image.file)`);
    const shown = c.image.file || prov.file;
    composed(c.id, shown);
    if (c.original?.file) composed(c.id, c.original.file);
    const image = { ...picture(shown, c.image.sheet, read), label: c.image.label, alt: c.image.alt };
    const original = c.original ? { ...picture(c.original.file, c.original.sheet, read), kind: c.original.kind, alt: c.original.alt, ...(c.original.pixelated ? { pixelated: true } : {}) } : null;
    const overlap = /outline overlaps the original (\d+)%/.exec(prov.source?.cut || '')?.[1];
    const fill = (text) => text.replace(/\{(\w+)\}/g, (all, key) => {
      const value = { tool: prov.tool, overlap: overlap && `${overlap}%`, w: original?.w, h: original?.h, regions: prov.regions }[key];
      if (value === undefined || value === null) throw new Error(`${c.id}: nothing to fill {${key}} with`);
      return String(value);
    });
    if (original) original.label = fill(c.original.label);
    return {
      order,
      piece: {
        id: c.id,
        anchor: `made-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        name: c.name,
        made: prov.made,
        madeLabel: dateLabel(prov.made),
        caption: fill(c.caption),
        display: { w: c.display.w, h: c.display.h },
        image,
        ...(original ? { original } : {}),
        facts: [...c.facts.map((f) => ({ label: f.label, text: fill(f.text) })), { label: 'Licence', text: licence }],
      },
    };
  });
  for (const file of Object.keys(showcase.files || {})) if (!usedShowcase.has(file)) problems.push(`${file}: in tools/made-art/showcase.json but on no piece`);
  if (problems.length) throw new Error(problems.join('\n'));
  // Newest first; the curated order breaks a tie.
  pieces.sort((a, b) => (a.piece.made === b.piece.made ? a.order - b.order : a.piece.made < b.piece.made ? 1 : -1));
  return {
    note: 'Written by tools/made-art/build-data.mjs from the provenance lists in tools/provenance/, tools/made-art/showcase.json and tools/made-art/pieces.json. Edit those, never this file.',
    pieces: pieces.map((p) => p.piece),
  };
}

/** What players read in made.json: every word, no URLs (they are the page's images, not its text). */
export function playerWords(data) {
  return data.pieces.map((p) => [p.name, p.madeLabel, p.caption, p.image.label, p.image.alt, p.original?.label, p.original?.alt, ...p.facts.flatMap((f) => [f.label, f.text])].filter(Boolean));
}

/** The page's rules: no em-dash, no path, no @, no web address, no deny-listed name (tools/gaps), and no hash. */
export function wordProblems(data) {
  const words = playerWords(data);
  const problems = contentProblems(words);
  for (const s of words.flat()) if (/\b[0-9a-f]{12,}\b/i.test(s)) problems.push(`a hash: ${s.slice(0, 90)}`);
  return problems;
}

/** The other provenance lists build() reads, from the checkout. */
export function readMore() {
  const json = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined);
  return { subway: json(SUBWAY) || null, decos: json(MADE_DECOS), showcase: json(SHOWCASE) };
}

const stringify = (data) => `${JSON.stringify(data, null, 2)}\n`;

function main() {
  const check = process.argv.includes('--check');
  const data = build(JSON.parse(readFileSync(PROVENANCE, 'utf8')), JSON.parse(readFileSync(CURATED, 'utf8')), undefined, JSON.parse(readFileSync(MAPS, 'utf8')), readMore());
  const problems = wordProblems(data);
  if (problems.length) {
    console.error(`made: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  if (check) {
    const previous = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
    if (previous !== stringify(data)) {
      console.error(`public/restoration/made.json is ${previous === null ? 'missing' : 'stale'}: run node tools/made-art/build-data.mjs`);
      process.exit(1);
    }
    console.log(`made.json current (${data.pieces.length} pieces)`);
    return;
  }
  writeFileSync(OUT, stringify(data));
  console.log(`wrote public/restoration/made.json: ${data.pieces.map((p) => p.name).join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
