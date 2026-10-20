import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), '../public');
const readJson = (rel) => JSON.parse(readFileSync(join(publicRoot, rel), 'utf8'));
const catalog = readJson('assets/content/achievements.json');
const official = readJson('assets/content/badge-icons.json');
const generated = readJson('assets/content/badge-icons-generated.json');

function pngSize(rel) {
  const png = readFileSync(join(publicRoot, rel));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${rel} is a PNG`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('badge art coverage', () => {
  it('resolves every catalog row to an existing square PNG', () => {
    const ids = Object.keys(catalog);
    assert.equal(ids.length, 663);
    const small = [];
    for (const id of ids) {
      const rel = official[id] || generated[id]?.path;
      assert.ok(rel, `${id} has art`);
      assert.ok(existsSync(join(publicRoot, rel)), `${id} file ${rel}`);
      const [w, h] = pngSize(rel);
      assert.equal(w, h, `${id} is square`);
      if (generated[id] && !official[id]) assert.equal(w, 180, `${id} generated at 180px`);
      else assert.ok([60, 180].includes(w), `${id} official source size`);
      if (w !== 180) small.push(id);
    }
    // Wayback only captured the 60px file for these Ascended levels; official
    // art still beats a redraw, so they ship at their source size.
    assert.deepEqual(small.sort(), [
      'ascended_level101',
      'ascended_level31',
      'ascended_level41',
      'ascended_level61',
      'ascended_level83',
    ]);
  });

  it('prefers official archived art and only generates the rows the archive lost', () => {
    assert.ok(Object.keys(official).length >= 600, 'most of the catalog is official art');
    for (const [id, entry] of Object.entries(generated)) {
      assert.ok(catalog[id], `${id} is a catalog row`);
      assert.equal(official[id], undefined, `${id} has official art, so must not be generated`);
      assert.equal(entry.generated, true);
      assert.equal(entry.path, `assets/badges/${id}.png`);
      assert.ok(entry.subject, `${id} records its subject`);
    }
    for (const [id, rel] of Object.entries(official)) {
      assert.ok(catalog[id], `${id} is a catalog row`);
      assert.equal(rel, `assets/badges/${id}.png`);
    }
  });

  it('checks official before generated art in the client and marks reimagined cards', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function badgeArtFor'), game.indexOf('function badgeIconFor'));
    assert.ok(fn.indexOf('badgeIconMap[classTsid]') < fn.indexOf('badgeGeneratedMap[classTsid]'));
    assert.match(game, /badge-icons-generated\.json\?v=catalog-art-3/);
    const panel = game.slice(game.indexOf('function renderAchievePanel'), game.indexOf('function openAchievePanel'));
    assert.match(panel, /badgeArtFor\(tsid\)/);
    assert.match(panel, /icon\.loading = 'lazy'/);
    assert.match(panel, /'reimagined'/);
    assert.match(panel, /Reimagined badge art/);
    assert.match(readFileSync(join(publicRoot, 'style.css'), 'utf8'), /\.badge-reimagined/);
  });
});
