/**
 * Street project work with a tool (Austin 2026-11-01): "meditate with a Focusing Orb" on a project
 * showed a still orb behind the avatar and the "+1 meditated" float under the Enter hint. The source
 * shows a 40x40 bubble with the tool's tool_animation 110 px above the player for the whole run, and
 * the tool's sound (items/include/jobs.js startJobWork 293-309); js/job-work-fx.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { JOB_WORK_OVERLAY, jobWorkFloatPoint, jobWorkSoundKey, jobWorkToolScale, jobWorkToolSheet } from '../public/js/job-work-fx.js?v=06384465';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '../glitch-GameServerJS/items/include/jobs.js');

describe('Street project work shows its tool as the original did', () => {
  it('keeps the source overlay: a bubble, 40 x 40, 110 px up', { skip: !existsSync(gsjs) && 'GSJS not beside the repo' }, () => {
    const src = readFileSync(gsjs, 'utf8');
    assert.match(src, /delta_y: -110,\s*bubble: true,\s*width: 40,\s*height: 40,\s*item_class: tool_class_id,\s*state: 'tool_animation'/);
    assert.match(src, /pc\.announce_sound\(tool_class_id\.toUpperCase\(\), 999\)/);
    assert.deepEqual({ ...JOB_WORK_OVERLAY }, { deltaY: -110, width: 40, height: 40, bubble: true });
  });

  it('animates every tool whose tool_animation is recovered, and only those', () => {
    for (const tool of ['focusing_orb', 'watering_can', 'irrigator_9000', 'hatchet', 'class_axe', 'pick', 'fancy_pick', 'tinkertool', 'smelter', 'blender', 'knife_and_board']) {
      const sheet = jobWorkToolSheet(tool);
      assert.ok(sheet, tool);
      assert.ok(existsSync(join(root, 'public', sheet.url)), `${tool}: ${sheet.url}`);
      assert.ok(sheet.frames > 1 && sheet.cols > 0 && sheet.fps > 0, tool);
      const k = jobWorkToolScale(sheet);
      assert.ok(sheet.fw * k <= 40.001 && sheet.fh * k <= 40.001, `${tool} fits the 40 px box`);
    }
    for (const tool of ['shovel', 'hoe', 'scraper', 'quill']) assert.equal(jobWorkToolSheet(tool), null, `${tool}: no recovered animation, the icon`);
  });

  it('plays the tool\'s own sound key when the catalog has it', () => {
    assert.equal(jobWorkSoundKey('watering_can'), 'WATERING_CAN');
    assert.equal(jobWorkSoundKey('hatchet'), 'HATCHET');
    assert.equal(jobWorkSoundKey('focusing_orb'), '');
    assert.equal(jobWorkSoundKey(''), '');
  });

  it('floats each unit beside the bubble, on the side away from the board (and its Enter hint)', () => {
    const p = { x: 1000, y: 900 };
    assert.deepEqual(jobWorkFloatPoint(p, 1150), { x: 938, y: 790 });
    assert.deepEqual(jobWorkFloatPoint(p, 850), { x: 1062, y: 790 });
    assert.deepEqual(jobWorkFloatPoint(p, null), { x: 1062, y: 790 });
  });

  it('the feature draws it in front of the street and hides the Enter hint while working', () => {
    const feature = readFileSync(join(root, 'public/js/features/street-jobs-feature.js'), 'utf8');
    assert.match(feature, /\(engine\.fxLayer \|\| engine\.entityLayer\)\.addChild\(root\)/);
    assert.match(feature, /quietEnterHint\(\) \{\s*return work \? true : null;/);
    assert.doesNotMatch(feature, /floatText\(p\.x, p\.y - 118/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /features\.query\('quietEnterHint', engine\) !== true/);
  });
});
