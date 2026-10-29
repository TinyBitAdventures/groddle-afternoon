#!/usr/bin/env node
/**
 * Writes public/js/data-versions.js, the content keys js/data-urls.js puts on
 * every data and art URL the game fetches at runtime (`?v=<key>`), and the
 * map's own key in every page that loads it (`js/data-versions.js?v=<key>`).
 *
 * The map is a delta against an epoch commit: a file under public/ whose
 * extension is in EXT and that is added or changed since the epoch (tracked
 * or not yet tracked) gets the first 8 hex of its sha256; every other such
 * file gets the epoch's key (its first 8 hex). So a change, or a new file, gets
 * a URL no browser or CDN has seen, an unchanged file keeps its URL from
 * release to release, and only git and the changed files are read (the 1,460
 * street JSON files and the art cost a `git diff`, not a hash each).
 * `--epoch=<commit>` starts a new epoch: every URL changes once, and the map
 * is empty again (worth it when it has grown into the thousands).
 *
 * Files built at deploy (BUILT: the restoration report and the Code page
 * data) change on every build, so the committed map leaves them out (they
 * take the epoch key; their pages fetch with cache: 'no-cache'), and
 * tools/deploy/kinsta.sh runs this with --built after building them.
 *
 * Anything that writes under public/ (street builders, build-restoration,
 * art pipelines) leaves the map stale until this is rerun: --check, which
 * tests/data-versions.test.js runs, fails and names the files.
 *
 * The same keys go into the files a browser reads without the hook
 * (2026-10-29): every HTML and CSS file under public/ (not vendor/) gets
 * `?v=<key>` on each data or art URL in its markup (src, srcset, href,
 * poster, style="" and <style> url()) and its url() rules, resolved against
 * the page's <base> or the style sheet's folder (keyAssetUrls). Inline
 * scripts are left alone (the hook keys what they set). The page builders
 * (tools/catalog, tools/changelog, tools/play-online) key their own output
 * with the committed map (committedMap), so their --check agrees; this
 * rewrites every file that is behind, and --check names them.
 *
 *   node tools/data-versions/build.mjs                 write the map, the pages' keys and the HTML/CSS asset keys
 *   node tools/data-versions/build.mjs --check         exit 1 when any of them is stale
 *   node tools/data-versions/build.mjs --built         deploy: also key the BUILT files
 *   node tools/data-versions/build.mjs --epoch=HEAD    start a new epoch at a commit
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MAP_PATH = 'public/js/data-versions.js';

/** Versioned extensions (keep in step with public/js/data-urls.js EXT). */
export const EXT = /\.(?:json|png|webp|jpe?g|gif|svg|mp3|ogg|wav|m4a|atlas|xml)$/i;

/** Built by tools/deploy/kinsta.sh (and the lead's build-restoration run), so only keyed with --built. */
export const BUILT = ['restoration/data.json', 'restoration/history.json', 'codebase/data.json'];

/** The page tag's key: `data-versions.js?v=<8 hex>`. */
export const PAGE_KEY = /(data-versions\.js\?v=)[0-9a-f]{8}/g;

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const list = (out) => out.split('\0').filter(Boolean);
export const shortHash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

/** The epoch commit the map in `root` was built against ('' when there is none). */
export function currentEpoch(root = ROOT) {
  try {
    const m = /epoch commit ([0-9a-f]{40})/.exec(readFileSync(join(root, MAP_PATH), 'utf8'));
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/**
 * The map for the tree in `root`.
 * @param {{ root?: string, epoch?: string, built?: boolean }} [opts]
 * @returns {{ epoch: string, files: Record<string, string>, source: string, key: string }}
 */
export function buildDataVersions({ root = ROOT, epoch = currentEpoch(root), built = false } = {}) {
  if (!epoch) throw new Error(`${MAP_PATH} names no epoch commit: run node tools/data-versions/build.mjs --epoch=HEAD`);
  let commit;
  try {
    commit = git(root, ['rev-parse', '--verify', '--quiet', `${epoch}^{commit}`]).trim();
  } catch {
    throw new Error(`epoch commit ${epoch} is not in this clone (a shallow clone, or rewritten history): run node tools/data-versions/build.mjs --epoch=HEAD`);
  }
  const changed = new Set([
    ...list(git(root, ['diff', '--name-only', '--no-renames', '--diff-filter=AMT', '-z', commit, '--', 'public'])),
    ...list(git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', 'public'])),
  ]);
  const files = {};
  const take = (rel) => {
    const file = join(root, 'public', rel);
    if (existsSync(file)) files[rel] = shortHash(readFileSync(file));
  };
  for (const f of changed) {
    const rel = f.slice('public/'.length);
    if (!EXT.test(rel) || BUILT.includes(rel)) continue;
    take(rel);
  }
  if (built) for (const rel of BUILT) take(rel);
  const sorted = Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]]));
  const source = render(commit, sorted, built);
  return { epoch: commit, files: sorted, source, key: shortHash(source) };
}

function render(commit, files, built) {
  const rows = Object.entries(files).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return [
    '// Generated by tools/data-versions/build.mjs: never edit by hand, rerun it after changing anything under public/.',
    `// Content keys for js/data-urls.js against epoch commit ${commit}${built ? ' (deploy build, with the BUILT files)' : ''}:`,
    '// a data or art file listed here is fetched as <path>?v=<its key>, every other one as <path>?v=<epoch>.',
    '(function (g) {',
    "  var s = g.document && g.document.currentScript;",
    '  g.GRODDLE_DATA_VERSIONS = {',
    "    root: s && s.src ? new URL('../', s.src).href : '',",
    `    epoch: '${commit.slice(0, 8)}',`,
    rows.length ? '    files: {' : '    files: {},',
    ...(rows.length ? [...rows.map((r) => `  ${r}`), '    },'] : []),
    '  };',
    "})(typeof globalThis !== 'undefined' ? globalThis : this);",
    '',
  ].join('\n');
}

/** The key pages load the committed map under (the hash of public/js/data-versions.js as it is). */
export function mapKey(root = ROOT) {
  try {
    return shortHash(readFileSync(join(root, MAP_PATH)));
  } catch {
    return '00000000';
  }
}

/** The js/data-urls.js key (bump it when that file changes). */
export const HOOK_SRC = 'js/data-urls.js?v=g434-1';

/* ------------------------------------------------------------------ */
/* Keys written into HTML and CSS                                        */
/* ------------------------------------------------------------------ */

/** The key of a path relative to public/ (`map.files[path]`, else the epoch's for a versioned extension, else ''). */
export function keyOf(map, path) {
  const own = Object.prototype.hasOwnProperty.call(map.files, path) ? map.files[path] : '';
  return own || (EXT.test(path) ? String(map.epoch).slice(0, 8) : '');
}

/** `url` with its `v` parameter set to `key`, the other parameters and the hash kept (js/data-urls.js withKey). */
function withKey(url, key) {
  const hashAt = url.indexOf('#');
  const hash = hashAt < 0 ? '' : url.slice(hashAt);
  const rest = hashAt < 0 ? url : url.slice(0, hashAt);
  const q = rest.indexOf('?');
  if (q < 0) return `${rest}?v=${key}${hash}`;
  const params = rest.slice(q + 1).split('&').filter((p) => p && !/^v(?:=|$)/.test(p));
  return `${rest.slice(0, q)}?${['v=' + key, ...params].join('&')}${hash}`;
}

const ORIGIN = 'https://groddle.invalid/';
/** Other schemes, protocol-relative and fragment URLs, and template text, which are never files of the game. */
const NOT_A_FILE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)|\$\{|\{\{|[<>\s]/i;

/**
 * The keyed form of one URL written in a file, resolved against `base` (a folder URL under ORIGIN):
 * unchanged when it is not a versioned file of the game.
 */
export function keyAssetUrl(url, base, map) {
  if (!url || NOT_A_FILE.test(url)) return url;
  let abs;
  try {
    abs = new URL(url, base);
  } catch {
    return url;
  }
  if (abs.origin !== new URL(ORIGIN).origin) return url;
  let path;
  try {
    path = decodeURIComponent(abs.pathname.slice(1));
  } catch {
    return url;
  }
  const key = keyOf(map, path);
  return key ? withKey(url, key) : url;
}

const CSS_URL = /(url\(\s*)(&quot;|&#39;|["']?)([^"'()\s]*?)\2(\s*\))/gi;
/** CSS text with each url(...) keyed (quoted, unquoted, or with &quot; quotes inside an HTML attribute). */
export function keyCss(css, base, map) {
  return css.replace(CSS_URL, (all, open, q, value, close) => {
    if (!value) return all;
    const entity = q.startsWith('&');
    const raw = entity ? value.replace(/&amp;/g, '&') : value;
    const next = keyAssetUrl(raw, base, map);
    return next === raw ? all : open + q + (entity ? next.replace(/&/g, '&amp;') : next) + q + close;
  });
}

const URL_ATTR = /(\s(src|href|poster|data-src|xlink:href|srcset|style)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;
/** HTML with every data or art URL in its attributes and <style> blocks keyed; <script> bodies are left as they are. */
export function keyHtml(html, base, map) {
  const pageBase = (() => {
    const m = /<base\s[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(html);
    try {
      return m ? new URL(m[1].replace(/&amp;/g, '&'), base).href : base;
    } catch {
      return base;
    }
  })();
  const attrs = (text) => text.replace(URL_ATTR, (all, pre, name, dq, sq) => {
    const value = dq ?? sq;
    const q = dq != null ? '"' : "'";
    const lower = name.toLowerCase();
    let next;
    if (lower === 'style') next = keyCss(value, pageBase, map);
    else if (lower === 'srcset') {
      next = value.split(',').map((part) => {
        const m = /^(\s*)(\S+)(.*)$/s.exec(part);
        if (!m) return part;
        const raw = m[2].replace(/&amp;/g, '&');
        const keyed = keyAssetUrl(raw, pageBase, map);
        return keyed === raw ? part : m[1] + keyed.replace(/&/g, '&amp;') + m[3];
      }).join(',');
    } else {
      const raw = value.replace(/&amp;/g, '&');
      const keyed = keyAssetUrl(raw, pageBase, map);
      next = keyed === raw ? value : keyed.replace(/&/g, '&amp;');
    }
    return next === value ? all : pre + q + next + q;
  });
  // Script bodies pass through; <style> bodies are CSS; the rest is markup.
  return html.split(/(<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>)/i).map((part, i) => {
    if (i % 2 === 0) return attrs(part);
    if (/^<script/i.test(part)) {
      const open = /^<script\b[^>]*>/i.exec(part)[0];
      return attrs(open) + part.slice(open.length);
    }
    const open = /^<style\b[^>]*>/i.exec(part)[0];
    return open + keyCss(part.slice(open.length), pageBase, map);
  }).join('');
}

/** `text` of the file at `rel` (relative to public/, .html or .css) with its asset URLs keyed from `map`. */
export function keyAssetUrls(text, rel, map) {
  const base = new URL(rel.replace(/[^/]*$/, ''), ORIGIN).href;
  if (/\.css$/i.test(rel)) return keyCss(text, base, map);
  if (/\.html?$/i.test(rel)) return keyHtml(text, base, map);
  return text;
}

/** The map as committed in `root` (public/js/data-versions.js): what the page builders key their output with. */
export function committedMap(root = ROOT) {
  let source = '';
  try {
    source = readFileSync(join(root, MAP_PATH), 'utf8');
  } catch {
    return { epoch: '', files: {} };
  }
  return { epoch: /epoch: '([0-9a-f]{8})'/.exec(source)?.[1] || '', files: parseFiles(source) };
}

/** Every HTML and CSS file under public/ the browser reads as written (tracked or new; not vendor/). */
export function keyedFiles(root = ROOT) {
  return [
    ...list(git(root, ['ls-files', '-z', '--', 'public'])),
    ...list(git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', 'public'])),
  ].filter((f) => /\.(?:html?|css)$/i.test(f) && !f.startsWith('public/vendor/') && existsSync(join(root, f)));
}

/** Files whose asset keys differ from `map`, with their text rewritten. */
export function staleAssetFiles(root, map) {
  if (!map.epoch) return [];
  const stale = [];
  for (const f of keyedFiles(root)) {
    const text = readFileSync(join(root, f), 'utf8');
    const next = keyAssetUrls(text, f.slice('public/'.length), map);
    if (next !== text) stale.push({ file: f, text: next });
  }
  return stale;
}

/**
 * The two script tags a page that runs scripts loads first, for page builders (tools/catalog/build.mjs):
 * `prefix` is the page's way back to the game root ('', '../').
 */
export function mapTags(prefix = '', root = ROOT) {
  return [
    '  <!-- Content keys for data and art URLs (js/data-urls.js): before every other script. -->',
    `  <script src="${prefix}js/data-versions.js?v=${mapKey(root)}"></script>`,
    `  <script src="${prefix}${HOOK_SRC}"></script>`,
    '',
  ].join('\n');
}

/** Every page under public/ that loads the map (tracked or new). */
export function mapPages(root = ROOT) {
  const out = [
    ...list(git(root, ['ls-files', '-z', '--', 'public'])),
    ...list(git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', 'public'])),
  ].filter((f) => f.endsWith('.html') && existsSync(join(root, f)));
  return out.filter((f) => readFileSync(join(root, f), 'utf8').includes('data-versions.js?v='));
}

/** Pages whose map key differs from `key`, with their text rewritten. */
export function stalePages(root, key) {
  const stale = [];
  for (const f of mapPages(root)) {
    const text = readFileSync(join(root, f), 'utf8');
    const next = text.replace(PAGE_KEY, (m, a) => `${a}${key}`);
    if (next !== text) stale.push({ file: f, text: next });
  }
  return stale;
}

function main(argv) {
  const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const check = argv.includes('--check');
  const built = argv.includes('--built');
  const epochArg = arg('epoch');
  const root = ROOT;
  const map = buildDataVersions({ root, built, ...(epochArg ? { epoch: epochArg } : {}) });
  const target = join(root, MAP_PATH);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const pages = stalePages(root, map.key);
  const count = Object.keys(map.files).length;
  const assetMap = { epoch: map.epoch, files: map.files };
  if (check) {
    const problems = [];
    if (current !== map.source) {
      const old = parseFiles(current);
      const names = new Set([...Object.keys(old), ...Object.keys(map.files)]);
      const diff = [...names].filter((n) => old[n] !== map.files[n]).sort();
      problems.push(`${MAP_PATH} is stale${diff.length ? ` (${diff.length} file${diff.length === 1 ? '' : 's'}: ${diff.slice(0, 8).join(', ')}${diff.length > 8 ? ', ...' : ''})` : ''}`);
    }
    for (const p of pages) problems.push(`${p.file} loads an old js/data-versions.js key`);
    const assets = staleAssetFiles(root, assetMap);
    if (assets.length) problems.push(`${assets.length} HTML/CSS file${assets.length === 1 ? '' : 's'} with unkeyed or old asset URLs (${assets.slice(0, 8).map((a) => a.file).join(', ')}${assets.length > 8 ? ', ...' : ''})`);
    if (problems.length) {
      console.error(`${problems.join('\n')}\nrun node tools/data-versions/build.mjs`);
      process.exit(1);
    }
    console.log(`${MAP_PATH} is current (${count} files keyed against epoch ${map.epoch.slice(0, 8)})`);
    return;
  }
  if (current !== map.source) writeFileSync(target, map.source);
  for (const p of pages) writeFileSync(join(root, p.file), p.text);
  // After the map key: a page's text is keyed as it now stands.
  const assets = staleAssetFiles(root, assetMap);
  for (const a of assets) writeFileSync(join(root, a.file), a.text);
  console.log(`${MAP_PATH}: ${count} files keyed against epoch ${map.epoch.slice(0, 8)}${built ? ' with the deploy builds' : ''}; key ${map.key} in ${mapPages(root).length} pages (${pages.length} updated); asset URLs keyed in ${assets.length} HTML/CSS files`);
  if (count > 2000) console.log('the map is large: start a new epoch at a release (--epoch=HEAD)');
}

/** The `files` rows of a map's source. */
export function parseFiles(source) {
  const out = {};
  for (const m of String(source).matchAll(/^\s+("(?:[^"\\]|\\.)*"): "([0-9a-f]{8})",$/gm)) out[JSON.parse(m[1])] = m[2];
  return out;
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
