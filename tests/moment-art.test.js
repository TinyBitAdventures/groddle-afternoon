/**
 * Sharp art on the award ("moment") card (lane momentart, 2026-11-15, an iPhone screenshot: the
 * Feat Completed card stretched the 60 px Small Petrified Rock over about 500 device px):
 * renders of Tiny Speck's vector SWFs in assets/sprites/moment (tools/icon-hires/hires.py
 * --moment), the swap from a small icon to its render, and the cap that keeps small raster art
 * at no more than 3 device px per pixel of its own.
 * Run: node --test tests/moment-art.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOMENT_SHARP } from '../public/js/moment-art-list.js?v=e51336e6';
import { artDensity, momentArt, momentArtCap, momentSharpUrl } from '../public/js/ui/moment-card.js?v=00f76fc9';
import { imageSize } from '../tools/image-size.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const moment = join(root, 'public/assets/sprites/moment');
const plan = JSON.parse(readFileSync(join(root, 'tools/icon-hires/moment-plan.json'), 'utf8'));

describe('moment card art', () => {
  it('lists every render on disk, each from a plan entry with a CC0 glitch-items SWF', () => {
    const onDisk = readdirSync(moment).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();
    assert.deepEqual([...MOMENT_SHARP].sort(), onDisk);
    assert.deepEqual(Object.keys(plan).sort(), onDisk);
    for (const [id, p] of Object.entries(plan)) assert.match(p.swf, /\/glitch-items\/.+\.swf$/, id);
  });

  it('each render is a WebP 498 px on its long side (166 CSS px at 3x)', () => {
    for (const id of MOMENT_SHARP) {
      const s = imageSize(readFileSync(join(moment, `${id}.webp`)));
      assert.equal(s?.format, 'webp', id);
      assert.equal(Math.max(s.w, s.h), 498, id);
    }
  });

  it('the Feat Completed card shows the rocks sharp, and other small icons swap to their render', () => {
    for (const id of ['petrified_rock_small', 'petrified_rock_medium', 'petrified_rock_large']) assert.ok(MOMENT_SHARP.has(id), id);
    const feats = readFileSync(join(root, 'public/js/features/solo-feats-feature.js'), 'utf8');
    assert.match(feats, /const ROCK_ICON = 'assets\/sprites\/moment\/petrified_rock_small\.webp';/);
    assert.doesNotMatch(feats, /icons\/petrified_rock_\w+@3x/);
    assert.equal(momentArt({ kind: 'feat', iconUrl: 'assets/sprites/moment/petrified_rock_small.webp' }), 'assets/sprites/moment/petrified_rock_small.webp');
    assert.equal(momentSharpUrl('assets/sprites/icons/petrified_rock_small@3x.webp'), 'assets/sprites/moment/petrified_rock_small.webp');
    assert.equal(momentSharpUrl('assets/sprites/icons/emblem_mab.webp'), 'assets/sprites/moment/emblem_mab.webp');
    assert.equal(momentSharpUrl('assets/sprites/street-jobs/sign_stake.webp'), 'assets/sprites/moment/sign_stake.webp');
    assert.equal(momentArt({ kind: 'badge', iconUrl: 'assets/sprites/icons/emblem_ti.webp' }), 'assets/sprites/moment/emblem_ti.webp');
    assert.equal(momentSharpUrl('assets/sprites/icons/apple.webp'), 'assets/sprites/icons/apple.webp');
    assert.equal(momentSharpUrl('assets/badges/1star_cuisinartist.webp'), 'assets/badges/1star_cuisinartist.webp');
    assert.equal(momentSharpUrl(null), null);
  });

  it('caps raster art at 3 device px per pixel of its own; vector art is not capped', () => {
    // The 60x48 @3x rock picked by a 3x srcset on an iPhone: 20x16 natural, 60 CSS px.
    assert.equal(momentArtCap({ width: 20, height: 16, density: artDensity('x/petrified_rock_small@3x.webp', true), dpr: 3 }), 60);
    // A 180 px badge: 180 CSS px on a phone (wider than the 166 px card art, so no change), 540 on a desktop.
    assert.equal(momentArtCap({ width: 180, height: 180, dpr: 3 }), 180);
    assert.equal(momentArtCap({ width: 180, height: 180, dpr: 1 }), 540);
    assert.equal(momentArtCap({ width: 498, height: 371, dpr: 3 }), 498);
    assert.equal(momentArtCap({ width: 0, height: 0, dpr: 3 }), null);
    assert.equal(momentArtCap({ width: 300, height: 300, dpr: 3, url: 'assets/imagination/ui/moment_icon_imagination.svg' }), null);
    assert.equal(artDensity('x/apple@3x.webp', false), 1);
    assert.equal(artDensity('x/apple.webp', true), 1);
  });

  it('screen-fx caps the art from its natural size in both skins, and style.css honours it', () => {
    const fx = readFileSync(join(root, 'public/js/screen-fx.js'), 'utf8');
    assert.match(fx, /img\.onload = \(\) => capMomentArt\(img\);\n\s+img\.src = art;/);
    assert.match(fx, /img\.style\.setProperty\('--moment-art-cap', `\$\{cap\}px`\)/);
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    assert.match(css, /\.award-badge img \{[^}]*max-width: var\(--moment-art-cap, none\);\n\s+max-height: var\(--moment-art-cap, none\);/);
    assert.ok(existsSync(join(root, 'public/assets/sprites/moment/petrified_rock_small.webp')));
  });
});
