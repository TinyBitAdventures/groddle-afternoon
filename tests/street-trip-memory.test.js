/**
 * #284 (an iPhone tab killed by WebKit on the signpost trip from Ferncaster End to Froughtful Fen):
 * a street trip no longer holds two streets' art on the GPU. The street left behind is unloaded at
 * once (game.js enterStreet, js/textures.js unloadGpuCopies), a recoloured deco's original goes
 * when its copy is baked, and a phone bakes the copies at its render cap, not the art's 2x
 * (js/street-render.js recolourBakeResolution). WebKit at iPhone size, the trip's peak footprint:
 * 2.0 to 2.2 GB before, 1.3 to 1.5 GB after (three runs each).
 * Run: node --test tests/street-trip-memory.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recolourBakeResolution, recolourStats } from '../public/js/street-render.js?v=dfd6d798';
import { PHONE_RENDER_RESOLUTION, MAX_RENDER_RESOLUTION, resolutionCap } from '../public/js/render-density.js?v=20f9f1ee';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const render = readFileSync(join(root, 'public/js/street-render.js'), 'utf8');

describe('#284: recoloured deco copies bake at the device render cap', () => {
  it('a phone bakes a 2x deco at 1; a computer keeps the art resolution', () => {
    const phone = resolutionCap({ device: 'phone' });
    const computer = resolutionCap({ device: 'computer' });
    assert.equal(phone, PHONE_RENDER_RESOLUTION);
    assert.equal(recolourBakeResolution(2, phone), 1);
    assert.equal(recolourBakeResolution(2, computer), 2, 'desktop copies are as sharp as before');
    assert.equal(recolourBakeResolution(3, MAX_RENDER_RESOLUTION), 3);
    assert.equal(recolourBakeResolution(2, resolutionCap({ device: 'phone', density: '4' })), 2, '?density=4 lifts the cap');
    // A frame strip below 1 texel per logical px (G435) keeps its own resolution.
    assert.equal(recolourBakeResolution(0.25, phone), 0.25);
    // No cap (the level builder's views): the art's resolution.
    assert.equal(recolourBakeResolution(2), 2);
    assert.equal(recolourBakeResolution(2, 0), 2);
    assert.equal(recolourBakeResolution(undefined, 1), 1);
  });

  it('game.js passes the cap; the bake uses it and frees the original image\'s GPU copy', () => {
    assert.match(game, /buildStreetView\(data, PIXI, \{[\s\S]{0,200}bakeResolutionCap: RENDER_CAP,/);
    assert.match(render, /resolutionCap: Number\(opts\.bakeResolutionCap\) \|\| Infinity/);
    assert.match(render, /resolution: recolourBakeResolution\(base\.resolution, cap\),/);
    assert.equal((render.match(/bakeRecolour\(PIXI, renderer, [^)]*, cache\.resolutionCap\)/g) || []).length, 2, 'the first bake and the rebake');
    assert.match(render, /if \(PIXI\.ImageSource && base instanceof PIXI\.ImageSource && !base\.destroyed\) base\.unload\(\);\n  return texture;/);
  });

  it('recolourStats counts entries, baked copies and their GPU MB', () => {
    const tex = (w, h) => ({ source: { pixelWidth: w, pixelHeight: h } });
    const cache = {
      entries: new Map([
        ['a', { texture: tex(1024, 512) }],
        ['b', { texture: null }],
        ['c', { texture: tex(512, 512) }],
      ]),
      bytes: 3 * 1048576,
      evictions: 1,
      rebakes: 2,
    };
    assert.deepEqual(recolourStats(cache), { entries: 3, baked: 2, gpuMB: 3, budgetMB: 3, evictions: 1, rebakes: 2 });
    assert.match(game, /recolourStats: \(\) => bgLayer\?\.recolourStats\?\.\(\) \|\| null,/);
  });
});

describe('#284: the street left behind leaves the GPU when the next one is built', () => {
  it('enterStreet unloads the old street art right after destroying its view', () => {
    assert.match(
      game,
      /bgLayer\.destroy\(\{ children: true \}\);\n\s*\/\/ #284[^\n]*\n\s*textureUrls\.unloadGpuCopies\(\{ match: STREET_ART_URL, managed: app\?\.renderer\?\.texture\?\.managedTextures \}\);\n\s*\}\n\s*const available = await loadDecoManifest\(\);/
    );
  });
});
