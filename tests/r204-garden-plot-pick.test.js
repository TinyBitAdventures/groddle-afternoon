/**
 * Report #204: in a 3 x 5 herb garden a click on the back or front row picked the middle plot.
 * Rows are plot_height + PLOT_PADD_TOP apart (GardenView.as 159-160: 14 px at 0.7) and plot
 * bases 16 px tall, so pickInteractableAt's 8 px padded boxes overlap the rows beside them; by
 * smallest area the back row (its 24 px reach) always lost and the middle row won the tie with the
 * front. Now among the plots hit, the one whose base is under the pointer wins
 * (js/garden-view.js nearestPlotIndex); the original hit-tested each GardenPlotView on its own
 * (GardenView.as 139-162). Hover, left click, right click (game.js pickInteractableAt) and a
 * dragged Guano (garden-guano-feature.js plotAt) share it.
 * Run: node --test tests/r204-garden-plot-pick.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gardenLayout, gardenStyle, nearestPlotIndex } from '../public/js/garden-view.js?v=04fe8467';
import { plotHit } from '../public/js/features/garden-guano-feature.js?v=423845f7';

const GARDEN_BACK_ROW_REACH = 24; // game.js: a back-row plot's reach over its plant
const PAD = 8; // pickInteractableAt's spriteWorldHitBox pad

/** The plot cells as game.js places them (bottom centre of each base, world px), registration order. */
function cells({ cols, rows, gardenType = 'herb', home = true }) {
  const layout = gardenLayout({ cols, rows, style: gardenStyle({ gardenType, rows, home }) });
  const left = 1000;
  const top = 500;
  return layout.plots.map((p) => ({
    key: p.key,
    classId: 'garden_plot',
    sprite: {
      x: left + p.x + layout.plotW / 2,
      y: top + p.y + layout.plotH,
      _gardenHitW: layout.plotW,
      _gardenBaseH: layout.plotH,
      _gardenHitH: layout.plotH + (p.r === 1 ? GARDEN_BACK_ROW_REACH : 0),
    },
  }));
}

/** game.js pickInteractableAt for plots: padded boxes, smallest area first (stable), then the plot rule. */
function pick(targets, x, y, { old = false } = {}) {
  const hits = [];
  for (const t of targets) {
    const s = t.sprite;
    const w = s._gardenHitW;
    const h = s._gardenHitH;
    const box = { left: s.x - w / 2 - PAD, top: s.y - h - PAD };
    box.right = box.left + w + PAD * 2;
    box.bottom = box.top + h + PAD * 2;
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) hits.push({ t, area: w * h * 0.15 });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.area - b.area);
  if (old) return hits[0].t;
  const plots = hits.map((h) => h.t);
  return plots[nearestPlotIndex(plots.map((t) => t.sprite), x, y)];
}

const centre = (t) => ({ x: t.sprite.x, y: t.sprite.y - t.sprite._gardenBaseH / 2 });

describe('report #204: the plot under the pointer', () => {
  it('reproduces the report: by area the 3 x 5 back and front rows picked the middle plot', () => {
    const plots = cells({ cols: 5, rows: 3 });
    const at = (key) => plots.find((t) => t.key === key);
    for (const c of [1, 2, 3, 4, 5]) {
      for (const r of [1, 3]) {
        const p = centre(at(`${c}-${r}`));
        // A middle-row plot (the rows are skewed, so sometimes the next column's).
        assert.match(pick(plots, p.x, p.y, { old: true }).key, /-2$/, `old rule, plot ${c}-${r}`);
      }
    }
  });

  it('3 x 5 herb garden: a pointer at each plot\'s centre picks that plot', () => {
    const plots = cells({ cols: 5, rows: 3 });
    for (const t of plots) {
      const p = centre(t);
      assert.equal(pick(plots, p.x, p.y).key, t.key);
    }
  });

  it('every bed size, crop and herb, home and street: centres pick their own plot, the ground over the back row picks the back row', () => {
    for (const gardenType of ['default', 'herb']) {
      for (const home of [true, false]) {
        for (let rows = 1; rows <= 3; rows++) {
          for (let cols = 1; cols <= 6; cols++) {
            const plots = cells({ cols, rows, gardenType, home });
            const tag = `${gardenType} ${home ? 'home' : 'street'} ${cols}x${rows}`;
            for (const t of plots) {
              const p = centre(t);
              assert.equal(pick(plots, p.x, p.y).key, t.key, `${tag} centre ${t.key}`);
              // A little off centre still means the same plot.
              assert.equal(pick(plots, p.x - 12, p.y - 4).key, t.key, `${tag} up-left of ${t.key}`);
              assert.equal(pick(plots, p.x + 12, p.y + 4).key, t.key, `${tag} down-right of ${t.key}`);
              if (t.key.endsWith('-1')) {
                // The back row keeps its reach over its plant, where nothing else competes.
                assert.equal(pick(plots, t.sprite.x, t.sprite.y - t.sprite._gardenBaseH - 18).key, t.key, `${tag} over ${t.key}`);
              }
            }
          }
        }
      }
    }
  });

  it('a dragged Guano takes the same plot (plotHit, then the nearest base)', () => {
    const plots = cells({ cols: 5, rows: 3 });
    for (const t of plots) {
      const p = centre(t);
      const under = plots.filter((q) => plotHit(q, p.x, p.y));
      assert.equal(under[nearestPlotIndex(under.map((q) => q.sprite), p.x, p.y)].key, t.key);
    }
    assert.equal(nearestPlotIndex([], 0, 0), -1);
  });

  it('game.js and the Guano drag use the rule; hover and clicks share pickInteractableAt', () => {
    const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    const body = game.slice(game.indexOf('function pickInteractableAt('), game.indexOf('function createSpriteOutline('));
    assert.match(body, /nearestPlotIndex\(plots\.map\(\(t\) => t\.sprite\), worldX, worldY\)/);
    assert.match(game, /cell\._gardenBaseH = layout\.plotH;/);
    assert.match(game, /const hit = pickInteractableAt\(wx, wy\);\s*\n\s*if \(hit\) setHoverTarget\(hit\);/, 'hover');
    assert.match(game, /const best = pickInteractableAt\(sx, sy\);/, 'click');
    const guano = readFileSync(new URL('../public/js/features/garden-guano-feature.js', import.meta.url), 'utf8');
    assert.match(guano, /nearestPlotIndex\(plots\.map\(\(t\) => t\.sprite\), p\.x, p\.y\)/);
  });
});
