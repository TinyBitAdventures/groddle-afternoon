/**
 * The inventions register's scanner (root issue R16, Austin 2026-11-17): every place the remake
 * made up something Glitch did not have is listed in tools/inventions/inventions.json, so it can be
 * reviewed, and a new one cannot slip in unmarked.
 *
 * Two kinds of mark are watched:
 *
 * 1. Marker words in the code: the phrases the codebase already uses for "this is ours"
 *    ("the remake's own", "ours", "no source", "stand-in", "invented", "reimagined", "Glitch had
 *    no", ...; MARKERS below). Each hit is fingerprinted by its file, its marker and the words
 *    around it, and tools/inventions/markers.json says which register entry claims it
 *    (NOT_AN_INVENTION for a hit that only uses the word, such as dialogue or a code comment about
 *    a build step). A new hit nobody claimed fails tests/inventions-register.test.js.
 *
 * 2. Families held in data (FAMILIES below): the remake-only sound keys, `designed` seasons, made
 *    decos and sprites, `reimagined` checklist and inventory rows, the Known gaps page's
 *    differences on purpose. Each family's members must equal the `members` of the register entry
 *    named for it, so a new key, season or picture fails the same test until it is registered.
 *
 * Usage (from the repo root):
 *   node tools/inventions/scan.mjs                  summary
 *   node tools/inventions/scan.mjs --check          exit 1 on unclaimed hits, unknown ids or family drift
 *   node tools/inventions/scan.mjs --unclaimed      list the unclaimed hits with file:line
 *   node tools/inventions/scan.mjs --claim <id> [file ...]
 *                                                   claim the unclaimed hits (in those files) for entry <id>,
 *                                                   which must already be in inventions.json
 *   node tools/inventions/scan.mjs --prune          drop claims whose words are gone from the code
 *   node tools/inventions/scan.mjs --families       print each family's members (to paste into an entry)
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const REGISTER_PATH = join(here, 'inventions.json');
export const MARKERS_PATH = join(here, 'markers.json');
/** The Our additions section's list (tools/made-art/compare.json): an addition of ours beside its Tiny Speck original. */
export const COMPARE_PATH = join(ROOT, 'tools/made-art/compare.json');
/** An entry's `compare` value for art the Made for Groddle band already shows beside its original (made.json pieces). */
export const COMPARE_MADE = 'made';

/** The claim for a hit that only uses a marker word (dialogue, a build step, a variable). */
export const NOT_AN_INVENTION = 'not-an-invention';

export const KINDS = Object.freeze(['behaviour', 'visual', 'data', 'placement', 'UI', 'content']);

/**
 * kept: Austin ruled to keep it (ruling says when and where).
 * proposed: a lane made it and it works; no ruling yet.
 * under-review: flagged for Austin: looks like the inventions he has dropped before.
 * dropped: Austin ruled it out and it is gone from the game (kept here as precedent).
 */
export const STATUSES = Object.freeze(['kept', 'proposed', 'under-review', 'dropped']);

/**
 * Marker words. `anywhere` markers count in code and comments alike; `comment` markers only in a
 * comment (they are common words in dialogue and variable names).
 */
export const MARKERS = Object.freeze([
  { id: 'no-source', where: 'anywhere', re: /\bno source\b(?! (?:change|PNG|png|plat)\b)/i },
  { id: 'invented', where: 'anywhere', re: /\binvent(?:ed|ion|ions)\b/i },
  { id: 'stand-in', where: 'anywhere', re: /\b[Ss]tand-ins?\b/ },
  { id: 'reimagined', where: 'anywhere', re: /\breimagin(?:ed|ing)\b/i },
  { id: 'remake-only', where: 'anywhere', re: /\bremake[- ]only\b/i },
  { id: 'remake-own', where: 'anywhere', re: /\bremake(?:'s)? (?:own|choice|choices|addition|polish|design|invention)\b/i },
  { id: 'remake-adds', where: 'anywhere', re: /\bremake adds\b/i },
  { id: 'glitch-had-none', where: 'anywhere', re: /\bGlitch (?:had|has) (?:no|none|nothing)\b|\bGlitch never\b/i },
  { id: 'not-source', where: 'anywhere', re: /\bnot (?:in|from) (?:the )?(?:source|GSJS|GameServerJS)\b|\bnot Tiny Speck'?s\b/i },
  { id: 'made-up', where: 'anywhere', re: /\bmade-up\b/i },
  { id: 'no-original', where: 'anywhere', re: /\bno original\b/i },
  { id: 'our-design', where: 'anywhere', re: /\bour (?:own )?design\b/i },
  { id: 'ours', where: 'comment', re: /\bours\b|\bour own\b/i },
  { id: 'guess', where: 'comment', re: /\bguess(?:ed|es|ing|work)?\b/i },
]);

/** Where the game's own code lives: the scanner reads these. */
const SCAN_DIRS = ['public/js', 'public/css', 'tools'];
const SCAN_FILES = ['public/game.js', 'public/content.js', 'public/style.css'];
const SCAN_EXT = /\.(?:m?js|css|py)$/;

/**
 * Left out: page and report builders whose prose talks about the remake (their words are about
 * the restoration, not things in the game), this register's own tools, and generated files (their
 * builder is scanned instead).
 */
const SKIP = [
  /^tools\/inventions\//,
  /^tools\/(?:changelog|gaps|new-content|codebase|brand|landing|contribute|credits|site-nav|encyclopedia|catalog|inventory|qa|module-keys|release|reports|restoration|deploy|perf|word-progress|data-versions|play-online)\//,
  /^tools\/coverage\.mjs$/,
  /^tools\/build-restoration\.mjs$/,
  /\/to-minn\.mjs$/,
  /(?:^|\/)node_modules\//,
];

const GENERATED_HEAD = /\b(?:generated by|generated from|written by|do not edit)\b/i;

export function isGenerated(rel, text) {
  if (/\.py$/.test(rel)) return false;
  return GENERATED_HEAD.test(text.slice(0, 400)) && /(?:-data|-list|-catalog)\.js$|\/data\//.test(rel);
}

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** The files the scanner reads, relative to root, sorted. */
export function scanFiles(root = ROOT) {
  const files = [];
  for (const d of SCAN_DIRS) walk(join(root, d), files);
  for (const f of SCAN_FILES) if (existsSync(join(root, f))) files.push(join(root, f));
  for (const name of readdirSync(root)) if (/^build-.*\.mjs$/.test(name)) files.push(join(root, name));
  return [...new Set(files.map((f) => relative(root, f).split('\\').join('/')))]
    .filter((rel) => SCAN_EXT.test(rel) && !SKIP.some((re) => re.test(rel)))
    .sort();
}

/** PURE: where one line's comment starts (-1 when it has none). */
export function commentStart(line, rel = '') {
  if (/\.py$/.test(rel)) {
    if (line.trim().startsWith('#')) return 0;
    return line.indexOf(' # ');
  }
  if (/^(?:\*|\/\*|\/\/|<!--)/.test(line.trim())) return 0;
  const m = /(?<![:'"\\\w])\/\//.exec(line) || /\/\*/.exec(line);
  return m ? m.index : -1;
}

/** PURE: the words a hit is known by: its marker and up to 50 characters each side, tidied. */
export function hitKey(markerId, text, index, length) {
  const clean = (s) => s.replace(/\?v=[0-9a-f]{6,}/g, '').replace(/\s+/g, ' ');
  const before = clean(text.slice(Math.max(0, index - 50), index)).replace(/^\S*\s/, '');
  const after = clean(text.slice(index + length, index + length + 50)).replace(/\s\S*$/, '');
  return `${markerId}: ${before}${clean(text.slice(index, index + length))}${after}`.trim();
}

const SYMBOL_RE = [
  /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/,
  /^def\s+([A-Za-z_]\w*)|^class\s+([A-Za-z_]\w*)/,
  /^\s*(?!(?:return|if|else|for|while|switch|try|do|catch|finally)\b)([.#]?[a-z][\w-]*(?:[ .#>:][\w.#>: -]*)?)\s*\{\s*$/,
];

/**
 * PURE: the name a hit belongs to: for a mark in a comment, the declaration the comment sits on
 * (the first code line under it); else, or when that line declares nothing, the nearest
 * top-level name above line `i`. '' when there is none.
 */
export function symbolAt(lines, i) {
  const isComment = (l) => /^\s*(?:\*|\/\*|\/\/|#)/.test(l);
  if (isComment(lines[i])) {
    for (let j = i + 1; j < lines.length && j < i + 60; j += 1) {
      if (isComment(lines[j]) || !lines[j].trim()) continue;
      for (const re of SYMBOL_RE.slice(0, 4)) {
        const m = re.exec(lines[j]);
        if (m) return m[1] || m[2] || '';
      }
      break;
    }
  }
  for (let j = i; j >= 0 && j > i - 400; j -= 1) {
    const line = lines[j];
    if (!/^\s{0,2}\S/.test(line)) continue;
    for (const re of SYMBOL_RE) {
      const m = re.exec(line);
      if (m) return m[1] || m[2] || '';
    }
  }
  return '';
}

/**
 * Every marker hit in the code: { file, line, marker, key, text, symbol }. A line too long to be
 * written by hand (packed data) is skipped. A key met twice in one file gets ` #2`, ` #3`, ...
 */
export function scanMarkers(root = ROOT) {
  const hits = [];
  for (const rel of scanFiles(root)) {
    const text = readFileSync(join(root, rel), 'utf8');
    if (isGenerated(rel, text)) continue;
    const lines = text.split('\n');
    const seen = new Map();
    lines.forEach((line, i) => {
      if (line.length > 1500) return;
      const from = commentStart(line, rel);
      for (const m of MARKERS) {
        if (m.where === 'comment' && from < 0) continue;
        const start = m.where === 'comment' ? from : 0;
        const found = m.re.exec(line.slice(start));
        if (!found) continue;
        let key = hitKey(m.id, line, start + found.index, found[0].length);
        const n = (seen.get(key) || 0) + 1;
        seen.set(key, n);
        if (n > 1) key = `${key} #${n}`;
        hits.push({ file: rel, line: i + 1, marker: m.id, key, text: line.trim().slice(0, 240), symbol: symbolAt(lines, i) });
      }
    });
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* Families held in data                                                */
/* ------------------------------------------------------------------ */

const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const has = (root, rel) => existsSync(join(root, rel));

/**
 * Each family: the register entry that lists its members, the file it is read from, and how.
 * `members` returns null when its source file is missing (a partial checkout), and the test skips it.
 */
export const FAMILIES = Object.freeze({
  'remake-sound-keys': {
    source: 'public/assets/content/sound-keys.json',
    about: 'sound keys of category remake (build-sound-keys.mjs REMAKE): moments with no key of their own in Glitch',
    members: async (root) => (has(root, 'public/assets/content/sound-keys.json')
      ? Object.entries(readJson(root, 'public/assets/content/sound-keys.json').keys).filter(([, r]) => r.category === 'remake').map(([k]) => k)
      : null),
  },
  'designed-seasons': {
    source: 'public/js/seasons.js',
    about: "SEASONS entries with source: 'designed' (no source event, written for the remake)",
    members: async (root) => {
      if (!has(root, 'public/js/seasons.js')) return null;
      const { SEASONS } = await import(pathToFileURL(join(root, 'public/js/seasons.js')).href);
      return Object.values(SEASONS).filter((s) => s.source === 'designed').map((s) => s.id);
    },
  },
  'made-decos': {
    source: 'tools/provenance/made-decos.json',
    about: 'new decos made for rebuilt streets and rooms (AI-generated or own work, CC0)',
    members: async (root) => (has(root, 'tools/provenance/made-decos.json') ? Object.keys(readJson(root, 'tools/provenance/made-decos.json').art) : null),
  },
  'made-sprites': {
    source: 'tools/provenance/made-sprites.json',
    about: 'sprites made for Groddle, not restored from Tiny Speck',
    members: async (root) => (has(root, 'tools/provenance/made-sprites.json') ? Object.keys(readJson(root, 'tools/provenance/made-sprites.json').sprites) : null),
  },
  'made-maps': {
    source: 'tools/provenance/repainted-maps.json',
    about: 'map paintings made for the remake: repainted regions not restored from the 2012 Encyclopedia, plus the subway paper map and the 2x world map',
    members: async (root) => {
      if (!has(root, 'tools/provenance/repainted-maps.json')) return null;
      const out = Object.entries(readJson(root, 'tools/provenance/repainted-maps.json').regions)
        .filter(([, r]) => !/^restored/.test(r.method || '')).map(([id]) => `region:${id}`);
      if (has(root, 'tools/provenance/subway-map-paper.json')) out.push('subway-map-paper');
      if (has(root, 'tools/provenance/world-map-2x.json')) out.push('world-map-2x');
      return out;
    },
  },
  'checklist-reimagined': {
    source: 'tools/restoration/checklist.mjs',
    about: "restoration checklist items with status 'reimagined' (nothing survives; designed fresh)",
    members: async (root) => {
      if (!has(root, 'tools/restoration/checklist.mjs')) return null;
      const { CHECKLIST } = await import(pathToFileURL(join(root, 'tools/restoration/checklist.mjs')).href);
      return CHECKLIST.filter((c) => c.status === 'reimagined').map((c) => c.id);
    },
  },
  'inventory-reimagined': {
    source: 'tools/inventory/overrides.json',
    about: "inventory overrides with status 'reimagined' (places, skills, cards and wardrobe built fresh)",
    members: async (root) => (has(root, 'tools/inventory/overrides.json')
      ? Object.entries(readJson(root, 'tools/inventory/overrides.json')).filter(([, v]) => v && v.status === 'reimagined').map(([k]) => k)
      : null),
  },
  'differences-on-purpose': {
    source: 'tools/gaps/public-gaps.json',
    about: 'the Known gaps page\'s "On purpose" rows: rules changed from Glitch\'s on purpose',
    members: async (root) => (has(root, 'tools/gaps/public-gaps.json')
      ? readJson(root, 'tools/gaps/public-gaps.json').gaps.filter((g) => g.show === 'purpose').map((g) => g.id)
      : null),
  },
});

/* ------------------------------------------------------------------ */
/* Register and claims                                                  */
/* ------------------------------------------------------------------ */

export function loadRegister(path = REGISTER_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadMarkers(path = MARKERS_PATH) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { claims: {} };
}

/** markers.json, sorted by file then key, one claim a line (small diffs, easy rebases). */
export function writeMarkers(markers, path = MARKERS_PATH) {
  const files = Object.keys(markers.claims).sort();
  const body = files.map((f) => {
    const keys = Object.keys(markers.claims[f]).sort();
    const rows = keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(markers.claims[f][k])}`);
    return `  ${JSON.stringify(f)}: {\n${rows.join(',\n')}\n  }`;
  });
  const about = JSON.stringify(markers.about || '');
  writeFileSync(path, `{\n"about": ${about},\n"claims": {\n${body.join(',\n')}\n}\n}\n`);
}

/** PURE: problems in the register itself (ids, kinds, statuses, rulings, files). */
export function registerProblems(register, root = ROOT) {
  const out = [];
  const ids = new Set();
  for (const e of register.entries || []) {
    const at = e.id || '(no id)';
    if (!e.id || !/^[a-z0-9][a-z0-9-]*$/.test(e.id)) out.push(`${at}: id must be lower-case words with dashes`);
    if (ids.has(e.id)) out.push(`${at}: duplicate id`);
    ids.add(e.id);
    if (e.id === NOT_AN_INVENTION) out.push(`${at}: ${NOT_AN_INVENTION} is reserved`);
    if (!e.title) out.push(`${at}: no title`);
    if (!KINDS.includes(e.kind)) out.push(`${at}: kind ${e.kind} not one of ${KINDS.join(', ')}`);
    if (!STATUSES.includes(e.status)) out.push(`${at}: status ${e.status} not one of ${STATUSES.join(', ')}`);
    if (!e.why) out.push(`${at}: no why`);
    if ((e.status === 'kept' || e.status === 'dropped') && !e.ruling) out.push(`${at}: ${e.status} needs a ruling (who, when, where)`);
    if (!Array.isArray(e.where) || !e.where.length) out.push(`${at}: no where`);
    for (const w of e.where || []) {
      if (!w.file) out.push(`${at}: a where without a file`);
      else if (e.status !== 'dropped' && !w.gone && !existsSync(join(root, w.file)) && !w.art) out.push(`${at}: ${w.file} does not exist`);
    }
    if (e.family && !FAMILIES[e.family]) out.push(`${at}: unknown family ${e.family}`);
  }
  for (const fam of Object.keys(FAMILIES)) {
    if (!(register.entries || []).some((e) => e.family === fam)) out.push(`family ${fam} has no entry`);
  }
  return out;
}

/**
 * PURE: the compare rule (Austin 2026-11-25, #699, G1308: "document the original artwork next to our
 * addition, then standardize it"). Every kept visual entry either names where its Tiny Speck original
 * is shown beside ours (`compare`: an entry id of tools/made-art/compare.json, or "made" for the Made
 * for Groddle band) or says in `noCompare` why it has none; and every compare.json entry names a
 * visual entry of the register that points back at it.
 */
export function compareProblems(register, compare = { entries: [] }) {
  const out = [];
  const entries = register.entries || [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const compareIds = new Set((compare.entries || []).map((c) => c.id));
  for (const e of entries) {
    if (e.compare !== undefined && e.noCompare !== undefined) out.push(`${e.id}: has both compare and noCompare`);
    if (e.compare !== undefined && e.compare !== COMPARE_MADE && !compareIds.has(e.compare)) out.push(`${e.id}: compare ${e.compare} is not an entry of tools/made-art/compare.json (or "${COMPARE_MADE}")`);
    if (e.noCompare !== undefined && !(typeof e.noCompare === 'string' && e.noCompare.trim().length >= 12)) out.push(`${e.id}: noCompare must say why there is no original to show`);
    if (e.kind === 'visual' && e.status === 'kept' && e.compare === undefined && e.noCompare === undefined) {
      out.push(`${e.id}: a kept visual invention needs compare (its Tiny Speck original beside ours, tools/made-art/compare.json) or noCompare (why it has none)`);
    }
  }
  for (const c of compare.entries || []) {
    const e = byId.get(c.invention);
    if (!e) out.push(`compare ${c.id}: names no register entry (${c.invention})`);
    else if (e.kind !== 'visual') out.push(`compare ${c.id}: ${e.id} is not a visual invention`);
    else if (e.compare !== c.id) out.push(`compare ${c.id}: ${e.id} should say compare: "${c.id}"`);
  }
  return out;
}

/** compare.json from the checkout ({ entries: [] } when missing). */
export function loadCompare(path = COMPARE_PATH) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { entries: [] };
}

/** PURE: hits nobody claimed, and claims that name no entry. */
export function claimProblems(hits, markers, register) {
  const ids = new Set((register.entries || []).map((e) => e.id));
  ids.add(NOT_AN_INVENTION);
  const unclaimed = hits.filter((h) => !markers.claims[h.file]?.[h.key]);
  const unknown = [];
  for (const [file, claims] of Object.entries(markers.claims)) {
    for (const [key, id] of Object.entries(claims)) if (!ids.has(id)) unknown.push({ file, key, id });
  }
  return { unclaimed, unknown };
}

/** PURE: claims whose words no longer appear in the code. */
export function staleClaims(hits, markers) {
  const live = new Set(hits.map((h) => `${h.file}\n${h.key}`));
  const out = [];
  for (const [file, claims] of Object.entries(markers.claims)) {
    for (const key of Object.keys(claims)) if (!live.has(`${file}\n${key}`)) out.push({ file, key });
  }
  return out;
}

/** Each family's drift from its entry: { family, entry, added, removed } (null members: skipped). */
export async function familyDrift(register, root = ROOT) {
  const out = [];
  for (const [fam, def] of Object.entries(FAMILIES)) {
    const entry = (register.entries || []).find((e) => e.family === fam);
    const now = await def.members(root);
    if (now === null) { out.push({ family: fam, entry: entry?.id, skipped: `${def.source} missing` }); continue; }
    const listed = new Set(entry?.members || []);
    const have = new Set(now);
    out.push({
      family: fam,
      entry: entry?.id,
      added: now.filter((m) => !listed.has(m)),
      removed: [...listed].filter((m) => !have.has(m)),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                  */
/* ------------------------------------------------------------------ */

async function main(argv) {
  const register = loadRegister();
  const markers = loadMarkers();
  const hits = scanMarkers();
  const { unclaimed, unknown } = claimProblems(hits, markers, register);

  if (argv.includes('--claim')) {
    const id = argv[argv.indexOf('--claim') + 1];
    const files = argv.slice(argv.indexOf('--claim') + 2).filter((a) => !a.startsWith('--'));
    const ids = new Set(register.entries.map((e) => e.id));
    if (!id || (!ids.has(id) && id !== NOT_AN_INVENTION)) {
      console.error(`--claim needs an entry id from tools/inventions/inventions.json (or ${NOT_AN_INVENTION}); add the entry first.`);
      process.exit(1);
    }
    let n = 0;
    for (const h of unclaimed) {
      if (files.length && !files.includes(h.file)) continue;
      (markers.claims[h.file] ||= {})[h.key] = id;
      n += 1;
    }
    writeMarkers(markers);
    console.log(`claimed ${n} hit(s) for ${id}`);
    return;
  }
  if (argv.includes('--prune')) {
    const stale = staleClaims(hits, markers);
    for (const s of stale) {
      delete markers.claims[s.file][s.key];
      if (!Object.keys(markers.claims[s.file]).length) delete markers.claims[s.file];
    }
    writeMarkers(markers);
    console.log(`pruned ${stale.length} claim(s)`);
    return;
  }
  if (argv.includes('--families')) {
    for (const [fam, def] of Object.entries(FAMILIES)) console.log(fam, JSON.stringify(await def.members(ROOT)));
    return;
  }
  if (argv.includes('--unclaimed')) {
    for (const h of unclaimed) console.log(`${h.file}:${h.line} [${h.marker}] ${h.text}`);
    return;
  }

  const drift = await familyDrift(register);
  const problems = [...registerProblems(register), ...compareProblems(register, loadCompare())];
  const driftBad = drift.filter((d) => !d.skipped && (d.added.length || d.removed.length));
  console.log(`${register.entries.length} entries; ${hits.length} marker hits in ${new Set(hits.map((h) => h.file)).size} files; ${unclaimed.length} unclaimed; ${unknown.length} claims name no entry; ${staleClaims(hits, markers).length} stale`);
  for (const p of problems) console.log(`register: ${p}`);
  for (const d of driftBad) console.log(`family ${d.family} (entry ${d.entry}): new ${JSON.stringify(d.added)}, gone ${JSON.stringify(d.removed)}`);
  for (const h of unclaimed.slice(0, 40)) console.log(`unclaimed ${h.file}:${h.line} [${h.marker}] ${h.text.slice(0, 120)}`);
  if (argv.includes('--check') && (problems.length || unclaimed.length || unknown.length || driftBad.length)) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main(process.argv.slice(2));
}
