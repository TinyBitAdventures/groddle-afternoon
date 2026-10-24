import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'minn/groddle');

describe('Groddle on Minn (minn/groddle, a block theme that is also an extension)', () => {
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
    // Notes are Minn content drawn by the templates, so the folder route steps aside for them.
    assert.match(pages, /\$folder === 'changelog' \|\| str_starts_with\(\$folder, 'changelog\/'\)/);
  });

  it('is a block theme: header, templates for notes and pages, the theme it says it is', () => {
    assert.match(readFileSync(join(ext, 'style.css'), 'utf8'), /Theme Name: Groddle Afternoon/);
    const theme = JSON.parse(readFileSync(join(ext, 'theme.json'), 'utf8'));
    assert.equal(theme.version, 3);
    for (const t of ['single', 'home', 'index', 'page', '404']) {
      const html = readFileSync(join(ext, `templates/${t}.html`), 'utf8');
      assert.match(html, /wp:template-part \{"slug":"header"/, t);
    }
    assert.match(readFileSync(join(ext, 'templates/single.html'), 'utf8'), /wp:post-content/);
    assert.match(readFileSync(join(ext, 'templates/home.html'), 'utf8'), /"className":"note-cards"/);
  });

  it('turns a note into blocks the theme styles (tools/changelog/to-minn.mjs)', async () => {
    const { noteContent } = await import('../tools/changelog/to-minn.mjs');
    const { loadPosts } = await import('../tools/changelog/build.mjs');
    const post = loadPosts().posts.find((p) => p.stat && p.image);
    const content = noteContent(post);
    assert.match(content, /<!-- wp:group \{"className":"note-intro"\} -->/);
    assert.match(content, /<aside class="note-stamp">/);
    assert.match(content, /<!-- wp:image \{"className":"note-figure"\} -->\n<figure class="wp-block-image note-figure"><img src="\//);
    assert.equal((content.match(/<!-- wp:/g) || []).length, (content.match(/<!-- \/wp:/g) || []).length, 'every block closes');
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
