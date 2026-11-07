/**
 * G372: a Dust Trap shows each remnant's own overlay (dust_trap.js organelleOverlay 214-233,
 * inc_data_overlays.js 67-70) for its 3 s, then sends it to the buffs and bursts the seconds
 * (AbstractAnnouncementOverlay.as 582-608).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUST_TRAP_ORGANELLES, ORGANELLE_OVERLAY, organelleFlight } from '../public/js/resource-nodes.js?v=76736039';
import { OVERLAY_USES } from '../public/js/overlays.js?v=e5f37a8d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');
const CLIENT = join(root, '../glitch-client');
const manifest = JSON.parse(readFileSync(join(root, 'public/assets/sprites/overlays/overlays-more.json'), 'utf8'));

describe('Dust Trap remnant pictures', () => {
  it('every remnant the trap rolls has a sheet and a use at the source numbers', () => {
    assert.equal(DUST_TRAP_ORGANELLES.length, 4);
    for (const { id } of DUST_TRAP_ORGANELLES) {
      assert.ok(manifest[id], id);
      assert.ok(existsSync(join(root, 'public/assets/sprites/overlays', manifest[id].file)), id);
      assert.deepEqual(
        [OVERLAY_USES[id].type, OVERLAY_USES[id].wh, OVERLAY_USES[id].durationMs, OVERLAY_USES[id].dx, OVERLAY_USES[id].dy],
        ['itemstack', 0, ORGANELLE_OVERLAY.durationMs, 0, ORGANELLE_OVERLAY.deltaY],
        id,
      );
    }
  });

  it('matches the source overlay', { skip: !existsSync(GS) }, () => {
    const src = readFileSync(join(GS, 'items/dust_trap.js'), 'utf8');
    const at = src.indexOf('function organelleOverlay');
    const fn = src.slice(at, at + 700);
    assert.match(fn, /duration: 3000/);
    assert.match(fn, /delta_y:-153/);
    assert.match(fn, /place_at_bottom: true/);
    assert.match(fn, /animate_to_buffs: true/);
    assert.match(fn, /and_burst_text:\(time==1\)\?'second':'seconds'/);
    const keys = readFileSync(join(GS, 'inc_data_overlays.js'), 'utf8');
    for (const { id } of DUST_TRAP_ORGANELLES) assert.match(keys, new RegExp(`'${id}' : 'http`), id);
  });

  it('the flight follows the client: held, then 1 s to the buffs, down to 0.2', { skip: !existsSync(CLIENT) }, () => {
    const as = readFileSync(join(CLIENT, 'com/tinyspeck/engine/view/gameoverlay/AbstractAnnouncementOverlay.as'), 'utf8');
    assert.match(as, /animateToBuffs\(\(_annc\.duration\/1000\)-\(fade_in_sec\*2\)\)/);
    assert.match(as, /final_scale:Number = \.2/);
    assert.match(as, /scaleX:final_scale, x:dest_pt\.x, y:dest_pt\.y, time:1,/);
    assert.equal(ORGANELLE_OVERLAY.holdMs, ORGANELLE_OVERLAY.durationMs - 2 * 200);
    const from = { x: 100, y: 500 };
    const to = { x: 1100, y: 100 };
    assert.deepEqual(organelleFlight(0, from, to), { x: 100, y: 500, scale: 1 });
    assert.deepEqual(organelleFlight(2600, from, to), { x: 100, y: 500, scale: 1 });
    const mid = organelleFlight(3100, from, to);
    assert.deepEqual([mid.x, mid.y, Math.round(mid.scale * 10) / 10], [600, 300, 0.6]);
    const end = organelleFlight(9000, from, to);
    assert.deepEqual([end.x, end.y, Math.round(end.scale * 10) / 10], [1100, 100, 0.2]);
  });

  it('the trap plays the remnant it rolled, and no longer draws an item icon', () => {
    const feature = readFileSync(join(root, 'public/js/features/resource-nodes-feature.js'), 'utf8');
    assert.match(feature, /organelleOverlay\(engine, entity, result\.organelle, result\.baqalaSeconds\)/);
    assert.match(feature, /playOverlay\(engine\.PIXI, organelle, \{/);
    assert.equal(ORGANELLE_OVERLAY.art, undefined);
  });
});
