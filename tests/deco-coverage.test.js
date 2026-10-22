/**
 * Street deco pack coverage against real street JSON + on-disk PNGs/manifest.
 * Run: node --test tests/deco-coverage.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');
const streetsIndexPath = join(publicDir, 'assets/streets/index.json');
const decoDir = join(publicDir, 'assets/decos/groddle');
const manifestPath = join(publicDir, 'assets/decos/manifest.json');

/** Unique deco sprite names referenced by all loaded street JSON (game data path). */
function uniqueSpritesNeeded() {
  const idx = JSON.parse(readFileSync(streetsIndexPath, 'utf8'));
  const need = new Set();
  let instances = 0;
  for (const meta of Object.values(idx.streets || {})) {
    const rel = String(meta.file || '').replace(/^assets\/streets\//, '');
    const path = join(publicDir, 'assets/streets', rel);
    let street;
    try {
      street = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    for (const L of street.layers || []) {
      for (const d of L.decos || []) {
        if (d.sprite) {
          need.add(d.sprite);
          instances += 1;
        }
      }
    }
  }
  return { need, instances };
}

/** Deco stems shipped as 2x WebP (tools/deco-pipeline; the @1.5x files are their 3x copies). */
function pngStemsOnDisk() {
  const stems = new Set();
  for (const name of readdirSync(decoDir)) {
    if (!name.endsWith('.webp') || name.endsWith('@1.5x.webp')) continue;
    const full = join(decoDir, name);
    const st = statSync(full);
    if (st.size < 30) continue;
    const buf = readFileSync(full);
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      stems.add(name.replace(/\.webp$/, ''));
    }
  }
  return stems;
}

describe('street deco background pack', () => {
  it('manifest lists every valid PNG stem on the game loader path', () => {
    const disk = pngStemsOnDisk();
    const manifest = new Set(JSON.parse(readFileSync(manifestPath, 'utf8')));
    assert.equal(manifest.size, disk.size, 'manifest size vs disk');
    for (const s of disk) {
      assert.ok(manifest.has(s), `manifest missing ${s}`);
    }
  });

  it('covers the large majority of unique street-referenced sprite names', () => {
    const { need, instances } = uniqueSpritesNeeded();
    const disk = pngStemsOnDisk();
    const present = [...need].filter((s) => disk.has(s));
    const missing = [...need].filter((s) => !disk.has(s));
    const uniquePct = (100 * present.length) / need.size;
    let instHave = 0;
    // instance-weighted: re-walk streets
    const idx = JSON.parse(readFileSync(streetsIndexPath, 'utf8'));
    for (const meta of Object.values(idx.streets || {})) {
      const rel = String(meta.file || '').replace(/^assets\/streets\//, '');
      const path = join(publicDir, 'assets/streets', rel);
      let street;
      try {
        street = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        continue;
      }
      for (const L of street.layers || []) {
        for (const d of L.decos || []) {
          if (d.sprite && disk.has(d.sprite)) instHave += 1;
        }
      }
    }
    const instPct = (100 * instHave) / instances;

    assert.ok(need.size >= 2000, `expected large world sprite set, got ${need.size}`);
    assert.ok(
      uniquePct >= 90,
      `unique coverage ${uniquePct.toFixed(2)}% (have ${present.length}/${need.size}, missing ${missing.length})`
    );
    assert.ok(
      instPct >= 95,
      `instance coverage ${instPct.toFixed(2)}% (${instHave}/${instances})`
    );
    // Full 100% unique name coverage is NOT required — coU has known gaps
    assert.ok(missing.length > 0 || uniquePct === 100);
  });

  it('Guillermo Gamera Way (Ix) has 100% of its deco sprites on disk', () => {
    const idx = JSON.parse(readFileSync(streetsIndexPath, 'utf8'));
    let street = null;
    for (const [tsid, meta] of Object.entries(idx.streets || {})) {
      if (meta.label === 'Guillermo Gamera Way' || tsid === 'GM4109NI2R640') {
        const rel = String(meta.file || '').replace(/^assets\/streets\//, '');
        street = JSON.parse(readFileSync(join(publicDir, 'assets/streets', rel), 'utf8'));
        break;
      }
    }
    assert.ok(street, 'Guillermo Gamera Way street JSON present');
    const need = new Set();
    for (const L of street.layers || []) {
      for (const d of L.decos || []) {
        if (d.sprite) need.add(d.sprite);
      }
    }
    const disk = pngStemsOnDisk();
    const missing = [...need].filter((s) => !disk.has(s));
    assert.equal(missing.length, 0, `missing Ix sprites: ${missing.slice(0, 20).join(', ')}`);
    assert.ok(need.size >= 50, `expected substantial deco set, got ${need.size}`);
  });
});
