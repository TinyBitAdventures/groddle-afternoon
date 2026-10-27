/**
 * Recovered overlay art (G237 fireworks, G194 play_glitch), Party Time!'s
 * tick (G238) and the Wrangle / Play mood-XP sources.
 * Run: node --test tests/overlay-art.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OVERLAY_FADE,
  assembleFrames,
  cellRect,
  overlayAlpha,
  overlayFrameAt,
  overlayLifeMs,
  overlayPlacement,
  sheetCell,
} from '../public/js/overlay-art.js?v=g311-1';
import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js';
import { DRINK_TICKS, applyBuff, createBuffState, tickBuffs } from '../public/js/buffs.js?v=g366-1';
import { MOOD_XP_SOURCES } from '../public/js/mood-xp.js';
import { LONELY_RULES } from '../public/js/spirit-loneliness.js?v=lonely-1';
import { frameCount, loadFla, parseEdges } from '../tools/overlay-art/xfl-svg.mjs';
import { OVERLAYS, checkOverlays } from '../tools/overlay-art/build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const gsjs = (p) => readFileSync(join(here, '../../glitch-GameServerJS', p), 'utf8');
const overlaysDir = join(here, '../../glitch-overlays');
/** A WebP's canvas size (VP8X, VP8L or VP8). */
function webpSize(b) {
  assert.equal(b.toString('latin1', 0, 4), 'RIFF');
  assert.equal(b.toString('latin1', 8, 12), 'WEBP');
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}
const manifest = JSON.parse(readFileSync(join(pub, 'assets/sprites/overlays/overlays.json'), 'utf8'));

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(pub, 'assets/content'));
});

describe('XFL reading', () => {
  it('edge numbers: decimal and #hex.frac twips, negatives as 24-bit two\'s complement', () => {
    assert.deepEqual(parseEdges('!0 -14S1|-11 -53'), [[0, -0.7, -0.55, -2.65]]);
    const [[x0, , cx, , x1]] = parseEdges('!0 0[#5F5.80 0 #FFFFDC.00 0');
    assert.equal(x0, 0);
    assert.equal(cx, 1525.5 / 20);
    assert.equal(x1, -36 / 20);
  });

  it('play_glitch plays its 744-frame clip from a one-frame main timeline', { skip: !existsSync(overlaysDir) }, () => {
    const fla = loadFla(join(overlaysDir, 'play_glitch.fla'));
    assert.equal(fla.main.frameCount, 1);
    assert.equal(frameCount(fla), 744);
    assert.deepEqual([fla.doc.width, fla.doc.height, fla.doc.frameRate], [110, 80, 30]);
    assert.equal(frameCount(loadFla(join(overlaysDir, 'fireworks_1.fla'))), 28);
  });

  it('overlays.json matches the FLAs and every art file is there', { skip: !existsSync(overlaysDir) }, () => {
    assert.deepEqual(checkOverlays(), []);
  });
});

describe('the built overlays', () => {
  it('lists the three fireworks as vector frames and play_glitch as a 2x sheet', () => {
    for (const key of ['fireworks_1', 'fireworks_2', 'fireworks_3']) {
      const m = manifest[key];
      assert.equal(m.kind, 'svg', key);
      assert.equal(m.fps, 30);
      const frames = assembleFrames(JSON.parse(readFileSync(join(pub, 'assets/sprites/overlays', m.file), 'utf8')));
      assert.equal(frames.length, m.frames, key);
      assert.ok(frames.every((s) => s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')), key);
    }
    const play = manifest.play_glitch;
    assert.equal(play.kind, 'sheet');
    assert.equal(play.file, 'play_glitch@2x.webp');
    assert.equal(play.frames, 372);
    assert.equal(play.order.length, 372);
    // The WebP holds every cell the order names (G272: a WebP now, not a 1.37 MB PNG).
    const [w, h] = webpSize(readFileSync(join(pub, 'assets/sprites/overlays', play.file)));
    assert.equal(w, play.cell[0] * play.cols);
    assert.ok(h >= play.cell[1] * Math.ceil((Math.max(...play.order) + 1) / play.cols));
    assert.deepEqual(OVERLAYS.play_glitch.scrub.map((r) => r.layer), ['Layer 21', 'Layer 4']);
  });

  it('every fireworks key the party uses has art', () => {
    for (const fw of LONELY_RULES.fireworks) assert.ok(manifest[fw.key], fw.key);
  });
});

describe('overlay timing and placement (Announcement.as, ArbitrarySWFView)', () => {
  it('fades in 0.2 s, out 0.4 s from duration minus the fade in', () => {
    assert.deepEqual(OVERLAY_FADE, { inMs: 200, outMs: 400 });
    assert.equal(overlayAlpha(0, 2000), 0);
    assert.equal(overlayAlpha(100, 2000), 0.5);
    assert.equal(overlayAlpha(1000, 2000), 1);
    assert.equal(overlayAlpha(2000, 2000), 0.5);
    assert.equal(overlayAlpha(2200, 2000), 0);
    assert.equal(overlayLifeMs(2000), 2200);
    // Short overlays cap each fade at a third of the duration.
    assert.equal(overlayLifeMs(300), 300);
  });

  it('a vp_overlay SWF loops its timeline; play_glitch holds its last frame', () => {
    const fw = manifest.fireworks_1;
    assert.equal(overlayFrameAt(fw, 0), 0);
    assert.equal(overlayFrameAt(fw, 1000), 30 % 28);
    assert.equal(overlayFrameAt(manifest.play_glitch, 60000, { loop: false }), 371);
    assert.equal(overlayFrameAt(manifest.play_glitch, 1000, { loop: false }), 15);
  });

  it('centres the stage on the overlay point at 1:1 (scaled by the viewport)', () => {
    const meta = { stage: [100, 80], box: [10, 20, 50, 40] };
    assert.deepEqual(overlayPlacement(meta, 500, 300, 1), { left: 460, top: 280, width: 50, height: 40 });
    assert.deepEqual(overlayPlacement(meta, 500, 300, 2), { left: 420, top: 260, width: 100, height: 80 });
  });

  it('sheet cells are in logical px of the @2x sheet', () => {
    const meta = { cell: [220, 168], scale: 2, cols: 18, order: [0, 0, 19] };
    assert.deepEqual(cellRect(meta, 19), { x: 110, y: 84, w: 110, h: 84 });
    assert.deepEqual(sheetCell(meta, 1), { x: 0, y: 0, w: 110, h: 84 });
    assert.deepEqual(sheetCell(meta, 2), cellRect(meta, 19));
  });
});

describe('Party Time! (catalog_buffs.js 1564-1580)', () => {
  it('the source ticks metabolics_add_mood(5) every 10 s for 60 s', () => {
    const src = gsjs('items/catalog_buffs.js');
    const block = src.slice(src.indexOf('"party_time"'), src.indexOf('"piggy_capture_cooldown"'));
    assert.match(block, /duration\s*: 60,/);
    assert.match(block, /tick_duration\s*: 10,/);
    assert.match(block, /on_tick\s*: function\(pc, args\)\{\s*pc\.metabolics_add_mood\(5\);/);
    assert.deepEqual(DRINK_TICKS.party_time, { mood: 5 });
  });

  it('adds 5 mood on each tick while it lasts', () => {
    const state = createBuffState();
    const pc = { energy: 50, mood: 40, energyMax: 100, moodMax: 100, imagination: 0, xp: 0 };
    const t0 = 1_000_000;
    assert.equal(applyBuff(state, 'party_time', pc, t0).ok, true);
    tickBuffs(state, pc, t0 + 9_999);
    assert.equal(pc.mood, 40);
    tickBuffs(state, pc, t0 + 10_000);
    assert.equal(pc.mood, 45);
    tickBuffs(state, pc, t0 + 30_000);
    assert.equal(pc.mood, 55);
    tickBuffs(state, pc, t0 + 120_000);
    assert.ok(pc.mood <= 70, `at most six ticks, got ${pc.mood}`);
    assert.equal(state.active.party_time, undefined);
  });
});

describe('mood-XP sources for the SWFs, the Game and the loneliness rewards', () => {
  it('Wrangle and Play scale with mood (stats_add_xp(..., false))', () => {
    for (const f of ['items/swf_1.js', 'items/swf_2.js', 'items/swf_3.js']) assert.match(gsjs(f), /stats_add_xp\(25 \* msg\.count, false, context\)/, f);
    assert.match(gsjs('items/game_box.js'), /stats_add_xp\(250, false, context\)/);
    assert.match(gsjs('items/include/loneliness.js'), /stats_add_xp\(200\);/);
    for (const k of ['swf_wrangle', 'game_play', 'loneliness']) assert.ok(MOOD_XP_SOURCES.scaled[k], k);
  });
});

describe('wiring', () => {
  it('the party plays the recovered fireworks and Play shows play_glitch', () => {
    const lonely = readFileSync(join(pub, 'js/features/spirit-loneliness-feature.js'), 'utf8');
    // G250 (desk FIREWORKS): 1:1, under the bubbles and prompts (the bottom of the fx layer).
    assert.match(lonely, /fireworksUnder\(engine, at, vp, LONELY_RULES\.fireworkMs\)/);
    assert.match(lonely, /layer\.addChildAt\(sprite, 0\)/);
    const swf = readFileSync(join(pub, 'js/features/swf-feature.js'), 'utf8');
    assert.match(swf, /PLAY_OVERLAY = Object\.freeze\(\{ key: 'play_glitch', dy: -140 \}\)/);
    assert.match(swf, /overlayFrameAt\(playArt, ms, \{ loop: false \}\)/);
  });
});
