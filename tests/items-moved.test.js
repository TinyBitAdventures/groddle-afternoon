/**
 * The Item catalog lives in the encyclopedia (Austin 2026-11-02: /items/ moved
 * to /encyclopedia/items/ "for consistency" with the other sections). No page
 * of the build links the old folder, the game reads the catalog's data at its
 * new place, and the old addresses answer a 301 to the same path there (the
 * site repo's src/MovedPages.php, registered before the built folders).
 *
 * Run: node --test tests/items-moved.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');

function htmlFiles(dir, out = []) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, d.name);
    if (d.isDirectory()) htmlFiles(path, out);
    else if (d.name.endsWith('.html')) out.push(path);
  }
  return out;
}

describe('the Item catalog at /encyclopedia/items/', () => {
  it('is built in the encyclopedia, and the old folder is gone', () => {
    assert.ok(!existsSync(join(pub, 'items')), 'public/items/ is still there');
    for (const f of ['index.html', 'data.json', 'catalog.js', 'catalog.css', 'combobox.js', 'apple/index.html']) {
      assert.ok(existsSync(join(pub, 'encyclopedia', 'items', f)), f);
    }
  });

  it('no built page links the old /items/ folder', () => {
    const old = join(pub, 'items') + sep;
    const bad = [];
    let links = 0;
    for (const file of htmlFiles(pub)) {
      const html = readFileSync(file, 'utf8');
      for (const [, href] of html.matchAll(/ (?:href|src|data-icon|data-search)="([^"#?]*)/g)) {
        if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//')) continue;
        links += 1;
        const target = href.startsWith('/') ? join(pub, href) : resolve(file, '..', href);
        if ((target + sep).startsWith(old)) bad.push(`${relative(pub, file)}: ${href}`);
      }
    }
    assert.ok(links > 10000, `only ${links} links read`);
    assert.deepEqual(bad.slice(0, 20), []);
  });

  it('the phone companion reads the catalog\'s names at the new place', () => {
    const src = readFileSync(join(pub, 'js/phone/companion.js'), 'utf8');
    assert.match(src, /new URL\('encyclopedia\/items\/data\.json', doc\.baseURI\)/);
    assert.ok(!/['"]items\/data\.json/.test(src));
  });

  it('the header menu\'s fallback Items link points at the new place', async () => {
    const { FALLBACK } = await import('../tools/site-nav/apply.mjs');
    assert.equal(FALLBACK.find((l) => l.label === 'Items')?.href, '/encyclopedia/items/');
  });
});

const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const skipPhp = skipWithoutSite || (!existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)');

describe('the old /items/ addresses (site src/MovedPages.php)', { skip: skipPhp }, () => {
  it('answer a 301 to the same path under /encyclopedia/items/, query kept', () => {
    const paths = ['/items', '/items/', '/items/?q=pick&status=source', '/items/apple/', '/items/data.json', '/itemsx/', '/encyclopedia/items/', '/items/../x', '/items//elsewhere.example'];
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/moved-pages/moved-pages.php'), engine, sitePath(''), ...paths], { encoding: 'utf8' }));
    } catch (err) {
      if (err.code === 'ENOENT') return; // no php here
      throw err;
    }
    const at = (p) => out[p]?.location;
    assert.equal(at('/items'), '/encyclopedia/items/');
    assert.equal(at('/items/'), '/encyclopedia/items/');
    assert.equal(at('/items/?q=pick&status=source'), '/encyclopedia/items/?q=pick&status=source');
    assert.equal(at('/items/apple/'), '/encyclopedia/items/apple/');
    assert.equal(at('/items/data.json'), '/encyclopedia/items/data.json');
    assert.equal(out['/items/'].method, 'GET');
    assert.equal(out['/itemsx/'], null, 'only the items segment itself');
    assert.equal(out['/encyclopedia/items/'], null);
    assert.equal(out['/items/../x'], 'miss');
    assert.equal(out['/items//elsewhere.example'], 'miss');
  });

  it('are registered before the built folders, so they answer first', () => {
    const ext = readFileSync(sitePath('src/Extension.php'), 'utf8');
    const moved = ext.indexOf('new MovedPages(');
    assert.ok(moved > 0 && moved < ext.indexOf('new StaticPages('));
  });
});
