/**
 * G379: Sparkle Powder's window overlay (sparkle_powder.js 330-337): overlay_sparkle_powder at 150%
 * for 6 s, 3 s late, for everyone on the street.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERLAY_USES, windowOverlayFit, windowPlacement } from '../public/js/overlays.js?v=ed371926';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');
const CLIENT = join(root, '../glitch-client');
const dir = join(root, 'public/assets/sprites/overlays');
const row = JSON.parse(readFileSync(join(dir, 'overlays-more.json'), 'utf8')).overlay_sparkle_powder;

describe('the Sparkle Powder window overlay', () => {
  it('the sheet and SVG frames come from the CC0 FLA', () => {
    assert.equal(row.src, 'glitch-overlays/overlay_sparkle_powder.fla');
    assert.ok(existsSync(join(dir, row.file)));
    assert.ok(existsSync(join(dir, row.vector.file)));
    assert.deepEqual(row.stage, [1000, 700]);
  });

  it('matches the source announcement', { skip: !existsSync(GS) }, () => {
    const src = readFileSync(join(GS, 'items/sparkle_powder.js'), 'utf8');
    assert.match(src, /pc\.location\.apiSendAnnouncement\(\{\s*type: 'window_overlay',\s*swf_url: overlay_key_to_url\('overlay_sparkle_powder'\),\s*duration: 6000,\s*delay_ms: 3000,\s*size: "150%"/);
    const u = OVERLAY_USES.overlay_sparkle_powder;
    assert.deepEqual([u.size, u.durationMs, u.delayMs], [1.5, 6000, 3000]);
  });

  it('150% is of the shorter side of the window, centred', { skip: !existsSync(CLIENT) }, () => {
    const as = readFileSync(join(CLIENT, 'com/tinyspeck/engine/view/gameoverlay/InWindowAnnouncementOverlay.as'), 'utf8');
    assert.match(as, /art_view_wh = Math\.min\(StageBeacon\.stage\.stageHeight, StageBeacon\.stage\.stageWidth\)\*perc;/);
    const fit = windowOverlayFit(1280, 720, 1.5);
    assert.equal(fit.wh, 1080);
    const at = windowPlacement(row, fit.rect, { wh: fit.wh });
    assert.equal(at.scale, 1080 / 1000);
    // The stage is centred on the window; the art's box sits inside it.
    assert.equal(at.left, 640 - 540 + row.box[0] * at.scale);
  });

  it('the sprinkler and everyone who catches it see it', () => {
    const f = readFileSync(join(root, 'public/js/features/powders-feature.js'), 'utf8');
    assert.match(f, /say\(engine, POWDER_TEXT\.sparkle\);\s*sparkleWindow\(engine\);/);
    assert.match(f, /say\(engine, powderCaughtLine\(cls, name, granted\)\);\s*sparkleWindow\(engine\);/);
    assert.match(f, /later\(use\.delayMs, \(\) => \{/);
  });
});
