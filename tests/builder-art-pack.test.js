/**
 * LEVEL BUILDER art pack: the art bible and prompts for an image model (tools/builder/art-bible.mjs),
 * the picture work on what comes back (tools/builder/art-image.mjs, tools/builder/art-intake.mjs:
 * keying, seams, palette, sizes, provenance) and the swap into a copy of a draft
 * (tools/builder/art-apply.mjs). The fixture is one street of Mount Ashomel with its code-drawn art's rows.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPack, zonePieces, loadShippedStreets, loadPalette, decoColour, applyMatrix, swatches, PROMPT_MAX, KEY_HEX } from '../tools/builder/art-bible.mjs';
import {
  blank, decodePng, encodePng, keyOut, estimateKey, looksLikeCheckerboard, seamScore, fixSeam, snapToPalette,
  resize, opaqueBox, surfaceRow, alphaShare,
} from '../tools/builder/art-image.mjs';
import { prepare, fitSize, newName, toolLine, runIntake, pinkShare } from '../tools/builder/art-intake.mjs';
import { swapOps, copyZone, lineUnder } from '../tools/builder/art-apply.mjs';
import { applyOps } from '../public/js/builder/ops.js?v=acf30407';

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
    assert.equal(pieces.length, Object.keys(zone.assets).length);
    for (const p of pieces) {
      const t = files[p.promptFile];
      assert.ok(t.length <= PROMPT_MAX, `${p.short}: ${t.length} characters`);
      assert.match(t, p.kind === 'strip' ? /ONE LAYER ONLY/ : /ONE (OBJECT|SPRITE) ONLY/);
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
      const kept = decodePng(readFileSync(join(dir, 'ready', ledge.file)));
      assert.equal(kept.w, 120);
      assert.equal(JSON.parse(readFileSync(join(dir, 'ready/intake.json'), 'utf8')).pieces.length, 2);
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
