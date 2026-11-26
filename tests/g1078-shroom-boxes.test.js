/**
 * #572 (G1078): Pholiota Squarros' only gap down drops onto a red wall mushroom, and its bounce box
 * (inferred: the original Collision-triggered Event Boxes' sizes were not archived) was the whole
 * picture, 246 x 185, most of it the art's empty top and the stem under the cap. A fall beside the
 * cap was thrown back up as surely as one onto it. The bounce is the cap's: every one of the 345
 * shrooms on the 40 bounce streets has its cap drawn as a floor run, and its box is now that run
 * and a little over it (location-events.js inferEventBoxes, shroomCapBox).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SHROOM_CAP_ART, inEventBox, shroomCapBox } from '../public/js/location-events.js?v=48938c8f';
import { NORMAL_BUFF, avatarGround, coastX, stepAvatar } from '../public/js/avatar-step.js?v=8415ee96';
import { platformsScreen } from '../public/js/street-model.js?v=a9a05f9d';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const PHOLIOTA = 'GIFG0VETDF43E95';

/** Each bounce street's shrooms (screen px, as inferEventBoxes reads them) beside its boxes. */
function shroomRows() {
  const rows = [];
  for (const file of readdirSync(streetsDir).filter((f) => /^GIF[A-Z0-9]+\.json$/.test(f))) {
    const s = JSON.parse(readFileSync(join(streetsDir, file), 'utf8'));
    const boxes = (s.eventBoxes || []).filter((b) => b.source === 'wall-shroom');
    if (!boxes.length) continue;
    const mg = s.layers.find((l) => l.id === 'middleground');
    const shrooms = [];
    for (const layer of s.layers) {
      const isMg = layer === mg;
      const rx = !isMg && mg?.w && layer.w ? mg.w / layer.w : 1;
      const ry = !isMg && mg?.h && layer.h ? mg.h / layer.h : 1;
      for (const d of layer.decos || []) {
        if (d.sprite !== 'tree_int_wall_sroom_1') continue;
        shrooms.push({ x: Math.round(isMg ? d.x - s.bounds.l : d.x * rx), y: Math.round(isMg ? d.y - s.bounds.t : d.y * ry), w: Math.round(d.w * rx), h: Math.round(d.h * ry) });
      }
    }
    boxes.forEach((box, i) => rows.push({ tsid: s.tsid, box, shroom: shrooms[i], platforms: platformsScreen(s) }));
  }
  return rows;
}

/** A body falling from (x, y) at vx px a frame, no key held; the box it enters, else where it lands. */
function fall(s, boxes, x, y, vx) {
  const platforms = platformsScreen(s);
  const body = { x, y, vx, vy: 0, onGround: false };
  for (let f = 0; f < 240; f += 1) {
    body.vx = coastX(body.vx, body.onGround, NORMAL_BUFF);
    stepAvatar(body, { platforms, worldW: s.bounds.r - s.bounds.l, ground: (px, py, vy) => avatarGround(platforms, px, py, vy) });
    const box = boxes.find((b) => inEventBox(b, body.x, body.y));
    if (box) return box.id;
    if (body.onGround) return Math.round(body.y);
  }
  return Math.round(body.y);
}

describe('#572 wall shrooms bounce from their caps, not their whole picture', () => {
  const rows = shroomRows();

  it('every one of the 345 boxes is its cap: inside the picture, a fifth of its area, feet on the cap inside', () => {
    assert.equal(rows.length, 345);
    assert.equal(new Set(rows.map((r) => r.tsid)).size, 40);
    let area = 0;
    for (const { tsid, box, shroom } of rows) {
      const tag = `${tsid} ${box.id}`;
      assert.ok(box.x - box.w / 2 >= shroom.x - shroom.w / 2 - 1 && box.x + box.w / 2 <= shroom.x + shroom.w / 2 + 1, tag);
      // Over the stem (the art's red cap is rows 64 to 170 of 282) and inside the picture.
      assert.ok(box.y < shroom.y - shroom.h * 0.3 && box.y - box.h >= shroom.y - shroom.h - 1, tag);
      assert.ok(inEventBox(box, box.x, box.y - 2), `${tag}: feet on the cap bounce`);
      area += (box.w * box.h) / (shroom.w * shroom.h);
    }
    // Before: every box was the whole picture (1.0).
    assert.ok(area / rows.length < 0.3, `mean share ${area / rows.length}`);
  });

  it('a shroom with no floor run under its middle keeps the art cap', () => {
    const box = shroomCapBox({ x: 500, y: 1000, w: 246, h: 185 }, []);
    assert.equal(box.w, Math.round(246 * SHROOM_CAP_ART.half * 2));
    assert.equal(box.y, Math.round(1000 - 185 * SHROOM_CAP_ART.foot));
  });

  it("Pholiota Squarros: the gap's shroom bounces from its cap (1391 to 1593), a fall beside it goes down", () => {
    const s = street(PHOLIOTA);
    const cap = s.eventBoxes[3];
    assert.deepEqual([cap.x - cap.w / 2, cap.x + cap.w / 2, cap.y], [1391, 1593, 1765]);
    const old = s.eventBoxes.map((b, i) => (i === 3 ? { ...b, x: 1493, y: 1867, w: 246, h: 185 } : b));
    // A slow step off the gap's right ledge (1617) falls past the cap to the floor below; the whole
    // picture threw it back up.
    assert.equal(fall(s, s.eventBoxes, 1608, 1490, -0.8), 2300);
    assert.equal(fall(s, old, 1608, 1490, -0.8), 'bounce_4');
    // Off the left ledge (1346) to the lower floor, as before.
    assert.equal(fall(s, s.eventBoxes, 1355, 1528, 0.8), 1894);
    // Landing on the cap still bounces: it is the mushroom's trampoline (LIFG0VETDF43E95.xml bounce).
    assert.equal(fall(s, s.eventBoxes, 1355, 1528, 3), 'bounce_4');
  });
});
