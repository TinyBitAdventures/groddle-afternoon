/**
 * The Brand page (Austin 2026-10-28): an unlinked /brand/ page with a mark of
 * our own in place of the quoin icon. tools/brand/build.mjs draws the mark and
 * writes every brand file into public/brand/; tools/brand/to-minn.mjs makes
 * the Minn page once. Austin approved the mark the same day: the site's icons
 * (public/favicon.svg, favicon.ico, apple-touch-icon.png, favicon-192.png) are
 * copies of public/brand/swap/, linked with ?v=arch.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ASSETS, PALETTE, brandContent, siteTokens } from '../tools/brand/to-minn.mjs';
import { LOCKUP_RENDERS, MARK_COLOURS, RENDERS, SITE_ICONS, svgFiles, svgSize } from '../tools/brand/build.mjs';
import { SECTIONS } from '../tools/site-nav/apply.mjs';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const BRAND = join(root, 'public/brand');
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

/** A small XML well-formedness check: tags nest and close, attributes are quoted and not repeated, one root. */
function wellFormed(xml) {
  const body = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/^<\?xml[^>]*\?>/, '').trim();
  const stack = [];
  let roots = 0;
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<|>/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[0] === '<') return `stray < at ${m.index}`;
    if (m[0] === '>') return `stray > at ${m.index}`;
    const [, close, name, attrs, self] = m;
    const names = [...attrs.matchAll(/([\w:-]+)\s*=/g)].map((a) => a[1]);
    if (new Set(names).size !== names.length) return `<${name}> repeats an attribute`;
    if (close) {
      if (stack.pop() !== name) return `</${name}> closes the wrong tag`;
    } else {
      if (!stack.length) roots++;
      if (!self) stack.push(name);
    }
  }
  if (stack.length) return `unclosed <${stack.at(-1)}>`;
  if (roots !== 1) return `${roots} root elements`;
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(body)) return 'a bare &';
  return null;
}

describe('the brand files (tools/brand/build.mjs)', () => {
  const svgs = walk(BRAND).filter((f) => f.endsWith('.svg'));

  it('are up to date with the drawing in build.mjs', () => {
    for (const [path, svg] of Object.entries(svgFiles())) assert.equal(readFileSync(join(BRAND, path), 'utf8'), svg, `${path} is stale (node tools/brand/build.mjs)`);
    assert.deepEqual(svgs.map((f) => relative(BRAND, f)).sort(), Object.keys(svgFiles()).sort(), 'every SVG under public/brand is one build.mjs writes');
  });

  it('are well-formed SVG with a viewBox and a title', () => {
    for (const bad of ['<svg><g></svg>', '<svg a=1/>', '<svg/><svg/>', '<svg a="1" a="2"/>', '<svg>&</svg>']) assert.notEqual(wellFormed(bad), null, `the check catches ${bad}`);
    for (const f of svgs) {
      const xml = readFileSync(f, 'utf8');
      assert.equal(wellFormed(xml), null, relative(root, f));
      assert.match(xml, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+" viewBox="0 0 \d+ \d+">/, relative(root, f));
      assert.match(xml, /<title>[^<]+<\/title>/, relative(root, f));
    }
  });

  it('are self-contained: nothing to load, no script, every url() a fragment defined in the same file', () => {
    for (const f of svgs) {
      const xml = readFileSync(f, 'utf8');
      const name = relative(root, f);
      assert.doesNotMatch(xml, /<(script|image|foreignObject|style|use|a)\b/i, name);
      assert.doesNotMatch(xml, /\son[a-z]+\s*=/i, `${name}: no event attributes`);
      assert.doesNotMatch(xml, /(?:xlink:)?href\s*=/i, `${name}: no links`);
      assert.doesNotMatch(xml, /@import|https?:\/\/(?!www\.w3\.org\/2000\/svg")/, `${name}: no outside addresses`);
      const ids = [...xml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, `${name}: ids are unique`);
      for (const [, ref] of xml.matchAll(/url\(([^)]*)\)/g)) {
        assert.match(ref, /^#[\w-]+$/, `${name}: url(${ref})`);
        assert.ok(ids.includes(ref.slice(1)), `${name}: ${ref} is defined`);
      }
    }
  });

  it('draw the mark only in the site\'s own colours', () => {
    const { light, dark } = siteTokens();
    const tokens = new Set([...Object.values(light), ...Object.values(dark)]);
    for (const [k, v] of Object.entries(MARK_COLOURS)) assert.ok(tokens.has(v), `${k} ${v} is a site token`);
    for (const file of ['mark.svg', 'mark-small.svg', 'mark-ink.svg', 'mark-paper.svg', 'swap/favicon.svg']) {
      const colours = [...readFileSync(join(BRAND, file), 'utf8').matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase());
      assert.ok(colours.length, file);
      for (const c of colours) assert.ok(tokens.has(c), `${file}: ${c} is a site token`);
    }
  });

  it('give the one-colour mark one colour, the same drawing in Ink and in Paper', () => {
    const ink = readFileSync(join(BRAND, 'mark-ink.svg'), 'utf8'), paper = readFileSync(join(BRAND, 'mark-paper.svg'), 'utf8');
    const painted = (xml) => new Set([...xml.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/gi)].map((m) => m[1]));
    assert.deepEqual([...painted(ink)], [MARK_COLOURS.ink]);
    assert.deepEqual([...painted(paper)], [MARK_COLOURS.paper]);
    assert.equal(ink.replaceAll(MARK_COLOURS.ink, 'C').replaceAll('ga-ink', 'id'), paper.replaceAll(MARK_COLOURS.paper, 'C').replaceAll('ga-paper', 'id'));
  });

  it('render the PNGs at their sizes, the touch icons opaque, and an ICO with 16 and 32', () => {
    for (const [, out, size] of RENDERS) {
      const png = readFileSync(join(BRAND, out));
      assert.equal(png.toString('latin1', 1, 4), 'PNG', out);
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size], out);
      if (out.startsWith('swap/')) assert.equal(png[25], 2, `${out} is RGB with no alpha`);
    }
    const ico = readFileSync(join(BRAND, 'swap/favicon.ico'));
    assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1], 'an icon file');
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
    for (const s of [16, 32]) assert.ok(sizes.includes(s), `favicon.ico has ${s}`);
  });

  it('render the four lockups as PNGs at twice and eight times their size, on a clear ground', () => {
    const files = svgFiles();
    assert.equal(LOCKUP_RENDERS.length, 8);
    for (const [src, out, scale] of LOCKUP_RENDERS) {
      const png = readFileSync(join(BRAND, out));
      assert.equal(png.toString('latin1', 1, 4), 'PNG', out);
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], svgSize(files[src]).map((n) => n * scale), out);
      assert.equal(png[25], 6, `${out} is RGBA, so the lockup sits on any ground`);
    }
  });

  it('make the site\'s icons the arch: the small drawing for the SVG favicon, the live files copies of swap/', () => {
    assert.equal(readFileSync(join(BRAND, 'swap/favicon.svg'), 'utf8'), readFileSync(join(BRAND, 'mark-small.svg'), 'utf8'));
    for (const name of SITE_ICONS) assert.ok(readFileSync(join(root, 'public', name)).equals(readFileSync(join(BRAND, 'swap', name))), `public/${name} is public/brand/swap/${name} (node tools/brand/build.mjs)`);
    assert.doesNotMatch(readFileSync(join(root, 'public/favicon.svg'), 'utf8'), /quoin/i, 'the quoin favicon is gone');
  });
});

describe('the Brand page (tools/brand/to-minn.mjs)', () => {
  const content = brandContent();

  it('is words in core blocks, in the house style', () => {
    const names = new Set([...content.matchAll(/<!-- wp:([a-z0-9/-]+)/g)].map((m) => m[1]));
    assert.deepEqual([...names].sort(), ['group', 'heading', 'image', 'list', 'list-item', 'paragraph']);
    assert.doesNotMatch(content, /—/, 'no em-dashes in page copy');
    assert.doesNotMatch(content, /Glitch™|glitch\.com|"\/favicon\.svg/i);
    for (const id of ['mark', 'lockups', 'type', 'colour', 'icons', 'usage', 'directions', 'files']) assert.ok(content.includes(`<section class="wp-block-group band brand-band`) && content.includes(` id="${id}"`), id);
    assert.match(content, /Tiny Speck’s art[^<]*is not part of the brand, and neither are the Glitch name and logo/);
  });

  it('shows the palette from the site\'s tokens, light and dark', () => {
    const { light, dark } = siteTokens();
    const css = readFileSync(join(root, 'public/restoration/restoration.css'), 'utf8');
    const media = css.slice(css.indexOf(':root:not([data-theme="light"]) {'));
    for (const [token] of PALETTE) {
      assert.ok(content.includes(`Light <code>${light[token]}</code> Dark <code>${dark[token]}</code>`), token);
      assert.ok(content.includes(`<span class="brand-chip" style="background:${light[token]}"></span><span class="brand-chip" style="background:${dark[token]}"></span>`), token);
      assert.match(media.slice(0, media.indexOf('}')), new RegExp(`--${token}: ${dark[token]};`), `${token}: both dark blocks agree`);
    }
  });

  it('points only at brand files that exist', () => {
    const refs = [...content.matchAll(/(?:src|href)="(\/brand\/[^"]+)"/g)].map((m) => m[1].slice('/brand/'.length));
    assert.ok(refs.length > 20);
    assert.deepEqual([...new Set(refs)].sort(), [...ASSETS].sort());
    for (const r of refs) assert.ok(existsSync(join(BRAND, r)), r);
    assert.doesNotMatch(content, /(?:src|href)="(?!\/brand\/|#)/, 'no other addresses');
  });

  it('refuses to overwrite the page without --force and makes it full width', () => {
    const src = readFileSync(join(root, 'tools/brand/to-minn.mjs'), 'utf8');
    assert.match(src, /if \(found\[0\] && !args\.force\) \{/);
    assert.match(src, /slug: 'brand', status: 'publish', template: 'page-wide'/);
  });

  it('is not one of the header\'s sections', () => {
    assert.ok(!Object.keys(SECTIONS).includes('/brand/') && !Object.values(SECTIONS).flat().includes('/brand/'));
  });

  it('has its styles in the site\'s style.css', { skip: skipWithoutSite }, () => {
    const css = readFileSync(sitePath('style.css'), 'utf8');
    for (const cls of ['brand-hero', 'brand-tile', 'brand-on-dark', 'brand-tiles-4', 'brand-tiles-2', 'brand-tiles-3', 'brand-rules', 'brand-face', 'brand-swatch', 'brand-chips', 'brand-chip', 'brand-icons', 'brand-px', 'brand-do', 'brand-dont', 'brand-direction', 'brand-direction-chosen', 'brand-files']) {
      assert.ok(content.includes(cls), `the page uses .${cls}`);
      assert.match(css, new RegExp(`\\.${cls}[ ,.:{]`), `style.css styles .${cls}`);
    }
  });
});
