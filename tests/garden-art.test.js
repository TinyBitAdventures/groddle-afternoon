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
import { bedPieces, GARDEN_SCALE, gardenHalfWidth, gardenLayout, gardenMetrics, gardenStyle, plotOrigin, plotPieces, PLOT_H, PLOT_W } from '../public/js/garden-view.js?v=05651e76';
import { createCultivationState, cultivateDemoYard, cultivationDef, dispatcherRx, footprint, groundFixtures, homeStreetLayout, normalizeCultivationState, placementCheck, GATE_POST_HALF, SIGNPOST_POST_HALF } from '../public/js/home-cultivation.js?v=15295514';
import { DISPATCHER_HALF } from '../public/js/home-street-fixtures.js?v=088da201';
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
    // The base the plots are laid out by (GardenPlotView base_width/base_height after
    // base.width *= scale, kept as int): 80.9 x 23 at the garden scale 0.7.
    assert.equal(GARDEN_SCALE, 0.7);
    assert.deepEqual([PLOT_W, PLOT_H], [56, 16]);
    assert.deepEqual(gardenMetrics(1), { scale: 1, baseRight: 85, plotLeft: 7, plotRight: 5, plotTop: -3, plotW: 80, plotH: 23 });
    assert.deepEqual(gardenMetrics(), { scale: 0.7, baseRight: 59, plotLeft: 4, plotRight: 3, plotTop: -2, plotW: 56, plotH: 16 });
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

  it('beds: the whole asset when there is one, else one tile per style column every 85 px (59 at 0.7), else none', () => {
    assert.deepEqual(bedPieces('polcrop_2', 4, 2), [{ name: 'polcrop_2_4', x: 0, y: 0 }]);
    assert.deepEqual(bedPieces('polherb_3', 5, 3), [{ name: 'polherb_3_5', x: 0, y: 0 }]);
    assert.deepEqual(bedPieces('polcrop_2', 2, 2), [{ name: 'polcrop_2_2', x: 0, y: 0 }]);
    assert.deepEqual(bedPieces('strip_1', 4, 2, 1).map((b) => [b.name, b.x]), [['strip_2_1', 0], ['strip_2_1', 85], ['strip_2_1', 170], ['strip_2_1', 255]]);
    assert.deepEqual(bedPieces('strip_1', 4, 2).map((b) => [b.name, b.x]), [['strip_2_1', 0], ['strip_2_1', 59], ['strip_2_1', 118], ['strip_2_1', 177]]);
    assert.deepEqual(bedPieces('shimla_1', 3, 2).map((b) => [b.name, b.x]), [['shimla_2_1', 0], ['shimla_2_1', 59], ['shimla_2_1', 118]]);
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

  it('plots: 85 px apart, each row back 20 px up and 45 px right (59, 14 and 31 at 0.7); keys "c-r" with r 1 at the back', () => {
    assert.deepEqual(plotOrigin('1-2', 4, 2, 1), { x: 7, y: 20 });
    assert.deepEqual(plotOrigin('4-2', 4, 2, 1), { x: 262, y: 20 });
    assert.deepEqual(plotOrigin('1-1', 4, 2, 1), { x: 52, y: 0 });
    assert.deepEqual(plotOrigin('1-3', 5, 3, 1), { x: 7, y: 40 });
    assert.deepEqual(plotOrigin('1-2', 4, 2), { x: 4, y: 14 });
    assert.deepEqual(plotOrigin('4-2', 4, 2), { x: 181, y: 14 });
    assert.deepEqual(plotOrigin('1-1', 4, 2), { x: 35, y: 0 });
    const layout = gardenLayout({ cols: 4, rows: 2, style: 'strip_1' });
    assert.equal(layout.plots.length, 8);
    // The box is the bed and the plot bases: the strip tiles end at 177 + 146.7 x 0.7.
    assert.ok(Math.abs(layout.box.x1 - (177 + GARDEN_ART.strip_2_1.w0 * 0.7)) < 0.01);
    assert.equal(layout.box.x0, 0);
  });

  it('a home garden bed stays inside its proto\'s placement width, and its footprint is the drawn bed', () => {
    for (const proto of ['proto_crop_garden_small', 'proto_crop_garden_medium', 'proto_crop_garden_large', 'proto_herb_garden_small', 'proto_herb_garden_medium', 'proto_herb_garden_large']) {
      const def = cultivationDef(proto);
      const half = gardenHalfWidth({ gardenType: def.gardenType, cols: def.cols, rows: def.rows, home: true });
      assert.ok(half * 2 <= def.width, `${proto}: bed ${half * 2} in ${def.width}`);
      assert.equal(footprint(proto), half, proto);
    }
    assert.deepEqual(['proto_crop_garden_small', 'proto_crop_garden_medium', 'proto_crop_garden_large'].map(footprint), [104, 160, 206]);
    // Other cultivations keep the proto ghost width at 80%.
    assert.equal(footprint('proto_metal_rock'), Math.round(cultivationDef('proto_metal_rock').width * 0.4));
  });

  it('nothing is set down on the World Gate\'s or the signpost\'s post, the Magic Rock or the Butler Box', () => {
    const state = createCultivationState({ yardLeft: 4, yardRight: 4 });
    const layout = homeStreetLayout(state);
    const half = footprint('proto_crop_garden_medium');
    for (const f of groundFixtures(layout)) {
      for (const wx of [f.x1, (f.x1 + f.x2) / 2, f.x2, f.x1 - half + 1, f.x2 + half - 1]) {
        const r = placementCheck(state, 'proto_crop_garden_medium', Math.round(wx - layout.houseX));
        assert.equal(r.ok, false, `${f.id} at ${wx}`);
      }
    }
    const post = groundFixtures(layout).find((f) => f.id === 'signpost');
    assert.equal(post.x2 - post.x1, 2 * SIGNPOST_POST_HALF);
    const gate = groundFixtures(layout).find((f) => f.id === 'gate');
    assert.deepEqual(placementCheck(state, 'proto_crop_garden_medium', Math.round(gate.x2 - layout.houseX)).msg, 'Keep it clear of your World Gate.');
    assert.equal(gate.x2 - gate.x1, 2 * GATE_POST_HALF);
    // Any cultivation: under the signpost's arms is fine, on its post is not.
    const rockHalf = footprint('proto_metal_rock');
    assert.notEqual(placementCheck(state, 'proto_metal_rock', Math.round(post.x1 - layout.houseX) - rockHalf - 1).reason, 'signpost');
    assert.equal(placementCheck(state, 'proto_metal_rock', Math.round((post.x1 + post.x2) / 2 - layout.houseX)).reason, 'signpost');
    assert.equal(placementCheck(state, 'proto_patch', Math.round((gate.x1 + gate.x2) / 2 - layout.houseX)).msg, 'Keep it clear of your World Gate.');
  });

  it('a saved garden that no longer fits moves to the nearest spot that does; the dispatcher steps aside', () => {
    // A medium crop garden saved by the gate before the beds were drawn (and a rock behind it).
    const st = normalizeCultivationState({
      yardLeft: 3,
      items: [
        { id: 1, protoClass: 'proto_crop_garden_large', endClass: 'garden_new', rx: -560 },
        { id: 2, protoClass: 'proto_metal_rock', endClass: 'rock_metal_1', rx: 900 },
      ],
    });
    const layout = homeStreetLayout(st);
    const garden = st.items[0];
    assert.notEqual(garden.rx, -560);
    assert.equal(placementCheck(st, garden.protoClass, garden.rx, garden.id, { dispatcher: false }).ok, true);
    assert.equal(st.items[1].rx, 900, 'a rock that fits stays put');
    const disp = layout.houseX + dispatcherRx(st);
    const gx = layout.houseX + garden.rx;
    assert.ok(Math.abs(disp - gx) >= DISPATCHER_HALF + footprint(garden.protoClass), `dispatcher ${disp} vs garden ${gx}`);
    // A garden that fits is never moved.
    const ok = normalizeCultivationState({ yardLeft: 3, items: [{ id: 1, protoClass: 'proto_crop_garden_medium', endClass: 'garden_new', rx: 600 }] });
    assert.equal(ok.items[0].rx, 600);
  });

  it('the demo yard fits, gardens and all', () => {
    const st = cultivateDemoYard(createCultivationState({}));
    for (const item of st.items) assert.equal(placementCheck(st, item.protoClass, item.rx, item.id).ok, true, `${item.protoClass}@${item.rx}`);
  });
});

describe('the game draws gardens from the original pieces', () => {
  const game = readFileSync(join(pub, 'game.js'), 'utf8');

  it('spawnGarden lays out the bed and plots from js/garden-view.js, home gardens with their home style', () => {
    assert.match(game, /import \{ GARDEN_SCALE, PLOT_H as GARDEN_PLOT_H, PLOT_W as GARDEN_PLOT_W, gardenFrame, gardenLayout, gardenStyle, plotPieces \} from '\.\/js\/garden-view\.js\?v=[0-9a-f]{8}';/);
    // Pieces at the garden scale about their origin (GardenPlotView base.width *= scale).
    assert.match(game, /spr\.scale\.set\(scale\);\n\s+spr\.position\.set\(f\.ox \* scale, f\.oy \* scale\);/);
    assert.match(game, /gardenStyle\(\{ gardenType, rows: garden\.rows \|\| rows, home: Boolean\(opts\.detached\), style: opts\.style \}\)/);
    assert.match(game, /const pieces = plotPieces\(plot, \{ gardenType: garden\.gardenType, cropId: seed\?\.cropId, depleted: Boolean\(garden\.depleted\) \}\);/);
    assert.ok(!/assets\/sprites\/garden\/(plot_|bed_frame)/.test(game));
  });

  it('a worn-out home garden with plots still growing stays until they are picked (include/garden.js onDepleted)', () => {
    const homes = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
    assert.match(homes, /if \(garden\?\.plots && Object\.values\(garden\.plots\)\.some\(\(p\) => p && p\.state !== 'clean' && p\.state !== 'dirty'\)\) \{\n\s+if \(!garden\.depleted\) \{\n\s+garden\.depleted = true;/);
  });
});
