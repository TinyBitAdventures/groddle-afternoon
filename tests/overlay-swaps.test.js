/**
 * G251: the hand-drawn overlay stand-ins swapped for Tiny Speck's own art
 * (tools/overlay-art WebP sheets), the in-street placement the client used
 * (center_bottom), and the fireworks frames' shared outlines and ramps.
 * Run: node --test tests/overlay-swaps.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assembleFrames,
  displayTopOf,
  easeOutBack,
  itemstackOverlayPoint,
  overlayFrameAt,
  standPlacement,
} from '../public/js/overlay-art.js?v=g273-1';
import { OVERLAYS, shareFrames } from '../tools/overlay-art/build.mjs';
import { PIGGY_DEATH_PUFF } from '../public/js/animal-mood.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const overlaysDir = join(pub, 'assets/sprites/overlays');
const manifest = JSON.parse(readFileSync(join(overlaysDir, 'overlays.json'), 'utf8'));
const gsjsDir = join(here, '../../glitch-GameServerJS');
const clientDir = join(here, '../../glitch-client/com/tinyspeck/engine');
const gsjs = (p) => readFileSync(join(gsjsDir, p), 'utf8');
const read = (p) => readFileSync(join(pub, p), 'utf8');

/** Width and height of a WebP (VP8X, VP8L or VP8 ). */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
}

const SWAPS = {
  focusing_orb_laser_beam: { fps: 30, frames: 29 },
  shrine_laser_beam_1: { fps: 30, frames: 50 },
  shrine_laser_beam_2: { fps: 30, frames: 50 },
  shrine_laser_beam_3: { fps: 30, frames: 50 },
  rainbow_youdidit: { fps: 30, frames: 115 },
  rainbow_fullyrevived: { fps: 30, frames: 115 },
  rainbow_secretspot: { fps: 30, frames: 115 },
  smoke_puff: { fps: 24, frames: 21 },
  proto_puff: { fps: 30, frames: 46 },
};

describe('the swapped overlays are built', () => {
  it('each is a WebP sheet at the FLA frame rate, every cell in the image', () => {
    for (const [key, want] of Object.entries(SWAPS)) {
      const m = manifest[key];
      assert.ok(m, key);
      assert.ok(OVERLAYS[key]?.webp > 0, key);
      assert.equal(m.kind, 'sheet', key);
      assert.equal(m.fps, want.fps, key);
      assert.equal(m.frames, want.frames, key);
      assert.equal(m.order.length, want.frames, key);
      assert.match(m.file, /\.webp$/, key);
      const [w, h] = webpSize(readFileSync(join(overlaysDir, m.file)));
      assert.equal(w, m.cell[0] * m.cols, key);
      assert.ok(h >= m.cell[1] * Math.ceil((Math.max(...m.order) + 1) / m.cols), key);
      // WebGL 4096 px.
      assert.ok(w <= 4096 && h <= 4096, `${key} ${w}x${h}`);
    }
  });

  it('the rainbows are drawn at 1.25x (shown at 400/330 of the stage)', () => {
    for (const key of ['rainbow_youdidit', 'rainbow_fullyrevived', 'rainbow_secretspot']) {
      assert.equal(manifest[key].scale, 1.25, key);
      assert.match(manifest[key].file, /@1\.25x\.webp$/, key);
      assert.deepEqual(manifest[key].stage, [330, 200], key);
    }
  });

  it('the SWFs that stop() hold their last frame', () => {
    const rb = manifest.rainbow_youdidit;
    assert.equal(overlayFrameAt(rb, 3990, { loop: false }), 114);
    assert.equal(overlayFrameAt(manifest.smoke_puff, 1500, { loop: false }), 20);
    // The lasers loop for their duration.
    assert.equal(overlayFrameAt(manifest.shrine_laser_beam_1, 1800), 54 % 50);
  });
});

describe('in-street placement (ArbitrarySWFView center_bottom)', () => {
  const meta = { stage: [100, 50], box: [10, 5, 80, 40] };

  it('the client registers in-location overlays at the bottom centre', { skip: !existsSync(clientDir) }, () => {
    const src = readFileSync(join(clientDir, 'view/gameoverlay/InLocationAnnouncementOverlay.as'), 'utf8');
    assert.match(src, /new ArbitrarySWFView\(annc\.swf_url, art_view_wh, annc\.state, 'center_bottom'/);
    assert.match(src, /var art_view_wh:int = Math\.max\(annc\.height, annc\.width\);/);
    const view = readFileSync(join(clientDir, 'view/gameoverlay/ArbitrarySWFView.as'), 'utf8');
    assert.match(view, /mc\.scaleX = mc\.scaleY = _wh\/swf_w;/);
  });

  it('stands the stage on the point, 1:1 or fitted to the larger side', () => {
    assert.deepEqual(standPlacement(meta, 500, 300), { left: 460, top: 255, width: 80, height: 40, scale: 1 });
    // A 200 box: 200 / 100 = 2.
    assert.deepEqual(standPlacement(meta, 500, 300, 200), { left: 420, top: 210, width: 160, height: 80, scale: 2 });
    // overlay_scale zooms about the same bottom centre.
    const z = standPlacement(meta, 500, 300, 0, 1.5);
    assert.equal(z.top + (meta.stage[1] - meta.box[1]) * 1.5, 300);
  });

  it('itemstack overlays stand on the display top plus delta_y', () => {
    assert.deepEqual(itemstackOverlayPoint(100, -80, { dx: 5, dy: 140 }), { x: 105, y: 60 });
    const spr = { y: 200, scale: { y: 2 }, getLocalBounds: () => ({ minY: -30 }) };
    assert.equal(displayTopOf(spr), 140);
    assert.equal(displayTopOf({ y: 50, height: 20 }), 30);
  });

  it('easeOutBack overshoots and lands at 1', () => {
    assert.ok(Math.abs(easeOutBack(0)) < 1e-12);
    assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-12);
    assert.ok(easeOutBack(0.6) > 1);
  });
});

describe('the source lines the overlays follow', { skip: !existsSync(gsjsDir) }, () => {
  it('Rook: orb laser 1 s scaled 1 + min(n/6, 1); shrine lasers 2 s at delta 5 / 140', () => {
    const rook = gsjs('locations/inc_rook.js');
    assert.match(rook, /swf_url:overlay_key_to_url\('focusing_orb_laser_beam'\),[\s\S]{0,200}duration:1000/);
    assert.match(rook, /var scale = Math\.min\(\(1\.0 \/ 6\.0\) \* n_players, 1\.0\);\s*annc\.y -= 50 - scale \* 100;/);
    assert.match(rook, /scale: 1\.0 \+ scale,\s*time: 0\.25/);
    const shrines = gsjs('items/include/shrines.js');
    assert.match(shrines, /duration: 2000,\s*itemstack_tsid: this\.tsid,\s*delta_x: 5,\s*delta_y: 140,/);
    assert.match(shrines, /is_emblem\) \{\s*annc\.swf_url = overlay_key_to_url\('shrine_laser_beam_3'\);\s*\} else if\(damage >= 100\)/);
  });

  it('rainbows: 400 x 400, 4 s', () => {
    assert.match(gsjs('players/player.js'), /function show_rainbow\(overlay_key, delay\)\{\s*var duration = 4000;[\s\S]{0,260}width: 400,\s*height: 400,/);
    assert.match(gsjs('items/include/rook.js'), /rainbow_fullyrevived'\),\s*duration: 4000,[\s\S]{0,120}width: 400,\s*height: 400,\s*follow: true,/);
  });

  it('puffs: smoke_puff delta_y 95 for 1.5 s (140 for the bot), proto_puff delta_y 125 for 2 s', () => {
    assert.match(gsjs('items/npc_piggy.js'), /overlay_key_to_url\('smoke_puff'\),\s*delta_y: 95,\s*follow: true,\s*duration: 1500/);
    assert.deepEqual({ ...PIGGY_DEATH_PUFF }, { overlay: 'smoke_puff', deltaY: 95, durationMs: 1500, dieAfterMs: 500 });
    assert.match(gsjs('items/npc_maintenance_bot.js'), /overlay_key_to_url\('smoke_puff'\),\s*delta_y: 140/);
    assert.match(gsjs('items/butler_box.js'), /delta_y: 125,\s*duration: 2000,\s*swf_url: overlay_key_to_url\('proto_puff'\)/);
  });
});

describe('wiring: the stand-ins are gone', () => {
  it('the Rook fight plays the real lasers and rainbows', () => {
    const src = read('js/features/rook-attack-feature.js');
    assert.doesNotMatch(src, /function spawnBeam|function spawnRainbow|'YOU DID IT!'/);
    assert.match(src, /playArt\(engine, 'focusing_orb_laser_beam', \{ at: \(\) => at, durationMs: 1000, zoomAt: \(ms\) => 1 \+ s \* easeOutBack\(ms \/ 250\) \}\)/);
    assert.match(src, /playArt\(engine, `shrine_laser_beam_\$\{/);
    assert.match(src, /itemstackOverlayPoint\(spr\.x, displayTopOf\(spr\), \{ dx: 5, dy: 140 \}\)/);
    assert.match(src, /'rainbow_youdidit', \{ at: \(\) => \(\{ x: p\.x, y: p\.y \}\), wh: 400, durationMs: 4000, loop: false \}/);
    assert.match(src, /'rainbow_fullyrevived', \{ at, wh: 400, durationMs: 4000, loop: false \}/);
  });

  it('Secret Spot!, the puffs and the box openings use the recovered art', () => {
    const ss = read('js/features/secret-spots-feature.js');
    assert.match(ss, /playSheetOverlay\(engine\.PIXI, 'rainbow_secretspot'/);
    assert.doesNotMatch(ss, /RAINBOW_COLORS|function buildRainbow/);
    const mood = read('js/features/animal-mood-feature.js');
    assert.match(mood, /playSheetOverlay\(engine\.PIXI, PIGGY_DEATH_PUFF\.overlay/);
    assert.doesNotMatch(mood, /const blobs = \[\[0, 0, 30\]/);
    for (const f of ['js/features/craftybot-feature.js', 'js/features/butler-feature.js']) {
      const src = read(f);
      assert.match(src, /playSheetOverlay\(engine\.PIXI, 'proto_puff'/, f);
      assert.doesNotMatch(src, /function puff\(engine, x, y\)/, f);
    }
    assert.match(read('js/quest-rooms/back-alley.js'), /playSheetOverlay\(ctx\.PIXI, 'smoke_puff'/);
  });

  it('play_glitch and the sneeze stand on their points too', () => {
    assert.match(read('js/features/swf-feature.js'), /standPlacement\(playArt, p\.x, p\.y \+ PLAY_OVERLAY\.dy, 110\)/);
    assert.match(read('js/features/funpickle-feature.js'), /standPlacement\(sneezeArt, p\.x, p\.y \+ SNEEZE_OVERLAY\.dy, Math\.max\(SNEEZE_OVERLAY\.width, SNEEZE_OVERLAY\.height\)\)/);
  });
});

describe('the Qurazy overlay (G260 follow-up)', () => {
  it('location.js spawnQurazy shows o_qurazy_quoin_overlay for 10 s at x 50%, top_y -5%, fading out over 3 s', { skip: !existsSync(gsjsDir) }, () => {
    assert.match(gsjs('locations/location.js'), /overlay_key: 'o_qurazy_quoin_overlay',\s*duration: 10000,\s*x: '50%',\s*top_y: '-5%',\s*scale_to_stage: true,\s*fade_out_sec: 3/);
  });

  it('is built as vector frames covering the 12.8 s it shows, at 15 fps', () => {
    const m = manifest.o_qurazy_quoin_overlay;
    assert.equal(m.kind, 'svg');
    assert.equal(m.fps, 15);
    assert.equal(m.frames, 192);
    assert.equal(OVERLAYS.o_qurazy_quoin_overlay.frames, 384);
    const frames = assembleFrames(JSON.parse(readFileSync(join(overlaysDir, m.file), 'utf8')));
    assert.equal(frames.length, 192);
    // 10 s shown, 0.2 s in, 3 s out: the last frame is reached as it goes.
    assert.equal(overlayFrameAt(m, 12790, { loop: false }), 191);
  });

  it('qurazy-feature plays it where the toast was (the toast stands in without the art)', () => {
    const src = read('js/features/qurazy-feature.js');
    assert.match(src, /QURAZY_OVERLAY = Object\.freeze\(\{ key: 'o_qurazy_quoin_overlay', durationMs: 10000, x: 0\.5, topY: -0\.05, fadeOutMs: 3000 \}\)/);
    assert.match(src, /playVectorOverlay\(root, QURAZY_OVERLAY\.key/);
    assert.match(src, /if \(!ok\) engine\.toast\?\.\(QURAZY_SPAWN_LINE\)/);
  });
});

describe('fireworks frames share their outlines and ramps', () => {
  it('shareFrames keeps one copy of each outline and ramp; assembleFrames puts them back', () => {
    const stops = '<stop offset="0" stop-color="rgb(1,2,3)"/><stop offset="1" stop-color="rgb(4,5,6)"/>';
    const frame = (tx) => '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><defs>'
      + `<radialGradient id="g1" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="819.2" fx="0" fy="0" gradientTransform="matrix(0.1 0 0 0.1 ${tx}.123 2)">${stops}</radialGradient>`
      + `</defs><path fill-rule="evenodd" transform="matrix(1 0 0 1 ${tx}.1234 0)" d="M0 0L5 0L5 5Z" fill="url(#g1)"/></svg>`;
    const { defs, frames } = shareFrames([frame(1), frame(2)]);
    assert.equal((defs.match(/<path /g) || []).length, 1);
    assert.equal((defs.match(/<radialGradient /g) || []).length, 1);
    assert.match(defs, /<radialGradient id="_s0" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="819.2" fx="0" fy="0"><stop/);
    assert.match(frames[1], /<use href="#_p0" transform="matrix\(1 0 0 1 2\.1234 0\)" fill="url\(#g1\)"\/>/);
    assert.match(frames[1], /<radialGradient id="g1" gradientTransform="matrix\(0\.1 0 0 0\.1 2\.12 2\)" href="#_s0"\/>/);
    const [a] = assembleFrames({ defs, frames });
    assert.ok(a.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><defs>${defs}`));
    assert.deepEqual(assembleFrames(['<svg/>']), ['<svg/>']);
  });

  it('every built frame resolves its shared ids, at a tenth of the old size', () => {
    let bytes = 0;
    for (const key of ['fireworks_1', 'fireworks_2', 'fireworks_3']) {
      const file = join(overlaysDir, manifest[key].file);
      bytes += readFileSync(file).length;
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const ids = new Set([...data.defs.matchAll(/ id="(_[psgf]\d+)"/g)].map((m) => m[1]));
      const frames = assembleFrames(data);
      assert.equal(frames.length, manifest[key].frames, key);
      for (const f of data.frames) for (const m of f.matchAll(/(?:href="#|url\(#)(_[psgf]\d+)/g)) assert.ok(ids.has(m[1]), `${key} ${m[1]}`);
    }
    assert.ok(bytes < 1e6, `fireworks frames ${bytes} bytes`);
  });
});
