/**
 * The compare popup of Made for Groddle on /restoration/ (public/restoration/made-compare.js,
 * Austin 2026-11-13): a card's two pictures one at a time in one box, flipped with the arrows,
 * the buttons or a swipe; a gallery card (made.json parts) steps through each region's pair.
 * Run: node --test tests/made-compare.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GAME_DIR } from '../tools/repos.mjs';
import { build, readMore } from '../tools/made-art/build-data.mjs';
import { boxOf, compareSteps, openingStep, partView, stepFrom } from '../public/restoration/made-compare.js?v=274ff8a4';

const readJson = (file) => JSON.parse(readFileSync(join(GAME_DIR, file), 'utf8'));
const made = readJson('public/restoration/made.json');
/**
 * A gallery card stand-in (lane maps17): made.json has no gallery since Vortex of Random, the last region painted again from
 * its thumbnail, took The Seams' restore. The builder still makes galleries (maps:<hub>,...), so this one is built by it from
 * the words the retired Vortex of Random card had, over the files the game ships now.
 */
const galleryWords = {
  id: 'maps:143',
  name: 'Vortex of Random map',
  caption: 'A stand-in gallery of one region.',
  display: { w: 304, h: 184 },
  image: { file: 'public/assets/maps/art/bg/vortex@2x.webp', label: 'Painted again for Groddle', alt: 'A painted map.' },
  original: { file: 'public/assets/maps/art/thumbs/sm_vortex.jpg', kind: 'original', pixelated: true, label: "Tiny Speck's thumbnail, {w} by {h} pixels, shown at the same size", alt: "Tiny Speck's small thumbnail of the same map." },
  parts: {
    original: { label: "{name}: Tiny Speck's thumbnail, {w} by {h} pixels", alt: "Tiny Speck's small thumbnail of the {name} map, enlarged so its pixels show." },
    image: { label: '{name}: painted again for Groddle', alt: 'The {name} region map, painted again for Groddle from that thumbnail.' },
  },
  facts: [{ label: 'How it was made', text: 'Painted by an image model ({tool}).' }],
};
const buildWith = (words) => {
  const curated = readJson('tools/made-art/pieces.json');
  return build(readJson('tools/provenance/made-sprites.json'), { ...curated, pieces: [...curated.pieces, words] }, undefined, readJson('tools/provenance/repainted-maps.json'), readMore());
};
const gallery = buildWith(galleryWords).pieces.find((p) => p.id === 'maps:143');
const pairsOf = (piece) => (piece.parts
  ? piece.parts.map((p) => [partView(p.original, false), partView(p.image, true)])
  : [[piece.original, piece.image].filter(Boolean)]);
/** A gallery of two regions made from a one-region gallery: its part again, named Second (for the stepping rules). */
const twoRegions = (piece) => pairsOf({ parts: [...piece.parts, ...piece.parts.map((p) => ({
  name: 'Second',
  original: { ...p.original, label: p.original.label.replace(p.name, 'Second') },
  image: { ...p.image, label: p.image.label.replace(p.name, 'Second') },
}))] });

describe('Made for Groddle compare popup (public/restoration/made-compare.js)', () => {
  it('steps through a card original first, then made, and a gallery region by region, round the ends', () => {
    const book = made.pieces.find((p) => p.id === 'quest_book_award');
    assert.deepEqual(compareSteps(pairsOf(book)), [[0, 0], [0, 1]]);
    // A gallery of one region (the stand-in): its two pictures.
    const one = pairsOf(gallery);
    assert.deepEqual(compareSteps(one).map(([pi, vi]) => one[pi][vi].label), [
      "Vortex of Random: Tiny Speck's thumbnail, 150 by 91 pixels", 'Vortex of Random: painted again for Groddle',
    ]);
    // A gallery of several steps region by region: its region twice under two names stands in for one.
    const pairs = twoRegions(gallery);
    const steps = compareSteps(pairs);
    assert.equal(steps.length, 4, 'two regions, two pictures each: "1 of 4" to "4 of 4"');
    assert.deepEqual(steps.map(([pi, vi]) => pairs[pi][vi].label), [
      "Vortex of Random: Tiny Speck's thumbnail, 150 by 91 pixels", 'Vortex of Random: painted again for Groddle',
      "Second: Tiny Speck's thumbnail, 150 by 91 pixels", 'Second: painted again for Groddle',
    ]);
    assert.equal(stepFrom(3, 1, 4), 0);
    assert.equal(stepFrom(0, -1, 4), 3);
    assert.equal(stepFrom(0, 1, 1), 0, 'a card of one picture does not step');
  });

  it('opens on the picture clicked, and on a gallery on the region under the click', () => {
    const book = pairsOf(made.pieces.find((p) => p.id === 'quest_book_award'));
    assert.equal(openingStep(book, 0), 0);
    assert.equal(openingStep(book, 1), 1);
    const one = pairsOf(gallery);
    assert.equal(openingStep(one, 0, 0.99, true), 0, 'one region: the thumbnail wherever it is clicked');
    assert.equal(openingStep(one, 1, 0.5, true), 1, 'one region: its painting');
    const pairs = twoRegions(gallery);
    assert.equal(openingStep(pairs, 0, 0, true), 0, 'Enter on the thumbnails: the first region');
    assert.equal(openingStep(pairs, 1, 0.25, true), 1, 'the top of the paintings: the first region painted');
    assert.equal(openingStep(pairs, 0, 0.99, true), 2, 'the bottom of the thumbnails: the second region');
    assert.equal(openingStep(pairs, 1, 1.4, true), 3, 'clamped to the last region');
    assert.equal(openingStep([[{ w: 1, h: 1 }]], 1), 0, 'a card with no original opens on its one picture');
  });

  it('fits both pictures into the larger one\'s shape, so the same-shape pairs fill one box', () => {
    const subway = made.pieces.find((p) => p.id === 'subway:paper');
    assert.equal(boxOf([subway.original, subway.image]), subway.image, 'the paper, not the smaller sign crop');
    for (const piece of made.pieces) {
      for (const pair of pairsOf(piece)) {
        const box = boxOf(pair);
        for (const v of pair) assert.ok(v.w > 0 && v.h > 0 && box.w * box.h >= v.w * v.h, `${piece.id} ${v.src}`);
      }
    }
  });

  it('the builder gives a gallery each region\'s own thumbnail and painting, the same shape, the thumbnail pixels kept', () => {
    assert.deepEqual(gallery.parts.map((p) => p.name), ['Vortex of Random'], 'the stand-in\'s one region');
    for (const part of gallery.parts) {
      for (const v of [part.original, part.image]) assert.ok(existsSync(join(GAME_DIR, 'public', v.src)), v.src);
      assert.match(part.original.src, /^\/assets\/maps\/art\/thumbs\/sm_[a-z]+\.jpg$/);
      assert.match(part.image.src, /^\/assets\/maps\/art\/bg\/[a-z]+@2x\.webp$/);
      assert.equal(part.original.pixelated, true);
      assert.ok(Math.abs(part.original.w / part.original.h - part.image.w / part.image.h) < 0.01, part.name);
      assert.ok(part.original.alt && part.image.alt, part.name);
    }
    assert.ok(made.pieces.every((p) => !p.parts), 'no gallery on the page since lane maps17, and only galleries have parts');
  });

  it('the builder wants words for a gallery\'s parts', () => {
    const odd = structuredClone(galleryWords);
    delete odd.parts;
    assert.throws(() => buildWith(odd), /a gallery needs parts/);
  });

  it('is wired by restoration.js before data.json, styled from the page\'s tokens, and still with reduced motion', () => {
    const js = readFileSync(join(GAME_DIR, 'public/restoration/restoration.js'), 'utf8');
    assert.match(js, /import \{ setupMadeCompare \} from '\.\/made-compare\.js(\?v=[0-9a-f]+)?';/);
    assert.ok(js.indexOf("setupMadeCompare(new URL('made.json', import.meta.url))") < js.indexOf("fetch(new URL('data.json'"), 'works even if data.json fails');
    const mod = readFileSync(join(GAME_DIR, 'public/restoration/made-compare.js'), 'utf8');
    assert.doesNotMatch(mod, /—/);
    for (const key of ['ArrowLeft', 'ArrowRight', 'showModal', "addEventListener('close'", 'pointerup', 'aria-live']) assert.ok(mod.includes(key), key);
    const css = readFileSync(join(GAME_DIR, 'public/restoration/restoration.css'), 'utf8');
    const block = css.slice(css.indexOf('/* Made for Groddle compare popup'), css.indexOf('/* —— Recent —— */'));
    assert.ok(block.length > 500, 'the popup has its block');
    assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b/i, 'tokens only, no raw colours');
    assert.match(block, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.made-modal\[open\] \{ animation/);
    assert.match(block, /\.mm-frame img\.made-px \{ image-rendering: pixelated; \}/);
  });
});
