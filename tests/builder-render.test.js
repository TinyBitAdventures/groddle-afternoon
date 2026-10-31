/**
 * LEVEL BUILDER P4 (spec 8.5, 14): the render endpoint's renderer. /builder-render/ draws a street
 * with the game's own renderer in Chrome (tools/builder/render.mjs, under the browser lock), and a
 * render of Hechey Track at scale 0.25 matches the stored picture to within 1% of pixels (a channel
 * more than 32 levels off, the P1 measure). Overlays draw over it; the frame math is pure.
 *
 * Refresh the picture after a deliberate change to the renderer:
 *   GRODDLE_RENDER_GOLDEN_WRITE=1 node --test tests/builder-render.test.js
 */
import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from '../tools/repos.mjs';
import { createRenderer, renderInput, RENDERS_ANYWAY } from '../tools/builder/render.mjs';
import { loadValidatorContext } from '../tools/builder/validator-context.mjs';
import { forkStreet } from '../public/js/builder/zone.js?v=6a3db28e';
import { DECO_TWINS } from '../public/js/street-render.js?v=ae048a15';

const GOLDEN = join(GAME_DIR, 'tests/fixtures/builder/hechey-track-0.25.png');
const pub = (p) => join(GAME_DIR, 'public', p);
let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

function hecheyZone() {
  const shipped = JSON.parse(readFileSync(pub('assets/streets/GLI2V0UN7RD1T2J.json'), 'utf8'));
  const catalog = new Map(JSON.parse(readFileSync(pub('assets/content/deco-catalog.json'), 'utf8')).decos.map((d) => [d.name, d]));
  const fork = forkStreet(shipped, { zoneId: 'golden', key: 'hechey', label: 'Hechey Track', tsid: 'GZ0000000000001', catalog, twins: DECO_TWINS });
  return { format: 'groddle-zone/1', id: 'golden', title: 'Golden', rev: 1, hub: fork.hub, streets: [fork.draftStreet], edits: [], assets: fork.assets };
}

describe('the render page\'s frame (pure)', async () => {
  const { renderFrame, gridLines } = await import('../public/builder-render/render.js?v=9dcb8698');
  const street = { bounds: { l: -1500, r: 1500, t: -1000, b: 0 } };
  it('full: the whole street at the scale, at most 4096 px a side', () => {
    const f = renderFrame(street, { view: 'full', scale: 0.25 });
    assert.deepEqual([f.width, f.height, f.scale], [750, 250, 0.25]);
    const big = renderFrame({ bounds: { l: 0, r: 8000, t: -6000, b: 0 } }, { view: 'full', scale: 1 });
    assert.ok(big.width <= 4096 && big.height <= 4096);
  });
  it('camera: the view centred on the world point, kept inside the street', () => {
    const f = renderFrame(street, { view: 'camera', x: 0, y: -300, w: 960, h: 540, scale: 1 });
    assert.deepEqual(f.cam, { x: 1500 - 480, y: 700 - 270 });
    assert.deepEqual([f.width, f.height], [960, 540]);
    const edge = renderFrame(street, { view: 'camera', x: -1500, y: 0, scale: 0.5 });
    assert.deepEqual(edge.cam, { x: 0, y: 1000 - 540 });
  });
  it('grid: every 100 world px, labels where they fit', () => {
    const f = renderFrame(street, { view: 'full', scale: 0.25 });
    const g = gridLines(street, f);
    assert.equal(g.xs.length, 31);
    assert.equal(g.every, 500);
    assert.ok(g.xs.find((x) => x.value === -1500 && x.label));
  });
});

describe('render golden: Hechey Track at scale 0.25 (Chrome, under the browser lock)', { skip: !chromium && 'no playwright' }, () => {
  const renderer = createRenderer({ idleMs: 500, label: 'builder render golden test' });
  after(() => renderer.close());
  const ctx = loadValidatorContext();
  const zone = hecheyZone();

  it('draws the street as the stored picture, within 1% of pixels', { timeout: 300_000 }, async () => {
    const out = await renderer.render(renderInput(zone, 'hechey', ctx, { view: 'full', scale: 0.25, overlay: [] }));
    assert.deepEqual([out.width, out.height], [1500, 250]);
    assert.equal(out.png.subarray(1, 4).toString(), 'PNG');
    if (process.env.GRODDLE_RENDER_GOLDEN_WRITE === '1' || !existsSync(GOLDEN)) writeFileSync(GOLDEN, out.png);
    const d = await renderer.diff(out.png, readFileSync(GOLDEN));
    assert.ok(d.sameSize, 'same size');
    assert.ok(d.ratio < 0.01, `${(d.ratio * 100).toFixed(2)}% of pixels differ`);
  });

  it('overlays draw over it (geometry, grid and findings change the picture)', { timeout: 300_000 }, async () => {
    const out = await renderer.render(renderInput(zone, 'hechey', ctx, { view: 'full', scale: 0.25, overlay: ['geometry', 'grid', 'findings'] }));
    const d = await renderer.diff(out.png, readFileSync(GOLDEN));
    assert.ok(d.ratio > 0.02, `${(d.ratio * 100).toFixed(2)}% differ`);
  });

  it('a fatal finding blocks the render, missing art does not', () => {
    const broken = structuredClone(zone);
    broken.streets[0].street.platforms = [];
    assert.throws(() => renderInput(broken, 'hechey', ctx, {}), (e) => e.code === 'builder_invalid' && e.status === 422);
    assert.ok(RENDERS_ANYWAY.has('AST-001'));
  });
});
