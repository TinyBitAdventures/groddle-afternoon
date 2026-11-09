/**
 * The sharpness sweep (lane sharp, 2026-11-08): the original-size sheets the game draws in Pixi that
 * had no 3x render. Sheets with a CC0 SWF are rendered by tools/vector-sprites (sharp-sweep.json),
 * frame for frame and placed like the x1 OGA sheets; copies whose pixels equal a sheet or pack icon
 * that already has a 3x now load that one instead, so js/sprite-hires.js or js/icon-hires.js serves
 * the 3x file. Sheets that failed keep their x1 file with the reason in results.json.
 * Run: node --test tests/sharp-sweep.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const vs = join(root, 'tools/vector-sprites');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const MANIFESTS = ['sharp-sweep.json', 'sharp-sweep-lossy.json'];
const manifests = MANIFESTS.map((m) => JSON.parse(readFileSync(join(vs, m), 'utf8')));
const results = JSON.parse(readFileSync(join(vs, 'results.json'), 'utf8'));
const sheets = manifests.flatMap((manifest) => manifest.jobs.flatMap((job) => job.sheets.map((sheet) => ({ manifest, job, sheet }))));

/** Lossless WebP (VP8L) or extended (VP8X) canvas size. */
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.subarray(8, 12).toString(), 'WEBP');
  const chunk = b.subarray(12, 16).toString();
  if (chunk === 'VP8L') {
    return {
      width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
      height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
    };
  }
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  assert.equal(chunk, 'VP8X');
  return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
}

describe('sharpness sweep', () => {
  it('build.mjs --check passes for both manifests (every sheet has a result, files 3x, module current)', () => {
    for (const m of MANIFESTS) {
      const out = execFileSync(process.execPath, [join(vs, 'build.mjs'), '--manifest', join(vs, m), '--check'], { encoding: 'utf8' });
      assert.doesNotMatch(out, /FAIL|missing|differs/i, m);
    }
  });

  it('every sheet renders from a CC0 SWF in glitch-items or glitch-overlays, swapped on first draw', () => {
    for (const m of manifests) assert.equal(m.firstDraw, true);
    // Sheets whose 1x file is lossy WebP get lossy 3x twins (q88, lossless alpha); the rest stay lossless.
    assert.equal(manifests[1].lossy, 88);
    assert.equal(manifests[0].lossy, undefined);
    for (const { job } of sheets) {
      assert.ok(!job.swf.startsWith('/'), `${job.name}: no absolute paths`);
      assert.ok(!job.swf.startsWith('..') || job.swf.startsWith('../glitch-overlays/'), job.name);
    }
  });

  it('passing sheets are scored, keep their frames and placement, and ship at 3x', () => {
    const ok = sheets.filter(({ sheet }) => results[sheet.path]?.status === 'ok');
    assert.ok(ok.length >= 40, `${ok.length} sheets sharp`);
    const module = read('js/sprite-hires.js');
    for (const { sheet } of ok) {
      const r = results[sheet.path];
      assert.ok(r.score >= 0.88 && r.minFrame >= 0.8, `${sheet.path} ${r.score}/${r.minFrame}`);
      assert.deepEqual(r.drift, [], sheet.path);
      assert.equal(r.cells, sheet.frames, sheet.path);
      assert.ok(module.includes(`"${sheet.path}"`), `${sheet.path} routed`);
      if (r.parts) {
        for (const p of r.parts) assert.ok(existsSync(join(pub, p.hires)), `${sheet.path} part ${p.hires}`);
        continue;
      }
      const one = webpSize(join(pub, sheet.path));
      const three = webpSize(join(pub, r.hires));
      assert.deepEqual(three, { width: one.width * 3, height: one.height * 3 }, sheet.path);
    }
  });

  it('the most visible world sheets are sharp: the party teleporter, the side-on Rook, the Ball, the fox brush, placed Giant icons', () => {
    for (const p of [
      'assets/sprites/parties/teleporter_visible_portal.webp',
      'assets/sprites/parties/teleporter_visible_disappear.webp',
      'assets/sprites/rooks/rook-side.webp',
      'assets/sprites/small-items/ball.webp',
      'assets/sprites/foxes/brush-hit.webp',
      'assets/sprites/giant-icons/icon_alph.webp',
      'assets/sprites/giant-icons/icon_zille.webp',
    ]) assert.equal(results[p]?.status, 'ok', p);
    // The teleporter is teleporter_visible.swf, not teleporter_ground.swf (sweep.json scored that 0.35).
    assert.match(results['assets/sprites/parties/teleporter_visible_portal.webp'].swf, /teleporter_visible\.swf$/);
  });

  it('copies of sharp sheets load the sharp one', () => {
    const races = read('js/features/races-feature.js');
    assert.match(races, /const TICKET_ICON_DIR = 'assets\/sprites\/icons\/'/);
    assert.doesNotMatch(races, /\$\{RACE_ICON_DIR\}\$\{race\.ticket\}/);
    assert.match(races, /\$\{TICKET_ICON_DIR\}\$\{race\.ticket\}\.webp/);
    const game = read('game.js');
    for (const id of ['hogtied_piggy_explorer', 'card_carrying_qualification', 'your_papers', 'race_ticket_hogtie_piggy', 'pig_bait']) {
      assert.match(game, new RegExp(`assets/sprites/icons/${id}\\.webp`), id);
    }
    assert.match(read('js/features/hog-haul-mp-feature.js'), /BAIT_ICON = 'assets\/sprites\/icons\/pig_bait\.webp'/);
    assert.match(read('js/quest-rooms/clubhouse.js'), /kit\.deco\(PIXI, 'furniture_fireplace', [^)]*dir: 'assets\/sprites\/furniture\/'/);
    assert.match(read('js/quest-rooms/puzzle-kit.js'), /textureFromUrl\('assets\/sprites\/puzzles\/light_beam\.webp'\)/);
    const icons = read('js/icon-hires.js');
    for (const id of ['race_ticket', 'race_ticket_space_race', 'race_ticket_it_game', 'race_ticket_hogtie_piggy', 'pig_bait', 'hogtied_piggy_explorer', 'card_carrying_qualification', 'your_papers']) {
      assert.ok(icons.includes(`"${id}"`), `${id} has a 3x icon`);
      assert.ok(existsSync(join(pub, `assets/sprites/icons/${id}.webp`)), id);
    }
    const hires = read('js/sprite-hires.js');
    for (const p of ['assets/sprites/furniture/furniture_fireplace.webp', 'assets/sprites/puzzles/light_beam.webp']) {
      assert.ok(hires.includes(`"${p}"`), p);
    }
  });
});
