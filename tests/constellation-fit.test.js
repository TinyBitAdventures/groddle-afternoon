/**
 * Ticket 61 (Friendly, 2026-11-03): in Constellation some stars sat under the top pills,
 * the minimap, the open Activity panel and the EXIT door. The scene is rebuilt (no
 * archived geometry), so the piggy is fitted into the largest part of the view no window
 * covers (js/puzzle-scenes.js fitSky) and the field stars are scattered over the clear
 * sky around it (fieldStarsIn); features/puzzle-scenes-feature.js layoutSky measures the
 * windows and fits again when they change.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONSTELLATION, SKY_BOX, doorBox, fieldStars, fieldStarsIn, fitSky, skyPoint } from '../public/js/puzzle-scenes.js?v=c47b9319';

const root = join(import.meta.dirname, '..');
const inside = (p, o, r = 0) => p.x + r > o.x && p.x - r < o.x + o.w && p.y + r > o.y && p.y - r < o.y + o.h;
// Friendly's window (1440x707, Modern, Activity open), in scene pixels: the view is
// x -200..900, y 0..408; the pills along the top, the minimap and the Activity panel on the right.
const AREA = { x: -196, y: 0, w: 1092, h: CONSTELLATION.floorY - 44 };
const FRIENDLY = [
  { x: -200, y: -10, w: 290, h: 46 }, // stats pill
  { x: 248, y: -10, w: 196, h: 46 }, // the street's name
  { x: 568, y: -10, w: 340, h: 46 }, // actions pill
  { x: 500, y: 26, w: 172, h: 98 }, // minimap
  { x: 655, y: 30, w: 260, h: 470 }, // Activity panel
];

describe('ticket 61: every star in Constellation can be seen and clicked', () => {
  it('the piggy fits clear of every window and the EXIT door, big enough to click', () => {
    const obstacles = [...FRIENDLY, doorBox()];
    const fit = fitSky({ area: AREA, obstacles });
    assert.ok(fit.scale >= 0.6 && fit.scale <= 1, `scale ${fit.scale}`);
    for (const [i, s] of CONSTELLATION.stars.entries()) {
      const p = skyPoint(fit, s);
      for (const o of obstacles) assert.ok(!inside(p, o, 8), `star ${i} at ${p.x},${p.y} is under ${JSON.stringify(o)}`);
      assert.ok(inside(p, AREA), `star ${i} in the view`);
    }
    const field = fieldStarsIn(AREA, obstacles, CONSTELLATION.stars.map((s) => skyPoint(fit, s)));
    assert.ok(field.length >= 30, `${field.length} field stars`);
    for (const f of field) for (const o of obstacles) assert.ok(!inside(f, o), `field star ${f.x},${f.y}`);
  });

  it('with nothing in the way it keeps its own size (never larger)', () => {
    const fit = fitSky({ area: { x: -100, y: 0, w: 900, h: 262 }, obstacles: [] });
    assert.equal(fit.scale, 1);
    assert.ok(SKY_BOX.w < CONSTELLATION.width && SKY_BOX.h <= CONSTELLATION.floorY);
  });

  it('no field star sits behind the EXIT door, before or after the fit', () => {
    const door = doorBox(CONSTELLATION, 0);
    for (const f of fieldStars(CONSTELLATION)) assert.ok(!(f.x > door.x && f.x < door.x + door.w && f.y > door.y), `${f.x},${f.y}`);
  });

  it('the feature measures the real windows, fits on a change and stops once the piggy is closed', () => {
    const f = readFileSync(join(root, 'public/js/features/puzzle-scenes-feature.js'), 'utf8');
    const html = readFileSync(join(root, 'public/play/index.html'), 'utf8');
    const made = readFileSync(join(root, 'public/js/ui/street-minimap.js'), 'utf8');
    for (const id of ['hud-stats', 'street-nameplate', 'street-minimap', 'local-chat-dock', 'play-context']) {
      assert.ok(f.includes(`#${id}`), `layoutSky looks at #${id}`);
      assert.ok(html.includes(`id="${id}"`) || made.includes(`root.id = '${id}'`), `#${id} exists`);
    }
    assert.match(f, /SKY_COVERS = \[/);
    assert.match(f, /!active\.run\?\.complete && \(!active\.skyAt/);
    assert.match(f, /skyLayer\.addChild\(spr\)/);
  });
});
