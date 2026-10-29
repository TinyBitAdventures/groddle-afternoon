/**
 * Street decos ship as WebP (tools/deco-pipeline, G31): <name>.webp at 2x for every deco in the
 * manifest, <name>@1.5x.webp at 3x for the decos in js/deco-hires-list.js, no PNGs. The game's
 * `assets/decos/groddle/<name>.png` URLs route to them (js/deco-hires.js) at unchanged logical sizes.
 * Run: node --test tests/deco-pipeline.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIRES_DECOS, HIRES_DECOS_BIG } from '../public/js/deco-hires-list.js?v=g449-1';
import { decoUrl, installHiresDecos, wantsHiresDecos } from '../public/js/deco-hires.js?v=g449-1';
import { resolutionOfUrl } from '../public/js/textures.js';
import { recolourBudgetBytes } from '../public/js/street-render.js?v=g449-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decoDir = join(root, 'public/assets/decos/groddle');
const srcDir = join(root, 'assets-src/decos/groddle');
const manifest = JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8'));
const planText = readFileSync(join(root, 'tools/deco-pipeline/plan.json'), 'utf8');
const plan = JSON.parse(planText);
const rows = new Map(plan.decos.map((r) => [r.name, r]));

/** Width and height of a WebP (VP8, VP8L or VP8X). */
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', file);
  assert.equal(b.toString('ascii', 8, 12), 'WEBP', file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

function pngSize(file) {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('deco WebP pipeline', () => {
  it('ships a 2x WebP for every manifest deco at the old PNG size, and no PNGs', () => {
    assert.ok(manifest.length >= 2700);
    for (const name of manifest) {
      const file = join(decoDir, `${name}.webp`);
      assert.ok(existsSync(file), `${name}.webp`);
      assert.deepEqual(webpSize(file), pngSize(join(srcDir, `${name}.png`)), `${name} 2x size`);
    }
    const pngs = readdirSync(decoDir).filter((f) => f.endsWith('.png'));
    assert.deepEqual(pngs, []);
  });

  it('ships a 3x file exactly for the listed decos, 1.5x the 2x size', () => {
    const listed = new Set([...HIRES_DECOS, ...HIRES_DECOS_BIG]);
    assert.ok(listed.size > 1500, `${listed.size} decos with 3x`);
    for (const f of readdirSync(decoDir).filter((f) => f.endsWith('@1.5x.webp'))) {
      assert.ok(listed.has(f.slice(0, -'@1.5x.webp'.length)), `stray ${f}`);
    }
    for (const name of listed) {
      const [w, h] = webpSize(join(decoDir, `${name}@1.5x.webp`));
      const [w2, h2] = pngSize(join(srcDir, `${name}.png`));
      // 1.5x the 2x size, rounded (build.py rounds half to even).
      assert.ok(Math.abs(w - w2 * 1.5) <= 0.5 && Math.abs(h - h2 * 1.5) <= 0.5, `${name} 3x is ${w}x${h}`);
      assert.equal(Math.max(w, h) > 4096, HIRES_DECOS_BIG.has(name), `${name} big flag`);
    }
  });

  it('keeps the audit verdicts: kept decos and decos with no SWF use their PNG pixels, without 3x', () => {
    const verdicts = JSON.parse(readFileSync(join(root, 'tools/deco-audit/verdicts.json'), 'utf8'));
    for (const name of Object.keys(verdicts.kept)) {
      const r = rows.get(name);
      assert.ok(r, name);
      assert.equal(r.mode, 'png', name);
      assert.ok(!HIRES_DECOS.has(name) && !HIRES_DECOS_BIG.has(name), name);
    }
    for (const r of plan.decos) {
      assert.ok(manifest.includes(r.name), `${r.name} not in manifest`);
      if (r.mode === 'png') assert.equal(r.hires, false, r.name);
      if (r.hires) assert.equal(r.mode, 'swf', r.name);
    }
  });

  it('routes deco PNG URLs to the WebP for the screen', () => {
    const hi = [...HIRES_DECOS][0];
    const lo = plan.decos.find((r) => !r.hires).name;
    assert.equal(decoUrl(`assets/decos/groddle/${hi}.png`), `assets/decos/groddle/${hi}.webp`);
    assert.equal(decoUrl(`assets/decos/groddle/${hi}.png`, { hires: true }), `assets/decos/groddle/${hi}@1.5x.webp`);
    assert.equal(decoUrl(`assets/decos/groddle/${lo}.png`, { hires: true }), `assets/decos/groddle/${lo}.webp`);
    assert.equal(decoUrl(`../assets/decos/groddle/${hi}.png?v=2`, { hires: true }), `../assets/decos/groddle/${hi}@1.5x.webp?v=2`);
    assert.equal(decoUrl('assets/decos/groddle/moon_asset_smile.svg'), null);
    assert.equal(decoUrl('assets/sprites/icons/apple.png'), null);
    // Logical size is the 2x pixel size: the 3x file has resolution 1.5, the 2x file 1.
    assert.equal(resolutionOfUrl(`assets/decos/groddle/${hi}@1.5x.webp`), 1.5);
    assert.equal(resolutionOfUrl(`assets/decos/groddle/${hi}.webp`), 1);
    if (HIRES_DECOS_BIG.size) {
      const big = [...HIRES_DECOS_BIG][0];
      assert.equal(decoUrl(`assets/decos/groddle/${big}.png`, { hires: true, bigTextures: false }), `assets/decos/groddle/${big}.webp`);
    }
  });

  it('uses 3x above 2.25 backing pixels per world pixel, with hysteresis', () => {
    assert.equal(wantsHiresDecos(1), false);
    assert.equal(wantsHiresDecos(1.5), false);
    assert.equal(wantsHiresDecos(2.2), false);
    assert.equal(wantsHiresDecos(2.6), true);
    assert.equal(wantsHiresDecos(4), true);
    assert.equal(wantsHiresDecos(2.1, true), true);
    assert.equal(wantsHiresDecos(1.9, true), false);
    const routes = [];
    let resolution = 1;
    const route = installHiresDecos({ addUrlRoute: (name, fn) => routes.push([name, fn]) }, {
      renderer: () => ({ resolution, gl: { MAX_TEXTURE_SIZE: 1, getParameter: () => 16384 } }),
    });
    assert.equal(routes[0][0], 'hires-decos');
    const hi = [...HIRES_DECOS][0];
    assert.equal(route(`assets/decos/groddle/${hi}.png`), `assets/decos/groddle/${hi}.webp`);
    resolution = 3.3;
    assert.equal(route(`assets/decos/groddle/${hi}.png`), `assets/decos/groddle/${hi}@1.5x.webp`);
    assert.equal(route('assets/sprites/icons/apple.png'), null);
  });

  it('counts recolour bakes at logical size, so 3x decos keep layers baked', () => {
    assert.equal(recolourBudgetBytes({ width: 100, height: 50, pixelWidth: 150, pixelHeight: 75, resolution: 1.5 }), 20000);
    assert.equal(recolourBudgetBytes({ width: 100, height: 50, pixelWidth: 100, pixelHeight: 50, resolution: 1 }), 20000);
    // A frame strip below 1 texel per logical px (G435) counts its pixels.
    assert.equal(recolourBudgetBytes({ width: 400, height: 200, pixelWidth: 100, pixelHeight: 50, resolution: 0.25 }), 20000);
    const src = readFileSync(join(root, 'public/js/street-render.js'), 'utf8');
    // Layers behind the middleground load the 2x files directly.
    assert.match(src, /const far = middleLayerZ !== null && \(layer\.z \?\? li\) < middleLayerZ;/);
    assert.match(src, /textureFromUrl\(farUrl, \{ raw: true \}\)/);
  });

  it('the restoration diorama uses the 2x WebPs (drawn far below 2x size, no 3x needed)', () => {
    const html = readFileSync(join(root, 'public/restoration/index.html'), 'utf8');
    assert.doesNotMatch(html, /decos\/groddle\/[^"]+\.png/);
    assert.match(html, /decos\/groddle\/bush_3\.webp/);
  });

  it('the generated list matches plan.json', () => {
    const hires = plan.decos.filter((r) => r.hires && !r.big).map((r) => r.name);
    const big = plan.decos.filter((r) => r.hires && r.big).map((r) => r.name);
    assert.deepEqual([...HIRES_DECOS], hires);
    assert.deepEqual([...HIRES_DECOS_BIG], big);
  });
});
