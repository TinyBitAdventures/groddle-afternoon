/**
 * Three small animations Tiny Speck drew that the game held and did not play (lane refsart):
 * a powder's jar puffing (js/powder-shakers.js), the Plank's own swing for the player who is
 * splanked (features/player-verbs-mp-feature.js, tools/emote-art/build.py), and a Batterfly
 * turning to look at a player at it (features/animal-husbandry-feature.js). Rules are read
 * against Tiny Speck's files when they are beside the repo; grids against the shipped files.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { POWDER_SHAKE, powderShakerSheet } from '../public/js/powder-shakers.js?v=fcd18855';
import { POWDERS } from '../public/js/powders.js?v=397984f7';
import { PACKED_SHEETS } from '../public/js/packed-sheets-data.js?v=192c6f15';
import { packedCell, packedDurationMs, packedFrameAt } from '../public/js/packed-sheets.js?v=dadad463';
import { itemOverlayPlacement } from '../public/js/item-overlay.js?v=e1d5da29';
import { PLAYER_VERBS } from '../public/js/player-verbs-mp.js?v=c82b7e0f';
import { imageSize } from '../tools/image-size.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const GSJS = join(root, '..', 'glitch-GameServerJS', 'items');
const haveGsjs = existsSync(join(GSJS, 'fertilidust.js'));
const packed = JSON.parse(readFileSync(join(root, 'tools/packed-sheets/results.json'), 'utf8')).sheets;

describe('a powder puffs from its jar when it is used', () => {
  // Measured from Tiny Speck's OGA sheets: [sheet w, sheet h, cols, rows, cell w, cell h, frames].
  const MEASURED = {
    fertilidust: [864, 840, 18, 5, 48, 168, 90],
    fertilidust_lite: [864, 800, 18, 5, 48, 160, 90],
    sneezing_powder: [864, 825, 18, 5, 48, 165, 90],
    sparkle_powder: [864, 815, 18, 5, 48, 163, 90],
    fairly_hallowed_shrine_powder: [864, 805, 18, 5, 48, 161, 90],
    extremely_hallowed_shrine_powder: [864, 840, 18, 5, 48, 168, 90],
    powder_of_mild_fecundity: [864, 805, 18, 5, 48, 161, 90],
    powder_of_startling_fecundity: [864, 845, 18, 5, 48, 169, 90],
    no_no_powder: [996, 171, 12, 3, 83, 57, 35],
  };

  it('the source: a pc_overlay on the user for 3000 ms, 120 px up, 60 x 60, in every one of the nine', { skip: haveGsjs ? false : 'clone tinyspeck/glitch-GameServerJS beside the repo' }, () => {
    for (const cls of Object.keys(MEASURED)) {
      const src = readFileSync(join(GSJS, `${cls}.js`), 'utf8');
      assert.match(src, /type: 'pc_overlay',\s+item_class: this\.class_tsid,\s+duration: 3000,\s+state: 'tool_animation',\s+pc_tsid: pc\.tsid,\s+locking: false,\s+dismissible: false,\s+delta_x: 0,\s+delta_y: -120,\s+width: 60,\s+height: 60,/, cls);
      // None of them is an 'apply' powder (that branch puts the overlay on a target).
      assert.doesNotMatch(src, /"verb"\s*:\s*"apply"/, cls);
    }
    assert.deepEqual({ ...POWDER_SHAKE }, { ms: 3000, deltaY: -120, wh: 60 });
  });

  it('the sheets: eight of 18 x 5 cells of 48 px with 90 frames, No-No Powder 12 x 3 of 83 x 57 with 35', () => {
    assert.deepEqual(Object.keys(PACKED_SHEETS.powders).sort(), Object.keys(MEASURED).sort());
    for (const [cls, [w, h, cols, rows, cw, ch, frames]] of Object.entries(MEASURED)) {
      const def = powderShakerSheet(cls);
      const row = packed.find((r) => r.set === 'powders' && r.name === cls);
      assert.deepEqual(row.oga.size, [w, h], cls);
      assert.deepEqual([row.oga.cols, row.oga.rows], [cols, rows], cls);
      assert.deepEqual([...def.cell], [cw, ch], cls);
      assert.equal(def.plays, frames, cls);
      assert.equal(def.fps, 30, cls);
      assert.equal(def.loop, true, cls);
      const size = imageSize(join(root, 'public', def.path));
      assert.deepEqual([size.w, size.h], [def.cols * def.fw, Math.ceil(def.frames / def.cols) * def.fh], def.path);
    }
    // One puff for one use: 90 frames are the overlay's 3 s; it starts and ends on the jar alone.
    const dust = powderShakerSheet('fertilidust_lite');
    assert.equal(packedDurationMs(dust), POWDER_SHAKE.ms);
    assert.equal(packedCell(dust, 0), packedCell(dust, 89), 'the last frame is the first picture again');
    assert.equal(packedFrameAt(dust, 1500), 45);
    // Fitted to 60 px by its longer side: a 48 x 160 cell is drawn 18 x 60.
    const place = itemOverlayPlacement(dust.cell, 500, 400 + POWDER_SHAKE.deltaY, POWDER_SHAKE.wh);
    assert.deepEqual([place.width, place.height, place.top], [18, 60, 220]);
  });

  it('every powder the game has plays it but Krazy Salts, which has no sheet', () => {
    const without = Object.keys(POWDERS).filter((cls) => !powderShakerSheet(cls));
    assert.deepEqual(without, ['krazy_salts']);
    const src = read('js/features/powders-feature.js');
    assert.match(src, /function finishUse\(engine, classTsid\) \{\s+const def = POWDERS\[classTsid\];\s+playShaker\(engine, classTsid\);/);
    assert.match(src, /wh: POWDER_SHAKE\.wh,\s+durationMs: POWDER_SHAKE\.ms,[\s\S]{0,300}?at: \(\) => pcOverlayPoint\(engine\.player, \{ dy: POWDER_SHAKE\.deltaY \}\),/);
  });
});

describe('the Plank swings for the player who is splanked', () => {
  it('the source: a vp_overlay of the plank in its emote_animation for 10 s', { skip: haveGsjs ? false : 'clone tinyspeck/glitch-GameServerJS beside the repo' }, () => {
    const src = readFileSync(join(GSJS, 'plank.js'), 'utf8');
    assert.match(src, /type: 'vp_overlay',\s+item_class: "plank",\s+state: "emote_animation",\s+duration: 10000,\s+size: "225%",/);
    assert.deepEqual({ ...PLAYER_VERBS.splank.overlay }, { anim: 'splank', ms: 10000 });
  });

  it('the art: 8 x 12 cells of 490 x 291, 90 frames (the last two empty), one animated picture that plays once', () => {
    const meta = JSON.parse(readFileSync(join(root, 'tools/emote-art/emotes.json'), 'utf8'));
    assert.deepEqual(meta.oga.size, [3920, 3492]);
    assert.deepEqual([meta.oga.cols, meta.oga.rows], [8, 12]);
    assert.deepEqual(meta.oga.blank, [88, 89]);
    assert.deepEqual(meta.size, [490, 291]);
    assert.deepEqual([meta.frames, meta.fps, meta.loop], [90, 30, 1]);
    // The WebP itself: an animation of 90 frames on a 490 x 291 canvas, looping once.
    const b = readFileSync(join(root, 'public', meta.file));
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    let frames = 0;
    let ms = 0;
    let loop = -1;
    let canvas = null;
    for (let i = 12; i + 8 <= b.length;) {
      const id = b.toString('ascii', i, i + 4);
      const len = b.readUInt32LE(i + 4);
      if (id === 'ANMF') {
        frames += 1;
        ms += b.readUIntLE(i + 8 + 12, 3);
      }
      if (id === 'ANIM') loop = b.readUInt16LE(i + 12);
      if (id === 'VP8X') canvas = [b.readUIntLE(i + 12, 3) + 1, b.readUIntLE(i + 15, 3) + 1];
      i += 8 + len + (len & 1);
    }
    // The encoder joins frames that are the same picture (59 of the 90 differ): the time is what counts.
    assert.ok(frames >= 59 && frames <= 90, `${frames} pictures`);
    assert.equal(ms, 3000, '90 frames at 30 a second');
    assert.equal(loop, 1);
    assert.deepEqual(canvas, [490, 291]);
  });

  it('the overlay shows it, not the still icon; the builder is current', () => {
    const src = read('js/features/player-verbs-mp-feature.js');
    assert.match(src, /export const SPLANK_ART = 'assets\/sprites\/emotes\/plank\.webp';/);
    assert.match(src, /const src = `\$\{splank \? SPLANK_ART : `assets\/sprites\/emotional-bear\/\$\{overlay\.anim\}\.webp`\}\?play=\$\{Date\.now\(\)\}`;/);
    assert.doesNotMatch(src, /icons\/plank@3x\.webp/);
    assert.doesNotMatch(src, /pverb-splank/);
    let out;
    try {
      out = execFileSync('python3.11', ['-I', join(root, 'tools/emote-art/build.py'), '--check'], { encoding: 'utf8' });
    } catch (err) {
      if (/ENOENT|No module named/.test(String(err.stderr || err))) return;
      throw new Error(String(err.stdout || err));
    }
    assert.match(out, /emote art: 1 current/);
  });
});

describe('a Batterfly turns to look at a player at it', () => {
  it('the source: onWaitStart stops it and sets profile_turned, a looping state', { skip: existsSync(join(GSJS, 'npc_batterfly.js')) ? false : 'clone tinyspeck/glitch-GameServerJS beside the repo' }, () => {
    const src = readFileSync(join(GSJS, 'npc_batterfly.js'), 'utf8');
    assert.match(src, /function onWaitStart\(pc\)\{[^}]*this\.apiStopMoving\(\);\s+this\.is_waiting = 1;\s+this\.wait_pc = pc;\s+this\.state = 'profile_turned';/);
  });

  it('the sheet: 8 x 5 cells of 111 x 96, 40 frames of 10 pictures, looping at 30 a second, with its 3x twin', () => {
    const def = PACKED_SHEETS.batterfly.profile_turned;
    const row = packed.find((r) => r.set === 'batterfly');
    assert.deepEqual(row.oga.size, [888, 480]);
    assert.deepEqual([row.oga.cols, row.oga.rows], [8, 5]);
    assert.deepEqual([...def.cell], [111, 96]);
    assert.deepEqual([def.plays, def.frames, def.fps, def.loop], [40, 10, 30, true]);
    assert.deepEqual(row.frameList, [41, 42, 43, 44, 45, 46, 47, 48, 49, 50], 'npc_batterfly.swf sprite 81, profile_turned 41-80');
    const { w, h } = imageSize(join(root, 'public', def.path));
    assert.deepEqual([w, h], [def.cols * def.fw, Math.ceil(def.frames / def.cols) * def.fh]);
    const big = imageSize(join(root, 'public', def.path.replace('.webp', '@3x.webp')));
    assert.deepEqual([big.w, big.h], [w * 3, h * 3]);
    assert.equal(packedFrameAt(def, (40 * 1000) / 30 + 34), 1, 'it loops');
  });

  it('the feature: it stops and shows the look while the player is at it, faces them, and flies on after', () => {
    const src = read('js/features/animal-husbandry-feature.js');
    assert.match(src, /const waiting = !entity\.chewUntil && Boolean\(engine\.actingOn\?\.\(entity\.target\)\);/);
    assert.match(src, /spr\.textures = turnedLoader\.frames\(BATTERFLY_TURNED\);\s+spr\.loop = true;/);
    assert.match(src, /if \(p\) spr\.scale\.x = Math\.abs\(spr\.scale\.y\) \* \(p\.x >= spr\.x \? 1 : -1\);/);
    assert.match(src, /if \(batterflyWaits\(engine, entity\)\) return;/);
    // The sheet is asked for the first time a Batterfly is looked at, not at boot.
    assert.match(src, /if \(!turnedLoader\.ready\(BATTERFLY_TURNED\)\) \{\s+turnedLoader\.load\(BATTERFLY_TURNED\);/);
    assert.match(src, /loader\.loadAll\(Object\.values\(BATTERFLY_SHEETS\)\);/);
    assert.equal(Object.keys(PACKED_SHEETS.batterfly).length, 1);
  });
});
