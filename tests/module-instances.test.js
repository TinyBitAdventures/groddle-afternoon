// G300: a browser (and node) loads one module instance per specifier, so
// `./tools.js` and `./tools.js?v=woodcutting-test-3` were two copies of
// js/tools.js. Every importer, in the game and in the tests, now uses the
// keyed form. The ratchet lists the other modules still imported under more
// than one specifier in public/ (a follow-up row); new splits fail here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const re = /(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+?\.js)(\?[^'"]*)?['"]/g;
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(re)) {
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
    assert.deepEqual([...tools.keys()], ['?v=woodcutting-test-3']);
  });

  it('no new module is split across specifiers in public/ (ratchet)', () => {
    const split = [...specifierForms(jsFiles(pub))].filter(([, q]) => q.size > 1).map(([t]) => t).sort();
    // Left from before G300 (follow-up row): which of these keep module state decides how much it matters.
    const known = [
      'js/animal-crowding.js', 'js/game-day.js', 'js/garden.js', 'js/hi-signs.js', 'js/inventory.js',
      'js/mailbox.js', 'js/mining.js', 'js/musicblocks.js', 'js/newxp.js', 'js/note-view.js',
      'js/paradise-flight.js', 'js/progression.js', 'js/quest-rooms/puzzle-kit.js', 'js/quoins.js',
      'js/shrines.js', 'js/store-catalog.js',
    ];
    assert.deepEqual(split.filter((t) => !known.includes(t)), []);
  });
});
