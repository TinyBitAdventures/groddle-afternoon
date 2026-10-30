/**
 * G273: the FLA reader learns strokes, bitmaps, motion guides, per-property
 * eases, tween rotation and frame scripts (stop / gotoAndPlay on labels),
 * checked against FFDec renders of rook_flock.swf and hi_overlay.swf; the
 * overlays it unblocks (poisoned, rooked, secret_location_marker,
 * focusing_orb_attack). G272: the stun orb, rainbow_winner, Giant Love,
 * proto_puff poof-ins, play_glitch and the sneeze as WebP.
 * Run: node --test tests/overlay-g273.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXml } from '../tools/avatar-compositor/xfl.mjs';
import {
  decodeDat,
  easeProp,
  frameSvg,
  loadFla,
  parseScript,
  playhead,
  rotationDelta,
  stateFrames,
  strokePaths,
  tweenInst,
} from '../tools/overlay-art/xfl-svg.mjs';
import { OVERLAYS, checkOverlays, framePlan, scrub } from '../tools/overlay-art/build.mjs';
import { POOF_IN, poofInAlpha, stateFrameAt } from '../public/js/overlay-art.js?v=g463-2';
import { orbLookFor } from '../public/js/rook-attack.js?v=g479-2';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const overlaysDir = join(pub, 'assets/sprites/overlays');
const flaDir = join(here, '../../glitch-overlays');
const haveFla = existsSync(join(flaDir, 'focusing_orb_attack.fla'));
const manifest = JSON.parse(readFileSync(join(overlaysDir, 'overlays.json'), 'utf8'));
const gsjs = (p) => readFileSync(join(here, '../../glitch-GameServerJS', p), 'utf8');
const read = (p) => readFileSync(join(pub, p), 'utf8');

/** A timeline the way loadFla reads one, from frame scripts and labels. */
function timeline(frameCount, scripts = {}, labels = {}) {
  return {
    frameCount,
    layers: [],
    scripts: new Map(Object.entries(scripts).map(([k, v]) => [Number(k), parseScript(v)])),
    labels: new Map(Object.entries(labels)),
  };
}

describe('XFL parsing', () => {
  it("reads single-quoted attributes (poisoned.fla's guides='..') and keeps CDATA frame scripts", () => {
    const doc = parseXml(`<a><DOMTimeline name="Rook" guides='&lt;guidelines&gt;'><x y="1"/></DOMTimeline><s><![CDATA[stop();]]></s></a>`);
    assert.equal(doc.children[0].attrs.guides, '<guidelines>');
    assert.equal(doc.children[0].children[0].attrs.y, '1');
    assert.equal(doc.children[1].text, 'stop();');
  });

  it('frame scripts: stop, play and gotoAndPlay / gotoAndStop by label or 1-based frame, on this clip only', () => {
    assert.deepEqual(parseScript("gotoAndPlay('orb1');"), [{ op: 'gotoAndPlay', label: 'orb1', frame: null }]);
    assert.deepEqual(parseScript('this.gotoAndStop(5); stop();'), [{ op: 'gotoAndStop', label: null, frame: 4 }, { op: 'stop', label: null, frame: null }]);
    assert.deepEqual(parseScript('include "rooked.as"; parent.stop(); mc.gotoAndPlay("x"); // stop();'), []);
  });

  it('strokes join into open runs per style', () => {
    const d = strokePaths([{ attrs: { strokeStyle: '1', edges: '!0 0|20 0!20 0[40 0 40 20!100 100|120 100' } }]);
    assert.equal(d.get(1), 'M0 0L1 0Q2 0 2 1M5 5L6 5');
  });
});

describe('playheads (frame scripts, G273)', () => {
  it('a gotoAndPlay on the last frame of a loop shows the label frame instead (AS3)', () => {
    const tl = timeline(10, { 4: "gotoAndPlay('a');", 9: 'stop();' }, { a: 0, b: 5 });
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((t) => playhead(tl, t)), [0, 1, 2, 3, 0, 1, 2]);
    // From label b it runs to the stop() and holds there.
    assert.deepEqual([0, 3, 4, 5, 20].map((t) => playhead(tl, t, 5)), [5, 8, 9, 9, 9]);
  });

  it('without scripts a clip loops as before', () => {
    assert.equal(playhead(timeline(7), 9), 2);
  });

  it('the stun orb states loop 28 frames, orbBreak plays 29 and holds; the marker loops active (89) and plays off (28)', { skip: !haveFla }, () => {
    const orb = loadFla(join(flaDir, 'focusing_orb_attack.fla'));
    for (const s of ['orb1', 'orb2', 'orb3', 'orb4']) assert.deepEqual(stateFrames(orb, 'focusingOrb', s).frames, 28, s);
    assert.deepEqual(stateFrames(orb, 'focusingOrb', 'orbBreak'), { frames: 29, loop: false, from: 116 });
    const marker = loadFla(join(flaDir, 'secret_location_marker.fla'));
    assert.deepEqual(stateFrames(marker, 'secretLocationMarker', 'active'), { frames: 89, loop: true, from: 0 });
    assert.deepEqual(stateFrames(marker, 'secretLocationMarker', 'off'), { frames: 28, loop: false, from: 90 });
  });
});

describe('tweens', () => {
  it('motionTweenRotate: auto the short way, none holds, clockwise / counter-clockwise plus whole turns', () => {
    const q = Math.PI / 2;
    assert.ok(Math.abs(rotationDelta(0, -q) + q) < 1e-9);
    assert.equal(rotationDelta(0, 1, 'none'), 0);
    assert.ok(Math.abs(rotationDelta(0, -q, 'clockwise') - 3 * q) < 1e-9);
    assert.ok(Math.abs(rotationDelta(0, 0, 'clockwise', 1) - 4 * q) < 1e-9);
    assert.ok(Math.abs(rotationDelta(0, q, 'counter-clockwise', 2) + 11 * q) < 1e-9);
  });

  it('per-property custom eases: a property without its curve tweens linearly', () => {
    const fr = { accel: -50, curves: new Map([['position', [[0, 0], [0, 1], [0, 1], [1, 1]]]]), single: false };
    assert.ok(easeProp(fr, 0.5, 'position') > 0.8);
    assert.equal(easeProp(fr, 0.5, 'scale'), 0.5);
    assert.equal(easeProp({ accel: 0, curves: null }, 0.3, 'color'), 0.3);
  });

  it('round a closed motion guide it runs against the stored edge order', () => {
    // A square drawn clockwise (y down): right edge first.
    const pts = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const cum = [0, 10, 20, 30, 40];
    const guide = { pts, cum, len: 40, closed: true };
    const e0 = { m: [1, 0, 0, 1, 10, 0], tp: [0, 0] };
    const e1 = { m: [1, 0, 0, 1, 0, 10], tp: [0, 0] };
    const mid = tweenInst({ accel: 0, curves: null, rotate: 'auto', turns: 0 }, e0, e1, 0.5, guide);
    // (10,0) to (0,10) backwards round the square passes (0,0), not (10,10).
    assert.deepEqual(mid.m.slice(4).map((v) => Math.round(v)), [0, 0]);
  });

  it("rook_flock's birds follow their guides as rook_flock.swf draws them (both legs of Fly1's loop)", { skip: !haveFla }, () => {
    const fla = loadFla(join(flaDir, 'rook_flock.fla'));
    fla.main = fla.symbols.get('Fly1');
    const ty = (n) => Number(frameSvg(fla, n, { box: [-200, -200, 400, 400] }).match(/transform="matrix\(([^)]*)\)"/)[1].split(' ')[5]);
    // Out along the top of the loop (y about -95), back along the bottom (about -76): FFDec frames 101 and 321.
    assert.ok(ty(100) < ty(320) - 12, `${ty(100)} vs ${ty(320)}`);
  });
});

describe('bitmaps', () => {
  it('decodes a lossless bin/*.dat (premultiplied ARGB in zlib chunks) to a PNG of its size', { skip: !haveFla }, async () => {
    const { readZip } = await import('../tools/avatar-compositor/xfl.mjs');
    const zip = readZip(join(flaDir, 'rook_flock.fla'));
    const px = decodeDat(zip.read('bin/M 2 1283285722.dat'));
    assert.equal(px.w, 500);
    assert.equal(px.h, 375);
    const png = Buffer.from(px.url.split(',')[1], 'base64');
    assert.equal(png.readUInt32BE(16), 500);
    assert.equal(png.readUInt32BE(20), 375);
  });

  it('a bitmap in a guide layer (a photo traced from) never reaches an overlay', { skip: !haveFla }, () => {
    const fla = loadFla(join(flaDir, 'rook_flock.fla'));
    fla.main = fla.symbols.get('bird1');
    assert.ok(!frameSvg(fla, 0).includes('<image'));
  });
});

describe('the built overlays (G272, G273)', () => {
  it('overlays.json matches the FLAs', { skip: !haveFla }, () => {
    assert.deepEqual(checkOverlays(), []);
  });

  it('play_glitch and the sneeze are WebP sheets; their PNGs are gone', () => {
    assert.equal(manifest.play_glitch.file, 'play_glitch@2x.webp');
    assert.equal(manifest.overlay_sneezing_powder.file, 'overlay_sneezing_powder.webp');
    assert.ok(!existsSync(join(overlaysDir, 'play_glitch@2x.png')));
    assert.ok(!existsSync(join(overlaysDir, 'overlay_sneezing_powder.png')));
  });

  it('the new overlays are built, with their states', () => {
    for (const key of ['poisoned', 'rooked', 'secret_location_marker', 'focusing_orb_attack', 'rainbow_winner', 'icon_giant_love', 'amorous_philtre_heart']) {
      assert.equal(manifest[key]?.kind, 'sheet', key);
      assert.ok(existsSync(join(overlaysDir, manifest[key].file)), key);
    }
    const orb = manifest.focusing_orb_attack.states;
    assert.deepEqual(Object.keys(orb), ['orb1', 'orb2', 'orb3', 'orb4', 'orbBreak']);
    assert.deepEqual(orb.orbBreak, { from: 112, frames: 29, loop: false });
    assert.equal(manifest.focusing_orb_attack.frames, 141);
    assert.deepEqual(manifest.secret_location_marker.states, { active: { from: 0, frames: 89, loop: true }, off: { from: 89, frames: 28, loop: false } });
    assert.equal(manifest.poisoned.fps, 24);
    assert.deepEqual(manifest.poisoned.stage, [150, 50]);
  });

  it('a state plays from its own frames, looping or held', () => {
    const meta = manifest.focusing_orb_attack;
    assert.equal(stateFrameAt(meta, 'orb2', 0), 28);
    assert.equal(stateFrameAt(meta, 'orb2', (28 * 1000) / 30), 28);
    assert.equal(stateFrameAt(meta, 'orbBreak', 60000), 140);
    assert.equal(stateFrameAt(meta, null, 100), 3);
  });

  it('every sheet fits a 4096 px texture across', () => {
    for (const [key, m] of Object.entries(manifest)) if (m.kind === 'sheet') assert.ok(m.cell[0] * m.cols <= 4096, key);
  });

  it('the frame plan for a stateful overlay is each state in turn', { skip: !haveFla }, () => {
    const cfg = OVERLAYS.focusing_orb_attack;
    const plan = framePlan(cfg, scrub(loadFla(join(flaDir, 'focusing_orb_attack.fla')), cfg.scrub));
    assert.equal(plan.picks.length, 141);
    assert.deepEqual(plan.picks[28], { n: 0, start: { focusingOrb: 'orb2' } });
  });
});

describe('the source lines (GSJS, client)', () => {
  it('the stun orb: pc_overlay focusing_orb_attack, delta_y -163, orb1-4 by joiners and orbBreak past 9', () => {
    const rook = gsjs('locations/inc_rook.js');
    assert.match(rook, /swf_url:overlay_key_to_url\('focusing_orb_attack'\),\s*state: orb_state,\s*delta_y: -163/);
    assert.match(rook, /n_players <= 9\) \{\s*orb_state = 'orb4'/);
    assert.equal(orbLookFor(9).state, 'orb4');
    assert.equal(orbLookFor(10).state, 'orbBreak');
  });

  it('poisoned and rooked: itemstack_overlay, delta_y 20', () => {
    assert.match(gsjs('items/include/trants.js'), /delta_y: 20,\s*swf_url: overlay_key_to_url\('poisoned'\)/);
    assert.match(gsjs('items/npc_swoonerfly.js'), /duration: 3000,\s*delta_x: 0,\s*delta_y: 20,\s*swf_url: overlay_key_to_url\('rooked'\)/);
  });

  it('rainbow_winner: the race winner gets show_rainbow (400 x 400, 4 s)', () => {
    assert.match(gsjs('locations/inc_race.js'), /winner\.show_rainbow\('rainbow_winner'\)/);
  });

  it('Giant Love: pc_overlay icon_giant_love, 300 x 300, delta_y -30, 3.25 s', () => {
    assert.match(gsjs('items/include/icon.js'), /icon_giant_love'\),\s*duration: 3250,[\s\S]{0,80}delta_y: -30,\s*width: 300/);
  });

  it('poof_in: 2 s, centred on the stack, the stack fading in after 0.2 s over 1 s', () => {
    const lis = readFileSync(join(here, '../../glitch-client/com/tinyspeck/engine/view/itemstack/LocationItemstackView.as'), 'utf8');
    assert.match(lis, /duration: 2000,[\s\S]{0,80}place_at_bottom: true/);
    assert.match(lis, /annc\.delta_y = Math\.round\(swf_h\/2 - view_holder\.height\/2\)/);
    assert.match(lis, /alpha:1, time:1, delay:\.2/);
    assert.deepEqual(POOF_IN, { key: 'proto_puff', durationMs: 2000, fadeInDelayMs: 200, fadeInMs: 1000 });
    assert.equal(poofInAlpha(100), 0);
    assert.equal(poofInAlpha(700), 0.5);
    assert.equal(poofInAlpha(5000), 1);
  });
});

describe('wiring: the stand-ins are gone', () => {
  it('the stun orb plays focusing_orb_attack and switches state as the street joins', () => {
    const f = read('js/features/rook-attack-feature.js');
    assert.match(f, /playArt\(engine, 'focusing_orb_attack'/);
    assert.match(f, /orb\.art\?\.setState\?\.\(orbLookFor\(orb\.joiners\)\.state\)/);
    // Desk ORBERA (G293): placed by ORB_ART, just above the name labels (tests/desk-decisions.test.js).
    assert.match(f, /at: \(\) => \(\{ x: p\.x, y: p\.y \+ ORB_ART\.dy \}\)/);
    assert.ok(!f.includes('orb.glow'));
  });

  it('the secret marker is the real clip, turned off on a find', () => {
    const f = read('js/features/secret-spots-feature.js');
    assert.match(f, /playSheetOverlay\(engine\.PIXI, 'secret_location_marker'/);
    assert.match(f, /marker\.art\?\.setState\('off'\)/);
    assert.ok(!f.includes('blobSprite'));
  });

  it('a poisoned tree, a fallen swoonerfly, the race winner and Giant Love use the recovered art', () => {
    assert.match(read('js/features/tree-death-feature.js'), /key: 'poisoned', dy: 20/);
    assert.ok(!read('js/features/tree-death-feature.js').includes('function skull('));
    assert.match(read('js/quest-rooms/gwendolyn.js'), /playSheetOverlay\(ctx\.PIXI, 'rooked'/);
    assert.match(read('js/race-render.js'), /key: 'rainbow_winner', wh: 400, durationMs: 4000/);
    assert.match(read('js/features/giant-icons-feature.js'), /key: 'icon_giant_love', wh: 300, dy: -30/);
  });

  it('a set-free Cubimal and the Emperor quoin poof in', () => {
    assert.match(read('js/features/cubimal-race-feature.js'), /playPoofIn\(engine\.PIXI/);
    assert.match(read('js/features/purple-journey-feature.js'), /playPoofIn\(PIXI/);
  });
});
