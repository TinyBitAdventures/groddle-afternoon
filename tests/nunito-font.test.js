// Self-hosted Nunito (phase 2, Warm paper; Austin chose self-hosting): the modern skin's UI font is
// served from public/assets/fonts/nunito/ with its SIL Open Font License beside it, preloaded by both
// play pages, and nothing the game ships asks Google for a font at runtime.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTokens } from '../tools/tokens/css-sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const DIR = 'assets/fonts/nunito';
const FILES = ['nunito-roman-latin.woff2', 'nunito-roman-latin-ext.woff2', 'nunito-italic-latin.woff2', 'nunito-italic-latin-ext.woff2'];
const css = readFileSync(join(pub, 'style.css'), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (/^(node_modules|streets)$/.test(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('self-hosted Nunito', () => {
  it('ships the variable woff2 files, roman and italic, latin and latin-ext', () => {
    let bytes = 0;
    for (const f of FILES) {
      const path = join(pub, DIR, f);
      assert.ok(existsSync(path), f);
      const buf = readFileSync(path);
      assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2', `${f} is a woff2 file`);
      bytes += buf.length;
    }
    // About 152 KB for all four; a page with English text fetches the roman latin file (38 KB).
    assert.ok(bytes < 200 * 1024, `${bytes} bytes of font`);
    const extra = readdirSync(join(pub, DIR)).filter((f) => !FILES.includes(f) && f !== 'OFL.txt');
    assert.deepEqual(extra, [], 'only the four cuts and the licence');
  });

  it('keeps the SIL Open Font License beside the files', () => {
    const ofl = readFileSync(join(pub, DIR, 'OFL.txt'), 'utf8');
    assert.match(ofl, /Copyright 2014 The Nunito Project Authors \(https:\/\/github\.com\/googlefonts\/nunito\)/);
    assert.match(ofl, /SIL Open Font License, Version 1\.1/);
    assert.match(ofl, /PERMISSION & CONDITIONS/);
  });

  it('declares each file once with font-display: swap', () => {
    const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1]);
    assert.equal(faces.length, FILES.length);
    const urls = [];
    for (const face of faces) {
      assert.match(face, /font-family: Nunito;/);
      assert.match(face, /font-display: swap;/);
      assert.match(face, /font-weight: 200 1000;/);
      assert.match(face, /font-style: (normal|italic);/);
      const url = /src: url\("([^"]+)"\) format\("woff2"\);/.exec(face)?.[1];
      assert.ok(url && url.startsWith(`${DIR}/`), url);
      assert.ok(existsSync(join(pub, url)), url);
      urls.push(url.slice(DIR.length + 1));
    }
    assert.deepEqual(urls.sort(), [...FILES].sort());
  });

  it('is the modern skin\'s UI font, preloaded by both play pages', () => {
    const tokens = readTokens(root);
    assert.match(tokens.get('--font-round'), /^Nunito, /);
    assert.match(css, /:root\[data-ui="modern"\] \{\n  --font-ui: var\(--font-round\);\n\}/);
    for (const page of ['play/index.html', 'play/online/index.html']) {
      const html = readFileSync(join(pub, page), 'utf8');
      assert.match(html, /<html lang="en" data-ui="modern"/, page);
      assert.ok(html.includes(`<link rel="preload" href="${DIR}/nunito-roman-latin.woff2" as="font" type="font/woff2" crossorigin />`), `${page} preloads the main face`);
      assert.match(html, /href="style\.css\?v=[0-9a-f]{8}"/, `${page} keys style.css`);
    }
  });

  it('never loads a font from Google at runtime', () => {
    const hits = [];
    const files = [...walk(pub), join(root, 'tools/play-online/build.mjs')];
    for (const f of files) {
      if (!['.css', '.html', '.js', '.mjs', '.json'].includes(extname(f))) continue;
      const text = readFileSync(f, 'utf8');
      if (/fonts\.(googleapis|gstatic)\.com/.test(text)) hits.push(relative(root, f));
    }
    assert.deepEqual(hits, []);
  });
});
