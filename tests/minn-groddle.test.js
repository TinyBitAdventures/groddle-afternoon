import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The theme + extension is its own repo, groddle-afternoon-site (tools/repos.mjs);
// the checks that read it skip when it is not beside this one.
const ext = SITE_DIR;

describe('Groddle on Minn (groddle-afternoon-site, a block theme that is also an extension)', () => {
  it('has a manifest whose autoload and class match its source', { skip: skipWithoutSite }, () => {
    const manifest = JSON.parse(readFileSync(join(ext, 'minn.json'), 'utf8'));
    assert.equal(manifest.extension, 'Groddle\\Minn\\Extension');
    assert.deepEqual(manifest.autoload, { 'Groddle\\Minn\\': 'src/' });
    assert.match(readFileSync(join(ext, 'src/Extension.php'), 'utf8'), /final class Extension implements MinnExtension/);
  });

  it('answers folder pages through the route seam and never climbs out of its root', { skip: skipWithoutSite }, () => {
    const pages = readFileSync(join(ext, 'src/StaticPages.php'), 'utf8');
    assert.match(pages, /\$minn->routes|#\[Route\(Method::Get, '\/'/);
    assert.match(pages, /\{folder:\[a-z0-9\]\[a-z0-9_-\]\*\(\?:\/\[a-z0-9\]\[a-z0-9_-\]\*\)\*\}/);
    assert.match(pages, /throw new RouteMiss\(\)/);
    assert.match(readFileSync(join(ext, 'src/Extension.php'), 'utf8'), /\$minn->routes\(new StaticPages/);
    // Notes are Minn content drawn by the templates, so the folder route steps aside for them.
    assert.match(pages, /\$folder === 'changelog' \|\| str_starts_with\(\$folder, 'changelog\/'\)/);
  });

  it('is a block theme: header, templates for notes and pages, the theme it says it is', { skip: skipWithoutSite }, () => {
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
    assert.match(content, /<!-- wp:groddle\/stamp \{"value":/);
    assert.match(content, /<!-- wp:image \{"className":"note-figure"\} -->\n<figure class="wp-block-image note-figure"><img src="\//);
    const selfClosing = (content.match(/<!-- wp:[^>]* \/-->/g) || []).length;
    assert.equal((content.match(/<!-- wp:/g) || []).length - selfClosing, (content.match(/<!-- \/wp:/g) || []).length, 'every block closes');
  });

  it('writes every note without an HTML block: the structured parts are the theme\'s blocks', { skip: skipWithoutSite }, async () => {
    const { noteContent } = await import('../tools/changelog/to-minn.mjs');
    const { loadPosts } = await import('../tools/changelog/build.mjs');
    const declared = JSON.parse(readFileSync(join(ext, 'minn.json'), 'utf8')).blocks;
    for (const post of loadPosts().posts) {
      const content = noteContent(post);
      assert.doesNotMatch(content, /<!-- wp:html/, post.slug);
      for (const [, name] of content.matchAll(/<!-- wp:(groddle\/[a-z-]+)/g)) assert.ok(declared.includes(name), `${post.slug}: ${name} is declared in minn.json`);
      // Attributes are encoded as the block editor writes them, so no tag or comment end hides in a comment.
      for (const [, json] of content.matchAll(/<!-- wp:groddle\/[a-z-]+ (\{.*?\}) \/?-->/g)) assert.doesNotMatch(json, /[<>]|--/, post.slug);
    }
  });

  it('registers one block per block.json, each drawn by a class in src/ (the report sections by Restoration.php), with the icons the cards name', { skip: skipWithoutSite }, () => {
    const declared = JSON.parse(readFileSync(join(ext, 'minn.json'), 'utf8')).blocks;
    const dirs = readdirSync(join(ext, 'blocks'));
    const restoration = readFileSync(join(ext, 'src/Restoration.php'), 'utf8');
    const sources = readdirSync(join(ext, 'src')).filter((f) => f.endsWith('.php')).map((f) => readFileSync(join(ext, 'src', f), 'utf8')).join('\n');
    assert.deepEqual(dirs.map((d) => `groddle/${d}`).sort(), [...declared].sort());
    for (const d of dirs) {
      const type = JSON.parse(readFileSync(join(ext, 'blocks', d, 'block.json'), 'utf8'));
      assert.equal(type.name, `groddle/${d}`);
      if (d.startsWith('restoration-')) assert.match(restoration, new RegExp(`\\$section\\('${d.slice('restoration-'.length)}'`), d);
      else assert.match(sources, new RegExp(`\\$minn->block\\('blocks/${d}'`), d);
      if (type.parent) assert.ok(declared.includes(type.parent[0]), `${d}'s parent is a declared block`);
      if (type.allowedBlocks) assert.deepEqual(type.example.innerBlocks.map((b) => b.name), type.allowedBlocks, `${d} inserts with a child to edit`);
    }
    const icons = JSON.parse(readFileSync(join(ext, 'blocks/feature/block.json'), 'utf8')).attributes.icon.enum;
    assert.deepEqual(icons.map((i) => `${i}.svg`).sort(), readdirSync(join(ext, 'marks')).sort());
    execFileSync('node', [join(root, 'tools/changelog/minn-blocks.mjs'), '--check'], { stdio: 'ignore' });
  });

  it('makes the restoration report a page of blocks: core blocks for the words, one data block per section (tools/restoration/to-minn.mjs)', { skip: skipWithoutSite }, async () => {
    const { restorationContent } = await import('../tools/restoration/to-minn.mjs');
    const content = restorationContent();
    assert.doesNotMatch(content, /wp:html/);
    const sections = readdirSync(join(ext, 'blocks')).filter((d) => d.startsWith('restoration-'));
    for (const d of sections) assert.equal(content.split(`<!-- wp:groddle/${d}`).length - 1, 1, `${d} is on the page once`);
    // Every jump link lands on a band, each band's heading carries the id its section is labelled by.
    const bands = [...content.matchAll(/<section class="wp-block-group band[^"]*" id="([a-z]+)">/g)].map((m) => m[1]);
    assert.deepEqual(bands, ['street', 'systems', 'numbers', 'rooms', 'designers', 'seasons', 'recent', 'honest']);
    for (const [, id] of content.matchAll(/<a href="#([a-z]+)">/g)) assert.ok(bands.includes(id), id);
    for (const id of bands) assert.match(content, new RegExp(`<h2 class="wp-block-heading" id="${id}-h">`));
    // The page is published at /restoration/ and wins over the built file there; its template is declared.
    assert.match(readFileSync(join(ext, 'src/StaticPages.php'), 'utf8'), /pageByPath\(explode\('\/', \$folder\)\) !== null/);
    assert.deepEqual(JSON.parse(readFileSync(join(ext, 'theme.json'), 'utf8')).customTemplates.map((t) => t.name), ['page-wide']);
    assert.match(readFileSync(join(ext, 'templates/page-wide.html'), 'utf8'), /wp:post-content/);
  });

  it('makes the Musicblocks page from the game: every recovered tune in data.json, one block per set (tools/musicblocks)', async () => {
    execFileSync('node', [join(root, 'tools/musicblocks/build-data.mjs'), '--check'], { stdio: 'ignore' });
    const data = JSON.parse(readFileSync(join(root, 'public/musicblocks/data.json'), 'utf8'));
    const { MUSICBLOCK_CATALOG } = await import('../public/js/musicblocks.js?v=35e2b17a');
    const listed = data.sets.flatMap((s) => s.blocks.map((b) => b.id));
    assert.deepEqual(listed.sort(), Object.keys(MUSICBLOCK_CATALOG).sort());
    for (const b of data.sets.flatMap((s) => s.blocks)) {
      for (const file of [b.audio, b.icon]) assert.ok(file && readFileSync(join(root, 'public', file)).length > 0, `${b.id} ${file}`);
    }
    for (const s of data.sets.filter((x) => x.id !== 'rare')) assert.ok(s.trophy?.name && s.trophy.badge, `${s.id} has its collector trophy`);
    // What a play pays is read off the game, so it matches Tiny Speck's musicblock_base.
    assert.deepEqual([data.rules.energy, data.rules.mood, data.rules.fresh, data.rules.secret, data.rules.returning, data.rules.dailyFirst, data.rules.dailyNew, data.rules.stale], [2, 2, 50, 1000, 100, 10, 5, 0]);
    const { musicblocksContent, SETS } = await import('../tools/musicblocks/to-minn.mjs');
    const content = musicblocksContent();
    assert.doesNotMatch(content, /wp:html/);
    assert.deepEqual(SETS.map(([, set]) => set), data.sets.map((s) => s.id));
    for (const [, set] of SETS) assert.equal(content.split(`<!-- wp:groddle/musicblocks {"set":"${set}"} /-->`).length - 1, 1, set);
    assert.equal(content.split('<!-- wp:groddle/musicblocks-rules /-->').length - 1, 1);
    const bands = [...content.matchAll(/<section class="wp-block-group band[^"]*" id="([a-z]+)">/g)].map((m) => m[1]);
    for (const [, id] of content.matchAll(/<a href="#([a-z]+)">/g)) assert.ok(bands.includes(id), id);
    assert.doesNotMatch(content, /\u2014/, 'no em dashes');
  });

  it('draws the markup the Musicblocks player script finds (Musicblocks.php)', { skip: skipWithoutSite }, () => {
    const drawn = readFileSync(join(ext, 'src/Musicblocks.php'), 'utf8');
    for (const cls of ['mb-set', 'mb-card', 'mb-face', 'mb-name']) assert.match(drawn, new RegExp(`class="${cls}`), cls);
  });

  it('makes the Street music entry from Tiny Speck\'s downloads catalogue: every published track, one block per group (tools/streetmusic)', async () => {
    execFileSync('node', [join(root, 'tools/streetmusic/build-data.mjs'), '--check'], { stdio: 'ignore' });
    const music = JSON.parse(readFileSync(join(root, 'public/assets/content/ambient-music.json'), 'utf8'));
    const data = JSON.parse(readFileSync(join(root, 'public/street-music/data.json'), 'utf8'));
    const { PLACES, GROUPS } = await import('../tools/streetmusic/build-data.mjs');
    assert.deepEqual(Object.keys(music.themes).filter((id) => !(id in PLACES)), [], 'every music theme names its place');
    assert.equal(data.counts.tracks, music.downloads.length);
    for (const t of data.groups.flatMap((g) => g.tracks)) assert.ok(readFileSync(join(root, 'public', t.audio)).length > 0, t.title);
    const { streetMusicContent, BANDS } = await import('../tools/streetmusic/to-minn.mjs');
    const content = streetMusicContent();
    assert.doesNotMatch(content, /wp:html/);
    assert.deepEqual(BANDS.map(([, set]) => set), GROUPS.map((g) => g.id));
    for (const [, set] of BANDS) assert.equal(content.split(`<!-- wp:groddle/street-music {"group":"${set}"} /-->`).length - 1, 1, set);
    const bands = [...content.matchAll(/<section class="wp-block-group band[^"]*" id="([a-z]+)">/g)].map((m) => m[1]);
    for (const [, id] of content.matchAll(/<a href="#([a-z]+)">/g)) assert.ok(bands.includes(id), id);
    assert.doesNotMatch(content, /\u2014/, 'no em dashes');
  });

  it('draws what restoration.js fills: every container id the script looks for', { skip: skipWithoutSite }, () => {
    const script = readFileSync(join(root, 'public/restoration/restoration.js'), 'utf8');
    const drawn = readFileSync(join(ext, 'src/Restoration.php'), 'utf8');
    const ids = new Set([...script.matchAll(/\$\('#([a-z-]+)'/g)].map((m) => m[1]));
    assert.ok(ids.size > 15);
    for (const id of ids) assert.match(drawn, new RegExp(`id="${id}"`), id);
  });

  it('is plain PHP the engine can load', { skip: skipWithoutSite }, (t) => {
    let php = true;
    try { execFileSync('php', ['-v'], { stdio: 'ignore' }); } catch { php = false; }
    if (!php) return t.skip('no php on PATH');
    for (const file of readdirSync(join(ext, 'src'))) {
      const out = execFileSync('php', ['-l', join(ext, 'src', file)], { encoding: 'utf8' });
      assert.match(out, /No syntax errors/, file);
    }
  });
});
