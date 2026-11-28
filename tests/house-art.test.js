/**
 * G796 (Austin 2026-11-22: build all ten, free, move saves onto the originals): the house on the
 * home street is Glitch's furniture_chassis, one of ten houses with a choice per part, from the
 * CC0 SWFs (tools/house-art/build.mjs), customized with the house's Customize verb
 * (furniture_chassis.js verbs.customize; the client's ChassisManager / ConfiggerUI), free.
 * This file: the art (every part of every house, 1x and 3x).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize } from '../tools/vector-sprites/aligned-art.mjs';
import { HOUSE_ART } from '../public/js/home-house-art.js?v=b949a0f7';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const ITEMS = join(root, '../glitch-items/furniture');
const HOUSE_ART_DIR = 'assets/sprites/home-house/';
const HOUSE_STYLE_IDS = Object.keys(HOUSE_ART);
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the ten houses and every part (art)', () => {
  it('draws the ten catalog houses, 424 choices, every one Tiny Speck put in the .as files', () => {
    assert.deepEqual(HOUSE_STYLE_IDS, ['cottage', 'frog', 'creepy', 'hominid', 'firebog', 'whimsy', 'orient', 'shipwreck', 'tipi', 'bone']);
    let choices = 0;
    for (const id of HOUSE_STYLE_IDS) {
      const a = HOUSE_ART[id];
      assert.ok(a.parts.length >= 5 && a.parts.length <= 8, `${id}: ${a.parts.length} parts`);
      for (const part of a.parts) {
        choices += part.choices.length;
        const layers = a.layers.filter((l) => l.part === part.key);
        assert.ok(layers.length >= 1, `${id} ${part.key}: a container`);
        for (const l of layers) assert.equal(l.art.length, part.choices.length, `${id} ${part.key}: art per choice`);
      }
    }
    assert.equal(choices, 424);
  });

  it('each choice is drawn unless its symbol is the empty one', () => {
    const empty = [];
    for (const id of HOUSE_STYLE_IDS) {
      for (const l of HOUSE_ART[id].layers) {
        if (l.band) continue;
        const part = HOUSE_ART[id].parts.find((p) => p.key === l.part);
        l.art.forEach((row, i) => { if (!row) empty.push(`${id}:${part.choices[i]}`); });
      }
    }
    // The Tipi Tent's fifth decoration and the Bone Dwelling's fourth front bones are no piece: their
    // symbols hold only an invisible shape (fill-opacity 0), the way the others are named none or empty.
    for (const e of empty) assert.ok(/none|empty|nothing/.test(e) || ['tipi:tentdeco_05_close', 'tipi:tentdeco_05_offside', 'bone:frontbones_four'].includes(e), `${e} drew nothing`);
    assert.equal(empty.length, 16);
  });

  it('every piece is a 1x WebP with its 3x twin, registered for dense screens', async () => {
    const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=c1bcff21');
    const bad = [];
    for (const id of HOUSE_STYLE_IDS) {
      for (const l of HOUSE_ART[id].layers) {
        for (const row of l.band ? [l.art] : l.art) {
          if (!row) continue;
          const path = `${HOUSE_ART_DIR}${row[0]}`;
          if (!existsSync(join(pub, path))) { bad.push(`${path}: missing`); continue; }
          const one = imageSize(join(pub, path));
          if (one.w !== row[3] || one.h !== row[4]) bad.push(`${path}: ${one.w}x${one.h}`);
          const twin = HIRES_SPRITES.get(path);
          if (!twin || !existsSync(join(pub, twin))) { bad.push(`${path}: no 3x twin`); continue; }
          const hi = imageSize(join(pub, twin));
          if (hi.w !== one.w * 3 || hi.h !== one.h * 3) bad.push(`${twin}: not 3x`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  it('the art module is the builder\'s (tools/house-art/build.mjs --check)', { skip: !existsSync(ITEMS) || !process.env.GRODDLE_ART_CHECK ? 'set GRODDLE_ART_CHECK=1 with glitch-items and FFDec to run the builder' : false, timeout: 3_600_000 }, () => {
    execFileSync('node', ['tools/house-art/build.mjs', '--check'], { cwd: root, stdio: 'inherit' });
  });

  it('the builder reads the containers from the SWF and the parts from the .as, as initializehead attached them', () => {
    const src = read('tools/house-art/build.mjs');
    assert.match(src, /addArticleToContainer\\\(\(\?:'\(\[\^'\]\*\)'\\s\*\\\+\\s\*\)\?ob\\\.\(\\w\+\), house_mc, '\(\\w\+\)'\\\)/);
    assert.match(src, /--check/);
    // The Frog House's glasses are two containers of one part (glassLeft_ / glassRight_).
    const frog = HOUSE_ART.frog.layers.filter((l) => l.part === 'glasses');
    assert.equal(frog.length, 2);
  });
});
