// G300: a browser (and node) loads one module instance per specifier, so
// `./tools.js` and two keyed forms of it were two copies of js/tools.js.
// Since tools/module-keys/build.mjs (2026-10-30) every import carries the
// module's content key, so no module is split; the ratchet stays at none.
// The scan reads real imports (specifiersOf), not JSDoc import() types.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { specifiersOf } from '../tools/module-keys/build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../public');

function jsFiles(dir, skip = /node_modules|assets/) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!skip.test(f)) out.push(...jsFiles(p, skip));
    } else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

/** target module (relative to public/) -> Map(query string -> import count). */
function specifierForms(files) {
  const forms = new Map();
  for (const f of files) {
    let found;
    try {
      found = specifiersOf(readFileSync(f, 'utf8'), f).literals;
    } catch {
      continue; // a fixture that is not JavaScript
    }
    for (const s of found) {
      const m = /^(\.{1,2}\/[^?#]+?\.js)(\?[^#]*)?$/.exec(s.value);
      if (!m) continue;
      const target = relative(pub, resolve(dirname(f), m[1]));
      if (!forms.has(target)) forms.set(target, new Map());
      const q = forms.get(target);
      q.set(m[2] || '', (q.get(m[2] || '') || 0) + 1);
    }
  }
  return forms;
}

describe('module instances', () => {
  it('js/tools.js is imported under one specifier, in the game and in the tests', () => {
    const forms = specifierForms([...jsFiles(pub), ...jsFiles(here)]);
    const tools = forms.get('js/tools.js');
    assert.ok(tools, 'js/tools.js has importers');
    // One specifier: its content key (tools/module-keys).
    assert.equal(tools.size, 1, [...tools.keys()].join(', '));
    assert.match([...tools.keys()][0], /^\?v=[0-9a-f]{8}$/);
  });

  it('no new module is split across specifiers in public/ (ratchet)', () => {
    const split = [...specifierForms(jsFiles(pub))].filter(([, q]) => q.size > 1).map(([t]) => t).sort();
    // The 16 splits left from before G300 were closed by the content keys (2026-10-30).
    assert.deepEqual(split, []);
  });
});
