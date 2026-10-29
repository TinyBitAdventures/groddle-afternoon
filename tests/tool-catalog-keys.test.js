/**
 * Node keeps one module instance per URL, so a tool that loads the content catalogs through
 * `content-catalogs.js` with a different `?v=` key than the game's modules fills a second copy that
 * skill-tree.js and friends never read. tools/build-restoration.mjs did that from the v0.2.1 cache-key
 * hotfix on (the restoration page's "Skills that work" read 0 / 0) and tools/inventory/build.mjs
 * counted 99 working skills as missing. Every tool import of the catalogs uses the game's key.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('tools load the content catalogs into the copy the game modules read', () => {
  const gameKeys = new Set();
  for (const f of walk(join(root, 'public/js')).concat([join(root, 'public/game.js'), join(root, 'public/content.js')])) {
    for (const m of readFileSync(f, 'utf8').matchAll(/content-catalogs\.js\?v=([\w-]+)/g)) gameKeys.add(m[1]);
  }

  it('the game imports the catalogs under one key', () => {
    assert.equal(gameKeys.size, 1, [...gameKeys].join(', '));
  });

  it('every tool that loads them uses that key', () => {
    const [key] = [...gameKeys];
    const wrong = [];
    for (const f of walk(join(root, 'tools'))) {
      const src = readFileSync(f, 'utf8');
      if (!/content-catalogs\.js/.test(src)) continue;
      for (const line of src.split('\n').filter((l) => /content-catalogs\.js/.test(l) && /import/.test(l))) {
        // A literal specifier, or a URL built from the path with the key appended.
        if (!line.includes(`content-catalogs.js?v=${key}`) && !line.includes(`?v=${key}`)) wrong.push(`${f.slice(root.length + 1)}: ${line.trim()}`);
      }
    }
    assert.deepEqual(wrong, []);
  });
});
