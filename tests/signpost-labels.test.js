/**
 * Signpost words read (Austin 2026-10-31: "the friends signposts are hard to read"). The
 * home street's friends' signpost drew dark brown names (0x2a1a08) on the dark brown arm with no
 * halo; the street signposts drew the same colour under a white halo. A 2012 snap (Louise
 * Pasture, research/flickr-2026-10-27) shows warm white words on the arm, which the client drew
 * with StaticFilters.white1pxSignpost_GlowA (white, alpha .4, blur 2). Every signpost board now
 * draws its words with street-render.js signLabel.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { SIGN_TEXT_FILL, SIGN_TEXT_FILL_UNBUILT, signLabel } from '../public/js/street-render.js?v=3f8384af';

const root = join(import.meta.dirname, '..');
const python = '/opt/homebrew/bin/python3.11';
const read = (p) => readFileSync(join(root, p), 'utf8');

const FakePIXI = {
  Text: class {
    constructor({ text, style }) {
      this.text = text;
      this.style = style;
      this.anchor = { set: (x, y = x) => { this.anchorAt = [x, y]; } };
    }
  },
};

/** WCAG relative luminance of an 0xRRGGBB colour, or of [r, g, b]. */
function luminance(c) {
  const rgb = Array.isArray(c) ? c : [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('signpost words', () => {
  it('signLabel draws warm white bold 14 px words with the client\'s faint white glow', () => {
    const label = signLabel(FakePIXI, 'Mer Maid');
    assert.equal(label.text, 'Mer Maid');
    assert.equal(label.style.fill, SIGN_TEXT_FILL);
    assert.equal(label.style.fontSize, 14);
    assert.equal(label.style.fontWeight, '700');
    assert.deepEqual(label.style.dropShadow, { alpha: 0.4, blur: 2, color: 0xffffff, distance: 0 });
    assert.equal(label.resolution, 3);
    assert.deepEqual(label.anchorAt, [0.5, 0.5]);
    assert.equal(signLabel(FakePIXI, 'Far', SIGN_TEXT_FILL_UNBUILT).style.fill, SIGN_TEXT_FILL_UNBUILT);
  });

  it('both fills read on the arm art at 4.5:1 or better, against its lightest grain too', { skip: !existsSync(python) && 'needs python3.11' }, () => {
    const code = `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
px = [p for p in im.getdata() if p[3] > 200]
mean = [round(sum(p[i] for p in px) / len(px)) for i in range(3)]
light = max(px, key=lambda p: p[0] + p[1] + p[2])[:3]
print(json.dumps([mean, list(light)]))
`;
    const [mean, light] = JSON.parse(execFileSync(python, ['-I', '-c', code, join(root, 'public/assets/ui/signpost/signpost_arm.png')], { encoding: 'utf8' }));
    for (const fill of [SIGN_TEXT_FILL, SIGN_TEXT_FILL_UNBUILT]) {
      assert.ok(contrast(fill, mean) >= 4.5, `${fill.toString(16)} on the arm's mean ${mean}: ${contrast(fill, mean).toFixed(1)}:1`);
      assert.ok(contrast(fill, light) >= 4.5, `${fill.toString(16)} on the arm's lightest ${light}: ${contrast(fill, light).toFixed(1)}:1`);
    }
    // The old dark brown words failed on the same arm.
    assert.ok(contrast(0x2a1a08, mean) < 2);
  });

  it('the street signposts and the home street\'s friends\' signpost both use signLabel', () => {
    const street = read('public/js/street-render.js');
    const body = street.slice(street.indexOf('function buildSignpostSprite'), street.indexOf('export function setSignpostHover'));
    assert.match(body, /signLabel\(PIXI, labelText, baseFill\)/);
    assert.match(body, /isLoaded \? SIGN_TEXT_FILL : SIGN_TEXT_FILL_UNBUILT/);
    const home = read('public/js/features/home-street-mp-feature.js');
    const draw = home.slice(home.indexOf('function drawSignpost'), home.indexOf('/** note_pole.as'));
    assert.match(draw, /signLabel\(PIXI, n\.name\)/);
    assert.doesNotMatch(draw, /new PIXI\.Text/, 'the friends\' signpost draws no words of its own');
    assert.doesNotMatch(street + home, /fill: 0x2a1a08/);
  });
});
