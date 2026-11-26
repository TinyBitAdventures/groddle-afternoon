/**
 * G1160 (Austin 2026-11-23, reversing part of G978): each Ticket to Paradise course paints its own sky
 * from its snaps (its location file's gradient where that survives), and Cloud Rings' rings are the
 * snaps' upright cloud hoops, lavender until flown through and gold after.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLOUD_RING_ART,
  CLOUD_RINGS_SCENERY,
  PARADISE_COURSES,
  PARADISE_SKIES,
  SLIP_N_SLIDE_MOON,
  paradiseSkyColorAt,
  paradiseSkyStops,
} from '../public/js/paradise-flight.js?v=2ca6d035';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const game = read('public/game.js');
const fn = (name) => {
  const at = game.indexOf(`function ${name}(`);
  return game.slice(at, game.indexOf('\n}\n', at));
};
const rgb = (c) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
const lum = (c) => { const [r, g, b] = rgb(c); return 0.299 * r + 0.587 * g + 0.114 * b; };
const sky = (id, t) => paradiseSkyColorAt(paradiseSkyStops(PARADISE_COURSES[id]), t);
const deco = (name) => existsSync(join(root, 'public/assets/decos/groddle', `${name}.webp`));

describe('G1160: each Paradise course paints its own sky', () => {
  it('the courses with snaps have their own, the rest keep Radial Heights\' 222E', () => {
    for (const id of ['cloud_rings', 'mountain_scaling', 'bippity_bop', 'arbor_hollow', 'slip_n_slide', 'cloud_flight', 'sky_plunge', 'starlit_night']) {
      assert.ok(PARADISE_SKIES[id], id);
      assert.notEqual(sky(id, 0), 0x00222e, id);
    }
    for (const id of ['radial_heights', 'aerial_boost', 'updraft', 'drafty_uplift']) {
      assert.equal(PARADISE_SKIES[id], undefined, id);
      assert.equal(sky(id, 0), 0x00222e, id);
      assert.equal(sky(id, 1), 0x00222e, id);
    }
    // Abysmal Thrill keeps its G79 Snap palette.
    assert.equal(sky('abysmal_thrill', 0), PARADISE_COURSES.abysmal_thrill.palette[0]);
    for (const [id, entry] of Object.entries(PARADISE_SKIES)) {
      assert.equal(entry.stops[0][0], 0, id);
      assert.equal(entry.stops[entry.stops.length - 1][0], 1, id);
      assert.ok(entry.stops.every(([at], i) => i === 0 || at > entry.stops[i - 1][0]), `${id}: stops in order`);
    }
  });

  it('a course\'s location gradient wins: Starlit Night is GHFCVOD2GN631RJ\'s', () => {
    const street = JSON.parse(read('public/assets/streets/GHFCVOD2GN631RJ.json'));
    assert.equal(sky('starlit_night', 0), parseInt(street.gradient.top, 16));
    assert.equal(sky('starlit_night', 1), parseInt(street.gradient.bottom, 16));
  });

  it('the colours read as the snaps do', () => {
    // Cloud Rings: violet over the top to a gold horizon.
    const [vr, vg, vb] = rgb(sky('cloud_rings', 0));
    assert.ok(vb > vr && vr > vg, 'violet top');
    const [gr, gg, gb] = rgb(sky('cloud_rings', 0.95));
    assert.ok(gr > 0xe0 && gr > gg && gg > gb, 'gold horizon');
    // Mountain Scaling and Cloud Flight: a light blue day; Arbor Hollow blue over the canopy, dark below.
    for (const id of ['mountain_scaling', 'cloud_flight', 'arbor_hollow', 'sky_plunge']) {
      const [r, g, b] = rgb(sky(id, 0));
      assert.ok(b > r && g > r && lum(sky(id, 0)) > 110, `${id}: blue top`);
    }
    assert.ok(lum(sky('arbor_hollow', 0.6)) < 40, 'Arbor Hollow: the forest is dark');
    // Bippity Bop: lavender up top, peach low down.
    const [lr, , lb] = rgb(sky('bippity_bop', 0.2));
    assert.ok(lb > lr, 'lavender');
    const [pr, pg, pb] = rgb(sky('bippity_bop', 0.85));
    assert.ok(pr > pg && pg > pb, 'peach');
    // Slip 'N Slide: a dark night sky, never paler than the snow (the remake had it the other way round).
    assert.ok(lum(sky('slip_n_slide', 0)) < 50 && lum(sky('slip_n_slide', 0.6)) < 90);
    assert.match(game, /slip_n_slide: 0xdce8e9/, 'under the hills is snow, not a navy band');
  });

  it('paints the stops and the snaps\' stars', () => {
    const paint = fn('paintParadiseSky');
    assert.match(paint, /paradiseSkyColorAt\(stops, index \/ Math\.max\(1, bands - 1\)\)/);
    assert.match(paint, /const own = PARADISE_SKIES\[course\.id\];/);
    assert.equal(paradiseSkyColorAt([[0, 0x000000], [1, 0xffffff]], 0.5), 0x808080);
    assert.equal(paradiseSkyColorAt([[0, 0x102030], [0.5, 0x405060], [1, 0xffffff]], 0.25), 0x283848);
    assert.ok(PARADISE_SKIES.cloud_rings.stars.bottom < 0.5, 'Cloud Rings\' stars are in the violet part only');
    assert.equal(PARADISE_SKIES.mountain_scaling.stars, null, 'no stars by day');
  });

  it('Slip \'N Slide has its crescent moon, Tiny Speck\'s moon deco, and no pale mountain band', () => {
    assert.ok(deco(SLIP_N_SLIDE_MOON.sprite));
    assert.ok(SLIP_N_SLIDE_MOON.y < 420 && SLIP_N_SLIDE_MOON.x > 0 && SLIP_N_SLIDE_MOON.x < PARADISE_COURSES.slip_n_slide.width);
    const slip = fn('buildSlipBackground');
    assert.match(slip, /addSlipRecoveredDeco\(root, SLIP_N_SLIDE_MOON\)/);
    assert.doesNotMatch(slip, /mountains\.poly|moon\.circle/);
    // The snow runs on under the course, its edge line out of view.
    assert.match(slip, /const terrainPoints = \[0, course\.height \+ PARADISE_SKY_BELOW\];/);
  });

  it('Cloud Rings: the sun\'s glow at the start, purple mountains and lavender cloud from CC0 decos', () => {
    assert.ok(deco(CLOUD_RINGS_SCENERY.sun.deco));
    assert.ok(CLOUD_RINGS_SCENERY.sun.x < PARADISE_COURSES.cloud_rings.width / 4, 'the sun is on the left, by the start');
    for (const [name] of CLOUD_RINGS_SCENERY.decos) assert.ok(deco(name), name);
    const mountains = CLOUD_RINGS_SCENERY.decos.filter(([name]) => /mountain/.test(name));
    assert.ok(mountains.length >= 4 && mountains.every(([, , , , tint]) => { const [r, g, b] = rgb(tint); return b > r && r > g; }), 'purple mountains');
    assert.doesNotMatch(fn('buildCloudRingsBackground'), /mountains\.poly/);
  });

  it('Cloud Rings\' rings are one made cloud hoop each, recorded with its provenance', () => {
    const ring = fn('spawnCloudRing');
    assert.match(ring, /textureFromUrl\(`assets\/decos\/groddle\/\$\{CLOUD_RING_ART\.sprite\}\.png`\)/);
    assert.doesNotMatch(ring, /ellipse|cloudRingPuffLayout|sparkle/);
    const made = JSON.parse(read('tools/provenance/made-decos.json')).art[CLOUD_RING_ART.sprite];
    assert.ok(made && made.scene && made.code === 'public/js/paradise-flight.js');
    assert.equal(made.h, CLOUD_RING_ART.height);
    assert.ok(read(made.code).includes(`'${CLOUD_RING_ART.sprite}'`));
    assert.match(read('public/js/deco-new-list.js'), /"gz_ai_cr_ring"/);
  });

  it('Beam Me Down\'s sky is the snaps\' charcoal to deep purple', () => {
    const beam = read('public/js/features/puzzle-scenes-feature.js');
    assert.match(beam, /export const BEAM_SKY = Object\.freeze\(\[\[0, '#1e2c2f'\],/);
    assert.match(beam, /skyTexture\(PIXI, scene\.height, BEAM_SKY\)/);
  });
});
