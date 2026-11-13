// Far street layers (behind the middleground) take their sharp copies at one density that fits the
// street's FAR_SHARP_BUDGET_BYTES (js/street-render.js farSharp over FAR_SLACKS), and a WebP sized
// for a nearer placement loads downscaled to the far need (js/deco-hires.js sharpDeco, `?r=`;
// js/textures.js resizeImage). Before, Ilmenskie at R 4 wanted 202 MB, admitted 96 MB of it
// (cave_smoke@16.25x at 23 MB first) and left 20 copies on their 2x files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));

async function farPicks(tsid, R) {
  const hires = await import('../public/js/deco-hires.js?v=c110b16e');
  const sr = await import('../public/js/street-render.js?v=0f1293df');
  const street = JSON.parse(readFileSync(join(pub, `assets/streets/${tsid}.json`), 'utf8'));
  const mz = street.layers.findIndex((l) => l.id === 'middleground');
  const mlz = street.layers[mz].z ?? mz;
  const wanted = [];
  street.layers.forEach((layer, li) => {
    if (!sr.layerIsDrawn(layer)) return;
    const far = (layer.z ?? li) < mlz;
    const blur = sr.flashBlurSize(layer.filters?.blur);
    if (!far && !blur) return;
    for (const d of layer.decos || []) {
      const art = manifest.has(d.sprite) ? d.sprite : sr.DECO_TWINS[d.sprite] || d.sprite;
      const url = `assets/decos/groddle/${art}.png`;
      if (hires.isSharpDeco(url)) wanted.push([url, far, blur]);
    }
  });
  for (const farSlack of hires.FAR_SLACKS) {
    const picks = wanted.map(([url, far, blur]) => hires.sharpDeco(url, R, { far, farSlack, bigTextures: true, blurDensity: blur > 0 ? sr.blurBakeResolution(blur, R) : 0 })).filter(Boolean);
    const admitted = hires.admitSharp(picks);
    if (picks.every((p) => admitted.has(p.url)) || farSlack === hires.FAR_SLACKS.at(-1)) return { picks, admitted, farSlack };
  }
  return null;
}

test('the far slack ladder runs from SHARP_SLACK to twice it in eighth-octave steps', async () => {
  const { FAR_SLACKS, SHARP_SLACK } = await import('../public/js/deco-hires.js?v=c110b16e');
  assert.equal(FAR_SLACKS.length, 9);
  assert.equal(FAR_SLACKS[0], SHARP_SLACK);
  assert.ok(Math.abs(FAR_SLACKS.at(-1) - 2 * SHARP_SLACK) < 1e-9);
});

test('Ilmenskie and Oktyabrya fit every far copy at R 4, and a phone keeps the same few', async () => {
  for (const tsid of ['GIF102FDNU11314', 'GIF101NCNU112O2']) {
    const { picks, admitted, farSlack } = await farPicks(tsid, 4);
    assert.ok(picks.length >= 25, `${tsid}: ${picks.length}`);
    assert.equal(admitted.size, new Set(picks.map((p) => p.url)).size, `${tsid}: all admitted`);
    assert.ok(farSlack < 2.1, `${tsid}: slack ${farSlack}`);
    // On a phone (R 1) the far needs are small: the few copies it took before, at the first slack.
    const phone = await farPicks(tsid, 1);
    assert.equal(phone.farSlack, 4 / 3);
    const few = new Set(phone.picks.map((p) => p.url)).size;
    assert.ok(few <= 6, `${tsid}: ${few} at R 1`);
  }
});

test('a far WebP sized for a nearer placement loads downscaled to the far need', async () => {
  const { sharpDeco } = await import('../public/js/deco-hires.js?v=c110b16e');
  const url = 'assets/decos/groddle/bck_hill_16.png';
  const near = sharpDeco(url, 4, { bigTextures: true });
  const far = sharpDeco(url, 4, { far: true, farSlack: 2.0566, bigTextures: true });
  assert.match(far.url, /^assets\/decos\/groddle\/bck_hill_16@[\d.]+x\.webp\?r=[\d.]+$/);
  assert.ok(far.resolution >= far.need - 1e-6 && far.resolution < Number(/@([\d.]+)x/.exec(far.url)[1]));
  assert.equal(far.width, Math.round(far.w * Number(/\?r=([\d.]+)/.exec(far.url)[1])));
  assert.ok(far.bytes < (near?.bytes ?? Infinity));
  const src = readFileSync(join(pub, 'js/textures.js'), 'utf8');
  assert.match(src, /opts\.width > 0 && opts\.height > 0 \? resizeImage\(url, opts\) : decodeImage\(url\)/);
  const sr = readFileSync(join(pub, 'js/street-render.js'), 'utf8');
  assert.match(sr, /const sharpTexture = \(pick\) => textureFromUrl\(pick\.url, pick\.width/);
  assert.match(sr, /for \(const slack of FAR_SLACKS\)/);
});
