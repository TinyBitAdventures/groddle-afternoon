#!/usr/bin/env node
/**
 * Writes public/restoration/made.json, the data of the Made for Groddle
 * section of /restoration/ (drawn by the site's groddle/restoration-made
 * block, groddle-afternoon-site src/RestorationMade.php): the art made for
 * the remake rather than restored from Tiny Speck, each piece beside the
 * Tiny Speck original it comes from, or what it was made from.
 *
 * Which pieces there are, when they were made, with what tool and under what
 * licence come from the provenance list, tools/provenance/made-sprites.json;
 * every word players read comes from tools/made-art/pieces.json (curated by
 * hand, one entry per provenance entry). Image sizes are read from the files,
 * and each made file must still match the hash its provenance records.
 * Nothing else from the provenance (prompts, hashes, file names) reaches the
 * page.
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

/**
 * made.json from the provenance and the curated words. `read` reads a file
 * under the game (a Buffer), so tests can hand in their own.
 */
export function build(provenance, curated, read = (file) => readFileSync(join(GAME_DIR, file)), maps = { regions: {} }) {
  // An entry marked experiment (Austin 2026-11-12: the Fire Dragon) stays in the builder, off the page.
  const made = Object.fromEntries(Object.entries(provenance.sprites).filter(([, p]) => p.experiment !== true));
  // A repainted region map (tools/provenance/repainted-maps.json) is a piece by the id map:<hub id>: its 2x painting.
  for (const c of curated.pieces) {
    const hub = /^map:(\d+)$/.exec(c.id)?.[1];
    const region = hub && maps.regions[hub];
    if (region) made[c.id] = { file: `public/${region.x2.file}`, sha256: region.x2.sha256, licence: region.licence, tool: region.model, made: region.made, regions: Object.keys(maps.regions).length };
  }
  const byId = new Map(curated.pieces.map((p) => [p.id, p]));
  const problems = [];
  for (const id of Object.keys(made)) if (!byId.has(id)) problems.push(`${id}: in the provenance list but has no words in tools/made-art/pieces.json`);
  for (const id of byId.keys()) if (!made[id]) problems.push(`${id}: has words but is not in the provenance list`);
  if (problems.length) throw new Error(problems.join('\n'));

  const pieces = curated.pieces.map((c, order) => {
    const prov = made[c.id];
    const bytes = read(prov.file);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== prov.sha256) throw new Error(`${c.id}: ${prov.file} no longer matches its provenance hash; record the new art in made-sprites.json`);
    const licence = LICENCES[prov.licence];
    if (!licence) throw new Error(`${c.id}: no words for the licence ${prov.licence}`);
    const image = { ...picture(prov.file, c.image.sheet, read), label: c.image.label, alt: c.image.alt };
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
  // Newest first; the curated order breaks a tie.
  pieces.sort((a, b) => (a.piece.made === b.piece.made ? a.order - b.order : a.piece.made < b.piece.made ? 1 : -1));
  return {
    note: 'Written by tools/made-art/build-data.mjs from tools/provenance/made-sprites.json and tools/made-art/pieces.json. Edit those, never this file.',
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

const stringify = (data) => `${JSON.stringify(data, null, 2)}\n`;

function main() {
  const check = process.argv.includes('--check');
  const data = build(JSON.parse(readFileSync(PROVENANCE, 'utf8')), JSON.parse(readFileSync(CURATED, 'utf8')), undefined, JSON.parse(readFileSync(MAPS, 'utf8')));
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
