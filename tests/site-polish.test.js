// Site polish (Austin 2026-11-25, after the home page refresh): Nunito page titles, a lift on every
// clickable card and wavy edges on the light bands,
// all in the stylesheet every page loads (restoration/restoration.css).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const pub = join(import.meta.dirname, '..', 'public');
const css = readFileSync(join(pub, 'restoration', 'restoration.css'), 'utf8');
const theme = readFileSync(join(pub, 'site', 'theme.js'), 'utf8');
const polish = css.slice(css.indexOf('/* —— Site polish'), css.indexOf('/* —— Every change: commits by day'));

describe('site polish', () => {
  it('sets every page title in Nunito, served from this site', () => {
    assert.match(css, /--font-title: Nunito,/);
    assert.match(css, /^h1 \{ font-family: var\(--font-title\);/m);
    for (const [, url] of polish.matchAll(/url\("(\.\.\/assets\/fonts\/[^"]+)"\)/g)) assert.ok(existsSync(resolve(pub, 'restoration', url)), url);
    assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(css));
  });

  it('lifts every clickable card the same way, and not when asked for less motion', () => {
    assert.match(polish, /@media \(prefers-reduced-motion: no-preference\) \{\n  :is\(\.note-card, a\.ency-card,[^)]*\.todo[^)]*\) \{ transition:/);
    // Not the catalog tiles: their cells' content-visibility clips a lifted tile (Austin 2026-11-25).
    const lifted = polish.match(/:is\(([^)]*)\) \{ transition:/)[1];
    assert.ok(!/cat-card|ency-tile/.test(lifted), lifted);
    assert.match(polish, /:is\(:hover, :focus-within\) \{ transform: translateY\(-3px\);/);
  });

  it('gives the light bands a wavy edge in their own colour, from a seamless 1200 px wave', () => {
    assert.match(polish, /\.band-alt \{ position: relative; border-block: 0; \}/);
    assert.match(polish, /\.band-alt::before, \.band-alt::after \{[^}]*background: inherit;[^}]*mask: var\(--wave\) 0 0 \/ 1200px 18px repeat-x;/);
    const wave = decodeURIComponent(css.match(/--wave: url\("data:image\/svg\+xml,([^"]+)"\)/)[1]);
    const ys = [...wave.matchAll(/L(\d+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const at = (x) => ys.find((p) => p[0] === x)[1];
    assert.equal(at(0), at(1200), 'the wave meets itself at the seam');
  });

  it('adds nothing under the section titles, and no piggy over the home page screenshot (Austin 2026-11-25)', () => {
    assert.ok(!/\.masthead[^{]*::after|data-walker|npc_piggy|strip-grass/.test(polish), 'no strip under the titles');
    assert.ok(!/STRIPS|dataset\.walker/.test(theme), 'theme.js picks nothing per page');
    const home = readFileSync(join(pub, 'index.html'), 'utf8');
    assert.ok(!home.includes('game-shot-ledge'), 'no piggy over the home page screenshot');
  });
});
