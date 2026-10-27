#!/usr/bin/env node
/**
 * Writes public/codebase/data.json for the Code page (/code/, drawn by
 * groddle-afternoon-site/src/Codebase.php): each of the three Groddle repos
 * measured with git at a ref, so unfinished edits in a working tree are never
 * counted. By default the ref is the tag tools/deploy/live.json names for that
 * repo (what is public and live); --ref=HEAD measures each repo's HEAD for a
 * local preview.
 *
 * What counts as code: files in JavaScript, Go, PHP, Python, Shell, CSS or
 * HTML that people write. Everything else in the repo is listed beside it, not
 * in it: art and sound, JSON data, generated modules and built pages (a file
 * whose header says it is generated or not to be edited by hand, or a folder
 * of built pages below), vendored libraries, docs and the lockfile. Lines are
 * every line in the file, blank ones included.
 *
 *   node tools/codebase/build-data.mjs                 write data.json (live tags)
 *   node tools/codebase/build-data.mjs --check         exit 1 if data.json is stale
 *   node tools/codebase/build-data.mjs --ref=HEAD      measure every repo's HEAD instead
 *   node tools/codebase/build-data.mjs --release=<live.json> --out=<data.json>   (a deploy's own copy)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { GAME_DIR, SERVER_DIR, SITE_DIR, HAS_SERVER, HAS_SITE } from '../repos.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const OUT = resolve(typeof args.out === 'string' ? args.out : join(GAME_DIR, 'public', 'codebase', 'data.json'));
const RELEASE = resolve(typeof args.release === 'string' ? args.release : join(GAME_DIR, 'tools', 'deploy', 'live.json'));

const OWNER = 'https://github.com/TinyBitAdventures';

/** Code languages by extension, in the page's fixed order (each keeps its colour on every chart). */
export const LANGUAGES = [
  ['javascript', 'JavaScript', ['js', 'mjs', 'cjs']],
  ['go', 'Go', ['go']],
  ['php', 'PHP', ['php']],
  ['html', 'HTML', ['html', 'htm']],
  ['css', 'CSS', ['css']],
  ['python', 'Python', ['py']],
  ['shell', 'Shell', ['sh', 'bash']],
];
const LANGUAGE_BY_EXT = new Map(LANGUAGES.flatMap(([id, , exts]) => exts.map((e) => [e, id])));
const ART = new Set(['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'mp3', 'ogg', 'wav', 'm4a', 'woff', 'woff2', 'ttf']);
const DOCS = new Set(['md', 'txt', 'log']);

/** Folders of built pages in the game: each page is written by a tool, so it is generated, not code. */
const GAME_BUILT = [
  ['public/items/', 'the item catalog pages (tools/catalog)'],
  ['public/changelog/', 'the old build notes (tools/changelog/build.mjs)'],
  ['public/changelog.html', 'the old build notes (tools/changelog/build.mjs)'],
];

/** The groups everything that is not code falls into, in page order. */
const NOT_CODE = {
  art: 'Art and sound',
  data: 'Data (JSON)',
  generated: 'Generated modules and built pages',
  vendored: 'Vendored libraries',
  docs: 'Docs and notes',
  other: 'Other files',
};

const ext = (path) => (/\.([A-Za-z0-9]+)$/.exec(path)?.[1] ?? '').toLowerCase();
const basename = (path) => path.slice(path.lastIndexOf('/') + 1);

function git(dir, gitArgs, input) {
  return execFileSync('git', ['-C', dir, ...gitArgs], { input, maxBuffer: 1 << 30, ...(input === undefined ? { encoding: 'utf8' } : {}) });
}

/** Every file at a ref: path, size and blob id (symlinks and submodules are not files). */
function treeFiles(dir, ref) {
  const out = git(dir, ['ls-tree', '-r', '-l', '-z', ref]);
  const files = [];
  for (const row of out.split('\0')) {
    if (!row) continue;
    const tab = row.indexOf('\t');
    const [mode, type, sha, size] = row.slice(0, tab).split(/\s+/);
    if (type !== 'blob' || mode === '120000') continue;
    files.push({ path: row.slice(tab + 1), sha, bytes: Number(size) });
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** The contents of many blobs in one git call. */
function readBlobs(dir, shas) {
  const unique = [...new Set(shas)];
  const out = new Map();
  if (!unique.length) return out;
  const buf = git(dir, ['cat-file', '--batch'], unique.join('\n') + '\n');
  let at = 0;
  while (at < buf.length) {
    const nl = buf.indexOf(10, at);
    const [sha, , size] = buf.subarray(at, nl).toString('utf8').split(' ');
    const n = Number(size);
    out.set(sha, buf.subarray(nl + 1, nl + 1 + n));
    at = nl + 1 + n + 1;
  }
  return out;
}

/** Every line in a file, blank ones included (a last line without a newline still counts). */
export function countLines(buf) {
  if (!buf.length) return 0;
  let n = 0;
  for (let i = buf.indexOf(10); i !== -1; i = buf.indexOf(10, i + 1)) n++;
  return buf[buf.length - 1] === 10 ? n : n + 1;
}

/**
 * Whether a file's header (its first 8 lines) says a tool wrote it: "do not edit" or "never this
 * file", or a comment line that starts "Generated by" / "GENERATED from". A note that some other
 * file is generated ("the generated catalog") does not count.
 */
export function saysGenerated(text) {
  const head = text.split('\n', 8).join('\n');
  return /do not edit|never this file/i.test(head) || /^\s*(?:\/\/+|\/?\*+|<!--|#)\s*(?:Generated|GENERATED)\s+(?:by|from)\b/m.test(head);
}

/** One repo's history at a ref: commits reachable from it, the first and the latest commit dates. */
function history(dir, ref) {
  const commits = Number(git(dir, ['rev-list', '--count', ref]).trim());
  const roots = git(dir, ['rev-list', '--max-parents=0', ref]).trim().split('\n');
  const first = roots.map((r) => git(dir, ['log', '-1', '--format=%as', r]).trim()).sort()[0];
  const latest = git(dir, ['log', '-1', '--format=%as', ref]).trim();
  return { commits, first, latest };
}

function tally(rows, key) {
  const by = new Map();
  for (const row of rows) {
    const k = row[key];
    const t = by.get(k) ?? { files: 0, lines: 0, bytes: 0 };
    t.files++;
    t.lines += row.lines ?? 0;
    t.bytes += row.bytes;
    by.set(k, t);
  }
  return by;
}

/**
 * Measures one repo: sorts every file into code (with a language and an area)
 * or one of the NOT_CODE groups, then totals them.
 * `classify(file, text)` returns { area } for code, or { not } for anything else.
 */
function measure(dir, ref, classify, areaOrder) {
  const files = treeFiles(dir, ref);
  const textual = files.filter((f) => LANGUAGE_BY_EXT.has(ext(f.path)));
  const blobs = readBlobs(dir, textual.map((f) => f.sha));
  const code = [];
  const rest = [];
  for (const f of files) {
    const language = LANGUAGE_BY_EXT.get(ext(f.path));
    const buf = language ? blobs.get(f.sha) : null;
    const text = buf ? buf.toString('utf8') : '';
    const place = classify(f, language, text);
    if (place.area) code.push({ ...f, language, area: place.area, lines: countLines(buf) });
    else rest.push({ ...f, not: place.not, lines: buf ? countLines(buf) : null });
  }
  const languages = tally(code, 'language');
  const areas = tally(code, 'area');
  const notCode = tally(rest, 'not');
  return {
    code: { files: code.length, lines: code.reduce((n, f) => n + f.lines, 0), bytes: code.reduce((n, f) => n + f.bytes, 0) },
    languages: LANGUAGES.filter(([id]) => languages.has(id)).map(([id, label]) => ({ id, label, files: languages.get(id).files, lines: languages.get(id).lines }))
      .sort((a, b) => b.lines - a.lines),
    areas: areaOrder.filter(([id]) => areas.has(id)).map(([id, label, path]) => ({ id, label, path, files: areas.get(id).files, lines: areas.get(id).lines }))
      .sort((a, b) => b.lines - a.lines),
    largest: [...code].sort((a, b) => b.lines - a.lines || (a.path < b.path ? -1 : 1)).slice(0, 5).map((f) => ({ path: f.path, lines: f.lines })),
    notCode: Object.entries(NOT_CODE).filter(([id]) => notCode.has(id)).map(([id, label]) => {
      const t = notCode.get(id);
      const texty = rest.filter((f) => f.not === id && f.lines !== null);
      return { id, label, files: t.files, bytes: t.bytes, ...(texty.length ? { lines: texty.reduce((n, f) => n + f.lines, 0) } : {}) };
    }),
    totalFiles: files.length,
    files: code,
  };
}

/** What a non-code file is, by the same rules in every repo. */
function notCodeKind(f) {
  const e = ext(f.path);
  if (ART.has(e)) return 'art';
  if (e === 'json') return basename(f.path) === 'package-lock.json' ? 'other' : 'data';
  if (DOCS.has(e) || /^(LICENSE|readme)/i.test(basename(f.path))) return 'docs';
  return 'other';
}

// —— the game ——
const GAME_AREAS = [
  ['core', 'Game core', 'public/game.js, public/content.js, public/js/'],
  ['features', 'Feature modules', 'public/js/features/'],
  ['rooms', 'Quest rooms', 'public/js/quest-rooms/'],
  ['pages', 'Pages and styles', 'public/ (pages, stylesheets, page scripts)'],
  ['tools', 'Build tools', 'tools/, build-*.mjs'],
  ['tests', 'Tests', 'tests/'],
];

function gameClassify(f, language, text) {
  const p = f.path;
  if (p.startsWith('public/vendor/')) return { not: 'vendored' };
  if (GAME_BUILT.some(([prefix]) => p === prefix || p.startsWith(prefix))) return { not: language ? 'generated' : notCodeKind(f) };
  if (!language) return { not: notCodeKind(f) };
  if (saysGenerated(text)) return { not: 'generated' };
  if (p.startsWith('tests/')) return { area: 'tests' };
  if (p.startsWith('tools/') || !p.includes('/')) return { area: 'tools' };
  if (p.startsWith('public/js/features/')) return { area: 'features' };
  if (p.startsWith('public/js/quest-rooms/')) return { area: 'rooms' };
  if (p.startsWith('public/js/') || p === 'public/game.js' || p === 'public/content.js') return { area: 'core' };
  return { area: 'pages' };
}

// —— the realtime server ——
const SERVER_AREAS = [
  ['modules', 'Shared-world modules', '*.go that register a module'],
  ['core', 'Core', 'hub, sockets, tickets, saving'],
  ['tests', 'Tests', '*_test.go'],
  ['deploy', 'Deploy and run scripts', 'deploy/, run.sh'],
];

function serverClassify(f, language, text) {
  if (!language) return { not: notCodeKind(f) };
  if (saysGenerated(text)) return { not: 'generated' };
  if (f.path.endsWith('_test.go')) return { area: 'tests' };
  if (language === 'go') return { area: /modules = append\(modules,/.test(text) ? 'modules' : 'core' };
  return { area: 'deploy' };
}

// —— the site ——
const SITE_AREAS = [
  ['ledger', 'Shared ledger', 'src/Ledger*.php, src/Economy.php'],
  ['services', 'Player services', 'src/ classes behind the groddle/v1 REST routes'],
  ['pages', 'Pages, blocks and menu', 'the rest of src/'],
  ['templates', 'Templates', 'templates/, parts/'],
  ['styles', 'Styles', 'style.css'],
];

/** The classes the extension hands to the REST seam ($minn->rest(new A(...), new B(...))). */
function restClasses(dir, ref) {
  let src = '';
  try {
    src = git(dir, ['show', `${ref}:src/Extension.php`]);
  } catch {
    return new Set();
  }
  const call = /\$minn->rest\(([^;]*)\);/g;
  const names = new Set();
  for (const m of src.matchAll(call)) for (const c of m[1].matchAll(/new\s+([A-Za-z_]\w*)\s*\(/g)) names.add(c[1]);
  return names;
}

function siteClassify(rest) {
  return (f, language, text) => {
    if (!language) return { not: notCodeKind(f) };
    if (saysGenerated(text)) return { not: 'generated' };
    const name = basename(f.path).replace(/\.php$/, '');
    if (f.path.startsWith('src/')) {
      if (/^Ledger/.test(name) || name === 'Economy') return { area: 'ledger' };
      return { area: rest.has(name) ? 'services' : 'pages' };
    }
    if (f.path.startsWith('templates/') || f.path.startsWith('parts/')) return { area: 'templates' };
    if (language === 'css') return { area: 'styles' };
    return { area: 'pages' };
  };
}

// —— tests ——
const JS_CASE = /^\s*(?:it|test)\(\s*['"`]/gm;
const GO_CASE = /^func Test\w*\(\w+ \*testing\.T\)/gm;
const SITE_TEST = /skipWithoutSite|sitePath\(|SITE_DIR/;

function jsTests(dir, files, pick = () => true) {
  const tests = files.filter((f) => f.area === 'tests' && /\.test\.js$/.test(f.path));
  const blobs = readBlobs(dir, tests.map((f) => f.sha));
  const chosen = tests.filter((f) => pick(blobs.get(f.sha).toString('utf8')));
  return { files: chosen.length, cases: chosen.reduce((n, f) => n + (blobs.get(f.sha).toString('utf8').match(JS_CASE)?.length ?? 0), 0) };
}

function goTests(dir, files) {
  const tests = files.filter((f) => f.area === 'tests' && f.path.endsWith('_test.go'));
  const blobs = readBlobs(dir, tests.map((f) => f.sha));
  return { files: tests.length, cases: tests.reduce((n, f) => n + (blobs.get(f.sha).toString('utf8').match(GO_CASE)?.length ?? 0), 0) };
}

function resolveRef(dir, ref) {
  try {
    return git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new Error(`${ref} is not in ${dir}: fetch the tags (git fetch --tags) or pass --ref=HEAD`);
  }
}

function repoEntry(id, name, dir, ref, m, extra) {
  const { files, ...shown } = m;
  return {
    id,
    name,
    url: `${OWNER}/${name}`,
    ref,
    commit: resolveRef(dir, ref).slice(0, 8),
    licence: 'MIT',
    history: history(dir, ref),
    ...shown,
    ...extra,
  };
}

export function codebaseData({ ref = null, release = RELEASE } = {}) {
  const live = JSON.parse(readFileSync(release, 'utf8'));
  const refs = { game: ref ?? live.game, server: ref ?? live.server, site: ref ?? live.site };
  if (!HAS_SERVER || !HAS_SITE) throw new Error(`the Code page measures all three repos: clone the missing ones beside the game (tools/repos.mjs)`);

  const game = measure(GAME_DIR, refs.game, gameClassify, GAME_AREAS);
  const server = measure(SERVER_DIR, refs.server, serverClassify, SERVER_AREAS);
  const site = measure(SITE_DIR, refs.site, siteClassify(restClasses(SITE_DIR, refs.site)), SITE_AREAS);
  const siteTests = jsTests(GAME_DIR, game.files, (text) => SITE_TEST.test(text));

  return {
    measured: ref ? `each repo's ${ref}` : 'the tags tools/deploy/live.json names',
    deployed: ref ? null : live.deployed ?? null,
    repos: [
      repoEntry('game', 'groddle-afternoon', GAME_DIR, refs.game, game, { tests: { ...jsTests(GAME_DIR, game.files), runner: 'node --test' } }),
      repoEntry('server', 'groddle-afternoon-server', SERVER_DIR, refs.server, server, { tests: { ...goTests(SERVER_DIR, server.files), runner: 'go test' } }),
      repoEntry('site', 'groddle-afternoon-site', SITE_DIR, refs.site, site, { tests: { ...siteTests, runner: 'node --test', where: 'groddle-afternoon' } }),
    ],
    platform: {
      engine: { name: 'Minn Engine', url: 'https://github.com/austinginder/minn-engine', commit: String(live.engine ?? '').slice(0, 8) || null },
      minnAdmin: { name: 'Minn Admin', url: 'https://github.com/austinginder/minn-admin', commit: String(live.minnAdmin ?? '').slice(0, 8) || null },
    },
    builtPages: GAME_BUILT.map(([path, what]) => ({ path, what })),
  };
}

function main() {
  const ref = typeof args.ref === 'string' ? args.ref : null;
  const body = JSON.stringify(codebaseData({ ref }), null, 1) + '\n';
  const now = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
  if (args.check) {
    if (now !== body) {
      console.log('public/codebase/data.json is stale (node tools/codebase/build-data.mjs)');
      process.exit(1);
    }
    return;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body);
  const d = JSON.parse(body);
  for (const r of d.repos) console.log(`${r.name} ${r.ref}: ${r.code.lines} lines of code in ${r.code.files} files, ${r.tests.cases} tests, ${r.history.commits} commits`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
