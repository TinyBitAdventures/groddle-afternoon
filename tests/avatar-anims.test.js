/**
 * Glitch avatar sheet animations (public/js/avatar-anims.js), from the
 * client's AvatarAnimationDefinitions.as and AvatarAnimationState.as.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANIMS, FALL_LOOP, GLITCH_AVATAR, SHEET_FRAMES, animForState, avatarAnimState, frameRef } from '../public/js/avatar-anims.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pngSize = (file) => {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

describe('Glitch avatar sheets', () => {
  it('ship one PNG per sheet whose width is its cell count times the cell width', () => {
    for (const [name, sheet] of Object.entries(GLITCH_AVATAR.sheets)) {
      const file = join(root, 'public', GLITCH_AVATAR.dir, sheet.file);
      assert.ok(existsSync(file), file);
      const { w, h } = pngSize(file);
      assert.equal(w, sheet.cells * sheet.fw, name);
      assert.equal(h, sheet.fh, name);
      assert.equal(SHEET_FRAMES[name].length, sheet.cells, name);
      assert.ok(sheet.feetY <= sheet.fh && sheet.midX < sheet.fw, name);
    }
  });

  it('finds every animation frame on a sheet', () => {
    for (const [name, list] of Object.entries(ANIMS)) for (const fn of list) assert.ok(frameRef(fn), `${name} ${fn}`);
    for (const fn of FALL_LOOP) assert.ok(frameRef(fn));
    assert.deepEqual(frameRef(801), { sheet: 'base', index: 14 });
    assert.deepEqual(frameRef(1145), { sheet: 'climb', index: 0 });
    assert.equal(ANIMS.climb.length, 19);
  });
});

describe('avatar animation state (calcAnimationStateFromAPO)', () => {
  it('climbs on a ladder and holds a frame when still', () => {
    assert.equal(avatarAnimState({ onLadder: true, climbing: true }), 'climb');
    assert.equal(avatarAnimState({ onLadder: true, climbing: false }), 'climbPause');
    assert.equal(animForState('climbPause').hold, true);
  });

  it('stands, walks at the 2x cycle and the slow 1x one only below 150 px/s', () => {
    assert.equal(avatarAnimState({ moving: false }), 'stand');
    assert.equal(avatarAnimState({ moving: true, vx: 264 }), 'walk2x');
    assert.equal(avatarAnimState({ moving: true, vx: 120, vxMax: 140 }), 'walk1x');
  });

  it('lifts while rising, falls, and lands within 30% of the fall speed of the floor', () => {
    assert.equal(avatarAnimState({ airborne: true, vy: -400 }), 'lift');
    assert.equal(avatarAnimState({ airborne: true, vy: 600, distFromFloor: 400 }, 'lift'), 'fall');
    assert.equal(avatarAnimState({ airborne: true, vy: 600, distFromFloor: 150 }, 'fall'), 'land');
    // In the last 30% of that the pose holds (close_limit).
    assert.equal(avatarAnimState({ airborne: true, vy: 600, distFromFloor: 40 }, 'fall'), 'fall');
    assert.equal(avatarAnimState({ airborne: true, vy: 600, distFromFloor: null }, 'lift'), 'fall');
  });
});

describe('emotions and hits replace the stand', () => {
  it('plays a hit, then an emotion, only while standing', () => {
    assert.equal(avatarAnimState({ moving: false, emotion: 'happy' }), 'happy');
    assert.equal(avatarAnimState({ moving: false, hit: 'hit1', emotion: 'angry' }), 'hit1');
    assert.equal(avatarAnimState({ moving: true, vx: 264, emotion: 'happy' }), 'walk2x');
    assert.equal(avatarAnimState({ moving: false, emotion: 'bored' }), 'stand');
  });

  it('maps the three emotion sheets (AvatarAnimationDefinitions angry/happy/surprise)', () => {
    for (const em of ['angry', 'happy', 'surprise']) {
      assert.ok(ANIMS[em].length > 90, em);
      for (const fn of ANIMS[em]) assert.ok(frameRef(fn), `${em} ${fn}`);
      assert.equal(SHEET_FRAMES[em].length, GLITCH_AVATAR.sheets[em].cells, em);
    }
  });
});
