/**
 * Sharp sprites drawn bigger than their 1x frames (lane SPRITES, 2026-10-28):
 * the Street Spirits' street clips at 3x, the loneliness porthole at 5x, the
 * in-hand tool animations at 3x and the Focusing Orb at 4x, all from
 * Tiny Speck's CC0 vector SWFs through tools/vector-sprites/build.mjs.
 * Run: node --test tests/sprite-density.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_DRAW_SPRITES, HIRES_SPRITES } from '../public/js/sprite-hires.js?v=bf62077e';
import { DENSE_SPRITES, denseFrame, densePath, denseSprite } from '../public/js/sprite-dense.js?v=8e0109eb';
import {
  STREET_SPIRIT_ART,
  STREET_SPIRIT_LONELY_ART,
  PORTRAIT_STATES,
  portraitFit,
  portraitLook,
  portraitSheet,
  spiritCrySheet,
  spiritSheet,
} from '../public/js/street-spirits.js?v=f9e88445';
import { STREET_SPIRIT_VARIANTS } from '../public/js/street-spirits.js?v=f9e88445';
import { inviteBox } from '../public/js/spirit-loneliness.js?v=9259917d';
import { PORTRAIT_DENSITY, portraitManifest, streetManifest } from '../tools/vector-sprites/street-spirit-manifests.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const vs = join(root, 'tools/vector-sprites');
const json = (f) => JSON.parse(readFileSync(join(vs, f), 'utf8'));
const results = json('results.json');
const dense = json('results-dense.json');
const MANIFESTS = ['street-spirits.json', 'spirit-portraits.json', 'hand-tools.json', 'dense-tools.json'];

describe('sharp sprites drawn bigger than their frames', () => {
  it('the Street Spirit manifests are the ones js/street-spirits.js generates', () => {
    assert.deepEqual(json('street-spirits.json'), JSON.parse(JSON.stringify(streetManifest())));
    assert.deepEqual(json('spirit-portraits.json'), JSON.parse(JSON.stringify(portraitManifest())));
  });

  it('build.mjs --check passes for every new manifest (files N x their 1x sheet, modules current)', () => {
    for (const m of MANIFESTS) {
      const out = execFileSync(process.execPath, [join(vs, 'build.mjs'), '--manifest', join(vs, m), '--check'], { encoding: 'utf8' });
      assert.match(out, /: ok$/m, `${m}\n${out}`);
    }
  });

  it('every street clip, cry and porthole strip the game cuts is built, with the frame count the code plays', () => {
    let street = 0;
    let portraits = 0;
    for (const [variant, art] of Object.entries(STREET_SPIRIT_ART)) {
      for (const look of Object.keys(art.looks)) {
        const defs = [...Object.keys(art.states).map((s) => spiritSheet(variant, look, s)), spiritCrySheet(variant, look)].filter(Boolean);
        for (const def of defs) {
          const r = results[def.path];
          assert.equal(r?.status, 'ok', `${def.path}: ${r?.reason}`);
          assert.equal(r.cells, def.frames, def.path);
          assert.deepEqual([r.fw, r.fh], [def.fw, def.fh], def.path);
          assert.equal(HIRES_SPRITES.get(def.path), r.hires, def.path);
          assert.ok(FIRST_DRAW_SPRITES.has(def.path), `${def.path} swaps on first draw`);
          assert.ok(r.score >= 0.9 && r.minFrame >= 0.8 && r.drift.length === 0, `${def.path} ${r.score}/${r.minFrame}`);
          street++;
        }
      }
      if (!STREET_SPIRIT_LONELY_ART[variant]) continue;
      for (const look of new Set(Object.keys(art.looks).map((l) => portraitLook(variant, l)))) {
        for (const state of PORTRAIT_STATES) {
          const def = portraitSheet(variant, look, state);
          const r = dense[def.path];
          assert.equal(r?.status, 'ok', `${def.path}: ${r?.reason}`);
          assert.equal(r.density, PORTRAIT_DENSITY, def.path);
          assert.equal(r.cells, def.frames, def.path);
          assert.equal(def.fps, 30, def.path);
          assert.ok(r.score >= 0.9 && r.minFrame >= 0.8 && r.drift.length === 0, `${def.path} ${r.score}/${r.minFrame}`);
          assert.ok(DENSE_SPRITES.has(def.path), def.path);
          portraits++;
        }
      }
    }
    assert.equal(street, 38);
    assert.equal(portraits, 27);
  });

  it('the SWF frames each strip shows are the label the code names (frame-accurate, same count and 30 fps)', () => {
    for (const r of [...Object.values(results), ...Object.values(dense)]) {
      if (!r.animal?.startsWith('street-spirit') && !r.animal?.startsWith('spirit-portrait')) continue;
      assert.equal(r.shift, 0, `${r.label} shift`);
      const step = r.step || 1;
      assert.equal((r.swfFrames[1] - r.swfFrames[0]) / step + 1, r.cells, r.label);
      assert.ok(r.cells <= Math.ceil(r.swfLabelFrames / step), `${r.label}: ${r.cells} of ${r.swfLabelFrames}`);
    }
  });

  it('5x is what the porthole needs: the 1x cell fitted to loneliness_size at 3 device px per CSS px', () => {
    for (const [variant, v] of Object.entries(STREET_SPIRIT_VARIANTS)) {
      if (!v.loneliness) continue;
      const look = portraitLook(variant, Object.keys(STREET_SPIRIT_ART[variant].looks)[0]);
      const need = (inviteBox(v.loneliness).size * 3) / portraitFit(variant, look);
      assert.ok(need > 4.4 && need < 5.5, `${variant} needs ${need.toFixed(2)}`);
      assert.ok(need / PORTRAIT_DENSITY < 1.5, variant);
    }
  });

  it('the in-hand tool animations play their SWF tool_animation scene at 3x, frame for frame', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    const hand = json('hand-tools.json');
    for (const job of hand.jobs) {
      for (const sheet of job.sheets) {
        const r = results[sheet.path];
        assert.equal(r?.status, 'ok', `${sheet.path}: ${r?.reason}`);
        assert.equal(r.cells, sheet.frames, sheet.path);
        assert.deepEqual(r.swfFrames, [sheet.swfStart, sheet.swfStart + sheet.frames - 1], sheet.path);
        assert.ok(HIRES_SPRITES.get(sheet.path)?.endsWith('@3x.webp') || HIRES_SPRITES.get(sheet.path)?.endsWith('@3x.png'), sheet.path);
      }
    }
    // The watering can, hatchet and Class Axe rows of game.js SHEETS are these sheets.
    for (const [key, path] of [['wateringCanTool', 'assets/sprites/tools/watering-can-tool.png'], ['hatchetTool', 'assets/sprites/tools/hatchet-tool.png'], ['classAxeTool', 'assets/sprites/tools/class-axe-tool.png']]) {
      assert.match(game, new RegExp(`${key}: \\{\\s*url: '${path.replace(/[.]/g, '\\.')}'`), key);
      assert.ok(HIRES_SPRITES.has(path), path);
    }
  });

  it('denseSprite picks the dense file only where it is drawn at 1.5+ device px per 1x pixel', () => {
    const path = 'assets/sprites/street-spirits/groddle_dirt_lonely_loop.webp';
    assert.equal(denseSprite(path, 1.2), null);
    const hit = denseSprite(`./${path}?v=1`, 4.6);
    assert.equal(hit.density, 5);
    assert.equal(densePath(`https://x.test/play/../${path}?v=2`), path);
    assert.equal(denseSprite('assets/sprites/icons/apple.png', 9), null);
  });

  it('denseFrame finds every cell in its part, density x the 1x cell', () => {
    for (const [path, d] of DENSE_SPRITES) {
      const r = dense[path];
      let seen = 0;
      for (let i = 0; i < r.cells; i++) {
        const f = denseFrame(d, (r.first ?? 0) + i);
        assert.ok(f, `${path} cell ${i}`);
        assert.equal(f.w, d.fw * d.density);
        assert.equal(f.h, d.fh * d.density);
        assert.ok(existsSync(join(pub, f.url)), f.url);
        seen++;
      }
      assert.equal(denseFrame(d, (r.first ?? 0) + r.cells), null, path);
      assert.equal(seen, r.cells);
      // Parts decode to at most the manifest budget (24 MB porthole parts).
      for (const [url, , count, cols] of d.parts) {
        const mb = (cols * d.fw * d.density * Math.ceil(count / cols) * d.fh * d.density * 4) / 2 ** 20;
        assert.ok(mb <= 24.01, `${url}: ${mb.toFixed(1)} MB`);
      }
    }
  });

  it('the porthole draws the dense part when it is in, at up to 3 device px per CSS px', () => {
    const src = readFileSync(join(pub, 'js/features/spirit-loneliness-feature.js'), 'utf8');
    assert.match(src, /from '\.\.\/sprite-dense\.js\?v=[0-9a-f]{8}'/);
    assert.match(src, /const pxRatio = Math\.min\(3, globalThis\.devicePixelRatio \|\| 1\)/);
    assert.match(src, /denseSprite\(def\.path, pxPerTexel\)/);
    assert.match(src, /portraitFrame\(inv, clip, f\)/);
  });

  it('the Focusing Orb draws its 4x cells where meditation holds it at 1.3 times their size', () => {
    const med = readFileSync(join(pub, 'js/features/meditation-feature.js'), 'utf8');
    assert.match(med, /denseSprite\(ORB_TOOL_SHEET\.url/);
    const r = dense['assets/sprites/meditation/focusing_orb-tool.png'];
    assert.equal(r?.status, 'ok', r?.reason);
    assert.equal(r.density, 4);
    assert.equal(r.cells, 31);
  });
});
