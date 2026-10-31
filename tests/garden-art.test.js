/**
 * The gardens are Tiny Speck's own garden art (Austin 2026-10-31: "Is the original garden/herbs
 * artwork available? Our recreated work doesn't look as good as the original."): garden_new.swf
 * (CC0 tinyspeck/glitch-items) rendered by tools/garden-art/build.mjs at 1x and 3x, put together
 * as glitch-client's GardenView.as and GardenPlotView.as did (js/garden-view.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GARDEN_ART } from '../public/js/garden-art.js?v=c947ccf4';
import { bedPieces, gardenLayout, gardenStyle, plotOrigin, plotPieces, PLOT_H, PLOT_W } from '../public/js/garden-view.js?v=bddf68c7';
import { SEED_CATALOG } from '../public/js/garden.js?v=9a8f8f72';
import { HIRES_SPRITES, FIRST_DRAW_SPRITES } from '../public/js/sprite-hires.js?v=f7ea0bd5';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

describe('garden art from garden_new.swf (tools/garden-art)', () => {
  it('the shipped files match garden.json and the generated modules (build.mjs --check)', () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/garden-art/build.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /tools\/garden-art: ok/);
  });

  it('has every symbol the client asked GardenSWFData for, each with a sharp 3x file', () => {
    const art = JSON.parse(readFileSync(join(root, 'tools/garden-art/garden.json'), 'utf8'));
    assert.equal(Object.keys(GARDEN_ART).length, 53);
    for (const n of ['dry', 'wet', 'seeds', 'seedling_dry', 'seedling_wet', 'seedling_fertilized', 'herb_seedling_dry', 'herb_seedling_wet',
      'herb_seedling_fertilized', 'harvested_dry', 'harvested_wet', 'depleted', 'strip_2_1', 'shimla_2_1', 'polcrop_2_4', 'polherb_3_5']) {
      assert.ok(GARDEN_ART[n], n);
    }
    // Every crop and herb the remake grows has its grown plant.
    for (const seed of Object.values(SEED_CATALOG)) assert.ok(GARDEN_ART[`garden_${seed.cropId}`], seed.cropId);
    for (const [file, row] of Object.entries(art.files)) {
      assert.equal(HIRES_SPRITES.get(file), row.hires, file);
      assert.ok(FIRST_DRAW_SPRITES.has(file), file);
      assert.ok(row.score >= 0.9 && row.minFrame >= 0.8, file);
    }
    // The base the plots are laid out by (GardenPlotView base_width/base_height, int).
    assert.deepEqual([PLOT_W, PLOT_H], [80, 23]);
  });
});

describe('gardens put together as GardenView.as did (js/garden-view.js)', () => {
  it('styles: home gardens polcrop/polherb by rows (garden_new.js onCultivated), street crop strip_1, street herb shimla_1', () => {
    assert.equal(gardenStyle({ gardenType: 'default', rows: 2, home: true }), 'polcrop_2');
    assert.equal(gardenStyle({ gardenType: 'herb', rows: 3, home: true }), 'polherb_3');
    assert.equal(gardenStyle({ gardenType: 'default', rows: 2 }), 'strip_1');
    assert.equal(gardenStyle({ gardenType: 'herb', rows: 2 }), 'shimla_1');
    assert.equal(gardenStyle({ gardenType: 'herb', rows: 2, style: 'apartment_2' }), 'apartment_2');
  });

  it('beds: the whole asset when there is one, else one tile per style column every 85 px, else none', () => {
    assert.deepEqual(bedPieces('polcrop_2', 4, 2), [{ name: 'polcrop_2_4', x: 0, y: 0 }]);
    assert.deepEqual(bedPieces('polherb_3', 5, 3), [{ name: 'polherb_3_5', x: 0, y: 0 }]);
    assert.deepEqual(bedPieces('polcrop_2', 2, 2), [{ name: 'polcrop_2_2', x: 0, y: 0 }]);
    assert.deepEqual(bedPieces('strip_1', 4, 2).map((b) => [b.name, b.x]), [['strip_2_1', 0], ['strip_2_1', 85], ['strip_2_1', 170], ['strip_2_1', 255]]);
    assert.deepEqual(bedPieces('shimla_1', 3, 2).map((b) => [b.name, b.x]), [['shimla_2_1', 0], ['shimla_2_1', 85], ['shimla_2_1', 170]]);
    assert.deepEqual(bedPieces('strip_1', 3, 5), []);
    assert.deepEqual(bedPieces('none', 4, 2), []);
    // Every garden the remake makes has a bed: the street pair and the six home cultivations.
    const homes = [[2, 2], [4, 2], [5, 3]];
    for (const type of ['default', 'herb']) {
      for (const [cols, rows] of homes) assert.ok(bedPieces(gardenStyle({ gardenType: type, rows, home: true }), cols, rows).length, `${type} ${cols}x${rows}`);
    }
    assert.ok(bedPieces(gardenStyle({ gardenType: 'default', rows: 2 }), 4, 2).length);
    assert.ok(bedPieces(gardenStyle({ gardenType: 'herb', rows: 2 }), 3, 2).length);
  });

  it('plots: 85 px apart, each row back 20 px up and 45 px right; keys "c-r" with r 1 at the back', () => {
    assert.deepEqual(plotOrigin('1-2', 4, 2), { x: 7, y: 20 });
    assert.deepEqual(plotOrigin('4-2', 4, 2), { x: 262, y: 20 });
    assert.deepEqual(plotOrigin('1-1', 4, 2), { x: 52, y: 0 });
    assert.deepEqual(plotOrigin('1-3', 5, 3), { x: 7, y: 40 });
    const layout = gardenLayout({ cols: 4, rows: 2, style: 'strip_1' });
    assert.equal(layout.plots.length, 8);
    // The box is the bed and the plot bases: the strip tiles end at 255 + 146.7.
    assert.ok(Math.abs(layout.box.x1 - (255 + GARDEN_ART.strip_2_1.w0)) < 0.01);
    assert.equal(layout.box.x0, 0);
  });

  it('plot pieces follow GardenPlotView.buildPlot for every state', () => {
    const p = (state, extra = {}) => ({ state, wet: false, ...extra });
    assert.deepEqual(plotPieces(p('clean')), { base: 'dry', grow: null });
    assert.deepEqual(plotPieces(p('clean', { wet: true })), { base: 'wet', grow: null });
    assert.deepEqual(plotPieces(p('clean'), { depleted: true }), { base: 'dry', grow: 'depleted' });
    assert.deepEqual(plotPieces(p('seeds')), { base: 'dry', grow: 'seeds' });
    assert.deepEqual(plotPieces(p('seeds'), { gardenType: 'herb' }), { base: 'dry', grow: 'seeds' });
    assert.deepEqual(plotPieces(p('shoots')), { base: 'dry', grow: 'seedling_dry' });
    assert.deepEqual(plotPieces(p('shoots', { wet: true })), { base: 'wet', grow: 'seedling_wet' });
    assert.deepEqual(plotPieces(p('shoots', { wet: true, fertilized: true })), { base: 'wet', grow: 'seedling_fertilized' });
    assert.deepEqual(plotPieces(p('shoots'), { gardenType: 'herb' }), { base: 'dry', grow: 'herb_seedling_dry' });
    assert.deepEqual(plotPieces(p('shoots', { wet: true }), { gardenType: 'herb' }), { base: 'wet', grow: 'herb_seedling_wet' });
    assert.deepEqual(plotPieces(p('shoots', { fertilized: true }), { gardenType: 'herb' }), { base: 'dry', grow: 'herb_seedling_fertilized' });
    assert.deepEqual(plotPieces(p('crop'), { cropId: 'tomato' }), { base: 'dry', grow: 'garden_tomato' });
    assert.deepEqual(plotPieces(p('crop', { wet: true }), { gardenType: 'herb', cropId: 'rubeweed' }), { base: 'wet', grow: 'garden_rubeweed' });
    assert.deepEqual(plotPieces(p('crop'), { cropId: 'no_such_crop' }), { base: 'dry', grow: null });
    // Harvested and growing plots keep their art in a worn-out garden (mature_level 4 over 5).
    assert.deepEqual(plotPieces(p('dirty'), { depleted: true }), { base: 'dry', grow: 'harvested_dry' });
    assert.deepEqual(plotPieces(p('dirty', { wet: true })), { base: 'wet', grow: 'harvested_wet' });
  });
});

describe('the game draws gardens from the original pieces', () => {
  const game = readFileSync(join(pub, 'game.js'), 'utf8');

  it('spawnGarden lays out the bed and plots from js/garden-view.js, home gardens with their home style', () => {
    assert.match(game, /import \{ PLOT_H as GARDEN_PLOT_H, PLOT_W as GARDEN_PLOT_W, gardenFrame, gardenLayout, gardenStyle, plotPieces \} from '\.\/js\/garden-view\.js\?v=[0-9a-f]{8}';/);
    assert.match(game, /gardenStyle\(\{ gardenType, rows: garden\.rows \|\| rows, home: Boolean\(opts\.detached\), style: opts\.style \}\)/);
    assert.match(game, /const pieces = plotPieces\(plot, \{ gardenType: garden\.gardenType, cropId: seed\?\.cropId, depleted: Boolean\(garden\.depleted\) \}\);/);
    assert.ok(!/assets\/sprites\/garden\/(plot_|bed_frame)/.test(game));
  });

  it('a worn-out home garden with plots still growing stays until they are picked (include/garden.js onDepleted)', () => {
    const homes = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
    assert.match(homes, /if \(garden\?\.plots && Object\.values\(garden\.plots\)\.some\(\(p\) => p && p\.state !== 'clean' && p\.state !== 'dirty'\)\) \{\n\s+if \(!garden\.depleted\) \{\n\s+garden\.depleted = true;/);
  });
});
