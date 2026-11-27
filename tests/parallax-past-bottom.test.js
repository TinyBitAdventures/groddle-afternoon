/**
 * #483 (Sylvan Grove, GCR10NQRPKJ16H6): sky showed between the ground and the bottom rock strip, and
 * closed on a jump. The remake's camera runs past a street's bottom to keep the feet above the pack
 * (movement.js cameraWorldHeightForGround), and parallaxLayerOffset carried each layer's slide on
 * along the same line there: Sylvan Grove's front dirt (middleplus, 850 tall on a 1000 px street)
 * slid down off the grass, and a layer taller than its street rose off the bottom. Glitch's camera
 * never left the street (CameraMan.as 451-453), so past either edge every layer now holds still
 * where the slide left it: its bottom on the street's bottom, as the ground skirt draws it.
 * Run: node --test tests/parallax-past-bottom.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerIsDrawn, parallaxLayerOffset, skirtBandOffset } from '../public/js/street-render.js?v=a175beef';

const here = dirname(fileURLToPath(import.meta.url));
const streetsDir = join(here, '../public/assets/streets');

/** Every drawn parallax layer (street-render.js: not the middleground, with a canvas size) of every street. */
function streets() {
  const out = [];
  for (const f of readdirSync(streetsDir)) {
    if (!/^[GL][A-Z0-9]+\.json$/.test(f)) continue;
    const s = JSON.parse(readFileSync(join(streetsDir, f), 'utf8'));
    if (!s.bounds) continue;
    const W = s.bounds.r - s.bounds.l;
    const H = s.bounds.b - s.bounds.t;
    const layers = (s.layers || []).filter((l) => layerIsDrawn(l) && l.id !== 'middleground' && l.w > 0 && l.h > 0);
    out.push({ tsid: f.replace(/\.json$/, ''), W, H, layers });
  }
  return out;
}

// Desktop and phone views (world px): a 1280 x 800 window and a portrait phone's short view.
const VIEWS = [[1430, 493], [960, 408], [402, 300]];
// The camera past the bottom (cameraBottomSlack is at most 40; a low ground can add more) and above the top.
const PAST = [0.5, 10, 40, 120, 400];

describe('#483: past a street\'s bottom every layer holds still against the ground', () => {
  const all = streets();

  it('Sylvan Grove: the front dirt stays on the bottom with the camera below the street', () => {
    const grove = all.find((s) => s.tsid === 'GCR10NQRPKJ16H6');
    const dirt = grove.layers.find((l) => l.id === 'middleplus');
    assert.deepEqual([dirt.h, grove.H], [850, 1000], 'the reported layer: 850 tall on a 1000 px street');
    const [vpW, vpH] = VIEWS[0];
    const maxY = grove.H - vpH;
    for (const past of PAST) {
      const at = parallaxLayerOffset(dirt, 1000, maxY + past, vpW, vpH, grove.W, grove.H);
      assert.equal(at.y + dirt.h, grove.H, `camera ${past} px below: the dirt's bottom on the street's`);
    }
  });

  it('no layer on any street opens a gap or rises with the camera past the bottom or above the top', () => {
    let checked = 0;
    let streetsChecked = 0;
    const bad = [];
    for (const s of all) {
      let any = false;
      for (const [vpW, vpH] of VIEWS) {
        const maxY = s.H - vpH;
        if (!(maxY > 0)) continue;
        const camX = Math.max(0, (s.W - vpW) / 2);
        for (const layer of s.layers) {
          any = true;
          const atBottom = parallaxLayerOffset(layer, camX, maxY, vpW, vpH, s.W, s.H).y;
          const atTop = parallaxLayerOffset(layer, camX, 0, vpW, vpH, s.W, s.H).y;
          if (Math.abs(atBottom + layer.h - s.H) > 1e-6) bad.push(`${s.tsid} ${layer.id}: bottom ${atBottom + layer.h} at maxY`);
          for (const past of PAST) {
            checked++;
            const below = parallaxLayerOffset(layer, camX, maxY + past, vpW, vpH, s.W, s.H).y;
            if (below !== atBottom) bad.push(`${s.tsid} ${layer.id} view ${vpW}x${vpH}: moved ${below - atBottom} px, ${past} px below`);
            const above = parallaxLayerOffset(layer, camX, -past, vpW, vpH, s.W, s.H).y;
            if (above !== atTop) bad.push(`${s.tsid} ${layer.id} view ${vpW}x${vpH}: moved ${above - atTop} px, ${past} px above`);
          }
        }
      }
      if (any) streetsChecked++;
    }
    assert.deepEqual(bad.slice(0, 10), [], `${bad.length} layers move against the ground`);
    assert.ok(streetsChecked > 1000 && checked > 50000, `${streetsChecked} streets, ${checked} cases`);
  });

  it('a street-sized layer stays at 0 (Hechey Track) and the ground skirt draws each layer where it holds', () => {
    for (const s of streets()) {
      const vpW = 960;
      const vpH = 408;
      if (!(s.H - vpH > 0)) continue;
      for (const layer of s.layers) {
        const at = parallaxLayerOffset(layer, 0, s.H - vpH + 40, vpW, vpH, s.W, s.H);
        if (layer.h === s.H) assert.equal(at.y, 0, `${s.tsid} ${layer.id}`);
        const band = skirtBandOffset(layer, s.W, s.H);
        if (band) assert.ok(Math.abs(band.y - at.y) < 1e-6, `${s.tsid} ${layer.id}: skirt ${band.y}, layer ${at.y}`);
      }
    }
  });
});
