/**
 * G1154: signposts take the middleground's colour filter, as Glitch's posts (children of the
 * middleground) took that layer's filters; on a dark street (Lotha Harte) the post is near black,
 * its words stay white (the 2012 Lotha Harte street template).
 * Run: node --test tests/g1154-signpost-filters.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSignDecoView, colourSignpost, glitchLayerMatrix } from '../public/js/street-render.js?v=cd2b2649';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const node = (label, children = []) => ({ label, children, filters: null });

describe('G1154: signposts take the middleground filter', () => {
  it('the post, shadow and arms take it; the words, keys and glows do not', () => {
    const arm = node('sign-arm');
    const label = node('sign-label');
    const glow = node('sign-glow');
    const g = node('', [node('', [node('sign-shadow'), node('sign-post'), node('sign-arm-holder', [glow, arm, label])])]);
    const colour = { matrix: [] };
    assert.equal(colourSignpost(g, colour), 3);
    assert.deepEqual(arm.filters, [colour]);
    assert.equal(g.children[0].children[1].filters[0], colour);
    assert.equal(label.filters, null);
    assert.equal(glow.filters, null);
    assert.equal(colourSignpost(node('', [node('sign-post')]), null), 0, 'a street with no filter leaves the post as drawn');
  });

  it('a lift drawn as its deco takes it on its art and plate', () => {
    class N { constructor() { this.children = []; this.anchor = { set() {} }; } addChild(c) { this.children.push(c); return c; } roundRect() { return this; } fill() { return this; } }
    const PIXI = { Container: N, Graphics: N, Sprite: N, Text: N, BlurFilter: class {} };
    const g = buildSignDecoView(PIXI, { connects: [{ tsid: 'LA', label: 'A' }], deco: { sprite: 'signpost_asset_elevator', w: 392, h: 422 } }, { x: 0, y: 0 }, { art: { source: {}, width: 1, height: 1, orig: {} }, plate: 'L' });
    const colour = { matrix: [] };
    assert.equal(colourSignpost(g, colour), 2);
    assert.ok(!(g.children.find((c) => c.label === 'sign-deco-glow').filters || []).includes(colour), 'the hover glow keeps its colour');
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
});
