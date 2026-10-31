#!/usr/bin/env node
/**
 * The build id of a built game (Update ready, 2026-10-31): open clients learn a new version is out
 * and offer to save and reload (js/update-check.js, js/features/update-ready-feature.js), instead of
 * a message to everyone before a deploy.
 *
 * The id is the first 12 hex of the sha256 of the two play pages (play/index.html and
 * play/online/index.html) as built. Every ?v= content key the game loads is in their text (game.js's
 * Merkle key over every module, data-versions.js's key over every data and art file, the style
 * sheets, online-boot.js, tools/module-keys and tools/data-versions write them), so a change to any
 * code, data, art or style the game loads, or to the pages themselves, is a new id, and a rebuild
 * with nothing changed keeps it. A local sync of changed code counts as a new build too.
 *
 * Written into the built copy only, never the repo (like tools/deploy/fathom.mjs and social.mjs):
 * - each play page gets <meta name="groddle-build" content="<id>">, so the loaded page knows its own;
 * - play/build.json is { "build": "<id>", "version": "<release>" }, the file clients fetch
 *   (uncached, with a ?t= buster, so neither the browser nor Kinsta's CDN hands back an old one).
 * Run it last, after everything else that writes into the pages (site-nav, Fathom, social tags):
 * tools/deploy/kinsta.sh before the upload, and the local sync-to-cove.sh after the site menu.
 *
 *   node tools/deploy/build-id.mjs <built public/ dir> [--version=<tag>]
 *
 * --version defaults to `git describe --tags --always` of this repo (the tag itself at a release).
 * Idempotent: a stamped page is read without its stamp, so a second run writes the same id.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The pages that run the game (solo and multiplayer), relative to the built public/ folder. */
export const PLAY_PAGES = Object.freeze(['play/index.html', 'play/online/index.html']);
/** The file clients fetch to learn the newest build. */
export const BUILD_FILE = 'play/build.json';
export const META_NAME = 'groddle-build';

const META_LINE = /^[ \t]*<meta name="groddle-build" content="[^"]*" \/>\r?\n/m;

/** A page as built, without its stamp. */
export function unstamp(html) {
  return String(html).replace(META_LINE, '');
}

/** The build id of these page texts (stamped or not). */
export function buildIdOf(pages) {
  const h = createHash('sha256');
  for (const html of pages) h.update(unstamp(html)).update('\0');
  return h.digest('hex').slice(0, 12);
}

/** The page with its stamp: the meta right after <meta charset>, or first in <head>. Null when it has no head. */
export function stamp(html, id) {
  const text = unstamp(html);
  const line = `  <meta name="${META_NAME}" content="${id}" />\n`;
  const charset = /<meta charset="[^"]*"\s*\/?>[ \t]*\r?\n/i.exec(text);
  if (charset) {
    const at = charset.index + charset[0].length;
    return text.slice(0, at) + line + text.slice(at);
  }
  const head = /<head[^>]*>[ \t]*\r?\n?/i.exec(text);
  if (!head) return null;
  const at = head.index + head[0].length;
  return text.slice(0, at) + line + text.slice(at);
}

/** The id a stamped page carries ('' when it has none). */
export function pageBuildId(html) {
  return /<meta name="groddle-build" content="([^"]*)"/.exec(String(html))?.[1] || '';
}

/** The release this repo is at: the tag at a release, else tag-count-hash (or a short hash). */
export function gitVersion(root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')) {
  try {
    return execFileSync('git', ['describe', '--tags', '--always'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/**
 * Stamps the built game in `dir`: both play pages and play/build.json. Returns { build, version }.
 * Throws when a play page is missing or has no head.
 */
export function stampBuild(dir, { version = gitVersion() } = {}) {
  const texts = PLAY_PAGES.map((p) => {
    const file = join(dir, p);
    if (!existsSync(file)) throw new Error(`${file} is missing: is ${dir} a built game?`);
    return readFileSync(file, 'utf8');
  });
  const build = buildIdOf(texts);
  PLAY_PAGES.forEach((p, i) => {
    const next = stamp(texts[i], build);
    if (next === null) throw new Error(`${p} has no <head> to stamp`);
    if (next !== texts[i]) writeFileSync(join(dir, p), next);
  });
  const body = { build, version: String(version || '') };
  writeFileSync(join(dir, BUILD_FILE), `${JSON.stringify(body)}\n`);
  return body;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const v = args.find((a) => a.startsWith('--version='));
  if (!dir) {
    console.error('usage: node tools/deploy/build-id.mjs <built public/ dir> [--version=<tag>]');
    process.exit(2);
  }
  try {
    const out = stampBuild(dir, v ? { version: v.slice('--version='.length) } : {});
    console.log(`build id: ${out.build}${out.version ? ` (${out.version})` : ''}`);
  } catch (err) {
    console.error(`build id: ${err.message}`);
    process.exit(1);
  }
}
