/**
 * Release gate for cache keys (v0.2.1, 2026-10-28): a module that differs from the last release tag
 * must be imported under one ?v= key in every importer, never without a key and never under a key it
 * already had at that tag. A browser that played the last release holds that release's files under
 * the old URLs, so an unkeyed import of a changed module (quest-offers.js, live after v0.2.0) mixed
 * new and old modules and stopped the game at "does not provide an export named 'COLD_COMFORT'".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { specifiersOf } from '../tools/module-keys/build.mjs';

const root = join(import.meta.dirname, '..');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const IMPORT = /(?:from\s*|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"?]+?\.js)(\?v=[^'"]*)?\1/g;
/** [path, query] of each import: real imports in JS (not JSDoc import() types), the regex in pages. */
function importsOf(text, f) {
  if (/\.html$/.test(f)) return [...text.matchAll(IMPORT)].map((m) => [m[2], m[3] || '']);
  try {
    return specifiersOf(text, f).literals.map((s) => /^(\.{1,2}\/[^'"?]+?\.js)(\?v=[^'"]*)?$/.exec(s.value)).filter(Boolean).map((m) => [m[1], m[2] || '']);
  } catch {
    return [...text.matchAll(IMPORT)].map((m) => [m[2], m[3] || '']);
  }
}
const pageFile = (f) => f.startsWith('public/') && /\.(m?js|html)$/.test(f) && !f.startsWith('public/restoration/') && !f.includes('/items/');

let tag = '';
try { tag = git('describe', '--tags', '--abbrev=0', 'HEAD').trim(); } catch { tag = ''; }

describe('cache keys against the last release', { skip: !tag && 'no release tag' }, () => {
  it(`every module changed since ${tag} has one fresh key in every importer`, () => {
    const files = git('ls-files', 'public').split('\n').filter(pageFile);
    const uses = new Map();
    for (const f of files) {
      const text = readFileSync(join(root, f), 'utf8');
      for (const [spec, query] of importsOf(text, f)) {
        const target = normalize(join(dirname(f), spec));
        if (!uses.has(target)) uses.set(target, new Map());
        uses.get(target).set(query, f);
      }
    }
    // Keys each module was imported under at the tag.
    const old = new Map();
    const tagFiles = git('ls-tree', '-r', '--name-only', tag, 'public').split('\n').filter(pageFile);
    for (const f of tagFiles) {
      let text = '';
      try { text = git('show', `${tag}:${f}`); } catch { continue; }
      for (const [spec, query] of importsOf(text, f)) {
        const target = normalize(join(dirname(f), spec));
        if (!old.has(target)) old.set(target, new Set());
        old.get(target).add(query);
      }
    }
    const changed = new Set(git('diff', '--name-only', tag, '--', 'public').split('\n').filter(Boolean).map(normalize));
    const problems = [];
    for (const [target, keys] of uses) {
      if (!changed.has(target) || !existsSync(join(root, target))) continue;
      const list = [...keys.keys()];
      if (list.includes('')) problems.push(`${target}: imported with no key by ${keys.get('')}`);
      if (list.length > 1) problems.push(`${target}: imported under ${list.map((k) => k || '(none)').join(', ')}`);
      for (const k of list) if (k && old.get(target)?.has(k)) problems.push(`${target}: key ${k} was already used at ${tag}`);
    }
    assert.deepEqual(problems, []);
  });
});
