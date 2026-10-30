#!/usr/bin/env node
/**
 * Content keys for the game's own modules, scripts and style sheets (2026-10-30). A browser caches
 * `js/foo.js?v=<key>` for good, so the key has to change whenever what the URL loads changes, and two
 * importers that write two keys for one module load two copies of it (two ITEM_CATALOGs, two
 * conversation records). Hand-written keys (`?v=g477-1`, `registry-369`, `round16=`) did both wrong
 * at times and collided at every rebase. This writes every key from content instead:
 *
 * - A module's key is a Merkle hash: sha256 over its own text (with the keys of its imports taken out)
 *   and the keys of the modules it imports, first 8 hex. A change to a module changes its key, which
 *   changes the text of every importer, and so on up to game.js: exactly the importer chain changes.
 *   A cycle (a strongly connected group of modules) is hashed as one: a change anywhere in it changes
 *   every member's key. A module, script or style sheet with no imports is keyed by its text alone.
 * - Every relative import specifier gets `?v=<key>`: static, `export ... from`, and `import('...')`
 *   with a literal string, in every JS file under public/ (not vendor/), in inline
 *   `<script type="module">` blocks of every page, and in tests/ and tools/ (so a test, a builder and
 *   the browser share one instance of each module: one ITEM_CATALOG, one street index). A JSDoc
 *   `import('./x.js')` type in a comment names the bare file (it is never loaded). A test that wants
 *   its own fresh copy of a module writes a query without v= (`?fresh=<name>`), which is left alone.
 *   A dynamic import of a local module with a computed specifier is an error: write the URL out.
 * - In every page under public/, a `src`, `href` or `data-game` naming a local .js or .css file that
 *   carries `?v=` gets the key (the whole query becomes `?v=<key>`; style.css and game.js no longer
 *   collect a parameter per lane). `<script type="module" src>` is always keyed. js/data-versions.js
 *   is left to tools/data-versions/build.mjs, which keys it the same way.
 * - Strings in builders that name a module URL take it from here: moduleUrl('js/online-boot.js')
 *   (tools/play-online ONLINE_BOOT_SRC, tools/data-versions HOOK_SRC).
 *
 * The keys only depend on the text of public/ (not on git), so a rebuild with no source change
 * changes nothing. Run it after tools/data-versions/build.mjs (which writes url() keys into the
 * style sheets this hashes) and before tools/play-online/build.mjs --check. Never edit a `?v=` by hand.
 *
 *   node tools/module-keys/build.mjs           rewrite every key that is behind
 *   node tools/module-keys/build.mjs --check   exit 1 when any is (tests/module-keys.test.js)
 *   node tools/module-keys/build.mjs --resolve during a rebase or merge: settle every conflict whose two
 *                                              sides differ only in ?v= keys, then rewrite the keys
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Owned by tools/data-versions/build.mjs (its key is the map's own hash). */
const OWNED_ELSEWHERE = new Set(['js/data-versions.js']);
const CODE = /\.m?js$/;
const KEYED = /\.(?:m?js|css)$/;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const short = (text) => hash(text).slice(0, 8);
const toPosix = (p) => p.split(sep).join('/');

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const gitList = (root, path) => [
  ...git(root, ['ls-files', '-z', '--', path]).split('\0'),
  ...git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', path]).split('\0'),
].filter((f) => f && existsSync(join(root, f)));

/* ------------------------------------------------------------------ */
/* Finding the specifiers                                               */
/* ------------------------------------------------------------------ */

const MAY_IMPORT = /\bimport\b|\bexport\s*(?:\*|\{)/;
const DYNAMIC = /\bimport\s*\(/;

function parse(text, file, onComment) {
  const opts = { onComment, ecmaVersion: 'latest', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, allowImportExportEverywhere: true };
  try {
    return acorn.parse(text, { ...opts, sourceType: 'module' });
  } catch (moduleErr) {
    try {
      if (Array.isArray(onComment)) onComment.length = 0;
      return acorn.parse(text, { ...opts, sourceType: 'script' });
    } catch {
      throw new Error(`${file}: cannot parse (${moduleErr.message})`);
    }
  }
}

const TYPE_IMPORT = /\bimport\((['"])(\.{1,2}\/[^'"\s]+?)(\?[^'"\s]*)\1\)/g;

/**
 * The import specifiers in `text`: { start, end, value, quote } for each string literal source
 * (start/end span the literal with its quotes), `computed` for each import() whose source is not
 * a plain string, and `typeRefs` for each JSDoc type import (`import('./x.js?v=..')` in a comment)
 * that carries a query: those are never loaded, so they name the bare file.
 */
export function specifiersOf(text, file = '') {
  const out = { literals: [], computed: [], typeRefs: [] };
  if (!MAY_IMPORT.test(text)) return out;
  const comments = [];
  const ast = parse(text, file, comments);
  for (const c of comments) {
    if (!c.value.includes('import(')) continue;
    const at = c.start + 2; // after // or /*
    for (const m of c.value.matchAll(TYPE_IMPORT)) {
      const start = at + m.index + 'import('.length;
      out.typeRefs.push({ start, end: start + m[1].length * 2 + m[2].length + m[3].length, value: m[2] + m[3], quote: m[1], bare: true });
    }
  }
  const take = (node) => {
    if (node && node.type === 'Literal' && typeof node.value === 'string') {
      out.literals.push({ start: node.start, end: node.end, value: node.value, quote: text[node.start] });
    } else if (node && node.type === 'TemplateLiteral' && node.expressions.length === 0) {
      out.literals.push({ start: node.start, end: node.end, value: node.quasis[0].value.cooked, quote: '`' });
    } else if (node) out.computed.push({ start: node.start, end: node.end, text: text.slice(node.start, node.end) });
  };
  for (const node of ast.body) {
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') && node.source) take(node.source);
  }
  if (DYNAMIC.test(text)) {
    const stack = [ast];
    while (stack.length) {
      const node = stack.pop();
      if (node.type === 'ImportExpression') take(node.source);
      for (const k in node) {
        if (k === 'type' || k === 'start' || k === 'end') continue;
        const v = node[k];
        if (v && typeof v === 'object') {
          if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') stack.push(c); } else if (typeof v.type === 'string') stack.push(v);
        }
      }
    }
  }
  out.literals.sort((a, b) => a.start - b.start);
  return out;
}

const splitQuery = (spec) => {
  const q = spec.search(/[?#]/);
  return q < 0 ? { path: spec, query: '' } : { path: spec.slice(0, q), query: spec.slice(q) };
};

/* ------------------------------------------------------------------ */
/* The graph and its keys                                               */
/* ------------------------------------------------------------------ */

/**
 * The module graph of public/ in `root`, read lazily: node(rel) parses one file (relative to
 * public/, posix) and returns { text, deps: [rel...], specs: [...] }.
 */
export function createGraph(root = ROOT) {
  const pub = join(root, 'public');
  const nodes = new Map();
  /** The public/-relative target of a relative specifier written in `fromAbsDir`, or '' when it is not a local module. */
  const target = (fromAbsDir, spec) => {
    if (!/^\.{1,2}\//.test(spec)) return '';
    const abs = resolve(fromAbsDir, splitQuery(spec).path);
    const rel = toPosix(relative(pub, abs));
    if (rel.startsWith('../') || rel === '..' || !KEYED.test(rel) || rel.startsWith('vendor/')) return '';
    return existsSync(abs) ? rel : '';
  };
  const node = (rel) => {
    if (nodes.has(rel)) return nodes.get(rel);
    const text = readFileSync(join(pub, rel), 'utf8');
    const entry = { rel, text, deps: [], specs: [], computed: [] };
    if (CODE.test(rel)) {
      const found = specifiersOf(text, `public/${rel}`);
      const dir = dirname(join(pub, rel));
      for (const s of found.literals) {
        const t = target(dir, s.value);
        if (t) { entry.specs.push({ ...s, target: t }); entry.deps.push(t); }
      }
      for (const c of found.computed) entry.computed.push(c);
      if (found.typeRefs.length) entry.specs = [...entry.specs, ...found.typeRefs].sort((a, b) => a.start - b.start);
    }
    nodes.set(rel, entry);
    return entry;
  };
  return { pub, node, target, nodes };
}

/** `text` with every keyed specifier's query taken out: what a module's own key hashes. */
function normalized(entry) {
  let out = '';
  let at = 0;
  for (const s of entry.specs) {
    out += entry.text.slice(at, s.start) + s.quote + splitQuery(s.value).path + s.quote;
    at = s.end;
  }
  return out + entry.text.slice(at);
}

/**
 * The key of every module reachable from `roots` (public/-relative): a Map rel -> 8 hex.
 * Tarjan's strongly connected components, keyed leaves first.
 */
export function computeKeys(graph, roots) {
  const keys = new Map();
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  let next = 0;
  const finish = (members) => {
    const inside = new Set(members);
    const sorted = [...members].sort();
    const h = createHash('sha256');
    for (const m of sorted) h.update(`M ${m}\0${normalized(graph.node(m))}\0`);
    const outside = [...new Set(sorted.flatMap((m) => graph.node(m).deps).filter((d) => !inside.has(d)))].sort();
    for (const d of outside) h.update(`D ${d} ${keys.get(d)}\0`);
    const group = h.digest('hex');
    for (const m of sorted) keys.set(m, sorted.length === 1 ? group.slice(0, 8) : short(`${group} ${m}`));
  };
  // Iterative Tarjan (the graph is deep: game.js reaches most of public/js).
  for (const root of roots) {
    if (index.has(root)) continue;
    const work = [{ v: root, i: 0 }];
    index.set(root, next); low.set(root, next); next += 1; stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const deps = graph.node(frame.v).deps;
      if (frame.i < deps.length) {
        const w = deps[frame.i++];
        if (!index.has(w)) {
          index.set(w, next); low.set(w, next); next += 1; stack.push(w); onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) low.set(frame.v, Math.min(low.get(frame.v), index.get(w)));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].v;
        low.set(parent, Math.min(low.get(parent), low.get(frame.v)));
      }
      if (low.get(frame.v) === index.get(frame.v)) {
        const members = [];
        let w;
        do { w = stack.pop(); onStack.delete(w); members.push(w); } while (w !== frame.v);
        finish(members);
      }
    }
  }
  return keys;
}

/** The content key of one public/-relative file (its reachable graph only). */
export function keyOf(rel, root = ROOT) {
  const graph = createGraph(root);
  return computeKeys(graph, [rel]).get(rel);
}

/** `rel` with its content key: moduleUrl('js/online-boot.js') -> 'js/online-boot.js?v=1a2b3c4d'. */
export function moduleUrl(rel, root = ROOT) {
  return `${rel}?v=${keyOf(rel, root)}`;
}

/* ------------------------------------------------------------------ */
/* Rewriting                                                            */
/* ------------------------------------------------------------------ */

/** `text` with each spec in `specs` (start/end/value/quote/target) given its key. */
function rewriteSpecs(text, specs, keys) {
  let out = '';
  let at = 0;
  for (const s of specs) {
    const spec = s.bare ? splitQuery(s.value).path : `${splitQuery(s.value).path}?v=${keys.get(s.target)}`;
    out += text.slice(at, s.start) + s.quote + spec + s.quote;
    at = s.end;
  }
  return out + text.slice(at);
}

const ATTR = /(\s(?:src|href|data-game)\s*=\s*)(["'])([^"']*)\2/gi;
const SCRIPT_BLOCK = /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi;

/** The folder a page's relative URLs resolve against (its <base href> when it has one). */
function pageDir(pub, rel, html) {
  const dir = dirname(join(pub, rel));
  const m = /<base\s[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(html);
  return m && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(m[1]) ? resolve(dir, m[1]) : dir;
}

/** A page with its module, script and style sheet keys written (see the header for which). */
function rewritePage(graph, rel, html, keys, need) {
  const base = pageDir(graph.pub, rel, html);
  const attrs = (tag) => {
    const isModuleScript = /^<script\b/i.test(tag) && /\btype\s*=\s*["']?module\b/i.test(tag);
    return tag.replace(ATTR, (all, pre, q, raw) => {
      const value = raw.replace(/&amp;/g, '&');
      const { path, query } = splitQuery(value);
      const isSrc = /^\s*src/i.test(pre);
      if (!/(?:^|[?&])v=/.test(query.slice(1)) && !(isModuleScript && isSrc)) return all;
      if (/^[a-z][a-z0-9+.-]*:|^\/\/|^\//i.test(path)) return all;
      const t = graph.target(base, path.startsWith('.') ? path : `./${path}`);
      if (!t || OWNED_ELSEWHERE.has(t)) return all;
      need.add(t);
      if (!keys) return all;
      return `${pre}${q}${path}?v=${keys.get(t)}${q}`;
    });
  };
  // Tags outside scripts; script open tags; inline module bodies' imports.
  let out = '';
  let at = 0;
  for (const m of html.matchAll(SCRIPT_BLOCK)) {
    out += html.slice(at, m.index).replace(/<[a-z][^>]*>/gi, attrs);
    const [, open, body, close] = m;
    let nextBody = body;
    if (/\btype\s*=\s*["']?module\b/i.test(open) && body.trim()) {
      const found = specifiersOf(body, `public/${rel} (inline module)`);
      const specs = [];
      for (const s of found.literals) {
        const t = graph.target(base, s.value);
        if (t) { specs.push({ ...s, target: t }); need.add(t); }
      }
      if (keys) nextBody = rewriteSpecs(body, specs, keys);
    }
    out += attrs(open) + nextBody + close;
    at = m.index + m[0].length;
  }
  out += html.slice(at).replace(/<[a-z][^>]*>/gi, attrs);
  return out;
}

/** A test or tool file's literal imports into public/. */
function sourceSpecs(graph, absFile, text) {
  const found = specifiersOf(text, toPosix(relative(ROOT, absFile)));
  const dir = dirname(absFile);
  const specs = [];
  for (const s of found.literals) {
    // `?fresh=<name>` (any query without v=): a test's deliberate second instance, left as written.
    const { query } = splitQuery(s.value);
    if (query && !/[?&]v=/.test(query)) continue;
    const t = graph.target(dir, s.value);
    if (t) specs.push({ ...s, target: t });
  }
  return specs;
}

/**
 * Every file whose keys are behind, with its new text: [{ file (root-relative), text }].
 * Also returns the keys and the problems found (computed dynamic imports of local modules).
 */
export function plan(root = ROOT) {
  const graph = createGraph(root);
  const pubFiles = gitList(root, 'public').map((f) => f.slice('public/'.length)).filter((f) => !f.startsWith('vendor/'));
  const modules = pubFiles.filter((f) => CODE.test(f));
  const pages = pubFiles.filter((f) => /\.html?$/i.test(f));
  const problems = [];
  // Pass 1: what the pages and sources need keyed.
  const need = new Set(modules);
  const pageText = new Map();
  for (const rel of pages) {
    const html = readFileSync(join(graph.pub, rel), 'utf8');
    if (!/\.(?:m?js|css)\b/.test(html)) continue;
    pageText.set(rel, html);
    rewritePage(graph, rel, html, null, need);
  }
  const sources = [
    ...gitList(root, 'tests').filter((f) => CODE.test(f)),
    ...gitList(root, 'tools').filter((f) => CODE.test(f) && !f.startsWith('tools/module-keys/')),
  ];
  const sourceSpecsFor = new Map();
  for (const f of sources) {
    const text = readFileSync(join(root, f), 'utf8');
    if (!/\.m?js/.test(text)) continue;
    let specs;
    try {
      specs = sourceSpecs(graph, join(root, f), text);
    } catch {
      continue; // a fixture or template that is not plain JavaScript is left alone
    }
    if (specs.length) { sourceSpecsFor.set(f, { text, specs }); for (const s of specs) need.add(s.target); }
  }
  const keys = computeKeys(graph, [...need].sort());
  for (const [rel, entry] of graph.nodes) {
    for (const c of entry.computed) {
      if (/^`(?:\.{1,2}\/|\$\{)/.test(c.text) || /\?v=/.test(c.text)) problems.push(`public/${rel}: import(${c.text}) is computed; write the module URL out so it can be keyed`);
    }
  }
  // Pass 2: the new texts.
  const stale = [];
  for (const rel of modules) {
    const entry = graph.node(rel);
    if (!entry.specs.length) continue;
    const next = rewriteSpecs(entry.text, entry.specs, keys);
    if (next !== entry.text) stale.push({ file: `public/${rel}`, text: next });
  }
  for (const [rel, html] of pageText) {
    const next = rewritePage(graph, rel, html, keys, new Set());
    if (next !== html) stale.push({ file: `public/${rel}`, text: next });
  }
  for (const [f, { text, specs }] of sourceSpecsFor) {
    const next = rewriteSpecs(text, specs, keys);
    if (next !== text) stale.push({ file: f, text: next });
  }
  return { stale, keys, problems, counts: { modules: modules.length, keyed: keys.size, pages: pageText.size, sources: sourceSpecsFor.size } };
}

const KEY_IN_TEXT = /\?v=[0-9a-f]{8}/g;
const CONFLICT = /^<{7}[^\n]*\n([\s\S]*?)(?:^\|{7}[^\n]*\n[\s\S]*?)?^={7}\n([\s\S]*?)^>{7}[^\n]*\n/gm;

/**
 * `text` with each conflict block whose sides differ only in content keys replaced by one side (the
 * builder rewrites the keys next); `left` counts the blocks that differ in anything else.
 */
export function resolveKeyConflicts(text) {
  let left = 0;
  let settled = 0;
  const out = text.replace(CONFLICT, (all, ours, theirs) => {
    if (ours.replace(KEY_IN_TEXT, '?v=') !== theirs.replace(KEY_IN_TEXT, '?v=')) { left += 1; return all; }
    settled += 1;
    return ours;
  });
  return { text: out, settled, left };
}

function resolveConflicts(root) {
  const files = git(root, ['diff', '--name-only', '--diff-filter=U', '-z']).split('\0').filter(Boolean);
  let settledFiles = 0;
  const open = [];
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8');
    const r = resolveKeyConflicts(text);
    if (r.settled) writeFileSync(join(root, f), r.text);
    if (r.left) open.push(`${f} (${r.left} conflict${r.left === 1 ? '' : 's'} beyond keys)`);
    else if (r.settled) settledFiles += 1;
  }
  console.log(`module keys: ${settledFiles} conflicted file${settledFiles === 1 ? '' : 's'} settled (git add them)${open.length ? `; still open: ${open.join(', ')}` : ''}`);
  return open.length;
}

function main(argv) {
  if (argv.includes('--resolve')) {
    const open = resolveConflicts(ROOT);
    if (open) process.exit(1);
  }
  const check = argv.includes('--check');
  const t0 = Date.now();
  const { stale, problems, counts } = plan(ROOT);
  const ms = Date.now() - t0;
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  if (check) {
    if (stale.length) {
      console.error(`${stale.length} file${stale.length === 1 ? '' : 's'} with old module keys (${stale.slice(0, 8).map((s) => s.file).join(', ')}${stale.length > 8 ? ', ...' : ''})\nrun node tools/module-keys/build.mjs (never edit a ?v= by hand)`);
      process.exit(1);
    }
    console.log(`module keys are current (${counts.keyed} files keyed, ${counts.pages} pages, ${counts.sources} test/tool files, ${ms} ms)`);
    return;
  }
  for (const s of stale) writeFileSync(join(ROOT, s.file), s.text);
  console.log(`module keys: ${counts.keyed} files keyed; ${stale.length} file${stale.length === 1 ? '' : 's'} rewritten (${ms} ms)`);
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

