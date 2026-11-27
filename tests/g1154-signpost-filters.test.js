/**
 * G1154: signposts take the middleground's colour filter, as Glitch's posts (children of the
 * middleground) took that layer's filters; on a dark street (Lotha Harte) the post is near black,
 * its words stay white (the 2012 Lotha Harte street template). #721: the arm hover glow takes it too
 * (the filter sat on SignpostView's holder, round the arm glows); the route glow does not. The
 * in-reach post glow (game.js syncPostGlow, SignpostView.as glow 612-617 on the same holder) takes it
 * after its rim colour, so in Brillah it is grey too.
 * Run: node --test tests/g1154-signpost-filters.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSignDecoView, colourSignpost, glitchLayerMatrix, signpostGlowFilters } from '../public/js/street-render.js?v=c3c73838';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const node = (label, children = []) => ({ label, children, filters: null });

describe('G1154: signposts take the middleground filter', () => {
  it('the post, shadow, arms and hover glow take it; the words and keys do not', () => {
    const arm = node('sign-arm');
    const label = node('sign-label');
    const key = node('sign-key');
    const glow = node('sign-glow');
    const blur = { blur: 7 };
    glow.filters = [blur];
    const g = node('', [node('', [node('sign-shadow'), node('sign-post'), node('sign-arm-holder', [glow, arm, label, key])])]);
    const colour = { matrix: [] };
    assert.equal(colourSignpost(g, colour), 4);
    assert.deepEqual(arm.filters, [colour]);
    assert.equal(g.children[0].children[1].filters[0], colour);
    assert.equal(label.filters, null);
    assert.equal(key.filters, null);
    assert.deepEqual(glow.filters, [blur, colour], 'the glow is blurred, then coloured');
    assert.equal(colourSignpost(node('', [node('sign-post')]), null), 0, 'a street with no filter leaves the post as drawn');
  });

  it('a lift drawn as its deco takes it on its art, plate and hover glow', () => {
    class N { constructor() { this.children = []; this.anchor = { set() {} }; } addChild(c) { this.children.push(c); return c; } roundRect() { return this; } fill() { return this; } }
    const PIXI = { Container: N, Graphics: N, Sprite: N, Text: N, BlurFilter: class {} };
    const g = buildSignDecoView(PIXI, { connects: [{ tsid: 'LA', label: 'A' }], deco: { sprite: 'signpost_asset_elevator', w: 392, h: 422 } }, { x: 0, y: 0 }, { art: { source: {}, width: 1, height: 1, orig: {} }, plate: 'L' });
    const colour = { matrix: [] };
    assert.equal(colourSignpost(g, colour), 3);
    const glow = g.children.find((c) => c.label === 'sign-deco-glow');
    assert.equal(glow.filters.length, 2);
    assert.ok(glow.filters[0] instanceof PIXI.BlurFilter);
    assert.equal(glow.filters[1], colour);
  });

  it('#721: in Brillah (Savren Sutch) the arm hover glow is grey; the yellow route glow is left alone', () => {
    const mg = street('GIFQK1MTEFI2I28').layers.find((l) => l.id === 'middleground');
    const m = glitchLayerMatrix(mg.filters);
    assert.ok(m, 'Savren Sutch\'s middleground has a colour matrix');
    // SIGN_GLOW_COLOUR 0x53e5ff through the matrix: red, green and blue come out equal (grey).
    const [r0, g0, b0] = [0x53 / 255, 0xe5 / 255, 0xff / 255];
    const out = [0, 5, 10].map((i) => r0 * m[i] + g0 * m[i + 1] + b0 * m[i + 2] + m[i + 4]);
    assert.ok(Math.abs(out[0] - out[2]) < 0.01 && Math.abs(out[1] - out[2]) < 0.01, `glow comes out ${out}`);
    const glow = node('sign-glow');
    const route = node('route-sign-glow', [node('')]);
    const g = node('', [route, node('sign-arm-holder', [glow, node('sign-arm')])]);
    colourSignpost(g, { matrix: m });
    assert.equal(glow.filters.length, 1, 'the hover glow takes the street filter');
    assert.equal(route.filters, null, 'the route glow (ours) stays yellow');
    assert.equal(route.children[0].filters, null);
  });

  it('Lotha Harte darkens its post; buildStreetView colours every post with the middleground\'s filters', () => {
    const mg = street('GHV88RQU60B3Q0G').layers.find((l) => l.id === 'middleground');
    const m = glitchLayerMatrix(mg.filters);
    assert.ok(m, 'Lotha Harte\'s middleground has a colour matrix');
    // Mid brown (the post) comes out much darker.
    const r = 0.55 * m[0] + 0.37 * m[1] + 0.2 * m[2] + m[4];
    assert.ok(r < 0.4, `red ${r}`);
    const src = readFileSync(join(root, 'public/js/street-render.js'), 'utf8');
    assert.match(src, /const signColour = colourFilter\(PIXI, \(street\.layers \|\| \[\]\)\.find\(\(l\) => l\.id === 'middleground'/);
    assert.match(src, /buildSignpostSprite\(PIXI, s, pos\);\n\s*colourSignpost\(g, signColour\);/);
  });
  it('#721: the in-reach post glow takes the street colour after its rim colour; no filter, none', () => {
    const colour = { matrix: [] };
    const g = node('', [node('', [node('sign-post'), node('sign-arm-holder', [node('sign-arm')])])]);
    colourSignpost(g, colour);
    assert.deepEqual(signpostGlowFilters(g), [colour]);
    assert.deepEqual(signpostGlowFilters(node('', [node('sign-post')])), [], 'an uncoloured post (a scene post, a street with no filter)');
    colourSignpost(g, null);
    assert.deepEqual(signpostGlowFilters(g), [colour], 'a null colour leaves the post as it was');
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    const sync = game.slice(game.indexOf('function syncPostGlow('), game.indexOf('function wireInteractableSprite('));
    assert.match(sync, /createSpriteOutline\(part, \{ color: 0xa8e4ff, thickness: 2, filters: signpostGlowFilters\(view\) \}\)/);
    const outline = game.slice(game.indexOf('function createSpriteOutline('), game.indexOf('function clearHoverGlow('));
    assert.match(outline, /ring\.filters = \[cm, \.\.\.after\];/, 'the street colour after the rim colour, on the measurable ring');
  });
});
