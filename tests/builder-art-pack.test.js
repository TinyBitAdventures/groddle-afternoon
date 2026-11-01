/**
 * LEVEL BUILDER art pack: the art bible and prompts for an image model (tools/builder/art-bible.mjs),
 * the picture work on what comes back (tools/builder/art-image.mjs, tools/builder/art-intake.mjs:
 * keying, seams, palette, sizes, provenance) and the swap into a copy of a draft
 * (tools/builder/art-apply.mjs), and the generator that asks the Gemini API for the pictures
 * (tools/builder/art-generate.mjs, against a stubbed fetch: no network). The fixture is one street of
 * Mount Ashomel with its code-drawn art's rows.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPack, zonePieces, loadShippedStreets, loadPalette, decoColour, applyMatrix, swatches, PROMPT_MAX, KEY_HEX, shapeWords, keepPromptHistory, KINDS } from '../tools/builder/art-bible.mjs';
import {
  blank, decodePng, encodePng, keyOut, estimateKey, looksLikeCheckerboard, seamScore, fixSeam, snapToPalette,
  resize, opaqueBox, surfaceRow, alphaShare, transpose, seamScoreV, bottomSolid, readImage,
} from '../tools/builder/art-image.mjs';
import { prepare, fitSize, newName, toolLine, runIntake, pinkShare, promptFileFor } from '../tools/builder/art-intake.mjs';
import { swapOps, copyZone, lineUnder } from '../tools/builder/art-apply.mjs';
import {
  generate, pickAspect, pickSize, buildRequest, extractImage, correctiveLine, isHardQuota, DEFAULT_MODEL, WIDE_RATIOS, BASE_RATIOS,
} from '../tools/builder/art-generate.mjs';
import { applyOps } from '../public/js/builder/ops.js?v=27c7796f';

const root = join(import.meta.dirname, '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const zone = json('tests/fixtures/builder/art-bible-zone.json');
const brief = json('tools/builder/art/briefs/mount-ashomel.json');
const clone = (v) => JSON.parse(JSON.stringify(v));

/** A picture painted by a function of (x, y) -> [r, g, b, a]. */
function paint(w, h, f) {
  const img = blank(w, h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) img.px.set(f(x, y), (y * w + x) * 4);
  return img;
}
const px = (img, x, y) => Array.from(img.px.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4));

describe('art bible and prompts (art-bible.mjs)', () => {
  const shipped = loadShippedStreets();
  const palette = loadPalette();
  const catalogRows = new Map(json('public/assets/content/deco-catalog.json').decos.map((r) => [r.name, r]));
  const profiles = json('public/assets/content/style-profiles.json');
  const make = () => buildPack({ zone, brief, shipped, palette, catalogRows, profiles, outDir: '/pack' });

  it('the same zone, brief and streets write the same pack, byte for byte', () => {
    const a = make();
    const b = make();
    assert.deepEqual(Object.keys(a.files).sort(), Object.keys(b.files).sort());
    for (const k of Object.keys(a.files)) assert.equal(a.files[k], b.files[k], k);
  });

  it('guesses how each piece is used from the zone alone: strips, ledges, particles, objects', () => {
    const by = Object.fromEntries(zonePieces(zone, {}).map((p) => [p.name, p]));
    assert.equal(by.gz_ai_basalt_ridge.kind, 'strip', 'copies edge to edge on bg_1');
    assert.equal(by.gz_ai_basalt_ledge_medium.kind, 'topper', 'a floor line along its top');
    assert.equal(by.gz_ai_basalt_ground.kind, 'topper');
    assert.equal(by.gz_ai_basalt_ground.overlapping, true, 'its copies overlap');
    assert.equal(by.gz_ai_lava_blob.kind, 'particle', 'only effects use it');
    assert.equal(by.gz_ai_steam_vent.kind, 'object');
    assert.equal(by.gz_ai_ash_haze_sky.role, 'sky');
    assert.deepEqual(by.gz_ai_steam_vent.target, { w: 340, h: 193 }, 'the size is the kept file of the art it replaces');
  });

  it('one self-contained prompt per piece: one layer or object, the exact size, the background rule, the style', () => {
    const { files, pieces, refs } = make();
    const briefOnly = Object.entries(brief.pieces).filter(([n, b]) => !zone.assets[n] && b.w && b.h).length;
    assert.ok(briefOnly >= 3, 'the brief names pieces the zone does not use yet (support, wall, the fall\'s lip)');
    assert.equal(pieces.length, Object.keys(zone.assets).length + briefOnly);
    const HEAD = { strip: /ONE LAYER ONLY/, ground: /ONE GROUND STRIP ONLY/, support: /ONE ROCK SUPPORT ONLY/, wall: /ONE ROCK WALL ONLY/, stream: /ONE STREAM ONLY/ };
    for (const p of pieces) {
      const t = files[p.promptFile];
      assert.ok(t.length <= PROMPT_MAX, `${p.short}: ${t.length} characters`);
      assert.match(t, HEAD[p.kind] || /ONE (OBJECT|SPRITE) ONLY/);
      assert.ok(t.includes(`${p.target.w} x ${p.target.h} px`), p.short);
      assert.ok(t.includes(KEY_HEX) && /transparent/.test(t), p.short);
      assert.match(t, /Tiny Speck/);
      assert.ok(!/—/.test(t), 'no em dashes');
      if (p.kind === 'strip') assert.match(t, /SEAMLESS/);
      if (p.kind === 'topper') assert.match(t, /walked on/);
      assert.ok(p.attach.includes('ref-sheet.png') && p.attach.slice(1).every((f) => refs.some((r) => r.file === f)), p.short);
    }
    // Back layers first, particles last.
    assert.equal(pieces[0].role, 'sky');
    assert.equal(pieces.at(-1).kind, 'particle');
  });

  it('references are Tiny Speck library decos placed on the closest streets, recorded as deco: inputs', () => {
    const { files, refs, streets } = make();
    assert.ok(refs.length >= 6 && refs.length <= 10);
    const library = new Set(json('public/assets/decos/manifest.json'));
    for (const r of refs) {
      assert.ok(library.has(r.name), r.name);
      assert.match(r.file, /^ref-\d\d-[a-z0-9-]+\.png$/);
      assert.ok(!/blur|shadow|gradient/.test(r.name));
    }
    assert.ok(!refs.some((r) => brief.refExclude.includes(r.name)), 'the brief can leave a deco out');
    const pack = JSON.parse(files['pieces.json']);
    assert.deepEqual(pack.inputs, refs.map((r) => `deco:${r.name}`));
    assert.equal(streets.list.length, 8);
    assert.ok(streets.list.every((s) => !s.tsid.startsWith('GZ')), 'measured on Tiny Speck streets only');
  });

  it('the bible names the palette (the brief and the measured tones), the layers, what to avoid and the refs', () => {
    const { files, palette: tones } = make();
    const md = files['art-bible.md'];
    for (const p of brief.palette) assert.ok(md.includes(p.hex), p.hex);
    assert.ok(tones.length >= 5);
    for (const s of tones) assert.ok(md.includes(s.hex), s.hex);
    assert.match(md, /Sky gradient .*#2F2438.*#D9733F/);
    assert.match(md, /## Avoid/);
    assert.match(md, /photorealism/);
    assert.match(files['pack.md'], /drop\/basalt_ledge_medium\.png/);
    assert.match(files['pack.md'], /new chat/);
  });

  it('a deco\'s colour is its measured lightness, saturation and hue; a layer filter changes it as the game does', () => {
    const grey = decoColour({ l: 0.5, s: 0.4, hue: new Array(12).fill(0) });
    assert.deepEqual(grey.map(Math.round), [128, 128, 128]);
    const red = decoColour({ l: 0.5, s: 1, hue: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    assert.ok(red[0] > 250 && red[2] < 10);
    assert.deepEqual(applyMatrix([10, 20, 30], null), [10, 20, 30]);
    const m = [1, 0, 0, 0, 0.1, 0, 1, 0, 0, 0.1, 0, 0, 1, 0, 0.1, 0, 0, 0, 1, 0];
    assert.deepEqual(applyMatrix([0, 0, 0], m).map(Math.round), [26, 26, 26]);
    const sw = swatches([{ label: 'A', colours: [{ sprite: 'a', role: 'bg', rgb: [200, 0, 0], lab: [53, 80, 67], w: 0.5 }, { sprite: 'b', role: 'sky', rgb: [0, 0, 200], lab: [25, 66, -100], w: 0.5 }] }], 2);
    assert.equal(sw.length, 2);
    assert.deepEqual(sw.map((s) => s.hex).sort(), ['#0000C8', '#C80000']);
  });
});

describe('grounded pieces (art-bible.mjs kinds ground, support, wall, stream; ledges grounded or floating)', () => {
  const shipped = loadShippedStreets();
  const palette = loadPalette();
  const catalogRows = new Map(json('public/assets/content/deco-catalog.json').decos.map((r) => [r.name, r]));
  const profiles = json('public/assets/content/style-profiles.json');
  const make = (b = brief) => buildPack({ zone, brief: b, shipped, palette, catalogRows, profiles, outDir: '/pack' });
  const promptOf = (pack, name) => pack.files[pack.pieces.find((p) => p.name === name).promptFile];

  it('the brief names the kinds: ground, support, wall and stream, with sizes of their own', () => {
    assert.deepEqual(KINDS, ['strip', 'object', 'topper', 'particle', 'ground', 'support', 'wall', 'stream']);
    const by = Object.fromEntries(make().pieces.map((p) => [p.short, p]));
    assert.equal(by.basalt_ground.kind, 'ground');
    assert.deepEqual(by.basalt_ground.target, { w: 1200, h: 480 }, "the brief's size wins over the ledge it replaces");
    assert.equal(by.basalt_ground.seamless, true);
    assert.equal(by.basalt_support.kind, 'support');
    assert.equal(by.basalt_support.tilesDown, true);
    assert.equal(by.basalt_wall.kind, 'wall');
    assert.equal(by.lava_fall.kind, 'stream');
    assert.equal(by.lava_fall_lip.kind, 'object');
    assert.equal(JSON.parse(make().files['pieces.json']).ledges, 'grounded');
    assert.throws(() => zonePieces(zone, { pieces: { gz_ai_x: { kind: 'blob', w: 10, h: 10 } } }), /not one of/);
  });

  it('a ground strip is solid to its bottom edge with no underside; a support has a flat top and tiles down', () => {
    const pack = make();
    const g = promptOf(pack, 'gz_ai_basalt_ground');
    assert.match(g, /ONE GROUND STRIP ONLY/);
    assert.match(g, /SOLID TO THE BOTTOM/);
    assert.match(g, /runs off the BOTTOM edge/);
    assert.match(g, /No underside, no hanging lumps, no drips/);
    assert.match(g, /SEAMLESS: copies are placed side by side/);
    const sp = promptOf(pack, 'gz_ai_basalt_support');
    assert.match(sp, /ONE ROCK SUPPORT ONLY/);
    assert.match(sp, /its top is flat and level across its whole width/);
    assert.match(sp, /runs off the BOTTOM edge/);
    assert.match(sp, /SEAMLESS TOP TO BOTTOM/);
    const w = promptOf(pack, 'gz_ai_basalt_wall');
    assert.match(w, /ONE ROCK WALL ONLY/);
    assert.match(w, /ledges jut out of it/);
    assert.match(w, /SEAMLESS TOP TO BOTTOM/);
  });

  it('ledges: grounded by default (a short, flat-ish underside, nothing hanging); floating only when the brief says so', () => {
    const grounded = promptOf(make(), 'gz_ai_basalt_ledge_medium');
    assert.match(grounded, /thick shelf: its underside is short and nearly flat/);
    assert.match(grounded, /no lumps, spikes or drips hanging underneath/);
    assert.doesNotMatch(grounded, /lumps of rock hanging underneath/);
    const floating = promptOf(make({ ...brief, ledges: 'floating' }), 'gz_ai_basalt_ledge_medium');
    assert.match(floating, /It floats in the air: rounded lumps of rock may hang underneath it/);
    assert.doesNotMatch(floating, /thick shelf: its underside/);
    assert.equal(JSON.parse(make({ ...brief, ledges: 'floating' }).files['pieces.json']).ledges, 'floating');
    assert.match(make().files['art-bible.md'], /## Standing on the ground/);
  });

  it('a fall is a plain stream that tiles downward: no lip, no pool (pieces of their own)', () => {
    const t = promptOf(make(), 'gz_ai_lava_fall');
    assert.match(t, /ONE STREAM ONLY/);
    assert.match(t, /No rock lip at the top, no pool, splash or rocks at the bottom/);
    assert.match(t, /stacked one under another to make a fall of any height/);
  });

  it('particles and objects keep their asked shape, said in words', () => {
    assert.equal(shapeWords(96, 88), 'about as wide as it is tall');
    assert.equal(shapeWords(390, 100), 'about 3.9 times as wide as it is tall');
    assert.equal(shapeWords(61, 96), 'about 1.6 times as tall as it is wide');
    const wisp = make().pieces.find((p) => p.kind === 'particle');
    assert.match(promptOf(make(), wisp.name), new RegExp(`SHAPE: keep it ${shapeWords(wisp.target.w, wisp.target.h)} \\(${wisp.target.w} x ${wisp.target.h}\\); do not flatten`));
  });

  it('background pieces are asked to stay quiet: lower contrast, little detail, few seams, hazier', () => {
    const pack = make();
    const ridge = promptOf(pack, 'gz_ai_basalt_ridge');
    assert.match(ridge, /about half the contrast of the play area/);
    assert.match(ridge, /few or no cracks, seams or glowing lines/);
    assert.match(ridge, /haze/);
    assert.match(promptOf(pack, 'gz_ai_ash_haze_sky'), /very little detail/);
    assert.match(promptOf(pack, 'gz_ai_basalt_ledge_medium'), /the crispest, most detailed/);
  });

  it('intake: a ground strip is scaled to its width and its bottom checked; a support and a stream mend their top-bottom seam', () => {
    const groundPiece = { kind: 'ground', target: { w: 200, h: 80 } };
    // Solid to the bottom (with a magenta border above it): no warning.
    const solid = paint(220, 100, (x, y) => (y < 20 ? [255, 0, 255, 255] : [80 + (x % 7), 60, 50, 255]));
    const ok = prepare(solid, groundPiece);
    assert.equal(ok.img.w, 200);
    assert.equal(ok.report.bottomSolid, 1);
    assert.ok(!ok.report.warnings.some((w) => /bottom edge is solid/.test(w)), ok.report.warnings.join(' | '));
    // Drips under it: warned.
    const drips = paint(220, 100, (x, y) => (y < 20 || (y > 70 && x % 40 > 12) ? [255, 0, 255, 255] : [80, 60, 50, 255]));
    const bad = prepare(drips, groundPiece);
    assert.ok(bad.report.bottomSolid < 0.9);
    assert.ok(bad.report.warnings.some((w) => /lumps or drips will show under the floor/.test(w)));
    // A stream whose top and bottom differ: crossfaded top to bottom.
    const stream = paint(80, 200, (x, y) => (x < 10 || x >= 70 ? [255, 0, 255, 255] : [255, Math.round((y / 199) * 255), 40, 255]));
    assert.ok(seamScoreV(stream) > 2.5);
    const st = prepare(stream, { kind: 'stream', target: { w: 60, h: 200 } });
    assert.equal(st.report.seam.axis, 'vertical');
    assert.ok(st.report.seam.after < st.report.seam.before);
    assert.ok(!st.report.warnings.some((w) => /touches an edge/.test(w)), 'a stream runs off its edges by design');
    assert.deepEqual(fitSize({ kind: 'support', target: { w: 100, h: 100 } }, 50, 200), { w: 100, h: 400, scale: 2 });
    const t = transpose(paint(3, 2, (x, y) => [x, y, 0, 255]));
    assert.equal(t.w, 2);
    assert.deepEqual(px(t, 1, 2), [2, 1, 0, 255]);
    assert.equal(bottomSolid(paint(10, 10, () => [0, 0, 0, 0])), 0);
  });

  it('a rewritten pack keeps the prompt each old picture was made from', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grounded-pack-'));
    try {
      mkdirSync(join(dir, 'prompts'));
      writeFileSync(join(dir, 'prompts/09-lava_fall.txt'), 'old fall prompt\n');
      writeFileSync(join(dir, 'prompts/01-ash_haze_sky.txt'), 'same\n');
      writeFileSync(join(dir, 'pieces.json'), JSON.stringify({ pieces: [{ short: 'lava_fall', promptFile: 'prompts/09-lava_fall.txt' }, { short: 'ash_haze_sky', promptFile: 'prompts/01-ash_haze_sky.txt' }] }));
      const files = {
        'pieces.json': JSON.stringify({ pieces: [{ short: 'ash_haze_sky', promptFile: 'prompts/01-ash_haze_sky.txt' }, { short: 'lava_fall', promptFile: 'prompts/12-lava_fall.txt' }, { short: 'basalt_wall', promptFile: 'prompts/02-basalt_wall.txt' }] }),
        'prompts/01-ash_haze_sky.txt': 'same\n',
        'prompts/12-lava_fall.txt': 'new fall prompt\n',
        'prompts/02-basalt_wall.txt': 'wall\n',
      };
      const now = '2026-11-01T12:00:00.000Z';
      const { manifest, archived } = keepPromptHistory(dir, files, now);
      assert.deepEqual(archived, ['prompts/archive/lava_fall.until-20261101T120000.txt']);
      assert.equal(readFileSync(join(dir, archived[0]), 'utf8'), 'old fall prompt\n');
      assert.ok(!existsSync(join(dir, 'prompts/09-lava_fall.txt')), 'a prompt file no piece names goes');
      const fall = manifest.pieces.find((p) => p.short === 'lava_fall');
      assert.equal(fall.since, now);
      assert.deepEqual(fall.history, [{ file: archived[0], until: now }]);
      assert.equal(manifest.pieces.find((p) => p.short === 'ash_haze_sky').since, undefined, 'an unchanged prompt has no history');
      assert.equal(promptFileFor(fall, Date.parse('2026-10-31T20:00:00Z')), archived[0], 'a picture from before the change: the old prompt');
      assert.equal(promptFileFor(fall, Date.parse('2026-11-02T08:00:00Z')), 'prompts/12-lava_fall.txt');
      assert.equal(promptFileFor({ promptFile: 'p.txt' }, 0), 'p.txt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('picture work (art-image.mjs)', () => {
  it('PNG round trip', () => {
    const img = paint(7, 5, (x, y) => [x * 30, y * 50, 99, (x + y) % 2 ? 255 : 0]);
    const back = decodePng(encodePng(img));
    assert.equal(back.w, 7);
    assert.deepEqual(Array.from(back.px), Array.from(img.px));
  });

  it('keys a magenta background out: clear outside, solid art, a soft white edge comes out white and half clear', () => {
    // A dark red square, a white ring blended 50% into #F806FA, on that magenta.
    const key = [248, 6, 250];
    const img = paint(40, 40, (x, y) => {
      const d = Math.max(Math.abs(x - 20), Math.abs(y - 20));
      if (d < 8) return [120, 20, 20, 255];
      if (d < 12) return [255, 255, 255, 255];
      if (d === 12) return [Math.round((255 + key[0]) / 2), Math.round((255 + key[1]) / 2), Math.round((255 + key[2]) / 2), 255];
      return [...key, 255];
    });
    assert.deepEqual(estimateKey(img), key);
    keyOut(img, key);
    assert.equal(px(img, 1, 1)[3], 0, 'background clear');
    assert.deepEqual(px(img, 20, 20), [120, 20, 20, 255], 'art untouched');
    const edge = px(img, 32, 20);
    assert.ok(edge[3] > 90 && edge[3] < 170, `edge alpha ${edge[3]}`);
    assert.ok(edge[0] > 240 && edge[1] > 240 && edge[2] > 240, `edge colour ${edge.slice(0, 3)} is white, not pink`);
    assert.ok(pinkShare(img) < 0.01);
  });

  it('a painted checkerboard is not transparency; a magenta field is', () => {
    const checker = paint(64, 64, (x, y) => ((x >> 3) + (y >> 3)) % 2 ? [255, 255, 255, 255] : [204, 204, 204, 255]);
    assert.equal(looksLikeCheckerboard(checker), true);
    assert.equal(estimateKey(checker), null);
    const magenta = paint(64, 64, () => [255, 0, 255, 255]);
    assert.equal(looksLikeCheckerboard(magenta), false);
    const r = prepare(checker, { kind: 'object', role: 'middleground', target: { w: 64, h: 64 } });
    assert.equal(r.refused, true);
    assert.equal(r.report.background, 'checkerboard');
  });

  it('measures a strip\'s seam and mends it by crossfading the ends', () => {
    const ramp = paint(200, 20, (x) => [x, 255 - x, 60, 255]);
    assert.ok(seamScore(ramp) > 50, 'a ramp does not tile');
    const fixed = fixSeam(ramp, 0.1);
    assert.equal(fixed.w, 180);
    assert.ok(seamScore(fixed) < 2.5, `fixed seam ${seamScore(fixed)}`);
    const wave = paint(200, 20, (x) => [128 + Math.round(100 * Math.sin((x / 200) * 2 * Math.PI)), 50, 50, 255]);
    assert.ok(seamScore(wave) < 2.5, 'a whole period already tiles');
  });

  it('pulls colours lightly toward the palette, and leaves far colours alone', () => {
    const img = paint(2, 1, (x) => (x ? [10, 200, 10, 255] : [200, 70, 40, 255]));
    snapToPalette(img, ['#D8401C'], { strength: 0.5, reach: 120 });
    const near = px(img, 0, 0);
    assert.ok(near[0] > 200 && near[1] < 70, `moved toward #D8401C: ${near}`);
    assert.deepEqual(px(img, 1, 0), [10, 200, 10, 255], 'green is too far to move');
  });

  it('scales on premultiplied colour, so a clear border leaves no dark fringe', () => {
    const img = paint(10, 10, (x, y) => (x > 2 && x < 7 && y > 2 && y < 7 ? [250, 40, 40, 255] : [0, 0, 0, 0]));
    const big = resize(img, 25, 25);
    for (let i = 0; i < big.px.length; i += 4) if (big.px[i + 3] > 20) assert.ok(big.px[i] > 200, `fringe pixel ${Array.from(big.px.subarray(i, i + 4))}`);
    assert.deepEqual(opaqueBox(big, 128) !== null, true);
  });

  it('finds a ledge\'s walkable top', () => {
    const ledge = paint(100, 40, (x, y) => (y >= 6 && x > 4 && x < 95 ? [60, 50, 40, 255] : [0, 0, 0, 0]));
    assert.equal(surfaceRow(ledge), 6);
  });
});

describe('intake of returned pictures (art-intake.mjs)', () => {
  it('sizes strips and ledges to the target width, objects to fit the box', () => {
    assert.deepEqual(fitSize({ kind: 'strip', target: { w: 3200, h: 789 } }, 1600, 400), { w: 3200, h: 800, scale: 2 });
    assert.deepEqual(fitSize({ kind: 'object', target: { w: 400, h: 200 } }, 800, 800), { w: 200, h: 200, scale: 0.25 });
    assert.deepEqual(fitSize({ kind: 'object', target: { w: 8000, h: 1000 } }, 800, 100).w, 4096, 'never over 4,096 px a side');
    assert.equal(newName({ short: 'basalt_ledge_medium' }), 'gz_ai_t3_basalt_ledge_medium');
    assert.ok(toolLine('x'.repeat(200)).length <= 120);
  });

  it('a non-seamless strip on magenta comes back keyed, seamless and at the target width', () => {
    const strip = paint(400, 120, (x, y) => (y < 30 + Math.round(x / 20) ? [255, 0, 255, 255] : [62 + (x >> 3), 51, 41, 255]));
    const { img, report } = prepare(strip, { kind: 'strip', role: 'bg', target: { w: 800, h: 200 } }, { palette: ['#3E3329'] });
    assert.equal(report.background, 'magenta');
    assert.ok(report.seam.before > 2.5 && report.seam.after < 2.5, JSON.stringify(report.seam));
    assert.equal(img.w, 800);
    assert.ok(alphaShare(img).clear > 0.05);
  });

  it('writes ready pictures and their provenance; lists what is waiting and what was refused', () => {
    const dir = mkdtempSync(join(tmpdir(), 'art-pack-'));
    try {
      mkdirSync(join(dir, 'drop'));
      mkdirSync(join(dir, 'prompts'));
      const pieces = [
        { name: 'gz_ai_rock', short: 'rock', kind: 'object', role: 'middleground', target: { w: 60, h: 40 }, promptFile: 'prompts/01-rock.txt', attach: ['ref-sheet.png', 'ref-01-x.png'] },
        { name: 'gz_ai_ledge', short: 'ledge', kind: 'topper', role: 'middleground', target: { w: 120, h: 40 }, promptFile: 'prompts/02-ledge.txt', attach: ['ref-sheet.png'] },
        { name: 'gz_ai_fake', short: 'fake', kind: 'object', role: 'middleground', target: { w: 40, h: 40 }, promptFile: 'prompts/03-fake.txt', attach: ['ref-sheet.png'] },
        { name: 'gz_ai_later', short: 'later', kind: 'object', role: 'middleground', target: { w: 40, h: 40 }, promptFile: 'prompts/04-later.txt', attach: ['ref-sheet.png'] },
      ];
      writeFileSync(join(dir, 'pieces.json'), JSON.stringify({ zone: 'z', palette: ['#3E3329'], inputs: ['deco:heights_platform_2'], refs: [{ file: 'ref-01-x.png', name: 'heights_platform_2' }], pieces }));
      for (const p of pieces) writeFileSync(join(dir, p.promptFile), `prompt for ${p.short}\n`);
      writeFileSync(join(dir, 'drop/model.txt'), 'GPT Image 1\n');
      writeFileSync(join(dir, 'drop/rock.png'), encodePng(paint(90, 70, (x, y) => ((x - 45) ** 2 / 900 + (y - 35) ** 2 / 400 < 1 ? [90, 80, 70, 255] : [0, 0, 0, 0]))));
      writeFileSync(join(dir, 'drop/LEDGE.png'), encodePng(paint(200, 80, (x, y) => (y > 10 && y < 70 && x > 10 && x < 190 ? [60, 50, 40, 255] : [255, 0, 255, 255]))));
      writeFileSync(join(dir, 'drop/fake.png'), encodePng(paint(64, 64, (x, y) => ((x >> 3) + (y >> 3)) % 2 ? [255, 255, 255, 255] : [204, 204, 204, 255])));
      const r = runIntake(dir, { today: '2026-10-31' });
      assert.deepEqual(r.pieces.map((p) => p.name), ['gz_ai_t3_rock', 'gz_ai_t3_ledge']);
      assert.deepEqual(r.refused.map((p) => p.piece), ['fake']);
      assert.deepEqual(r.waiting, ['later']);
      const rock = r.pieces[0];
      assert.ok(existsSync(join(dir, 'ready', rock.file)));
      assert.equal(rock.report.background, 'alpha');
      assert.deepEqual(rock.provenance, { licence: 'ai-generated', author: 'Austin Ginder (prompted in T3 Chat)', tool: 'GPT Image 1 via T3 Chat; post-processed by tools/builder/art-intake.mjs', model: 'GPT Image 1', prompt: 'prompt for rock\n', inputs: ['deco:heights_platform_2'], date: '2026-10-31', role: 'middleground' });
      assert.match(rock.sha256, /^[0-9a-f]{64}$/);
      const ledge = r.pieces[1];
      assert.equal(ledge.report.background, 'magenta');
      assert.equal(ledge.w, 120, 'a ledge is scaled to the target width');
      assert.equal(ledge.report.surface, 0, 'trimmed to its top');
      // WebP by default (lane GROUNDED): quality 90, lossless alpha, method 6; format and bytes recorded.
      assert.match(ledge.file, /^gz_ai_t3_ledge\.webp$/);
      assert.match(ledge.format, /^webp \(-quality 90 -define webp:alpha-quality=100 -define webp:method=6/);
      const bytes = readFileSync(join(dir, 'ready', ledge.file));
      assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP');
      assert.equal(ledge.bytes, bytes.length);
      const kept = readImage(join(dir, 'ready', ledge.file));
      assert.equal(kept.w, 120);
      assert.equal(kept.px[3], 255, 'its top-left is solid art');
      const intake = JSON.parse(readFileSync(join(dir, 'ready/intake.json'), 'utf8'));
      assert.equal(intake.pieces.length, 2);
      assert.equal(intake.picture, 'webp');
      assert.equal(intake.bytes, r.pieces[0].bytes + r.pieces[1].bytes);
      // --png keeps the old PNG output (old packs of PNGs still apply the same way).
      const png = runIntake(dir, { today: '2026-10-31', format: 'png', only: new Set(['ledge']) });
      assert.equal(png.pieces[0].file, 'gz_ai_t3_ledge.png');
      assert.equal(decodePng(readFileSync(join(dir, 'ready', png.pieces[0].file))).w, 120);
      assert.ok(png.pieces[0].bytes > ledge.bytes);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the swap into a copy of the draft (art-apply.mjs)', () => {
  const ready = [
    { name: 'gz_ai_t3_basalt_ledge_medium', replaces: 'gz_ai_basalt_ledge_medium', kind: 'topper', report: { surface: 20, tops: [] } },
    { name: 'gz_ai_t3_steam_vent', replaces: 'gz_ai_steam_vent', kind: 'object', report: { tops: Array.from({ length: 21 }, () => 50) } },
    { name: 'gz_ai_t3_lava_blob', replaces: 'gz_ai_lava_blob', kind: 'particle', report: {} },
  ];
  const kept = {
    gz_ai_t3_basalt_ledge_medium: { origin: 'new', licence: 'ai-generated', w: 694, h: 300 },
    gz_ai_t3_steam_vent: { origin: 'new', licence: 'ai-generated', w: 340, h: 250 },
    gz_ai_t3_lava_blob: { origin: 'new', licence: 'ai-generated', w: 92, h: 94 },
  };

  it('every deco and effect drawing an old piece draws the new one; ledges sit on their lines again', () => {
    const { ops, moved, dropped } = swapOps(zone, ready, kept);
    const z = clone(zone);
    applyOps(z, clone(ops));
    const street = z.streets[0].street;
    const decos = street.layers.flatMap((l) => l.decos);
    assert.ok(!decos.some((d) => d.sprite === 'gz_ai_basalt_ledge_medium' || d.sprite === 'gz_ai_steam_vent'));
    const d90 = decos.find((d) => d.id === 'd_90');
    assert.equal(d90.sprite, 'gz_ai_t3_basalt_ledge_medium');
    assert.equal(d90.w, 419, 'a ledge keeps its drawn width');
    assert.equal(d90.h, Math.round((419 * 300) / 694), 'its height follows the new shape');
    // plat_2 is at -150: the new picture's surface (20 of 300 px down) lands on it.
    assert.equal(Math.round(d90.y - d90.h + (20 / 300) * d90.h), -150);
    assert.equal(lineUnder(zone.streets[0].street, zone.streets[0].street.layers.find((l) => l.id === 'middleground').decos.find((d) => d.id === 'd_90')), -150);
    const vent = decos.find((d) => d.id === 'd_106');
    assert.equal(vent.w, 170);
    assert.equal(vent.h, Math.round((250 * 97) / 193), 'an object keeps its drawn scale');
    // The steam at the vent's mouth moves to the new mouth (50 of 250 px down, plus 4%).
    const fx1 = street.emitters.find((e) => e.id === 'fx_1');
    assert.equal(fx1.y, Math.round(vent.y - vent.h + 0.2 * vent.h + vent.h * 0.04));
    assert.equal(street.emitters.find((e) => e.id === 'fx_3').sprite, 'gz_ai_t3_lava_blob');
    assert.ok(moved.ledges >= 8);
    assert.deepEqual(dropped.sort(), ['gz_ai_basalt_ledge_medium', 'gz_ai_lava_blob', 'gz_ai_steam_vent']);
    assert.equal(z.assets.gz_ai_steam_vent, undefined);
    assert.equal(z.assets.gz_ai_t3_steam_vent.w, 340);
    assert.ok(z.assets.gz_ai_basalt_ridge, 'pieces with no new picture keep their art');
  });

  it('the copy has its own id, title and hub; the source zone is not touched', () => {
    const before = JSON.stringify(zone);
    const c = copyZone(zone, { id: 'mount-ashomel-gen', title: 'Mount Ashomel (generated art)', hubId: '905' });
    assert.equal(JSON.stringify(zone), before);
    assert.equal(c.id, 'mount-ashomel-gen');
    assert.equal(c.hub.id, '905');
    assert.equal(c.streets[0].street.hubId, '905');
    assert.ok(!JSON.stringify(c).includes('"hubId":"900"'));
    assert.match(c.streets[0].street.source, /^groddle-builder mount-ashomel-gen/);
  });
});

describe('the generator (art-generate.mjs, stubbed fetch)', () => {
  const KEY = 'test-key-not-real';
  const magentaRock = (w, h) => encodePng(paint(w, h, (x, y) => ((x - w / 2) ** 2 / (w * w * 0.16) + (y - h / 2) ** 2 / (h * h * 0.16) < 1 ? [90, 80, 70, 255] : [255, 0, 255, 255])));
  const checker = encodePng(paint(64, 64, (x, y) => (((x >> 3) + (y >> 3)) % 2 ? [255, 255, 255, 255] : [204, 204, 204, 255])));
  const answer = (png) => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: png.toString('base64') }] }], usage: { total_input_tokens: 1000 } });
  /** A stub fetch: `script` is a list of (req) => [status, body]; it records every request. */
  function stub(script) {
    const reqs = [];
    const fetch = async (url, init) => {
      const req = { url, headers: init.headers, body: JSON.parse(init.body) };
      reqs.push(req);
      const step = script[Math.min(reqs.length - 1, script.length - 1)];
      const [status, body, headers = {}] = step(req);
      return { ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
    };
    return { fetch, reqs };
  }
  function pack(pieces) {
    const dir = mkdtempSync(join(tmpdir(), 'art-gen-'));
    mkdirSync(join(dir, 'drop'));
    mkdirSync(join(dir, 'prompts'));
    writeFileSync(join(dir, 'ref-sheet.png'), encodePng(paint(8, 8, () => [1, 2, 3, 255])));
    writeFileSync(join(dir, 'ref-01-x.png'), encodePng(paint(8, 8, () => [4, 5, 6, 255])));
    writeFileSync(join(dir, 'pieces.json'), JSON.stringify({ zone: 'z', palette: ['#3E3329'], inputs: ['deco:heights_platform_2'], refs: [{ file: 'ref-01-x.png', name: 'heights_platform_2' }], pieces }));
    for (const p of pieces) writeFileSync(join(dir, p.promptFile), `prompt for ${p.short}\n`);
    return dir;
  }
  const piece = (short, w = 200, h = 100, i = 1) => ({ name: `gz_ai_${short}`, short, kind: 'object', role: 'middleground', target: { w, h }, promptFile: `prompts/0${i}-${short}.txt`, attach: ['ref-sheet.png', 'ref-01-x.png'] });
  const quiet = { textCheck: false, sleep: async () => {}, today: '2026-10-31' };

  it('picks the nearest ratio the model takes, and 2K only for big pieces', () => {
    assert.equal(pickAspect(4000, 1393), '21:9');
    assert.equal(pickAspect(3200, 789), '4:1');
    assert.equal(pickAspect(384, 1200), '1:4');
    assert.equal(pickAspect(384, 1200, BASE_RATIOS), '9:16');
    assert.ok(WIDE_RATIOS.length > BASE_RATIOS.length);
    assert.equal(pickSize({ w: 3200, h: 789 }), '2K');
    assert.equal(pickSize({ w: 520, h: 302 }), '1K');
    assert.ok(isHardQuota(429, 'Rate limit exceeded for model x (limit: 0 requests per day on Free Tier)'));
    assert.ok(!isHardQuota(429, 'Rate limit exceeded (limit: 10 requests per minute)'));
  });

  it('builds both request shapes with the prompt first and every reference inline; reads an image from either answer', () => {
    const refs = [{ mimeType: 'image/png', data: 'AAA' }, { mimeType: 'image/png', data: 'BBB' }];
    const a = buildRequest({ model: 'm', prompt: 'p', refs, aspect: '4:1', size: '2K' });
    assert.equal(a.path, '/interactions');
    assert.deepEqual(a.body, { model: 'm', input: [{ type: 'text', text: 'p' }, { type: 'image', mime_type: 'image/png', data: 'AAA' }, { type: 'image', mime_type: 'image/png', data: 'BBB' }], response_format: { type: 'image', aspect_ratio: '4:1', image_size: '2K' } });
    const g = buildRequest({ api: 'generate-content', model: 'm', prompt: 'p', refs, aspect: '4:1', size: '1K' });
    assert.equal(g.path, '/models/m:generateContent');
    assert.deepEqual(g.body.contents[0].parts.map((x) => Object.keys(x)[0]), ['text', 'inlineData', 'inlineData']);
    assert.deepEqual(g.body.generationConfig, { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:1', imageSize: '1K' } });
    assert.equal(extractImage({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('x').toString('base64') } }] } }] }).buf.toString(), 'x');
    assert.equal(extractImage(answer(Buffer.from('y'))).buf.toString(), 'y');
    assert.equal(extractImage({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }).none, 'IMAGE_SAFETY');
    assert.match(correctiveLine(['checkerboard', 'text'], piece('r')), /#FF00FF.*no checkerboard.*No text/);
  });

  it('sends the key in the header only, skips pieces already in drop/, saves the picture, model.txt and provenance', async () => {
    const dir = pack([piece('kept', 200, 100, 1), piece('rock', 200, 100, 2)]);
    try {
      writeFileSync(join(dir, 'drop/kept.png'), magentaRock(200, 100));
      const { fetch, reqs } = stub([() => [200, answer(magentaRock(400, 200))]]);
      const r = await generate(dir, { ...quiet, fetch, key: KEY });
      assert.deepEqual(r.skipped, ['kept']);
      assert.deepEqual(r.made, ['rock']);
      assert.equal(reqs.length, 1);
      assert.equal(reqs[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
      assert.ok(!reqs[0].url.includes(KEY));
      assert.equal(reqs[0].headers['x-goog-api-key'], KEY);
      assert.equal(reqs[0].body.model, DEFAULT_MODEL);
      assert.equal(reqs[0].body.input[0].text, 'prompt for rock');
      assert.equal(reqs[0].body.input.length, 3, 'the prompt and both attached references');
      assert.equal(reqs[0].body.response_format.aspect_ratio, '16:9');
      assert.ok(existsSync(join(dir, 'drop/rock.png')));
      assert.equal(readFileSync(join(dir, 'drop/model.txt'), 'utf8'), `${DEFAULT_MODEL}\n`);
      const log = JSON.parse(readFileSync(join(dir, 'drop/generated.json'), 'utf8'));
      assert.equal(log.pieces.rock.model, DEFAULT_MODEL);
      assert.equal(log.pieces.rock.prompt, 'prompt for rock');
      assert.deepEqual(log.pieces.rock.refs, ['ref-sheet.png', 'ref-01-x.png']);
      assert.equal(log.pieces.rock.date, '2026-10-31');
      assert.match(log.pieces.rock.sha256, /^[0-9a-f]{64}$/);
      assert.ok(!readFileSync(join(dir, 'drop/generated.json'), 'utf8').includes(KEY), 'the key is never written');
      assert.ok(r.cost > 0.03 && r.cost < 0.05, String(r.cost));
      // intake keeps the run's record as the piece's provenance
      const intake = runIntake(dir, { today: '2026-11-02', tag: 'gem' });
      const rock = intake.pieces.find((p) => p.piece === 'rock');
      assert.equal(rock.provenance.model, DEFAULT_MODEL);
      assert.equal(rock.provenance.author, 'Austin Ginder (generated with tools/builder/art-generate.mjs)');
      assert.equal(rock.provenance.tool, `${DEFAULT_MODEL} via the Gemini API; post-processed by tools/builder/art-intake.mjs`);
      assert.equal(rock.provenance.date, '2026-10-31');
      assert.equal(intake.pieces.find((p) => p.piece === 'kept').provenance.author, 'Austin Ginder (prompted in T3 Chat)', 'a hand-saved picture keeps the T3 Chat record');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('backs off and retries a 429 or 5xx; stops the run on a refused key or a hard quota', async () => {
    const dir = pack([piece('a', 200, 100, 1), piece('b', 200, 100, 2)]);
    try {
      const waits = [];
      const s1 = stub([() => [429, { error: { message: 'Rate limit exceeded (limit: 10 requests per minute)' } }, { 'retry-after': '3' }], () => [503, { error: { message: 'busy' } }], () => [200, answer(magentaRock(400, 200))]]);
      const r1 = await generate(dir, { ...quiet, fetch: s1.fetch, key: KEY, only: new Set(['a']), sleep: async (ms) => waits.push(ms) });
      assert.deepEqual(r1.made, ['a']);
      assert.deepEqual(waits, [3000, 4000], 'Retry-After, then exponential');
      assert.equal(r1.calls, 3);
      const s2 = stub([() => [401, { error: { message: 'API key not valid' } }]]);
      const r2 = await generate(dir, { ...quiet, fetch: s2.fetch, key: KEY, force: true });
      assert.match(r2.stopped, /refused the key/);
      assert.equal(s2.reqs.length, 1, 'no second piece after a refused key');
      const s3 = stub([() => [429, { error: { message: 'Rate limit exceeded for model m (limit: 0 requests per day on Free Tier).' } }]]);
      const r3 = await generate(dir, { ...quiet, fetch: s3.fetch, key: KEY, only: new Set(['b']) });
      assert.match(r3.stopped, /Out of quota/);
      assert.equal(s3.reqs.length, 1, 'a hard quota is not retried');
      assert.equal(r3.cost, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stops at the cap of images per run', async () => {
    const dir = pack([piece('a', 200, 100, 1), piece('b', 200, 100, 2), piece('c', 200, 100, 3)]);
    try {
      const lines = [];
      const { fetch, reqs } = stub([() => [200, answer(magentaRock(400, 200))]]);
      const r = await generate(dir, { ...quiet, fetch, key: KEY, cap: 2, log: (l) => lines.push(l) });
      assert.deepEqual(r.made, ['a', 'b']);
      assert.equal(r.stoppedAt, 'c');
      assert.equal(reqs.length, 2);
      assert.ok(lines.some((l) => l.includes('[2/2]')), 'a running count');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks once more with a corrective line for a checkerboard, a wrong shape or text, then keeps the better one and flags it', async () => {
    const dir = pack([piece('board', 200, 100, 1), piece('wide', 400, 100, 2), piece('words', 200, 100, 3)]);
    try {
      const script = [
        () => [200, answer(checker)], () => [200, answer(magentaRock(400, 200))], // board: fixed on the retry
        () => [200, answer(magentaRock(200, 200))], () => [200, answer(magentaRock(200, 200))], // wide: still square: flagged
        () => [200, answer(magentaRock(400, 200))], () => [200, { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'YES' }] }] }], // words: text seen
        () => [200, answer(magentaRock(400, 200))], () => [200, { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'NO' }] }] }],
      ];
      const s = stub(script);
      const r1 = await generate(dir, { ...quiet, fetch: s.fetch, key: KEY, only: new Set(['board', 'wide']) });
      assert.deepEqual(r1.made, ['board', 'wide']);
      assert.ok(!s.reqs[0].body.input[0].text.includes('IMPORTANT'));
      assert.match(s.reqs[1].body.input[0].text, /IMPORTANT: .*#FF00FF.*no checkerboard/);
      assert.match(s.reqs[3].body.input[0].text, /IMPORTANT: Shape it to 4\.00:1 \(wide\)/);
      assert.deepEqual(r1.flagged, [{ piece: 'wide', flags: ['aspect'] }]);
      const log = JSON.parse(readFileSync(join(dir, 'drop/generated.json'), 'utf8'));
      assert.equal(log.pieces.board.attempt, 2);
      assert.deepEqual(log.pieces.board.attempts.map((a) => a.flags), [['checkerboard'], []]);
      assert.match(log.pieces.board.prompt, /IMPORTANT/, 'provenance keeps the prompt actually sent');
      const r2 = await generate(dir, { ...quiet, textCheck: true, fetch: s.fetch, key: KEY, only: new Set(['words']) });
      assert.deepEqual(r2.made, ['words']);
      const textReq = s.reqs[5];
      assert.equal(textReq.body.model, 'gemini-3.1-flash-lite');
      assert.match(s.reqs[6].body.input[0].text, /No text, letters/);
      assert.equal(JSON.parse(readFileSync(join(dir, 'drop/generated.json'), 'utf8')).pieces.words.attempt, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
