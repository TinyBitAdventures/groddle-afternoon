/**
 * #583 (phone): street project work's tool bubble (a) sat on the avatar's face, not over the
 * head, and (b) with the Grinder showed a blank bubble.
 * (a) Glitch hung a bubbled pc_overlay above its point: InLocationAnnouncementOverlay.as
 *     placeByPcView 128 puts it at pc.y + delta_y and 309-331 draw the bubble from -bubble_h down,
 *     so its tail ends at the point, delta_y -110 over the feet (items/include/jobs.js 293-305). The
 *     remake centred its balloon on that point. Now the tail ends there (jobWorkBubbleY), and other
 *     players' bubbles (a project's crew, a shared garden's tenders) sit over their name plates.
 * (b) The Grinders' work sheets are one row of 83 frames (83 is prime, the Make panel steps whole
 *     rows): 12450 px wide at 3x, past what many phone GPUs take (4096 or 8192), so the texture never
 *     uploaded. The Blender (7076 px) and the Construction Tool (13983 px) are the same. An image
 *     longer than the renderer's MAX_TEXTURE_SIZE now loads smaller, its logical size kept
 *     (js/textures.js setTextureSideLimit, fitTextureSide), so every tool a project's work asks for
 *     draws its animation or its icon.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { JOB_WORK_BUBBLE, JOB_WORK_OVERLAY, JOB_WORK_REMOTE_BUBBLE_DY, jobWorkBubbleY, jobWorkFloatPoint, jobWorkToolSheet } from '../public/js/job-work-fx.js?v=a2dc6a5a';
import { fitTextureSide, resolutionOfUrl } from '../public/js/textures.js?v=29f80b6a';

const pub = join(import.meta.dirname, '../public');
const read = (f) => readFileSync(join(pub, f), 'utf8');

/** Width and height of a lossless (VP8L) or extended (VP8X) WebP (as tests/make-tool-animations.test.js). */
function webpSize(file) {
  const b = readFileSync(file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  assert.equal(kind, 'VP8X', `${file}: ${kind}`);
  return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
}

/** Every tool a street project's work asks for (street-jobs.json). */
function workTools() {
  const cat = JSON.parse(read('assets/content/street-jobs.json'));
  const out = new Set();
  for (const c of Object.values(cat.classes || {})) {
    for (const r of c.requirements || []) {
      if (r.type !== 'work') continue;
      for (const t of r.classIds?.length ? r.classIds : [r.classId]) if (t) out.add(String(t));
    }
  }
  return [...out].sort();
}

describe('#583 the work bubble sits over the head', () => {
  it('its tail ends 110 px over the feet, the balloon above it', () => {
    const { r, tail } = JOB_WORK_BUBBLE;
    const y = jobWorkBubbleY(500);
    assert.equal(y + r + tail, 500 + JOB_WORK_OVERLAY.deltaY, 'the tail tip at delta_y');
    assert.ok(y + r <= 500 - 110 + tail, 'the whole balloon above the head top');
    assert.ok(jobWorkBubbleY(500, 130) < y, 'a taller avatar (a hat) lifts it');
    assert.equal(jobWorkBubbleY(500, 80), y, 'a shorter one keeps Glitch\'s point');
    assert.equal(jobWorkFloatPoint({ x: 100, y: 500 }).y, y, 'the "+1" float beside the balloon');
  });

  it('your bubble and the others\' are placed by it, not centred on delta_y', () => {
    const jobs = read('js/features/street-jobs-feature.js');
    assert.match(jobs, /root\.y = jobWorkBubbleY\(engine\.player\.y, avatarDrawnHeight\(engine\.player\)\);/);
    assert.match(jobs, /work\.toolSprite\.y = jobWorkBubbleY\(p\.y, avatarDrawnHeight\(p\)\);/);
    assert.match(jobs, /const CREW_BUBBLE_DY = JOB_WORK_REMOTE_BUBBLE_DY;/);
    assert.doesNotMatch(jobs, /\.y \+ JOB_WORK_OVERLAY\.deltaY/);
    const gardens = read('js/features/shared-gardens-feature.js');
    assert.equal(gardens.match(/at\.y \+ JOB_WORK_REMOTE_BUBBLE_DY/g)?.length, 2, 'drawn and followed over the plate');
    assert.doesNotMatch(gardens, /\.y \+ JOB_WORK_OVERLAY\.deltaY/);
    assert.ok(JOB_WORK_REMOTE_BUBBLE_DY + JOB_WORK_BUBBLE.r + JOB_WORK_BUBBLE.tail <= -146, 'over the name plate (PLATE_Y -150)');
  });
});

describe('#583 every tool a project\'s work asks for draws in the bubble', () => {
  it('each has an animation sheet that is all there, or its icon', () => {
    const tools = workTools();
    assert.ok(tools.length >= 30, `${tools.length} tools`);
    for (const t of tools) {
      const sheet = jobWorkToolSheet(t);
      if (!sheet) {
        assert.ok(existsSync(join(pub, `assets/sprites/icons/${t}.webp`)), `${t}: no sheet and no icon`);
        continue;
      }
      const d = resolutionOfUrl(sheet.url);
      const size = webpSize(join(pub, sheet.url));
      assert.deepEqual(size, [sheet.cols * sheet.fw * d, Math.ceil(sheet.frames / sheet.cols) * sheet.fh * d], `${t}: ${sheet.url}`);
      // Within the GPU's limit, or drawn smaller on load to fit it (the Grinders, the Blender, the Construction Tool).
      const fit = fitTextureSide(size[0], size[1], 4096);
      assert.ok(Math.max(fit.w, fit.h) <= 4096, t);
    }
    for (const t of ['ore_grinder', 'grand_ol_grinder']) assert.ok(jobWorkToolSheet(t), `${t}: the Grinder animates`);
  });

  it('an image longer than the GPU takes is kept within it, its shape kept', () => {
    assert.deepEqual(fitTextureSide(12450, 237, 8192), { w: 8192, h: 155, k: 8192 / 12450 });
    assert.deepEqual(fitTextureSide(183, 13983, 4096), { w: 53, h: 4096, k: 4096 / 13983 });
    assert.deepEqual(fitTextureSide(1360, 1728, 4096), { w: 1360, h: 1728, k: 1 }, 'one that fits is untouched');
    assert.equal(fitTextureSide(12450, 237).k, 1, 'no limit until the renderer gives one');
  });

  it('textures.js shrinks such an image on load, and game.js gives it the renderer\'s limit', () => {
    const tex = read('js/textures.js');
    assert.match(tex, /\(decoded\) => withinSideLimit\(decoded\)\.catch\(\(\) => decoded\)\.then\(\(image\) => \{/);
    assert.match(tex, /const res = image === decoded \? resolution : resolution \* /, 'the logical size is the file\'s');
    const game = read('game.js');
    const init = game.indexOf('await app.init({');
    const set = game.indexOf('textureUrls.setTextureSideLimit(maxTextureSizeOf(app.renderer));');
    assert.ok(init > 0 && set > init, 'set once the renderer exists');
  });
});
