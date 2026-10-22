/**
 * Glitch avatar sheet animations (public/js/avatar-anims.js), from the
 * client's AvatarAnimationDefinitions.as and AvatarAnimationState.as.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AFK_SEQUENCE, ANIMS, FALL_LOOP, GLITCH_AVATAR, IDLES_TO_RANDOM, IDLE_SHEETS, SHEET_FRAMES, animForState, avatarAnimState,
  createIdleClock, frameRef, idleSheetFor, standInState,
} from '../public/js/avatar-anims.js';

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
      // The idle sheets wrap into rows like the client's (cols = ceil(n / ceil(n / 39))).
      const cols = sheet.cols ?? sheet.cells;
      assert.equal(cols, Math.ceil(sheet.cells / Math.ceil(sheet.cells / 39)), name);
      assert.equal(w, cols * sheet.fw, name);
      assert.equal(h, (sheet.rows ?? 1) * sheet.fh, name);
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

describe('standing idles and the AFK doze (AvatarView, AvatarAnimationState)', () => {
  it('holds the client idle lists, base frames left on the base sheet', () => {
    assert.deepEqual(IDLE_SHEETS.map((n) => SHEET_FRAMES[n].length), [16, 57, 50, 51, 42]);
    for (const n of IDLE_SHEETS) assert.equal(SHEET_FRAMES[n].length, GLITCH_AVATAR.sheets[n].cells, n);
    assert.deepEqual([ANIMS.idle1.length, ANIMS.idle2.length, ANIMS.idle3.length, ANIMS.idle4.length], [45, 94, 104, 96]);
    assert.deepEqual([ANIMS.idleSleepyStart.length, ANIMS.idleSleepyLoop.length, ANIMS.idleSleepyEnd.length], [41, 105, 41]);
    assert.equal(ANIMS.idle4[0], 1049);
    assert.deepEqual(ANIMS.idle4.slice(-18), new Array(18).fill(1049));
    assert.deepEqual(ANIMS.idleSleepyEnd, [...ANIMS.idleSleepyStart].reverse());
    for (const n of ['idle1', 'idle2', 'idle3', 'idle4', 'idleSleepyStart', 'idleSleepyLoop', 'idleSleepyEnd']) {
      for (const fn of ANIMS[n]) assert.ok(frameRef(fn), `${n} ${fn}`);
    }
    assert.deepEqual(frameRef(801), { sheet: 'base', index: 14 });
    // AFK: start, five loops, end, looped as one sequence.
    assert.equal(AFK_SEQUENCE.length, 41 + 5 * 105 + 41);
    assert.deepEqual(IDLES_TO_RANDOM, ['idle1', 'idle2', 'idle3', 'idle0', 'idle4']);
  });

  it('stands on idle4, plays the random idle, idle4 for a choices dialog, then AFK', () => {
    const idles = true;
    assert.equal(standInState({ idles }), 'stand');
    assert.deepEqual(animForState('stand', { idles }), { anim: 'idle4', loop: true });
    assert.deepEqual(animForState('stand'), { anim: 'idle0', loop: false });
    assert.equal(standInState({ idles, randomIdle: 'idle2' }), 'idle2');
    assert.equal(animForState('idle2').loop, false);
    assert.equal(standInState({ idles, afk: true, randomIdle: 'idle2' }), 'afk');
    assert.equal(standInState({ idles, emotion: 'happy', afk: true }), 'happy');
    assert.equal(standInState({ idles, choices: true, emotion: 'happy' }), 'idle4');
    assert.equal(standInState({ idles, hit: 'hit2', choices: true }), 'hit2');
    assert.equal(standInState({ idles, waking: true }), 'wake');
    assert.deepEqual(animForState('afk'), { anim: 'afk', loop: true });
    assert.equal(animForState('wake').anim, 'idleSleepyEnd');
    // Looks without idle frames keep the still stand and the old emotions.
    assert.equal(standInState({ afk: true, choices: true, randomIdle: 'idle1' }), 'stand');
    assert.equal(standInState({ emotion: 'angry', choices: true }), 'angry');
    assert.equal(avatarAnimState({ moving: true, vx: 264, afk: true, idles }), 'walk2x');
    assert.equal(idleSheetFor('stand'), 'idle4');
    assert.equal(idleSheetFor('afk'), 'idleSleepy');
    assert.equal(idleSheetFor('idle0'), null);
  });

  it('starts a random idle after 15 s standing for 6 s, picked early, and resets on moving', () => {
    const picks = [];
    const clock = createIdleClock({ pick: () => { picks.push('idle3'); return 'idle3'; } });
    assert.equal(clock.step(0, true), null);
    assert.equal(clock.step(11000, true), null);
    assert.equal(clock.upcoming, null);
    assert.equal(clock.step(12500, true), null);
    assert.equal(clock.upcoming, 'idle3');
    assert.equal(clock.step(15001, true), 'idle3');
    assert.equal(clock.step(20000, true), 'idle3');
    assert.equal(clock.step(21001, true), null);
    assert.equal(picks.length, 1);
    // The timer restarted: another 15 s before the next one.
    assert.equal(clock.step(21100, true), null);
    assert.equal(clock.step(30000, true), null);
    clock.step(36200, true);
    assert.equal(clock.random, 'idle3');
    assert.equal(clock.step(36300, false), null);
    assert.equal(clock.standingMs(36300), 0);
  });
});
