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
import { boxOf, compareSteps, openingStep, partView, stepFrom } from '../public/restoration/made-compare.js?v=bbd8d187';

const readJson = (file) => JSON.parse(readFileSync(join(GAME_DIR, file), 'utf8'));
const made = readJson('public/restoration/made.json');
const gallery = made.pieces.find((p) => p.id === 'maps:27,51,131');
const pairsOf = (piece) => (piece.parts
  ? piece.parts.map((p) => [partView(p.original, false), partView(p.image, true)])
  : [[piece.original, piece.image].filter(Boolean)]);

describe('Made for Groddle compare popup (public/restoration/made-compare.js)', () => {
  it('steps through a card original first, then made, and a gallery region by region, round the ends', () => {
    const book = made.pieces.find((p) => p.id === 'quest_book_award');
    assert.deepEqual(compareSteps(pairsOf(book)), [[0, 0], [0, 1]]);
    const pairs = pairsOf(gallery);
    const steps = compareSteps(pairs);
    assert.equal(steps.length, 6, 'three regions, two pictures each: "1 of 6" to "6 of 6"');
    assert.deepEqual(steps.map(([pi, vi]) => pairs[pi][vi].label), [
      "Ix: Tiny Speck's thumbnail, 150 by 91 pixels", 'Ix: painted again for Groddle',
      "Uralia: Tiny Speck's thumbnail, 150 by 91 pixels", 'Uralia: painted again for Groddle',
      "Haoma: Tiny Speck's thumbnail, 150 by 91 pixels", 'Haoma: painted again for Groddle',
    ]);
    assert.equal(stepFrom(5, 1, 6), 0);
    assert.equal(stepFrom(0, -1, 6), 5);
    assert.equal(stepFrom(0, 1, 1), 0, 'a card of one picture does not step');
  });

  it('opens on the picture clicked, and on a gallery on the region under the click', () => {
    const book = pairsOf(made.pieces.find((p) => p.id === 'quest_book_award'));
    assert.equal(openingStep(book, 0), 0);
    assert.equal(openingStep(book, 1), 1);
    const pairs = pairsOf(gallery);
    assert.equal(openingStep(pairs, 0, 0, true), 0, 'Enter on the thumbnails: Ix');
    assert.equal(openingStep(pairs, 1, 0.5, true), 3, 'the middle of the paintings: Uralia painted');
    assert.equal(openingStep(pairs, 0, 0.99, true), 4, 'the bottom of the thumbnails: Haoma');
    assert.equal(openingStep(pairs, 1, 1.4, true), 5, 'clamped to the last region');
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

  it('made.json gives the gallery each region\'s own thumbnail and painting, the same shape, the thumbnail pixels kept', () => {
    assert.deepEqual(gallery.parts.map((p) => p.name), ['Ix', 'Uralia', 'Haoma'], 'top to bottom, as the card and its caption list them');
    for (const part of gallery.parts) {
      for (const v of [part.original, part.image]) assert.ok(existsSync(join(GAME_DIR, 'public', v.src)), v.src);
      assert.match(part.original.src, /^\/assets\/maps\/art\/thumbs\/sm_[a-z]+\.jpg$/);
      assert.match(part.image.src, /^\/assets\/maps\/art\/bg\/[a-z]+@2x\.webp$/);
      assert.equal(part.original.pixelated, true);
      assert.ok(Math.abs(part.original.w / part.original.h - part.image.w / part.image.h) < 0.01, part.name);
      assert.ok(part.original.alt && part.image.alt, part.name);
    }
    assert.ok(made.pieces.filter((p) => p.parts).length === 1, 'only galleries have parts');
  });

  it('the builder wants words for a gallery\'s parts', () => {
    const provenance = readJson('tools/provenance/made-sprites.json');
    const curated = readJson('tools/made-art/pieces.json');
    const maps = readJson('tools/provenance/repainted-maps.json');
    const odd = structuredClone(curated);
    delete odd.pieces.find((p) => p.id === 'maps:27,51,131').parts;
    assert.throws(() => build(provenance, odd, undefined, maps, readMore()), /a gallery needs parts/);
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
