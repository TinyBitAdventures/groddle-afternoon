/**
 * #658: the Firebog street spirits (the bog vendors, Shimla Mirch and the other Firebog hubs)
 * stood still. Their idle strips came from Tiny Speck's OGA sheets, whose recorder advanced only
 * the body (animated_mcs = ['corpus'], street_spirit_firebog.as) and left the flames and hanging
 * vines on frame 1, so all 24 cells were one picture. 2011-12 footage of a Firebog street
 * (reference-videos Eu6dojeQttM at 2:30) shows the flames flicker and the vines sway: the game drew
 * that spirit live. Its clips are now the loops swf-record.mjs bakes with every nested clip on its
 * own clock, their 1x strips drawn from the render too (build.mjs render1x): the idle 105 frames
 * (every third kept), the talk its 62, the cry 96 (four rounds of its tears, every second kept).
 * Run: node --test tests/firebog-idle-658.test.js   (pixel checks need dwebp)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { STREET_SPIRIT_ART, STREET_SPIRIT_LONELY_ART, spiritCrySheet, spiritSheet } from '../public/js/street-spirits.js?v=8ff6ed59';

const PUB = new URL('../public/', import.meta.url);
let dwebp = true;
try { execFileSync('dwebp', ['-version'], { stdio: 'ignore' }); } catch { dwebp = false; }

/** RGBA pixels of a WebP (dwebp -pam). */
function pixels(path) {
  const b = execFileSync('dwebp', ['-quiet', '-pam', new URL(path, PUB).pathname, '-o', '-'], { maxBuffer: 1 << 28 });
  const head = b.toString('latin1', 0, 128);
  const w = Number(/WIDTH (\d+)/.exec(head)[1]);
  const h = Number(/HEIGHT (\d+)/.exec(head)[1]);
  const at = head.indexOf('ENDHDR\n') + 7;
  return { w, h, d: b.subarray(at) };
}

/** Share of a cell's pixels (from row y0 x fh down) that differ between cells a and b by more than 32 of 255 in any channel (premultiplied: above lossy WebP noise; a still recorder cell differs by none). */
function change(img, fw, fh, cols, a, b, y0 = 0) {
  let n = 0;
  const ax = (a % cols) * fw, ay = Math.floor(a / cols) * fh;
  const bx = (b % cols) * fw, by = Math.floor(b / cols) * fh;
  let all = 0;
  for (let y = Math.floor(y0 * fh); y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      all += 1;
      const p = ((ay + y) * img.w + ax + x) * 4;
      const q = ((by + y) * img.w + bx + x) * 4;
      // Premultiplied: the colour under a clear pixel is anything at all in a lossy WebP.
      const ap = img.d[p + 3];
      const aq = img.d[q + 3];
      let off = Math.abs(ap - aq) > 32;
      for (let c = 0; c < 3 && !off; c++) off = Math.abs((img.d[p + c] * ap - img.d[q + c] * aq) / 255) > 32;
      if (off) n += 1;
    }
  }
  return n / all;
}

const MOVES = 0.001;
/** The hanging vines: the lower 45% of a cell, below the bulb (frozen in every recorder cell). */
const VINES = 0.55;
const CLIPS = {
  idle: { def: (look) => spiritSheet('firebog', look, 'idle'), live: 'idle_live', label: 'idle_move', frames: 105, cells: 35, fps: 10, seam: true },
  talk: { def: (look) => spiritSheet('firebog', look, 'talk'), live: 'talk_live', label: 'talk', frames: 62, cells: 62, fps: 30, seam: false },
  cry: { def: (look) => spiritCrySheet('firebog', look), live: 'cry_live', label: 'idle_cry', frames: 96, cells: 48, fps: 15, seam: true },
};
const BOX = { large: { idle: [94, 244], talk: [94, 244], cry: [107, 244] }, medium: { idle: [63, 189], talk: [63, 189], cry: [63, 189] } };

describe('#658 Firebog street spirits: flames and vines move in idle, talk and cry', () => {
  it('each clip is a live loop (failed on main)', () => {
    assert.equal(STREET_SPIRIT_ART.firebog.states.idle.live, 'idle_live');
    assert.equal(STREET_SPIRIT_ART.firebog.states.talk.live, 'talk_live');
    assert.equal(STREET_SPIRIT_LONELY_ART.firebog.cry.live, 'cry_live');
    for (const look of ['large', 'medium']) {
      for (const [clip, c] of Object.entries(CLIPS)) {
        const s = c.def(look);
        assert.equal(s.frames, c.cells, `${look} ${clip}`);
        assert.equal(s.fps, c.fps, `${look} ${clip}`);
      }
    }
    const manifest = JSON.parse(readFileSync(new URL('../tools/vector-sprites/street-spirits.json', import.meta.url), 'utf8'));
    for (const name of ['street-spirit-firebog-large', 'street-spirit-firebog-medium']) {
      const job = manifest.jobs.find((j) => j.name === name);
      assert.deepEqual(job.record.live, Object.values(CLIPS).map((c) => ({ label: c.label, as: c.live, frames: c.frames })));
      for (const c of Object.values(CLIPS)) assert.equal(job.sheets.find((s) => s.label === c.live)?.render1x, true, `${name} ${c.live}`);
    }
  });

  for (const look of ['large', 'medium']) {
    for (const [clip, c] of Object.entries(CLIPS)) {
      for (const density of [1, 3]) {
        const path = `assets/sprites/street-spirits/firebog_${look}_${clip}${density === 3 ? '@3x' : ''}.webp`;
        it(`${path}: the vines move${c.seam ? ', and the loop comes round smoothly' : ''}`, { skip: !dwebp && 'needs dwebp' }, () => {
          const img = pixels(path);
          const [fw, fh] = BOX[look][clip];
          const W = fw * density;
          const H = fh * density;
          const n = c.def(look).frames;
          const steps = [];
          let most = 0;
          for (let k = 1; k < n; k++) {
            most = Math.max(most, change(img, W, H, 8, 0, k, VINES));
            steps.push(change(img, W, H, 8, k - 1, k));
          }
          assert.ok(most > MOVES, `the vines are still in every cell (most change ${(most * 100).toFixed(2)}%)`);
          // The talk keeps its 62 frames for the mouth: the vines' 100-frame sway jumps back once a loop.
          if (!c.seam) return;
          const seam = change(img, W, H, 8, n - 1, 0);
          assert.ok(seam <= Math.max(...steps) * 1.5, `the loop jumps at its seam: ${(seam * 100).toFixed(2)}% against at most ${(Math.max(...steps) * 100).toFixed(2)}% between cells`);
        });
      }
    }
  }

  it('G1264: the loneliness porthole is live too (its face follows the porthole labels, failed on main)', () => {
    const portrait = STREET_SPIRIT_LONELY_ART.firebog.portrait;
    assert.deepEqual(['in', 'loop', 'out'].map((s) => [portrait[s].live, portrait[s].tick0]), [['lonely_in_live', 0], ['lonely_loop_live', 19], ['lonely_out_live', 94]], 'the loop follows the 19-frame in, the out the 75-frame loop');
    const manifest = JSON.parse(readFileSync(new URL('../tools/vector-sprites/spirit-portraits.json', import.meta.url), 'utf8'));
    const job = manifest.jobs.find((j) => j.name === 'spirit-portrait-firebog-large');
    assert.deepEqual(job.record.clips, ['large', 155], 'the face clip (sprite 155) is synced to the porthole labels');
    assert.deepEqual(job.record.live, [
      { label: 'loneliness_in', as: 'lonely_in_live', frames: 19 },
      { label: 'loneliness', as: 'lonely_loop_live', frames: 75, tick0: 19 },
      { label: 'loneliness_out', as: 'lonely_out_live', frames: 13, tick0: 94 },
    ]);
    for (const sheet of job.sheets) assert.equal(sheet.render1x, true, sheet.path);
  });

  it('G1264: firebog_large_lonely_loop.webp moves (it was 75 copies of one picture)', { skip: !dwebp && 'needs dwebp' }, () => {
    const img = pixels('assets/sprites/street-spirits/firebog_large_lonely_loop.webp');
    let most = 0;
    for (let k = 1; k < 75; k++) most = Math.max(most, change(img, 166, 166, 8, 0, k));
    assert.ok(most > 0.01, `the porthole loop is still (most change ${(most * 100).toFixed(2)}%)`);
  });

  it('the other Street Spirits have no clip the recorder froze (nothing live there)', () => {
    for (const [variant, art] of Object.entries(STREET_SPIRIT_ART)) {
      if (variant === 'firebog') continue;
      for (const sheet of Object.values(art.states)) assert.equal(sheet.live, undefined, variant);
      assert.equal(STREET_SPIRIT_LONELY_ART[variant]?.cry?.live, undefined, variant);
      for (const p of Object.values(STREET_SPIRIT_LONELY_ART[variant]?.portrait || {})) assert.equal(p.live, undefined, `${variant} porthole`);
    }
  });
});
