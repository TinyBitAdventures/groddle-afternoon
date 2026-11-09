// The in-world sharpness audit's first batch (Austin, 2026-11-02; yardstick: device px per stored
// texel = world scale x the stage at Original zoom on a 2560 x 1440 monitor / stored density, soft
// over 1.2). The Rook's hover clip, the rooked halo and the 33 hi sign sheets were 1x rasters drawn at
// 2.07 (the Rook), 2.19 (the halo) and 2.52 (the signs); each now has a 3x render of Tiny Speck's
// CC0 vector SWF (tools/vector-sprites/rooks.json and hi-signs.json), swapped in on first draw. The
// overlays that were still sheets (the rooked swirl, poison, the love heart, Play Glitch, the trading
// bubble, fox bait, the dice, the petrified rock, the Hell Hole arrow, the Game of Crowns indicators and
// throbber) keep their FLA frames as SVG too (`vector: true`), drawn at the screen's density.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const vs = join(root, 'tools/vector-sprites');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** rook_fly_forward.swf sprite 17's distinct frames: every frame is doubled but 18 and 52 (68 frames, 36 cells). */
const ROOK_FRAMES = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 19, 21, 23, 25, 27, 29, 31, 33, 35, 36, 38, 40, 42, 44, 46, 48, 50, 52, 53, 55, 57, 59, 61, 63, 65, 67];

/** The overlays now drawn from SVG frames, the box each caller fits them to (0: the stage at 1:1). */
const VECTOR_OVERLAYS = Object.freeze({
  'overlays.json': { poisoned: 0, rooked: 0, amorous_philtre_heart: 0, play_glitch: 110 },
  'overlays-more.json': {
    trading: 70,
    fox_bait_ignite: 150,
    dice_overlay: 56,
    twelve_sided_die: 56,
    petrified_rock_open_overlay: 0,
    right_arrow: 75,
    crown_game_indicator_you: 140,
    crown_game_indicator_someone_else: 100,
    game_of_crowns_throbber: 200,
  },
});

/** CSS px per world px at Original zoom on a 2560 x 1440 monitor (the audit's 2.52). */
async function stageScale() {
  const { stageFor } = await import('../public/js/location-view.js?v=f1f922b4');
  const stage = stageFor({ width: 2560, height: 1360, sceneWidth: 4000, sceneHeight: 1000, zoom: 1 }).scale;
  assert.ok(stage > 2 && stage < 3, `stage ${stage}`);
  return stage;
}

/** Lossless WebP (VP8L) or extended (VP8X) canvas size. */
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.subarray(8, 12).toString(), 'WEBP', file);
  const chunk = b.subarray(12, 16).toString();
  if (chunk === 'VP8L') {
    return { width: 1 + (((b[22] & 0x3f) << 8) | b[21]), height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
  }
  assert.equal(chunk, 'VP8X', file);
  return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
}

/** Pixel size of a PNG or WebP. */
function imageSize(file) {
  const b = readFileSync(file);
  if (b.subarray(1, 4).toString() === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  return webpSize(file);
}

/** Every sheet of the two manifests with its manifest row. */
function sheets() {
  const out = [];
  for (const name of ['rooks.json', 'hi-signs.json']) {
    for (const job of json(join(vs, name)).jobs) for (const s of job.sheets) out.push({ manifest: name, job, ...s });
  }
  return out;
}

test('the Rook, its halo and every hi sign keep their frames, cells and timings', async () => {
  const { ROOK_SHEETS, ROOKED_HALO } = await import('../public/js/features/rook-attack-feature.js?v=d8ef5dcc');
  const { HI_ART, HI_ART_CELLS, HI_VARIANTS, hiArtSheet } = await import('../public/js/hi-signs.js?v=b90c7d7e');
  const rows = new Map(sheets().map((s) => [s.path, s]));
  assert.equal(rows.size, 2 + 3 * HI_VARIANTS.length);
  assert.equal(HI_VARIANTS.length, 11);
  // The 1x sheets' grids, as the feature slices them.
  assert.deepEqual({ ...ROOK_SHEETS.hover }, { path: 'assets/sprites/rooks/rook-hover.webp', fw: 496, fh: 300, cols: 6, frames: 36 });
  assert.deepEqual({ ...ROOK_SHEETS.halo }, { path: 'assets/sprites/rooks/rooked-halo.webp', fw: 124, fh: 46, cols: 8, frames: 30 });
  for (const key of ['hover', 'halo']) {
    const s = ROOK_SHEETS[key];
    const m = rows.get(s.path);
    assert.deepEqual([m.fw, m.fh, m.cols, m.frames], [s.fw, s.fh, s.cols, s.frames], key);
  }
  const rook = read('js/features/rook-attack-feature.js');
  assert.match(rook, /const rook = new PIXI\.AnimatedSprite\(loader\.frames\(ROOK_SHEETS\.hover\)\);\n\s+rook\.anchor\.set\(0\.5, 0\.42\);\n\s+rook\.animationSpeed = pixiSpeed\(15\);/);
  assert.match(rook, /rook\.animationSpeed = pixiSpeed\(stunned \? 6 : 15\);/);
  assert.match(rook, /halo\.animationSpeed = pixiSpeed\(ROOKED_HALO\.fps\);/);
  assert.equal(ROOKED_HALO.fps, 30);
  assert.deepEqual([HI_ART.FPS, HI_ART.HI_FRAMES, HI_ART.BONUS_FRAMES], [30, 65, 37]);
  for (const v of HI_VARIANTS) {
    for (const kind of ['still', 'hi', 'bonus']) {
      const s = hiArtSheet(v, kind);
      const m = rows.get(s.url);
      assert.ok(m, s.url);
      assert.deepEqual([m.fw, m.fh, m.cols, m.frames], [s.w, s.h, s.cols, s.frames], s.url);
      if (kind !== 'bonus') assert.deepEqual([s.w, s.h], HI_ART_CELLS[v].slice(0, 2), s.url);
      const size = imageSize(join(pub, s.url));
      assert.equal(size.width, s.cols * s.w, s.url);
      assert.ok(size.height >= Math.ceil(s.frames / s.cols) * s.h, s.url);
    }
  }
});

test('each has a 3x render of its vector SWF, matched to the 1x frame for frame, loaded on first draw', async () => {
  const { HIRES_SPRITES, SPLIT_SPRITES, FIRST_DRAW_SPRITES } = await import('../public/js/sprite-hires.js?v=ac5f0e68');
  const results = json(join(vs, 'results.json'));
  for (const s of sheets()) {
    const r = results[s.path];
    assert.equal(r?.status, 'ok', s.path);
    assert.equal(r.swf, s.job.swf, s.path);
    assert.equal(r.sprite, s.job.sprite, s.path);
    assert.equal(r.cells, s.frames, s.path);
    // The match after the 3:1 downscale (the build passes 0.88 mean, 0.8 a frame): the lowest are the
    // hi signs' first frames (the butterflies' 0.83: four specks of art a few px across in the lossy
    // 1x) and the halo's faint swirl trails (0.89); the Rook scores 0.99.
    assert.ok(r.score >= 0.9 && r.minFrame >= 0.82, `${s.path} score ${r.score} min ${r.minFrame}`);
    assert.ok(FIRST_DRAW_SPRITES.has(s.path), `${s.path} swaps to 3x when first drawn, not at boot`);
    const split = SPLIT_SPRITES.get(s.path);
    const size = imageSize(join(pub, s.path));
    if (!split) {
      const twin = HIRES_SPRITES.get(s.path);
      assert.match(twin || '', /@3x\.webp$/, s.path);
      assert.deepEqual(webpSize(join(pub, twin)), { width: 3 * size.width, height: 3 * size.height }, twin);
      continue;
    }
    let next = 0;
    for (const [url, from, count, cols] of split.parts) {
      assert.equal(from, next, url);
      next += count;
      const p = webpSize(join(pub, url));
      assert.deepEqual(p, { width: 3 * cols * s.fw, height: 3 * Math.ceil(count / cols) * s.fh }, url);
      assert.ok(p.width <= 8192 && p.height <= 8192 && p.width * p.height * 4 <= 64 * 2 ** 20, `${url} in the texture budget`);
    }
    assert.equal(next, s.frames, `${s.path}: the parts hold every cell`);
  }
  const hover = results['assets/sprites/rooks/rook-hover.webp'];
  assert.equal(hover.swf, '../glitch-overlays/rook_fly_forward.swf');
  assert.deepEqual(hover.swfFrames, ROOK_FRAMES, 'one distinct SWF frame per cell, in order');
  assert.ok(SPLIT_SPRITES.has('assets/sprites/rooks/rook-hover.webp'), 'the 193 MB hover ships as parts');
  const halo = results['assets/sprites/rooks/rooked-halo.webp'];
  assert.deepEqual([halo.swf, halo.sprite, ...halo.swfFrames], ['misc/emotional_bear/emotional_bear.swf', 0, 479, 508]);
  // Files exactly 3x their 1x sheet and js/sprite-hires.js current (no FFDec needed).
  for (const name of ['rooks.json', 'hi-signs.json']) {
    const out = execFileSync(process.execPath, [join(vs, 'build.mjs'), '--manifest', join(vs, name), '--check'], { encoding: 'utf8' });
    assert.match(out, new RegExp(`${name.replace('.', '\\.')}: ok`));
  }
});

test('the 3x covers the Rook, its halo and the hi signs where they are drawn; the swoop is the one draw it cannot', async () => {
  const { HIRES_SPRITES, SPLIT_SPRITES } = await import('../public/js/sprite-hires.js?v=ac5f0e68');
  const { moduleConsts } = await import('./sheet-sources.js');
  const { ROOK_SHEETS, ROOKED_HALO } = await import('../public/js/features/rook-attack-feature.js?v=d8ef5dcc');
  const stage = await stageScale();
  const density = (path) => (HIRES_SPRITES.has(path) || SPLIT_SPRITES.has(path) ? 3 : 1);
  const home = moduleConsts('js/features/rook-attack-feature.js').get('ROOK_HOME');
  const rook = read('js/features/rook-attack-feature.js');
  const swoop = Number(/sc = ROOK_HOME\.scale \* \(1 \+ ([\d.]+) \* ease\);/.exec(rook)?.[1]);
  assert.equal(swoop, 1.25);
  const hoverAt = home.scale * stage / density(ROOK_SHEETS.hover.path);
  assert.ok(hoverAt <= 1, `the hovering Rook draws ${hoverAt.toFixed(2)} device px per texel`);
  // At the swoop's closest point (0.82 x 2.25 = 1.85) a 3x shows 1.55 (it was 4.65): 5x would be a
  // 535 MB texture for a moment of a wing beat, so the swoop is held to 3x and no worse.
  const swoopAt = home.scale * (1 + swoop) * stage / density(ROOK_SHEETS.hover.path);
  assert.ok(swoopAt <= 1.6, `the swoop draws ${swoopAt.toFixed(2)}`);
  const haloAt = (ROOKED_HALO.width / ROOK_SHEETS.halo.fw) * stage / density(ROOK_SHEETS.halo.path);
  assert.ok(haloAt <= 1, `the halo draws ${haloAt.toFixed(2)}`);
  // The hi signs are drawn at 1 in the street (no scale anywhere in the feature).
  assert.doesNotMatch(read('js/features/hi-signs-feature.js'), /\.scale\.set\(|\.scale\s*=[^=]/);
  const { HI_VARIANTS, hiArtSheet } = await import('../public/js/hi-signs.js?v=b90c7d7e');
  for (const v of HI_VARIANTS) {
    for (const kind of ['still', 'hi', 'bonus']) {
      const at = stage / density(hiArtSheet(v, kind).url);
      assert.ok(at <= 1, `${v} ${kind} draws ${at.toFixed(2)}`);
    }
  }
});

test('the overlays that were sheets keep SVG frames, drawn at the screen\'s density where they show', async () => {
  const { VECTOR_MAX_SIDE, VECTOR_OVER_SHEET, overlayDensity, vectorDensity } = await import('../public/js/overlay-art.js?v=75c3ea34');
  const { OVERLAY_USES } = await import('../public/js/overlays.js?v=605c12ff');
  const stage = await stageScale();
  const dir = join(pub, 'assets/sprites/overlays');
  for (const [file, keys] of Object.entries(VECTOR_OVERLAYS)) {
    const rows = json(join(dir, file));
    for (const [key, wh] of Object.entries(keys)) {
      const m = rows[key];
      if (OVERLAY_USES[key]) assert.equal(OVERLAY_USES[key].wh, wh, `${key} box`);
      assert.equal(m.vector?.file, `${key}.frames.json`, key);
      assert.equal(m.vector.order.length, m.frames, `${key}: the sheet's timeline, states and all`);
      const data = readFileSync(join(dir, m.vector.file));
      assert.equal(data.length, m.vector.bytes, key);
      assert.equal(JSON.parse(data).frames.length, m.vector.frames, key);
      assert.ok(data.length < 2_100_000, key);
      // Device px per stage px where it shows; the sheet alone would be soft there, the frames are not.
      const at = overlayDensity(m, { wh, resolution: stage });
      assert.ok(at > m.scale * VECTOR_OVER_SHEET, `${key}: the sheet draws ${(at / m.scale).toFixed(2)}`);
      const drawn = vectorDensity(m, at);
      const cap = Math.floor((VECTOR_MAX_SIDE / Math.max(m.box[2], m.box[3])) * 4) / 4;
      assert.ok(drawn >= Math.min(at, cap) && drawn > 0, `${key}: SVG frames at ${drawn} for ${at.toFixed(2)}`);
    }
  }
  // The window overlays pass their own canvas density; the street ones the renderer's (G448).
  for (const [f, pattern] of [
    ['js/features/tree-death-feature.js', /playSheetOverlay\(engine\.PIXI, POISON_OVERLAY\.key, \{/],
    ['js/features/potions-feature.js', /playSheetOverlay\(engine\.PIXI, LOVE_HEART\.key, \{/],
    ['js/quest-rooms/gwendolyn.js', /playSheetOverlay\(ctx\.PIXI, 'rooked', \{/],
    ['js/features/trade-feature.js', /playOverlay\(engine\.PIXI, 'trading', \{/],
    ['js/features/foxes-feature.js', /playOverlay\(engine\.PIXI, 'fox_bait_ignite', \{/],
    ['js/overlays.js', /const key = twelve \? 'twelve_sided_die' : 'dice_overlay';[\s\S]{0,600}playOverlay\(PIXI, key, \{/],
    ['js/features/artifacts-feature.js', /playOverlay\(engine\.PIXI, 'petrified_rock_open_overlay', \{/],
    ['js/features/hell-tickets-feature.js', /playWindowOverlay\('right_arrow', \{/],
    ['js/features/crowns-feature.js', /playWindowOverlay\(ind\.key, \{/],
    ['js/features/crowns-feature.js', /playWindowOverlay\('game_of_crowns_throbber', \{/],
  ]) assert.match(read(f), pattern, f);
  // Play Glitch draws its own badge (game_box.js 137-149): from the SVG frames on a dense screen.
  const swf = read('js/features/swf-feature.js');
  assert.match(swf, /vectorDensity\(playArt, overlayDensity\(playArt, \{ wh: 110, resolution: defaultOverlayResolution\(\), layerScale \}\)\)/);
  assert.match(swf, /holdVectorTexture\(PIXI, PLAY_OVERLAY\.key, playArt, density\)/);
  assert.match(swf, /if \(playVector\) playVector\.draw\(playArt\.vector\.order\[frame\]\);/);
  // The race winner's rainbow (nothing shows it) and the organelles (small, 2x, and on screen for 3 s) stay sheets.
  assert.ok(!json(join(dir, 'overlays.json')).rainbow_winner.vector);
  for (const key of ['vacuoles', 'endoplasmic_reticulum', 'super_old_mitochondrial_dna', 'golgi_apparatus']) assert.ok(!json(join(dir, 'overlays-more.json'))[key].vector, key);
  assert.ok(existsSync(join(pub, 'assets/sprites/icons/golgi_apparatus@3x.webp')));
});
