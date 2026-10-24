import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'minn/groddle');

describe('Groddle on Minn (minn/groddle)', () => {
  it('has a manifest whose autoload and class match its source', () => {
    const manifest = JSON.parse(readFileSync(join(ext, 'minn.json'), 'utf8'));
    assert.equal(manifest.extension, 'Groddle\\Minn\\Extension');
    assert.deepEqual(manifest.autoload, { 'Groddle\\Minn\\': 'src/' });
    assert.match(readFileSync(join(ext, 'src/Extension.php'), 'utf8'), /final class Extension implements MinnExtension/);
  });

  it('answers folder pages through the route seam and never climbs out of its root', () => {
    const pages = readFileSync(join(ext, 'src/StaticPages.php'), 'utf8');
    assert.match(pages, /\$minn->routes|#\[Route\(Method::Get, '\/'/);
    assert.match(pages, /\{folder:\[a-z0-9\]\[a-z0-9_-\]\*\(\?:\/\[a-z0-9\]\[a-z0-9_-\]\*\)\*\}/);
    assert.match(pages, /throw new RouteMiss\(\)/);
    assert.match(readFileSync(join(ext, 'src/Extension.php'), 'utf8'), /\$minn->routes\(new StaticPages/);
  });

  it('is plain PHP the engine can load', (t) => {
    let php = true;
    try { execFileSync('php', ['-v'], { stdio: 'ignore' }); } catch { php = false; }
    if (!php) return t.skip('no php on PATH');
    for (const file of readdirSync(join(ext, 'src'))) {
      const out = execFileSync('php', ['-l', join(ext, 'src', file)], { encoding: 'utf8' });
      assert.match(out, /No syntax errors/, file);
    }
  });
});
